// Guia: enquanto há um alvo, só o alvo, o formulário aberto e o balão respondem a clique.
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
async function noPasso(vp) {
  const page = await browser.newPage({ viewport: vp || { width: 1366, height: 800 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  await page.evaluate(() => { state.profile_type = 'PF'; state.transactions = []; state.documents = []; state.debts = []; state.goals = []; state.budgets = {}; PREFS.data = {}; try { localStorage.removeItem(fxKey('gd')); } catch (e) {} renderCurrentTab(); Guia.start({ restart: true }); });
  await page.waitForTimeout(400);
  await page.click('[data-gd="goal:ver"]'); await page.waitForTimeout(800);
  await page.click('[data-gd="skip"]'); await page.click('[data-gd="skipok"]'); await page.waitForTimeout(1100);
  return { page, errs };
}
const topo = (page, x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className || e.tagName) : null; }, [x, y]);
test('travado: clique fora do alvo cai no painel de trava; o alvo e o balão continuam clicáveis', async () => {
  const { page, errs } = await noPasso();
  assert.equal(await page.evaluate(() => Guia.state().eval.current), 'renda');
  assert.equal(await page.locator('.gd-sh').count(), 4, 'quatro painéis de trava');
  const alvo = await page.evaluate(() => { const b = [...document.querySelectorAll('#main button, #main a.btn-add')].find(x => /^\s*\+\s*Novo\b/.test(x.textContent)); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  assert.ok(!/gd-sh/.test(await topo(page, alvo.x, alvo.y)), 'o botão indicado fica livre');
  assert.match(await topo(page, 60, 140), /gd-sh/, 'o menu lateral está travado');
  const menu = await page.evaluate(() => { const b = document.querySelector('#nav .nav-btn:not(.active)'); const r = b.getBoundingClientRect(); return { x: r.left + 10, y: r.top + 10 }; });
  const aba = await page.evaluate(() => currentTab); await page.mouse.click(menu.x, menu.y); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => currentTab), aba, 'clicar em outra aba não faz nada');
  const bal = await page.evaluate(() => { const r = document.querySelector('#gd-box [data-gd="skip"]').getBoundingClientRect(); return { x: r.left + 5, y: r.top + 5 }; });
  assert.equal(await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#gd-box')); }, [bal.x, bal.y]), true, 'botões do balão livres');
  await page.mouse.click(60, 140); await page.waitForTimeout(100); assert.ok(await page.evaluate(() => document.getElementById('gd-box').classList.contains('gd-nudge')), 'o balão chacoalha para chamar a atenção');
  assert.deepEqual(errs, []); await page.close();
});
test('com o formulário aberto, o formulário fica livre e o fundo continua travado; salvar libera o passo', async () => {
  const { page, errs } = await noPasso();
  await page.evaluate(() => { const b = [...document.querySelectorAll('#main button, #main a.btn-add')].find(x => /^\s*\+\s*Novo\b/.test(x.textContent)); b.click(); }); await page.waitForTimeout(900);
  assert.ok(await page.locator('#modal-overlay.open').count()); assert.equal(await page.locator('.gd-sh').count(), 4);
  const c = await page.evaluate(() => { const r = document.getElementById('m-desc').getBoundingClientRect(); return { x: r.left + 10, y: r.top + 10 }; });
  assert.ok(!/gd-sh/.test(await topo(page, c.x, c.y)), 'campos do formulário livres');
  await page.fill('#m-date', '05/11'); await page.fill('#m-desc', 'Salário'); await page.type('#m-amount', '3200,50'); await page.waitForTimeout(300);
  await page.click('#modal-overlay .btn-save, #modal-overlay >> text=Salvar'); await page.waitForTimeout(1200);
  assert.notEqual(await page.evaluate(() => Guia.state().eval.current), 'renda', 'o passo da renda foi concluído');
  assert.deepEqual(errs, []); await page.close();
});
test('"Continuar depois" e encerrar o guia removem a trava', async () => {
  const { page } = await noPasso();
  assert.equal(await page.locator('.gd-sh').count(), 4);
  await page.click('[data-gd="mini"]'); await page.waitForTimeout(300); assert.equal(await page.locator('.gd-sh').count(), 0, 'minimizado: tudo liberado');
  await page.click('#gd-mini'); await page.waitForTimeout(500); assert.equal(await page.locator('.gd-sh').count(), 4);
  await page.evaluate(() => Guia.stop()); assert.equal(await page.locator('.gd-sh').count(), 0); await page.close();
});
test('celular: a trava também vale e não cria rolagem horizontal', async () => {
  const { page } = await noPasso({ width: 390, height: 780 });
  assert.equal(await page.locator('.gd-sh').count(), 4); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await page.close();
});

test('congelado de verdade: rolagem, teclado e Tab não saem da área liberada; o anel acompanha o alvo', async () => {
  const { page, errs } = await noPasso();
  await page.evaluate(() => { document.getElementById('main').style.minHeight = '3500px'; window.scrollTo(0, 0); }); await page.waitForTimeout(900);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.move(60, 400); await page.mouse.wheel(0, 700); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => scrollY), y0, 'roda do mouse não rola a página');
  await page.keyboard.press('PageDown'); await page.keyboard.press('Space'); await page.keyboard.press('End'); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => scrollY), y0, 'teclado não rola a página');
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); const ok = await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || !!a.closest('#gd-box') || (/^\s*\+\s*Novo\b/.test(a.textContent || '')); }); assert.ok(ok, 'Tab saiu da área liberada na volta ' + i); }
  // a página é movida por código (como animações/ajustes de layout): o anel tem que seguir o botão
  await page.evaluate(() => window.scrollBy(0, 150)); await page.waitForTimeout(250);
  const d = await page.evaluate(() => { const b = [...document.querySelectorAll('#main button, #main a.btn-add')].find(x => /^\s*\+\s*Novo\b/.test(x.textContent)).getBoundingClientRect(), r = document.getElementById('gd-ring').getBoundingClientRect(); return Math.max(Math.abs(r.left - (b.left - 6 - 3)), Math.abs(r.top - (b.top - 6 - 3))); });
  assert.ok(d <= 4, 'anel descolado do botão por ' + d + 'px');
  assert.deepEqual(errs, []); await page.close();
});
test('sem briga de rolagem: alvo é levado à tela uma vez e a posição fica estável', async () => {
  const { page } = await noPasso({ width: 406, height: 546 });
  await page.waitForTimeout(1500);
  const pos = []; for (let i = 0; i < 6; i++) { pos.push(await page.evaluate(() => Math.round(scrollY))); await page.waitForTimeout(300); }
  assert.equal(new Set(pos).size, 1, 'rolagem oscilando: ' + pos.join(',')); await page.close();
});
