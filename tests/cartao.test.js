// Cartão parcelado: cadastro com parcelamentos de fatura, plano realista, lista de urgência e integração com o resto do app.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http');
const test = require('node:test'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json' };
let server, base, browser;
test.before(async () => {
  server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
  await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });
async function openApp() {
  const ctx = await browser.newContext(), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.abort());
  await page.goto(base + '/index.html?demo=clt'); await page.waitForFunction(() => typeof startDemo === 'function' && typeof CardPlan === 'object' && document.getElementById('app-screen') && !document.getElementById('app-screen').hidden, null, { timeout: 15000 });
  await page.evaluate(() => { window.AG_TODAY = '2026-10-12'; state.debts = []; state.finEvents = []; state.monthlyIncome = 4200; state.transactions = [{ id: 't1', type: 'income', amount: 4200, date: '2026-10-05', category: 'Salário' }, { id: 't2', type: 'expense', amount: 1800, date: '2026-10-03', category: 'Moradia' }]; });
  return { page, errs, ctx };
}
const fill = async (page) => {
  await page.evaluate(() => switchTab('dividas')); await page.evaluate(() => openDebtModal());
  await page.fill('#m-dname', 'Cartão Joãozinho'); await page.selectOption('#m-dtype', 'Cartão'); await page.dispatchEvent('#m-dtype', 'change');
  await page.fill('#m-dsaldo', '5682.18'); await page.fill('#m-djuros', '14.5'); await page.fill('#m-dmensal', '0');
  assert.equal(await page.isVisible('#m-card-box'), true);
  await page.click('text=+ Adicionar parcelamento'); await page.click('text=+ Adicionar parcelamento');
  const rows = await page.$$('#m-cplans .cp-row');
  await rows[0].$eval('.cp-parcela', (e, v) => e.value = v, '106.04'); await rows[0].$eval('.cp-rest', (e, v) => e.value = v, '4'); await rows[0].$eval('.cp-total', (e, v) => e.value = v, '4');
  await rows[1].$eval('.cp-parcela', (e, v) => e.value = v, '382.22'); await rows[1].$eval('.cp-rest', (e, v) => e.value = v, '9'); await rows[1].$eval('.cp-total', (e, v) => e.value = v, '9'); await rows[1].$eval('.cp-valor', (e, v) => e.value = v, '2900');
  await page.evaluate(() => saveDebt(null));
  await page.waitForFunction(() => state.debts.length === 1);
};
test('caso Joãozinho: cadastra o cartão com 2 parcelamentos de fatura; o plano mostra o saldo em aberto, juros real, veredito e quando parar de usar o cartão', async () => {
  const { page, errs, ctx } = await openApp(); await fill(page);
  await page.evaluate(() => switchTab('resolver'));
  const t = await page.textContent('#main');
  assert.match(t, /Plano para o Cartão Joãozinho/); assert.match(t, /Em aberto/); assert.match(t, /1\.818,04/);      // 5.682,18 − (4×106,04 + 9×382,22)
  assert.match(t, /3,56% a\.m\./);                                                                                  // juros real do parcelamento de 9x (valor 2.900)
  assert.match(t, /Parcelar de novo\?/); assert.match(t, /Hora de parar de usar o cartão/); assert.match(t, /Passo a passo/);
  assert.match(t, /Lista de urgência/);
  assert.match(t, /Parcelamento da fatura — Cartão Joãozinho/);                                                    // cada parcelamento vira item da lista
  assert.deepEqual(errs, []); await ctx.close();
});
test('os parcelamentos de fatura entram nos totais, na simulação de quitação e na Agenda; trocar a opção "o saldo já inclui" muda o saldo em aberto', async () => {
  const { page, errs, ctx } = await openApp(); await fill(page);
  const r = await page.evaluate(() => {
    const exp = debtsExpanded(), c = compute();
    const a1 = dpDebts().map(d => [d.name.slice(0, 22), Math.round(d.saldo)]);
    const ag = agInputs().debts.length;
    cardsLoad()[state.debts[0].id].inclui = false; const exp2 = debtsExpanded();
    return { n: exp.length, month: Math.round(c.totalDebtMonthly * 100) / 100, aberto1: exp[0].saldo, aberto2: exp2[0].saldo, sim: a1.length, ag };
  });
  assert.equal(r.n, 3); assert.equal(r.aberto1, 1818.04); assert.equal(r.aberto2, 5682.18); assert.equal(r.sim, 3); assert.equal(r.ag, 3);
  assert.equal(r.month, 488.26);                                                                                   // 106,04 + 382,22 (mensal do cartão = 0)
  assert.deepEqual(errs, []); await ctx.close();
});
test('lista de urgência: dívida vencida vai para o topo; cartão e cheque especial antes de financiamento; excluir o cartão apaga os parcelamentos', async () => {
  const { page, errs, ctx } = await openApp(); await fill(page);
  const r = await page.evaluate(() => {
    state.debts.push({ id: 'd2', name: 'Moto', type: 'Financiamento', saldo: 9000, juros: 1.8, mensal: 600, parcelas: 20, profile: state.profile_type }, { id: 'd3', name: 'Cheque', type: 'Empréstimo', saldo: 2000, juros: 5, mensal: 200, parcelas: 12, profile: state.profile_type });
    state.finEvents = [{ id: 'e1', key: 'k', kind: 'payable', title: 'Empréstimo', category: 'Dívidas', amount: 200, dueDate: '2026-10-01', status: 'pending', priority: 'essential', origin: 'manual', sourceRef: 'd3', remindDays: [1], version: 1, history: [] }];
    switchTab('resolver'); const txt = document.getElementById('main').textContent;
    return { order: [...txt.matchAll(/(\d)\. (Cheque|Moto|Cartão Joãozinho|Parcelamento da fatura[^·]*)/g)].map(m => m[1] + m[2].slice(0, 12)) };
  });
  assert.match(r.order[0], /^1Cheque/); assert.ok(r.order.findIndex(x => /Moto/.test(x)) > r.order.findIndex(x => /Cartão/.test(x)));
  await page.evaluate(() => deleteDebt(state.debts[0].id)); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => Object.keys(cardsMap()).length), 0);
  assert.deepEqual(errs, []); await ctx.close();
});

