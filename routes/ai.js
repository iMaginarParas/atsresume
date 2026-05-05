const express = require('express');
const router = express.Router();
const { authenticateRequest } = require('../middleware/auth');
const { generateStructuredContent, streamContent } = require('../services/gemini');
const { supabase: supabaseAdmin } = require('../services/supabase');

/**
 * Interview Prep Logic
 */
router.post('/interview-prep', authenticateRequest, async (req, res) => {
  const { action, position, industry, resumeData, questionType, experienceLevel, conversation } = req.body;

  try {
    if (action === "generate-questions") {
      const prompt = `Generate 8 interview questions for a "${position}" role in "${industry}". Type: ${questionType}. Experience: ${experienceLevel}.`;
      const schema = `{ questions: [{ question, intent, framework, tip, difficulty, category }] }`;
      const result = await generateStructuredContent(prompt, "You are an expert interview coach.", schema);
      return res.json(result);
    }

    if (action === "analyze-strengths") {
      const prompt = `Analyze resume for "${position}" role in "${industry}".`;
      const schema = `{ strengths: [{point, explanation}], weaknesses: [{point, explanation, tip}], readinessScore: number, summary: string }`;
      const result = await generateStructuredContent(prompt, "You are an expert career coach.", schema);
      return res.json(result);
    }

    if (action === "start" || action === "respond" || action === "summary") {
      const messages = [{ role: 'system', content: 'You are Alex Carter, a senior hiring manager...' }, ...(conversation || [])];
      const stream = await streamContent(messages);
      
      res.setHeader('Content-Type', 'text/event-stream');
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ content: chunk.text() })}\n\n`);
      }
      return res.end();
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Interview prep route error:', error);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

/**
 * Resume Assist Logic
 */
router.post('/resume-assist', authenticateRequest, async (req, res) => {
  const { type, context } = req.body;

  try {
    let prompt = "";
    let schema = "";
    
    if (type === "summary") {
      prompt = `Write professional summary for ${context.jobTitle}. Skills: ${context.skills?.join(', ')}`;
      schema = `{ summary: string }`;
    } else if (type === "bullets") {
      prompt = `Write 4-5 bullet points for ${context.title} at ${context.company}.`;
      schema = `{ bullets: [string] }`;
    } else if (type === "skills") {
      prompt = `Suggest skills for ${context.jobTitle}.`;
      schema = `{ skills: [string] }`;
    }

    const result = await generateStructuredContent(prompt, "You are an expert resume writer.", schema);
    res.json(result);
  } catch (error) {
    console.error('Resume assist route error:', error);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

/**
 * Grade Resume Logic
 */
router.post('/grade-resume', authenticateRequest, async (req, res) => {
  const { resumeData, jobDescription } = req.body;

  try {
    const prompt = `Grade this resume comprehensively. Job description provided: ${!!jobDescription}`;
    const schema = `{ overallScore: number, overallAssessment: string, ats: {score, strengths: [], improvements: []}, fit: {score, label, strengths: [], improvements: []}, writing: {score, strengths: [], improvements: []} }`;
    const result = await generateStructuredContent(prompt, "You are an expert resume reviewer and ATS specialist.", schema);
    res.json(result);
  } catch (error) {
    console.error('Grade resume route error:', error);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

/**
 * Parse Resume Logic
 */
router.post('/parse-resume', authenticateRequest, async (req, res) => {
  const { text } = req.body;

  try {
    const prompt = `Extract structured data from this resume text: ${text.slice(0, 5000)}`;
    const schema = `{ personalInfo: {fullName, email, phone, location, linkedin, portfolio}, summary: string, skills: [], experience: [{title, company, description, bullets: []}], education: [{degree, school, year}], customSections: [{title, items: []}] }`;
    const result = await generateStructuredContent(prompt, "You are an expert resume parser.", schema);
    res.json(result);
  } catch (error) {
    console.error('Parse resume route error:', error);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

/**
 * AI Apply Logic (Search + Score + Queue)
 */
router.post('/ai-apply', authenticateRequest, async (req, res) => {
  const { resume_id, resume_data, resume_title, location, job_type, min_score = 60, max_applications = 20 } = req.body;
  const user = req.user;

  try {
    const JSEARCH_API_KEY = process.env.RAPIDAPI_KEY;
    if (!JSEARCH_API_KEY) return res.status(503).json({ error: 'Search service unavailable' });

    // 1. Create campaign record
    console.log(`Starting AI Apply for user ${user.id}...`);
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('ai_apply_campaigns')
      .insert({
        user_id: user.id,
        resume_id,
        status: 'running',
        location: location || null,
        job_type: job_type || null,
        min_score,
        max_applications,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (campErr) {
      console.error("Campaign creation error:", campErr);
      throw campErr;
    }

    // 2. Search Jobs
    console.log(`Searching jobs for query: ${resume_title}...`);
    const searchQuery = resume_title || 'software engineer';
    const searchRes = await fetch(`https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(location || '')}`, {
      headers: {
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key': JSEARCH_API_KEY
      }
    });
    
    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("JSearch API error:", errText);
      throw new Error(`Job search failed: ${searchRes.statusText}`);
    }

    const searchData = await searchRes.json();
    const fetchLimit = Math.min(30, Math.max(10, max_applications * 2)); // Fetch more than needed to ensure quality
    const jobs = (searchData.data || []).slice(0, fetchLimit);
    console.log(`Found ${jobs.length} jobs to process (Limit: ${fetchLimit}).`);

    if (jobs.length === 0) {
      await supabaseAdmin.from('ai_apply_campaigns').update({ status: 'completed', jobs_searched: 0 }).eq('id', campaign.id);
      return res.json({ queued: 0, total_found: 0 });
    }

    // 3. AI Scoring
    console.log("Scoring jobs with Gemini...");
    const prompt = `Score these ${jobs.length} jobs for this candidate. Resume: ${JSON.stringify(resume_data).slice(0, 2000)}. Jobs: ${JSON.stringify(jobs.map(j => ({ title: j.job_title, desc: j.job_description.slice(0, 500) })))}}`;
    const schema = `{ results: [{ index: number, match_score: number, match_explanation: string, tailored_summary: string, tailored_skills: [string], cover_letter_opening: string, cover_letter_body: string, cover_letter_closing: string }] }`;
    
    const scoringResult = await generateStructuredContent(prompt, "You are a career coach.", schema);
    if (!scoringResult || !scoringResult.results) {
      throw new Error("AI Scoring returned invalid data");
    }

    const qualified = scoringResult.results.filter(r => r.match_score >= min_score).slice(0, max_applications);
    console.log(`${qualified.length} jobs qualified.`);

    // 4. Queue them
    const inserts = qualified.map(r => {
      const job = jobs[r.index];
      if (!job) return null;
      return {
        user_id: user.id,
        resume_id,
        campaign_id: campaign.id,
        job_title: job.job_title,
        company: job.employer_name,
        location: `${job.job_city || ''}, ${job.job_state || ''}`,
        job_type: job.job_is_remote ? 'Remote' : 'On-site',
        job_url: job.job_apply_link,
        match_score: r.match_score,
        match_explanation: r.match_explanation,
        tailored_resume_data: { ...resume_data, summary: r.tailored_summary, skills: r.tailored_skills },
        cover_letter_data: { greeting: `Dear Hiring Manager at ${job.employer_name},`, opening: r.cover_letter_opening, body: r.cover_letter_body, closing: r.cover_letter_closing }
      };
    }).filter(Boolean);

    if (inserts.length > 0) {
      console.log(`Inserting ${inserts.length} jobs into queue...`);
      const { error: insErr } = await supabaseAdmin.from('ai_apply_queue').insert(inserts);
      if (insErr) console.error("Queue insertion error:", insErr);
    }

    // 5. Finalize campaign
    await supabaseAdmin.from('ai_apply_campaigns').update({
      status: 'completed',
      jobs_searched: jobs.length,
      jobs_scored: scoringResult.results.length,
      jobs_queued: inserts.length,
      completed_at: new Date().toISOString(),
    }).eq('id', campaign.id);

    res.json({ queued: inserts.length, total_found: jobs.length, total_scored: scoringResult.results.length });

  } catch (error) {
    console.error('AI apply error:', error);
    res.status(500).json({ error: 'Campaign failed' });
  }
});

/**
 * Search Jobs Logic (Standalone for Find Jobs page)
 */
router.post('/search-jobs', authenticateRequest, async (req, res) => {
  const { resume_data, resume_title, location, job_type, query } = req.body;

  try {
    const JSEARCH_API_KEY = process.env.RAPIDAPI_KEY;
    if (!JSEARCH_API_KEY) return res.status(503).json({ error: 'Search service unavailable' });

    // 1. Sophisticated Query Building
    const skills = resume_data?.skills || [];
    const experience = resume_data?.experience || [];
    const latestTitle = experience[0]?.title || resume_title || "";
    
    let searchQuery = query || latestTitle || (skills.length > 0 ? skills.slice(0, 3).join(" ") : "software engineer");
    
    const params = new URLSearchParams({
      query: searchQuery,
      location: location || '',
      page: "1",
      num_pages: "1",
    });

    // 2. Job Type / Remote Filtering
    if (job_type && job_type !== "all") {
      const remoteFilter = job_type === "remote" ? "true" : "false";
      params.set("remote_jobs_only", remoteFilter);
    }

    const searchRes = await fetch(`https://jsearch.p.rapidapi.com/search?${params.toString()}`, {
      headers: {
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key': JSEARCH_API_KEY
      }
    });
    
    if (!searchRes.ok) throw new Error('Job search API failed');

    const searchData = await searchRes.json();
    const rawJobs = (searchData.data || []).slice(0, 15);

    if (rawJobs.length === 0) return res.json({ jobs: [] });

    // 3. AI Match Scoring (Robust Prompt)
    const prompt = `Score how well each job matches this resume. Return a JSON array of objects with "index" (0-based), "match_score" (0-100), and "match_explanation" (1 sentence).

Resume:
- Title: ${resume_title}
- Skills: ${skills.join(", ")}
- Latest Role: ${latestTitle}

Jobs:
${rawJobs.map((j, i) => `${i}. ${j.job_title} at ${j.employer_name} - ${j.job_description?.slice(0, 150)}`).join("\n")}

Return ONLY a JSON array.`;

    const schema = `{ results: [{ index: number, match_score: number, match_explanation: string }] }`;
    const scoringResult = await generateStructuredContent(prompt, "You are an expert career matching specialist.", schema);
    
    // 4. Normalization and Source Detection
    const jobs = rawJobs.map((j, i) => {
      const match = scoringResult.results?.find(r => r.index === i);
      
      // Source platform detection
      let source = "Job Board";
      const applyLink = j.job_apply_link || j.job_google_link || "";
      const publisher = (j.job_publisher || "").toLowerCase();
      
      if (publisher.includes("linkedin") || applyLink.includes("linkedin.com")) source = "LinkedIn";
      else if (publisher.includes("indeed") || applyLink.includes("indeed.com")) source = "Indeed";
      else if (publisher.includes("glassdoor") || applyLink.includes("glassdoor.com")) source = "Glassdoor";
      else if (publisher.includes("naukri") || applyLink.includes("naukri.com")) source = "Naukri";
      else if (publisher.includes("google")) source = "Google Jobs";
      else if (publisher.includes("ziprecruiter")) source = "ZipRecruiter";
      else if (publisher.includes("monster")) source = "Monster";
      else if (publisher.includes("bayt")) source = "Bayt";
      else if (j.job_publisher) source = j.job_publisher;

      return {
        job_id: j.job_id || null,
        job_title: j.job_title || "Untitled",
        company: j.employer_name || "Unknown",
        location: j.job_city ? `${j.job_city}, ${j.job_state || ''}` : j.job_country || "Not specified",
        job_type: j.job_is_remote ? "Remote" : "On-site",
        description: j.job_description || "",
        url: applyLink,
        posted_date: j.job_posted_at_datetime_utc ? j.job_posted_at_datetime_utc.split("T")[0] : null,
        match_score: match?.match_score || 0,
        match_explanation: match?.match_explanation || "Analyzing fit...",
        employer_logo: j.employer_logo || null,
        source
      };
    });

    res.json({ jobs });
  } catch (error) {
    console.error('Search jobs error:', error);
    res.status(500).json({ error: 'Failed to search jobs' });
  }
});

