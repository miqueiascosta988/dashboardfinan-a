// Achados da rodada de teste como cliente: texto do "Excluir tudo", transbordo no tablet, exportação legível.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('exportação: data com ano e valor com 2 casas e vírgula', async () => {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { state.transactions = [{ id: 'a', date: '05/11', desc: 'Salário', cat: 'Trabalho', amount: 3200.5, type: 'income', recur: false }, { id: 'b', date: '2025-03-09', desc: 'Luz', cat: 'Moradia', amount: 100, type: 'expense', recur: true }]; return exportRowsTx(); });
  const y = new Date().getFullYear();
  assert.deepEqual(r.map(x => [x[0], x[4]]).sort(), [['05/11/' + y, '3200,50'], ['09/03/2025', '100,00']].sort());
  await page.close();
});
test('Excluir tudo: singular correto e sem transbordo no tablet', async () => {
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } }); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const w = await page.evaluate(() => { switchTab('dashboard'); return [document.documentElement.scrollWidth, innerWidth]; });
  await page.waitForTimeout(400); assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 770, 'sem rolagem horizontal');
  const t = await page.evaluate(() => { state.transactions = [{ id: 'a', date: '05/11', desc: 'x', cat: 'Moradia', amount: 1, type: 'expense', recur: false }]; switchTab('despesas'); document.querySelector('.btn-danger').click(); return document.getElementById('modal-overlay').innerText; });
  assert.match(t, /o único lançamento/); assert.doesNotMatch(t, /1 lançamentos/);
  await page.close();
});
test('sem dados: Estratégia e Insights não afirmam reserva completa, risco baixo nem score', async () => {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const t = await page.evaluate(() => { state.transactions = []; state.debts = []; state.goals = []; state.assets = []; state.liabilities = []; state.subscriptions = []; state.documents = []; state.monthlyIncome = 0; const o = {}; switchTab('estrategia'); o.est = document.getElementById('main').innerText; switchTab('insights'); o.ins = document.getElementById('main').innerText; return o; });
  assert.doesNotMatch(t.est, /Reserva de emergência completa|Finanças equilibradas|Livre de dívidas|68\/100|\d+\/100/);
  assert.match(t.est, /Registre sua renda e seus gastos/);
  assert.doesNotMatch(t.ins, /pp abaixo|Baixo/); assert.match(t.ins, /Sem dados|Registre seus gastos/);
  assert.deepEqual(errs, []); await page.close();
});
test('renda do cadastro absurda (3,20) é sinalizada e corrigível; renda normal não mostra o aviso', async () => {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { DEMO.on = false; state.monthlyIncome = 3.2; const a = rendaCadastroCard(); state.monthlyIncome = 3200; const b = rendaCadastroCard(); state.monthlyIncome = 0; const c = rendaCadastroCard(); DEMO.on = true; return [a, b, c]; });
  assert.match(r[0], /R\$ 3,20/); assert.equal(r[1], ''); assert.equal(r[2], '');
  await page.close();
});
test('conta de exemplo conferida à mão: projeção, reserva (mesma meta em Estratégia e Insights)', async () => {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const m = String(new Date().getMonth() + 1).padStart(2, '0');
  const r = await page.evaluate((m) => {
    state.profile_type = 'PF'; state.goals = []; state.subscriptions = []; state.documents = [];
    const T = (d, desc, cat, amt, type) => ({ id: genId(), date: d + '/' + m, desc, cat, amount: amt, type, recur: false });
    state.transactions = [T('05', 'Salário', 'Trabalho', 5000, 'income'), T('06', 'Aluguel', 'Moradia', 1500, 'expense'), T('07', 'Mercado', 'Alimentação', 800, 'expense'), T('08', 'Ônibus', 'Transporte', 400, 'expense'), T('09', 'Cinema', 'Lazer', 300, 'expense')];
    state.debts = []; state.assets = [{ id: genId(), name: 'Poupança', value: 6000, cat: 'Reserva' }]; state.liabilities = [];
    const o = { rm: getReserveMonths() }; switchTab('projecao'); o.proj = [...document.querySelectorAll('.data-table tbody tr')].map(x => [...x.children].map(y => y.innerText));
    switchTab('estrategia'); o.est = document.getElementById('main').innerText; switchTab('insights'); o.ins = document.getElementById('main').innerText; return o;
  }, m);
  const exp = (rate) => { const mr = Math.pow(1 + rate, 1 / 12) - 1; let a = 6000; const ys = []; for (let y = 0; y < 5; y++) { for (let k = 0; k < 12; k++) a = a * (1 + mr) + 2000; ys.push(Math.round(a)); } return ys; };
  const num = s => Math.round(parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')));
  [[1, .03], [2, .06], [3, .10]].forEach(([col, rate]) => assert.deepEqual(r.proj.map(row => num(row[col])), exp(rate)));
  const alvo = 3000 * r.rm, falta = alvo - 6000, fmtBR = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  assert.ok(r.est.includes('Meta: R$ ' + fmtBR(alvo)) && r.est.includes('(' + r.rm + ' meses de despesas)'), 'Estratégia usa a meta do perfil');
  assert.ok(r.ins.includes('Faltam R$ ' + fmtBR(falta)) && r.ins.includes('O ideal é ter ' + r.rm + ' meses'), 'Insights usa a mesma meta');
  assert.deepEqual(errs, []); await page.close();
});
