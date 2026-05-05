import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { user, errorResponse } = await authenticateRequest(req, corsHeaders);
  if (errorResponse) return errorResponse;

  try {
    const { resume_data, resume_title, location, job_type, query } = await req.json();
    
    const JSEARCH_API_KEY = Deno.env.get("Jsearch_API_key");
    if (!JSEARCH_API_KEY) {
      console.error("JSearch API key is not configured");
      throw new Error("Service configuration error");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("Service configuration error");
    }

    // Build search query from resume data or user query
    const skills = resume_data?.skills || [];
    const experience = resume_data?.experience || [];
    const latestTitle = experience[0]?.title || resume_title || "";
    
    let searchQuery = query || latestTitle || skills.slice(0, 3).join(" ");
    if (location) searchQuery += ` in ${location}`;

    // Call JSearch API
    const params = new URLSearchParams({
      query: searchQuery,
      page: "1",
      num_pages: "1",
    });
    if (job_type && job_type !== "all") {
      const remoteFilter = job_type === "remote" ? "true" : "false";
      params.set("remote_jobs_only", remoteFilter);
    }

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
      throw new Error("Job search service error");
    }

    const jsearchData = await jsearchResponse.json();
    const rawJobs = jsearchData.data || [];

    // Map JSearch results to our format
    const jobs = rawJobs.map((j: any) => {
      // Determine source platform from publisher/apply link
      let source = "Job Board";
      const applyLink = j.job_apply_link || j.job_google_link || "";
      const publisher = (j.job_publisher || "").toLowerCase();
      if (publisher.includes("linkedin") || applyLink.includes("linkedin.com")) source = "LinkedIn";
      else if (publisher.includes("indeed") || applyLink.includes("indeed.com")) source = "Indeed";
      else if (publisher.includes("glassdoor") || applyLink.includes("glassdoor.com")) source = "Glassdoor";
      else if (publisher.includes("naukri") || applyLink.includes("naukri.com") || applyLink.includes("naukriGulf") || applyLink.includes("naukrigulf.com")) source = "Naukri Gulf";
      else if (publisher.includes("google") || applyLink.includes("google.com/jobs")) source = "Google Jobs";
      else if (publisher.includes("ziprecruiter") || applyLink.includes("ziprecruiter.com")) source = "ZipRecruiter";
      else if (publisher.includes("monster") || applyLink.includes("monster.com")) source = "Monster";
      else if (publisher.includes("bayt") || applyLink.includes("bayt.com")) source = "Bayt";
      else if (publisher) source = j.job_publisher;

      return {
        job_title: j.job_title || "Untitled",
        company: j.employer_name || "Unknown",
        location: j.job_city && j.job_state
          ? `${j.job_city}, ${j.job_state}`
          : j.job_city || j.job_state || j.job_country || "Not specified",
        job_type: j.job_is_remote ? "Remote" : "On-site",
        description: j.job_description?.slice(0, 500) || "",
        url: j.job_apply_link || j.job_google_link || "#",
        posted_date: j.job_posted_at_datetime_utc
          ? j.job_posted_at_datetime_utc.split("T")[0]
          : null,
        employer_logo: j.employer_logo || null,
        job_id: j.job_id || null,
        source,
      };
    });

    // Use AI to score matches against resume
    if (jobs.length > 0 && resume_data) {
      const matchPrompt = `Score how well each job matches this resume. Return a JSON array of objects with "index" (0-based), "match_score" (0-100), and "match_explanation" (1 sentence).

Resume:
- Title: ${resume_title}
- Skills: ${skills.join(", ")}
- Summary: ${resume_data.summary || ""}
- Latest Role: ${latestTitle}

Jobs:
${jobs.map((j: any, i: number) => `${i}. ${j.job_title} at ${j.company} - ${j.description?.slice(0, 150)}`).join("\n")}

Return ONLY a JSON array.`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You score job-resume matches. Return only valid JSON arrays." },
              { role: "user", content: matchPrompt },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "[]";
          const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const scores = JSON.parse(cleaned);
          for (const score of scores) {
            if (typeof score.index === "number" && jobs[score.index]) {
              jobs[score.index].match_score = score.match_score;
              jobs[score.index].match_explanation = score.match_explanation;
            }
          }
        }
      } catch (aiErr) {
        console.error("AI scoring failed (non-critical):", aiErr);
        // Jobs still returned without scores
      }
    }

    return new Response(JSON.stringify({ jobs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-jobs error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again later." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
