// Triagem do Instagram: 5 perguntas, resultado por nível e links certos (sem dados financeiros na URL)
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => {
    if (q.url.startsWith('/api/config')) { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ hotmartCheckoutTrial: 'https://pay.hotmart.com/M1?off=abc' })); }
    const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/triagem$/, '/triagem.html'));
    fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); r.end(b); });
  });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
async function run(picks) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/triagem'); await page.waitForSelector('.opt'); await page.waitForTimeout(150);
  for (let n = 0; n < 5; n++) { assert.match(await page.textContent('.meta'), new RegExp('Pergunta ' + (n + 1) + ' de 5')); await page.click('.opt >> nth=' + picks[n]); await page.waitForTimeout(400); }
  await page.waitForSelector('#cta');
  const r = { tag: await page.textContent('.res-tag'), cta: await page.textContent('#cta'), href: await page.getAttribute('#cta', 'href'), alt: await page.getAttribute('#alt', 'href'), altTxt: await page.textContent('#alt'), page, errs };
  return r;
}
test('aperto alto: oferece R$ 5/semana primeiro, grátis como alternativa', async () => {
  const r = await run([1, 3, 2, 3, 1]);
  assert.match(r.tag, /aliviar/); assert.equal(r.href, '/apresentacao?src=triagem'); assert.match(r.altTxt, /R\$ 5,00\/semana/);
  assert.equal(r.alt, 'https://pay.hotmart.com/M1?off=abc&src=triagem');
  assert.ok(!/nivel|obj=|perfil/.test(r.href + r.alt), 'nada sobre a situação financeira na URL');
  await r.page.screenshot({ path: process.env.SHOT_ALTO || '/tmp/triagem_alto.png' }); assert.deepEqual(r.errs, []); await r.page.close();
});
test('mês no azul: também vai para a apresentação; atalho é entrar grátis', async () => {
  const r = await run([3, 0, 0, 1, 0]);
  assert.match(r.tag, /render/); assert.equal(r.href, '/apresentacao?src=triagem'); assert.equal(r.alt, '/?src=triagem'); assert.match(r.altTxt, /Entrar grátis/);
  assert.deepEqual(r.errs, []); await r.page.close();
});
test('voltar mantém a escolha e a primeira pergunta não tem voltar', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); await page.goto(base + '/triagem'); await page.waitForSelector('.opt');
  assert.equal(await page.isVisible('#back'), false);
  await page.click('.opt >> nth=2'); await page.waitForTimeout(400); await page.click('#back'); await page.waitForTimeout(200);
  assert.match(await page.textContent('.meta'), /Pergunta 1 de 5/); assert.match(await page.getAttribute('.opt >> nth=2', 'class'), /sel/);
  await page.screenshot({ path: process.env.SHOT_PERG || '/tmp/triagem_pergunta.png' }); await page.close();
});
