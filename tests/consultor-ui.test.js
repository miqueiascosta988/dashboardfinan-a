// Consultor de estratégia na tela: conversa do exemplo do cliente até o plano, salvar e aparecer no Plano da semana
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

for (const vp of [{ width: 1366, height: 800 }, { width: 390, height: 844 }]) {
  test('consultor em ' + vp.width + 'px: frase livre -> perguntas -> plano -> salvar -> Plano da semana', async () => {
    const page = await browser.newPage({ viewport: vp }), errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/?demo=clt'); await page.waitForSelector('#wk-card');
    await page.evaluate(() => switchTab('estrategia')); await page.waitForSelector('#cs-card');
    assert.match(await page.textContent('#cs-card'), /consultor de estratégia/);
    const say = async (t) => { await page.fill('#cs-in', t); await page.press('#cs-in', 'Enter'); await page.waitForTimeout(250); };
    const dName = await page.evaluate(() => visibleList('debts').slice().sort((a, b) => b.juros - a.juros)[0].name);
    await say('Quero quitar ' + dName + ' até janeiro, pois em novembro tenho a 1º parcela do 13º, e dezembro, tenho a 2º parcela do 13º, e em janeiro, tenho férias.');
    for (let i = 0; i < 8 && !(await page.locator('#cs-card .cs-tbl').count()); i++) {
      const txt = await page.locator('#cs-card .cs-bot').last().textContent();
      if (/Qual dívida/.test(txt)) await page.click('#cs-card .cs-q .cs-qb >> nth=0');
      else if (/Quanto você espera receber/.test(txt)) await page.click('#cs-card .cs-q .cs-qb >> nth=0');
      else if (/Quanto sobra por mês/.test(txt)) await page.click('#cs-card .cs-q .cs-qb >> nth=0');
      else if (/juros/.test(txt)) await say('2');
      else throw new Error('pergunta inesperada: ' + txt);
      await page.waitForTimeout(250);
    }
    assert.ok(await page.locator('#cs-card .cs-tbl tbody tr').count() >= 2, 'cronograma por mês');
    assert.match(await page.textContent('#cs-card'), /Passo a passo/); assert.match(await page.textContent('#cs-card'), /Não é recomendação financeira/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem horizontal');
    if (vp.width === 390) { await page.locator('#cs-card').scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.SHOT_CS || '/tmp/cs_card.png', fullPage: false }); }
    const isOk = await page.evaluate(() => CS.sess.plan.ok);
    if (isOk) {
      await page.click('#cs-card .cs-q .cs-qb >> text=Salvar este plano'); await page.waitForSelector('#cs-card .cs-ok');
      await page.evaluate(() => switchTab('dashboard')); await page.waitForSelector('#wk-card');
      assert.match(await page.textContent('#wk-card'), /este mês/); assert.match(await page.textContent('#wk-card .wk-m'), /plano que você montou/);
    }
    assert.deepEqual(errs, []); await page.close();
  });
}
