const express = require('express');
const router = express.Router();

let stripe;
try {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch (e) {
  console.warn('Stripe not configured — payment routes disabled');
}

const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ─── Create checkout session ────────────────────────
router.post('/checkout', express.json(), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

  const { priceId, userId, email } = req.body;
  if (!priceId || !userId) return res.status(400).json({ error: 'Missing priceId or userId' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      metadata: { userId },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/?payment=success`,
      cancel_url: `${process.env.APP_URL}/?payment=cancel`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

// ─── Customer portal ────────────────────────────────
router.post('/portal', express.json(), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

  const { customerId } = req.body;
  if (!customerId) return res.status(400).json({ error: 'Missing customerId' });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.APP_URL,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err.message);
    res.status(500).json({ error: 'Failed to open portal' });
  }
});

// ─── Webhook ────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.sendStatus(503);

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabase = getSupabaseAdmin();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      if (userId) {
        await supabase.from('profiles').update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan: 'plus', // default upgrade tier
          plan_status: 'active',
        }).eq('id', userId);
      }
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const customerId = sub.customer;
      const status = sub.status; // active, past_due, canceled, etc.
      await supabase.from('profiles').update({
        plan_status: status,
      }).eq('stripe_customer_id', customerId);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await supabase.from('profiles').update({
        plan: 'free',
        plan_status: 'canceled',
        stripe_subscription_id: null,
      }).eq('stripe_customer_id', sub.customer);
      break;
    }
  }

  res.json({ received: true });
});

module.exports = router;
