import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Detect apply method from URL ────────────────────────────────────────────

interface ApplyMethod {
  method: "greenhouse" | "lever" | "email" | "manual";
  boardToken?: string;
  jobId?: string;
  companySlug?: string;
}

function detectApplyMethod(url: string): ApplyMethod {
  if (!url || url === "#") return { method: "manual" };

  // Greenhouse: boards.greenhouse.io/{board_token}/jobs/{job_id}
  const ghMatch = url.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
  if (ghMatch) return { method: "greenhouse", boardToken: ghMatch[1], jobId: ghMatch[2] };

  // Greenhouse alternate: job-boards.greenhouse.io/
  const ghAlt = url.match(/job-boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
  if (ghAlt) return { method: "greenhouse", boardToken: ghAlt[1], jobId: ghAlt[2] };

  // Lever: jobs.lever.co/{company}/{job_id}
  const leverMatch = url.match(/jobs\.lever\.co\/([^\/]+)\/([a-f0-9-]+)/);
  if (leverMatch) return { method: "lever", companySlug: leverMatch[1], jobId: leverMatch[2] };

  return { method: "manual" };
}

// ─── Greenhouse Application Submission ───────────────────────────────────────

async function applyGreenhouseJob(
  boardToken: string,
  jobId: string,
  applicant: { firstName: string; lastName: string; email: string; phone?: string; resumeText: string; coverLetter: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const formData = new FormData();
    formData.append("first_name", applicant.firstName);
    formData.append("last_name", applicant.lastName);
    formData.append("email", applicant.email);
    if (applicant.phone) formData.append("phone", applicant.phone);

    // Greenhouse accepts resume as text content
    const resumeBlob = new Blob([applicant.resumeText], { type: "text/plain" });
    formData.append("resume", resumeBlob, "resume.txt");

    // Cover letter as text
    formData.append("cover_letter", applicant.coverLetter);

    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`,
      { method: "POST", body: formData }
    );

    if (res.ok) return { success: true };

    const errText = await res.text();
    console.error("Greenhouse API error:", res.status, errText);
    return { success: false, error: `Greenhouse: ${res.status} - ${errText.slice(0, 200)}` };
  } catch (err) {
    console.error("Greenhouse submission error:", err);
    return { success: false, error: `Greenhouse error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

// ─── Lever Application Submission ────────────────────────────────────────────

async function applyLeverJob(
  companySlug: string,
  jobId: string,
  applicant: { fullName: string; email: string; phone?: string; resumeText: string; coverLetter: string; urls?: string[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    const formData = new FormData();
    formData.append("name", applicant.fullName);
    formData.append("email", applicant.email);
    if (applicant.phone) formData.append("phone", applicant.phone);
    formData.append("comments", applicant.coverLetter);

    // Lever accepts resume as a file upload
    const resumeBlob = new Blob([applicant.resumeText], { type: "text/plain" });
    formData.append("resume", resumeBlob, "resume.txt");

    if (applicant.urls) {
      applicant.urls.forEach((url) => formData.append("urls[GitHub]", url));
    }

    const res = await fetch(
      `https://jobs.lever.co/v0/postings/${companySlug}/${jobId}?key=`,
      { method: "POST", body: formData }
    );

    if (res.ok) return { success: true };

    const errText = await res.text();
    console.error("Lever API error:", res.status, errText);
    return { success: false, error: `Lever: ${res.status} - ${errText.slice(0, 200)}` };
  } catch (err) {
    console.error("Lever submission error:", err);
    return { success: false, error: `Lever error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

// ─── Email-based Application ─────────────────────────────────────────────────

async function applyViaEmail(
  recruiterEmail: string,
  applicant: {
    fullName: string;
    email: string;
    jobTitle: string;
    company: string;
    coverLetter: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return { success: false, error: "Email service unavailable" };

  const subject = `Application: ${applicant.jobTitle} — ${applicant.fullName}`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<p style="color:#6b7280;font-size:13px;padding:8px 12px;background:#f3f4f6;border-radius:6px;border-left:3px solid #6366f1;">
Re: <strong>${applicant.jobTitle}</strong> at <strong>${applicant.company}</strong>
</p>
<div style="color:#1f2937;font-size:15px;line-height:1.8;margin-top:16px;">
${applicant.coverLetter.replace(/\n/g, "<br>")}
</div>
<p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:24px;">
Reply to: <a href="mailto:${applicant.email}" style="color:#6366f1;">${applicant.email}</a>
</p>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${applicant.fullName} <no-reply@atsproresumebuilder.com>`,
        to: [recruiterEmail],
        subject,
        html,
        text: applicant.coverLetter,
        reply_to: applicant.email,
      }),
    });

    if (res.ok) return { success: true };
    const err = await res.json();
    return { success: false, error: `Email: ${JSON.stringify(err).slice(0, 200)}` };
  } catch (err) {
    return { success: false, error: `Email error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

// ─── Build resume text for ATS submission ────────────────────────────────────

function buildResumeText(resumeData: any): string {
  const pi = resumeData?.personalInfo || {};
  const lines: string[] = [];
  if (pi.fullName) lines.push(pi.fullName);
  if (pi.email) lines.push(pi.email);
  if (pi.phone) lines.push(pi.phone);
  if (pi.location) lines.push(pi.location);
  if (pi.linkedin) lines.push(pi.linkedin);
  lines.push("");
  if (resumeData?.summary) {
    lines.push("PROFESSIONAL SUMMARY");
    lines.push(resumeData.summary);
    lines.push("");
  }
  if (resumeData?.skills?.length) {
    lines.push("SKILLS");
    lines.push(resumeData.skills.join(", "));
    lines.push("");
  }
  if (resumeData?.experience?.length) {
    lines.push("EXPERIENCE");
    for (const exp of resumeData.experience) {
      lines.push(`${exp.title} at ${exp.company} (${exp.startDate || ""} - ${exp.endDate || "Present"})`);
      if (exp.description) lines.push(exp.description);
      if (exp.bullets?.length) exp.bullets.forEach((b: string) => lines.push(`• ${b}`));
      lines.push("");
    }
  }
  if (resumeData?.education?.length) {
    lines.push("EDUCATION");
    for (const edu of resumeData.education) {
      lines.push(`${edu.degree} — ${edu.school} (${edu.startDate || edu.year || ""} - ${edu.endDate || ""})`);
    }
  }
  return lines.join("\n");
}

function buildCoverLetterText(coverLetterData: any, fullName: string): string {
  if (!coverLetterData) return "";
  return [
    coverLetterData.greeting || "Dear Hiring Manager,",
    "",
    coverLetterData.opening || "",
    "",
    coverLetterData.body || "",
    "",
    coverLetterData.closing || "",
    "",
    `Sincerely,\n${fullName}`,
  ].join("\n");
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { user, errorResponse } = await authenticateRequest(req, corsHeaders);
  if (errorResponse) return errorResponse;

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { queue_ids, recruiter_email } = await req.json();

    if (!Array.isArray(queue_ids) || queue_ids.length === 0) {
      return respond({ error: "No jobs specified" }, 400);
    }

    // Cap at 10 per request to prevent abuse
    const ids = queue_ids.slice(0, 10);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch queued jobs
    const { data: jobs, error: fetchErr } = await supabaseAdmin
      .from("ai_apply_queue")
      .select("*")
      .in("id", ids)
      .eq("user_id", user!.id)
      .eq("status", "queued");

    if (fetchErr || !jobs?.length) {
      return respond({ error: "No queued jobs found" }, 404);
    }

    // Get user's email for applications
    const userEmail = user!.email || "";

    const results: Array<{ id: string; success: boolean; method: string; error?: string }> = [];

    for (const job of jobs) {
      const resumeData = job.tailored_resume_data as any;
      const coverLetterData = job.cover_letter_data as any;
      const pi = resumeData?.personalInfo || {};
      const fullName = pi.fullName || "Applicant";
      const nameParts = fullName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const resumeText = buildResumeText(resumeData);
      const coverLetterText = buildCoverLetterText(coverLetterData, fullName);

      const detected = detectApplyMethod(job.job_url || "");
      let result: { success: boolean; error?: string } = { success: false, error: "No apply method available" };
      let method = detected.method;

      // Try ATS API first
      if (detected.method === "greenhouse" && detected.boardToken && detected.jobId) {
        result = await applyGreenhouseJob(detected.boardToken, detected.jobId, {
          firstName,
          lastName,
          email: userEmail,
          phone: pi.phone,
          resumeText,
          coverLetter: coverLetterText,
        });
      } else if (detected.method === "lever" && detected.companySlug && detected.jobId) {
        result = await applyLeverJob(detected.companySlug, detected.jobId, {
          fullName,
          email: userEmail,
          phone: pi.phone,
          resumeText,
          coverLetter: coverLetterText,
          urls: pi.linkedin ? [pi.linkedin] : undefined,
        });
      }

      // Fallback to email if ATS failed or not supported
      if (!result.success && recruiter_email) {
        method = "email";
        result = await applyViaEmail(recruiter_email, {
          fullName,
          email: userEmail,
          jobTitle: job.job_title,
          company: job.company,
          coverLetter: coverLetterText,
        });
      }

      // If still no success and manual, mark as manual
      if (!result.success && method === "manual") {
        // For manual jobs, we just mark them — user will apply themselves
        method = "manual";
      }

      // Update queue status
      const updateData: Record<string, unknown> = {
        apply_method: method,
        updated_at: new Date().toISOString(),
      };

      if (result.success) {
        updateData.status = "applied";

        // Also track in job_applications
        await supabaseAdmin.from("job_applications").insert({
          user_id: user!.id,
          company: job.company,
          position: job.job_title,
          url: job.job_url,
          status: "applied",
          notes: `AI Auto-Apply (${method}) — Match: ${job.match_score}%`,
        });
      } else if (method !== "manual") {
        updateData.status = "failed";
        updateData.apply_error = result.error || "Unknown error";
      }
      // manual stays as "queued" unless user applies

      await supabaseAdmin
        .from("ai_apply_queue")
        .update(updateData)
        .eq("id", job.id);

      results.push({
        id: job.id,
        success: result.success,
        method,
        error: result.error,
      });
    }

    const applied = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success && r.method !== "manual").length;
    const manual = results.filter((r) => r.method === "manual").length;

    return respond({
      applied,
      failed,
      manual,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error("auto-apply error:", err);
    return respond({ error: "An unexpected error occurred" }, 500);
  }
});
