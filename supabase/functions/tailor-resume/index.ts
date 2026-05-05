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
    const { resumeData, jobDescription } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Service configuration error");

    const currentSummary = resumeData.summary || "";
    const currentSkills = (resumeData.skills || []).join(", ");
    const currentExperience = (resumeData.experience || [])
      .map((e: any) => `${e.title} at ${e.company}: ${(e.bullets || []).join("; ")}`)
      .join("\n");

    const systemPrompt = `You are an expert resume writer and ATS optimization specialist. 
Your job is to tailor a resume to match a specific job description.
Rewrite the summary, suggest reordered/added skills, and rewrite bullet points to highlight relevant experience.
Keep it honest — don't fabricate experience, but reframe existing achievements to align with the job requirements.
Use strong action verbs and quantify achievements where possible.`;

    const userPrompt = `Here is the candidate's current resume content:

SUMMARY: ${currentSummary}

SKILLS: ${currentSkills}

EXPERIENCE:
${currentExperience}

---

JOB DESCRIPTION:
${jobDescription}

---

Tailor the resume to this job. Return:
1. A rewritten professional summary (2-3 sentences)
2. A reordered and supplemented skills list (keep existing relevant skills, add missing ones from the JD, remove irrelevant ones)
3. Rewritten bullet points for each experience entry, optimized for this role

Important: preserve the same number of experience entries in the same order.`;

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
        tools: [
          {
            type: "function",
            function: {
              name: "return_tailored_resume",
              description: "Return the tailored resume sections",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Tailored professional summary" },
                  skills: { type: "array", items: { type: "string" }, description: "Reordered and supplemented skills" },
                  experience: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        bullets: { type: "array", items: { type: "string" } },
                      },
                      required: ["bullets"],
                      additionalProperties: false,
                    },
                    description: "Rewritten bullets for each experience entry, same order",
                  },
                },
                required: ["summary", "skills", "experience"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_tailored_resume" } },
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
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tailor-resume error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again later." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
