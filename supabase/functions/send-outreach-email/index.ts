import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limit: max 10 outreach emails per user per 10 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 120_000);

function isValidEmail(email: string): boolean {
  return typeof email === "string" && email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit by user id
    if (isRateLimited(user.id)) {
      return new Response(JSON.stringify({ error: "Too many requests. Please wait before sending more emails." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to, subject, body: emailBody, fromName, replyTo, position, company, resumePdfBase64, resumeFilename, additionalAttachments } = body;

    // Validate required fields
    if (!isValidEmail(to)) {
      return new Response(JSON.stringify({ error: "Invalid recipient email address." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subject || typeof subject !== "string" || subject.trim().length === 0 || subject.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid subject line." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!emailBody || typeof emailBody !== "string" || emailBody.trim().length === 0 || emailBody.length > 10000) {
      return new Response(JSON.stringify({ error: "Invalid email body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service temporarily unavailable." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the user's name as sender display name
    const senderName = fromName?.trim() || "ATS Pro";
    const SENDER = `${senderName} <no-reply@atsproresumebuilder.com>`;

    // Validate replyTo if provided
    const replyToEmail = replyTo && isValidEmail(replyTo) ? replyTo : user.email;

    // Plain text version (critical for deliverability — emails without plain text are flagged)
    const plainText = emailBody;

    // Convert plain text body to HTML preserving line breaks
    const htmlBody = emailBody
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    const positionContext = position && company
      ? `<p style="color:#6b7280;font-size:13px;margin:0 0 16px;padding:8px 12px;background:#f3f4f6;border-radius:6px;border-left:3px solid #3b82f6;">
           Re: <strong>${position.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong> at <strong>${company.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong>
         </p>`
      : "";

    // Properly structured HTML email with all required elements for deliverability
    const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${subject.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;">
              ${positionContext}
              <div style="color:#1f2937;font-size:15px;line-height:1.8;font-family:Arial,Helvetica,sans-serif;">
                ${htmlBody}
              </div>
            </td>
          </tr>
          ${replyToEmail ? `<tr>
            <td style="padding-top:16px;text-align:center;">
              <p style="color:#9ca3af;font-size:11px;margin:0;font-family:Arial,Helvetica,sans-serif;">
                Reply directly to: <a href="mailto:${replyToEmail}" style="color:#3b82f6;text-decoration:none;">${replyToEmail}</a>
              </p>
            </td>
          </tr>` : ""}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const resendPayload: Record<string, unknown> = {
      from: SENDER,
      to: [to],
      subject: subject.trim(),
      html,
      text: plainText,
      reply_to: replyToEmail || undefined,
      headers: {
        // Unique message ID prevents threading/grouping that triggers spam
        "X-Entity-Ref-ID": crypto.randomUUID(),
      },
    };

    // Attach resume PDF if provided
    if (resumePdfBase64 && typeof resumePdfBase64 === "string") {
      const filename = resumeFilename
        ? resumeFilename.replace(/[^a-zA-Z0-9_\-. ]/g, "").trim() || "Resume.pdf"
        : "Resume.pdf";
      resendPayload.attachments = [
        {
          filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
          content: resumePdfBase64,
        },
      ];
    }

    // Attach additional documents if provided
    if (Array.isArray(additionalAttachments) && additionalAttachments.length > 0) {
      const existingAttachments = (resendPayload.attachments as unknown[] | undefined) ?? [];
      const extraAttachments = additionalAttachments
        .filter((a: { filename?: string; content?: string }) => a && typeof a.content === "string" && a.content.length > 0)
        .slice(0, 5)
        .map((a: { filename?: string; content?: string; type?: string }) => ({
          filename: String(a.filename ?? "document").replace(/[^a-zA-Z0-9_\-. ]/g, "").trim() || "document",
          content: a.content,
        }));
      resendPayload.attachments = [...existingAttachments, ...extraAttachments];
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      return new Response(JSON.stringify({ error: "Failed to send email. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the sent email in job_applications notes (optional audit trail)
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      await supabaseAdmin.from("job_applications").update({
        notes: `[Email sent to ${to} on ${new Date().toLocaleDateString()}]`,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("company", company ?? "").eq("position", position ?? "");
    } catch {
      // Non-critical
    }

    return new Response(JSON.stringify({ success: true, messageId: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
