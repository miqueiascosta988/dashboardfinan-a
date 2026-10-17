// Onboarding interativo: balões com seta guiando por todo o dashboard (sem painel de legendas fixas)
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

async function walk(vp, shotDir) {
  const page = await browser.newPage({ viewport: vp }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  assert.equal(await page.locator('#gt-panel').count(), 0, 'sem painel de legendas fixas');
  await page.click('#gt-btn'); await page.waitForSelector('#ob-root .ob-bub');
  const seen = [], bad = []; let guard = 0;
  while (guard++ < 120) {
    const info = await page.evaluate(() => {
      const b = document.querySelector('#ob-root .ob-bub'), h = document.querySelector('#ob-root .ob-hole'), s = Onboard.state(), vw = innerWidth, vh = innerHeight;
      const br = b.getBoundingClientRect(), hr = h.style.display === 'none' ? null : h.getBoundingClientRect();
      const tail = b.querySelector('.ob-tail'), tv = tail && tail.style.display !== 'none' && tail.className.indexOf('ob-tail ') === 0;
      return { s, inV: br.left >= -1 && br.top >= -1 && br.right <= vw + 1 && br.bottom <= vh + 1, hole: hr && { w: hr.width, h: hr.height, inV: hr.right > 0 && hr.bottom > 0 && hr.left < vw && hr.top < vh }, tail: !!tv, modal: !!document.querySelector('#modal-overlay.open'), last: /Concluir/.test(document.querySelector('#ob-next').textContent) };
    });
    seen.push(info.s.title + (info.modal ? ' [form]' : ''));
    if (!info.inV) bad.push('balão fora da tela: ' + info.s.title);
    if (info.hole && !info.hole.inV) bad.push('destaque fora da tela: ' + info.s.title);
    if (shotDir && [0, 3, 12, 18, 33].includes(guard - 1)) await page.screenshot({ path: shotDir + '/ob_' + (guard - 1) + '.png' });
    if (info.last) { await page.click('#ob-next'); break; }
    await page.click('#ob-next'); await page.waitForTimeout(430);
  }
  await page.waitForTimeout(300);
  const end = await page.evaluate(() => ({ root: !!document.querySelector('#ob-root'), modal: !!document.querySelector('#modal-overlay.open'), tab: currentTab, tx: state.transactions.length }));
  await page.close(); return { seen, bad, end, errs };
}
test('desktop: percorre o app inteiro com balões, campo por campo, e fecha tudo', async () => {
  const r = await walk({ width: 1366, height: 800 }, process.env.OB_SHOTS);
  assert.deepEqual(r.errs, []); assert.deepEqual(r.bad, []);
  assert.ok(r.seen.length >= 60, 'passos: ' + r.seen.length);
  ['Saldo patrimonial', 'Valor', 'Recorrente?', 'Juros ao mês', 'Saldo devedor', 'Aporte mensal', 'Tour concluído'].forEach(t => { if (t !== 'Tour concluído') assert.ok(r.seen.some(x => x.indexOf(t) === 0), 'falta passo: ' + t); });
  assert.ok(r.seen.some(x => /\[form\]$/.test(x)), 'passos dentro dos formulários');
  assert.deepEqual(r.end, { root: false, modal: false, tab: 'dashboard', tx: r.end.tx });
});
test('celular: balões sempre dentro da tela', async () => {
  const r = await walk({ width: 390, height: 844 });
  assert.deepEqual(r.errs, []); assert.deepEqual(r.bad, []); assert.ok(r.seen.length >= 55);
});
test('Esc fecha, setas do teclado navegam e o plano Free pula áreas bloqueadas', async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } }); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  await page.evaluate(() => Onboard.start()); await page.waitForSelector('.ob-bub');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500); assert.equal((await page.evaluate(() => Onboard.state())).i, 1);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(500); assert.equal((await page.evaluate(() => Onboard.state())).i, 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); assert.equal(await page.locator('#ob-root').count(), 0);
  const free = await page.evaluate(() => { DEMO.on = false; profile = { plan: 'free' }; return Onboard._build().map(s => s.title); });
  assert.ok(!free.includes('Central de Alívio') && !free.includes('Projeção'), 'Free não passeia por áreas bloqueadas');
  const basic = await page.evaluate(() => { profile = { plan: 'basic', plan_status: 'active' }; return Onboard._build().map(s => s.title); });
  assert.ok(basic.includes('Central de Alívio'));
  await page.close();
});

test('balão de vídeo logo no início: aparece no 2º passo, com botão quando há link configurado', async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  await page.evaluate(() => { appConfig.onboardingVideoUrl = 'https://exemplo.com/video'; });
  await page.click('#gt-btn'); await page.waitForSelector('#ob-root .ob-bub');
  await page.click('#ob-next'); await page.waitForFunction(() => /vídeo/i.test(document.querySelector('#ob-root .ob-title').textContent));
  assert.match(await page.textContent('#ob-root .ob-text'), /explica melhor/);
  assert.equal(await page.getAttribute('#ob-root .ob-vid', 'href'), 'https://exemplo.com/video'); assert.equal(await page.getAttribute('#ob-root .ob-vid', 'rel'), 'noopener noreferrer');
  await page.close();
});
