// Onboarding PF em 3 passos (sem CPF) + tela de primeira vitória.
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(b); } }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { localStorage.removeItem('sm_vitoria_ok'); localStorage.removeItem('sm_vitoria_pend'); } catch (e) {} state.profile_type = 'PF'; state.doc_number = null; state.transactions = []; document.getElementById('app-screen').hidden = true; document.getElementById('onboarding-screen').hidden = false; nextOnboard(1); });
  return { page, errs };
}
test('PF: 3 passos, nenhum pede CPF/CNPJ nem moeda', async () => {
  const { page, errs } = await open();
  const lbl = async () => (await page.locator('[id^="onboard-step-"]:not([hidden]) [data-step-label]').textContent()).trim();
  assert.equal(await lbl(), 'Passo 1 de 3');
  await page.evaluate(() => nextOnboard('occ')); assert.equal(await lbl(), 'Passo 2 de 3');
  assert.equal(await page.locator('#onboard-step-doc:not([hidden])').count(), 0, 'sem tela de CPF');
  await page.evaluate(() => nextOnboard(3)); assert.equal(await lbl(), 'Passo 3 de 3');
  assert.equal(await page.locator('#onboard-step-2:not([hidden])').count(), 0, 'sem tela de moeda');
  assert.deepEqual(errs, []); await page.close();
});
test('PF: banner de CPF não aparece; PJ continua pedindo', async () => {
  const { page } = await open();
  const r = await page.evaluate(() => { state.profile_type = 'PF'; const a = renderDocBanner(); state.profile_type = 'PJ'; const b = renderDocBanner(); return { a, b }; });
  assert.equal(r.a, ''); assert.match(r.b, /Complete seu cadastro/); await page.close();
});
test('Primeira vitória: só conclui com ação real e leva à Saúde Financeira', async () => {
  const { page, errs } = await open();
  await page.evaluate(() => { document.getElementById('onboarding-screen').hidden = true; document.getElementById('app-screen').hidden = false; vitoriaOferecer(); });
  assert.ok(await page.locator('#vit-doc').isVisible()); assert.ok(await page.locator('#vit-man').isVisible());
  await page.click('#vit-skip');
  assert.equal(await page.evaluate(() => localStorage.getItem('sm_vitoria_ok')), null, '"Agora não" não conta como vitória');
  await page.evaluate(() => { state.transactions.push({ id: 'x1', date: '05/' + String(currentMonth() + 1).padStart(2, '0'), desc: 'Salário', cat: 'Salário', amount: 3000, type: 'income', recur: true }); vitoriaChecar(); });
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => localStorage.getItem('sm_vitoria_ok')), '1');
  assert.equal(await page.evaluate(() => currentTab), 'saude');
  assert.deepEqual(errs, []); await page.close();
});
test('Migration 030 e CRM aceitam primeira_vitoria', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/030_funil_primeira_vitoria.sql'), 'utf8'), /primeira_vitoria/);
  assert.ok(require('../src/lib/crm').ETAPAS.includes('primeira_vitoria'));
});
