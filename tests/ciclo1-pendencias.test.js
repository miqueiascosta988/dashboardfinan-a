// Pendências do ciclo 1: renda não inventada, taxa de economia extrema e aviso de câmbio de reserva.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('o app não inventa renda: padrão 0, campo do cadastro sem valor de exemplo e sem "|| 5000" no código', async () => {
  const src = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  assert.ok(!/\|\|\s*5000/.test(src), 'nenhum valor padrão de renda no código');
  assert.ok(!/monthlyIncome:\s*5000/.test(src));
  assert.ok(/id="onboard-income" placeholder="Ex\. 3\.500,00 \(opcional\)"|id="onboard-income" placeholder="Ex\.: 3\.500,00 \(opcional\)"/.test(src));
});
test('taxa de economia absurda não vira número gigante; valores normais seguem iguais', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => [pct(-46791), pct(-100), pct(-99.95), pct(0), pct(35.25)]);
  assert.deepEqual(r, ['abaixo de -100%', '-100,0%', '-100,0%', '0,0%', '35,3%']);
  assert.deepEqual(errs, []); await page.close();
});
test('câmbio: com cotação de reserva a tela avisa que não atualizou e mostra a data', async () => {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const t = await page.evaluate(() => { CAMBIO.live = false; CAMBIO.tried = true; switchTab('cambio'); return (document.getElementById('cambio-fonte') || {}).textContent || ''; });
  assert.match(t, /não foi possível atualizar agora/); assert.match(t, /\d{2}\/\d{2}\/\d{4}/);
  await page.close();
});
