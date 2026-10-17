// UI: assinatura lida vira lançamento + "Monitorar"; extrato PDF vira prévia de importação
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { DI, pdfPages, fx } = require('./helpers');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'text/plain'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port;
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
async function entity(name) { const pg = await pdfPages(fx(name)); return DI.processDocument(pg, [], { fileName: name, hint: null, contentHash: 'h' + name, newId: () => 'doc-' + name, now: '2026-10-20' }).outcomes[0].entity; }
async function open() {
  const page = await browser.newPage(); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  return page;
}
test('assinatura: detalhes no modal, lançamento e Monitorar sem duplicar', async () => {
  const e = await entity('X1_netflix.pdf'); e.extractedData.userConfirmed = true; e.extractedData.state = 'done';
  const page = await open();
  const r = await page.evaluate(async (e) => {
    window.checkPlanLimit = () => true; state.documents.unshift(stampDocNew(e)); state.subscriptions = state.subscriptions.filter(s => s.name !== 'Netflix'); const n0 = state.subscriptions.length;
    openDocDetailModal(e.id); const html = document.body.innerText;
    closeModal(); await addSubFromDoc(e.id); const n1 = state.subscriptions.length; await addSubFromDoc(e.id); const n2 = state.subscriptions.length;
    const sub = state.subscriptions.find(s => s.name === 'Netflix');
    return { html, n0, n1, n2, price: sub && sub.price, desc: docEvent(e).desc, cat: docEvent(e).cat };
  }, e);
  assert.match(r.html, /Padrão com anúncios/); assert.match(r.html, /4242/); assert.match(r.html, /05\/11\/2026/);
  assert.equal(r.n1, r.n0 + 1); assert.equal(r.n2, r.n1); assert.equal(r.price, 44.9); assert.match(r.desc, /Assinatura Netflix/); assert.equal(r.cat, 'Lazer');
  await page.close();
});
test('extrato PDF: abre a prévia de importação com as linhas lidas', async () => {
  const e = await entity('X6_extrato_saldo.pdf'); e.extractedData.userConfirmed = true;
  const page = await open();
  const r = await page.evaluate((e) => { state.documents.unshift(stampDocNew(e)); window.canImportFree = () => true; importStatementFromDoc(e.id); return { txt: document.body.innerText, n: pendingStatementImport && pendingStatementImport.rows.length, fmt: pendingStatementImport && pendingStatementImport.format }; }, e);
  assert.equal(r.n, 7); assert.equal(r.fmt, 'PDF'); assert.match(r.txt, /PIX RECEBIDO MARIA TESTE/); assert.match(r.txt, /Importar selecionadas/);
  await page.close();
});
