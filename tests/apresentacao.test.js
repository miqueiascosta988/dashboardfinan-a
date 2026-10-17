// Página de apresentação (triagem -> apresentação -> produto) e rotas do vercel.json
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => {
    if (q.url.startsWith('/api/config')) { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ hotmartCheckoutTrial: 'https://pay.hotmart.com/M1?off=abc' })); }
    const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/apresentacao$/, '/apresentacao.html'));
    fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(b); });
  });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });

test('apresentação: botões levam ao checkout com origem; slogan; sem rolagem lateral; sem nomes de recursos', async () => {
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const page = await browser.newPage({ viewport: vp }), errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/apresentacao'); await page.waitForTimeout(500);
    for (const id of ['cta1', 'cta2', 'cta3']) assert.equal(await page.getAttribute('#' + id, 'href'), 'https://pay.hotmart.com/M1?off=abc&src=apresentacao');
    assert.equal(await page.getAttribute('#alt1', 'href'), '/?src=apresentacao');
    const t = await page.textContent('body'); assert.match(t, /Do aperto ao plano, do plano ao alívio\./);
    assert.ok(!/Raio-X|CardPlan|holerite|\bOCR\b|Mobills|Organizze/i.test(t), 'não expõe recursos nem cita marcas');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem horizontal');
    if (vp.width === 390) await page.screenshot({ path: process.env.SHOT_APR || '/tmp/apresentacao.png', fullPage: true });
    assert.deepEqual(errs, []); await page.close();
  }
});
test('vercel.json: /triagem, /apresentacao e arquivos .html/.webmanifest/.wasm não caem no app', () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const dest = (url) => { for (const r of v.routes) { const m = new RegExp('^' + r.src + '$').exec(url); if (m) return r.dest.replace('$1', m[1]); } };
  assert.equal(dest('/triagem'), '/public/triagem.html'); assert.equal(dest('/apresentacao'), '/public/apresentacao.html');
  assert.equal(dest('/triagem.html'), '/public/triagem.html'); assert.equal(dest('/termos.html'), '/public/termos.html');
  assert.equal(dest('/manifest.webmanifest'), '/public/manifest.webmanifest'); assert.equal(dest('/ocr/core.wasm'), '/public/ocr/core.wasm');
  assert.equal(dest('/api/config'), '/api/index.js'); assert.equal(dest('/qualquer-coisa'), '/public/index.html');
});
