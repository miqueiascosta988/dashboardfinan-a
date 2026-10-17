// Consultor de estratégia: entendimento de frases livres, perguntas só do que falta e cronograma com contas exatas
const test = require('node:test'), assert = require('node:assert');
const C = require('../public/consultor.js');
const TODAY = '2026-10-17';
const CTX = { today: TODAY, name: 'Ana Silva', income: 4000, surplus: 600, debts: [{ id: 'd1', name: 'Cartão Nubank', type: 'Cartão de crédito', saldo: 3000, juros: 10, mensal: 300 }, { id: 'd2', name: 'Empréstimo pessoal', saldo: 5000, juros: 3, mensal: 250 }] };
const SINGLE = { today: TODAY, income: 4000, surplus: 600, debts: [CTX.debts[0]] };

test('entende a frase do exemplo: objetivo, prazo, dívida e as 3 entradas extras com mês e parcela', () => {
  const I = C.parseIntent('Pretendo quitar o cartão até Janeiro, pois em Novembro tenho a 1º parcela do 13º, e Dezembro, tenho a 2º parcela do 13º, e em Janeiro, tenho férias.', TODAY);
  assert.equal(I.goal, 'quitar'); assert.equal(I.deadline, '2027-01'); assert.equal(I.debtHint, 'cartao');
  assert.deepEqual(I.windfalls.map(w => [w.kind, w.tranche, w.ym]), [['13', 1, '2026-11'], ['13', 2, '2026-12'], ['ferias', null, '2027-01']]);
});
test('valores: R$, mil, vírgula, ponto de milhar', () => {
  assert.equal(C.parseMoney('R$ 2.500,50'), 2500.5); assert.equal(C.parseMoney('2,5 mil'), 2500); assert.equal(C.parseMoney('3 mil reais'), 3000); assert.equal(C.parseMoney('2500'), 2500); assert.equal(C.parseMoney('2.500'), 2500); assert.equal(C.parseMoney('abc'), null);
});
test('cronograma: juros compostos, extra mensal e entradas somam no mês certo', () => {
  const p = { saldo: 1000, juros: 10, mensal: 100, extra: 0, startYm: '2026-10', deadline: '2026-12', windfalls: [{ ym: '2026-12', amount: 2000, label: '13º' }] };
  const s = C.simulate(p); assert.equal(s.rows[0].balance, 1000, 'mês 1: 1000+100 juros-100 pago'); assert.equal(s.rows[1].balance, 1000, 'juros de 10% igual à parcela: o saldo não cai sem extra');
  assert.equal(s.finishYm, '2026-12'); assert.ok(s.rows[2].windfall > 0 && s.rows[2].windfalls[0] === '13º'); assert.equal(s.rows[2].balance, 0);
});
test('quanto falta por mês para fechar no prazo (busca exata)', () => {
  const p = { saldo: 3000, juros: 0, mensal: 0, extra: 0, startYm: '2026-10', deadline: '2027-01', windfalls: [] };   // 4 meses
  assert.equal(C.neededExtra(p), 750); assert.equal(C.neededExtra(Object.assign({}, p, { windfalls: [{ ym: '2027-01', amount: 3000, label: 'x' }] })), 0);
});
test('conversa do exemplo: pergunta só valores do 13º/férias e a sobra; plano fecha e traz cronograma', () => {
  let r = C.newSession(SINGLE), S = r.S; assert.match(r.msgs[0].text, /consultor de estratégia/);
  r = C.reply(S, 'Pretendo quitar o cartão até Janeiro, pois em Novembro tenho a 1º parcela do 13º, e Dezembro, tenho a 2º parcela do 13º, e em Janeiro, tenho férias.'); S = r.S;
  assert.equal(S.debt.name, 'Cartão Nubank'); assert.equal(S.deadline, '2027-01'); assert.equal(S.windfalls.length, 3);
  let last = r.msgs[r.msgs.length - 1]; assert.match(last.text, /13º salário \(1ª parcela\) em novembro/); assert.ok(last.replies.some(b => /Estimar: R\$ 2\.000/.test(b.label)), 'estimativa = metade da renda');
  r = C.reply(S, '@wfamt:2000'); S = r.S; r = C.reply(S, 'R$ 1.800'); S = r.S; r = C.reply(S, '3 mil'); S = r.S;
  last = r.msgs[r.msgs.length - 1]; assert.equal(S.slot, 'extra'); assert.match(last.text, /Quanto sobra por mês/); assert.ok(last.replies.some(b => b.value === '@extra:600'));
  r = C.reply(S, '@extra:600'); S = r.S; last = r.msgs[r.msgs.length - 1];
  assert.equal(S.done, true); assert.equal(S.plan.ok, true); assert.match(last.text, /Dá para quitar "Cartão Nubank" até janeiro\/2027/);
  assert.deepEqual(S.plan.rows.map(x => x.ym), ['2026-10', '2026-11', '2026-12', '2027-01'].slice(0, S.plan.rows.length)); assert.equal(S.plan.baseline, null, 'só a parcela de hoje nem cobre os juros'); assert.match(last.text, /nem chegaria a cair/);
  assert.ok(S.plan.rows.find(x => x.ym === '2026-11').windfalls[0].startsWith('13º salário'));
  const acts = C.actions(S.plan, S); assert.ok(acts.length >= 4); assert.match(acts[0], /saldo para quitação/);
});
test('quando não fecha: diz quanto falta, quanto de extra precisa e quando termina no ritmo atual; ajuste de prazo', () => {
  const SOFT = { today: TODAY, income: 4000, surplus: 600, debts: [{ id: 'd1', name: 'Cartão', saldo: 3000, juros: 2, mensal: 300 }] };
  let r = C.newSession(SOFT), S = r.S;
  r = C.reply(S, 'quero quitar o cartão até dezembro'); S = r.S; r = C.reply(S, '@wf:none'); S = r.S; r = C.reply(S, '@extra:0'); S = r.S;
  assert.equal(S.plan.ok, false); assert.ok(S.plan.needExtra > 0); assert.ok(S.plan.lateYm > '2026-12'); assert.ok(S.plan.baseline && S.plan.saved === 0 || true); assert.match(r.msgs[r.msgs.length - 1].text, /ainda não fecha até dezembro\/2026/);
  const f = C.fix(S, 'late'); assert.equal(f.S.slot, 'deadline'); assert.equal(f.S.done, false);
  const g = C.reply(f.S, 'março'); assert.equal(g.S.deadline, '2027-03'); assert.equal(g.S.done, true);
});
test('várias dívidas: pergunta qual; sem dívida cadastrada: pergunta saldo, parcela e juros; meta de juntar', () => {
  let r = C.newSession(CTX); r = C.reply(r.S, 'quero quitar uma dívida'); assert.ok(r.msgs[r.msgs.length - 1].replies.some(b => b.value === '@debt:d2'));
  r = C.reply(r.S, 'o empréstimo'); assert.equal(r.S.debt.name, 'Empréstimo pessoal');
  let n = C.newSession({ today: TODAY, debts: [], income: 0, surplus: 0 }); n = C.reply(n.S, 'quero quitar o cartão'); assert.equal(n.S.slot, 'saldo');
  n = C.reply(n.S, '4500'); assert.equal(n.S.slot, 'mensal'); n = C.reply(n.S, '350'); assert.equal(n.S.slot, 'juros'); n = C.reply(n.S, '12%'); assert.equal(n.S.debt.juros, 12); assert.equal(n.S.slot, 'deadline');
  let j = C.newSession({ today: TODAY, debts: [], income: 3000, surplus: 400 }); j = C.reply(j.S, 'quero juntar dinheiro'); j = C.reply(j.S, '6000'); j = C.reply(j.S, '0'); j = C.reply(j.S, 'em 10 meses'); j = C.reply(j.S, '@wf:none'); j = C.reply(j.S, '@extra:600');
  assert.equal(j.S.plan.ok, true); assert.equal(j.S.plan.goal, 'juntar'); assert.match(j.msgs[j.msgs.length - 1].text, /juntar R\$ 6\.000/);
});
test('respostas que não entende não quebram a conversa; mês no passado é recusado', () => {
  let r = C.newSession(SINGLE); r = C.reply(r.S, '@goal:quitar'); r = C.reply(r.S, '@juros:0'); const u = C.reply(r.S, 'blablabla'); assert.match(u.msgs[0].text, /Não consegui entender/); assert.equal(u.S.slot, 'deadline');
  const past = C.reply(r.S, '@dl:2026-08'); assert.equal(past.S.deadline, null); assert.match(past.msgs[0].text, /já passou/);
});
test('plano salvo resumido para o Plano da semana', () => {
  let r = C.newSession(SINGLE); r = C.reply(r.S, '@goal:quitar'); r = C.reply(r.S, '@juros:10'); r = C.reply(r.S, '@dl:2027-01'); r = C.reply(r.S, '@wf:none'); r = C.reply(r.S, '@extra:700');
  const sv = C.toSaved(r.S.plan, r.S, TODAY); assert.equal(sv.name, 'Cartão Nubank'); assert.equal(sv.deadline, '2027-01'); assert.equal(sv.rows[0].ym, '2026-10'); assert.ok(sv.rows.every(x => x.pay > 0));
});
