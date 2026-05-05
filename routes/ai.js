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

    if (campErr) throw campErr;

    // 2. Search Jobs (Simplified for now, calling JSearch)
    const searchQuery = resume_title || 'software engineer';
    const searchRes = await fetch(`https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(location || '')}`, {
      headers: {
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key': JSEARCH_API_KEY
      }
    });
    const searchData = await searchRes.json();
    const jobs = (searchData.data || []).slice(0, 10); // Batch of 10

    if (jobs.length === 0) {
      await supabaseAdmin.from('ai_apply_campaigns').update({ status: 'completed', jobs_searched: 0 }).eq('id', campaign.id);
      return res.json({ queued: 0, total_found: 0 });
    }

    // 3. AI Scoring (Using Gemini)
    const prompt = `Score these ${jobs.length} jobs for this candidate. Resume: ${JSON.stringify(resume_data).slice(0, 2000)}. Jobs: ${JSON.stringify(jobs.map(j => ({ title: j.job_title, desc: j.job_description.slice(0, 500) })))}}`;
    const schema = `{ results: [{ index: number, match_score: number, match_explanation: string, tailored_summary: string, tailored_skills: [string], cover_letter_opening: string, cover_letter_body: string, cover_letter_closing: string }] }`;
    
    const scoringResult = await generateStructuredContent(prompt, "You are a career coach.", schema);
    const qualified = scoringResult.results.filter(r => r.match_score >= min_score).slice(0, max_applications);

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
      await supabaseAdmin.from('ai_apply_queue').insert(inserts);
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

module.exports = router;
