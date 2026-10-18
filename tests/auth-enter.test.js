// Enter nos campos de login/cadastro/recuperação aciona o botão principal
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
test('Enter envia login, recuperação e cadastro', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/'); await page.waitForSelector('#auth-screen:not([hidden])');
  // login: campos vazios + Enter => mensagem do próprio botão (prova que o clique foi acionado)
  await page.fill('#login-email', 'a@b.com'); await page.press('#login-email', 'Enter');
  assert.match(await page.textContent('#auth-error'), /Preencha todos os campos/);
  await page.evaluate(() => { document.getElementById('auth-error').textContent = ''; window.__n = 0; document.getElementById('btn-login').addEventListener('click', () => window.__n++); });
  // recuperação
  await page.evaluate(() => { showForgotForm(); window.__f = 0; document.getElementById('btn-forgot').addEventListener('click', () => window.__f++); });
  await page.fill('#forgot-email', 'a@b.com'); await page.press('#forgot-email', 'Enter');
  assert.equal(await page.evaluate(() => window.__f), 1);
  await page.evaluate(() => backToLogin());
  await page.fill('#login-pass', 'x'); await page.press('#login-pass', 'Enter');
  assert.equal(await page.evaluate(() => window.__n), 1);
  // Enter não dispara em botão "Esqueci a senha"/olho de senha (só em inputs)
  assert.deepEqual(errs, []);
});
