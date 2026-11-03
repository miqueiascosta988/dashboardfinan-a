const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../public/parcelas.js');
test('detecta vários jeitos de escrever a parcela', () => {
  const d = (s) => { const r = P.detect(s); return r && [r.n, r.m, r.base, r.certeza]; };
  assert.deepEqual(d('Seguro automóvel 2 de 12'), [2, 12, 'Seguro automovel', 'alta']);
  assert.deepEqual(d('SEGURO AUTO PARC 02/12'), [2, 12, 'SEGURO AUTO', 'alta']);
  assert.deepEqual(d('Parcela 3 de 10 Notebook Loja X'), [3, 10, 'Notebook Loja X', 'alta']);
  assert.deepEqual(d('MAGAZINE LUIZA 04/10'), [4, 10, 'MAGAZINE LUIZA', 'media']);
});
test('não confunde compra à vista, data nem números soltos', () => {
  for (const s of ['Mercado Extra', 'Uber 05/11 viagem', 'Posto 13 de 12', 'Compra 1 de 1', 'Loja 00/12', '12/12']) assert.equal(P.detect(s), null, s);
});
test('projeta só o que falta, com dia da fatura, e nunca inventa parcelas anteriores', () => {
  const r = P.ingest(P.emptyStore(), [['2026-09-12', 'Seguro automóvel 2 de 12', 399]], { venc: '2026-09-10', banco: 'Nubank' });
  assert.equal(r.novas, 1);
  const pr = P.project(r.store); assert.equal(pr.length, 10); assert.equal(pr[0].n, 3); assert.equal(pr[0].date, '2026-10-10'); assert.equal(pr[9].n, 12); assert.equal(pr[9].date, '2027-07-10');
  assert.ok(pr.every(x => x.status === 'prevista' && x.valor === 399));
  const h = P.history(r.store); assert.equal(h.paid.length, 1); assert.deepEqual(h.gaps.map(g => g.n), [1]); assert.equal(h.gaps[0].status, 'sem dados');
});
test('mesma parcela em duas faturas não conta duas vezes; fatura mais nova avança a projeção', () => {
  let s = P.ingest(P.emptyStore(), [['2026-09-12', 'Seguro auto 2 de 12', 399]], { venc: '2026-09-10', docId: 'a' }).store;
  const dup = P.ingest(s, [['2026-09-12', 'SEGURO AUTO 02/12', 399]], { venc: '2026-09-10', docId: 'b' });
  assert.equal(dup.repetidas, 1); assert.equal(dup.novas, 0);
  const nw = P.ingest(s, [['2026-10-12', 'Seguro auto 3 de 12', 399]], { venc: '2026-10-10' });
  assert.equal(nw.novas, 1); assert.equal(P.project(nw.store)[0].n, 4);
});
test('fatura mais antiga preenche o histórico sem mexer no que falta', () => {
  let s = P.ingest(P.emptyStore(), [['2026-09-12', 'Seguro auto 5 de 12', 399]], { venc: '2026-09-10' }).store;
  s = P.ingest(s, [['2026-07-12', 'Seguro auto 3 de 12', 399]], { venc: '2026-07-10' }).store;
  const h = P.history(s); assert.deepEqual(h.paid.map(p => p.n), [3, 5]); assert.deepEqual(h.gaps.map(g => g.n), [1, 2, 4]);
  assert.equal(P.project(s)[0].n, 6);
});
test('dia escolhido pelo cliente vale para o cartão; 31 respeita o fim do mês; valores diferentes são compras diferentes', () => {
  let s = P.ingest(P.emptyStore(), [['2026-01-31', 'Notebook 1 de 3', 1000]], { venc: '2026-01-31', banco: 'Itaú' }).store;
  assert.deepEqual(P.project(s).map(x => x.date), ['2026-02-28', '2026-03-31']);
  s = P.setDia(s, 'Itaú', 5); assert.equal(P.project(s)[0].date, '2026-02-05');
  const two = P.ingest(s, [['2026-01-31', 'Notebook 1 de 3', 900]], { venc: '2026-01-31', banco: 'Itaú' });
  assert.equal(two.novas, 1); assert.equal(Object.keys(two.store.plans).length, 2);
});
test('padrão solto pede confirmação', () => {
  const r = P.ingest(P.emptyStore(), [['2026-09-12', 'LOJA ABC 04/10', 50]], { venc: '2026-09-10' });
  assert.equal(r.confirmar.length, 1);
});
