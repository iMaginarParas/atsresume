const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Generate AI content with optional system prompt
 */
async function generateContent(message, systemPrompt = "") {
  try {
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
  try {
    const fullPrompt = `
      ${systemPrompt}
      
      TASK: ${prompt}
      
      IMPORTANT: Return ONLY a valid JSON object matching this description: ${schemaDescription}
      Do not include any markdown formatting like \`\`\`json or extra text.
    `;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text().trim();
    
    // Clean potential markdown formatting
    const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Gemini generateStructuredContent error:", error);
    throw error;
  }
}

/**
 * Handle streaming AI response
 */
async function streamContent(messages) {
  try {
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
