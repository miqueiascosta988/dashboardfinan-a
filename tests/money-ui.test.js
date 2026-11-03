// Valores em reais no app de verdade: o que o cliente digita é o que fica salvo e é o que aparece.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });

async function openDemo(vp) {
  const page = await browser.newPage({ viewport: vp || { width: 1366, height: 800 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  // limpa os lançamentos da demonstração para somar só o que o teste lançar
  await page.evaluate(() => { state.transactions = []; renderCurrentTab(); });
  return { page, errs };
}
async function lanca(page, type, date, desc, valor) {
  await page.evaluate(t => openTransactionModal(t), type); await page.waitForSelector('#m-amount');
  await page.fill('#m-date', date); await page.fill('#m-desc', desc); await page.fill('#m-amount', valor);
  await page.click('.btn-save'); await page.waitForTimeout(250);
}

test('o caso da auditoria: digitar 3.200,50 salva R$ 3.200,50 (não R$ 3) e a tela mostra centavos', async () => {
  const { page, errs } = await openDemo(); const m = String(new Date().getMonth() + 1).padStart(2, '0');
  await page.evaluate(() => openTransactionModal('income')); await page.waitForSelector('#m-amount');
  await page.fill('#m-amount', '3.200,50'); await page.waitForTimeout(100);
  assert.match(await page.textContent('#m-amount + .money-hint'), /R\$ 3\.200,50/, 'o cliente vê como o app entendeu antes de salvar');
  await page.fill('#m-date', '05/' + m); await page.fill('#m-desc', 'Salário'); await page.click('.btn-save'); await page.waitForTimeout(250);
  await lanca(page, 'expense', '06/' + m, 'Aluguel', '1500.75');
  const r = await page.evaluate(() => ({ tx: state.transactions.map(t => [t.desc, t.amount]), c: (() => { const c = compute(); return { inc: c.totalIncome, exp: c.totalExpense, res: c.resultado, taxa: c.taxaEconomia }; })() }));
  assert.deepEqual(r.tx, [['Salário', 3200.5], ['Aluguel', 1500.75]]);
  assert.equal(r.c.inc, 3200.5); assert.equal(r.c.exp, 1500.75); assert.equal(r.c.res, 1699.75);
  assert.ok(Math.abs(r.c.taxa - (1699.75 / 3200.5 * 100)) < 1e-9);
  await page.evaluate(() => switchTab('dashboard')); await page.waitForTimeout(400);
  const txt = await page.textContent('#main-content, main, body');
  assert.ok(txt.includes('3.200,50') && txt.includes('1.500,75') && txt.includes('1.699,75'), 'renda, despesa e resultado com centavos');
  assert.deepEqual(errs, []); await page.close();
});

test('valor inválido não vira zero em silêncio: o lançamento não é salvo e o cliente é avisado', async () => {
  const { page } = await openDemo(); const m = String(new Date().getMonth() + 1).padStart(2, '0');
  await page.evaluate(() => openTransactionModal('expense')); await page.waitForSelector('#m-amount');
  await page.fill('#m-date', '05/' + m); await page.fill('#m-desc', 'Teste'); await page.fill('#m-amount', '12a'); await page.click('.btn-save'); await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => state.transactions.length), 0);
  assert.match(await page.textContent('#m-amount + .money-hint'), /Use só números/);
  await page.close();
});

test('data inexistente é recusada (31/02, mês 13)', async () => {
  const { page } = await openDemo();
  for (const d of ['31/02', '10/13', '00/05', 'abc']) {
    await page.evaluate(() => openTransactionModal('expense')); await page.waitForSelector('#m-amount');
    await page.fill('#m-date', d); await page.fill('#m-desc', 'x'); await page.fill('#m-amount', '10'); await page.click('.btn-save'); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => state.transactions.length), 0, d);
    await page.evaluate(() => closeModal()); await page.waitForTimeout(100);
  }
  await page.close();
});

test('lançamento de novembro não entra no mês anterior nem em outros meses (comparativo e período)', async () => {
  const { page } = await openDemo();
  const r = await page.evaluate(() => {
    const out = {}; const y = new Date().getFullYear();
    state.transactions = [{ id: 'a', date: '05/11', desc: 'Salário', cat: 'Trabalho', amount: 1000, type: 'income', recur: false, profile: 'PF' }]; state.profile_type = 'PF'; state.transactions[0].profile = 'ambos';
    selectedPeriod = { month: 10, year: y, startDate: null, endDate: null, mode: 'month' }; out.nov = compute().totalIncome;
    selectedPeriod = { month: 9, year: y, startDate: null, endDate: null, mode: 'month' }; out.out = compute().totalIncome;
    selectedPeriod = { month: 10, year: y, startDate: null, endDate: null, mode: 'month' };
    out.comp = renderComparativo(compute());
    return out;
  });
  assert.equal(r.nov, 1000); assert.equal(r.out, 0, 'outubro não pode somar um lançamento de novembro');
  assert.match(r.comp, /sem dados anteriores/, 'sem outubro, o comparativo diz "sem dados anteriores" e não "0,0%"');
  await page.close();
});

test('nota de saúde: sempre entre 0 e 100; sem dados = "sem dados" (nunca número inventado)', async () => {
  const { page } = await openDemo();
  const r = await page.evaluate(() => {
    const y = new Date().getFullYear(); selectedPeriod = { month: new Date().getMonth(), year: y, startDate: null, endDate: null, mode: 'month' };
    state.debts = []; state.assets = []; state.liabilities = []; state.subscriptions = [];
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const out = {}; state.transactions = []; out.vazio = compute();
    // o cenário da auditoria: renda ínfima e despesa alta
    state.transactions = [{ id: 'i', date: '05/' + mm, desc: 'Salário', cat: 'Trabalho', amount: 3.2, type: 'income', recur: false, profile: 'ambos' }, { id: 'e', date: '06/' + mm, desc: 'Aluguel', cat: 'Moradia', amount: 1500.75, type: 'expense', recur: false, profile: 'ambos' }];
    out.extremo = compute(); return out;
  });
  assert.equal(r.vazio.healthTotal, null); assert.ok(r.vazio.healthItems.every(i => i.na || (i.score >= 0 && i.score <= 100)));
  assert.ok(r.vazio.healthItems.every(i => i.na), 'sem renda nem gastos: tudo "sem dados"');
  assert.ok(r.extremo.healthTotal >= 0 && r.extremo.healthTotal <= 100, 'nota ' + r.extremo.healthTotal);
  for (const i of r.extremo.healthItems) assert.ok(i.score >= 0 && i.score <= 100, i.name + ' ' + i.score);
  await page.close();
});

test('o anel da nota mostra "sem dados" e a Visão Geral não exibe número fora da escala', async () => {
  const { page } = await openDemo();
  await page.evaluate(() => { state.transactions = []; state.debts = []; state.assets = []; renderCurrentTab(); switchTab('saude'); }); await page.waitForTimeout(500);
  const t = await page.textContent('body');
  assert.ok(/sem dados/i.test(t)); assert.ok(!/-\d{2,}\s*\/\s*100/.test(t));
  await page.close();
});
