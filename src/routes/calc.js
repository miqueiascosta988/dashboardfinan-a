// Rotas de cálculo protegidas: exigem login (token do Supabase) e plano mínimo, com limite de requisições.
// O motor de cálculo fica só no servidor; o navegador recebe apenas o resultado.
// Não registra nem armazena os valores recebidos.
const express = require('express');
const { run } = require('../calc/clt');

const router = express.Router();
const RANK = { free: 0, basic: 1, plus: 2, pro: 3, business: 4 };
const MIN_PLAN = { clt: 'plus', prev: 'basic' }; // simulador CLT = Plus; previsão do salário (Perfil de Renda) = Basic

// ── Limite de requisições (por IP, em memória) ──
const hits = new Map();
function limiter(max, windowMs) {
  return (req, res, next) => {
    const now = Date.now(), k = req.ip, arr = (hits.get(k) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Muitas requisições. Aguarde um instante e tente de novo.' });
    arr.push(now); hits.set(k, arr); next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const f = v.filter(t => now - t < 60000); if (f.length) hits.set(k, f); else hits.delete(k); } }, 60000).unref();

// ── Autenticação: valida o token no Supabase e lê o plano do próprio usuário (RLS) ──
async function auth(req, res, next) {
  const h = req.headers.authorization || '', token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Faça login para usar este recurso.' });
  if (process.env.NODE_ENV === 'test' && process.env.CALC_TEST_PLAN) { req.plan = process.env.CALC_TEST_PLAN; return next(); } // somente testes automatizados
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return res.status(503).json({ error: 'Serviço indisponível.' });
  try {
    const headers = { apikey: key, Authorization: 'Bearer ' + token };
    const u = await fetch(base + '/auth/v1/user', { headers });
    if (!u.ok) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    const user = await u.json();
    const p = await fetch(base + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=plan', { headers });
    const rows = p.ok ? await p.json() : [];
    req.plan = (Array.isArray(rows) && rows[0] && rows[0].plan) || 'free';
    next();
  } catch (e) { res.status(503).json({ error: 'Serviço de autenticação indisponível.' }); }
}

router.post('/:kind', limiter(30, 60000), auth, (req, res) => {
  const kind = req.params.kind;
  if (!MIN_PLAN[kind]) return res.status(404).json({ error: 'Cálculo não encontrado.' });
  if ((RANK[req.plan] || 0) < RANK[MIN_PLAN[kind]]) return res.status(403).json({ error: 'Este recurso faz parte de um plano superior.' });
  try { res.set('Cache-Control', 'no-store').json(run(kind, req.body)); }
  catch (e) { res.status(400).json({ error: 'Não foi possível calcular com os dados informados.' }); }
});

module.exports = router;
