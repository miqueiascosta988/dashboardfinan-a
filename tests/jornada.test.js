const test = require('node:test'), assert = require('node:assert');
const J = require('../public/jornada.js');
global.window = undefined;
const today = '2026-10-17';
const tx = (type, amount, n = 1) => Array.from({ length: n }, () => ({ date: '2026-10-05', type, amount, cat: 'Mercado' }));
test('sem dados: passo 1 incompleto, sem diagnóstico', () => {
  const j = J.build({ today });
  assert.equal(j.step1, false); assert.equal(j.diag, null); assert.equal(j.next.id, 'renda');
});
test('dívidas: "não tenho dívidas" conta como respondido', () => {
  const o = { today, transactions: [...tx('income', 5000), ...tx('expense', 100, 5)] };
  assert.equal(J.build(o).step1, false);
  assert.equal(J.build({ ...o, flags: { semDividas: true } }).step1, true);
});
test('diagnóstico: aperto, atenção e ok', () => {
  const base = { today, flags: { semDividas: true } };
  assert.equal(J.build({ ...base, transactions: [...tx('income', 3000), ...tx('expense', 800, 5)] }).diag.level, 'aperto');
  assert.equal(J.build({ ...base, transactions: [...tx('income', 3000), ...tx('expense', 560, 5)] }).diag.level, 'atencao');
  assert.equal(J.build({ ...base, transactions: [...tx('income', 5000), ...tx('expense', 200, 5)] }).diag.level, 'ok');
  const d = J.build({ today, transactions: [...tx('income', 3000), ...tx('expense', 100, 5)], debts: [{ saldo: 5000, mensal: 1500 }] });
  assert.equal(d.diag.level, 'aperto'); assert.equal(d.plan.tab, 'estrategia');
});
test('plano salvo finaliza a jornada', () => {
  const j = J.build({ today, flags: { semDividas: true }, transactions: [...tx('income', 5000), ...tx('expense', 100, 5)], strategy: { rows: [{ ym: '2026-10', pay: 100 }] } });
  assert.equal(j.finished, true); assert.equal(j.plan.done, true);
});
