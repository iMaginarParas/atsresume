import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER = "ATS Pro Resume Builder <no-reply@atsproresumebuilder.com>";

// Simple in-memory rate limiter per IP (max 3 requests per 60 seconds)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
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

function isValidRedirectTo(url: string): boolean {
  if (typeof url !== "string" || url.length > 500) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function buildEmailHtml(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <h1 style="color:#1a1a2e;font-size:24px;margin:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">ATS Pro Resume Builder</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding-top:32px;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
                &copy; ${new Date().getFullYear()} ATS Pro Resume Builder. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               req.headers.get("cf-connecting-ip") || "unknown";
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const type = body?.type;
    const email = body?.email;
    const redirectTo = body?.redirectTo;

    if (type !== "password_reset" && type !== "signup_confirmation") {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!redirectTo || !isValidRedirectTo(redirectTo)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For signup_confirmation, require authentication
    if (type === "signup_confirmation") {
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
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("Resend API key is not configured");
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let subject = "";
    let html = "";
    let plainText = "";

    if (type === "password_reset") {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

      if (error || !data) {
        console.error("Generate link error:", error);
        // Don't reveal whether user exists
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resetLink = `${redirectTo}#access_token=${data.properties.access_token}&refresh_token=${data.properties.refresh_token}&type=recovery`;

      subject = "Reset Your Password — ATS Pro Resume Builder";
      plainText = `Reset Your Password\n\nWe received a request to reset your password. Visit this link to set a new password (expires in 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ATS Pro Resume Builder`;

      html = buildEmailHtml(subject, `
        <h2 style="color:#1a1a2e;font-size:20px;margin:0 0 16px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">Reset Your Password</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
          We received a request to reset your password. Click the button below to set a new password. This link expires in 1 hour.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px auto;text-align:center;">
          <tr>
            <td style="background:#3b82f6;border-radius:8px;">
              <a href="${resetLink}" style="background:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
                Reset Password
              </a>
            </td>
          </tr>
        </table>
        <p style="color:#9ca3af;font-size:13px;line-height:1.5;margin:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
          If you didn't request this, you can safely ignore this email. Your password won't change.
        </p>
      `);

    } else if (type === "signup_confirmation") {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        options: { redirectTo },
      });

      if (error || !data) {
        console.error("Generate link error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to process request" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const confirmLink = `${redirectTo}#access_token=${data.properties.access_token}&refresh_token=${data.properties.refresh_token}&type=signup`;

      subject = "Confirm Your Email — ATS Pro Resume Builder";
      plainText = `Welcome! Confirm Your Email\n\nThanks for signing up! Visit this link to confirm your email address:\n\n${confirmLink}\n\nIf you didn't create this account, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ATS Pro Resume Builder`;

      html = buildEmailHtml(subject, `
        <h2 style="color:#1a1a2e;font-size:20px;margin:0 0 16px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">Welcome! Confirm Your Email</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
          Thanks for signing up! Click the button below to confirm your email address and get started.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px auto;text-align:center;">
          <tr>
            <td style="background:#3b82f6;border-radius:8px;">
              <a href="${confirmLink}" style="background:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
                Confirm Email
              </a>
            </td>
          </tr>
        </table>
        <p style="color:#9ca3af;font-size:13px;line-height:1.5;margin:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
          If you didn't create this account, you can safely ignore this email.
        </p>
      `);
    }

    // Send via Resend with deliverability improvements
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: SENDER,
        to: [email],
        subject,
        html,
        text: plainText,
        headers: {
          "X-Entity-Ref-ID": crypto.randomUUID(),
        },
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
