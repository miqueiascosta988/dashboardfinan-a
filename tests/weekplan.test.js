// Plano da semana: lógica pura (missões, contagem de meses, semana ISO, datas)
const test = require('node:test'), assert = require('node:assert');
const W = require('../public/weekplan.js');
const TODAY = '2026-10-14'; // quarta-feira

test('semana: segunda a domingo, chave ISO estável na virada de ano', () => {
  const r = W.weekRange('2026-10-14'); assert.equal(r.start, '2026-10-12'); assert.equal(r.end, '2026-10-18'); assert.equal(r.key, '2026-W42');
  assert.equal(W.weekRange('2026-10-18').key, '2026-W42'); assert.equal(W.weekRange('2026-10-19').key, '2026-W43');
  assert.equal(W.weekRange('2027-01-01').key, '2026-W53'); assert.equal(W.weekRange('2024-12-30').key, '2025-W01');
});
test('datas: ISO do banco e dd/mm digitado no app', () => {
  assert.equal(W.txISO('2026-10-03', TODAY), '2026-10-03'); assert.equal(W.txISO('3/10', TODAY), '2026-10-03'); assert.equal(W.txISO('03/10/2025', TODAY), '2025-10-03');
  assert.equal(W.txISO('20/12', '2026-01-05'), '2025-12-20', 'dezembro digitado em janeiro é do ano anterior'); assert.equal(W.txISO('xx', TODAY), null);
});
test('meses para quitar: com juros, sem juros, e parcela que não cobre os juros', () => {
  assert.equal(W.monthsToPay({ saldo: 1200, juros: 0, mensal: 100 }), 12);
  const m = W.monthsToPay({ saldo: 1000, juros: 5, mensal: 100 }); assert.ok(m > 13 && m < 16, 'm=' + m);
  assert.equal(W.monthsToPay({ saldo: 1000, juros: 10, mensal: 90 }), null); assert.equal(W.monthsToPay({ saldo: 500, juros: 3, mensal: 0 }), null); assert.equal(W.monthsToPay({ saldo: 0, mensal: 0 }), 0);
});
test('missões: sem dados nenhum, só o começo guiado', () => {
  const p = W.build({ today: TODAY }); assert.equal(p.missions.length, 1); assert.equal(p.missions[0].kind, 'log'); assert.match(p.missions[0].title, /Comece por aqui/); assert.equal(p.empty, true); assert.equal(p.freedom, null);
});
test('missões: dívida mais cara primeiro, gasto 10% abaixo da média, no máximo 3', () => {
  const tx = ['2026-10-08', '2026-10-01', '2026-09-24', '2026-09-17'].map(date => ({ date, cat: 'Alimentação', amount: 400, type: 'expense' }));   // 4 semanas anteriores
  tx.push({ date: '2026-10-13', cat: 'Alimentação', amount: 70, type: 'expense' }, { date: '2026-09-20', cat: 'Moradia', amount: 1500, type: 'expense' });
  const p = W.build({ today: TODAY, transactions: tx, debts: [{ name: 'Cartão', saldo: 2000, juros: 12, mensal: 300 }, { name: 'Loja', saldo: 500, juros: 4, mensal: 100 }],
    subscriptions: [{ name: 'Streaming', price: 40 }], goals: [{ name: 'Reserva', target: 1000, current: 100, monthly: 200 }] });
  assert.ok(p.missions.length <= 3); assert.equal(p.missions[0].kind, 'debt'); assert.match(p.missions[0].title, /Cartão/); assert.match(p.missions[0].why, /12% ao mês/);
  const s = p.missions.find(m => m.kind === 'spend'); assert.ok(s, 'missão de gasto'); assert.equal(s.ref, 'Alimentação'); assert.equal(s.target, 360); assert.equal(s.spent, 70); assert.equal(s.status, 'ok');
  assert.ok(!p.missions.some(m => m.ref === 'Moradia'), 'despesa fixa não vira corte');
  assert.ok(p.freedom && p.freedom.months > 0 && p.freedom.total === 2500);
});
test('gasto acima do limite muda o status; poucos lançamentos pedem registro; vencimentos da semana', () => {
  const tx = [{ date: '2026-09-20', cat: 'Lazer', amount: 400, type: 'expense' }, { date: '2026-10-13', cat: 'Lazer', amount: 200, type: 'expense' }];
  const p = W.build({ today: TODAY, transactions: tx, events: [
    { kind: 'payable', status: 'pending', title: 'Luz', amount: 150, dueDate: '2026-10-16' }, { kind: 'payable', status: 'pending', title: 'Água', amount: 80, dueDate: '2026-10-10' },
    { kind: 'payable', status: 'paid', title: 'Net', amount: 99, dueDate: '2026-10-15' }, { kind: 'payable', status: 'pending', title: 'Futuro', amount: 1, dueDate: '2026-10-30' }] });
  assert.equal(p.missions.find(m => m.kind === 'spend').status, 'over'); assert.ok(p.missions.some(m => m.kind === 'log'));
  assert.deepEqual(p.payables.map(x => x.title), ['Água', 'Luz']); assert.equal(p.payables[0].late, true);
});
test('dívida sem juros informados: menor primeiro; parcela que não cobre juros vira aviso', () => {
  const a = W.build({ today: TODAY, debts: [{ name: 'A', saldo: 900, juros: 0, mensal: 100 }, { name: 'B', saldo: 300, juros: 0, mensal: 50 }] }); assert.match(a.missions[0].title, /"B"/); assert.equal(a.freedom.months, 9);
  const b = W.build({ today: TODAY, debts: [{ name: 'Rotativo', saldo: 1000, juros: 14, mensal: 100 }] }); assert.equal(b.freedom.months, null); assert.deepEqual(b.freedom.stuck, ['Rotativo']);
});
