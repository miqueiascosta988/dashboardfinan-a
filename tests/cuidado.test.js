const test = require('node:test'), assert = require('node:assert');
const C = require('../public/cuidado.js');
test('voz: valor, tipo e descrição', () => {
  assert.deepEqual(C.parseVoz('gastei 35 no mercado'), { type: 'expense', amount: 35, desc: 'Mercado' });
  assert.deepEqual(C.parseVoz('Paguei R$ 1.200,50 de aluguel'), { type: 'expense', amount: 1200.5, desc: 'Aluguel' });
  assert.deepEqual(C.parseVoz('recebi 300 reais do freela'), { type: 'income', amount: 300, desc: 'Freela' });
  assert.deepEqual(C.parseVoz('gastei 12 reais e 50 centavos na padaria'), { type: 'expense', amount: 12.5, desc: 'Padaria' });
  assert.equal(C.parseVoz('gastei no mercado'), null);
});
test('poucos dados vira estimativa', () => { assert.equal(C.poucosDados(3, 2000), true); assert.equal(C.poucosDados(8, 0), true); assert.equal(C.poucosDados(8, 2000), false); });
test('dias sem lançar', () => { assert.equal(C.diasSem(['2026-10-01', '2026-10-20'], '2026-11-12'), 23); assert.equal(C.diasSem([], '2026-11-12'), null); });
test('metas que cabem: divide a sobra na mesma proporção e recalcula o prazo', () => {
  const g = [{ id: 'a', name: 'Reserva', target: 39000, current: 18500, monthly: 1200 }, { id: 'b', name: 'Viagem', target: 18000, current: 6200, monthly: 600 }, { id: 'c', name: 'Carro', target: 25000, current: 4000, monthly: 500 }];
  const r = C.ajustaMetas(g, 552.8, new Date(2026, 10, 12));
  assert.equal(r.possivel, true); assert.equal(r.pedem, 2300);
  const soma = r.itens.reduce((a, i) => a + i.novo, 0); assert.ok(soma <= 552.8 + 0.01, 'não passa da sobra: ' + soma);
  assert.equal(r.itens[0].novo, 288.41); assert.ok(r.itens[0].prazoNovo.meses > r.itens[0].prazoAntes.meses);
  assert.equal(C.ajustaMetas(g, -165, new Date()).possivel, false);
});
test('contas do ano: provisão mensal e meses até vencer', () => {
  const p = C.provisaoAnuais([{ id: 1, nome: 'IPVA', valor: 1200, mes: 1 }, { id: 2, nome: 'IPTU', valor: 600, mes: 11 }], 11);
  assert.equal(p.porMes, 150); assert.equal(p.itens[0].nome, 'IPTU'); assert.equal(p.itens[0].faltam, 0); assert.equal(p.itens[1].faltam, 2);
});
