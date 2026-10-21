// Orçamento com balança e receitas recebidas; meta sem campo de emoji
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port;
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('orçamento: balança, receitas recebidas sem meta e despesas por categoria', async () => {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    selectedPeriod = { mode: 'all' }; state.transactions = [
      { id: 'a', type: 'income', cat: 'Trabalho', amount: 5000, date: '2026-10-05', desc: 'Salário', profile: 'PF' }, { id: 'b', type: 'income', cat: 'Extra', amount: 1000, date: '2026-10-10', desc: 'Freela', profile: 'PF' },
      { id: 'c', type: 'expense', cat: 'Moradia', amount: 2000, date: '2026-10-06', desc: 'Aluguel', profile: 'PF' }];
    const wrap = document.createElement('div'); wrap.innerHTML = renderOrcamento(wrap);
    return { txt: wrap.innerText || wrap.textContent, svg: !!wrap.querySelector('svg') };
  });
  assert.ok(r.svg); assert.match(r.txt, /Balança do período/); assert.match(r.txt, /Receitas recebidas/); assert.match(r.txt, /Trabalho/); assert.match(r.txt, /Extra/); assert.match(r.txt, /Sobrou/); assert.match(r.txt, /Moradia/);
  assert.doesNotMatch(r.txt, /meta de recebimento/i);
  const g = await page.evaluate(() => { const w = document.createElement('div'); w.innerHTML = renderOrcamento(w).replace(/<svg[\s\S]*?<\/svg>/, ''); return 1; });
  await page.close();
});
test('balança: inclina para o lado maior e avisa quando faltou', async () => {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ sobra: balancaHtml(5000, 3000), falta: balancaHtml(1000, 3000), igual: balancaHtml(2000, 2000), vazio: balancaHtml(0, 0) }));
  assert.match(r.sobra, /rotate\(-/); assert.match(r.sobra, /Sobrou/); assert.match(r.falta, /rotate\([0-9]/); assert.match(r.falta, /Faltou/); assert.match(r.igual, /equilíbrio/); assert.match(r.vazio, /Sem lançamentos/);
  await page.close();
});
test('meta: o formulário não tem mais o campo de emoji e salva com ícone padrão', async () => {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => { window.checkPlanLimit = () => true; state.goals = []; openGoalModal(); const hasEmoji = !!document.getElementById('m-icon') || /Emoji/.test(document.getElementById('modal-body').innerText);
    document.getElementById('m-gname').value = 'Reserva'; document.getElementById('m-target').value = '1000'; await saveGoal(null); return { hasEmoji, icon: state.goals[0] && state.goals[0].icon, n: state.goals.length }; });
  assert.equal(r.hasEmoji, false); assert.equal(r.n, 1); assert.ok(r.icon);
  await page.close();
});
