const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

if (!process.env.GEMINI_API_KEY) {
  console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables!");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");
// Force stable v1 API
const stableGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");

// Fallback list of models to try
const MODEL_NAMES = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

function getModel(name = MODEL_NAMES[0]) {
  // Use stable v1 API explicitly
  return genAI.getGenerativeModel({ model: name }, { apiVersion: 'v1' });
}

/**
 * Generate AI content with optional system prompt
 */
async function generateContent(message, systemPrompt = "") {
  try {
    const model = getModel();
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\nUser: ${message}` : message;
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini generateContent error:", error);
    throw error;
  }
}

/**
 * Generate structured JSON output using Gemini
 * Note: We use a prompt-based approach for stability across all Gemini models
 */
async function generateStructuredContent(prompt, systemPrompt = "", schemaDescription = "") {
  let lastError;
  
  for (const modelName of MODEL_NAMES) {
    try {
      console.log(`Trying Gemini model: ${modelName}`);
      const model = getModel(modelName);
      
      const fullPrompt = `
        ${systemPrompt}
        
        TASK: ${prompt}
        
        IMPORTANT: Return ONLY a valid JSON object matching this description: ${schemaDescription}
        Do not include any markdown formatting like \`\`\`json or extra text.
      `;
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }]
      });

      const response = await result.response;
      const text = response.text().trim();
      
      let jsonStr = text;
      if (text.includes("```")) {
        jsonStr = text.split("```")[1].replace(/^json/, "").trim();
      }
      
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error(`Gemini error with ${modelName}:`, error.message);
      lastError = error;
      // If it's not a 404, we might want to stop, but for now we try all models
      continue;
    }
  }
  
  throw new Error(`AI_STRUCTURED_ERROR: All models failed. Last error: ${lastError.message}`);
}

/**
 * Handle streaming AI response
 */
async function streamContent(messages) {
  try {
    const model = getModel();
    // Porting streaming logic to Gemini SDK format
    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === 'system' ? 'user' : m.role, // Gemini uses user/model
        parts: [{ text: m.content }],
      })),
    });

    const lastMessage = messages[messages.length - 1].content;
    const result = await model.generateContentStream(lastMessage);
    return result.stream;
  } catch (error) {
    console.error("Gemini streamContent error:", error);
    throw error;
  }
}

module.exports = { generateContent, generateStructuredContent, streamContent };
