require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 3000;

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Gemini configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Railway backend is running', service: 'Resume Builder API', ai: 'Gemini Direct' });
});

// Direct Gemini Chat Endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;
    
    const chat = model.startChat({
      history: [],
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\nUser: ${message}` : message;
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    res.json({ content: text });
  } catch (error) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: 'Failed to generate response from Gemini' });
  }
});

// Example route: Get all resumes (Admin only example)
app.get('/api/resumes', async (req, res) => {
  const { data, error } = await supabase
    .from('resumes')
    .select('*');
  
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
