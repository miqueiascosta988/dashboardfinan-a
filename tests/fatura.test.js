// Fatura de cartão: compras lidas, estorno abatido, total fechado conferido, lançamento categorizado e agrupado em Despesas
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { DI, pdfPages, fx } = require('./helpers');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port;
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
async function entity(name) { const pg = await pdfPages(fx(name)); return DI.processDocument(pg, [], { fileName: name, hint: null, contentHash: 'h' + name, newId: () => 'doc-' + name, now: '2026-11-06' }).outcomes[0].entity; }

test('leitura: 9 compras, estorno abatido, pagamento da fatura anterior ignorado e soma igual ao total fechado', async () => {
  const f = (await entity('Y_fatura_compras.pdf')).extractedData.fin, x = f.extra;
  assert.equal(f.kind, 'fatura'); assert.equal(f.amount, 821.4); assert.equal(f.date, '2026-11-12');
  assert.equal(x.compras.length, 9); assert.equal(x.comprasSoma, 821.4); assert.equal(x.diferenca, 0); assert.equal(x.estornos, 30);
  assert.ok(!x.compras.some(c => /pagamento recebido/i.test(c[1])));
  const amz = x.compras.find(c => /Amazon/.test(c[1])); assert.equal(amz[2], 182.5); assert.match(amz[1], /estorno/);
  assert.ok(x.compras.some(c => /Juros e encargos/.test(c[1]) && c[2] === 38.55));
});
test('lançamento: cada compra vira despesa categorizada (data da compra), sem lançar o total de novo, e a linha agrupa a fatura', async () => {
  const e = await entity('Y_fatura_compras.pdf'); e.extractedData.userConfirmed = true; e.extractedData.state = 'done';
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate((e) => {
    state.transactions = []; state.documents.unshift(stampDocNew(e)); const d = state.documents.find(z => z.id === e.id);
    syncDocTransaction(d); const n1 = state.transactions.length; syncDocTransaction(d); const n2 = state.transactions.length;
    const tx = state.transactions.slice(), soma = Math.round(tx.reduce((a, t) => a + t.amount, 0) * 100) / 100;
    selectedPeriod = { mode: 'all' }; const html = txRowsHtml(tx, 'expense', false);
    return { n1, n2, soma, cats: Object.fromEntries(tx.map(t => [t.desc.split(' ')[0], t.cat])), types: [...new Set(tx.map(t => t.type))], datas: tx.map(t => t.date).sort(), html, group: html.includes('Fatura Nubank'), hidden: (html.match(/data-inv=/g) || []).length };
  }, e);
  assert.equal(r.n1, 9); assert.equal(r.n2, 9); assert.equal(r.soma, 821.4); assert.deepEqual(r.types, ['expense']);
  assert.equal(r.cats.Uber, 'Transporte'); assert.equal(r.cats.Supermercado, 'Alimentação'); assert.equal(r.cats.Drogaria, 'Saúde'); assert.equal(r.cats.Posto, 'Transporte');
  assert.equal(r.datas[0], '2026-10-10'); assert.ok(r.group); assert.equal(r.hidden, 9); assert.match(r.html, /fatura fechada: <b>R\$ 821<\/b>/);
  await page.close();
});
test('excluir o documento remove todas as compras da fatura', async () => {
  const e = await entity('Y_fatura_compras.pdf'); e.extractedData.userConfirmed = true; e.extractedData.state = 'done';
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate((e) => { state.transactions = []; state.documents.unshift(stampDocNew(e)); syncDocTransaction(state.documents.find(z => z.id === e.id)); const a = state.transactions.length; deleteDoc(e.id); return { a, b: state.transactions.length }; }, e);
  assert.equal(r.a, 9); assert.equal(r.b, 0);
  await page.close();
});
