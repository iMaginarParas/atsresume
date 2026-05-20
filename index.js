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

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  'https://atsresume-production-5394.up.railway.app',
  // Vercel deployments (add your specific domain once deployed)
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    // Allow any vercel.app subdomain (covers preview deployments)
    if (origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app')) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Headers', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'],
  credentials: true
}));

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
