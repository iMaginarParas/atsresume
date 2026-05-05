import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function authenticateRequest(req: Request, corsHeaders: Record<string, string>) {
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    }
  );

  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) {
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  return { user, errorResponse: null };
}
