// Contratos de crédito (CCB/consignado/financiamento), amortização e tabela de evolução (DED). Dados 100% fictícios.
const test = require('node:test'), assert = require('node:assert');
const DI = require('../public/docintel.js');
const L = arr => DI.buildLines(arr.map((s, i) => ({ s, x: 40, y: 800 - i * 14, w: s.length * 4.5 })));
const CCB = [
  'CÉDULA DE CRÉDITO BANCÁRIO', 'CRÉDITO DO TRABALHADOR', 'Contrato nº: 123456789 Data: 23/01/2026', '1.CREDOR',
  'Banco Exemplo Crédito, Financiamento e Investimento S.A., sociedade por ações, com sede em Vitória',
  'a. Valor Liberado ao Cliente: R$ 1427,99 g. Vencimento da Última Parcela: 20/03/2028', 'b. Valor Total do Empréstimo: R$ 2701,92 h. Seguro: R$ 0,00',
  'd. Quantidade de Parcelas: 24 i. IOF: R$ 45,61', 'e. Valor das Parcelas: R$ 112,58 j. Taxa de Juros (ao mês): 4.66%', 'f. Vencimento da Primeira Parcela: 20/04/2026 k. Taxa de Juros (ao ano): 72.66%',
  'l. Custo Efetivo Total (ao mês): 4.94% m. Custo Efetivo Total (ao ano): 78.3%',
  '10) Outorgo ao Credor garantia de cessão fiduciária de 10% (dez por cento) do saldo da minha conta vinculada no FGTS',
  '6) Autorizo o desconto em folha de pagamento. Declaro vínculo empregatício, admissão e salário líquido, vencimentos e descontos.',
  '12.2) juros de mora de 1% (um por cento) ao mês e multa convencional de 2% (dois por cento)'];
const run = (arr, now) => DI.processDocument([L(arr)], [], { fileName: 'contrato.pdf', newId: () => 'id1', now: now || '2026-10-13T12:00:00Z' });
test('CCB/consignado NÃO é confundido com holerite e sai pronto (sem revisar)', () => {
  const r = run(CCB), e = r.outcomes[0].entity, f = e.extractedData.fin;
  assert.equal(r.classification.kind, 'emprestimo'); assert.equal(e.status, 'processado'); assert.equal(f.direction, 'debt');
  assert.equal(f.extra.parcela, 112.58); assert.equal(f.extra.parcelasTotal, 24); assert.equal(f.extra.parcelas, 18); assert.equal(f.extra.juros, 4.66); assert.equal(f.extra.diaVenc, 20);
  assert.equal(f.extra.liberado, 1427.99); assert.equal(f.extra.tipoOperacao, 'consignado'); assert.equal(f.counterparty, 'Banco Exemplo');
  assert.ok(f.extra.saldo > 1300 && f.extra.saldo < 1400 && f.extra.saldoEstimado);
  assert.ok(f.notes.some(n => /10% do saldo do FGTS/.test(n)));
});
test('parcela × quantidade que não bate com o total vai para revisão', () => {
  const bad = CCB.map(l => l.replace('R$ 2701,92', 'R$ 3200,00')); const e = run(bad).outcomes[0].entity;
  assert.equal(e.status, 'revisar');
});
test('amortização: juros + amortização = parcela e o saldo fecha em zero', () => {
  const a = DI.amortize(1000, 2, 111.35, 10);
  assert.equal(a.primeira.juros, 20); assert.equal(a.primeira.parcela, 111.35); assert.ok(Math.abs(a.primeira.amort - 91.35) < 0.01);
  assert.equal(a.rows[a.rows.length - 1].saldo, 0); assert.ok(Math.abs(a.pagoTotal - (a.jurosTotal + a.amortTotal)) < 0.01);
  assert.equal(DI.amortize(1000, 5, 40, 12).naoCobre, true);   // parcela menor que os juros: dívida cresce
});
test('tabela de evolução da dívida (DED) é lida com juros e amortização do próprio documento', () => {
  const items = []; const hdr = [['Nº', 40], ['Vencimento', 80], ['Parcela', 170], ['Juros', 260], ['Amortização', 340], ['Saldo devedor', 440]];
  const mk = (arr, y) => arr.forEach(([s, x]) => items.push({ s, x, y, w: s.length * 4.5 }));
  items.push({ s: 'DEMONSTRATIVO DE EVOLUÇÃO DA DÍVIDA', x: 40, y: 800, w: 150 }); mk(hdr, 780);
  const rows = [['1', '20/08/2026', '100,00', '10,00', '90,00', '910,00'], ['2', '20/11/2026', '100,00', '9,10', '90,90', '819,10'], ['3', '20/12/2026', '100,00', '8,19', '91,81', '727,29'], ['4', '20/01/2027', '100,00', '7,27', '92,73', '634,56']];
  rows.forEach((r, i) => mk(r.map((v, j) => [v, hdr[j][1]]), 760 - i * 14));
  const r = DI.processDocument([DI.buildLines(items)], [], { fileName: 'ded.pdf', newId: () => 'd1', now: '2026-10-13T12:00:00Z' }), f = r.outcomes[0].entity.extractedData.fin;
  assert.equal(r.classification.kind, 'emprestimo'); assert.equal(f.extra.parcelas, 3); assert.equal(f.extra.saldo, 910); assert.equal(f.extra.jurosProxima, 9.1); assert.equal(f.extra.amortProxima, 90.9); assert.equal(f.extra.fromSchedule, true);
});
test('holerite com adiantamento salarial: o desconto vira categoria própria (não "outros")', () => {
  assert.equal(DI.classifyRow('Adiantamento Salarial').cat, 'adiantamento');
  assert.equal(DI.classifyRow('ADIANT. SALARIAL').cat, 'adiantamento');
  assert.equal(DI.classifyRow('Adiantamento 13º Salário').cat, 'ignorar');   // 13º continua ignorado
  assert.equal(DI.classifyRow('Vale transporte').cat, 'outros');
});
