const test = require('node:test'), assert = require('node:assert');
const F = require('../public/finplan.js');
const T = '2026-10-10';
const ev = (o) => F.newEvent(Object.assign({ id: 'e' + Math.random(), kind: 'payable', title: 'Conta', amount: 100, dueDate: '2026-10-15', key: 'k' + Math.random() }, o), T);
const base = (o) => Object.assign({ today: T, events: [], debts: [], monthlyIncome: 5000 }, o);

test('datas: fim de mês preserva âncora', () => {
  assert.equal(F.addMonths('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(F.addMonths('2026-01-31', 2, 31), '2026-03-31');
  assert.equal(F.diffDays('2026-10-10', '2026-10-13'), 3);
  assert.ok(!F.valid('2026-02-30'));
});
test('status: vencido nunca vira pago sozinho', () => {
  assert.equal(F.statusView(ev({ dueDate: '2026-10-01' }), T), 'vencido');
  assert.equal(F.statusView(ev({ dueDate: '2026-10-12' }), T), 'proximo');
  assert.equal(F.statusView(ev({ dueDate: '2026-10-30' }), T), 'a_pagar');
  assert.equal(F.statusView(ev({ status: 'paid' }), T), 'pago');
  assert.equal(F.statusView(ev({ status: 'awaiting' }), T), 'aguardando');
});
test('validação de evento', () => {
  assert.ok(F.validateEvent({ title: '', dueDate: 'x', amount: 0, kind: 'z' }).length === 4);
  assert.equal(F.validateEvent({ title: 'a', dueDate: T, amount: 1, kind: 'income' }).length, 0);
});
test('recorrência: chaves determinísticas (idempotente) e dia 31', () => {
  const a = F.expandRecurring({ title: 's', dueDate: '2026-01-31', amount: 1, kind: 'income' }, 3, 'g1');
  const b = F.expandRecurring({ title: 's', dueDate: '2026-01-31', amount: 1, kind: 'income' }, 3, 'g1');
  assert.deepEqual(a.map(x => x.key), b.map(x => x.key));
  assert.deepEqual(a.map(x => x.dueDate), ['2026-01-31', '2026-02-28', '2026-03-31']);
});
test('simulate: parcela sem juros quita no prazo; total confere', () => {
  const s = F.simulate([{ id: 'd', name: 'D', saldo: 1000, juros: 0, mensal: 250 }], { start: '2026-11-05' });
  assert.equal(s.months, 4); assert.equal(s.totalPaid, 1000); assert.equal(s.endDate, '2027-02-05');
  assert.ok(s.anyUnknownInterest);
});
test('simulate: com juros, total = saldo + juros e extra reduz prazo/juros', () => {
  const d = [{ id: 'd', name: 'D', saldo: 1000, juros: 5, mensal: 150 }];
  const a = F.simulate(d, { start: '2026-11-05' }), b = F.simulate(d, { start: '2026-11-05', extra: 100 });
  assert.ok(Math.abs(a.totalPaid - (1000 + a.totalInterest)) < 0.02);
  assert.ok(b.months < a.months && b.totalInterest < a.totalInterest);
});
test('simulate: parcela menor que juros não quita (unfinished)', () => {
  const s = F.simulate([{ id: 'd', name: 'D', saldo: 1000, juros: 20, mensal: 100 }], { start: '2026-11-05', maxMonths: 24 });
  assert.ok(s.unfinished);
});
test('análise: comprometimento, vencidas, pergunta sem renda', () => {
  const ctx = F.buildContext(base({ monthlyIncome: 0, events: [ev({ dueDate: '2026-10-01', amount: 200 }), ev({ dueDate: '2026-10-20', amount: 300 })] }));
  const a = F.analyze(ctx);
  assert.equal(a.overdue.length, 1); assert.equal(a.committedPct, null);
  assert.ok(a.questions.some(q => q.id === 'renda'));
  const c2 = F.buildContext(base({ events: [ev({ dueDate: '2026-10-20', amount: 2500 })] }));
  assert.equal(F.analyze(c2).committedPct, 50);
});
test('análise: não inventa dados — dívida sem juros/data gera perguntas', () => {
  const ctx = F.buildContext(base({ debts: [{ id: 'x', name: 'Cartão', saldo: 900, mensal: 100 }] }));
  const q = F.analyze(ctx).questions.map(x => x.id);
  assert.ok(q.includes('juros_x') && q.includes('venc_x'));
});
test('déficit com saldo inicial', () => {
  const ctx = F.buildContext(base({ openingBalance: 100, events: [ev({ dueDate: '2026-10-12', amount: 500 })] }));
  assert.equal(F.analyze(ctx).deficits.length, 1);
});
test('plano C sem proposta não é viável (não presume renegociação)', () => {
  const ctx = F.buildContext(base({ debts: [{ id: 'x', name: 'C', saldo: 900, juros: 4, mensal: 100 }] }));
  const C = F.generatePlans(ctx).plans.find(p => p.id === 'C');
  assert.equal(C.feasible, false);
});
test('plano A: extra vai para a maior taxa e economiza juros', () => {
  const ctx = F.buildContext(base({ monthlyIncome: 4000, avgEssential: 2000, debts: [{ id: 'a', name: 'A', saldo: 2000, juros: 2, mensal: 200 }, { id: 'b', name: 'B', saldo: 2000, juros: 9, mensal: 200 }] }));
  const r = F.generatePlans(ctx), A = r.plans.find(p => p.id === 'A');
  assert.ok(A.feasible); assert.equal(A.metrics.extraMonthly, 1600);
  assert.ok(A.metrics.savedInterest >= 0);
});
test('plano D: reserva maior que a folga é inviável', () => {
  const ctx = F.buildContext(base({ monthlyIncome: 2500, avgEssential: 2000, reserveMonthly: 800, debts: [{ id: 'a', name: 'A', saldo: 1000, juros: 2, mensal: 200 }] }));
  assert.equal(F.generatePlans(ctx).plans.find(p => p.id === 'D').feasible, false);
});
test('plano B só move vencimentos marcados como alteráveis', () => {
  const inc = ev({ kind: 'income', title: 'Salário', dueDate: '2026-10-20', amount: 3000 });
  const m = ev({ dueDate: '2026-10-12', amount: 100, movable: true, title: 'Internet' }), f = ev({ dueDate: '2026-10-13', amount: 100, title: 'Água' });
  const B = F.generatePlans(F.buildContext(base({ events: [inc, m, f] }))).plans.find(p => p.id === 'B');
  assert.equal(B.payments.length, 1); assert.equal(B.payments[0].name, 'Internet');
});
test('plano → eventos: idempotente e sem apagar pago', () => {
  const ctx = F.buildContext(base({ monthlyIncome: 4000, avgEssential: 2000, debts: [{ id: 'a', name: 'A', saldo: 9000, juros: 2, mensal: 200 }] }));
  const A = F.generatePlans(ctx).plans.find(p => p.id === 'A'), evs = F.planToEvents(A, 'P1').map((e, i) => F.newEvent(Object.assign({ id: 'n' + i }, e), T));
  assert.ok(evs.length > 0 && new Set(evs.map(e => e.key)).size === evs.length);
  const again = F.reconcilePlan(evs, F.planToEvents(A, 'P1'), null);
  assert.equal(again.create.length, 0); assert.equal(again.skip.length, evs.length);
  evs[0] = F.markPaid(evs[0], { date: T }, T).event;
  const sw = F.reconcilePlan(evs, [], 'P1');
  assert.equal(sw.keepPaid.length, 1); assert.equal(sw.cancel.length, evs.length - 1);
  evs[1].userEdited = true; assert.equal(F.reconcilePlan(evs, [], 'P1').conflicts.length, 1);
});
test('pagamento: histórico, idempotência e efeito na dívida', () => {
  const e = ev({}), p = F.markPaid(e, { date: T, amount: 90 }, T);
  assert.equal(p.event.status, 'paid'); assert.equal(p.event.paidAmount, 90); assert.equal(p.event.history.length, 2);
  assert.equal(F.markPaid(p.event, { date: T }, T).changed, false);
  const d = F.debtAfterPayment({ saldo: 1000, juros: 5, parcelas: 10 }, 150);
  assert.equal(d.saldo, 900); assert.equal(d.interestPart, 50); assert.equal(d.parcelas, 9);
});
test('lembretes: no dia, antes, atraso; pago não lembra', () => {
  const es = [ev({ dueDate: T, title: 'Hoje' }), ev({ dueDate: '2026-10-11', title: 'Amanhã' }), ev({ dueDate: '2026-10-13', title: 'Em3' }), ev({ dueDate: '2026-10-05', title: 'Atraso' }), ev({ dueDate: T, status: 'paid' })];
  const r = F.dueReminders(es, T, [1]);
  assert.deepEqual(r.map(x => x.event.title), ['Atraso', 'Hoje', 'Amanhã']);
});
test('conversa: usa dados reais e não inventa', () => {
  const ctx = F.buildContext(base({ events: [ev({ kind: 'income', dueDate: '2026-10-20', amount: 3000, title: 'Salário' }), ev({ dueDate: '2026-10-15', amount: 400, title: 'Luz' })] }));
  assert.match(F.answer('quais contas vencem antes de eu receber?', ctx).text, /Luz/);
  assert.match(F.answer('parcelar em 12x', F.buildContext(base({ debts: [{ id: 'x', name: 'Cartão', saldo: 900, mensal: 100 }] }))).text, /taxa|valor da parcela/);
  assert.match(F.answer('blablabla', ctx).text, /Ainda não sei/);
});
