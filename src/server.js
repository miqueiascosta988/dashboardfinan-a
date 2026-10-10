require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve a versão minificada (dist/, gerada por `npm run build`) quando existir; senão, public/
const DIST = path.join(__dirname, '..', 'dist');
const PUBLIC_DIR = fs.existsSync(path.join(DIST, 'index.html')) ? DIST : path.join(__dirname, '..', 'public');

// ─── Middleware ──────────────────────────────────────
app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway/Vercel: IP real do cliente para o limite de requisições
app.use(compression());
// CORS: defina ALLOWED_ORIGIN (ex.: https://app.seudominio.com.br, separados por vírgula) para restringir
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',').map(s => s.trim()) : true }));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "https://cdn.jsdelivr.net", "https://js.stripe.com"],   // wasm-unsafe-eval: OCR (Tesseract) hospedado em /ocr
      workerSrc: ["'self'", "blob:", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: [
        "'self'", process.env.SUPABASE_URL || "https://*.supabase.co", "https://api.stripe.com",
        "https://api.frankfurter.dev",   // câmbio (taxas de referência do BCE)
        "https://api.bcb.gov.br",        // Selic ao vivo (Banco Central)
        "https://brasilapi.com.br",      // consulta de CNPJ
      ],
      frameSrc: ["https://js.stripe.com"],
    },
  },
}));

// Nunca expor source maps
app.use((req, res, next) => (/\.map$/i.test(req.path) ? res.status(404).end() : next()));

// ─── Stripe webhook (precisa do corpo bruto/raw para validar a assinatura —
// por isso é montado ANTES do express.json() global; se um express.json()
// global rodar primeiro, o corpo já vem parseado e a verificação de
// assinatura do Stripe falha silenciosamente) ───────────────
const stripeRoutes = require('./routes/stripe');
app.use('/api/stripe', stripeRoutes);

// ─── Hotmart webhook (usa JSON normal, token "hottok" no corpo) ──
const hotmartRoutes = require('./routes/hotmart');
app.use('/api/hotmart', hotmartRoutes);

app.use(express.json({ limit: '100kb' }));

// ─── API routes ─────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dados institucionais do rodapé: preenchidos por variáveis de ambiente (nada é inventado; vazio = não aparece).
const siteVar = (k) => { const v = (process.env[k] || '').trim().slice(0, 200); return v || null; };
app.get('/api/config', (req, res) => {
  res.json({
    contact: { email: siteVar('SITE_EMAIL'), phone: siteVar('SITE_PHONE'), address: siteVar('SITE_ADDRESS'), hours: siteVar('SITE_HOURS'), legalName: siteVar('SITE_LEGAL_NAME'), cnpj: siteVar('SITE_CNPJ') },
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    // Hotmart — forma de pagamento principal (Brasil)
    hotmartCheckoutBasic: process.env.HOTMART_CHECKOUT_BASIC || null,
    hotmartCheckoutPlus: process.env.HOTMART_CHECKOUT_PLUS || null,
    hotmartCheckoutPro: process.env.HOTMART_CHECKOUT_PRO || null,
    hotmartCheckoutBusiness: process.env.HOTMART_CHECKOUT_BUSINESS || null,
    // Stripe — alternativa (cartão internacional)
    stripePricePlus: process.env.STRIPE_PRICE_PLUS,
    stripePricePro: process.env.STRIPE_PRICE_PRO,
    stripePriceBusiness: process.env.STRIPE_PRICE_BUSINESS,
  });
});

// Cálculos protegidos (login + plano + limite de requisições)
app.use('/api/calc', require('./routes/calc'));

// Área INTERNA da equipe (Auditoria Fiscal): só entra quem está na tabela `staff`
app.use('/api/interno', require('./routes/interno'));
// A página de entrada da área interna não deve ser indexada nem guardada em cache
app.use('/interno', (req, res, next) => { res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }); next(); });

// Rotas /api desconhecidas devolvem JSON 404 (e não a página do app)
app.use('/api', (req, res) => res.status(404).json({ error: 'Não encontrado.' }));

// ─── Static files ───────────────────────────────────
app.use(express.static(PUBLIC_DIR, { setHeaders: (res, file) => { if (/[\\/]sw\.js$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); else if (/[\\/]ocr[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=2592000'); } }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Start ──────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Finança running on port ${PORT}`);
  });
}

module.exports = app;
