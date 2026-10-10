// Testes de integridade da leitura de holerites e do armazenamento central.
// Rodar: node --test tests/   (usa PDFs fictícios gerados por tests/make_fixtures.py e o pdf.js real)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs');
const { DI, pdfPages, sha, fx } = require('./helpers');
const ESP = JSON.parse(fs.readFileSync(fx('esperado.json'), 'utf8'));
const brl = v => Math.round(v * 100) / 100;

// "Aplicativo" em memória: um único repositório (state.documents) + o mesmo Ingestor usado no navegador.
function app(opts = {}) {
  const docs = []; let n = 0, fail = new Set(opts.fail || []);
  const ing = DI.createIngestor({
    getDocs: () => docs,
    extractPages: async f => { if (fail.has(f.name) && opts.failTimes-- > 0) throw new Error('falha simulada de leitura'); if (f.noText) return [[]]; return pdfPages(f.path); },
    hashFile: async f => sha(f.path),
    newId: () => 'd' + (++n), now: () => '2026-10-10T10:00:00Z', dateLabel: () => '10/10',
    commit: ch => { if (ch.op === 'add') docs.unshift(ch.entity); if (ch.op === 'replace') { const i = docs.findIndex(d => d.id === ch.id); if (i >= 0) docs[i] = Object.assign({}, ch.entity, { id: ch.id }); } }
  });
  const file = (name, extra) => Object.assign({ name, path: fx(name), size: fs.statSync(fx(name)).size, type: 'application/pdf' }, extra);
  return { docs, ing, file, up: (name, hint, extra) => ing.add([file(name, extra)], hint) };
}
const holerites = docs => docs.filter(d => d.extractedData.payslip);
const liquidoTotal = docs => brl(holerites(docs).reduce((s, d) => s + d.extractedData.payslip.totals.liquido, 0));

test('1. holerite enviado pela categoria correta é lido e validado (valores conferem com o documento)', async () => {
  const a = app(); await a.up('A_holerite_colunas.pdf', 'holerite');
  assert.equal(holerites(a.docs).length, 1);
  const p = a.docs[0].extractedData.payslip, e = ESP.A;
  assert.equal(a.docs[0].extractedData.state, 'done'); assert.ok(p.confidence >= 0.95);
  assert.equal(p.competencia, '2026-09'); assert.equal(p.tipo, 'mensal');
  assert.equal(p.totals.liquido, e.liq); assert.equal(p.totals.venc, e.tv); assert.equal(p.totals.desc, e.td);
  assert.equal(p.bases.fgts, e.bfgts); assert.equal(p.bases.fgtsMes, e.fgts); assert.equal(p.bases.inss, e.binss); assert.equal(p.bases.irrf, e.birrf);
  assert.equal(a.docs[0].amount, e.liq);
  // rubricas: cada uma com o valor impresso, na coluna certa
  const row = d => p.rows.find(r => r.desc.startsWith(d));
  assert.deepEqual([row('SALÁRIO').valor, row('SALÁRIO').kind], [5000, 'provento']);
  assert.deepEqual([row('HORAS EXTRAS').valor, row('HORAS EXTRAS').cat], [450, 'variavel']);
  assert.deepEqual([row('INSS').valor, row('INSS').kind, row('INSS').cat], [609.4, 'desconto', 'inss']);
  assert.equal(row('VALE TRANSPORTE').cat, 'outros');
  // dado sensível minimizado: sem CPF completo nem CNPJ completo guardados
  const raw = JSON.stringify(a.docs[0]);
  assert.ok(!raw.includes('12345678909') && !raw.includes('123.456.789-09') && !raw.includes('12345678000195'));
});

test('2. holerite enviado em "Outros" é reconhecido pelo conteúdo e gera os mesmos dados', async () => {
  const a = app(), b = app(); await a.up('A_holerite_colunas.pdf', 'holerite'); await b.up('A_holerite_colunas.pdf', 'outro');
  assert.equal(b.docs.length, 1); assert.equal(b.docs[0].category, 'holerite');
  assert.equal(b.docs[0].extractedData.classification.kind, 'holerite'); assert.equal(b.docs[0].extractedData.hint, 'outro');
  assert.deepEqual(b.docs[0].extractedData.payslip.totals, a.docs[0].extractedData.payslip.totals);
});

test('2b. a aba/categoria nunca vence o conteúdo (boleto e fatura enviados como "holerite")', async () => {
  const a = app(); await a.up('J_boleto.pdf', 'holerite'); await a.up('K_fatura.pdf', 'holerite');
  assert.deepEqual(a.docs.map(d => d.category).sort(), ['boleto', 'fatura']);
  assert.equal(holerites(a.docs).length, 0);
});

