// UI: faixa do teste de 7 dias, Basic com oferta de R$ 5 e bloqueio quando o teste termina
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('teste de 7 dias: faixa, plano com oferta e expiração', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    DEMO.on = false; currentUser = { email: 'a@x.com' }; appConfig = { hotmartCheckoutTrial: 'https://pay.hotmart.com/T', hotmartCheckoutBasic: 'https://pay.hotmart.com/B' };
    const day = 86400000, set = d => { profile = { plan: 'basic', plan_status: 'trialing', plan_expires_at: new Date(Date.now() + d * day).toISOString() }; };
    set(5); const a = { ok: hasActivePlan(), banner: trialBannerHtml(), planoTeste: renderPlano() }; const sv = profile; profile = { plan: 'free' }; a.plano = renderPlano(); profile = sv;
    set(1); const b = { banner: trialBannerHtml() };
    set(-1); const c = { ok: hasActivePlan(), banner: trialBannerHtml() };
    profile = { plan: 'basic', plan_status: 'active' }; const d = { ok: hasActivePlan(), banner: trialBannerHtml() };
    return { a, b, c, d };
  });
  assert.equal(r.a.ok, true); assert.match(r.a.banner, /Faltam 5 dias/); assert.match(r.a.banner, /hotmart\.com\/B\?email=a%40x\.com/);
  assert.match(r.a.plano, /Testar 7 dias por R\$ 5/); assert.match(r.a.plano, /pay\.hotmart\.com\/T/); assert.match(r.a.plano, /assinar direto por R\$ 8,00/); assert.match(r.a.planoTeste, /Continuar por R\$ 8,00\/mês/); assert.match(r.a.planoTeste, /em teste/);
  assert.match(r.b.banner, /Último dia/); assert.equal(r.c.ok, false); assert.match(r.c.banner, /terminou/); assert.equal(r.d.ok, true); assert.equal(r.d.banner, '');
  assert.deepEqual(errs, []); await page.close();
});
