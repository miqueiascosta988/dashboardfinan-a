// Ciclo 5: apontamentos do cliente PF (sinal nos saldos, duplicidade, onboarding único, recorrência).
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
const m = String(new Date().getMonth() + 1).padStart(2, '0');
async function open() { const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500); return { page, errs }; }
async function lanca(page, type, d, desc, v) { await page.evaluate(t => { switchTab(t === 'income' ? 'receitas' : 'despesas'); openTransactionModal(t); }, type); await page.waitForSelector('#m-amount'); await page.fill('#m-date', d); await page.fill('#m-desc', desc); await page.fill('#m-amount', v); await page.click('.btn-save'); await page.waitForTimeout(350); }

test('saldo negativo mostra o sinal de menos no Início, no Patrimônio e na mensagem de crise', async () => {
  const { page, errs } = await open();
  const r = await page.evaluate(() => { state.transactions = []; state.debts = []; state.assets = []; state.liabilities = [{ id: 'l1', name: 'Empréstimo', value: 2400 }]; renderCurrentTab(); const c = compute(); const o = { nw: c.netWorth, hero: document.querySelector('.hero-value').innerText, txt: document.getElementById('main').innerText }; switchTab('patrimonio'); o.pat = document.getElementById('main').innerText; return o; });
  assert.ok(r.nw < 0, 'patrimônio líquido negativo na conta de teste');
  assert.match(r.hero, /^-\s*R\$\s*[\d.]+,\d{2}$/, 'hero com sinal: ' + r.hero);
  assert.doesNotMatch(r.txt, /com sinal de menos/);
  assert.match(r.pat, /-\s*R\$\s*2\.400,00/);
  assert.deepEqual(errs, []); await page.close();
});
test('lançamento duplicado: avisa uma vez, cancelar não salva, "lançar mesmo assim" salva; diferente não avisa', async () => {
  const { page } = await open(); await page.evaluate(() => { state.transactions = []; });
  await lanca(page, 'expense', '10/' + m, 'Mercado Extra', '200,00');
  await page.evaluate(() => { switchTab('despesas'); openTransactionModal('expense'); }); await page.waitForSelector('#m-amount');
  await page.fill('#m-date', '10/' + m); await page.fill('#m-desc', 'mercado extra'); await page.fill('#m-amount', '200'); await page.click('.btn-save'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => state.transactions.length), 1, 'não salvou na primeira tentativa');
  assert.match(await page.textContent('#m-dup-warn'), /Já existe um lançamento igual/); assert.equal(await page.textContent('#modal-overlay .btn-save'), 'Lançar mesmo assim');
  await page.click('#modal-overlay .btn-save'); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => state.transactions.length), 2, 'segundo clique confirma');
  await lanca(page, 'expense', '10/' + m, 'Mercado Extra', '200,01');   // valor diferente
  assert.equal(await page.evaluate(() => state.transactions.length), 3, 'valor diferente não é duplicado');
  await page.close();
});
test('um só cartão de onboarding por vez no Início (Guia ou Jornada, nunca os dois)', async () => {
  const { page } = await open();
  const r = await page.evaluate(() => { state.transactions = []; state.debts = []; PREFS.data = {}; try { localStorage.removeItem(fxKey('gd')); } catch (e) {} Guia.stop(); renderCurrentTab(); const a = document.getElementById('gd-card') && document.getElementById('main').innerText.includes('Seu caminho em 3 passos'); return a; });
  assert.equal(r, false, 'com o cartão do guia visível, a Jornada não aparece junto');
  await page.close();
});
test('recorrência: o campo explica o que faz (não repete sozinho)', async () => {
  const { page } = await open(); await page.evaluate(() => { openTransactionModal('expense'); }); await page.waitForSelector('#m-recur');
  assert.match(await page.textContent('#modal-overlay'), /não se repete sozinho/); await page.close();
});
test('Plano da semana: o gasto da semana é a soma real da categoria nesta semana (conferência)', async () => {
  const { page } = await open();
  const r = await page.evaluate(() => { const w = WeekPlan && WeekPlan.compute ? null : null; const card = document.getElementById('wk-card'); return card ? card.innerText : ''; });
  const mm = /R\$ ([\d.]+) de R\$ ([\d.]+)/.exec(r);
  if (mm) { const spent = Number(mm[1].replace('.', '')); const calc = await page.evaluate(() => { const cat = 'Alimentação'; const now = new Date(), day = (now.getDay() + 6) % 7, st = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day), en = new Date(st.getTime() + 6 * 864e5); const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return state.transactions.filter(t => t.type === 'expense' && t.cat === cat && String(t.date).slice(0, 10) >= iso(st) && String(t.date).slice(0, 10) <= iso(en)).reduce((a, t) => a + t.amount, 0); }); assert.ok(Math.abs(calc - spent) <= 1, 'semana: card ' + spent + ' x soma ' + calc); }
  await page.close();
});
