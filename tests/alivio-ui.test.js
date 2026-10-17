// UI: Central de Alívio abre com as 6 seções, grava progresso diário e gera a imagem de compartilhar
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port;
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('Central de Alívio: seções, sem erros, progresso e imagem', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    window.requirePlan = () => true; window.PLAN_RANK && 0;
    state.subscriptions.push({ id: 'z1', name: 'Netflix', cat: 'Streaming', price: 40, color: '#e50914', profile: 'ambos' }, { id: 'z2', name: 'Netflix', cat: 'Streaming', price: 40, color: '#e50914', profile: 'ambos' });
    const html = renderAlivio({ totalIncome: 6000, totalExpense: 4500 });
    const tabs = getAvailableTabs().map(t => t.id), grp = navBuild().map(g => g.kids.map(k => k.id)).flat();
    FX.alv.snap = { '2026-07-01': 30000, '2026-08-01': 26000, '2026-09-01': 27000 };
    const h2 = renderAlivio({ totalIncome: 6000, totalExpense: 4500 });
    let blob = null; const orig = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb, t) { orig.call(this, b => { blob = b; cb(b); }, t); };
    window.showToast = () => {}; HTMLAnchorElement.prototype.click = function () {}; alvShare(); await new Promise(r => setTimeout(r, 400));
    return { html, h2, hasTab: tabs.includes('alivio') && grp.includes('alivio'), blob: blob && blob.size, snaps: Object.keys(FX.alv.snap).length };
  });
  ['Meu progresso', 'Raio-X da dívida', 'Plano de alívio', 'Roteiro de renegociação', 'Caçador de assinaturas', 'Auditor de holerite', 'Do aperto ao plano, do plano ao alívio'].forEach(t => assert.ok(r.html.includes(t), t));
  assert.ok(r.hasTab); assert.match(r.html, /Netflix aparece \d vezes/); assert.match(r.h2, /Verde: a dívida total caiu/); assert.ok(r.blob > 5000, 'png ' + r.blob); assert.ok(r.snaps >= 4);
  assert.deepEqual(errs, []); await page.close();
});
