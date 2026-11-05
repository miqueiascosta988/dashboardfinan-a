// Sequência, missões, selos, nível e lembrete diário.
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const J = require('../public/jogo.js');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(b); } }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });

test('sequência: contagem, vale até o fim do dia e dia de graça (1 a cada 7 dias)', () => {
  const H = '2026-11-05', d = n => J.addDias(H, -n);
  assert.deepEqual(J.sequencia([], H), { n: 0, graca: false, hoje: false });
  assert.equal(J.sequencia([H, d(1), d(2)], H).n, 3);
  assert.deepEqual(J.sequencia([d(1), d(2)], H), { n: 2, graca: false, hoje: false }, 'ontem ainda mantém a sequência');
  assert.equal(J.sequencia([d(2), d(3)], H).n, 0, 'faltou ontem: zera');
  const g = J.sequencia([H, d(1), d(3), d(4)], H); assert.equal(g.n, 4); assert.ok(g.graca);
  assert.equal(J.sequencia([H, d(2), d(4)], H).n, 2, 'duas lacunas em menos de 7 dias: só a primeira é perdoada');
  assert.equal(J.sequencia([H, d(1), d(4)], H).n, 2, 'lacuna de 2 dias não é perdoada');
});
test('semana ISO e missões: 3 por semana, lanc5 sempre, sem repetir', () => {
  assert.equal(J.semanaKey('2026-11-05'), '2026-W45'); assert.equal(J.semanaKey('2026-01-01'), '2026-W01'); assert.equal(J.semanaKey('2027-01-03'), '2026-W53');
  for (let n = 1; n <= 53; n++) { const m = J.missoesDaSemana('2026-W' + ('0' + n).slice(-2)); assert.equal(m[0], 'lanc5'); assert.equal(new Set(m).size, 3); m.forEach(id => assert.ok(J.MISSOES[id])); }
});
test('nível a partir da nota', () => {
  assert.equal(J.nivel(null).nome, 'Sem nota ainda'); assert.equal(J.nivel(20).nome, 'Começando'); assert.equal(J.nivel(45).nome, 'Organizando'); assert.equal(J.nivel(70).nome, 'Estável'); assert.equal(J.nivel(95).nome, 'Sólido');
});
async function app(notif) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  if (notif) await page.addInitScript(() => { Object.defineProperty(navigator, 'serviceWorker', { value: undefined }); window.__n = []; window.Notification = function (t, o) { window.__n.push([t, o && o.body]); }; Notification.permission = 'granted'; Notification.requestPermission = () => Promise.resolve('granted'); });
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  await page.evaluate(() => { ['sm_jogo', 'sm_conf', 'sm_pin'].forEach(k => localStorage.removeItem(k)); state.profile_type = 'PF'; state.transactions = []; state.goals = []; state.budgets = {}; Jogo.estado().dias = []; Jogo.estado().sem = null; Jogo.estado().selos = {}; });
  return { page, errs };
}
test('registrar: sequência, missão de 5 lançamentos e selos aparecem no painel', async () => {
  const { page, errs } = await app();
  await page.evaluate(() => { switchTab('dashboard'); });
  assert.match(await page.textContent('#main'), /Comece a sua sequência/);
  const r = await page.evaluate(() => { for (let i = 0; i < 5; i++) Jogo.registrar('lanc'); Jogo.registrar('doc'); switchTab('saude'); switchTab('dashboard'); const e = Jogo.estado(); return { dias: e.dias.length, selos: Object.keys(e.selos), feitas: e.sem.feitas }; });
  assert.equal(r.dias, 1); assert.ok(r.selos.includes('primeiro-lancamento') && r.selos.includes('primeiro-doc')); assert.ok(r.feitas.includes('lanc5'));
  const t = await page.textContent('#main'); assert.match(t, /1 dia seguido/); assert.match(t, /hoje já conta/); assert.match(t, /Missões desta semana/);
  assert.deepEqual(errs, []); await page.close();
});
test('lançar de verdade (modal) e importar contam como atividade; editar não conta', async () => {
  const { page } = await app();
  await page.evaluate(() => { openTransactionModal('expense'); document.getElementById('m-desc').value = 'Mercado'; document.getElementById('m-amount').value = '50'; });
  await page.click('#modal-overlay >> text=Salvar'); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => Jogo.estado().sem.lanc), 1);
  assert.equal(await page.evaluate(() => Jogo.estado().dias.length), 1); await page.close();
});
test('sino avisa quando ainda não registrou hoje e some depois', async () => {
  const { page } = await app();
  assert.ok(await page.evaluate(() => generateNotifications().some(n => n.id.startsWith('lembrete-hoje-'))));
  await page.evaluate(() => Jogo.registrar('lanc'));
  assert.ok(!(await page.evaluate(() => generateNotifications().some(n => n.id.startsWith('lembrete-hoje-'))))); await page.close();
});
test('lembrete diário: dispara 1 vez ao dia, só se passou da hora e não registrou', async () => {
  const { page } = await app(true);
  const r = await page.evaluate(() => { const E = Jogo.estado(); E.lembrete = { on: true, hora: 0 }; E.lembrouEm = null; Jogo.checarLembrete(); Jogo.checarLembrete(); const a = window.__n.length; Jogo.registrar('lanc'); E.lembrouEm = null; Jogo.checarLembrete(); const b = window.__n.length; E.dias = []; E.lembrete.hora = 25; E.lembrouEm = null; Jogo.checarLembrete(); return { a, b, c: window.__n.length }; });
  assert.equal(r.a, 1, 'uma vez'); assert.equal(r.b, 1, 'não avisa quem já registrou'); assert.equal(r.c, 1, 'não avisa antes da hora'); await page.close();
});
test('modo simples mostra o progresso; PJ não vê o jogo', async () => {
  const { page, errs } = await app();
  await page.click('#btn-simples'); await page.waitForTimeout(300); assert.match(await page.textContent('#main'), /Seu progresso/);
  await page.click('text=Ver o app completo'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => { state.profile_type = 'PJ'; return renderDashboard(compute()).includes('Seu progresso'); }), false); assert.deepEqual(errs, []); await page.close();
});
