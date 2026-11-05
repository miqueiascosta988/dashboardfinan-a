// AUD-09: /checkout e /portal só funcionam para o usuário logado e ignoram userId/customerId do corpo.
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), http = require('http');
process.env.SUPABASE_URL = 'https://x.supabase.test'; process.env.SUPABASE_ANON_KEY = 'anon'; process.env.APP_URL = 'https://app.test';
process.env.STRIPE_PRICE_PLUS = 'price_plus';
const router = require('../src/routes/stripe');
let srv, base; const chamadas = { checkout: [], portal: [] };
test.before(async () => {
  router._test.setStripe({ checkout: { sessions: { create: async (o) => { chamadas.checkout.push(o); return { url: 'https://stripe.test/c' }; } } }, billingPortal: { sessions: { create: async (o) => { chamadas.portal.push(o); return { url: 'https://stripe.test/p' }; } } } });
  router._test.setFetch(async (url, o) => { const t = (o.headers.Authorization || '').replace('Bearer ', ''); if (t === 'tok-ana') return { ok: true, json: async () => ({ id: 'u-ana', email: 'ana@x.test' }) }; return { ok: false, json: async () => ({}) }; });
  router._test.setAdmin(() => ({ from: () => ({ select: () => ({ eq: (c, id) => ({ maybeSingle: async () => ({ data: id === 'u-ana' ? { stripe_customer_id: 'cus_ANA' } : { stripe_customer_id: null } }) }) }) }) }));
  const app = express(); app.use('/api/stripe', router); srv = http.createServer(app); await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port;
});
test.after(() => srv.close());
const post = (p, body, tok) => fetch(base + '/api/stripe' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
test('sem login, checkout e portal respondem 401 e não chamam o Stripe', async () => {
  assert.equal((await post('/checkout', { priceId: 'price_plus', userId: 'u-vitima' })).status, 401);
  assert.equal((await post('/portal', { customerId: 'cus_VITIMA' })).status, 401);
  assert.equal((await post('/portal', { customerId: 'cus_VITIMA' }, 'tok-invalido')).status, 401);
  assert.equal(chamadas.checkout.length + chamadas.portal.length, 0);
});
test('portal usa o cliente do próprio usuário e ignora o customerId do corpo', async () => {
  const r = await post('/portal', { customerId: 'cus_VITIMA' }, 'tok-ana'); assert.equal(r.status, 200);
  assert.equal(chamadas.portal[0].customer, 'cus_ANA');
});
test('checkout usa o usuário do token (metadata e e-mail) e só aceita preço cadastrado', async () => {
  const r = await post('/checkout', { priceId: 'price_plus', userId: 'u-vitima', email: 'v@x.test' }, 'tok-ana'); assert.equal(r.status, 200);
  assert.equal(chamadas.checkout[0].metadata.userId, 'u-ana'); assert.equal(chamadas.checkout[0].customer_email, 'ana@x.test');
  assert.equal((await post('/checkout', { priceId: 'price_barato_inventado' }, 'tok-ana')).status, 400);
});