/**
 * LinkedIn Sync Logic
 */
router.post('/sync-linkedin', authenticateRequest, async (req, res) => {
  const { linkedinUrl } = req.body;

  try {
    // Note: Deep scraping LinkedIn usually requires a specialized proxy or API.
    // For now, we provide a robust extraction interface.
    console.log(`Syncing LinkedIn for ${linkedinUrl}...`);
    
    // MOCK/STUB: In production, you'd use a service like Proxycurl or a custom scraper here.
    // For this implementation, we simulate the extraction to let the AI build the resume.
    const prompt = `Based on the LinkedIn profile URL ${linkedinUrl}, generate a high-quality resume structure. Since you don't have real-time access to this specific profile, provide a professional "Skeleton" or "Template" based on common patterns for high-end roles, OR if the URL contains keywords, use them.`;
    const schema = `{ personalInfo: {fullName, email, phone, location, linkedin}, summary: string, skills: [], experience: [{title, company, description, bullets: []}], education: [{degree, school, year}] }`;
    
    const result = await generateStructuredContent(prompt, "You are a professional resume architect.", schema);
    res.json(result);
  } catch (error) {
    console.error('LinkedIn sync error:', error);
    res.status(500).json({ error: 'Failed to sync LinkedIn profile' });
  }
});

