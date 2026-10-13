const test = require('node:test'), assert = require('node:assert/strict'), C = require('../public/cardplan.js');
test('juros real do parcelamento: valor, parcela e prazo → taxa mensal (e inconsistência vira null)', () => {
  const r = C.irr(2900, 382.22, 9); assert.ok(Math.abs(r - 0.03558) < 0.0001);
  assert.equal(C.irr(1000, 50, 10), null); assert.equal(C.irr(1000, 100, 10), 0); assert.equal(C.irr(0, 100, 10), null);
  assert.ok(Math.abs(C.pmt(C.pvOf(100, 0.02, 12), 0.02, 12) - 100) < 1e-9);
});
test('nper: parcela que não cobre os juros nunca quita; com folga, quita no prazo certo', () => {
  assert.equal(C.nper(1000, 0.1, 100), Infinity); assert.equal(C.nper(1000, 0.1, 50), Infinity);
  assert.equal(C.nper(1200, 0, 100), 12); assert.equal(C.nper(1000, 0.02, 100), 12);   // -ln(1-0,2)/ln(1,02) = 11,27 → 12 parcelas
});
test('caso Joãozinho: saldo 5.682,18 já inclui 4x 106,04 e 9x 382,22 → em aberto 1.818,04; saldo que não inclui → total 9.546,32', () => {
  const base = { name: 'Cartão', saldo: 5682.18, juros: 14.5, plans: [{ parcela: 106.04, restantes: 4 }, { parcela: 382.22, restantes: 9 }], renda: 4200, essenciais: 1800, outrasParcelas: 300 };
  const a = C.analyzeCard(Object.assign({ inclui: true }, base)); assert.equal(a.aberto, 1818.04); assert.equal(a.plansMonthly, 488.26); assert.equal(a.plansNominal, 3864.14); assert.equal(a.livre, 1611.74); assert.equal(a.stop, true); assert.equal(a.verdictKind, 'cabe');
  const b = C.analyzeCard(Object.assign({ inclui: false }, base)); assert.equal(b.aberto, 5682.18); assert.equal(b.totalCard, 9546.32);
  assert.ok(a.options.every(o => Math.abs(o.parcela * o.n - o.total) < 0.06));
});
test('saldo menor que os parcelados vira aviso de inconsistência; renda faltando vira pergunta, não número chutado', () => {
  const a = C.analyzeCard({ saldo: 1000, inclui: true, juros: 10, plans: [{ parcela: 300, restantes: 9 }] }); assert.equal(a.inconsistente, true); assert.equal(a.aberto, 0); assert.ok(a.warn.length);
  const b = C.analyzeCard({ saldo: 3000, juros: 10, plans: [] }); assert.equal(b.verdictKind, 'dados'); assert.ok(b.asks.some(x => /renda/.test(x))); assert.equal(b.livre, null);
});
test('parcelar de novo NÃO cabe quando a sobra do mês não comporta nem 24x', () => {
  const a = C.analyzeCard({ saldo: 20000, juros: 14, inclui: true, plans: [], renda: 3000, essenciais: 2400, outrasParcelas: 400, ofertaJuros: 6 });
  assert.equal(a.verdictKind, 'nao_cabe'); assert.match(a.verdict, /NÃO resolve/);
});
test('lista de urgência: atraso > cartão/cheque (juros altos) > demais > parcelamento fixo; cada item traz "por quê" e "como"', () => {
  const u = C.urgency([{ id: 1, name: 'Moto', type: 'Financiamento', saldo: 9000, juros: 1.8, mensal: 600 }, { id: 2, name: 'Cartão', type: 'Cartão', saldo: 1800, juros: 14.5, mensal: 300 }, { id: 3, name: 'Empr', type: 'Empréstimo', saldo: 2000, juros: 5, mensal: 200, overdue: true }, { id: 4, name: 'Parc', type: 'Parcelamento', saldo: 800, juros: 0, mensal: 100, synthetic: true }], { extra: 300 });
  assert.deepEqual(u.map(x => x.name), ['Empr', 'Cartão', 'Moto', 'Parc'].sort((a, b) => u.findIndex(x => x.name === a) - u.findIndex(x => x.name === b)));
  assert.equal(u[0].name, 'Empr'); assert.equal(u[0].level, 'urgente'); assert.equal(u[1].name, 'Cartão'); assert.ok(u.every(x => x.how.length && x.rank));
});
test('expandDebts: cartão com parcelamentos vira saldo em aberto + uma dívida por parcelamento (sem mexer nas demais)', () => {
  const out = C.expandDebts([{ id: 'a', name: 'Cartão', type: 'Cartão', saldo: 5682.18, juros: 14.5, mensal: 0 }, { id: 'b', name: 'Moto', type: 'Financiamento', saldo: 100, mensal: 10 }], { a: { inclui: true, plans: [{ id: 'p1', parcela: 106.04, restantes: 4 }, { id: 'p2', parcela: 382.22, restantes: 9 }] } });
  assert.equal(out.length, 4); assert.equal(out[0].saldo, 1818.04); assert.equal(out[1].id, 'card:a:p1'); assert.equal(out[1].mensal, 106.04); assert.equal(out[3].id, 'b');
});
