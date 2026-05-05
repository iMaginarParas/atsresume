import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_CONFIG: Record<string, { days: number; amount: number }> = {
  pro_weekly: { days: 7, amount: 198 },
  pro_biweekly: { days: 14, amount: 358 },
  pro_monthly: { days: 30, amount: 598 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan_id, token } = await req.json();
    const plan = PLAN_CONFIG[plan_id];
    if (!plan) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Require a valid one-time payment token
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing payment verification token" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();

    // Validate the payment token
    const { data: tokenData, error: tokenError } = await adminClient
      .from("payment_tokens")
      .select("*")
      .eq("token", token)
      .eq("user_id", user.id)
      .eq("plan_id", plan_id)
      .eq("used", false)
      .gte("expires_at", now.toISOString())
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ error: "Invalid or expired payment token. Please contact support if you completed payment." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark token as used immediately to prevent replay
    await adminClient
      .from("payment_tokens")
      .update({ used: true })
      .eq("id", tokenData.id);

    // Check for existing active subscription
    const { data: existing } = await adminClient
      .from("user_subscriptions")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("expires_at", now.toISOString())
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, already_active: true, expires_at: existing.expires_at }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expires = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);

    const { error: insertError } = await adminClient
      .from("user_subscriptions")
      .insert({
        user_id: user.id,
        plan_name: plan_id,
        status: "active",
        amount: plan.amount,
        currency: "INR",
        starts_at: now.toISOString(),
        expires_at: expires.toISOString(),
      });

    if (insertError) {
      console.error('Subscription activation failed:', insertError);
      return new Response(JSON.stringify({ error: "Failed to activate subscription. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, expires_at: expires.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
