const express = require('express');
const router = express.Router();
const { authenticateRequest } = require('../middleware/auth');
// Native fetch is available in Node.js 18+ (Railway is using v22)

router.post('/send-outreach', authenticateRequest, async (req, res) => {
  const { to, subject, body: emailBody, fromName, replyTo, position, company, resumePdfBase64, resumeFilename } = req.body;
  const user = req.user;

  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(503).json({ error: 'Email service unavailable' });

    const SENDER = `${fromName || "ATS Pro"} <no-reply@atsproresumebuilder.com>`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #333;">Outreach for ${position} at ${company}</h2>
        <div style="background: #f4f4f4; padding: 15px; border-radius: 5px;">
          ${emailBody.replace(/\n/g, '<br>')}
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #777;">
          Reply to: ${replyTo || user.email}
        </p>
      </div>
    `;

    const payload = {
      from: SENDER,
      to: [to],
      subject,
      html,
      reply_to: replyTo || user.email,
      attachments: resumePdfBase64 ? [{
        filename: resumeFilename || 'Resume.pdf',
        content: resumePdfBase64
      }] : []
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Resend error');

    res.json({ success: true, id: data.id });
  } catch (error) {
    console.error('Email route error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

router.post('/contact', async (req, res) => {
  const { name, email, subject: userSubject, message, type } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(503).json({ error: 'Email service unavailable' });

    const SENDER = "ATS Pro Support <no-reply@atsproresumebuilder.com>";
    const SUPPORT_EMAIL = "muza30111997@gmail.com"; // User's email from conversation context if known, or site admin

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2563eb;">New Support Inquiry: ${type || 'General'}</h2>
        <p><strong>From:</strong> ${name} (${email})</p>
        <p><strong>Subject:</strong> ${userSubject || 'No Subject'}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <div style="background: #f9fafb; padding: 15px; border-radius: 5px; white-space: pre-wrap;">
          ${message}
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
          This message was sent from the ATS Pro Resume Builder contact form.
        </p>
      </div>
    `;

    const payload = {
      from: SENDER,
      to: [SUPPORT_EMAIL],
      subject: `[Support] ${userSubject || 'New Inquiry'} from ${name}`,
      html,
      reply_to: email
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Resend error');

    res.json({ success: true, id: data.id });
  } catch (error) {
    console.error('Contact route error:', error);
    res.status(500).json({ error: 'Failed to send contact message' });
  }
});

module.exports = router;
