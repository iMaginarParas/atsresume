import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { user, errorResponse } = await authenticateRequest(req, corsHeaders);
  if (errorResponse) return errorResponse;

  try {
    const { query, location, industry } = await req.json();

    const JSEARCH_API_KEY = Deno.env.get("Jsearch_API_key");
    if (!JSEARCH_API_KEY) {
      console.error("JSearch API key is not configured");
      throw new Error("Service configuration error");
    }

    let searchQuery = query || industry || "hiring";
    if (location) searchQuery += ` in ${location}`;

    const params = new URLSearchParams({
      query: searchQuery,
      page: "1",
      num_pages: "2",
    });

    const jsearchResponse = await fetch(
      `https://jsearch.p.rapidapi.com/search?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-host": "jsearch.p.rapidapi.com",
          "x-rapidapi-key": JSEARCH_API_KEY,
        },
      }
    );

    if (!jsearchResponse.ok) {
      const errText = await jsearchResponse.text();
      console.error("JSearch API error:", jsearchResponse.status, errText);
      throw new Error("Company search service error");
    }

    const jsearchData = await jsearchResponse.json();
    const rawJobs = jsearchData.data || [];

    // Group jobs by company
    const companyMap = new Map<string, any>();
    for (const j of rawJobs) {
      const name = j.employer_name || "Unknown";
      if (!companyMap.has(name)) {
        companyMap.set(name, {
          name,
          logo: j.employer_logo || null,
          website: j.employer_website || null,
          company_type: j.employer_company_type || null,
          city: j.job_city || null,
          state: j.job_state || null,
          country: j.job_country || null,
          open_jobs: [],
        });
      }
      const company = companyMap.get(name)!;
      company.open_jobs.push({
        job_title: j.job_title || "Untitled",
        job_type: j.job_is_remote ? "Remote" : "On-site",
        location: j.job_city && j.job_state
          ? `${j.job_city}, ${j.job_state}`
          : j.job_country || "Not specified",
        url: j.job_apply_link || j.job_google_link || "#",
        posted_date: j.job_posted_at_datetime_utc
          ? j.job_posted_at_datetime_utc.split("T")[0]
          : null,
        description: j.job_description?.slice(0, 300) || "",
      });
    }

    const companies = Array.from(companyMap.values()).sort(
      (a, b) => b.open_jobs.length - a.open_jobs.length
    );

    return new Response(JSON.stringify({ companies }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-companies error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
