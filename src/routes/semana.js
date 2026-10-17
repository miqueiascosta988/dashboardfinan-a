// Plano da semana por e-mail: o Vercel Cron chama GET /api/cron/semana (segunda a quarta; quem já recebeu na semana é pulado).
// Segurança: exige CRON_SECRET (a Vercel envia "Authorization: Bearer <CRON_SECRET>"). O cliente pode sair por um link assinado.
const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const WP = require('../../public/weekplan.js');
const Trial = require('../../public/trial.js');
const { buildWeekEmail } = require('../lib/week-email');
const { sendMail } = require('../lib/mailer');

const router = express.Router();
const PAGOS = ['basic', 'plus', 'pro', 'business'];
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const unsubToken = (uid) => crypto.createHmac('sha256', String(process.env.CRON_SECRET || '')).update('unsub:' + uid).digest('base64url').slice(0, 32);
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const visible = (r, pt) => !r.profile || r.profile === 'ambos' || r.profile === pt;
const by = (rows) => { const m = {}; (rows || []).forEach((r) => { (m[r.user_id] = m[r.user_id] || []).push(r); }); return m; };

// "Hoje" no Brasil (UTC-3), para a semana virar na segunda-feira daqui.
const brToday = (now) => new Date(now - 3 * 3600000).toISOString().slice(0, 10);

async function runDigest({ supabase, now, send, appUrl, dry, limit, budgetMs }) {
  const t0 = Date.now(), today = brToday(now), wk = WP.weekRange(today), out = { week: wk.key, eligible: 0, sent: 0, skipped: 0, failed: 0, dry: !!dry };
  if (!/^https:\/\//.test(appUrl || '')) return Object.assign(out, { error: 'no_app_url' });
  const since = new Date(now - 36 * 86400000).toISOString().slice(0, 10);

  // 1) clientes com acesso ativo (pago ou teste dentro do prazo)
  let cands = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('profiles').select('id,email,name,profile_type,plan,plan_status,plan_expires_at').in('plan', PAGOS).range(from, from + 499);
    if (error) throw error;
    cands = cands.concat((data || []).filter((p) => p.email && Trial.temAcesso(p, now)));
    if (!data || data.length < 500) break;
  }
  // 2) quem já recebeu nesta semana ou saiu da lista
  const ctl = {};
  for (const ids of chunk(cands.map((p) => p.id), 200)) {
    const { data } = await supabase.from('week_digest').select('user_id,last_week,opt_out').in('user_id', ids);
    (data || []).forEach((r) => { ctl[r.user_id] = r; });
  }
  const todo = cands.filter((p) => { const c = ctl[p.id]; return !(c && (c.opt_out || c.last_week === wk.key)); });
  out.eligible = todo.length; out.skipped = cands.length - todo.length;
  if (dry) return out;

  // 3) monta e envia (poucos usuários por consulta: o Supabase devolve no máximo 1000 linhas por pedido)
  for (const grp of chunk(todo, 10)) {
    if (out.sent >= limit || Date.now() - t0 > budgetMs) break;
    const ids = grp.map((p) => p.id);
    const [tx, debts, goals, subs, evs] = await Promise.all([
      supabase.from('transactions').select('user_id,type,category,amount,date,profile').in('user_id', ids).gte('date', since),
      supabase.from('debts').select('user_id,name,balance,interest_rate,monthly_payment,profile').in('user_id', ids),
      supabase.from('goals').select('user_id,name,target_amount,current_amount,monthly_contribution,profile').in('user_id', ids),
      supabase.from('subscriptions').select('user_id,name,price,profile').in('user_id', ids),
      supabase.from('fin_events').select('user_id,kind,status,title,amount,due_date,profile').in('user_id', ids).eq('status', 'pending').lte('due_date', wk.end),
    ]);
    const T = by(tx.data), D = by(debts.data), G = by(goals.data), S = by(subs.data), E = by(evs.data);
    for (const p of grp) {
      if (out.sent >= limit || Date.now() - t0 > budgetMs) break;
      const pt = p.profile_type === 'PJ' ? 'PJ' : 'PF', f = (m) => (m[p.id] || []).filter((r) => visible(r, pt));
      const plan = WP.build({ today,
        transactions: f(T).map((r) => ({ date: r.date, cat: r.category, amount: +r.amount, type: r.type })),
        debts: f(D).map((r) => ({ name: r.name, saldo: +r.balance, juros: +r.interest_rate, mensal: +r.monthly_payment })),
        goals: f(G).map((r) => ({ name: r.name, target: +r.target_amount, current: +r.current_amount, monthly: +r.monthly_contribution })),
        subscriptions: f(S).map((r) => ({ name: r.name, price: +r.price })),
        events: f(E).map((r) => ({ kind: r.kind, status: r.status, title: r.title, amount: +r.amount, dueDate: String(r.due_date).slice(0, 10) })) });
      const unsubUrl = appUrl.replace(/\/+$/, '') + '/api/semana/sair?u=' + p.id + '&t=' + unsubToken(p.id);
      const m = buildWeekEmail({ name: p.name, plan, appUrl, unsubUrl });
      try {
        const r = await send({ to: String(p.email).toLowerCase(), subject: m.subject, html: m.html, text: m.text, headers: { 'List-Unsubscribe': '<' + unsubUrl + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
        if (!r.sent) { out.failed++; out.error = r.skipped; break; }
        await supabase.from('week_digest').upsert({ user_id: p.id, email: String(p.email).toLowerCase(), last_week: wk.key, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        out.sent++;
      } catch (e) { out.failed++; console.error('Plano da semana: envio falhou:', e.message); }
    }
  }
  return out;
}

router.get('/cron/semana', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado' });
  if (!safeEqual(req.headers.authorization, 'Bearer ' + secret)) return res.status(401).json({ error: 'Não autorizado' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const r = await runDigest({ supabase, now: Date.now(), send: (m) => sendMail(m), appUrl: process.env.APP_URL, dry: req.query.dry === '1',
      limit: Math.max(1, +process.env.WEEK_DIGEST_LIMIT || 40), budgetMs: 7000 });
    res.json(r);
  } catch (e) { console.error('Plano da semana:', e.message); res.status(500).json({ error: 'Falha ao processar' }); }
});

async function optOut(req, res, page) {
  const uid = String((req.query && req.query.u) || ''), tok = String((req.query && req.query.t) || '');
  if (!process.env.CRON_SECRET || !/^[0-9a-f-]{36}$/i.test(uid) || !safeEqual(tok, unsubToken(uid))) return res.status(400).type('html').send('<p>Link inválido.</p>');
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from('week_digest').upsert({ user_id: uid, opt_out: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch (e) { console.error('Sair da lista:', e.message); return res.status(500).type('html').send('<p>Não foi possível concluir agora. Tente de novo em instantes.</p>'); }
  if (!page) return res.json({ ok: true });
  res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pronto</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:12vh auto;padding:0 20px;color:#101B2D;line-height:1.5"><h2>Pronto, você não vai mais receber o Plano da semana por e-mail.</h2><p>Ele continua disponível dentro do aplicativo, no Início.</p><p style="color:#8A94A6;font-size:14px"><i>Do aperto ao plano, do plano ao alívio.</i></p></body>');
}
router.get('/semana/sair', (req, res) => optOut(req, res, true));
router.post('/semana/sair', (req, res) => optOut(req, res, false));   // clique único do próprio e-mail (List-Unsubscribe-Post)

module.exports = router;
module.exports.runDigest = runDigest;
module.exports.unsubToken = unsubToken;
module.exports.brToday = brToday;
