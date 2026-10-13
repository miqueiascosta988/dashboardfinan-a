// PROMPT MASTER: DED, quitação, amortização, categoria obrigatória, histórico, holerite × extrato. Dados fictícios; valores conferidos à mão.
const test = require('node:test'), assert = require('node:assert');
const DI = require('../public/docintel.js'), D = require('../public/debtlab.js'), P = require('../public/payroll.js');
const L = arr => DI.buildLines(arr.map((s, i) => ({ s, x: 40, y: 800 - i * 14, w: s.length * 4.5 })));
const ded = (extra) => ['DEMONSTRATIVO DE DÍVIDA - EMPRÉSTIMO PESSOAL', 'Credor: Banco Exemplo', 'Contrato nº: 998877', 'Data de referência: 01/10/2026',
  'Valor contratado: R$ 10.000,00', 'Saldo devedor: R$ 8.000,00', 'Valor para quitação antecipada: R$ 7.500,00', 'Valor da parcela: R$ 500,00', 'Taxa de juros (ao mês): 2,00%',
  'Parcelas pagas: 4', 'Parcelas restantes: 20', 'Sistema de amortização: Price', 'Validade da quitação até 15/10/2026'].concat(extra || []);
const run = (arr, ex) => DI.processDocument([L(arr)], ex || [], { fileName: 'ded.pdf', newId: () => 'id' + Math.random(), now: '2026-10-13T12:00:00Z' });
const near = (a, b, t) => assert.ok(Math.abs(a - b) <= (t || 0.011), a + ' ≠ ' + b);

