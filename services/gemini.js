const MODEL_NAMES = [
  "gemini-flash-lite-latest",
  "gemini-pro-latest",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
];

/**
 * Generate structured JSON output using Direct Fetch with Fallback Loop
 */
async function generateStructuredContent(prompt, systemPrompt = "", schemaDescription = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  let lastError;

  for (const modelName of MODEL_NAMES) {
    try {
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
        lastError = data.error?.message || response.statusText;
        continue;
      }

      return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (error) {
      lastError = error.message;
      continue;
    }
  }

  throw new Error(`AI_ERROR: All models failed. Last error: ${lastError}`);
}

/**
 * Basic Content Generation
 */
async function generateContent(message, systemPrompt = "") {
  const apiKey = process.env.GEMINI_API_KEY;
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
 * Stream Content Shim
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
