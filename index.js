require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Railway backend is running', service: 'Resume Builder API' });
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
