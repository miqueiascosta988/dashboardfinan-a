const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('Início mostra recorrentes previstos com descrição; cancelar remove só os futuros e preserva o histórico', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    try { localStorage.removeItem(fxKey('rec')); } catch (e) {} PREFS.data = PREFS.data || {}; delete PREFS.data.rec; switchTab('dashboard');
    const txt = () => (document.getElementById('rec-card') || {}).textContent || '';
    const antes = txt(), nTx = state.transactions.length, ids = state.transactions.map(t => t.id).join();
    const k = encodeURIComponent(Recorrentes.keyOf(state.transactions.find(t => t.recur && t.desc === "Aluguel")));
    recCancelarOk(k);
    return { antes, depois: txt(), nTx, nTx2: state.transactions.length, same: ids === state.transactions.map(t => t.id).join(), pr: Recorrentes.project(visibleList('transactions'), recStore(), recHoje()).filter(p => p.desc === "Aluguel").length, k };
  });
  assert.match(r.antes, /Recorrentes previstos \(próximos 12 meses\)/); assert.match(r.antes, /Aluguel/); assert.match(r.antes, /todo dia/); assert.match(r.antes, /prevista, não paga/);
  assert.equal(r.nTx2, r.nTx, 'nenhum lançamento apagado'); assert.ok(r.same); assert.equal(r.pr, 0, 'sem previstos do cancelado');
  assert.match(r.depois, /Canceladas:.*Aluguel/); assert.match(r.depois, /Reativar/);
  await page.evaluate(k => recReativar(k), r.k); await page.waitForTimeout(400);
  const r2 = await page.evaluate(() => { return { c: (document.getElementById('rec-card') || {}).textContent, p: Recorrentes.project(visibleList('transactions'), recStore(), recHoje()).filter(p => p.desc === "Aluguel").length }; });
  assert.equal(r2.p, 12); assert.doesNotMatch(r2.c, /Canceladas:/);
  assert.deepEqual(errs, []); await page.close();
});
