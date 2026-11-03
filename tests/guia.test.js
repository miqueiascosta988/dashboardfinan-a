// Guia de primeiros passos: lógica (Node) e tela (navegador, modo demonstração).
const test = require('node:test'), assert = require('node:assert/strict');
const G = require('../public/guia.js');
const ctx0 = { incomes: 0, expenses: 0, docs: 0, debts: 0, goals: 0, budgets: 0 };

test('conta vazia: a primeira etapa pendente é a meta; nada avança sozinho', () => {
  const e = G.evaluate(ctx0, G.initial());
  assert.equal(e.current, 'meta'); assert.equal(e.done, 0); assert.equal(e.finished, false);
});
test('só avança quando a ação existe de verdade', () => {
  let s = G.setGoal(G.initial(), 'ver');
  assert.equal(G.evaluate(ctx0, s).current, 'doc');
  assert.equal(G.evaluate({ ...ctx0, docs: 1 }, s).current, 'renda');
  assert.equal(G.evaluate({ ...ctx0, docs: 1, incomes: 1 }, s).current, 'gastos');
  assert.equal(G.evaluate({ ...ctx0, docs: 1, incomes: 1, expenses: 2 }, s).current, 'gastos', '2 de 3 gastos não conclui');
  assert.equal(G.evaluate({ ...ctx0, docs: 1, incomes: 1, expenses: 3 }, s).current, 'resultado');
});
test('pular deixa a etapa pendente na lista e avança o guia; fazer depois conclui', () => {
  let s = G.markSkipped(G.setGoal(G.initial(), 'ver'), 'doc');
  let e = G.evaluate(ctx0, s);
  assert.equal(e.current, 'renda'); assert.deepEqual(e.skipped, ['doc']);
  e = G.evaluate({ ...ctx0, docs: 1 }, s);
  assert.deepEqual(e.skipped, [], 'cumpriu depois: sai de "puladas"'); assert.equal(e.steps[1].status, 'done');
});
test('próximo passo depende da meta escolhida', () => {
  const all = { ...ctx0, docs: 1, incomes: 1, expenses: 3 };
  let s = G.markAck(G.setGoal(G.initial(), 'dividas'), 'resultado');
  assert.equal(G.evaluate(all, s).current, 'proximo');
  assert.ok(G.evaluate({ ...all, debts: 1 }, s).finished);
  assert.ok(G.evaluate({ ...all, semDividas: true }, s).finished);
  s = G.markAck(G.setGoal(G.initial(), 'juntar'), 'resultado');
  assert.ok(G.evaluate({ ...all, goals: 1 }, s).finished);
});
test('estado salvo é serializável (ida e volta pelo JSON da conta)', () => {
  const s = G.markSkipped(G.setGoal(G.initial(), 'juntar'), 'renda', '2026-01-01T00:00:00Z');
  const back = JSON.parse(JSON.stringify(s));
  assert.deepEqual(G.evaluate(ctx0, back), G.evaluate(ctx0, s));
});
test('meta inválida é ignorada', () => { assert.equal(G.setGoal(G.initial(), 'xx').goal, null); });
