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

    // Send initial loading message
    const loadingMessage = await ctx.reply("Processing your request... ⌛");

    const res = await fetch("https://8956-35-194-192-100.ngrok-free.app/predict", {
      method: "POST", 
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input: usr_message })
    })
    const api_text = await res.json()
    const data = await categorizeText(api_text as string);

    if (data.user_provided_all) {
      const okto_res = data.body_is_there ? await api_request(data.url, authStore.tokens.auth_token!, data.request, data.body) : await api_request(data.url, authStore.tokens.auth_token!, data.request);
      const message = await summarize(okto_res as JSON, usr_message, data)
      
      // Delete loading message and send response
      if (ctx.chat?.id) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
      }
      await ctx.reply(message!);
    } else if (!data.valid_info) {
      await ctx.reply("I couldn't understand your request. Please try rephrasing it.");
    } else if (!data.user_provided_all) {
      await ctx.reply(`I need some additional information: ${data.missing_data}`);
    } else {
      await ctx.reply("Something went wrong. Please try again.");
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

bot.command("transfer", async (ctx) => {
  if (!authStore.isAuthenticated) {
    await ctx.reply("You need to be logged in to use this command. Please use /login.");
    return;
  }

  const userId = ctx.from.id;

  // Check if the user is already in a transfer process
  const existingState = userStates.get(userId);
  if (existingState) {
    await ctx.reply("You are already in a process. Please complete it first or wait before trying again.");
    return;
  }

  // Initialize the transfer state
  userStates.set(userId, {
    stage: 'network_name',
    transferData: {},
    attempts: 0,
    startTime: Date.now(),
  });

  await ctx.reply("Let's start your transfer. Please enter the network name (e.g., POLYGON):");
});

bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);

  if (!userState || !authStore.isAuthenticated) return;

  const TRANSFER_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  if (Date.now() - userState.startTime > TRANSFER_TIMEOUT) {
    userStates.delete(userId);
    await ctx.reply("Transfer process timed out. Please start over with /transfer.");
    return;
  }

  try {
    const userInput = ctx.message.text.trim();
    const transferData = userState.transferData;

    switch (userState.stage) {
      case "network_name":
        if (!["POLYGON", "ETHEREUM", "BSC"].includes(userInput.toUpperCase())) {
          await ctx.reply("Invalid network name. Please enter a valid network (e.g., POLYGON, ETHEREUM, BSC):");
          return;
        }
        transferData.network_name = userInput.toUpperCase();
        userState.stage = "token_address";
        await ctx.reply("Enter the token address (leave empty for native tokens):");
        break;

      case "token_address":
        transferData.token_address = userInput || "";
        userState.stage = "quantity";
        await ctx.reply("Enter the quantity to transfer:");
        break;

      case "quantity":
        if (isNaN(parseFloat(userInput)) || parseFloat(userInput) <= 0) {
          await ctx.reply("Invalid quantity. Please enter a valid number greater than 0:");
          return;
        }
        transferData.quantity = userInput;
        userState.stage = "recipient_address";
        await ctx.reply("Enter the recipient's address:");
        break;

      case "recipient_address":
        if (!/^0x[a-fA-F0-9]{40}$/.test(userInput)) {
          await ctx.reply("Invalid address format. Please enter a valid Ethereum address:");
          return;
        }
        transferData.recipient_address = userInput;

        // Confirm the details
        await ctx.reply(`Please confirm the transfer details:
        - **Network:** ${transferData.network_name}
        - **Token Address:** ${transferData.token_address || "Native Token"}
        - **Quantity:** ${transferData.quantity}
        - **Recipient Address:** ${transferData.recipient_address}
        
Type "CONFIRM" to proceed or "CANCEL" to abort.`);

        userState.stage = "confirmation";
        break;

      case "confirmation":
        if (userInput.toUpperCase() === "CANCEL") {
          userStates.delete(userId);
          await ctx.reply("Transfer process has been canceled.");
        } else if (userInput.toUpperCase() === "CONFIRM") {
          // Execute transfer
          await ctx.reply("Processing your transfer... ⌛");

          try {
            const { statusCode, body } = await request(
              "https://sandbox-api.okto.tech/api/v1/transfer/tokens/execute",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${authStore.tokens.auth_token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(transferData),
              }
            );

            const response = await body.json();

            if (statusCode === 200) {
              await ctx.reply(`✅ Transfer successful! Transaction I `);
            } else {
              await ctx.reply(`❌ Transfer failed. Error:  || "Unknown error"}`);
            }
          } catch (error) {
            console.error("Transfer API Error:", error);
            await ctx.reply("❌ An error occurred while processing your transfer. Please try again.");
          }

          userStates.delete(userId);
        } else {
          await ctx.reply('Please type "CONFIRM" to proceed or "CANCEL" to abort:');
        }
        break;
    }
  } catch (error) {
    console.error("Transfer Process Error:", error);
    userStates.delete(userId);
    await ctx.reply("An error occurred. Please try again or start over with /transfer.");
  }
})

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
