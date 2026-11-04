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
test('Free novo: libera 3 documentos em 48 h; depois volta o limite de 1 por mês; conta nova mostra o aviso', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    DEMO.on = false; profile = { plan: 'free' }; state.documents = []; PREFS.data = PREFS.data || {}; delete PREFS.data.bonus; try { localStorage.removeItem(fxKey('bonus')); } catch (e) {}
    const out = {}; window.showToast = function (m) { out.toast = m; }; window.switchTab = function () {};
    currentUser = { id: 'u1', created_at: new Date(Date.now() - 5 * 3600000).toISOString() };
    out.planoFree = planoEfetivo(); out.banner = bonusBannerHtml();
    const seq = [];
    for (let i = 0; i < 4; i++) { const ok = docLimitOk('limite'); seq.push(ok); if (ok) { state.documents.unshift({ id: 'd' + i, date: new Date().toISOString().slice(0, 10) }); bonusUsar(); } }
    out.seq = seq; out.n = bonusStore().n; out.bannerDepois = bonusBannerHtml();
    // conta antiga: sem bônus, vale o limite de 1 por mês
    state.documents = []; delete PREFS.data.bonus; try { localStorage.removeItem(fxKey('bonus')); } catch (e) {}
    currentUser = { id: 'u2', created_at: new Date(Date.now() - 60 * 3600000).toISOString() };
    out.antiga = [docLimitOk('limite')]; state.documents.unshift({ id: 'x', date: new Date().toISOString().slice(0, 10) }); out.antiga.push(docLimitOk('limite')); out.bannerAntiga = bonusBannerHtml();
    return out;
  });
  assert.equal(r.planoFree, 'free'); assert.match(r.banner, /3 de 3 documentos/); assert.match(r.banner, /43 horas/);
  assert.deepEqual(r.seq, [true, true, true, false], 'três liberados, o quarto cai no limite normal'); assert.equal(r.n, 3); assert.equal(r.bannerDepois, '');
  assert.deepEqual(r.antiga, [true, false], 'conta com mais de 48 h: 1 por mês'); assert.equal(r.bannerAntiga, '');
  assert.deepEqual(errs, []); await page.close();
});
test('pago não passa pelo bônus e demo não mostra aviso', async () => {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ demo: bonusBannerHtml(), info: bonusInfo() }));
  assert.equal(r.demo, ''); assert.equal(r.info, null); await page.close();
});
