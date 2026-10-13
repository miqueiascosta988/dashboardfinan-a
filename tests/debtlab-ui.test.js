// Tela: categoria obrigatória, modal "Entenda e simule", vínculo de DED ao mesmo contrato (sem duplicar), renda holerite × extrato.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http');
const test = require('node:test'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', 'public'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json' };
let server, base, browser;
test.before(async () => {
  server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]), f = path.join(ROOT, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });
async function openApp() {
  const ctx = await browser.newContext(), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.abort());
  await page.goto(base + '/index.html?demo=clt'); await page.waitForFunction(() => typeof startDemo === 'function' && typeof DebtLab === 'object' && typeof Payroll === 'object' && document.getElementById('app-screen') && !document.getElementById('app-screen').classList.contains('hidden'), null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.AG_TODAY = '2026-10-13'; state.debts = []; state.documents = []; state.transactions = []; });
  return { page, errs, ctx };
}
test('cadastro de dívida NÃO conclui sem categoria e conclui com categoria', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => switchTab('dividas')); await page.evaluate(() => openDebtModal());
  await page.fill('#m-dname', 'Empréstimo Banco X'); await page.fill('#m-dsaldo', '8000'); await page.fill('#m-djuros', '2'); await page.fill('#m-dmensal', '500');
  await page.evaluate(() => saveDebt(null)); assert.equal(await page.evaluate(() => state.debts.length), 0, 'sem categoria não salva');
  await page.selectOption('#m-dtype', 'Empréstimo pessoal'); await page.evaluate(() => saveDebt(null));
  await page.waitForFunction(() => state.debts.length === 1); assert.equal(await page.evaluate(() => state.debts[0].type), 'Empréstimo pessoal');
  assert.deepEqual(errs, []); await ctx.close();
});
test('modal Entender/Simular mostra A, B, C, D e o simulador hipotético', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => { state.debts = [{ id: 'dx', name: 'Empréstimo Banco X', type: 'Empréstimo pessoal', saldo: 10000, juros: 2, parcelas: 24, mensal: DebtLab.pmtFor(10000, 0.02, 24), profile: 'PF' }]; switchTab('dividas'); openDebtLab('dx'); });
  const t = await page.evaluate(() => document.querySelector('.modal, #modal, [class*=modal]').innerText);
  for (const k of ['Saldo para quitação antecipada', 'Soma das parcelas restantes', 'Custo financeiro futuro', 'Economia potencial', 'HIPOTÉTICO', 'Amortizar R$ 5.000,00', 'reduzir prazo', 'reduzir parcela', 'Premissas']) assert.ok(t.includes(k), 'falta: ' + k);
  await page.fill('#dlab-valor', '1234.56'); await page.evaluate(() => dlabRun()); assert.ok((await page.innerText('#dlab-out')).includes('1.234,56'));
  assert.deepEqual(errs, []); await ctx.close();
});
test('DED do mesmo contrato é vinculado à dívida existente e não duplica; DED antigo não sobrescreve o novo', async () => {
  const { page, errs, ctx } = await openApp();
  const r = await page.evaluate(() => {
    state.debts = [{ id: 'dx', name: 'Empréstimo Banco X', type: 'Empréstimo pessoal', saldo: 9000, juros: 2, parcelas: 22, mensal: 500, profile: 'PF', dedRef: '2026-09-01' }];
    const mk = (id, ref, saldo) => ({ id, name: 'ded', extractedData: { state: 'done', userConfirmed: true, fin: { direction: 'debt', kind: 'emprestimo', counterparty: 'Banco X', extra: { saldo, parcela: 500, parcelas: 20, juros: 2, refDate: ref, categoria: 'Empréstimo pessoal', categoriaConf: 0.9, contratoHash: null } } } });
    const d1 = mk('n1', '2026-10-01', 8000), d2 = mk('o1', '2026-08-01', 9500); state.documents.push(d1, d2);
    syncDocTransactionCore(d1); const pend = !!d1.extractedData.dedPending, nAntes = state.debts.length; dedLinkChoose('n1', 'dx'); const afterNew = state.debts[0].saldo; syncDocTransactionCore(d2); dedLinkChoose('o1', 'dx');
    return { pend, nAntes, n: state.debts.length, afterNew, final: state.debts[0].saldo, linked: d1.extractedData.debtId, ref: state.debts[0].dedRef };
  });
  assert.equal(r.pend, true); assert.equal(r.nAntes, 1); assert.equal(r.n, 1); assert.equal(r.linked, 'dx'); assert.equal(r.afterNew, 8000); assert.equal(r.final, 8000); assert.equal(r.ref, '2026-10-01');
  assert.deepEqual(errs, []); await ctx.close();
});
test('documento de dívida sem categoria confiável NÃO cadastra até o usuário confirmar', async () => {
  const { page, ctx } = await openApp();
  const r = await page.evaluate(() => {
    const d = { id: 'q1', name: 'ded', extractedData: { state: 'done', userConfirmed: true, fin: { direction: 'debt', kind: 'emprestimo', counterparty: 'Banco Y', extra: { saldo: 5000, parcela: 300, parcelas: 20, juros: 2, categoria: 'Empréstimo pessoal', categoriaConf: 0.4 } } } };
    state.documents.push(d); syncDocTransactionCore(d); const antes = state.debts.length, flag = d.extractedData.needsCategory;
    d.extractedData.fin.extra.categoriaConfirmada = true; syncDocTransactionCore(d); return { antes, flag, depois: state.debts.length, tipo: state.debts[0] && state.debts[0].type };
  });
  assert.equal(r.antes, 0); assert.equal(r.flag, true); assert.equal(r.depois, 1); assert.equal(r.tipo, 'Empréstimo pessoal'); await ctx.close();
});
test('holerite com adiantamento: receita do mês = líquido + adiantamento; card concilia com extrato sem duplicar', async () => {
  const { page, errs, ctx } = await openApp();
  const r = await page.evaluate(() => {
    const p = { competencia: '2026-09', tipo: 'mensal', totals: { venc: 5000, desc: 2000, liquido: 3000 }, rows: [{ desc: 'Adiantamento', valor: 800, kind: 'desconto', cat: 'adiantamento' }, { desc: 'INSS', valor: 700, kind: 'desconto' }, { desc: 'IRRF', valor: 500, kind: 'desconto' }] };
    const d = { id: 'h1', name: 'Holerite 09/2026', extractedData: { state: 'done', userConfirmed: true, payslip: p } }; state.documents.push(d);
    state.transactions.push({ id: 'e1', type: 'income', amount: 800, date: '2026-09-15', desc: 'ADIANT SALARIAL', cat: 'Trabalho' }, { id: 'e2', type: 'income', amount: 800, date: '2026-09-15', desc: 'ADIANT SALARIAL', cat: 'Trabalho' }, { id: 'e3', type: 'income', amount: 3000, date: '2026-10-05', desc: 'SALARIO', cat: 'Trabalho' });
    const ev = docEvent(d); const html = payrollCard(); return { amount: ev.amount, html };
  });
  assert.equal(r.amount, 3800); assert.ok(/Conciliada/.test(r.html) && /3\.800/.test(r.html) && /não foi somado de novo/.test(r.html));
  assert.deepEqual(errs, []); await ctx.close();
});
test('agenda: adiantamento deduzido gera adiantamento + saldo final (soma = renda do mês, sem contar duas vezes)', async () => {
  const { page, errs, ctx } = await openApp();
  const r = await page.evaluate(() => {
    state.finEvents = [];
    const p = { competencia: '2026-09', tipo: 'mensal', totals: { venc: 5000, desc: 2000, liquido: 3000 }, rows: [{ desc: 'Adiantamento', valor: 800, kind: 'desconto', cat: 'adiantamento' }, { desc: 'INSS', valor: 700, kind: 'desconto' }, { desc: 'IRRF', valor: 500, kind: 'desconto' }] };
    const d = { id: 'h2', name: 'Holerite', extractedData: { state: 'done', userConfirmed: true, payslip: p } }; state.documents.push(d); agendaFromDoc(d);
    return (state.finEvents || []).filter(e => /^doc:h2:(0|adv)$/.test(e.key)).map(e => [e.key, e.amount]);
  });
  assert.deepEqual(r.sort(), [['doc:h2:0', 3000], ['doc:h2:adv', 800]]); assert.deepEqual(errs, []); await ctx.close();
});
test('modal de vínculo: mostra documento e dívida, "cadastrar nova" cria dívida separada', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => {
    state.debts = [{ id: 'dx', name: 'Empréstimo Banco X', type: 'Empréstimo pessoal', saldo: 9000, juros: 2, parcelas: 22, mensal: 500, profile: 'PF' }];
    const d = { id: 'm1', name: 'ded', extractedData: { state: 'done', userConfirmed: true, fin: { direction: 'debt', kind: 'emprestimo', counterparty: 'Banco X', extra: { saldo: 8000, parcela: 500, parcelas: 20, juros: 2, categoria: 'Empréstimo pessoal', categoriaConf: 0.9 } } } };
    state.documents.push(d); syncDocTransactionCore(d);
  });
  await page.waitForSelector('text=É a mesma dívida, vincular'); const t = await page.evaluate(() => document.body.innerText);
  assert.ok(t.includes('Documento enviado') && t.includes('Empréstimo Banco X') && t.includes('É outra dívida, cadastrar nova'));
  await page.click('text=É outra dívida, cadastrar nova'); await page.waitForFunction(() => state.debts.length === 2);
  assert.equal(await page.evaluate(() => state.documents.find(z => z.id === 'm1').extractedData.dedPending), undefined); assert.deepEqual(errs, []); await ctx.close();
});
test('consignado: card avisa "descontada em folha", KPI separa o valor e a agenda não cria saída de caixa', async () => {
  const { page, errs, ctx } = await openApp();
  const r = await page.evaluate(() => {
    state.finEvents = []; state.debts = [{ id: 'cg', name: 'Consignado Banco X', type: 'Consignado CLT', saldo: 4000, juros: 2, parcelas: 12, mensal: 400, profile: 'PF' }];
    const d = { id: 'k1', name: 'ctr', extractedData: { state: 'done', userConfirmed: true, debtId: 'cg', debtOwned: false, fin: { direction: 'debt', kind: 'emprestimo', counterparty: 'Banco X', extra: { saldo: 4000, parcela: 400, parcelas: 12, juros: 2, diaVenc: 20, categoria: 'Consignado CLT', categoriaConf: 1 } } } };
    state.documents.push(d); agendaFromDoc(d); switchTab('dividas');
    return { ev: (state.finEvents || []).filter(e => /^doc:k1:d/.test(e.key) && e.status !== 'cancelled').length, txt: document.body.innerText };
  });
  assert.equal(r.ev, 0); assert.ok(/descontada em folha/.test(r.txt), 'card'); assert.ok(/já descontado em folha/i.test(r.txt), 'kpi: ' + r.txt.slice(0, 600)); assert.deepEqual(errs, []); await ctx.close();
});
test('card de renda mostra o consignado do holerite, confere com a dívida e avisa quando não há extrato', async () => {
  const { page, errs, ctx } = await openApp();
  const html = await page.evaluate(() => {
    state.debts = [{ id: 'cg', name: 'Consignado Banco X', type: 'Consignado CLT', saldo: 9000, juros: 2, parcelas: 12, mensal: 1354, profile: 'PF' }];
    const p = { competencia: '2026-09', tipo: 'mensal', totals: { venc: 4252, desc: 1904, liquido: 2348 }, rows: [{ desc: 'INSS', valor: 390, kind: 'desconto', cat: 'inss' }, { desc: 'IRRF', valor: 160, kind: 'desconto', cat: 'irrf' }, { desc: 'EMPRESTIMO CONSIGNADO', valor: 1354, kind: 'desconto', cat: 'consig' }] };
    state.documents.push({ id: 'h9', name: 'Holerite', extractedData: { state: 'done', userConfirmed: true, payslip: p } }); return payrollCard().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  });
  assert.ok(/Descontos em folha/.test(html) && /consignado R\$ 1\.354/.test(html), html); assert.ok(/Confere com a dívida "Consignado Banco X"/.test(html)); assert.ok(/Nenhum extrato ou entrada lançada/.test(html)); assert.ok(!/Nenhum crédito com esse valor/.test(html)); assert.deepEqual(errs, []); await ctx.close();
});
