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
  test('calculadora de dívidas em ' + vp.width + 'px: calcula, sugere, pergunta e explica', async () => {
    const page = await browser.newPage({ viewport: vp }), errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/?demo=clt'); await page.waitForSelector('#nav');
    await page.evaluate(() => switchTab('calcdivida')); await page.waitForSelector('#cd-saldo');
    await page.fill('#cd-saldo', '5000'); await page.fill('#cd-juros', '3'); await page.fill('#cd-parcela', '400');
    assert.match(await page.textContent('#cd-out'), /Quita em[\s\S]*Total de juros/);
    assert.match(await page.textContent('#cd-out'), /Sugestões do assistente/);
    assert.ok(await page.locator('#cd-out details').count() >= 4);
    await page.locator('#cd-out .cd-q[data-q="tipo"] .cd-chip:has-text("Cartão")').evaluate(el => el.click());
    assert.match(await page.textContent('#cd-out'), /rotativo/);
    await page.fill('#cd-parcela', '100');
    assert.match(await page.textContent('#cd-out'), /não cobre/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errs, []);
  });
}
