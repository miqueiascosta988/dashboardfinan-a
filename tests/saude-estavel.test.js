// AUD-01 e AUD-02: a nota de saúde não depende do período escolhido e a reserva conta só ativos líquidos.
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
const nota = (ativos) => page => page.evaluate((ativos) => {
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth(); state.transactions = [];
  for (let k = 0; k < 12; k++) { const d = new Date(y, mo - k, 5), ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-05'; state.transactions.push({ id: 'i' + k, type: 'income', amount: 5000, date: ds, desc: 'Salário', cat: 'Salário', recur: false, profile: state.profile_type }, { id: 'e' + k, type: 'expense', amount: 3000, date: ds, desc: 'Gastos', cat: 'Outros', recur: false, profile: state.profile_type }); }
  state.debts = [{ id: 'd1', name: 'Cartão', saldo: 2000, mensal: 300 }]; state.assets = ativos;
  const per = mode => { selectedPeriod = { month: mo, year: y, startDate: null, endDate: null, mode }; };
  per('month'); const a = compute(); per('all'); const b = compute();
  return { mes: a.healthTotal, todos: b.healthTotal, itensMes: a.healthItems.map(i => i.score), itensTodos: b.healthItems.map(i => i.score), reserva: a.healthItems[0].score };
}, ativos);
const abrir = async () => { const page = await browser.newPage(); page._errs = []; page.on('pageerror', e => page._errs.push(e.message)); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500); return page; };
test('AUD-01: a nota é a mesma com o período "mês" e "todos"', async () => {
  const page = await abrir(); const r = await nota([{ id: 'a1', name: 'Reserva investimentos', value: 18000 }])(page);
  assert.equal(r.mes, r.todos); assert.deepEqual(r.itensMes, r.itensTodos); assert.equal(r.reserva, 96, '18.000 / 3.000 = 6 meses x 16'); assert.deepEqual(page._errs, []); await page.close();
});
test('AUD-02: apartamento não vira reserva; ativo marcado como líquido conta; marcado como não líquido não conta', async () => {
  const page = await abrir();
  const imovel = await nota([{ id: 'a2', name: 'Apartamento', value: 600000 }])(page);
  assert.equal(imovel.reserva, 0, 'sem ativo líquido, reserva zero');
  const marcadoLiquido = await nota([{ id: 'a3', name: 'Meu dinheiro guardado', value: 18000, liquid: true }])(page);
  assert.equal(marcadoLiquido.reserva, 96);
  const marcadoNao = await nota([{ id: 'a4', name: 'Reserva do carro', value: 18000, liquid: false }])(page);
  assert.equal(marcadoNao.reserva, 0, 'a escolha explícita vale mais que o nome');
  await page.close();
});
test('modal de ativo mostra a pergunta de liquidez e grava a escolha', async () => {
  const page = await abrir();
  const r = await page.evaluate(async () => { window.showToast = () => {}; window.dbUpsert = async (t, row) => { window.__row = row; }; openAssetModal('assets'); const ok = !!document.getElementById('m-aliq');
    document.getElementById('m-aname').value = 'Poupança'; document.getElementById('m-aval').value = '1000'; document.getElementById('m-aliq').value = 'sim'; await saveAsset('assets'); return { ok, cat: window.__row.category, liq: state.assets[state.assets.length - 1].liquid }; });
  assert.equal(r.ok, true); assert.equal(r.cat, 'Líquido'); assert.equal(r.liq, true); await page.close();
});
