const MODEL_NAMES = [
  "gemini-pro-latest",
  "gemini-flash-lite-latest"
];

async function listAvailableModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    const modelNames = (data.models || []).map(m => m.name);
    console.log("AVAILABLE MODELS FOR YOUR KEY:", JSON.stringify(modelNames));
    return modelNames;
  } catch (e) {
    console.error("Failed to list models:", e.message);
    return [];
  }
}

/**
 * Generate structured JSON output using Direct Fetch (Native Node 22 fetch)
 */
async function generateStructuredContent(prompt, systemPrompt = "", schemaDescription = "") {
  const discoveredModels = await listAvailableModels();
  const apiKey = process.env.GEMINI_API_KEY;
  let lastError;

  // Try the user's preferred models first, then fall back to the discovered list
  const modelsToTry = [...new Set([...MODEL_NAMES, ...discoveredModels.map(m => m.replace("models/", ""))])];

  for (const modelName of modelsToTry) {
    try {
      console.log(`Scanning model: ${modelName}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const body = {
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTASK: ${prompt}\n\nIMPORTANT: Return ONLY valid JSON: ${schemaDescription}` }] }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.warn(`Model ${modelName} rejected: ${data.error?.message}`);
        lastError = data.error?.message || response.statusText;
        
        // If it's a rate limit error, we might want to wait, but for scanning we just skip
        continue;
      }

      console.log(`SUCCESS! Found working model: ${modelName}`);
      return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (error) {
      lastError = error.message;
      continue;
    }
  }

  throw new Error(`AI_SCAN_ERROR: All ${modelsToTry.length} models failed. Last error: ${lastError}`);
}

/**
 * Basic Content Generation (Direct Fetch)
 */
async function generateContent(message, systemPrompt = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  // Use first model for simple generation
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAMES[0]}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${message}` : message }] }]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "API Error");
  return data.candidates[0].content.parts[0].text;
}

/**
 * Stream Content (Direct Fetch Shim)
 */
async function streamContent(messages) {
  const content = await generateContent(messages[messages.length-1].content);
  return {
    async *[Symbol.asyncIterator]() {
      yield { text: () => content };
    }
  };
}

module.exports = { generateContent, generateStructuredContent, streamContent };
