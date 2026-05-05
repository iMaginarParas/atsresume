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

    const personalInfo = resumeData.personalInfo || {};
    const summary = resumeData.summary || "";
    const skills = (resumeData.skills || []).join(", ");
    const experience = (resumeData.experience || [])
      .map((e: any) => `${e.title} at ${e.company}: ${(e.bullets || []).join("; ")}`)
      .join("\n");
    const education = (resumeData.education || [])
      .map((e: any) => `${e.degree} from ${e.school}`)
      .join(", ");

    const hasJobDescription = jobDescription && jobDescription.trim().length > 0;

    const systemPrompt = `You are an expert resume reviewer, ATS specialist, and hiring manager. Grade the resume comprehensively across three categories. Be specific with feedback and actionable suggestions. Score each category 0-100.`;

    const userPrompt = `Grade this resume:

PERSONAL INFO: ${personalInfo.fullName || "Not provided"}, ${personalInfo.email || ""}, ${personalInfo.phone || ""}, ${personalInfo.location || ""}
LinkedIn: ${personalInfo.linkedin || "Not provided"}
Portfolio: ${personalInfo.portfolio || "Not provided"}

SUMMARY: ${summary || "Not provided"}

SKILLS: ${skills || "Not provided"}

EXPERIENCE:
${experience || "No experience listed"}

EDUCATION: ${education || "Not provided"}

${hasJobDescription ? `---\nJOB DESCRIPTION TO EVALUATE FIT AGAINST:\n${jobDescription}\n---` : "---\nNo specific job description provided. Evaluate general job-readiness.\n---"}

Grade across these 3 categories:

1. **ATS Compatibility** (0-100): Evaluate formatting friendliness, keyword density, standard section headers, use of action verbs, quantified achievements, and overall scannability.

2. **${hasJobDescription ? "Job-Specific Fit" : "General Job Readiness"}** (0-100): ${hasJobDescription ? "How well does this resume match the job description? Evaluate keyword overlap, relevant experience alignment, skills match, and qualification coverage." : "How well-structured is this resume for general job applications? Evaluate completeness, relevance of content, and professional positioning."}

3. **Writing Quality** (0-100): Evaluate clarity, conciseness, impact of bullet points, use of strong action verbs, grammar, and professional tone.

For each category provide a score, 2-3 key strengths, and 2-3 specific improvement suggestions.
Also provide an overall score (weighted average: ATS 35%, Fit 35%, Writing 30%) and a one-paragraph overall assessment.`;

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
              name: "return_grade",
              description: "Return the resume grade results",
              parameters: {
                type: "object",
                properties: {
                  overallScore: { type: "number", description: "Overall weighted score 0-100" },
                  overallAssessment: { type: "string", description: "One paragraph overall assessment" },
                  ats: {
                    type: "object",
                    properties: {
                      score: { type: "number" },
                      strengths: { type: "array", items: { type: "string" } },
                      improvements: { type: "array", items: { type: "string" } },
                    },
                    required: ["score", "strengths", "improvements"],
                    additionalProperties: false,
                  },
                  fit: {
                    type: "object",
                    properties: {
                      score: { type: "number" },
                      label: { type: "string", description: "Either 'Job-Specific Fit' or 'General Job Readiness'" },
                      strengths: { type: "array", items: { type: "string" } },
                      improvements: { type: "array", items: { type: "string" } },
                    },
                    required: ["score", "label", "strengths", "improvements"],
                    additionalProperties: false,
                  },
                  writing: {
                    type: "object",
                    properties: {
                      score: { type: "number" },
                      strengths: { type: "array", items: { type: "string" } },
                      improvements: { type: "array", items: { type: "string" } },
                    },
                    required: ["score", "strengths", "improvements"],
                    additionalProperties: false,
                  },
                },
                required: ["overallScore", "overallAssessment", "ats", "fit", "writing"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_grade" } },
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
    console.error("grade-resume error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again later." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