test('3. o mesmo documento enviado por duas abas diferentes não é lido nem somado duas vezes', async () => {
  const a = app(); await a.up('A_holerite_colunas.pdf', 'outro'); await a.up('A_holerite_colunas.pdf', 'holerite');
  assert.equal(a.docs.length, 1); assert.equal(liquidoTotal(a.docs), ESP.A.liq);
  const q = a.ing.queue(); assert.equal(q[1].status, 'duplicado');
});

test('4. holerite com duas vias na mesma página conta uma única vez', async () => {
  const a = app(); await a.up('B_duas_vias_na_pagina.pdf', 'holerite');
  assert.equal(a.docs.length, 1); assert.equal(a.docs[0].extractedData.copies, 2);
  assert.equal(liquidoTotal(a.docs), ESP.A.liq);
  assert.equal(a.docs[0].extractedData.payslip.rows.length, 6, 'rubricas não podem dobrar');
  assert.match(a.ing.queue()[0].msg, /contaram uma única vez/);
});

test('5. PDF com páginas repetidas conta uma única vez', async () => {
  const a = app(); await a.up('C_paginas_repetidas.pdf', 'holerite');
  assert.equal(a.docs.length, 1); assert.deepEqual(a.docs[0].extractedData.pages, [1, 2]); assert.equal(liquidoTotal(a.docs), ESP.A.liq);
});

test('5b. via 2 do mesmo holerite em OUTRO arquivo (bytes diferentes, conteúdo igual) é duplicata', async () => {
  const a = app(); await a.up('A_holerite_colunas.pdf', 'holerite'); await a.up('B_duas_vias_na_pagina.pdf', 'outro');
  assert.equal(a.docs.length, 1); assert.equal(liquidoTotal(a.docs), ESP.A.liq); assert.equal(a.ing.queue()[1].status, 'duplicado');
});

test('6. envio repetido do mesmo arquivo não cria nada novo', async () => {
  const a = app(); for (let i = 0; i < 3; i++) await a.up('A_holerite_colunas.pdf', 'holerite');
  assert.equal(a.docs.length, 1); assert.deepEqual(a.ing.queue().map(q => q.status), ['concluido', 'duplicado', 'duplicado']);
});

test('7. trabalhadores diferentes no mesmo mês são documentos distintos', async () => {
  const a = app(); await a.up('A_holerite_colunas.pdf'); await a.up('L_outro_trabalhador.pdf');
  assert.equal(holerites(a.docs).length, 2); assert.equal(liquidoTotal(a.docs), brl(ESP.A.liq + ESP.L.liq));
});

test('8. meses distintos do mesmo trabalhador ficam separados e alimentam a média corretamente', async () => {
  const a = app(); await a.up('A_holerite_colunas.pdf'); await a.up('F_outubro.pdf');
  assert.equal(holerites(a.docs).length, 2);
  const inp = DI.calcInputs(a.docs);
  assert.equal(inp.count, 2); assert.deepEqual(inp.competencias, ['2026-09', '2026-10']);
  assert.equal(inp.salary, 5000); assert.equal(inp.ultimaCompetencia, '2026-10');
  assert.equal(inp.variaveis, brl(((450 + 90) + (900 + 180)) / 2), 'média = soma das variáveis / nº de MESES (não de arquivos)');
});

test('8b. duas vias + dois arquivos não distorcem a média das variáveis', async () => {
  const a = app(); await a.up('B_duas_vias_na_pagina.pdf'); await a.up('C_paginas_repetidas.pdf'); await a.up('F_outubro.pdf');
  const inp = DI.calcInputs(a.docs); assert.equal(inp.count, 2); assert.equal(inp.variaveis, brl(((450 + 90) + (900 + 180)) / 2));
});

test('9. mesma competência com valores diferentes pede confirmação e nunca elimina sozinho', async () => {
  const a = app(); await a.up('A_holerite_colunas.pdf'); await a.up('G_setembro_corrigido.pdf');
  const q = a.ing.queue()[1]; assert.equal(q.status, 'revisar'); assert.equal(q.pending[0].action, 'conflict');
  assert.equal(holerites(a.docs).length, 1, 'ainda só o original');
  // usuário escolhe "é correção": substitui, sem duplicar
  a.ing.resolve(q.id, 0, 'replace'); assert.equal(holerites(a.docs).length, 1); assert.equal(a.docs[0].extractedData.payslip.totals.liquido, ESP.G.liq);
});

test('9b. conflito resolvido como "complementar" mantém os dois, mas só o mensal entra nos cálculos', async () => {
  const a = app(); await a.up('A_holerite_colunas.pdf'); await a.up('G_setembro_corrigido.pdf');
  a.ing.resolve(a.ing.queue()[1].id, 0, 'keep_both');
  assert.equal(holerites(a.docs).length, 2);
  assert.equal(DI.payslipsForCalc(a.docs).length, 1); assert.equal(DI.calcInputs(a.docs).liquidoUltimo, ESP.A.liq);
});

