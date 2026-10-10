// Navegação: menu enxuto, mas nenhuma tela perdida e sem erros em nenhuma aba de nenhum perfil.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http');
const test = require('node:test'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', 'public');
let server, base, browser;
test.before(async () => {
  server = http.createServer((q, r) => { const f = path.join(ROOT, q.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
  await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });
for (const persona of ['clt', 'autonomo', 'negativado', 'mei', 'simples', 'presumido']) {
  test('navegação · ' + persona, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errs = [];
    page.on('pageerror', e => errs.push(String(e))); await page.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.abort());
    await page.goto(base + '/index.html?demo=' + persona); await page.waitForFunction(() => typeof startDemo === 'function' && !document.getElementById('app-screen').hidden);
    const info = await page.evaluate(() => ({ avail: getAvailableTabs().map(t => t.id), groups: navBuild().map(g => g.kids.map(k => k.id)), buttons: document.querySelectorAll('#nav .nav-btn').length }));
    const flat = info.groups.flat();
    assert.deepEqual([...flat].sort(), [...info.avail].sort(), 'nenhuma tela pode sumir nem duplicar');
    assert.ok(info.buttons <= 9, 'no máximo 9 itens no menu (antes: ' + info.avail.length + '), tem ' + info.buttons);
    for (const id of info.avail) {
      await page.evaluate(t => switchTab(t), id);
      const st = await page.evaluate(id => ({ cur: currentTab, active: [...document.querySelectorAll('#nav .nav-btn.active')].map(b => b.dataset.tabs), sub: document.querySelectorAll('.subnav .subnav-btn.active').length, g: navGroupOf(id).kids.length }), id);
      assert.equal(st.cur, id); assert.equal(st.active.length, 1, 'exatamente um item do menu ativo em ' + id); assert.ok(st.active[0].split(' ').includes(id));
      assert.equal(st.sub, st.g > 1 ? 1 : 0, 'sub-aba ativa em ' + id);
    }
    // clique real no menu e na sub-aba
    await page.click('#nav .nav-btn:has-text("Planejar")'); assert.ok(await page.evaluate(() => ['agenda', 'metas', 'projecao', 'estrategia', 'insights'].includes(currentTab)));
    await page.click('.subnav-btn >> nth=1'); assert.ok(await page.evaluate(() => currentTab !== 'agenda'));
    assert.deepEqual(errs, []); await page.close();
  });
}
