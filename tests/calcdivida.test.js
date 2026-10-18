const test = require('node:test'), assert = require('node:assert');
const C = require('../public/calcdivida.js');
test('juros compostos: simulação e parcela Price batem entre si', () => {
  const p = C.payFor(10000, 2, 24); assert.ok(Math.abs(p - 528.71) < 0.02);
  const s = C.simulate(10000, 2, p); assert.ok(s.months === 24 || s.months === 25);
  assert.equal(C.simulate(1000, 5, 40), null);
  assert.equal(C.simulate(1200, 0, 100).months, 12);
});
test('taxa mensal <-> anual', () => {
  assert.ok(Math.abs(C.annualFromMonthly(1) - 12.6825) < 0.001);
  assert.ok(Math.abs(C.monthlyFromAnnual(C.annualFromMonthly(3.3)) - 3.3) < 1e-9);
});
test('assistente: perguntas, explicações e sugestões', () => {
  const a = C.analyze({ saldo: 5000, juros: 10, parcela: 300 });
  assert.equal(a.cover, false); assert.ok(a.suggestions[0].includes('não cobre'));
  assert.ok(a.questions.some(q => q.id === 'tipo') && a.questions.some(q => q.id === 'renda'));
  const b = C.analyze({ saldo: 5000, juros: 3, parcela: 400, tipo: 'cartao', renda: 1000, extra: 100, jurosInformado: true, alvoMeses: 10 });
  assert.equal(b.cover, true); assert.ok(b.base.months > 0); assert.ok(b.scenarios[0].mine && b.scenarios[0].saveInterest > 0);
  assert.ok(b.suggestions.some(s => /40,0%|40%/.test(s) && /renda/.test(s)));
  assert.ok(b.suggestions.some(s => /rotativo/.test(s))); assert.ok(b.explain.length >= 5); assert.ok(b.target.parcela > 0);
});
test('prioridade: juros mais altos primeiro', () => {
  const p = C.prioritize([{ name: 'A', saldo: 100, juros: 2 }, { name: 'B', saldo: 900, juros: 9 }]);
  assert.equal(p[0].name, 'B');
});
