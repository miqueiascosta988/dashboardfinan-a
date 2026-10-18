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
  test('jornada em ' + vp.width + 'px: card no Início, guia e mostra diagnóstico', async () => {
    const page = await browser.newPage({ viewport: vp }), errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/?demo=clt'); await page.waitForSelector('#jr-card');
    assert.match(await page.textContent('#jr-card'), /Seu caminho em 3 passos/);
    assert.ok(await page.locator('#jr-card [data-jr-diag], #jr-card [data-jr]').count());
    await page.evaluate(() => { state.transactions = []; state.debts = []; renderCurrentTab(); });
    assert.match(await page.textContent('#jr-card'), /Passo 1 de 3/);
    await page.click('#jr-card [data-jr="dividas"] .jr-b.sec');
    assert.match(await page.textContent('#jr-card'), /Passo 1 de 3/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errs, []);
  });
}
