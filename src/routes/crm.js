// CRM + funil + painel de tráfego pago. Uso exclusivo da equipe do CRM (tabela `crm_staff`). É uma lista DIFERENTE da Auditoria Interna (tabela `staff`).
// - Eventos do funil chegam de forma anônima (código aleatório do visitante + origem/campanha, sem dados pessoais) por POST /api/funil/evento.
// - A equipe lê e escreve com o próprio token, sob RLS (023_crm_funil.sql). A Meta é consultada com o token configurado no servidor.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { ETAPAS, painel, parseCsv, metaParse, cleanStr } = require('../lib/crm');

const router = express.Router();
const VISITOR = /^[a-zA-Z0-9-]{8,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEAD_ETAPAS = ['novo', 'conversando', 'trial', 'cliente', 'perdido'];

const { limiter } = require('../lib/ratelimit');

// ── Entrada pública (anônima) dos eventos do funil ──
router.post('/funil/evento', limiter(40, 60000, { persistent: true }), express.json({ limit: '2kb' }), async (req, res) => {
  const b = req.body || {};
  if (!ETAPAS.includes(b.etapa) || b.etapa === 'compra' || !VISITOR.test(String(b.visitor || ''))) return res.status(204).end();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(204).end();
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await sb.from('crm_events').insert({ visitor: b.visitor, etapa: b.etapa, src: cleanStr(b.src), campanha: cleanStr(b.campanha, 100), medium: cleanStr(b.medium), content: cleanStr(b.content) });
  } catch (e) { /* medição nunca atrapalha o visitante */ }
  res.status(204).end();
});

// ── Área da equipe do CRM (tabela `crm_staff`, separada da equipe da Auditoria) ──
async function staffOnly(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const h = req.headers.authorization || '', token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Entre com a sua conta da equipe.' });
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return res.status(503).json({ error: 'Serviço indisponível.' });
  try {
    const headers = { apikey: key, Authorization: 'Bearer ' + token };
    const u = await fetch(base + '/auth/v1/user', { headers });
    if (!u.ok) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    const user = await u.json();
    const s = await fetch(base + '/rest/v1/crm_staff?user_id=eq.' + encodeURIComponent(user.id) + '&select=user_id', { headers });
    const rows = s.ok ? await s.json() : [];
    if (!Array.isArray(rows) || !rows[0]) return res.status(403).json({ error: 'Acesso restrito à equipe do CRM.' });
    req.staff = { id: user.id, email: user.email, headers };
    next();
  } catch (e) { res.status(503).json({ error: 'Serviço de autenticação indisponível.' }); }
}
const rest = (req, p, init) => fetch(process.env.SUPABASE_URL + '/rest/v1/' + p, Object.assign({}, init, { headers: Object.assign({}, req.staff.headers, (init && init.headers) || {}) }));
const J = { 'Content-Type': 'application/json' };
const sinceISO = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
const dayISO = (dias) => sinceISO(dias).slice(0, 10);

router.get('/crm/ui', limiter(30, 60000), staffOnly, (req, res) => {
  res.type('html').send(fs.readFileSync(path.join(__dirname, '..', 'internal', 'crm.html'), 'utf8'));
});

router.get('/crm/painel', limiter(60, 60000), staffOnly, async (req, res) => {
  const dias = Math.min(180, Math.max(1, parseInt(req.query.dias, 10) || 30));
  try {
    const [e, a, l] = await Promise.all([
      rest(req, 'crm_events?select=visitor,etapa,campanha&created_at=gte.' + encodeURIComponent(sinceISO(dias)) + '&limit=50000'),
      rest(req, 'crm_ads?select=dia,campanha,investimento,impressoes,cliques&dia=gte.' + dayISO(dias) + '&limit=50000'),
      rest(req, 'crm_leads?select=etapa,campanha,valor,created_at&created_at=gte.' + encodeURIComponent(sinceISO(dias)) + '&limit=50000')]);
    if (!e.ok || !a.ok || !l.ok) return res.status(502).json({ error: 'Não foi possível ler os dados. As tabelas do CRM foram criadas no Supabase (migração 023)?' });
    const out = painel(await e.json(), await a.json(), await l.json());
    out.dias = dias; out.metaConfigurada = !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
    res.json(out);
  } catch (err) { res.status(502).json({ error: 'Não foi possível montar o painel.' }); }
});

