import OpenAI from "openai";
import { OPENAI_API_KEY } from "./data";

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

export async function categorizeText(inputText: string) {
  try {
    const prompt = `
Given the following API documentation:
${inputText}

Categorize the API endpoint into the following JSON format:
{
    url: "",
    request: "GET/POST"/
    description: "",
    body_is_there: true/false
    request_body: [],
    user_provided_all: true/false,
    missing_data: "" (if user_provided_all is false),
    valid_info: true/false
}

The format should ensure the categorization of each endpoint accurately based on its description, parameters, and responses.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Updated model name
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 1000,
      response_format: { type: "json_object" }, // Ensure JSON output
    });

    const categorizedData = response.choices[0].message.content;

    if (!categorizedData) {
      throw new Error("No response from OpenAI");
    }

    console.log("Categorized Data:", categorizedData);
    return JSON.parse(categorizedData);
  } catch (error) {
    console.error("Error categorizing text:", error);
    return null;
  }
}

export async function summarize(inputText: JSON) {
  try {
    const prompt = `Transform this technical API endpoint information into a clear, easy-to-understand summary that would help a development team quickly grasp the key details.

Explain the purpose, main features, and important characteristics of the endpoint in a friendly, conversational way that makes the technical information accessible and actionable.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "text" },
    });

    const summarizedText = response.choices[0].message.content;

    if (!summarizedText) {
      throw new Error("No response from OpenAI");
    }

    console.log("Summarized Endpoint Information:", summarizedText);
    return summarizedText;
  } catch (error) {
    console.error("Error summarizing endpoint:", error);
    return null;
  }
}