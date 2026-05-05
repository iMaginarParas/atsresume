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
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Could not extract enough text from the PDF. Please try a different file." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Service configuration error");

    const systemPrompt = `You are an expert resume parser. Extract structured data from resume text. Be thorough — capture all experience entries, education, skills, and any extra sections (certifications, projects, languages, volunteer work, etc.) as custom sections. If a field is not found, leave it empty or as an empty array.`;

    const userPrompt = `Parse the following resume text and extract all information:\n\n${text.slice(0, 12000)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_resume_data",
            description: "Return the parsed resume data",
            parameters: {
              type: "object",
              properties: {
                personalInfo: {
                  type: "object",
                  properties: {
                    fullName: { type: "string" },
                    email: { type: "string" },
                    phone: { type: "string" },
                    location: { type: "string" },
                    linkedin: { type: "string" },
                    portfolio: { type: "string" },
                  },
                  additionalProperties: false,
                },
                summary: { type: "string", description: "Professional summary or objective" },
                skills: { type: "array", items: { type: "string" } },
                experience: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      company: { type: "string" },
                      description: { type: "string" },
                      bullets: { type: "array", items: { type: "string" } },
                    },
                    required: ["title", "company", "description", "bullets"],
                    additionalProperties: false,
                  },
                },
                education: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      degree: { type: "string" },
                      school: { type: "string" },
                      year: { type: "string" },
                    },
                    required: ["degree", "school"],
                    additionalProperties: false,
                  },
                },
                customSections: {
                  type: "array",
                  description: "Any other sections like certifications, projects, languages, awards, volunteer work, etc.",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      items: { type: "array", items: { type: "string" } },
                    },
                    required: ["title", "items"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["personalInfo", "summary", "skills", "experience", "education", "customSections"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_resume_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const result = JSON.parse(toolCall.function.arguments);
    
    // Add IDs to custom sections
    if (result.customSections) {
      result.customSections = result.customSections.map((s: any) => ({
        ...s,
        id: crypto.randomUUID(),
      }));
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-resume error:", e);
    return new Response(JSON.stringify({ error: "Failed to parse resume. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
