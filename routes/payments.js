const express = require('express');
const router = express.Router();
const { authenticateRequest } = require('../middleware/auth');
const { supabase: supabaseAdmin } = require('../services/supabase');

const PLAN_CONFIG = {
  pro_weekly: { days: 7, amount: 198 },
  pro_biweekly: { days: 14, amount: 358 },
  pro_monthly: { days: 30, amount: 598 },
};

/**
 * Activate Subscription Logic
 */
router.post('/activate-subscription', authenticateRequest, async (req, res) => {
  const { plan_id, token } = req.body;
  const user = req.user;

  try {
    const plan = PLAN_CONFIG[plan_id];
    if (!plan) return res.status(400).json({ error: "Invalid plan" });

    if (!token) return res.status(403).json({ error: "Missing payment verification token" });

    const now = new Date();

    // Validate the payment token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("payment_tokens")
      .select("*")
      .eq("token", token)
      .eq("user_id", user.id)
      .eq("plan_id", plan_id)
      .eq("used", false)
      .gte("expires_at", now.toISOString())
      .maybeSingle();

    if (tokenError || !tokenData) {
      return res.status(403).json({ error: "Invalid or expired payment token." });
    }

    // Mark token as used
    await supabaseAdmin
      .from("payment_tokens")
      .update({ used: true })
      .eq("id", tokenData.id);

    // Check for existing active subscription
    const { data: existing } = await supabaseAdmin
      .from("user_subscriptions")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("expires_at", now.toISOString())
      .maybeSingle();

    if (existing) {
      return res.json({ success: true, already_active: true, expires_at: existing.expires_at });
    }

    const expires = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);

    const { error: insertError } = await supabaseAdmin
      .from("user_subscriptions")
      .insert({
        user_id: user.id,
        plan_name: plan_id,
        status: "active",
        amount: plan.amount,
        currency: "INR",
        starts_at: now.toISOString(),
        expires_at: expires.toISOString(),
      });

    if (insertError) throw insertError;

    res.json({ success: true, expires_at: expires.toISOString() });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: "Failed to activate subscription" });
  }
});

/**
 * Payment Webhook (called by payment providers)
 */
router.post('/webhook', async (req, res) => {
  const { user_email, plan_id } = req.body;
  const providedSecret = req.headers['x-webhook-secret'];
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  try {
    if (!webhookSecret || providedSecret !== webhookSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!user_email || !plan_id) return res.status(400).json({ error: "Missing fields" });

    // Look up user by email
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    if (userError) throw userError;

    const user = userData.users.find(u => u.email === user_email);
    if (!user) return res.status(404).json({ error: "User not found" });

    const crypto = require('crypto');
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const { error: tokenError } = await supabaseAdmin
      .from("payment_tokens")
      .insert({
        user_id: user.id,
        plan_id,
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (tokenError) throw tokenError;

    res.json({ success: true, token });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
