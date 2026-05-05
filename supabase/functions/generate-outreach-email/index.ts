import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { user, errorResponse } = await authenticateRequest(req, corsHeaders);
  if (errorResponse) return errorResponse;

  try {
    const { position, company, resumeId, coverLetterId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Service configuration error");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch resume data if provided
    let resumeContext = "";
    if (resumeId) {
      const { data: resume } = await supabase
        .from("resumes")
        .select("resume_data, title")
        .eq("id", resumeId)
        .eq("user_id", user.id)
        .single();

      if (resume?.resume_data) {
        const rd = resume.resume_data as Record<string, unknown>;
        const personal = rd.personalInfo as Record<string, string> | undefined;
        const skills = (rd.skills as string[]) || [];
        const experience = (rd.experience as Array<{ title: string; company: string; description?: string }>) || [];
        const name = personal?.fullName || personal?.name || "";
        resumeContext = `
Applicant Name: ${name}
Skills: ${skills.slice(0, 12).join(", ")}
Experience: ${experience.slice(0, 3).map((e) => `${e.title} at ${e.company}`).join("; ")}
        `.trim();
      }
    }

    // Fetch cover letter content if provided
    let coverLetterContext = "";
    if (coverLetterId) {
      const { data: cl } = await supabase
        .from("cover_letters")
        .select("cover_letter_data")
        .eq("id", coverLetterId)
        .eq("user_id", user.id)
        .single();

      if (cl?.cover_letter_data) {
        const clData = cl.cover_letter_data as Record<string, unknown>;
        const sections = clData.sections as Array<{ title: string; content: string }> | undefined;
        if (sections) {
          coverLetterContext = sections.map((s) => s.content).join("\n\n");
        }
      }
    }

    const systemPrompt = `You are an expert job application coach. Write professional, concise, and personalized outreach emails for job applicants.

IMPORTANT: Respond in EXACTLY this format with no extra text before or after:
SUBJECT: <your subject line here>
BODY:
<your email body here>`;

    const bodyInstructions = `Structure the email body as:
- Greeting: "Dear Hiring Manager,"
- Opening paragraph: express genuine interest in the ${position} role at ${company}
- Middle paragraph(s): highlight 2-3 relevant skills or experiences that make the applicant a strong fit
- Closing paragraph: thank them for their time and consideration, express eagerness to discuss the opportunity further, and mention the attached resume
- Sign-off: "Thank you," followed by the applicant's name (use the name from resume if available, otherwise "Your Name")

Rules: plain text only, no markdown, no asterisks, no bullet points in the email body.`;

    const userPrompt = coverLetterContext
      ? `Write a professional job application email using this cover letter content.
Position: ${position}
Company: ${company}
${resumeContext ? `Applicant info:\n${resumeContext}` : ""}

Cover letter content:
${coverLetterContext.slice(0, 2000)}

${bodyInstructions}`
      : `Write a professional job application outreach email.
Position: ${position}
Company: ${company}
${resumeContext ? `Applicant info:\n${resumeContext}` : ""}

${bodyInstructions}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error:", aiRes.status, t);
      if (aiRes.status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
      if (aiRes.status === 402) throw new Error("AI service credits exhausted.");
      throw new Error("AI generation failed");
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content as string | undefined;
    if (!content) throw new Error("No AI response");

    // Parse SUBJECT: and BODY: from the response
    const subjectMatch = content.match(/^SUBJECT:\s*(.+)/m);
    const bodyMatch = content.match(/^BODY:\s*\n([\s\S]+)/m);

    const subject = subjectMatch?.[1]?.trim() ?? `Application for ${position} at ${company}`;
    const body = bodyMatch?.[1]?.trim() ?? content;

    return new Response(JSON.stringify({ subject, body }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-outreach-email error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate email. Please try again.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
