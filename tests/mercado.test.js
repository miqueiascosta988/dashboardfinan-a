const test = require('node:test'), assert = require('node:assert');
const M = require('../src/lib/mercado');
const fake = (map) => async (u) => { const id = +/sgs\.(\d+)/.exec(u)[1]; if (!(id in map)) throw new Error('off'); return { ok: true, json: async () => [{ data: '16/10/2026', valor: String(map[id]) }] }; };
test('indicadores com valor, data e fonte; poupança pela regra', async () => {
  M._reset(); const d = await M.getMercado(fake({ 432: 14.5, 4389: 14.4, 13522: 4.6, 226: 0.1 }), 1);
  const i = d.indicadores; assert.equal(i.selic.valor, 14.5); assert.equal(i.selic.data, '2026-10-16'); assert.match(i.cdi.url, /sgs\.4389/); assert.match(i.selic.fonte, /Banco Central/);
  assert.ok(Math.abs(i.poupanca.valor - ((1.005 * 1.001) ** 12 - 1) * 100) < 0.01);
});
test('valor absurdo é descartado; falha parcial mantém o último bom', async () => {
  M._reset(); await M.getMercado(fake({ 432: 14.5, 4389: 14.4, 13522: 4.6, 226: 0.1 }), 1);
  const d = await M.getMercado(fake({ 432: 999, 4389: 14.0 }), 1 + 7 * 3600 * 1000);
  assert.equal(d.indicadores.selic.valor, 14.5); assert.equal(d.indicadores.selic.stale, true); assert.equal(d.indicadores.cdi.valor, 14.0);
});
test('tudo fora e sem cache: erro', async () => { M._reset(); await assert.rejects(M.getMercado(fake({}), 1)); });
