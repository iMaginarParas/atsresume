import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_HOST = "fresh-linkedin-scraper-api.p.rapidapi.com";

function extractUsername(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^\/\?#]+)/);
  return match ? match[1] : null;
}

function parseDateCandidate(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;

  // Handle epoch timestamps
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    // Common textual keys
    const direct = value.text || value.label || value.value || value.date;
    if (typeof direct === "string") return direct;

    // Handle structures like { month: 2, year: 2024 }
    const month = value.month || value.monthValue;
    const year = value.year || value.yearValue;
    if (year) {
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      if (typeof month === "number" && month >= 1 && month <= 12) {
        return `${monthNames[month - 1]} ${year}`;
      }
      return String(year);
    }
  }

  return "";
}

function getNormalizedDate(item: any, prefix: "start" | "end", fallback = ""): string {
  const nestedDate = item?.date;
  const candidates = [
    item?.[`${prefix}Date`],
    item?.[`${prefix}_date`],
    item?.[`${prefix}Time`],
    item?.[`${prefix}_time`],
    item?.[prefix],
    nestedDate?.[prefix],
    nestedDate?.[`${prefix}Date`],
    nestedDate?.[`${prefix}_date`],
    nestedDate?.[`${prefix}Time`],
    nestedDate?.[`${prefix}_time`],
    nestedDate?.range?.[prefix],
  ];

  for (const candidate of candidates) {
    const parsed = parseDateCandidate(candidate);
    if (parsed) return parsed;
  }

  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { linkedinUrl } = await req.json();
    if (!linkedinUrl || typeof linkedinUrl !== "string") {
      return new Response(JSON.stringify({ error: "LinkedIn URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "RapidAPI key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const username = extractUsername(linkedinUrl);
    if (!username) {
      return new Response(JSON.stringify({ error: "Could not extract username from LinkedIn URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Fetching LinkedIn profile for username:", username);

    const apiHeaders = {
      "x-rapidapi-host": API_HOST,
      "x-rapidapi-key": apiKey,
    };

    const baseUrl = `https://${API_HOST}/api/v1/user`;
    const qs = `username=${encodeURIComponent(username)}`;

    // Fetch profile, experience, education, and skills in parallel
    const [profileRes, expRes, eduRes, skillsRes] = await Promise.all([
      fetch(`${baseUrl}/profile?${qs}`, { headers: apiHeaders }),
      fetch(`${baseUrl}/experience?${qs}`, { headers: apiHeaders }),
      fetch(`${baseUrl}/educations?${qs}`, { headers: apiHeaders }),
      fetch(`${baseUrl}/skills?${qs}`, { headers: apiHeaders }),
    ]);

    if (!profileRes.ok) {
      const text = await profileRes.text();
      console.error(`Profile API returned ${profileRes.status}:`, text);
      return new Response(
        JSON.stringify({ error: `Failed to fetch LinkedIn profile (${profileRes.status}). Check your RapidAPI subscription and the profile URL.` }),
        { status: profileRes.status === 429 ? 429 : 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse all responses (non-profile failures are non-fatal)
    const rawProfile = await profileRes.json();
    const rawExp = expRes.ok ? await expRes.json() : null;
    const rawEdu = eduRes.ok ? await eduRes.json() : null;
    const rawSkills = skillsRes.ok ? await skillsRes.json() : null;

    // Helper to unwrap { data: [...] } or { data: {...} } wrappers
    const unwrap = (raw: any): any => {
      if (!raw || typeof raw !== "object") return raw;
      if ("data" in raw) return raw.data;
      return raw;
    };

    const profile = unwrap(rawProfile) || {};
    const experience = unwrap(rawExp) || [];
    const education = unwrap(rawEdu) || [];
    const skills = unwrap(rawSkills) || [];

    console.log("Profile keys:", JSON.stringify(Object.keys(profile)));
    console.log("Experience count:", Array.isArray(experience) ? experience.length : "not array");
    console.log("Education count:", Array.isArray(education) ? education.length : "not array");
    console.log("Skills count:", Array.isArray(skills) ? skills.length : "not array");

    const fullName =
      profile.full_name ||
      profile.fullName ||
      profile.name ||
      [profile.first_name || profile.firstName, profile.last_name || profile.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      "";

    // Normalize location (can be string or object)
    const loc = profile.location;
    const locationStr =
      [profile.city, profile.state, profile.country].filter(Boolean).join(", ") ||
      (typeof loc === "string"
        ? loc
        : [loc?.city, loc?.state, loc?.country].filter(Boolean).join(", ")) ||
      "";
    // Deduplicate location parts (API sometimes returns "Seattle, Washington, United States, United States")
    const locationParts = locationStr.split(", ");
    const uniqueLocation = [...new Set(locationParts)].join(", ");

    const resumeData = {
      personalInfo: {
        fullName,
        email: profile.email || profile.email_address || "",
        location: uniqueLocation,
        linkedin: linkedinUrl,
      },
      summary: profile.about || profile.summary || profile.headline || profile.bio || "",
      skills: Array.isArray(skills)
        ? skills
            .map((s: any) => (typeof s === "string" ? s : s.name || s.title || s.skill || ""))
            .filter(Boolean)
        : [],
      experience: Array.isArray(experience)
        ? experience.map((pos: any) => {
            const startDate = getNormalizedDate(pos, "start", "");
            const endDate = getNormalizedDate(pos, "end", "Present");
            const companyRaw = pos.company;
            const companyName =
              typeof companyRaw === "string"
                ? companyRaw
                : companyRaw?.name || companyRaw?.companyName || pos.companyName || pos.company_name || "";
            return {
              title: pos.title || pos.position || pos.role || "",
              company: companyName,
              description: pos.description || pos.summary || "",
              startDate,
              endDate,
              bullets: [],
            };
          })
        : [],
      education: Array.isArray(education)
        ? education.map((edu: any) => {
            const startDate = getNormalizedDate(edu, "start", "");
            const endDate = getNormalizedDate(edu, "end", "");
            return {
              degree:
                edu.degree ||
                edu.degreeName ||
                edu.degree_name ||
                [edu.field_of_study || edu.fieldOfStudy].filter(Boolean).join("") ||
                "",
              school: edu.school || edu.schoolName || edu.school_name || edu.title || "",
              startDate,
              endDate,
            };
          })
        : [],
      languages: [],
      customSections: [],
    };

    return new Response(JSON.stringify(resumeData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to sync LinkedIn profile. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
