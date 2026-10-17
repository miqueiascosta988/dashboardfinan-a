// E-mail semanal do Plano da semana: elegibilidade, uma vez por semana, sair da lista, autenticação do cron
const test = require('node:test'), assert = require('node:assert'), Module = require('module');
const NOW = Date.parse('2026-10-19T12:00:00Z');   // segunda-feira
const ENV = { CRON_SECRET: 'segredo', APP_URL: 'https://app.exemplo.com', SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 're', MAIL_FROM: 'SM <a@b.com>' };

function load(db) {
  Object.assign(process.env, ENV);
  const calls = [];
  const from = (table) => { const st = { table, f: [] }; const q = {
    select() { return q; }, in(c, v) { st.f.push(r => v.includes(r[c])); return q; }, eq(c, v) { st.f.push(r => r[c] === v); return q; }, gte(c, v) { st.f.push(r => String(r[c]) >= v); return q; }, lte(c, v) { st.f.push(r => String(r[c]) <= v); return q; },
    range() { return q; },
    upsert(v) { calls.push({ table, upsert: v }); const k = (db[table] = db[table] || []); const i = k.findIndex(r => r.user_id === v.user_id); if (i >= 0) Object.assign(k[i], v); else k.push(Object.assign({}, v)); return Promise.resolve({ error: null }); },
    then(res) { return Promise.resolve({ data: (db[table] || []).filter(r => st.f.every(f => f(r))), error: null }).then(res); } }; return q; };
  const stack = [], expressStub = Object.assign(() => {}, { Router: () => { const r = { stack, get(path, ...hs) { stack.push({ method: 'get', route: { path, stack: hs.map(f => ({ handle: f })) } }); }, post(path, ...hs) { stack.push({ method: 'post', route: { path, stack: hs.map(f => ({ handle: f })) } }); } }; return r; }, json: () => () => {} });
  const orig = Module._load; Module._load = function (r, ...a) { return r === '@supabase/supabase-js' ? { createClient: () => ({ from }) } : r === 'express' ? expressStub : orig.call(this, r, ...a); };
  delete require.cache[require.resolve('../src/routes/semana.js')]; const mod = require('../src/routes/semana.js'); Module._load = orig;
  const handler = (m, p) => stack.find(l => l.method === m && l.route.path === p).route.stack[0].handle;
  const call = async (h, req) => { let out = { c: 200 }; const res = { status(c) { out.c = c; return res; }, json(b) { out.b = b; return res; }, type() { return res; }, send(b) { out.html = b; return res; } }; await h(Object.assign({ query: {}, headers: {}, body: {} }, req), res); return out; };
  return { mod, calls, handler, call, supabase: { from } };
}
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', U3 = '33333333-3333-3333-3333-333333333333', U4 = '44444444-4444-4444-4444-444444444444';
const fresh = () => ({
  profiles: [
    { id: U1, email: 'Ana@x.com', name: 'Ana Silva', profile_type: 'PF', plan: 'basic', plan_status: 'active' },
    { id: U2, email: 'b@x.com', name: 'Bia', profile_type: 'PF', plan: 'basic', plan_status: 'trialing', plan_expires_at: new Date(NOW + 3 * 86400000).toISOString() },
    { id: U3, email: 'c@x.com', name: 'Caio', profile_type: 'PF', plan: 'basic', plan_status: 'trialing', plan_expires_at: new Date(NOW - 9 * 86400000).toISOString() },   // teste vencido
    { id: U4, email: 'd@x.com', name: 'Duda', profile_type: 'PF', plan: 'free', plan_status: 'canceled' }],
  debts: [{ user_id: U1, name: 'Cartão', balance: 2000, interest_rate: 12, monthly_payment: 300 }],
  transactions: [], goals: [], subscriptions: [], fin_events: [{ user_id: U1, kind: 'payable', status: 'pending', title: 'Luz', amount: 150, due_date: '2026-10-21' }], week_digest: [] });


const run = (w, extra) => w.mod.runDigest(Object.assign({ supabase: w.supabase, now: NOW, appUrl: ENV.APP_URL, limit: 99, budgetMs: 5000 }, extra));

