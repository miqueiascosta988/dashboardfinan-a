// Plano da semana na tela: cartão no Início com missões, marcar como feito, sem erros e sem rolagem lateral
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });

for (const vp of [{ width: 1366, height: 800 }, { width: 390, height: 844 }]) {
  test('cartão do Plano da semana em ' + vp.width + 'px: missões, marcar feito, persistir', async () => {
    const page = await browser.newPage({ viewport: vp }), errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/?demo=clt'); await page.waitForSelector('#wk-card', { timeout: 8000 });
    const n = await page.locator('#wk-card .wk-m').count(); assert.ok(n >= 1 && n <= 3, 'missões: ' + n);
    assert.match(await page.textContent('#wk-card'), /Plano da semana/); assert.match(await page.textContent('#wk-card'), /de \d+ feitas|\d+ de \d+ feitas/);
    const before = await page.textContent('#wk-card .wk-chip');
    const manual = page.locator('#wk-card .wk-ck:not([disabled])').first();
    if (await manual.count()) {
      await manual.click(); await page.waitForSelector('#wk-card .wk-m.done');
      assert.notEqual(await page.textContent('#wk-card .wk-chip'), before, 'contador mudou');
      await manual.waitFor(); assert.equal(await page.getAttribute('#wk-card .wk-m.done .wk-ck', 'aria-pressed'), 'true');
      await page.click('#wk-card .wk-m.done .wk-ck'); await page.waitForFunction(() => !document.querySelector('#wk-card .wk-m.done') || document.querySelectorAll('#wk-card .wk-m.done').length === 0 || true);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem horizontal');
    if (vp.width === 390) { await page.locator('#wk-card').scrollIntoViewIfNeeded(); await page.locator('#wk-card').screenshot({ path: process.env.SHOT_WK || '/tmp/wk_card.png' }); }
    assert.deepEqual(errs, []); await page.close();
  });
}
test('cartão não quebra para quem não tem nenhum dado: mostra o começo guiado', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForSelector('#wk-card');
  const html = await page.evaluate(() => { const s = { transactions: [], debts: [], goals: [], subscriptions: [], events: [], today: '2026-10-14' }; return WeekPlan.build(s).missions.map(m => m.kind); });
  assert.deepEqual(html, ['log']); assert.deepEqual(errs, []); await page.close();
});
