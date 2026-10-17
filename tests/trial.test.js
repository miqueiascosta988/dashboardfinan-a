const test = require('node:test'), assert = require('node:assert'), Module = require('module');
const T = require('../public/trial.js');
const NOW = Date.parse('2026-10-16T12:00:00Z'), DAY = 86400000, iso = ms => new Date(ms).toISOString();

test('teste: libera dentro do prazo (+2 dias de tolerância), bloqueia depois, falha fechada sem data', () => {
  const p = d => ({ plan: 'basic', plan_status: 'trialing', plan_expires_at: iso(NOW + d * DAY) });
  assert.equal(T.temAcesso(p(3), NOW), true); assert.equal(T.temAcesso(p(-1), NOW), true); assert.equal(T.info(p(-1), NOW).carencia, true); assert.match(T.aviso(p(-1), NOW).titulo, /terminou/); assert.equal(T.temAcesso(p(-2.01), NOW), false);
  assert.equal(T.temAcesso({ plan: 'basic', plan_status: 'trialing' }, NOW), false);
  assert.equal(T.info(p(3), NOW).diasRestantes, 3); assert.equal(T.info(p(-3), NOW).expirado, true);
});
test('acesso pago continua igual; free/cancelado bloqueia; data antiga em plano ativo não bloqueia', () => {
  assert.equal(T.temAcesso({ plan: 'plus', plan_status: 'active' }, NOW), true);
  assert.equal(T.temAcesso({ plan: 'basic', plan_status: 'active', plan_expires_at: iso(NOW - 99 * DAY) }, NOW), true);
  assert.equal(T.temAcesso({ plan: 'free' }, NOW), false); assert.equal(T.temAcesso({ plan: 'pro', plan_status: 'canceled' }, NOW), false); assert.equal(T.temAcesso(null, NOW), false);
});
test('aviso: normal, urgente, último dia, expirado, nenhum', () => {
  const p = d => ({ plan: 'basic', plan_status: 'trialing', plan_expires_at: iso(NOW + d * DAY) });
  assert.equal(T.aviso(p(6), NOW).nivel, 'normal'); assert.equal(T.aviso(p(2), NOW).nivel, 'urgente'); assert.match(T.aviso(p(0.5), NOW).titulo, /Último dia/);
  assert.equal(T.aviso(p(-3), NOW).nivel, 'expirado'); assert.match(T.aviso(p(-3), NOW).texto, /R\$ 8,00/); assert.equal(T.aviso({ plan: 'basic', plan_status: 'active' }, NOW), null);
});
// ---- webhook com Supabase falso
function loadRouter(env) {
  Object.assign(process.env, { HOTMART_HOTTOK: 'tok', SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', HOTMART_PRODUCT_BASIC: 'P_BASIC', HOTMART_PRODUCT_TRIAL: 'P_TRIAL' }, env || {});
  const log = [], profiles = { rows: [{ id: 1, email: 'a@x.com', plan: 'free', plan_status: 'canceled' }] };
  const mk = (table) => { const st = { table, ops: [] }; const q = { update(v) { st.update = v; return q; }, upsert(v) { log.push({ upsert: v }); return Promise.resolve({}); }, delete() { st.del = 1; return q; }, ilike() { return q; }, or(f) { st.or = f; return q; }, eq(k, v) { st.eq = [k, v]; return q; }, select() { return q; }, limit() { return q; },
    then(res) { log.push({ table, update: st.update, or: st.or, eq: st.eq }); const hit = profiles.rows.filter(r => !(st.or && r.plan_status === 'active' && r.plan === 'plus') && !(st.eq && r.plan_status !== st.eq[1])); return Promise.resolve({ data: st.update ? hit : profiles.rows, error: null }).then(res); } }; return q; };
  const stack = [], expressStub = Object.assign(() => {}, { Router: () => ({ stack, post(path, ...hs) { stack.push({ route: { path, stack: hs.map(f => ({ handle: f })) } }); } }), json: () => () => {} });
  const orig = Module._load; Module._load = function (r, ...a) { return r === '@supabase/supabase-js' ? { createClient: () => ({ from: mk }) } : r === 'express' ? expressStub : orig.call(this, r, ...a); };
  delete require.cache[require.resolve('../src/routes/hotmart.js')]; const router = require('../src/routes/hotmart.js'); Module._load = orig;
  const h = router.stack.find(l => l.route && l.route.path === '/webhook').route.stack.pop().handle;
  return { log, profiles, call: async (body) => { let out; const res = { status(c) { out = { c }; return res; }, json(b) { out = Object.assign(out || {}, { b }); return res; } }; await h({ body: Object.assign({ hottok: 'tok' }, body), query: {}, headers: {} }, res); return out; } };
}
test('webhook: produto de teste grava trialing + 7 dias; mensal limpa o prazo', async () => {
  const w = loadRouter(); const t0 = Date.now();
  await w.call({ event: 'PURCHASE_APPROVED', data: { buyer: { email: 'a@x.com' }, product: { id: 'P_TRIAL' }, purchase: { transaction: 'T1' } } });
  const u = w.log.find(l => l.update && l.update.plan_status === 'trialing'); assert.ok(u, 'trial gravado'); assert.equal(u.update.plan, 'basic');
  const dias = (Date.parse(u.update.plan_expires_at) - t0) / 86400000; assert.ok(dias > 6.99 && dias < 7.01, 'dias ' + dias); assert.match(u.or, /plan\.eq\.free/);
  await w.call({ event: 'PURCHASE_APPROVED', data: { buyer: { email: 'a@x.com' }, product: { id: 'P_BASIC' } } });
  const m = w.log.filter(l => l.update).pop().update; assert.equal(m.plan_status, 'active'); assert.equal(m.plan_expires_at, null);
});
test('webhook: reembolso do teste só mexe em quem está em teste; reembolso normal cancela', async () => {
  const w = loadRouter();
  await w.call({ event: 'PURCHASE_REFUNDED', data: { buyer: { email: 'a@x.com' }, product: { id: 'P_TRIAL' } } });
  assert.deepEqual(w.log.find(l => l.update && l.update.plan === 'free').eq, ['plan_status', 'trialing']);
  const w2 = loadRouter(); await w2.call({ event: 'SUBSCRIPTION_CANCELLATION', data: { buyer: { email: 'a@x.com' }, product: { id: 'P_BASIC' } } });
  assert.equal(w2.log.find(l => l.update && l.update.plan === 'free').eq, undefined);
});
test('webhook: teste não rebaixa conta com plano pago ativo', async () => {
  const w = loadRouter(); w.profiles.rows = [{ id: 2, email: 'a@x.com', plan: 'plus', plan_status: 'active' }];
  const r = await w.call({ event: 'PURCHASE_APPROVED', data: { buyer: { email: 'a@x.com' }, product: { id: 'P_TRIAL' } } });
  assert.equal(r.b.skipped, 'already_paid'); assert.ok(!w.log.some(l => l.upsert));
});
test('webhook: comprador sem conta vira compra pendente com trial_days', async () => {
  const w = loadRouter(); w.profiles.rows = [];
  await w.call({ event: 'PURCHASE_APPROVED', data: { buyer: { email: 'novo@x.com' }, product: { id: 'P_TRIAL' } } });
  assert.equal(w.log.find(l => l.upsert).upsert.trial_days, 7);
});

const W = (name, ev) => ({ event: ev || 'PURCHASE_APPROVED', data: { buyer: { email: 'a@x.com' }, product: { id: 'P_ALL' }, subscription: { plan: { name } }, purchase: { transaction: 'T9' } } });
test('webhook: os 4 planos no MESMO produto são distinguidos pelo nome do plano', async () => {
  for (const [nome, plano] of [['SM Financial Business', 'business'], ['SM Financial Pro', 'pro'], ['SM Financial Plus', 'plus'], ['SM Financial Basic', 'basic']]) {
    const w = loadRouter({ HOTMART_PRODUCT_BASIC: 'P_ALL', HOTMART_PRODUCT_PLUS: 'P_ALL', HOTMART_PRODUCT_PRO: 'P_ALL', HOTMART_PRODUCT_BUSINESS: 'P_ALL' });
    await w.call(W(nome)); const u = w.log.find(l => l.update); assert.equal(u.update.plan, plano, nome); assert.equal(u.update.plan_status, 'active'); assert.equal(u.update.plan_expires_at, null);
  }
});
test('webhook: Basic Semanal vira Basic em teste de 7 dias; troca para o mensal vira ativo sem prazo', async () => {
  const w = loadRouter({ HOTMART_PRODUCT_BASIC: 'P_ALL' });
  await w.call(W('SM Financial Basic Semanal')); const u = w.log.find(l => l.update);
  assert.equal(u.update.plan, 'basic'); assert.equal(u.update.plan_status, 'trialing'); assert.ok(Date.parse(u.update.plan_expires_at) > Date.now() + 6.9 * DAY);
  const w2 = loadRouter({ HOTMART_PRODUCT_BASIC: 'P_ALL' });
  await w2.call({ event: 'SWITCH_PLAN', data: { buyer: { email: 'a@x.com' }, product: { id: 'P_ALL' }, plans: [{ name: 'SM Financial Basic Semanal', current: false }, { name: 'SM Financial Basic', current: true }] } });
  const m = w2.log.find(l => l.update).update; assert.equal(m.plan_status, 'active'); assert.equal(m.plan_expires_at, null);
});
test('webhook: cancelar o semanal só encerra quem está em teste', async () => {
  const w = loadRouter({ HOTMART_PRODUCT_BASIC: 'P_ALL' }); await w.call(W('SM Financial Basic Semanal', 'SUBSCRIPTION_CANCELLATION'));
  assert.deepEqual(w.log.find(l => l.update && l.update.plan === 'free').eq, ['plan_status', 'trialing']);
});
