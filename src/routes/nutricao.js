// Sequência de e-mails da triagem. Inscrição pública com consentimento (POST /api/funil/inscrever), envio diário pelo Vercel Cron
// (GET /api/cron/nutricao, exige CRON_SECRET) e saída por link assinado (/api/nutricao/sair).
const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { validEmail, dueStep, buildNutricao } = require('../lib/nutricao');
const { sendMail } = require('../lib/mailer');
const { cleanStr } = require('../lib/crm');

const router = express.Router();
const PAGOS = ['basic', 'plus', 'pro', 'business'];
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const token = (id) => crypto.createHmac('sha256', String(process.env.CRON_SECRET || '')).update('nutri:' + id).digest('base64url').slice(0, 32);
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const hits = new Map();
function limiter(max, windowMs) {
  return (req, res, next) => { const now = Date.now(), k = req.ip + req.path, arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante.' }); arr.push(now); hits.set(k, arr); next(); };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const f = v.filter((t) => now - t < 3600000); if (f.length) hits.set(k, f); else hits.delete(k); } }, 60000).unref();

function links(row, appUrl) {
  const base = String(appUrl).replace(/\/+$/, '');
  const q = new URLSearchParams({ utm_source: 'email', utm_medium: 'nutricao' }); if (row.campanha) q.set('utm_campaign', row.campanha);
  return { apresUrl: base + '/apresentacao?' + q.toString(), unsubUrl: base + '/api/nutricao/sair?i=' + row.id + '&t=' + token(row.id), appUrl: base };
}
const headersFor = (u) => ({ 'List-Unsubscribe': '<' + u + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
async function sendStep(supabase, row, step, send, appUrl, now) {
  const L = links(row, appUrl), m = buildNutricao(step, L);
  const r = await send({ to: row.email, subject: m.subject, html: m.html, text: m.text, headers: headersFor(L.unsubUrl) });
  if (!r.sent) return r;
  await supabase.from('nutricao').update({ step, last_sent_at: new Date(now).toISOString() }).eq('id', row.id);
  return r;
}

router.post('/funil/inscrever', limiter(5, 3600000), express.json({ limit: '2kb' }), async (req, res) => {
  const b = req.body || {}, email = String(b.email || '').trim().toLowerCase();
  if (b.consentimento !== true || !validEmail(email)) return res.status(400).json({ error: 'Informe um e-mail válido e marque a autorização.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Serviço indisponível.' });
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const ex = await supabase.from('nutricao').select('id').eq('email', email);
    if (!(ex.data && ex.data.length)) {
      const ins = await supabase.from('nutricao').insert({ email, visitor: cleanStr(b.visitor, 40), campanha: cleanStr(b.campanha, 100), src: cleanStr(b.src) }).select('id,email,campanha,step,created_at').single();
      if (ins.data) {
        // contato também entra no CRM como "novo", para a equipe fazer o follow-up
        const lead = await supabase.from('crm_leads').select('id').eq('email', email);
        if (!(lead.data && lead.data.length)) await supabase.from('crm_leads').insert({ email, origem: 'triagem', campanha: cleanStr(b.campanha, 100), etapa: 'novo' });
        if (/^https:\/\//.test(process.env.APP_URL || '')) { try { await sendStep(supabase, ins.data, 1, (m) => sendMail(m), process.env.APP_URL, Date.now()); } catch (e) { console.error('Nutrição: 1º e-mail falhou:', e.message); } }
      }
    }
    res.json({ ok: true });   // mesma resposta para e-mail novo ou já inscrito
  } catch (e) { res.status(500).json({ error: 'Não foi possível concluir agora.' }); }
});

async function runNutricao({ supabase, now, send, appUrl, dry, limit, budgetMs }) {
  const t0 = Date.now(), out = { eligible: 0, sent: 0, converted: 0, failed: 0, dry: !!dry };
  if (!/^https:\/\//.test(appUrl || '')) return Object.assign(out, { error: 'no_app_url' });
  const { data, error } = await supabase.from('nutricao').select('id,email,campanha,step,created_at,opt_out,converted').eq('opt_out', false).eq('converted', false);
  if (error) throw error;
  const rows = (data || []).filter((r) => !r.opt_out && !r.converted && (+r.step || 0) < 3);
  // quem já virou cliente sai da sequência
  const emails = rows.map((r) => r.email), clientes = new Set();
  for (const grp of chunk(emails, 100)) {
    const p = await supabase.from('profiles').select('email,plan').in('email', grp); (p.data || []).forEach((x) => { if (PAGOS.includes(x.plan)) clientes.add(String(x.email).toLowerCase()); });
    const l = await supabase.from('crm_leads').select('email,etapa').in('email', grp); (l.data || []).forEach((x) => { if (x.etapa === 'cliente') clientes.add(String(x.email).toLowerCase()); });
  }
  const todo = [];
  for (const r of rows) {
    if (clientes.has(String(r.email).toLowerCase())) { out.converted++; if (!dry) await supabase.from('nutricao').update({ converted: true }).eq('id', r.id); continue; }
    if (dueStep(r, now)) todo.push(r);
  }
  out.eligible = todo.length;
  if (dry) return out;
  for (const r of todo) {
    if (out.sent >= limit || Date.now() - t0 > budgetMs) break;
    try { const x = await sendStep(supabase, r, dueStep(r, now), send, appUrl, now); if (!x.sent) { out.failed++; out.error = x.skipped; break; } out.sent++; }
    catch (e) { out.failed++; console.error('Nutrição: envio falhou:', e.message); }
  }
  return out;
}

router.get('/cron/nutricao', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado' });
  if (!safeEqual(req.headers.authorization, 'Bearer ' + secret)) return res.status(401).json({ error: 'Não autorizado' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    res.json(await runNutricao({ supabase, now: Date.now(), send: (m) => sendMail(m), appUrl: process.env.APP_URL, dry: req.query.dry === '1', limit: Math.max(1, +process.env.NUTRICAO_LIMIT || 40), budgetMs: 7000 }));
  } catch (e) { console.error('Nutrição:', e.message); res.status(500).json({ error: 'Falha ao processar' }); }
});

async function optOut(req, res, page) {
  const id = String((req.query && req.query.i) || ''), tok = String((req.query && req.query.t) || '');
  if (!process.env.CRON_SECRET || !/^[0-9a-f-]{36}$/i.test(id) || !safeEqual(tok, token(id))) return res.status(400).type('html').send('<p>Link inválido.</p>');
  try { const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); await supabase.from('nutricao').update({ opt_out: true }).eq('id', id); }
  catch (e) { return res.status(500).type('html').send('<p>Não foi possível concluir agora. Tente de novo em instantes.</p>'); }
  if (!page) return res.json({ ok: true });
  res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pronto</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:12vh auto;padding:0 20px;color:#101B2D;line-height:1.5"><h2>Pronto, você não vai mais receber esses e-mails.</h2><p>Obrigado pela atenção. Se um dia quiser voltar, a porta está aberta.</p><p style="color:#8A94A6;font-size:14px"><i>Do aperto ao plano, do plano ao alívio.</i></p></body>');
}
router.get('/nutricao/sair', (req, res) => optOut(req, res, true));
router.post('/nutricao/sair', (req, res) => optOut(req, res, false));

module.exports = router;
module.exports.runNutricao = runNutricao;
