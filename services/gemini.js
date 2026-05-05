/**
 * Generate structured JSON output using Direct Fetch (Native Node 22 fetch)
 */
async function generateStructuredContent(prompt, systemPrompt = "", schemaDescription = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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

  try {
    console.log("Attempting direct fetch to Gemini...");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Gemini Direct Fetch Error:", JSON.stringify(data, null, 2));
      throw new Error(`Gemini API failed: ${data.error?.message || response.statusText}`);
    }

    if (!data.candidates || !data.candidates[0]) {
      throw new Error("No candidates returned from Gemini");
    }

    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (error) {
    console.error("Direct Fetch Catch:", error.message);
    throw new Error(`AI_DIRECT_ERROR: ${error.message}`);
  }
}

/**
 * Basic Content Generation (Direct Fetch)
 */
async function generateContent(message, systemPrompt = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
