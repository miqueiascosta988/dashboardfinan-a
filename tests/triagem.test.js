// Triagem do Instagram: 1 pergunta, resultado por nível e links certos (sem dados financeiros na URL)
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
async function run(pick) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/triagem'); await page.waitForSelector('.opt'); await page.waitForTimeout(150);
  assert.equal(await page.locator('.opt').count(), 4, 'uma única pergunta, 4 opções');
  await page.click('.opt >> nth=' + pick); await page.waitForSelector('#cta');
  return { tag: await page.textContent('.res-tag'), cta: await page.textContent('#cta'), href: await page.getAttribute('#cta', 'href'), alt: await page.getAttribute('#alt', 'href'), altTxt: await page.textContent('#alt'), page, errs };
}
test('uma pergunta: aperto alto vai direto ao plano de entrada, grátis como alternativa, sem passar pela apresentação', async () => {
  const r = await run(2);
  assert.match(r.tag, /aliviar/); assert.match(r.cta, /R\$ 5,00\/semana/); assert.equal(r.href, 'https://pay.hotmart.com/M1?off=abc&src=triagem');
  assert.equal(r.alt, '/?src=triagem'); assert.match(r.altTxt, /grátis/);
  assert.ok(!/apresentacao/.test(r.href + r.alt) && !/nivel|mes=|perfil/.test(r.href + r.alt), 'sem apresentação e sem resposta na URL');
  await r.page.screenshot({ path: process.env.SHOT_ALTO || '/tmp/triagem_alto.png' }); assert.deepEqual(r.errs, []); await r.page.close();
});
test('mês no azul e meio-termo mapeiam os níveis certos', async () => {
  const a = await run(0); assert.match(a.tag, /render/); await a.page.close();
  const b = await run(1); assert.match(b.tag, /controle/); assert.deepEqual(b.errs, []); await b.page.close();
});
test('sem checkout configurado, o principal é entrar grátis', async () => {
  const page = await browser.newPage(); await page.route('**/api/config', r => r.fulfill({ json: {} }));
  await page.goto(base + '/triagem'); await page.waitForSelector('.opt'); await page.waitForTimeout(200); await page.click('.opt >> nth=3'); await page.waitForSelector('#cta');
  assert.equal(await page.getAttribute('#cta', 'href'), '/?src=triagem'); assert.equal(await page.locator('#alt').count(), 0); await page.close();
});
