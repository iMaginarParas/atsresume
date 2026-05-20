const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
// In production, we MUST use SUPABASE_SERVICE_ROLE_KEY for admin/backend privileges.
// Fallback to anon key is only allowed in local development.
const isProduction = process.env.NODE_ENV === 'production';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Supabase URL missing in environment variables.');
}

if (!supabaseServiceRoleKey) {
  if (isProduction) {
    throw new Error('FATAL: SUPABASE_SERVICE_ROLE_KEY is required in production environments to run backend tasks.');
  } else {
    console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY is missing. Falling back to SUPABASE_ANON_KEY (development mode).');
  }
}

const activeKey = supabaseServiceRoleKey || process.env.SUPABASE_ANON_KEY;

if (!activeKey) {
  console.error('No Supabase credentials found. Calls will fail.');
}

const supabase = createClient(supabaseUrl, activeKey);

module.exports = { supabase };


