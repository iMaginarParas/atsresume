import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { user, errorResponse } = await authenticateRequest(req, corsHeaders);
  if (errorResponse) return errorResponse;

  try {
    const { texts, targetLang, context } = await req.json();

    if (!texts || !targetLang || targetLang === "en") {
      return new Response(JSON.stringify({ translations: texts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const langNames: Record<string, string> = {
      ar: "Arabic", es: "Spanish", fr: "French", hi: "Hindi",
      pt: "Portuguese", de: "German", zh: "Chinese (Simplified)",
      ja: "Japanese", ko: "Korean",
    };

    const langName = langNames[targetLang] || targetLang;

    const systemPrompt = `You are a professional translator. Translate the following texts to ${langName}. 
Context: These are blog article ${context || "titles and descriptions"} for a career/resume building platform.
Return a JSON array of translated strings in the exact same order. Keep proper nouns, brand names, and technical terms (like "ATS", "LinkedIn", "ChatGPT") in English.
Only return the JSON array, nothing else.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(texts) },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("Translation failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    
    // Extract JSON array from response (may have markdown code fences)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const translations = jsonMatch ? JSON.parse(jsonMatch[0]) : texts;

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-blog error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
