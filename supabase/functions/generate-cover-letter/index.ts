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
    const { resumeData, jobDescription, tone } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("Service configuration error");
    }

    const personalInfo = resumeData?.personalInfo || {};
    const applicantName = personalInfo.fullName || "Applicant";
    const applicantEmail = personalInfo.email || "";
    const applicantPhone = personalInfo.phone || "";
    const applicantLocation = personalInfo.location || "";
    const applicantLinkedin = personalInfo.linkedin || personalInfo.portfolio || "";

    const systemPrompt = `You are an expert cover letter writer. Generate a professionally formatted cover letter based on the provided resume and job description. The tone should be: ${tone || "professional"}.

IMPORTANT RULES:
- Extract the job title, company name, and hiring manager name (if available) from the job description
- The opening paragraph should NOT start with "I am writing to apply..." — use a compelling hook
- Include 2-3 key achievements with numbers/metrics in the value paragraph
- Show genuine research about the company in the "why this company" paragraph
- The closing should include a call to action and availability for interview
- Keep each paragraph focused and concise`;

    const userPrompt = `Resume:\n${JSON.stringify(resumeData)}\n\nJob Description:\n${jobDescription}\n\nApplicant Info:\nName: ${applicantName}\nEmail: ${applicantEmail}\nPhone: ${applicantPhone}\nLocation: ${applicantLocation}\nLinkedIn/Portfolio: ${applicantLinkedin}\n\nGenerate a formal cover letter with all sections.`;

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
              name: "generate_cover_letter",
              description: "Generate a structured formal cover letter",
              parameters: {
                type: "object",
                properties: {
                  applicant_name: { type: "string", description: "Full name of the applicant" },
                  applicant_address: { type: "string", description: "Applicant address or city/location" },
                  applicant_phone: { type: "string", description: "Applicant phone number" },
                  applicant_email: { type: "string", description: "Applicant email address" },
                  applicant_linkedin: { type: "string", description: "LinkedIn or portfolio URL" },
                  date: { type: "string", description: "Current date formatted nicely, e.g. March 8, 2026" },
                  recipient_name: { type: "string", description: "Hiring manager name if known, otherwise 'Hiring Manager'" },
                  recipient_title: { type: "string", description: "Hiring manager title if known, otherwise empty" },
                  company_name: { type: "string", description: "Company name from job description" },
                  company_address: { type: "string", description: "Company address if known, otherwise empty" },
                  subject_line: { type: "string", description: "Subject line like 'Application for [Job Title] – [Name]'" },
                  greeting: { type: "string", description: "The greeting line, e.g. 'Dear Mr. Smith,' or 'Dear Hiring Manager,'" },
                  opening: { type: "string", description: "Opening/hook paragraph (3-4 lines). State job title, where you found it, why you're a great fit." },
                  value_experience: { type: "string", description: "Your value/experience paragraph (4-6 lines). 2-3 key achievements with metrics, matched to job description." },
                  why_company: { type: "string", description: "Why this company paragraph (3-4 lines). Show research about company, align your goals with theirs." },
                  closing: { type: "string", description: "Call to action/closing paragraph (2-3 lines). Express enthusiasm, mention availability, thank them." },
                  sign_off: { type: "string", description: "Sign-off like 'Sincerely,' or 'Best Regards,'" },
                  suggested_title: { type: "string", description: "A suggested title for this cover letter" },
                },
                required: ["applicant_name", "date", "company_name", "subject_line", "greeting", "opening", "value_experience", "why_company", "closing", "sign_off", "suggested_title"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_cover_letter" } },
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

    const coverLetterData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(coverLetterData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cover-letter error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again later." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
