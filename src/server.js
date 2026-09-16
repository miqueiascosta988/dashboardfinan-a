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
app.use(express.json());

// ─── Stripe webhook (raw body needed) ───────────────
const stripeRoutes = require('./routes/stripe');
app.use('/api/stripe', stripeRoutes);

// ─── API routes ─────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
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
