const MODEL_NAMES = [
  "gemini-2.0-flash",
  "gemini-flash-latest"
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
  await listAvailableModels(); // DISCOVERY STEP
  const apiKey = process.env.GEMINI_API_KEY;
  let lastError;

  for (const modelName of MODEL_NAMES) {
    try {
      console.log(`Trying Gemini model: ${modelName}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const body = {
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nTASK: ${prompt}\n\nIMPORTANT: Return ONLY valid JSON matching this schema: ${schemaDescription}` }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.warn(`Model ${modelName} failed:`, data.error?.message);
        lastError = data.error?.message || response.statusText;
        continue; // Try next model
      }

      if (!data.candidates || !data.candidates[0]) {
        lastError = "No candidates returned";
        continue;
      }

      const text = data.candidates[0].content.parts[0].text;
      return JSON.parse(text);
    } catch (error) {
      console.error(`Fetch catch with ${modelName}:`, error.message);
      lastError = error.message;
      continue;
    }
  }

  throw new Error(`AI_DIRECT_ERROR: All models failed. Last error: ${lastError}`);
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
