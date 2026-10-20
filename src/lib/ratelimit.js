// Limite de requisições para rotas públicas. Na Vercel cada instância tem memória própria, então um limite só em memória é fácil de contornar:
// aqui a contagem fica no Supabase (função rate_hit, migração 026) e a memória serve de reserva se o banco não responder.
// Só guarda um código (hash) do IP, nunca o IP em texto.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const mem = new Map();
let client = null;
const sb = () => (client = client || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));
const keyOf = (req) => (req.path || '') + ':' + crypto.createHash('sha256').update(String(req.ip || '') + ':' + String(process.env.CRON_SECRET || 'sm')).digest('hex').slice(0, 24);
function memAllow(key, max, windowMs) {
  const now = Date.now(), arr = (mem.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { mem.set(key, arr); return false; }
  arr.push(now); mem.set(key, arr); return true;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of mem) { const f = v.filter((t) => now - t < 3600000); if (f.length) mem.set(k, f); else mem.delete(k); } }, 60000).unref();
async function allow(key, max, windowMs, persistent) {
  if (persistent && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try { const { data, error } = await sb().rpc('rate_hit', { p_key: key, p_max: max, p_window_s: Math.max(1, Math.ceil(windowMs / 1000)) }); if (!error && typeof data === 'boolean') return data; } catch (e) { /* cai na memória */ }
  }
  return memAllow(key, max, windowMs);
}
// opts.persistent: true nas rotas públicas (inscrição, eventos). As rotas da equipe seguem só em memória.
function limiter(max, windowMs, opts) {
  const persistent = !!(opts && opts.persistent);
  return async (req, res, next) => {
    let ok = true; try { ok = await allow(keyOf(req), max, windowMs, persistent); } catch (e) { ok = true; }
    if (!ok) return res.status(429).json({ error: 'Muitas requisições. Aguarde um instante e tente de novo.' });
    next();
  };
}
module.exports = { limiter, allow, memAllow };
