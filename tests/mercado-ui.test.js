const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser, hits = 0;
test.before(async () => {
  srv = http.createServer((q, r) => {
    if (q.url.startsWith('/api/mercado')) { hits++; r.setHeader('content-type', 'application/json'); const I = (nome, valor, un, id) => ({ nome, valor, unidade: un, data: '2026-10-16', fonte: 'Banco Central do Brasil (SGS ' + id + ')', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + id + '/dados/ultimos/1?formato=json' });
      return r.end(JSON.stringify({ indicadores: { selic: I('Meta da taxa Selic', 14.5, '% a.a.', 432), cdi: I('CDI anualizado (base 252)', 14.4, '% a.a.', 4389), ipca12: I('IPCA acumulado em 12 meses', 4.6, '%', 13522), poupanca: I('Poupança (estimativa anual)', 6.2, '% a.a.', 226) }, fetchedAt: new Date().toISOString() })); }
    const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('investimentos: busca ao abrir o dashboard e mostra valores com fonte e data', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForSelector('#nav'); await page.waitForTimeout(600);
  assert.ok(hits >= 1, 'buscou no servidor ao abrir o dashboard');
  await page.evaluate(() => { window.isPlusUser = () => true; switchTab('investir'); }); await page.waitForSelector('#mkt-card');
  const t = await page.textContent('#mkt-card');
  assert.match(t, /14,5/); assert.match(t, /Inflação/); assert.match(t, /16\/10\/2026/);
  assert.match(await page.textContent('#mkt-fontes'), /Banco Central do Brasil \(SGS 432\)/);
  assert.ok(await page.locator('#mkt-fontes a[href^="https://api.bcb.gov.br"]').count() >= 3);
  assert.deepEqual(errs, []);
});
