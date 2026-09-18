require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", process.env.SUPABASE_URL || "https://*.supabase.co", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com"],
    },
  },
}));

// ─── Stripe webhook (precisa do corpo bruto/raw para validar a assinatura —
// por isso é montado ANTES do express.json() global; se um express.json()
// global rodar primeiro, o corpo já vem parseado e a verificação de
// assinatura do Stripe falha silenciosamente) ───────────────
const stripeRoutes = require('./routes/stripe');
app.use('/api/stripe', stripeRoutes);

// ─── Hotmart webhook (usa JSON normal, token "hottok" no corpo) ──
const hotmartRoutes = require('./routes/hotmart');
app.use('/api/hotmart', hotmartRoutes);

app.use(express.json());

// ─── API routes ─────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    // Hotmart — forma de pagamento principal (Brasil)
    hotmartCheckoutPlus: process.env.HOTMART_CHECKOUT_PLUS || null,
    hotmartCheckoutPro: process.env.HOTMART_CHECKOUT_PRO || null,
    hotmartCheckoutBusiness: process.env.HOTMART_CHECKOUT_BUSINESS || null,
    // Stripe — alternativa (cartão internacional)
    stripePricePlus: process.env.STRIPE_PRICE_PLUS,
    stripePricePro: process.env.STRIPE_PRICE_PRO,
    stripePriceBusiness: process.env.STRIPE_PRICE_BUSINESS,
  });
});

// ─── Static files ───────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start ──────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Finança running on port ${PORT}`);
  });
}

module.exports = app;
