// AUD-03 a AUD-06 e AUD-13: acessibilidade básica não regride; sem cópias antigas do app em public/.
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
const TABS = ['dashboard', 'receitas', 'despesas', 'orcamento', 'metas', 'dividas', 'patrimonio', 'assinaturas', 'projecao', 'saude', 'cambio', 'plano', 'perfil', 'fluxo', 'documentos', 'insights', 'estrategia', 'openfinance', 'perfilrenda', 'simuladorclt', 'investir', 'resolver', 'alivio', 'calcdivida', 'agenda', 'credito'];
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };

test('AUD-13: nenhuma cópia antiga do app dentro de public/', () => {
  assert.deepEqual(fs.readdirSync(PUB).filter(f => /^index_before/i.test(f)), []);
});
test('AUD-03: texto secundário e ouro de texto passam 4,5:1 nos fundos usados', () => {
  const css = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'), cor = n => new RegExp('--' + n + ':\\s*(#[0-9A-Fa-f]{6})').exec(css)[1];
  for (const n of ['ink-3', 'gold-text', 'income']) for (const bg of ['#FFFFFF', '#EAEFF5', '#F3F6FA', '#F7EFD9']) assert.ok(razao(cor(n), bg) >= 4.5, n + ' sobre ' + bg + ' = ' + razao(cor(n), bg).toFixed(2));
});
test('AUD-04/05: todo campo tem nome, todo clique em div/span é botão de teclado, há link de salto', async () => {
  for (const demo of ['clt', 'autonomo']) {
    const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(base + '/?demo=' + demo); await page.waitForTimeout(1500);
    const falhas = [];
    for (const t of TABS) {
      await page.evaluate(x => switchTab(x), t); await page.waitForTimeout(150);
      const r = await page.evaluate(() => ({
        semNome: Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea')).filter(e => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title || (e.labels && e.labels.length))).length,
        semTeclado: Array.from(document.querySelectorAll('[onclick]')).filter(e => !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL)$/.test(e.tagName) && !e.getAttribute('role') && !e.hasAttribute('tabindex') && !e.querySelector('a,button,input,select,textarea')).length }));
      if (r.semNome || r.semTeclado) falhas.push(demo + '/' + t + ' ' + JSON.stringify(r));
    }
    assert.deepEqual(falhas, []); assert.ok(await page.evaluate(() => !!document.querySelector('a.skip-link[href="#main"]')), 'link de salto'); assert.deepEqual(errs, []); await page.close();
  }
});
test('Enter e Espaço ativam um div clicável', async () => {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const d = document.createElement('div'); d.setAttribute('onclick', 'window.__c=(window.__c||0)+1'); d.textContent = 'x'; document.getElementById('main').appendChild(d); return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { A11y.aplicar(); d.focus(); d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); d.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); res({ role: d.getAttribute('role'), tab: d.getAttribute('tabindex'), cliques: window.__c }); }))); });
  assert.equal(r.role, 'button'); assert.equal(r.tab, '0'); assert.equal(r.cliques, 2); await page.close();
});
test('AUD-06: orçamento e demais telas não rolam na horizontal a 360 px', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } }), page = await ctx.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const largas = [];
  for (const t of ['orcamento', 'dashboard', 'metas', 'dividas', 'patrimonio', 'assinaturas', 'plano', 'perfilrenda']) { await page.evaluate(x => switchTab(x), t); await page.waitForTimeout(250); const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); if (w[0] > w[1] + 1) largas.push(t + ' ' + w.join('>')); }
  assert.deepEqual(largas, []); await ctx.close();
});
