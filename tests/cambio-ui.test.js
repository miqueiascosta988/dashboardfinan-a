const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
const rates = { BRL: 5, EUR: 0.9, GBP: 0.8, JPY: 150, ARS: 1000, AED: 3.67, MXN: 18, USD: 1 };
test.before(async () => {
  srv = http.createServer((q, r) => {
    if (q.url.startsWith('/api/cambio')) { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ base: 'USD', rates, date: '2026-10-17', source: { name: 'ExchangeRate-API', url: 'https://www.exchangerate-api.com' }, fetchedAt: new Date().toISOString() })); }
    const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('câmbio: todas as moedas, conversão, busca e fonte visível', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForSelector('#nav');
  await page.evaluate(() => { window.isPlusUser = () => true; switchTab('cambio'); });
  await page.waitForSelector('#cur-tbl'); await page.waitForSelector('#cambio-fonte');
  assert.match(await page.textContent('#cambio-fonte'), /ExchangeRate-API[\s\S]*17\/10\/2026[\s\S]*todos os dias/);
  assert.ok(await page.locator('#conv-to option[value="AED"]').count());
  await page.selectOption('#conv-from', 'USD'); await page.selectOption('#conv-to', 'AED'); await page.fill('#conv-val', '10');
  assert.match(await page.textContent('#conv-result'), /36,70/);
  await page.fill('#cur-q', 'aed'); assert.equal(await page.locator('#cur-tbl tr:visible').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(errs, []);
});
