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
test('lançamento novo: data nasce com hoje e valor vazio ou zero não salva', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const out = {}; window.showToast = function (m) { out.toast = m; };
    openTransactionModal('expense');
    const n = new Date(); out.data = document.getElementById('m-date').value; out.hoje = String(n.getDate()).padStart(2, '0') + '/' + String(n.getMonth() + 1).padStart(2, '0');
    const antes = state.transactions.length;
    await saveTransaction('expense'); out.vazio = state.transactions.length - antes; out.toastVazio = out.toast;
    document.getElementById('m-amount').value = '0'; await saveTransaction('expense'); out.zero = state.transactions.length - antes;
    return out;
  });
  assert.equal(r.data, r.hoje); assert.equal(r.vazio, 0); assert.equal(r.zero, 0); assert.match(r.toastVazio, /maior que zero/);
  assert.deepEqual(errs, []); await page.close();
});
test('leitor de PDF vem do próprio site, sem CDN', async () => {
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  assert.ok(!/jsdelivr[^"']*pdfjs/.test(html)); assert.match(html, /\/pdfjs\/pdf\.min\.js/); assert.match(html, /\/pdfjs\/pdf\.worker\.min\.js/);
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => typeof window.pdfjsLib), 'object'); await page.close();
});