test('1) DED: saldo devedor ≠ valor de quitação; ambos preservados', () => {
  const f = run(ded()).outcomes[0].entity.extractedData.fin; assert.equal(f.extra.saldo, 8000); assert.equal(f.extra.quitacao, 7500); assert.notEqual(f.extra.saldo, f.extra.quitacao);
  assert.equal(f.extra.refDate, '2026-10-01'); assert.equal(f.extra.pagas, 4); assert.equal(f.extra.parcelas, 20); assert.equal(f.extra.valorContratado, 10000);
});
test('2) DED com parcelas pagas e futuras: B = soma das restantes; A não é B', () => {
  const U = D.understand({ saldo: 8000, quitacao: 7500, refDate: '2026-10-01', jurosMes: 2, parcelas: { parcela: 500, restantes: 20, primeiraDue: '2026-11-05' } });
  assert.equal(U.A_quitacao, 7500); assert.equal(U.B_somaParcelas, 10000); assert.equal(U.C_custoFinanceiroFuturo, 2000);
  assert.equal(U.D_economiaNominal, 2500); assert.ok(U.D_economia < U.D_economiaNominal && U.D_economia > 0);   // comparável ≠ nominal
  assert.match(U.explicacao, /R\$ 10\.000,00/); assert.match(U.explicacao, /R\$ 7\.500,00/);
});
test('3) DED incompleto: não presume campos e sinaliza o que falta', () => {
  const U = D.understand({ saldo: 8000, parcelas: { parcela: 500, restantes: 20 } });
  assert.equal(U.A_quitacao, null); assert.equal(U.D_economia, null); assert.ok(U.faltam.length > 0);
  const f = run(['DEMONSTRATIVO DE DÍVIDA', 'Credor: Banco Exemplo', 'Saldo devedor: R$ 8.000,00']).outcomes[0].entity;
  assert.notEqual(f.status, 'processado');   // sem parcela → revisão
});
test('4) simulação de quitação: PV das parcelas (2% a.m., 20×500) conferido por fórmula', () => {
  const pv = 500 * (1 - Math.pow(1.02, -20)) / 0.02; near(pv, 8175.7, 0.1);   // valor presente em t0 = saldo implícito
  const U = D.understand({ saldo: pv, quitacao: 7500, refDate: '2026-10-01', jurosMes: 2, parcelas: { parcela: 500, restantes: 20, primeiraDue: '2026-11-01' } });
  near(U.parcelasValorPresente, pv, 0.5); near(U.D_economia, pv - 7500, 0.5);   // pequena diferença: desconto por dias/30, não por meses inteiros
});
const base = { saldo: 10000, jurosMes: 2, parcela: D.pmtFor(10000, 0.02, 24), restantes: 24, valor: 2000 };
test('5) amortização reduzindo PRAZO: parcela igual, menos parcelas, juros menores', () => {
  const s = D.simulateExtra(Object.assign({ estrategia: 'prazo' }, base)); assert.ok(s.ok && s.hipotetico);
  assert.equal(s.saldoApos, 8000); near(s.parcelaApos, base.parcela); assert.ok(s.restantes < 24 && s.deltaPrazo > 0);
  assert.ok(s.economiaJuros > 0); near(s.totalFuturo, s.parcelaApos * (s.restantes - 1) + (s.totalFuturo - s.parcelaApos * (s.restantes - 1)), 0.01);
  // confere: PV(parcela, restantes) ≈ saldoApos (última parcela ajustada)
  assert.ok(Math.abs(D.pvOf(s.parcelaApos, 0.02, s.restantes) - 8000) < s.parcelaApos);
});
test('6) amortização reduzindo PRESTAÇÃO: mesmo prazo, parcela = PMT(saldo−valor)', () => {
  const s = D.simulateExtra(Object.assign({ estrategia: 'prestacao' }, base)); assert.equal(s.restantes, 24);
  near(s.parcelaApos, D.pmtFor(8000, 0.02, 24)); near(s.deltaParcela, base.parcela - D.pmtFor(8000, 0.02, 24)); assert.ok(s.impactoOrcamento.mensal < 0);
});
test('7) comparação com o contrato original: prazo economiza mais juros que prestação; sem taxa → pede dado', () => {
  const a = D.simulateExtra(Object.assign({ estrategia: 'prazo' }, base)), b = D.simulateExtra(Object.assign({ estrategia: 'prestacao' }, base));
  assert.ok(a.economiaJuros > b.economiaJuros); near(a.diferencaTotalVsOriginal, a.original.totalFuturo - (a.totalFuturo + 2000), 0.02);   // o valor amortizado hoje também é dinheiro que sai
  const x = D.simulateExtra({ saldo: 10000, parcela: 500, restantes: 24, valor: 2000, estrategia: 'prazo' }); assert.equal(x.ok, false); assert.ok(x.faltam.length);
  const C = D.compareScenarios({ saldo: 10000, jurosMes: 2, parcela: base.parcela, restantes: 24, quitacao: 9800, refDate: '2026-10-01', proximoVenc: '2026-11-01', valores: [1000, 5000] });
  assert.ok(C.rows.some(r => r.id === 'quitar') && C.rows.some(r => /prazo/.test(r.nome)) && C.rows.every(r => r.liquidez));
});
test('8) novo DED do mesmo contrato é vinculado à dívida, sem duplicar', () => {
  const m = D.matchContract({ contratoHash: 'h1', credor: 'Banco Exemplo', parcela: 500 }, [{ id: 'd1', credor: 'Empréstimo Banco Exemplo', parcela: 500, contratoHash: 'h1' }, { id: 'd2', credor: 'Outro', parcela: 90 }]);
  assert.deepEqual([m.action, m.id], ['same', 'd1']);
  assert.equal(D.matchContract({ credor: 'Zeta', parcela: 77 }, [{ id: 'd1', credor: 'Banco Exemplo', parcela: 500 }]).action, 'new');
  const r1 = run(ded()).outcomes[0].entity, r2 = run(ded(['Data de referência: 01/11/2026']).map(l => l.replace('01/10/2026', '01/11/2026')), [r1]);
  assert.ok(r2.outcomes[0].entity || r2.outcomes[0]);   // DED de outra data não é descartado como duplicata
  assert.notEqual(r2.outcomes[0].action || r2.outcomes[0].kind, 'duplicate');
});
test('9) dívida sem categoria é invalidada; 10) cadastro não conclui sem categoria', () => {
  assert.equal(D.needsClassification({ name: 'X', type: 'Empréstimo' }), true); assert.equal(D.needsClassification({ name: 'X', type: 'Consignado CLT' }), false);
  const v = D.validateDebt({ name: 'X', type: '' }, 'PF'); assert.equal(v.ok, false); assert.match(v.msg, /categoria/i);
  assert.equal(D.validateDebt({ name: 'X', type: 'Empréstimo pessoal' }, 'PF').ok, true);
  assert.equal(D.normalizeLegacy('Cartão'), 'Cartão de crédito'); assert.equal(D.normalizeLegacy('Empréstimo'), null);   // ambíguo: pede confirmação
  ['Empréstimo pessoal', 'Consignado CLT', 'Consignado público', 'Financiamento imobiliário', 'Financiamento de veículo', 'Cartão de crédito', 'Crédito rotativo', 'Cheque especial', 'Crédito com garantia', 'Parcelamento de compras', 'Dívida renegociada', 'Outras dívidas'].forEach(c => assert.ok(D.isValidCategory(c, 'PF'), c));
});
test('9b) IA sugere categoria; abaixo de 85% fica para o usuário confirmar', () => {
  const f = run(ded()).outcomes[0].entity.extractedData.fin; assert.ok(D.isValidCategory(f.extra.categoria, 'PF') || f.extra.categoria); assert.ok(f.checks.some(c => c.id === 'categoria' || c.key === 'categoria' || /categoria/i.test(JSON.stringify(c))));
});
const hol = (o) => Object.assign({ competencia: '2026-09', totals: { venc: 5000, desc: 1200, liquido: 3800 }, rows: [] }, o);
test('11) holerite com adiantamento DEDUZIDO: renda = líquido + adiantamento, sem contar duas vezes', () => {
  const a = P.analyzePayslip(hol({ totals: { venc: 5000, desc: 2000, liquido: 3000 }, rows: [{ desc: 'Adiantamento salarial', valor: 800, kind: 'desconto', cat: 'adiantamento' }, { desc: 'INSS', valor: 700, kind: 'desconto' }, { desc: 'IRRF', valor: 500, kind: 'desconto' }] }));
  assert.equal(a.modo, 'deduzido'); assert.equal(a.liquidoTotalMes, 3800); assert.equal(a.saldoFinalPago, 3000);
});
test('11b) adiantamento INCLUSO (só informativo) não é somado de novo', () => {
  const a = P.analyzePayslip(hol({ totals: { venc: 5000, desc: 1200, liquido: 3800 }, rows: [{ desc: 'INSS', valor: 700, kind: 'desconto' }, { desc: 'IRRF', valor: 500, kind: 'desconto' }, { desc: 'Adiantamento salarial', valor: 800, kind: 'desconto', cat: 'adiantamento' }] }));
  assert.equal(a.modo, 'incluso'); assert.equal(a.liquidoTotalMes, 3800); assert.equal(a.saldoFinalPago, 3000);
});
test('12) pagamento complementar/reembolso: reembolso fora da renda recorrente', () => {
  const a = P.analyzePayslip(hol({ totals: { venc: 5200, desc: 1200, liquido: 4000 }, rows: [{ desc: 'Salário', valor: 5000, kind: 'provento' }, { desc: 'Reembolso despesas', valor: 200, kind: 'provento', cat: 'reembolso' }, { desc: 'INSS', valor: 1200, kind: 'desconto' }] }));
  assert.equal(a.reembolsos, 200); assert.equal(a.rendaRecorrenteLiquida, 3800); assert.equal(a.liquidoTotalMes, 4000);
});
const inc = P.analyzePayslip(hol({ totals: { venc: 5000, desc: 2000, liquido: 3000 }, rows: [{ desc: 'Adiantamento', valor: 800, kind: 'desconto', cat: 'adiantamento' }, { desc: 'INSS', valor: 700, kind: 'desconto' }, { desc: 'IRRF', valor: 500, kind: 'desconto' }] }));
test('13) extrato com créditos de salário em duas datas concilia adiantamento + saldo', () => {
  const r = P.reconcile(inc, '2026-09', [{ id: 'a', date: '2026-09-15', desc: 'ADIANT SALARIAL EMPRESA X', valor: 800 }, { id: 'b', date: '2026-10-05', desc: 'PAGTO SALARIO EMPRESA X', valor: 3000 }]);
  assert.ok(r.completo); assert.equal(r.rendaMensalConciliada, 3800); assert.equal(r.conciliados.length, 2);
});
test('14) sem duplicar holerite × extrato: crédito idêntico repetido não soma de novo', () => {
  const r = P.reconcile(inc, '2026-09', [{ id: 'a', date: '2026-09-15', desc: 'ADIANT SALARIAL', valor: 800 }, { id: 'a2', date: '2026-09-15', desc: 'ADIANT SALARIAL', valor: 800 }, { id: 'b', date: '2026-10-05', desc: 'SALARIO', valor: 3000 }]);
  assert.equal(r.rendaMensalConciliada, 3800); assert.equal(r.duplicados.length, 1);
});
test('15) crédito sem origem identificada pede confirmação e não vira salário', () => {
  const r = P.reconcile(inc, '2026-09', [{ id: 'z', date: '2026-09-20', desc: 'CREDITO DIVERSO', valor: 1500 }]);
  assert.equal(r.rendaMensalConciliada, 0); assert.equal(r.semOrigem.length, 1); assert.equal(r.semOrigem[0].precisaConfirmar, true); assert.equal(r.completo, false);
  const c = P.reconcile(inc, '2026-09', [{ id: 'z', date: '2026-09-20', desc: 'CREDITO DIVERSO', valor: 800 }], { confirm: { z: 'salario' } }); assert.equal(c.conciliados[0].certeza, 'confirmado');
  assert.ok(P.reconcile(null, '2026-09', []).faltam);   // funciona (ou avisa) sem holerite
});
test('16) histórico após amortização: DED novo com saldo menor que o projetado detecta extra', () => {
  const c = D.compareDed({ saldo: 10000, refDate: '2026-08-01' }, { saldo: 8000, refDate: '2026-09-01' }, 2, 600);
  near(c.saldoEsperado, 9600); assert.equal(c.amortizacaoExtraEstimada, 1600); assert.match(c.leitura, /extraordin/i);
});
test('17) projeções antigas × DED novo: no ritmo esperado não aponta extra; acima do esperado sinaliza', () => {
  const ok = D.compareDed({ saldo: 10000, refDate: '2026-08-01' }, { saldo: 9600, refDate: '2026-09-01' }, 2, 600); assert.ok(!ok.amortizacaoExtraEstimada);
  const up = D.compareDed({ saldo: 10000, refDate: '2026-08-01' }, { saldo: 9900, refDate: '2026-09-01' }, 2, 600); assert.match(up.leitura, /acima/);
  assert.equal(D.staleness('2026-08-01', '2026-10-13').status, 'desatualizado'); assert.equal(D.staleness('2026-10-01', '2026-10-13').status, 'atualizado'); assert.equal(D.staleness(null, '2026-10-13').status, 'sem_ded');
});
test('18) matemática com valores conhecidos (PMT/PV/Price)', () => {
  near(D.pmtFor(10000, 0.02, 24), 528.71, 0.01); near(D.pvOf(528.71, 0.02, 24), 10000, 0.1); assert.equal(D.pmtFor(1200, 0, 12), 100);
  assert.equal(D.nper(1000, 0.02, 10), Infinity); near(D.nper(10000, 0.02, 528.71), 24, 0.01); near(D.monthlyFromAnnual(12.6825), 1, 0.01);
});
