import { Telegraf, Markup } from "telegraf";
import { request } from "undici";
import {categorizeText, summarize} from "./ai";
import api_request from "./api";
import { BOT_TOKEN, OKTO_API_KEY } from "./data";

const bot = new Telegraf(BOT_TOKEN);

const availableCommands = [
  { command: "help", description: "List of commands" },
  { command: "login", description: "Login to your account" },
  { command: "logout", description: "Logout from your account" },
];

// Set bot commands using Telegram Bot API
bot.telegram.setMyCommands(availableCommands).then(() => {
  console.log("Commands set successfully");
});

bot.command("help", async (ctx) => {
  if (authStore.isAuthenticated) {
    await ctx.reply("Your already logged in start interacting with the wallet. Ex: show me my portfolio data :)")
  } else {
    await ctx.reply("Login to start interacting with the AI powered wallet", Markup.inlineKeyboard([
      Markup.button.callback("Login", "/login"),
      Markup.button.callback("Logout", "/logout")
    ]));
  }
});

// Middleware
bot.use(async (ctx, next) => {
  console.log("User Info:", ctx.from);

  await next();
})
bot.use(async (ctx, next) => {
  if (authStore.isAuthenticated && ctx.message && "text" in ctx.message) {
    const usr_message = ctx.message.text
    console.log("Authenticated User Message:", usr_message);

    const res = await fetch("https://b675-34-142-188-148.ngrok-free.app/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input:  usr_message })
    })

    const api_text = await res.json()
    const data = await categorizeText(api_text as string);
    if (data.user_provided_all) {
      const okto_res = data.body_is_there ? await api_request(data.url, authStore.tokens.auth_token!, data.request, data.body) : await api_request(data.url, authStore.tokens.auth_token!, data.request);
      const message = await summarize(okto_res as JSON)
      await ctx.reply(message!);
    }
  }
  await next();
});




bot.command("start", async (ctx) => {
  if (authStore.isAuthenticated) {
    await ctx.reply("Your already logged in start interacting with the wallet. Ex: show me my portfolio data :)")
  }
  else {
    await ctx.reply("Welcome! I'm your ai powered crypto assistant bot. Here's how you can interact with me :)");
    await ctx.reply("/login if not already done, once you logged in you can interact with the wallet in natural language");
  }
})

const authStore = {
  tokens: {
    auth_token: null,
    refresh_token: null,
    device_token: null
  },
  isAuthenticated: false,
  loginState: {
    email: null,
    requestToken: null,
    step: 'start' // Possible values: 'start', 'awaiting_otp', 'authenticated'
  }
};

// Conversation state management
const userStates = new Map();

bot.command("login", async (ctx) => {

  const userId = ctx.from.id;

  if (authStore.isAuthenticated) {
    await ctx.reply("You are already logged in. Use /logout if you want to log out.");
    return;
  }
  // Check if user is already in a login process
  // if the user enters wrong email then there needs to be a cancel option or restart option
  const existingState = userStates.get(userId);
  if (existingState) {
    // If user is in the middle of a login process, prompt to complete or cancel
    await ctx.reply("You are already in a login process. Please complete the current process or wait a moment before trying again.");
    return;
  }

  // Store the user's conversation state
  userStates.set(userId, {
    stage: 'email',
    attempts: 0,
    startTime: Date.now()
  });

  // Prompt for email
  await ctx.reply("Please enter your email address to begin login:");
});

bot.command("logout", async (ctx) => {
  const userId = ctx.from.id;

  // Clear authentication state
  if (authStore.isAuthenticated) {
    authStore.tokens = {
      auth_token: null,
      refresh_token: null,
      device_token: null
    };
    authStore.isAuthenticated = false;
    authStore.loginState = {
      email: null,
      requestToken: null,
      step: 'start'
    };

    // Clear any ongoing login states
    userStates.delete(userId);

    await ctx.reply("You have been logged out successfully.");
  } else {
    await ctx.reply("You are not currently logged in.");
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);

  if (!userState) return;

  const LOGIN_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
  if (Date.now() - userState.startTime > LOGIN_TIMEOUT) {
    userStates.delete(userId);
    await ctx.reply("Login process timed out. Please start over with /login");
    return;
  }

  try {
    switch (userState.stage) {
      case 'email':
        // Validate email (basic check)
        const email = ctx.message.text.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
          // Increment attempts and handle max attempts
          userState.attempts++;
          if (userState.attempts >= 3) {
            userStates.delete(userId);
            await ctx.reply("Too many invalid email attempts. Please start over with /login");
            return;
          }

          await ctx.reply("Invalid email format. Please enter a valid email address:");
          return;
        }


        // Send login request
        const loginResponse = await login(email);

        if (loginResponse.status === 'success') {
          // Update user state
          userStates.set(userId, {
            stage: 'otp',
            email: email,
            requestToken: loginResponse.data.token,
            attempts: 0,
            startTime: userState.startTime // preserve original start time
          });


          // Prompt for OTP
          await ctx.reply("An OTP has been sent to your email. Please enter the 6-digit OTP:");
        } else {
          await ctx.reply("Login request failed. Please try again.");
          userStates.delete(userId);
        }
        break;

      case 'otp':
        const otp = ctx.message.text.trim();

        // Validate OTP (assuming 6 digit numeric)
        if (!/^\d{6}$/.test(otp)) {
          userState.attempts++;
          if (userState.attempts >= 3) {
            userStates.delete(userId);
            await ctx.reply("Too many invalid OTP attempts. Please start over with /login");
            return;
          }
          await ctx.reply("Invalid OTP. Please enter the 6-digit code:");
          return;
        }

        const verifyResponse = await verify_login_otp(
          otp,
          userState.requestToken,
          userState.email,
        );

        if (verifyResponse.status === 'success') {
          // Store auth tokens
          authStore.tokens = {
            auth_token: verifyResponse.data.auth_token,
            refresh_token: verifyResponse.data.refresh_auth_token,
            device_token: verifyResponse.data.device_token
          };
          authStore.isAuthenticated = true;
          authStore.loginState.email = userState.email;

          // Clear user state
          userStates.delete(userId);
          await ctx.reply("Login successful! You are now authenticated.");
        } else {
          await ctx.reply("OTP verification failed. Please start over with /login");
          userStates.delete(userId);
        }
    }
  } catch (error) {
    console.error("Login Process Error:", error);
    await ctx.reply("An error occurred during login. Please try again.");
    userStates.delete(userId);
  }
});


bot.catch((err) => {
  console.error('Bot error:', err);
});


bot.launch();

// Functions
async function login(email: string): Promise<any> {
  const url = "https://sandbox-api.okto.tech/api/v1/authenticate/email";
  try {
    const response = await request(url, {
      method: "POST",
      headers: {
        "X-Api-Key": OKTO_API_KEY,
        "Content-Type": "application/json",
        'User-Agent': 'NextJSDev/1.0',
        'Referer': 'http://localhost:3000'
      },
      body: JSON.stringify({ email: email }),
    });
    const data = await response.body.json()
    console.log(data);
    return data;
  } catch (error) {
    console.error("Login API Error:", error);
    throw error;
  }
}

async function verify_login_otp(otp: string, token: string, email: string): Promise<any> {
  const res = await request('https://sandbox-api.okto.tech/api/v1/authenticate/email/verify', {
    method: 'POST',
    headers: {
      'X-Api-Key': OKTO_API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'NextJSDev/1.0',
      'Referer': 'http://localhost:3000'
    },
    body: JSON.stringify({
      email: email,
      otp: otp,
      token: token
    })
  })
  const data = await res.body.json()
  console.log(data);
  return data;
}
