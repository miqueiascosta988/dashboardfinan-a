// Guia interativo no app de verdade (modo demonstração).
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});

async function open(vp) {
  const page = await browser.newPage({ viewport: vp || { width: 1366, height: 800 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  await page.evaluate(() => { state.transactions = []; state.documents = []; state.debts = []; state.goals = []; state.budgets = {}; PREFS.data = {}; try { localStorage.removeItem(fxKey('gd')); } catch (e) {} renderCurrentTab(); Guia.start({ restart: true }); });
  await page.waitForTimeout(400);
  return { page, errs };
}
const cur = page => page.evaluate(() => Guia.state().eval.current);

test('o guia começa pedindo a meta e NÃO avança sozinho', async () => {
  const { page, errs } = await open();
  assert.equal(await cur(page), 'meta');
  await page.waitForTimeout(1800);
  assert.equal(await cur(page), 'meta');
  assert.match(await page.textContent('#gd-box'), /O que você quer resolver/);
  assert.deepEqual(errs, []); await page.close();
});
test('escolher a meta avança e leva à etapa do documento com a área destacada', async () => {
  const { page } = await open();
  await page.click('[data-gd="goal:ver"]'); await page.waitForTimeout(900);
  assert.equal(await cur(page), 'doc');
  assert.equal(await page.evaluate(() => currentTab), 'documentos');
  assert.equal(await page.isVisible('#gd-ring'), true);
  assert.equal(await page.locator('#gd-box [data-gd="mini"], #gd-box [data-gd="skip"]').count() > 0, true);
  await page.close();
});
test('pular avisa o que fica sem cálculo, a etapa continua pendente e aparece em "Retomar"', async () => {
  const { page } = await open();
  await page.click('[data-gd="goal:ver"]'); await page.waitForTimeout(800);
  await page.click('[data-gd="skip"]'); await page.waitForTimeout(200);
  assert.match(await page.textContent('#gd-box'), /Sem um documento eu não consigo conferir/);
  await page.click('[data-gd="back"]'); await page.waitForTimeout(200);
  assert.equal(await cur(page), 'doc', 'voltar não pula');
  await page.click('[data-gd="skip"]'); await page.click('[data-gd="skipok"]'); await page.waitForTimeout(900);
  assert.equal(await cur(page), 'renda');
  assert.deepEqual(await page.evaluate(() => Guia.state().eval.skipped), ['doc']);
  await page.close();
});
test('sem renda não calcula: a etapa da renda só conclui com lançamento salvo; pular avisa', async () => {
  const { page } = await open(); const m = String(new Date().getMonth() + 1).padStart(2, '0');
  await page.click('[data-gd="goal:ver"]'); await page.waitForTimeout(600);
  await page.click('[data-gd="skip"]'); await page.click('[data-gd="skipok"]'); await page.waitForTimeout(900);
  await page.click('[data-gd="skip"]'); await page.waitForTimeout(200);
  assert.match(await page.textContent('#gd-box'), /Sem a renda eu não consigo calcular o que sobra/);
  await page.click('[data-gd="back"]');
  await page.evaluate(() => openTransactionModal('income')); await page.waitForSelector('#m-amount'); await page.waitForTimeout(1000);
  assert.equal(await cur(page), 'renda', 'abrir o formulário não conclui');
  await page.fill('#m-date', '05/' + m); await page.fill('#m-desc', 'Salário'); await page.fill('#m-amount', '3.200,50'); await page.click('.btn-save'); await page.waitForTimeout(1200);
  assert.equal(await cur(page), 'gastos');
  await page.close();
});
test('3 gastos concluem; resultado só passa com "Entendi"; depois vem o passo da meta', async () => {
  const { page } = await open(); const m = String(new Date().getMonth() + 1).padStart(2, '0');
  await page.evaluate(() => { Guia.start(); });
  await page.evaluate(() => { const s = Guia._model; });
  await page.click('[data-gd="goal:dividas"]'); await page.waitForTimeout(500);
  await page.click('[data-gd="skip"]'); await page.click('[data-gd="skipok"]'); await page.waitForTimeout(800);
  for (const [t, d, v] of [['income', 'Salário', '3000']].concat([['expense', 'Aluguel', '1000'], ['expense', 'Mercado', '500'], ['expense', 'Luz', '200']])) {
    await page.evaluate(x => openTransactionModal(x), t); await page.waitForSelector('#m-amount');
    await page.fill('#m-date', '05/' + m); await page.fill('#m-desc', d); await page.fill('#m-amount', v); await page.click('.btn-save'); await page.waitForTimeout(900);
  }
  assert.equal(await cur(page), 'resultado');
  assert.match(await page.textContent('#gd-box'), /entraram .*3\.000,00.*saíram .*1\.700,00.*sobraram .*1\.300,00/);
  await page.click('[data-gd="ack"]'); await page.waitForTimeout(800);
  assert.equal(await cur(page), 'proximo');
  assert.equal(await page.evaluate(() => currentTab), 'dividas');
  await page.close();
});
test('progresso salvo: depois de "sair" e voltar o guia continua de onde parou', async () => {
  const { page } = await open();
  await page.click('[data-gd="goal:juntar"]'); await page.waitForTimeout(500);
  await page.click('[data-gd="skip"]'); await page.click('[data-gd="skipok"]'); await page.waitForTimeout(500);
  const saved = await page.evaluate(() => JSON.stringify(PREFS.data.gd || JSON.parse(localStorage.getItem(fxKey('gd')))));
  await page.evaluate(() => Guia.stop());
  assert.equal(await page.isVisible('#gd-box').catch(() => false), false);
  await page.evaluate(s => { PREFS.data = { gd: JSON.parse(s) }; Guia.start(); }, saved); await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ cur: Guia.state().eval.current, goal: Guia.state().saved.goal, sk: Guia.state().eval.skipped }));
  assert.deepEqual(r, { cur: 'renda', goal: 'juntar', sk: ['doc'] });
  await page.close();
});
test('celular 390px: o balão fica ancorado embaixo e dentro da tela', async () => {
  const { page } = await open({ width: 390, height: 800 });
  const b = await page.evaluate(() => { const r = document.getElementById('gd-box').getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; });
  assert.ok(b.l >= 0 && b.r <= b.w && b.b <= b.h, JSON.stringify(b));
  await page.close();
});
test('modo escuro: tela escurecida e só o campo indicado fica claro (recorte no destaque)', async () => {
  const { page } = await open();
  assert.equal(await page.isVisible('#gd-dim'), true, 'sem campo alvo (meta): tela toda escura');
  await page.click('[data-gd="goal:ver"]'); await page.waitForTimeout(900);
  assert.equal(await page.locator('#gd-dim').count(), 0, 'com campo alvo: o recorte faz o escurecimento'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const g = document.getElementById('gd-ring'), s = getComputedStyle(g), z = document.getElementById('upload-zone').getBoundingClientRect(), b = g.getBoundingClientRect(); return { sh: s.boxShadow, pe: s.pointerEvents, cobre: b.left <= z.left && b.top <= z.top && b.right >= z.right && b.bottom >= z.bottom }; });
  assert.match(r.sh, /9999px/); assert.equal(r.pe, 'none'); assert.equal(r.cobre, true);
  await page.close();
});
