const test = require('node:test'), assert = require('node:assert');
const A = require('../public/alivio.js');
const near = (a, b, t) => assert.ok(Math.abs(a - b) <= (t || 0.011), a + ' ≠ ' + b);

test('raio-x: taxa informada gera juros, total e custo anual', () => {
  const r = A.raioX({ nome: 'Pessoal', saldo: 8000, jurosMes: 2, parcela: 500, restantes: 20, quitacao: 7500 });
  assert.ok(r.ok); near(r.cetAnual, 26.82, 0.01); assert.ok(r.jurosRestantes > 0); near(r.totalAPagar - r.jurosRestantes, 8000, 1);
  assert.ok(r.pctJuros > 0 && r.pctJuros < 100); assert.equal(r.quitacao, 7500); assert.ok(r.economiaQuitando > 0);
});
test('raio-x: sem taxa deduz a taxa implícita nas parcelas', () => {
  const i = A.impliedRate(10000, 1000, 12); assert.ok(i > 0.02 && i < 0.03); // ~2,9% a.m.
  const r = A.raioX({ saldo: 10000, parcela: 1000, restantes: 12 }); assert.equal(r.origemTaxa, 'implícita nas parcelas'); assert.ok(r.cetAnual > 30);
  near(A.impliedRate(1000, 100, 10), 0, 1e-9);
});
test('raio-x: parcela que não cobre juros avisa; sem dados não quebra', () => {
  assert.ok(A.raioX({ saldo: 10000, jurosMes: 10, parcela: 500, restantes: 24 }).avisos.some(x => /cresce/.test(x)));
  assert.equal(A.raioX({ saldo: 100 }).ok, false); assert.equal(A.raioX({}).ok, false);
});
test('caçador: repetida, sobreposição, parada e aumento', () => {
  const subs = [{ name: 'Netflix', price: 39.9 }, { name: 'Netflix', price: 39.9 }, { name: 'Disney+', price: 33.9 }, { name: 'Spotify', price: 21.9 }, { name: 'Academia X', price: 100 }];
  const txs = [{ desc: 'SPOTIFY', date: '2026-10-01' }, { desc: 'netflix.com', date: '2026-09-20' }, { desc: 'DISNEY PLUS', date: '2026-10-02' }];
  const cob = [{ servico: 'Spotify', valor: 21.9, date: '2026-08-01' }, { servico: 'Spotify', valor: 23.9, date: '2026-09-01' }];
  const r = A.cacador(subs, txs, cob, '2026-10-10'); const t = r.achados.map(a => a.tipo);
  ['repetida', 'sobreposicao', 'parada', 'aumento'].forEach(k => assert.ok(t.includes(k), k));
  near(r.totalMes, 39.9 * 2 + 33.9 + 21.9 + 100, 0.01); near(r.totalAno, r.totalMes * 12, 0.01);
  assert.equal(r.achados.find(a => a.tipo === 'parada').itens[0], 'Academia X');
  near(r.achados.find(a => a.tipo === 'aumento').economiaAno, 24, 0.01);
});
test('caçador: sem lançamentos não acusa "parada"; lista vazia ok', () => {
  assert.ok(!A.cacador([{ name: 'X Y Z', price: 10 }], [], [], '2026-10-10').achados.some(a => a.tipo === 'parada'));
  assert.equal(A.cacador([], [], [], '2026-10-10').totalMes, 0);
});
const D = [
  { id: 'a', name: 'Cartão Roxo', type: 'Crédito rotativo', saldo: 3000, juros: 14, mensal: 300, parcelas: 0 },
  { id: 'b', name: 'Pessoal', type: 'Empréstimo pessoal', saldo: 8000, juros: 4, mensal: 500, parcelas: 20 },
  { id: 'c', name: 'Consig', type: 'Consignado CLT', saldo: 5000, juros: 1.8, mensal: 200, parcelas: 30, folha: true }
];
test('prioridade: maior juros primeiro; folha marcada; extra reduz meses e juros', () => {
  const p = A.prioridade(D, { extra: 400, start: '2026-11-01' });
  assert.deepEqual(p.passos.map(x => x.id), ['a', 'b', 'c']); assert.ok(p.passos[2].folha); assert.ok(p.passos[0].extraVai);
  assert.ok(p.economiaJuros > 0 && p.mesesAntes >= 0);
});
test('roteiros: pula folha, respeita prioridade e usa o valor à vista só onde cabe', () => {
  const r = A.roteiros(D, { vistaDisponivel: 2000, capacidadeMensal: 600 });
  assert.deepEqual(r.roteiros.map(x => x.id), ['a', 'b']);
  assert.equal(r.roteiros[0].modo, 'vista'); near(r.roteiros[0].alvoVista, 1500, 0.01); assert.match(r.roteiros[0].mensagem, /R\$ 1\.500,00/);
  assert.equal(r.roteiros[1].modo, 'parcelar'); assert.equal(r.roteiros[1].parcelaAlvo, null); assert.match(r.roteiros[1].mensagem, /manter o valor da parcela/); assert.ok(A.roteiros(D, { capacidadeMensal: 300 }).roteiros[1].parcelaAlvo > 0); assert.match(r.roteiros[1].mensagem, /CET/); assert.ok(r.avisos.length);
  assert.equal(A.roteiros(D, {}).roteiros.every(x => x.modo === 'parcelar'), true);
});
const HP = { competencia: '2026-08', rows: [{ desc: 'Salário', valor: 5000, kind: 'provento' }, { desc: 'INSS', valor: 500, kind: 'desconto' }, { desc: 'Plano saúde', valor: 200, kind: 'desconto' }, { desc: 'Vale transporte', valor: 150, kind: 'desconto' }], totals: { venc: 5000, desc: 850, liquido: 4150 } };
const HN = { competencia: '2026-09', rows: [{ desc: 'Salário', valor: 5000, kind: 'provento' }, { desc: 'INSS', valor: 500, kind: 'desconto' }, { desc: 'Plano saúde', valor: 320, kind: 'desconto' }, { desc: 'Empréstimo consignado 3/48', valor: 400, kind: 'desconto' }], totals: { venc: 5000, desc: 1220, liquido: 3780 } };
test('auditor de holerite: novo desconto, aumento, item que sumiu, tom neutro', () => {
  const r = A.auditarHolerite(HP, HN), t = r.itens.map(i => i.tipo);
  ['novo', 'subiu', 'sumiu', 'peso_descontos'].forEach(k => assert.ok(t.includes(k), k));
  assert.equal(r.itens[0].gravidade, 'alta'); assert.match(r.resumo, /não afirmam erro/);
  assert.match(A.auditarHolerite(HP, HP).resumo, /Nada fora do padrão/); assert.match(A.auditarHolerite(null, HP).resumo, /dois holerites/);
});
test('progresso: percentual, avanço e recuo por mês; um ponto por dia', () => {
  let s = {}; s = A.registrar(s, 10000, '2026-07-10'); s = A.registrar(s, 9000, '2026-08-10'); s = A.registrar(s, 9500, '2026-09-10'); s = A.registrar(s, 6000, '2026-10-10'); s = A.registrar(s, 6000, '2026-10-10');
  assert.equal(Object.keys(s).length, 4); const p = A.progresso(s, 6000);
  assert.equal(p.inicial, 10000); assert.equal(p.pct, 40); assert.equal(p.mensagem, 'Já quitei 40% das minhas dívidas');
  assert.deepEqual(p.movimentos.map(m => m.tipo), ['avanco', 'recuo', 'avanco']); assert.equal(p.ultimo.tipo, 'avanco');
  assert.equal(A.progresso({}, 0).pct, 0); assert.equal(A.progresso({ '2026-01-01': 100 }, 0).pct, 100);
});