test('envia só para quem tem acesso ativo; 1 e-mail por pessoa por semana; a segunda rodada não repete', async () => {
  const db = fresh(), w = load(db), sent = [], send = async (m) => { sent.push(m); return { sent: true }; };
  const r1 = await run(w, { send }); assert.equal(r1.week, '2026-W43'); assert.equal(r1.eligible, 2); assert.equal(r1.sent, 2);
  assert.deepEqual(sent.map(m => m.to).sort(), ['ana@x.com', 'b@x.com']);
  const ana = sent.find(m => m.to === 'ana@x.com'); assert.match(ana.html, /Olá, Ana!/); assert.match(ana.html, /Cartão/); assert.match(ana.html, /Luz/); assert.match(ana.html, /Do aperto ao plano, do plano ao alívio\./);
  assert.match(ana.headers['List-Unsubscribe'], /\/api\/semana\/sair\?u=11111111-1111-1111-1111-111111111111&t=/); assert.equal(ana.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  const r2 = await run(w, { send }); assert.equal(r2.sent, 0); assert.equal(r2.eligible, 0); assert.equal(sent.length, 2);
});
test('quem saiu da lista não recebe; falha de envio não marca a semana (tenta de novo depois)', async () => {
  const db = fresh(); db.week_digest.push({ user_id: U1, opt_out: true }); const w = load(db); let n = 0;
  const r = await run(w, { send: async () => { n++; throw new Error('Resend 500'); } }); assert.equal(r.failed, 1); assert.equal(r.sent, 0);
  assert.ok(!db.week_digest.some(x => x.user_id === U2 && x.last_week), 'semana não marcada após falha'); assert.equal(n, 1, 'Ana saiu da lista e não foi tentada');
  const ok = await run(w, { send: async () => ({ sent: true }) }); assert.equal(ok.sent, 1);
});
test('limite por rodada e modo de teste (dry) sem envio', async () => {
  const db = fresh(), w = load(db), sent = [];
  const d = await run(w, { send: async (m) => { sent.push(m); return { sent: true }; }, dry: true }); assert.equal(d.eligible, 2); assert.equal(sent.length, 0);
  const l = await run(w, { send: async (m) => { sent.push(m); return { sent: true }; }, limit: 1 }); assert.equal(l.sent, 1);
});
test('sem APP_URL https nada é enviado', async () => {
  const w = load(fresh()), r = await run(w, { send: async () => ({ sent: true }), appUrl: 'http://x' }); assert.equal(r.error, 'no_app_url'); assert.equal(r.sent, 0);
});
test('cron: exige CRON_SECRET e o cabeçalho certo', async () => {
  const w = load(fresh()), h = w.handler('get', '/cron/semana');
  assert.equal((await w.call(h, {})).c, 401); assert.equal((await w.call(h, { headers: { authorization: 'Bearer errado' } })).c, 401);
  const ok = await w.call(h, { headers: { authorization: 'Bearer segredo' }, query: { dry: '1' } }); assert.equal(ok.c, 200); assert.equal(ok.b.dry, true); assert.equal(ok.b.eligible, 2);
  delete process.env.CRON_SECRET; assert.equal((await w.call(h, {})).c, 503); process.env.CRON_SECRET = 'segredo';
});
test('sair da lista: link assinado funciona (GET e POST); link adulterado não', async () => {
  const db = fresh(), w = load(db), tok = w.mod.unsubToken(U1);
  const bad = await w.call(w.handler('get', '/semana/sair'), { query: { u: U1, t: 'x'.repeat(32) } }); assert.equal(bad.c, 400); assert.ok(!db.week_digest.some(r => r.opt_out));
  const other = await w.call(w.handler('get', '/semana/sair'), { query: { u: U2, t: tok } }); assert.equal(other.c, 400, 'token de outro usuário não vale');
  const g = await w.call(w.handler('get', '/semana/sair'), { query: { u: U1, t: tok } }); assert.equal(g.c, 200); assert.match(g.html, /não vai mais receber/); assert.ok(db.week_digest.find(r => r.user_id === U1).opt_out);
  const db2 = fresh(), w2 = load(db2), p = await w2.call(w2.handler('post', '/semana/sair'), { query: { u: U2, t: w2.mod.unsubToken(U2) } }); assert.equal(p.b.ok, true);
  const r = await run(w2, { send: async () => ({ sent: true }) }); assert.equal(r.sent, 1, 'só Ana recebe; Bia saiu');
});