router.get('/crm/leads', limiter(60, 60000), staffOnly, async (req, res) => {
  try {
    const r = await rest(req, 'crm_leads?select=*&order=updated_at.desc&limit=500');
    if (!r.ok) return res.status(502).json({ error: 'Não foi possível listar os contatos.' });
    res.json({ leads: await r.json() });
  } catch (e) { res.status(502).json({ error: 'Não foi possível listar os contatos.' }); }
});
function leadFields(b, partial) {
  const f = {};
  const set = (k, v) => { if (!partial || b[k] !== undefined) f[k] = v; };
  set('nome', cleanStr(b.nome, 120)); set('contato', cleanStr(b.contato, 120)); set('email', cleanStr(b.email, 160));
  set('origem', cleanStr(b.origem)); set('campanha', cleanStr(b.campanha, 100)); set('plano', cleanStr(b.plano, 30)); set('notas', cleanStr(b.notas, 2000));
  if (!partial || b.etapa !== undefined) f.etapa = LEAD_ETAPAS.includes(b.etapa) ? b.etapa : 'novo';
  if (!partial || b.valor !== undefined) { const v = parseFloat(b.valor); f.valor = isFinite(v) && v >= 0 ? v : null; }
  if (!partial || b.proximo_contato !== undefined) f.proximo_contato = /^\d{4}-\d{2}-\d{2}$/.test(String(b.proximo_contato || '')) ? b.proximo_contato : null;
  if (partial) f.updated_at = new Date().toISOString();
  return f;
}
router.post('/crm/leads', limiter(60, 60000), staffOnly, express.json({ limit: '20kb' }), async (req, res) => {
  const f = leadFields(req.body || {}, false);
  if (!f.nome && !f.contato && !f.email) return res.status(400).json({ error: 'Informe nome, contato ou e-mail.' });
  try {
    const r = await rest(req, 'crm_leads', { method: 'POST', headers: Object.assign({ Prefer: 'return=representation' }, J), body: JSON.stringify(f) });
    if (!r.ok) return res.status(502).json({ error: 'Não foi possível salvar.' });
    res.status(201).json({ lead: (await r.json())[0] });
  } catch (e) { res.status(502).json({ error: 'Não foi possível salvar.' }); }
});
router.patch('/crm/leads/:id', limiter(120, 60000), staffOnly, express.json({ limit: '20kb' }), async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Contato inválido.' });
  try {
    const r = await rest(req, 'crm_leads?id=eq.' + req.params.id, { method: 'PATCH', headers: J, body: JSON.stringify(leadFields(req.body || {}, true)) });
    if (!r.ok) return res.status(502).json({ error: 'Não foi possível atualizar.' });
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: 'Não foi possível atualizar.' }); }
});
router.delete('/crm/leads/:id', limiter(60, 60000), staffOnly, async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Contato inválido.' });
  try { const r = await rest(req, 'crm_leads?id=eq.' + req.params.id, { method: 'DELETE' }); res.status(r.ok ? 200 : 502).json(r.ok ? { ok: true } : { error: 'Não foi possível excluir.' }); }
  catch (e) { res.status(502).json({ error: 'Não foi possível excluir.' }); }
});

// ── Anúncios: digitado, CSV ou Meta (automático) ──
async function saveAds(req, rows, fonte) {
  const clean = rows.slice(0, 5000).map((x) => ({ dia: x.dia, campanha: cleanStr(x.campanha, 100), investimento: Math.max(0, +x.investimento || 0), impressoes: Math.max(0, Math.round(+x.impressoes || 0)), cliques: Math.max(0, Math.round(+x.cliques || 0)), fonte }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia) && x.campanha);
  if (!clean.length) return { n: 0 };
  const r = await rest(req, 'crm_ads?on_conflict=dia,campanha,fonte', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, J), body: JSON.stringify(clean) });
  if (!r.ok) throw new Error('save');
  return { n: clean.length };
}
router.post('/crm/ads', limiter(60, 60000), staffOnly, express.json({ limit: '20kb' }), async (req, res) => {
  try { const out = await saveAds(req, [req.body || {}], 'manual'); res.status(out.n ? 201 : 400).json(out.n ? out : { error: 'Informe dia (AAAA-MM-DD) e campanha.' }); }
  catch (e) { res.status(502).json({ error: 'Não foi possível salvar.' }); }
});
router.post('/crm/ads/csv', limiter(20, 60000), staffOnly, express.json({ limit: '2mb' }), async (req, res) => {
  const p = parseCsv(String((req.body && req.body.csv) || ''));
  if (p.erro) return res.status(400).json({ error: p.erro });
  try { const out = await saveAds(req, p.rows, 'csv'); res.json(out); } catch (e) { res.status(502).json({ error: 'Não foi possível salvar.' }); }
});
router.post('/crm/ads/meta', limiter(10, 60000), staffOnly, async (req, res) => {
  const token = process.env.META_ACCESS_TOKEN, acct = String(process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
  if (!token || !/^\d+$/.test(acct)) return res.status(503).json({ error: 'A Meta ainda não está configurada no servidor (META_ACCESS_TOKEN e META_AD_ACCOUNT_ID).' });
  const dias = Math.min(90, Math.max(1, parseInt((req.query && req.query.dias) || 30, 10) || 30));
  try {
    const q = new URLSearchParams({ level: 'campaign', time_increment: '1', fields: 'campaign_name,spend,impressions,clicks,inline_link_clicks', time_range: JSON.stringify({ since: dayISO(dias), until: dayISO(0) }), limit: '500' });
    let url = 'https://graph.facebook.com/v21.0/act_' + acct + '/insights?' + q, rows = [], pages = 0;
    while (url && pages++ < 20) {
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: 'A Meta recusou a consulta: ' + String((j.error && j.error.message) || r.status).slice(0, 160) });
      rows = rows.concat(metaParse(j)); url = j.paging && j.paging.next && /^https:\/\/graph\.facebook\.com\//.test(j.paging.next) ? j.paging.next : null;
    }
    const out = await saveAds(req, rows, 'meta'); res.json(out);
  } catch (e) { res.status(502).json({ error: 'Não foi possível falar com a Meta agora.' }); }
});

module.exports = router;
