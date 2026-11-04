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
test('Basic: 60 lançamentos/mês e 1 importação de extrato por mês; Free segue bloqueado', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const out = {}; out.limBasic = PLAN_LIMITS_BY_PLAN.basic.maxTransactionsPerMonth; out.limFree = PLAN_LIMITS_BY_PLAN.free.maxTransactionsPerMonth;
    let plano = 'basic'; window.planoEfetivo = function () { return plano; }; window.canImportFree = function () { return false; };
    window.ofGetAccounts = function () { return []; }; out.basicNovo = importLiberado();
    window.ofGetAccounts = function () { return [{ lastImport: new Date().toISOString() }]; }; out.basicUsou = importLiberado();
    window.ofGetAccounts = function () { return [{ lastImport: '2020-01-05T10:00:00Z' }]; }; out.basicMesPassado = importLiberado();
    plano = 'free'; window.ofGetAccounts = function () { return []; }; out.free = importLiberado();
    return out;
  });
  assert.equal(r.limBasic, 60); assert.equal(r.limFree, 15);
  assert.equal(r.basicNovo, true); assert.equal(r.basicUsou, false); assert.equal(r.basicMesPassado, true); assert.equal(r.free, false);
  assert.deepEqual(errs, []); await page.close();
});
