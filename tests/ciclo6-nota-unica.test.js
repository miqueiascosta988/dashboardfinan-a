// Ciclo 6: a nota de saúde financeira é a mesma no Início, nos Insights e na Estratégia.
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
const NOTA = 'CALC';
test('mesma nota nas três telas (conta com dados e conta vazia)', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const out = {}; const c = compute();
    const ring = h => { const d = document.createElement('div'); d.innerHTML = h; const t = d.querySelector('svg text[font-size="32"]'); return t ? t.textContent.trim() : null; };
    const kpi = h => { const m = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').match(/Score financeiro\s*([^\s]+)/i); return m ? m[1] : null; };
    out.nota = c.healthTotal; out.inicio = ring(renderDashboard(c)); out.insights = ring(renderInsights(c)); out.estr = kpi(renderEstrategia(c));
    return out;
  });
  assert.ok(r.nota != null, 'conta de exemplo tem nota');
  assert.equal(r.inicio, String(r.nota)); assert.equal(r.insights, String(r.nota));
  assert.equal(r.estr, r.nota + '/100', 'Estratégia usa a mesma nota: ' + r.estr);
  const v = await page.evaluate(() => { state.transactions = []; state.debts = []; state.assets = []; state.liabilities = []; state.monthly_income = 0; const c = compute(); const h = renderEstrategia(c).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); return { nota: c.healthTotal, estr: (h.match(/Score financeiro\s*([^\s]+)/i) || [])[1] }; });
  assert.equal(v.nota, null); assert.equal(v.estr, '—', 'sem dados a Estratégia não inventa nota');
  assert.deepEqual(errs, []); await page.close();
});
