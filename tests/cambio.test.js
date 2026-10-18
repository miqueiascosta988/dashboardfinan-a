const test = require('node:test'), assert = require('node:assert');
const C = require('../src/lib/cambio');
const big = () => { const r = { BRL: 5, EUR: 0.9 }; for (let i = 0; i < 60; i++) r['X' + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26)] = 1 + i; return r; };
const ok = (j) => async () => ({ ok: true, json: async () => j });
test('fonte principal: ~160 moedas, data e fonte', async () => {
  C._reset();
  const d = await C.getCambio(ok({ result: 'success', time_last_update_unix: 1790000000, time_next_update_unix: 1790086400, rates: big() }), 1000);
  assert.equal(d.source.name, 'ExchangeRate-API'); assert.equal(d.rates.USD, 1); assert.ok(d.rates.BRL > 0); assert.match(d.date, /^20\d\d-\d\d-\d\d$/);
});
test('cache por 6h e reserva do BCE quando a principal falha', async () => {
  C._reset(); let n = 0;
  const f = async (u) => { n++; if (/er-api/.test(u)) throw new Error('x'); return { ok: true, json: async () => ({ date: '2026-10-16', rates: { BRL: 5.4, EUR: 0.92 } }) }; };
  const d = await C.getCambio(f, 1000); assert.match(d.source.name, /Banco Central Europeu/); assert.equal(d.date, '2026-10-16');
  const n1 = n; const d2 = await C.getCambio(f, 2000); assert.equal(n, n1); assert.equal(d2.cached, true);
});
test('tudo falha: devolve a última boa (stale) ou erro', async () => {
  C._reset(); const bad = async () => { throw new Error('off'); };
  await assert.rejects(C.getCambio(bad, 1));
  await C.getCambio(ok({ result: 'success', time_last_update_unix: 1790000000, rates: big() }), 1);
  const d = await C.getCambio(bad, 1 + 7 * 3600 * 1000); assert.equal(d.stale, true);
});