/**
 * Recruiter Applicant Analysis
 */
router.post('/recruiter-analyze', authenticateRequest, async (req, res) => {
  const { jobDescription, applicants } = req.body;

  try {
    const prompt = `Analyze these ${applicants.length} applicants for this job description: ${jobDescription.slice(0, 2000)}. Applicants: ${JSON.stringify(applicants.map(a => ({ id: a.id, name: a.name, resume: JSON.stringify(a.resume_data).slice(0, 1000) })))}}`;
    const schema = `{ rankings: [{ applicantId: string, score: number, fitReason: string, recommendation: string }] }`;
    
    const result = await generateStructuredContent(prompt, "You are an expert HR recruitment specialist.", schema);
    res.json(result);
  } catch (error) {
    console.error('Recruiter analyze error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

/**
 * Generate Cover Letter Logic
 */
router.post('/generate-cover-letter', authenticateRequest, async (req, res) => {
  const { resumeData, jobDescription, tone } = req.body;

  try {
    const personalInfo = resumeData?.personalInfo || {};
    const prompt = `Generate a professionally formatted cover letter.
      Tone: ${tone || "professional"}
      Applicant: ${personalInfo.fullName || "Applicant"}
      Email: ${personalInfo.email || ""}
      Job Description: ${jobDescription}`;

    const schema = `{ 
      applicant_name: string, 
      date: string, 
      company_name: string, 
      subject_line: string, 
      greeting: string, 
      opening: string, 
      value_experience: string, 
      why_company: string, 
      closing: string, 
      sign_off: string, 
      suggested_title: string 
    }`;

    const result = await generateStructuredContent(prompt, "You are an expert cover letter writer.", schema);
    res.json(result);
  } catch (error) {
    console.error('Generate cover letter route error:', error);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

module.exports = router;
