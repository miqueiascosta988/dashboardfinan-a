const test = require('node:test'), assert = require('node:assert');
const R = require('../public/resumo.js');

test('sobra: parcela já lançada como gasto não é descontada duas vezes', () => {
  const debts = [{ name: 'Cartão de crédito (rotativo)', mensal: 520 }, { name: 'Cheque especial', mensal: 150 }, { name: 'Empréstimo pessoal', mensal: 410 }, { name: 'Loja de móveis', mensal: 260 }];
  const exp = [{ desc: 'Parcelas e juros do cartão', amount: 504.56 }, { desc: 'Empréstimo pessoal', amount: 410 }, { desc: 'Mercado', amount: 700 }];
  const r = R.sobra(3508.55, 3263.75, debts, exp);
  assert.equal(r.parcelasFora, 410);          // cheque especial + loja de móveis
  assert.equal(r.parcelasLancadas, 930);
  assert.equal(r.sobra, -165.2);
});
test('sobra: palavra genérica sozinha não casa (Cuidado pessoal ≠ Empréstimo pessoal)', () => {
  const r = R.parcelasFora([{ name: 'Empréstimo pessoal', mensal: 410 }], [{ desc: 'Cuidado pessoal', amount: 90 }]);
  assert.equal(r.fora, 410);
});
test('sobra: consignado em folha não entra', () => {
  assert.equal(R.parcelasFora([{ name: 'Consignado', mensal: 300, folha: true }], []).fora, 0);
});
test('variação: base negativa não vira percentual', () => {
  assert.deepEqual(R.variacao(244.8, -160.6), { tipo: 'absoluta', diff: 405.4, anterior: -160.6 });
  assert.equal(R.variacao(10, 0).tipo, 'sem-base');
  assert.equal(R.variacao(110, 100).pct, 10);
});
test('série mensal: só números reais, mês sem lançamento fica vazio', () => {
  const s = R.serieMensal([{ date: '2026-11-05', type: 'income', amount: 100 }, { date: '2026-09-02', type: 'expense', amount: 40 }], { year: 2026, month: 10 }, 3);
  assert.deepEqual(s.map(m => [m.key, m.income, m.expense, m.vazio]), [['2026-09', 0, 40, false], ['2026-10', 0, 0, true], ['2026-11', 100, 0, false]]);
});
test('antecipação: economia nunca passa do que ainda seria pago', () => {
  const e = R.economiaAntecipacao({ saldo: 2600, juros: 3.9, parcelas: 12, mensal: 260 });
  assert.equal(e.economia, 520); assert.equal(e.totalRestante, 3120); assert.ok(e.economia < 1216.8);
  const emp = R.economiaAntecipacao({ saldo: 8200, juros: 5.6, parcelas: 24, mensal: 410 });
  assert.equal(emp.naoCobre, true);   // 410 < 8200 × 5,6%: os dados não fecham, o app avisa em vez de mostrar 11.020,80
  const ok = R.economiaAntecipacao({ saldo: 2400, juros: 1.9, parcelas: 8, mensal: 320 });
  assert.equal(ok.economia, 160); assert.equal(ok.confere, true);
});
test('plural de meses', () => { assert.equal(R.meses(1), '1 mês'); assert.equal(R.meses(0.5), '0,5 meses'); assert.equal(R.meses(3), '3 meses'); });
