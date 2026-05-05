require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const aiRoutes = require('./routes/ai');
const emailRoutes = require('./routes/emails');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: 'Too many requests, please try again later.' }
});

// Stricter AI Rate Limiting (Cost protection)
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 AI requests per hour
  message: { error: 'AI quota reached for this hour. Please wait or upgrade.' }
});

app.use(cors());
app.use(express.json());
app.use(globalLimiter);

// Routes
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/emails', globalLimiter, emailRoutes);
app.use('/api/auth', globalLimiter, authRoutes);
app.use('/api/payments', globalLimiter, paymentRoutes);

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
