const express = require('express');
const router = express.Router();

let stripe;
try {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch (e) {
  console.warn('Stripe not configured — payment routes disabled');
}

const { createClient } = require('@supabase/supabase-js');

// Identifica o usuário pelo token do Supabase (nunca pelo corpo da requisição).
let httpFetch = (...a) => fetch(...a);
async function usuarioDoToken(req) {
  const h = req.headers.authorization || '', token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!token || !base || !key) return null;
  try {
    const r = await httpFetch(base + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || null } : null;
  } catch (e) { return null; }
}
// Só aceita preços cadastrados no servidor (evita cobrar um preço escolhido pelo cliente).
function precoPermitido(priceId) {
  const ok = [process.env.STRIPE_PRICE_PLUS, process.env.STRIPE_PRICE_PRO, process.env.STRIPE_PRICE_BUSINESS].filter(Boolean);
  return typeof priceId === 'string' && ok.includes(priceId);
}

let getSupabaseAdmin = function getSupabaseAdminReal() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ─── Create checkout session ────────────────────────
router.post('/checkout', express.json(), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });
  const user = await usuarioDoToken(req);
  if (!user) return res.status(401).json({ error: 'Faça login para assinar.' });

  const { priceId } = req.body || {};
  if (!priceId) return res.status(400).json({ error: 'Missing priceId' });
  if (!precoPermitido(priceId)) return res.status(400).json({ error: 'Plano inválido.' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email || undefined,
      metadata: { userId: user.id },
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
  const user = await usuarioDoToken(req);
  if (!user) return res.status(401).json({ error: 'Faça login para gerenciar a assinatura.' });

  // O cliente Stripe vem do perfil do próprio usuário, nunca do corpo da requisição.
  let customerId = null;
  try {
    const { data } = await getSupabaseAdmin().from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
    customerId = data && data.stripe_customer_id;
  } catch (e) { return res.status(503).json({ error: 'Serviço indisponível.' }); }
  if (!customerId) return res.status(404).json({ error: 'Nenhuma assinatura no cartão encontrada para esta conta.' });

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
// Somente para testes automatizados: troca o Stripe, o Supabase e o fetch por simulações.
router._test = { setStripe: (x) => { stripe = x; }, setAdmin: (f) => { getSupabaseAdmin = f; }, setFetch: (f) => { httpFetch = f; } };
