import OpenAI from "openai";
import { OPENAI_API_KEY } from "./data";

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

export async function categorizeText(inputText: string) {
  try {
//     const prompt = `You are an expert API documentations analyzer. Your task is to meticulously extract and categorize API endpoint details with extreme precision.

// API Documentation:
// ${inputText}

// Strict Requirements for JSON Categorization:
// 1. URL: 
//    - Must be the exact, complete endpoint URL
//    - Include protocol, domain, and full path
//    - No placeholders or generic paths

// 2. Request Method:
//    - MUST be exactly "GET", "POST"
//    - Confirm from documentation or implied context
//    - No abbreviations or variations

// 3. Description:
//    - Concise, clear one-sentence description of endpoint's purpose
//    - Extract directly from documentation
//    - No ambiguity or generalization

// 4. Request Body:
//    - body_is_there: Strictly boolean (true/false)
//    - If true, request_body must list ALL required parameters
//    - Each parameter must include:
//      * name
//      * type (string, number, boolean, array, object)
//      * required (true/false)
//      * example value (if available)

// 5. User Provided Information:
//    - user_provided_all: Strictly boolean
//    - If false, missing_data MUST specify EXACTLY what is missing
//    - Be specific about missing details

// 6. Validity Check:
//    - valid_info: Strictly boolean
//    - false if any critical information is missing or unclear
//    - Consider completeness, specificity, and actionability

// Output MUST be a valid,  parseable JSON object matching the specified structure.

// If ANY detail cannot be definitively determined, use the most conservative interpretation that prevents potential API call failures.`;

const prompt = `You are an expert API documentation analyzer. Carefully review the documentation and extract ONLY ONE most relevant and valid API endpoint.

API Documentation:
${inputText}

Extraction Guidelines:
- Select ONLY ONE most appropriate API endpoint
- If multiple endpoints exist, choose the most generic or primary endpoint
- Focus on the most complete and actionable API request

JSON Output Requirements:
{
    url: "Exact, complete endpoint URL",
    request: "Exact HTTP method (GET/POST/PUT/DELETE/PATCH)",
    description: "Concise, clear one-sentence description",
    body_is_there: true/false,
    request_body: [List of parameters if body exists],
    user_provided_all: true/false,
    missing_data: "Specific missing information if incomplete",
    valid_info: true/false
}

Critical Instructions:
- Ensure ONLY ONE API endpoint is returned
- Provide most comprehensive and accurate details
- Be precise and avoid ambiguity`;

    
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

export async function summarize(inputText: JSON, user_msg: string, api_data: string) {
  try {
    const prompt = `You are a helpful assistant that extracts key information from API responses and converts them into crisp, user-friendly messages.

Given:
- User's original request: ${user_msg}
- API endpoint used: ${api_data}
- API Response: ${JSON.stringify(inputText)}

Your task is to:
1. Identify the most important information from the response
2. Create a short, clear message that directly tells the user what happened
3. Focus on key details that matter to the user
4. Use a conversational, straightforward tone
5. If the response indicates success, highlight the key outcome
6. If there are errors, explain them simply
 Be specific and actionable.`;

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