test('cenário completo (consignado + cartão + financiamento): a lista prioriza, explica como atacar e monta o plano mês a mês com o valor extra', async () => {
  const { page, errs, ctx } = await openApp();
  const r = await page.evaluate(() => {
    const pr = state.profile_type; state.debts = [
      { id: 'c', name: 'Consignado Banco X', type: 'Empréstimo', saldo: 12000, juros: 1.9, mensal: 480, parcelas: 36, profile: pr },
      { id: 'k', name: 'Cartão Nubank', type: 'Cartão', saldo: 3200, juros: 14.5, mensal: 300, parcelas: 0, profile: pr },
      { id: 'f', name: 'Financiamento do carro', type: 'Financiamento', saldo: 28000, juros: 1.4, mensal: 950, parcelas: 40, profile: pr }];
    FX.dpl.extra = 300; switchTab('resolver'); const t = document.getElementById('main').textContent;
    return { order: [...t.matchAll(/(\d)\. (Cartão Nubank|Consignado Banco X|Financiamento do carro)/g)].map(m => m[2]), ataque: /Plano de ataque/.test(t), cobre: /NÃO cobre os juros/.test(t), meses: (t.match(/quitada no mês (\d+)/g) || []).length, folha: /desconto em folha/.test(t) };
  });
  assert.deepEqual(r.order.slice(0, 3), ['Cartão Nubank', 'Consignado Banco X', 'Financiamento do carro']);
  assert.ok(r.ataque && r.cobre && r.folha); assert.equal(r.meses, 3);
  assert.deepEqual(errs, []); await ctx.close();
});
