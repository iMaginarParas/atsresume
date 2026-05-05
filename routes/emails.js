const express = require('express');
const router = express.Router();
const { authenticateRequest } = require('../middleware/auth');
const fetch = require('node-fetch'); // Node 18+ has fetch, but good to be safe

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

module.exports = router;
