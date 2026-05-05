import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalizedJob {
  job_title: string;
  company: string;
  location: string;
  job_type: string;
  description: string;
  url: string;
}

interface AIScoreResult {
  index: number;
  match_score: number;
  match_explanation: string;
  tailored_summary: string;
  tailored_skills: string[];
  cover_letter_opening: string;
  cover_letter_body: string;
  cover_letter_closing: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FUNCTION_START = Date.now();
const TIMEOUT_MS = 45_000; // 45s guard — stop before edge function hard limit

function isTimedOut(): boolean {
  return Date.now() - FUNCTION_START > TIMEOUT_MS;
}

function normalizeJob(j: any): NormalizedJob {
  return {
    job_title: j.job_title || "Untitled",
    company: j.employer_name || "Unknown",
    location: j.job_city && j.job_state
      ? `${j.job_city}, ${j.job_state}`
      : j.job_country || "Not specified",
    job_type: j.job_is_remote ? "Remote" : "On-site",
    description: (j.job_description || "").slice(0, 600),
    url: j.job_apply_link || j.job_google_link || "#",
  };
}

async function searchJobs(
  query: string,
  location: string | undefined,
  jobType: string | undefined,
  apiKey: string,
  page: number
): Promise<NormalizedJob[]> {
  const params: Record<string, string> = {
    query: location ? `${query} in ${location}` : query,
    page: String(page),
    num_pages: "1",
  };
  if (location) {
    params.location = location;
    params.radius = "50";
  }
  if (jobType === "remote") params.work_from_home = "true";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(
      `https://jsearch.p.rapidapi.com/search?${new URLSearchParams(params)}`,
      {
        headers: {
          "x-rapidapi-host": "jsearch.p.rapidapi.com",
          "x-rapidapi-key": apiKey,
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(normalizeJob);
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

async function scoreBatch(
  jobs: NormalizedJob[],
  resumeTitle: string,
  resumeData: any,
  lovableKey: string
): Promise<AIScoreResult[]> {
  const skills = resumeData?.skills || [];
  const experience = resumeData?.experience || [];
  const latestTitle = experience[0]?.title || resumeTitle || "";

  const prompt = `You are an expert career coach. Given a candidate's resume and ${jobs.length} job listings, for each job:
1. Score the match (0-100)
2. Write a tailored 2-3 sentence professional summary
3. Suggest the top 8-10 most relevant skills (reordered for this role, add 1-2 from JD if missing)
4. Write a 3-paragraph cover letter (opening, body, closing)

Resume:
- Title: ${resumeTitle}
- Summary: ${resumeData?.summary || ""}
- Skills: ${skills.join(", ")}
- Latest Role: ${latestTitle}
- Experience: ${experience.slice(0, 2).map((e: any) => `${e.title} at ${e.company}`).join("; ")}

Jobs:
${jobs.map((j, i) => `[${i}] ${j.job_title} at ${j.company} (${j.location})\n${j.description.slice(0, 200)}`).join("\n\n")}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000); // 30s per batch max

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a career coach. Return structured data only." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_ai_apply_results",
              description: "Return AI apply results for all jobs",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        match_score: { type: "number" },
                        match_explanation: { type: "string" },
                        tailored_summary: { type: "string" },
                        tailored_skills: { type: "array", items: { type: "string" } },
                        cover_letter_opening: { type: "string" },
                        cover_letter_body: { type: "string" },
                        cover_letter_closing: { type: "string" },
                      },
                      required: ["index", "match_score", "match_explanation", "tailored_summary", "tailored_skills", "cover_letter_opening", "cover_letter_body", "cover_letter_closing"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["results"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_ai_apply_results" } },
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 429) throw new Error("rate_limit");
      if (res.status === 402) throw new Error("credits_exhausted");
      throw new Error(`ai_error_${res.status}`);
    }

    const aiData = await res.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return [];
    const { results } = JSON.parse(toolCall.function.arguments);
    return results || [];
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      console.error("AI batch timed out after 30s");
      return [];
    }
    throw e;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { user, errorResponse } = await authenticateRequest(req, corsHeaders);
  if (errorResponse) return errorResponse;

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const {
      resume_id,
      resume_data,
      resume_title,
      location,
      job_type,
      min_score = 60,
      max_applications = 20,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Service configuration error");

    const JSEARCH_API_KEY = Deno.env.get("Jsearch_API_key");
    if (!JSEARCH_API_KEY) throw new Error("Service configuration error");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── 1. Create campaign record ──────────────────────────────────────────
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from("ai_apply_campaigns")
      .insert({
        user_id: user!.id,
        resume_id,
        status: "running",
        location: location || null,
        job_type: job_type || null,
        min_score,
        max_applications,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (campErr || !campaign) throw new Error("Failed to create campaign");
    const campaignId = campaign.id;

    // ── 2. Build search query ──────────────────────────────────────────────
    const skills = resume_data?.skills || [];
    const experience = resume_data?.experience || [];
    const latestTitle = experience[0]?.title || resume_title || "";
    const searchQuery = latestTitle || skills.slice(0, 3).join(" ") || "software engineer";

    // ── 3. Search 2 pages in parallel (max ~20 unique jobs) ────────────────
    const pagePromises = [1, 2].map((page) =>
      searchJobs(searchQuery, location, job_type, JSEARCH_API_KEY, page).catch(() => [])
    );
    const pageResults = await Promise.all(pagePromises);
    const allJobs: NormalizedJob[] = [];
    const seen = new Set<string>();
    for (const page of pageResults) {
      for (const job of page) {
        const key = `${job.job_title}|${job.company}`;
        if (!seen.has(key)) {
          seen.add(key);
          allJobs.push(job);
        }
      }
    }

    if (allJobs.length === 0) {
      await supabaseAdmin.from("ai_apply_campaigns").update({
        status: "completed",
        jobs_searched: 0,
        jobs_queued: 0,
        completed_at: new Date().toISOString(),
      }).eq("id", campaignId);

      return respond({ queued: 0, total_found: 0, campaign_id: campaignId, message: "No matching jobs found" });
    }

    // Update campaign with search count
    await supabaseAdmin.from("ai_apply_campaigns").update({
      jobs_searched: allJobs.length,
    }).eq("id", campaignId);

    // ── 4. AI score in batches of 10, with timeout guard ──────────────────
    const BATCH_SIZE = 10;
    const allScored: AIScoreResult[] = [];
    let timedOut = false;

    for (let i = 0; i < allJobs.length; i += BATCH_SIZE) {
      // Check timeout before starting a new batch
      if (isTimedOut()) {
        console.log(`Timeout guard triggered after scoring ${allScored.length} jobs. Returning partial results.`);
        timedOut = true;
        break;
      }

      const batch = allJobs.slice(i, i + BATCH_SIZE);
      try {
        const batchResults = await scoreBatch(batch, resume_title, resume_data, LOVABLE_API_KEY);
        // Map batch indices back to global indices
        for (const r of batchResults) {
          allScored.push({ ...r, index: i + r.index });
        }
      } catch (e: any) {
        if (e.message === "rate_limit") {
          return respond({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
        }
        if (e.message === "credits_exhausted") {
          return respond({ error: "AI credits exhausted. Please add funds." }, 402);
        }
        // Skip batch on other errors
        console.error("Batch scoring error:", e);
      }
    }

    // ── 5. Filter by score and cap at max_applications ────────────────────
    const qualified = allScored
      .filter((r) => r.match_score >= min_score)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, max_applications);

    // Update scored count
    await supabaseAdmin.from("ai_apply_campaigns").update({
      jobs_scored: allScored.length,
    }).eq("id", campaignId);

    // ── 6. Build inserts for ai_apply_queue ───────────────────────────────
    const inserts = qualified
      .map((r) => {
        const job = allJobs[r.index];
        if (!job) return null;
        return {
          user_id: user!.id,
          resume_id,
          campaign_id: campaignId,
          job_title: job.job_title,
          company: job.company,
          location: job.location,
          job_type: job.job_type,
          job_url: job.url,
          description: job.description.slice(0, 500),
          match_score: r.match_score,
          match_explanation: r.match_explanation,
          tailored_resume_data: {
            ...resume_data,
            summary: r.tailored_summary,
            skills: r.tailored_skills,
          },
          cover_letter_data: {
            greeting: `Dear Hiring Manager at ${job.company},`,
            opening: r.cover_letter_opening,
            body: r.cover_letter_body,
            closing: r.cover_letter_closing,
          },
        };
      })
      .filter(Boolean);

    if (inserts.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("ai_apply_queue")
        .insert(inserts);
      if (insertError) {
        console.error("Insert error:", insertError);
        throw new Error("Failed to save apply queue");
      }
    }

    // ── 7. Mark campaign complete ──────────────────────────────────────────
    await supabaseAdmin.from("ai_apply_campaigns").update({
      status: "completed",
      jobs_queued: inserts.length,
      completed_at: new Date().toISOString(),
    }).eq("id", campaignId);

    return respond({
      queued: inserts.length,
      total_found: allJobs.length,
      total_scored: allScored.length,
      campaign_id: campaignId,
      partial: timedOut,
    });

  } catch (e: any) {
    console.error("ai-apply error:", e);
    return respond({ error: "An unexpected error occurred. Please try again later." }, 500);
  }
});
