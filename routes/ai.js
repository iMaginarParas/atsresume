const express = require('express');
const router = express.Router();
const { authenticateRequest } = require('../middleware/auth');
const { generateStructuredContent, streamContent } = require('../services/gemini');

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

module.exports = router;