test('9c. "ignorar" não altera nada', async () => {
  const a = app(); await a.up('A_holerite_colunas.pdf'); await a.up('G_setembro_corrigido.pdf');
  a.ing.resolve(a.ing.queue()[1].id, 0, 'ignore'); assert.equal(holerites(a.docs).length, 1); assert.equal(a.docs[0].extractedData.payslip.totals.liquido, ESP.A.liq);
});

test('10. layout diferente (seções) e tipo diferente (13º) são lidos com validação', async () => {
  const a = app(); await a.up('D_layout_secoes.pdf'); await a.up('E_13o_salario.pdf');
  const d = a.docs.find(x => x.extractedData.payslip.employer.name.startsWith('BETA')).extractedData;
  assert.equal(d.state, 'done'); assert.equal(d.payslip.totals.liquido, 3268.58);
  assert.equal(d.payslip.rows.find(r => r.desc.startsWith('Comiss')).cat, 'variavel');
  assert.equal(d.payslip.rows.find(r => r.desc.startsWith('Empr')).cat, 'consig');
  const e = a.docs.find(x => x.extractedData.payslip.tipo === '13o');
  assert.ok(e, '13º reconhecido como tipo próprio'); assert.equal(DI.payslipsForCalc(a.docs).filter(x => x.extractedData.payslip.tipo === '13o').length, 0, '13º não entra na média mensal');
});

test('11. documento parcial/duvidoso vira "revisar", sem inventar valores e sem entrar nos cálculos', async () => {
  const a = app(); await a.up('H_parcial.pdf', 'holerite');
  const x = a.docs[0].extractedData; assert.equal(x.state, 'needs_review'); assert.ok(x.confidence < 0.5);
  assert.equal(x.payslip.competencia, null); assert.equal(x.payslip.totals.liquido, undefined); assert.equal(a.docs[0].amount, 0);
  assert.ok(x.checks.some(c => !c.ok && c.id === 'liquido'));
  assert.equal(DI.calcInputs(a.docs), null); assert.equal(DI.pendingReview(a.docs), 1);
  // depois de o usuário confirmar, passa a valer
  x.userConfirmed = true; x.payslip.competencia = '2026-09'; assert.equal(DI.calcInputs(a.docs).count, 1);
});

test('11b. PDF digitalizado (sem texto) é guardado para revisão manual, sem leitura fantasma', async () => {
  const a = app(); await a.up('I_digitalizado.pdf', 'holerite');
  assert.equal(a.docs.length, 1); assert.equal(a.docs[0].extractedData.unreadable, true); assert.equal(a.docs[0].status, 'revisar'); assert.equal(a.docs[0].amount, 0);
  await a.up('I_digitalizado.pdf', 'holerite'); assert.equal(a.docs.length, 1, 'reenvio do mesmo arquivo ilegível também não duplica');
});

test('12. falha durante o processamento: erro visível, nova tentativa recupera, sem registros duplicados', async () => {
  const a = app({ fail: ['A_holerite_colunas.pdf'], failTimes: 1 });
  await a.up('A_holerite_colunas.pdf', 'holerite');
  let it = a.ing.queue()[0]; assert.equal(it.status, 'erro'); assert.equal(a.docs.length, 0);
  await a.ing.retry(it.id);
  it = a.ing.queue()[0]; assert.equal(it.status, 'concluido'); assert.equal(a.docs.length, 1);
  await a.ing.retry(it.id); assert.equal(a.docs.length, 1, 'retry de item concluído não faz nada');
});

test('13. vários arquivos de uma vez (inclui repetidos entre si): nenhum valor financeiro contado duas vezes', async () => {
  const a = app(); await a.ing.add(['A_holerite_colunas.pdf', 'B_duas_vias_na_pagina.pdf', 'C_paginas_repetidas.pdf', 'F_outubro.pdf', 'L_outro_trabalhador.pdf', 'A_holerite_colunas.pdf'].map(n => a.file(n)), 'outro');
  assert.equal(holerites(a.docs).length, 3);
  assert.equal(liquidoTotal(a.docs), brl(ESP.A.liq + ESP.F.liq + ESP.L.liq));
  assert.deepEqual(a.ing.queue().map(q => q.status), ['concluido', 'duplicado', 'duplicado', 'concluido', 'concluido', 'duplicado']);
});

test('14. documentos que não são holerite não são classificados como holerite', async () => {
  const a = app(); await a.up('J_boleto.pdf', 'outro'); await a.up('K_fatura.pdf', 'outro');
  assert.equal(holerites(a.docs).length, 0); assert.equal(a.docs.find(d => d.category === 'boleto').amount, 260);
});
