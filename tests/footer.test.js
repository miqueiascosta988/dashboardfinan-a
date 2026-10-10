const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http');
const test = require('node:test'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', 'public'); let server, base, browser;
test.before(async () => { server = http.createServer((q, r) => { const f = path.join(ROOT, q.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); } }); }); await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; browser = await chromium.launch(); });
test.after(async () => { await browser.close(); server.close(); });
async function open(w) { const p = await browser.newPage({ viewport: { width: w, height: 800 } }); await p.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.abort()); await p.goto(base + '/index.html?demo=clt'); await p.waitForFunction(() => typeof renderFooter === 'function' && !document.getElementById('app-screen').hidden); return p; }
test('rodapé: sem dados institucionais configurados mostra só o que existe (WhatsApp do projeto + links), sem inventar nada', async () => {
  const p = await open(1280); const t = await p.locator('#site-footer').innerText();
  assert.match(t, /WhatsApp \(11\) 96038-4846/); assert.match(t, /Termos de Uso/); assert.match(t, /Política de Privacidade/);
  assert.doesNotMatch(t, /@|📍|🕘|CNPJ|\[/);
  assert.equal(await p.locator('#site-footer a[href="/termos.html"]').count(), 1); assert.equal(await p.locator('#site-footer a[href="/privacidade.html"]').count(), 1);
});
test('rodapé: campos configurados aparecem; HTML malicioso é escapado; e-mail inválido é ignorado', async () => {
  const p = await open(1280);
  await p.evaluate(() => { appConfig.contact = { email: 'contato@exemplo.com.br', phone: '(11) 4000-1234', hours: 'Seg a sex, 9h às 18h', address: '<img src=x onerror=window.__xss=1>', legalName: 'Empresa Teste Ltda', cnpj: '00.000.000/0001-00' }; renderFooter(); });
  const t = await p.locator('#site-footer').innerText();
  assert.match(t, /contato@exemplo\.com\.br/); assert.match(t, /Seg a sex, 9h às 18h/); assert.match(t, /Empresa Teste Ltda/); assert.match(t, /00\.000\.000\/0001-00/);
  assert.equal(await p.locator('#site-footer a[href="mailto:contato@exemplo.com.br"]').count(), 1); assert.equal(await p.locator('#site-footer a[href^="tel:"]').count(), 1);
  assert.equal(await p.evaluate(() => window.__xss), undefined); assert.equal(await p.locator('#site-footer img').count(), 0);
  await p.evaluate(() => { appConfig.contact = { email: 'javascript:alert(1)' }; renderFooter(); });
  assert.equal(await p.locator('#site-footer a[href^="mailto:"]').count(), 0);
});
test('rodapé: responsivo (sem rolagem horizontal no celular)', async () => {
  const p = await open(360);
  await p.evaluate(() => { appConfig.contact = { email: 'contato@exemplo.com.br', phone: '(11) 4000-1234', hours: 'Seg a sex, 9h às 18h', address: 'Rua Exemplo, 123 — Bairro — Cidade/UF — CEP 00000-000' }; renderFooter(); });
  const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, fw: document.getElementById('site-footer').scrollWidth }));
  assert.ok(w.sw <= w.cw + 1, 'sem rolagem horizontal: ' + JSON.stringify(w));
  await p.locator('#site-footer').scrollIntoViewIfNeeded(); await p.screenshot({ path: '/tmp/footer_mobile.png' });
});
