const express = require('express');
const router = express.Router();
const { authenticateRequest } = require('../middleware/auth');
const { supabase: supabaseAdmin } = require('../services/supabase');

/**
 * Assign User Role
 */
router.post('/assign-role', authenticateRequest, async (req, res) => {
  const { role } = req.body;
  const user = req.user;

  try {
    // Validate role value
    const allowedRoles = ["job_seeker", "recruiter"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Check if user already has a role
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "Role already assigned. Contact support to change roles." });
    }

    // Insert the role
    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: user.id, role });

    if (insertError) {
      console.error('Role assignment failed:', insertError);
      return res.status(500).json({ error: "Failed to assign role" });
    }

    res.json({ success: true, role });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
