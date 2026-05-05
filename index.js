require('dotenv').config();
const express = require('express');
const cors = require('cors');
const aiRoutes = require('./routes/ai');
const emailRoutes = require('./routes/emails');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/emails', emailRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Railway backend is running', 
    service: 'Resume Builder API', 
    ai: 'Gemini 1.5 Flash Direct',
    endpoints: ['/api/ai/interview-prep', '/api/ai/resume-assist']
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
