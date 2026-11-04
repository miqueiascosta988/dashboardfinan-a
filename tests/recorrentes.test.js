const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../public/recorrentes.js');
const HOJE = '2026-11-04';
const alug = (d) => ({ type: 'expense', desc: 'Aluguel', cat: 'Moradia', amount: 1850, recur: true, date: d });
const txs = [alug('2026-10-01'), alug('2026-11-01'), { type: 'expense', desc: 'Mercado', cat: 'Alimentação', amount: 300, recur: false, date: '2026-11-03' }, { type: 'income', desc: 'Salário', cat: 'Trabalho', amount: 5000, recur: true, date: '2026-11-05' }];

test('gera exatamente 12 meses por série recorrente; avulso não gera', () => {
  const p = R.project(txs, null, HOJE), a = p.filter(x => x.desc === 'Aluguel'), s = p.filter(x => x.desc === 'Salário');
  assert.equal(a.length, 12); assert.equal(a[0].date, '2026-12-01'); assert.equal(a[11].date, '2027-11-01');
  assert.equal(s.length, 12); assert.equal(s[0].date, '2026-12-05', 'novembro já tem o lançamento real do salário, então o primeiro previsto é dezembro');
});
test('mês que já tem lançamento real não vira previsto; avulso nunca vira série', () => {
  const p = R.project(txs, null, HOJE); assert.ok(!p.some(x => x.desc === 'Mercado'));
  assert.ok(!p.some(x => x.desc === 'Aluguel' && x.date.startsWith('2026-11')));
});
test('dia 31 respeita o fim do mês e o valor vem do último lançamento', () => {
  const t = [{ type: 'expense', desc: 'Internet', cat: 'Casa', amount: 90, recur: true, date: '2026-10-31' }, { type: 'expense', desc: 'Internet', cat: 'Casa', amount: 110, recur: true, date: '2026-11-30' }];
  const p = R.project(t, null, HOJE); assert.equal(p[0].valor, 110); assert.equal(p.find(x => x.date.startsWith('2027-02')).date, '2027-02-28');
});
test('cancelar tira só os futuros e não toca em nenhum lançamento; reativar volta', () => {
  const antes = JSON.stringify(txs), k = R.keyOf(txs[0]), st = R.cancel(null, k, HOJE);
  const p = R.project(txs, st, HOJE); assert.equal(p.filter(x => x.desc === 'Aluguel').length, 0); assert.equal(p.filter(x => x.desc === 'Salário').length, 12, 'outras séries seguem');
  assert.equal(JSON.stringify(txs), antes, 'histórico intocado');
  assert.equal(R.series(txs, st, HOJE).find(x => x.key === k).cancelada, true);
  assert.equal(R.project(txs, R.resume(st, k), HOJE).filter(x => x.desc === 'Aluguel').length, 12);
});
test('lançamento recorrente novo depois do cancelamento reativa a série', () => {
  const k = R.keyOf(txs[0]), st = R.cancel(null, k, '2026-11-04'), novo = txs.concat([alug('2026-12-01')]);
  assert.equal(R.series(novo, st, '2026-12-02').find(x => x.key === k).cancelada, false);
});
test('datas DD/MM usam o ano de hoje; lançamento inválido ou valor zero é ignorado', () => {
  const t = [{ type: 'expense', desc: 'Academia', cat: 'Saúde', amount: 99, recur: true, date: '15/10' }, { type: 'expense', desc: 'X', cat: 'Y', amount: 0, recur: true, date: '2026-10-01' }, { type: 'expense', desc: 'Z', cat: 'Y', amount: 5, recur: true, date: 'abc' }];
  const p = R.project(t, null, HOJE); assert.equal(p.length, 12); assert.equal(p[0].desc, 'Academia'); assert.equal(p[0].date, '2026-11-15');
});
