// E-mail automático de boas-vindas após a compra (link do dashboard + vídeo de onboarding)
const test = require('node:test'), assert = require('node:assert'), Module = require('module');
const W = require('../src/lib/welcome-email.js');
const ENV = { RESEND_API_KEY: 're_x', MAIL_FROM: 'SM <a@b.com>', APP_URL: 'https://app.exemplo.com', ONBOARDING_VIDEO_URL: 'https://youtu.be/abc' };

test('conteúdo: link do app, vídeo, slogan; escapa HTML; ignora URL não-https', () => {
  const m = W.buildWelcome({ plan: 'basic', appUrl: ENV.APP_URL, videoUrl: ENV.ONBOARDING_VIDEO_URL, trial: true });
  for (const k of ['html', 'text']) { assert.match(m[k], /app\.exemplo\.com/); assert.match(m[k], /youtu\.be\/abc/); assert.match(m[k], /Do aperto ao plano, do plano ao alívio\./); }
  assert.match(m.text, /7 dias/);
  const bad = W.buildWelcome({ plan: 'plus', appUrl: ENV.APP_URL, videoUrl: 'javascript:alert(1)' });
  assert.ok(!/javascript:/.test(bad.html) && !/vídeo de onboarding/i.test(bad.text));
});
test('envio: chama a Resend com remetente/destinatário; sem configuração pula; erro da API lança', async () => {
  Object.assign(process.env, ENV); let call;
  const ok = await W.sendWelcomeEmail({ to: 'x@y.com', plan: 'pro' }, { fetch: async (u, o) => { call = { u, o }; return { ok: true }; } });
  assert.equal(ok.sent, true); assert.equal(call.u, 'https://api.resend.com/emails'); const b = JSON.parse(call.o.body); assert.deepEqual(b.to, ['x@y.com']); assert.equal(b.from, ENV.MAIL_FROM); assert.match(call.o.headers.Authorization, /re_x/);
  await assert.rejects(W.sendWelcomeEmail({ to: 'x@y.com', plan: 'pro' }, { fetch: async () => ({ ok: false, status: 403, text: async () => 'domain' }) }), /Resend 403/);
  delete process.env.RESEND_API_KEY; assert.equal((await W.sendWelcomeEmail({ to: 'x@y.com' })).skipped, 'not_configured'); process.env.RESEND_API_KEY = 're_x';
});

function loadRouter() {
  Object.assign(process.env, { HOTMART_HOTTOK: 'tok', SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }, ENV);
  const sent = new Set(), ops = [];
  const mk = (table) => { const q = { _op: null, update() { q._op = 'u'; return q; }, upsert() { return Promise.resolve({}); }, ilike() { return q; }, or() { return q; }, eq(k, v) { if (q._op === 'd') { sent.delete(v); ops.push('delete:' + v); } return q; }, select() { return q; }, limit() { return q; },
    insert(v) { ops.push('insert:' + v.email); if (sent.has(v.email)) return Promise.resolve({ error: { code: '23505', message: 'dup' } }); sent.add(v.email); return Promise.resolve({ error: null }); },
    delete() { q._op = 'd'; return q; }, then(res) { return Promise.resolve({ data: [{ id: 1 }], error: null }).then(res); } }; return q; };
  const stack = [], expressStub = Object.assign(() => {}, { Router: () => ({ stack, post(path, ...hs) { stack.push({ route: { path, stack: hs.map(f => ({ handle: f })) } }); } }), json: () => () => {} });
  const orig = Module._load; Module._load = function (r, ...a) { return r === '@supabase/supabase-js' ? { createClient: () => ({ from: mk }) } : r === 'express' ? expressStub : orig.call(this, r, ...a); };
  delete require.cache[require.resolve('../src/routes/hotmart.js')]; const router = require('../src/routes/hotmart.js'); Module._load = orig;
  const h = router.stack.find(l => l.route && l.route.path === '/webhook').route.stack.pop().handle;
  return { ops, call: async (body) => { let out; const res = { status(c) { out = { c }; return res; }, json(b) { out = Object.assign(out || {}, { b }); return res; } }; await h({ body: Object.assign({ hottok: 'tok' }, body), query: {}, headers: {} }, res); return out; } };
}
const ev = (e, email) => ({ event: e, data: { buyer: { email: email || 'Novo@X.com' }, product: { id: 'P' }, subscription: { plan: { name: 'Basic' } }, purchase: { transaction: 'T1' } } });

test('webhook: compra aprovada envia 1 e-mail; evento repetido não reenvia; outros eventos não enviam', async () => {
  const fetches = []; const realFetch = global.fetch; global.fetch = async (u, o) => { fetches.push(JSON.parse(o.body)); return { ok: true }; };
  try {
    const w = loadRouter();
    await w.call(ev('PURCHASE_APPROVED')); await w.call(ev('PURCHASE_APPROVED')); await w.call(ev('PURCHASE_COMPLETE')); await w.call(ev('SWITCH_PLAN'));
    assert.equal(fetches.length, 1); assert.deepEqual(fetches[0].to, ['novo@x.com']);
  } finally { global.fetch = realFetch; }
});
test('webhook: falha da Resend não derruba o webhook e libera a trava para nova tentativa', async () => {
  const realFetch = global.fetch; let n = 0; global.fetch = async () => (++n === 1 ? { ok: false, status: 500, text: async () => 'x' } : { ok: true });
  try {
    const w = loadRouter(); const r1 = await w.call(ev('PURCHASE_APPROVED')); assert.equal(r1.b.received, true); assert.ok(w.ops.includes('delete:novo@x.com'));
    await w.call(ev('PURCHASE_APPROVED')); assert.equal(n, 2);
  } finally { global.fetch = realFetch; }
});
