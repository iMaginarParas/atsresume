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
    const { type, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("Service configuration error");
    }

    let systemPrompt = "";
    let userPrompt = "";
    const tools: any[] = [];
    let tool_choice: any = undefined;

    if (type === "summary") {
      systemPrompt = "You are an expert resume writer. Generate a compelling professional summary.";
      userPrompt = `Write a professional summary for someone with this background:\nJob Title: ${context.jobTitle || "Professional"}\nSkills: ${(context.skills || []).join(", ")}\nExperience highlights: ${(context.experience || []).map((e: any) => `${e.title} at ${e.company}`).join("; ")}\n\nWrite 2-3 sentences that are ATS-friendly and impactful.`;
      tools.push({
        type: "function",
        function: {
          name: "return_summary",
          description: "Return the generated professional summary",
          parameters: {
            type: "object",
            properties: { summary: { type: "string" } },
            required: ["summary"],
            additionalProperties: false,
          },
        },
      });
      tool_choice = { type: "function", function: { name: "return_summary" } };
    } else if (type === "bullets") {
      systemPrompt = "You are an expert resume writer. Generate impactful bullet points for work experience.";
      userPrompt = `Generate 4-5 strong bullet points for this role:\nTitle: ${context.title}\nCompany: ${context.company}\nDescription/context: ${context.description || "Not provided"}\nSkills to highlight: ${(context.skills || []).join(", ")}\n\nUse action verbs, quantify achievements where possible, and keep each bullet concise.`;
      tools.push({
        type: "function",
        function: {
          name: "return_bullets",
          description: "Return the generated bullet points",
          parameters: {
            type: "object",
            properties: {
              bullets: { type: "array", items: { type: "string" } },
            },
            required: ["bullets"],
            additionalProperties: false,
          },
        },
      });
      tool_choice = { type: "function", function: { name: "return_bullets" } };
    } else if (type === "skills") {
      systemPrompt = "You are an expert resume writer. Suggest relevant skills based on a job title and experience.";
      userPrompt = `Suggest 8-12 relevant skills for someone with this background:\nJob Title: ${context.jobTitle}\nExperience: ${(context.experience || []).map((e: any) => e.title).join(", ")}\nExisting skills: ${(context.existingSkills || []).join(", ")}\n\nInclude both technical and soft skills. Return skills not already listed.`;
      tools.push({
        type: "function",
        function: {
          name: "return_skills",
          description: "Return suggested skills",
          parameters: {
            type: "object",
            properties: {
              skills: { type: "array", items: { type: "string" } },
            },
            required: ["skills"],
            additionalProperties: false,
          },
        },
      });
      tool_choice = { type: "function", function: { name: "return_skills" } };
    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        tools,
        tool_choice,
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
    console.error("resume-assist error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again later." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
