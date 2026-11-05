// Ocultar valores, PIN, modo simples, desafio 52 semanas e alertas de limite.
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const C = require('../public/conforto.js');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(b); } }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });

test('contas puras: limites, PIN, espera e desafio', () => {
  const l = C.limites({ A: 100, B: 100, C: 100, D: 0 }, { A: 79, B: 80, C: 130, D: 50 });
  assert.deepEqual(l.map(x => [x.cat, x.nivel]), [['C', 'over'], ['B', 'warn']]);
  assert.ok(C.pinValido('1234') && C.pinValido('123456')); assert.ok(!C.pinValido('123') && !C.pinValido('1234567') && !C.pinValido('12a4'));
  assert.equal(C.espera(4), 0); assert.equal(C.espera(5), 30000); assert.ok(C.espera(99) <= 300000);
  assert.equal(C.desafioTotal(1), 1378); assert.equal(C.desafioGuardado(2, [1, 2, 3, 99]), 12); assert.equal(C.baseValida(0), null); assert.equal(C.baseValida(1001), null);
});
async function app() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.removeItem('sm_conf'); localStorage.removeItem('sm_pin'); localStorage.removeItem('sm_pin_f'); });
  return { page, errs };
}
test('ocultar valores: troca os números por ••••, e volta', async () => {
  const { page, errs } = await app();
  await page.evaluate(() => { state.profile_type = 'PF'; state.transactions = [{ id: 'a', date: '05/' + String(currentMonth() + 1).padStart(2, '0'), desc: 'Salário', cat: 'Salário', amount: 4321.5, type: 'income', recur: false }]; switchTab('dashboard'); });
  assert.match(await page.textContent('#main'), /4\.321,50/);
  await page.click('#btn-oculto'); const t = await page.textContent('#main');
  assert.ok(!/4\.321,50/.test(t) && /••••/.test(t)); assert.equal(await page.getAttribute('#btn-oculto', 'aria-pressed'), 'true');
  await page.click('#btn-oculto'); assert.match(await page.textContent('#main'), /4\.321,50/); assert.deepEqual(errs, []); await page.close();
});
test('PIN: ativa, bloqueia, recusa errado, aceita certo e remove', async () => {
  const { page, errs } = await app();
  await page.click('#btn-pin'); await page.fill('#pin-novo', '12'); await page.click('#modal-overlay >> text=Salvar'); assert.match(await page.textContent('#pin-msg'), /4 a 6/);
  await page.fill('#pin-novo', '2468'); await page.click('#modal-overlay >> text=Salvar'); await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => !!localStorage.getItem('sm_pin')) && !(await page.evaluate(() => localStorage.getItem('sm_pin'))).includes('2468'), 'PIN não fica em texto puro');
  await page.evaluate(() => Conforto.trava()); assert.ok(await page.locator('#pin-lock').isVisible());
  await page.fill('#pin-in', '0000'); await page.click('#pin-go'); await page.waitForTimeout(300); assert.match(await page.textContent('#pin-err'), /incorreto/); assert.ok(await page.locator('#pin-lock').count());
  await page.fill('#pin-in', '2468'); await page.click('#pin-go'); await page.waitForTimeout(300); assert.equal(await page.locator('#pin-lock').count(), 0);
  await page.click('#btn-pin'); await page.fill('#pin-atual', '2468'); await page.click('#modal-overlay >> text=Salvar'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => localStorage.getItem('sm_pin')), null); assert.deepEqual(errs, []); await page.close();
});
test('PIN: 5 erros seguidos impõem espera', async () => {
  const { page } = await app();
  await page.click('#btn-pin'); await page.fill('#pin-novo', '2468'); await page.click('#modal-overlay >> text=Salvar'); await page.waitForTimeout(300);
  await page.evaluate(() => Conforto.trava());
  for (let i = 0; i < 5; i++) { await page.fill('#pin-in', '1111'); await page.click('#pin-go'); await page.waitForTimeout(200); }
  await page.fill('#pin-in', '2468'); await page.click('#pin-go'); await page.waitForTimeout(200);
  assert.match(await page.textContent('#pin-err'), /Aguarde/); assert.ok(await page.locator('#pin-lock').count()); await page.close();
});
test('Modo simples: menu enxuto e resumo claro; volta ao completo', async () => {
  const { page, errs } = await app();
  await page.evaluate(() => { state.profile_type = 'PF'; const m = String(currentMonth() + 1).padStart(2, '0'); state.transactions = [
    { id: 'i', date: '05/' + m, desc: 'Salário', cat: 'Salário', amount: 5000, type: 'income', recur: false },
    { id: 'e', date: '06/' + m, desc: 'Mercado', cat: 'Alimentação', amount: 900, type: 'expense', recur: false }]; state.budgets = { 'Alimentação': 1000 }; renderNav(); });
  const antes = await page.locator('#nav .nav-btn').count();
  await page.click('#btn-simples'); await page.waitForTimeout(300);
  const depois = await page.locator('#nav .nav-btn').count(); assert.ok(depois <= 5 && depois < antes, antes + ' -> ' + depois);
  const t = await page.textContent('#main'); assert.match(t, /Sobrou neste período/); assert.match(t, /4\.100,00/); assert.match(t, /Alimentação: 90%/); assert.match(t, /Nota de saúde/);
  assert.equal(await page.evaluate(() => currentTab), 'simples');
  await page.click('text=Ver o app completo'); await page.waitForTimeout(300);
  assert.equal(await page.locator('#nav .nav-btn').count(), antes); assert.notEqual(await page.evaluate(() => currentTab), 'simples'); assert.deepEqual(errs, []); await page.close();
});
test('Desafio das 52 semanas: inicia, marca semanas e soma', async () => {
  const { page, errs } = await app();
  await page.evaluate(() => { state.profile_type = 'PF'; switchTab('metas'); });
  await page.fill('#des-base', '2,00'); await page.click('text=Começar o desafio'); await page.waitForTimeout(200);
  await page.click('button:has-text("S3")'); await page.click('button:has-text("S10")'); await page.waitForTimeout(200);
  assert.match(await page.textContent('#main'), /Guardado: .*26,00.* de .*2\.756,00/); assert.match(await page.textContent('#main'), /2 de 52/); assert.deepEqual(errs, []); await page.close();
});
test('Alertas: categoria perto/acima do limite aparece no sino', async () => {
  const { page } = await app();
  const r = await page.evaluate(() => { state.profile_type = 'PF'; const m = String(currentMonth() + 1).padStart(2, '0'); state.transactions = [
    { id: 'a', date: '05/' + m, desc: 'x', cat: 'Lazer', amount: 250, type: 'expense', recur: false }, { id: 'b', date: '05/' + m, desc: 'y', cat: 'Transporte', amount: 500, type: 'expense', recur: false }]; state.budgets = { Lazer: 300, Transporte: 400 };
    return generateNotifications().filter(n => n.id.startsWith('limite-')).map(n => n.title); });
  assert.deepEqual(r.sort(), ['Limite de Lazer quase no fim', 'Limite de Transporte estourado']); await page.close();
});
test('tela de PIN é legível (contraste do título sobre o fundo) e os botões secundários têm estilo', async () => {
  const { page } = await app();
  await page.evaluate(() => { localStorage.setItem('sm_pin', JSON.stringify({ s: 'x', h: 'y' })); Conforto.trava(); });
  const r = await page.evaluate(() => {
    const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; };
    const bg = getComputedStyle(document.getElementById('pin-lock')).backgroundColor, fg = getComputedStyle(document.querySelector('#pin-lock h2')).color;
    const a = lum(bg), b = lum(fg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const sec = getComputedStyle(document.getElementById('pin-out'));
    return { ratio, secBorder: sec.borderTopWidth, secRadius: sec.borderTopLeftRadius };
  });
  assert.ok(r.ratio >= 4.5, 'contraste ' + r.ratio.toFixed(2)); assert.equal(r.secBorder, '1px'); assert.notEqual(r.secRadius, '0px'); await page.close();
});
test('celular: o sino de notificações abre dentro da tela, mesmo com o cabeçalho em duas linhas', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  await page.evaluate(() => { state.profile_type = 'PF'; toggleNotifications(); }); await page.waitForTimeout(400);
  const r = await page.evaluate(() => { const b = document.getElementById('notif-dropdown').getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth }; });
  assert.ok(r.l >= 0 && r.r <= r.w, JSON.stringify(r)); await page.close();
});
