// Recuperação: documento lido cujo lançamento sumiu volta a ser distribuído (Renda, painel, Agenda), sem duplicar e respeitando exclusão deliberada.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http');
const test = require('node:test'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', 'public'), FX = n => path.join(__dirname, 'fixtures', n);
const PDFJS = process.env.PDFJS_DIR || '/home/claude/.npm-global/lib/node_modules/pdfjs-dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json', '.mjs': 'text/javascript' };
let server, base, browser;
test.before(async () => {
  server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = u.startsWith('/__pdfjs/') ? path.join(PDFJS, 'legacy/build', u.slice(9)) : path.join(ROOT, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });
async function openApp() {
  const ctx = await browser.newContext(), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.abort());
  await page.route('**/pdfjs-dist@3.11.174/build/pdf.min.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/pdfjs-dist@3.11.174/build/pdf.worker.min.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(PDFJS, 'legacy/build/pdf.worker.mjs')) }));
  await page.addInitScript(() => { window.AG_TODAY = '2026-10-12'; });
  await page.goto(base + '/index.html?demo=clt'); await page.waitForFunction(() => typeof startDemo === 'function' && typeof docsHeal === 'function' && document.getElementById('app-screen') && !document.getElementById('app-screen').hidden, null, { timeout: 20000 });
  await page.evaluate(async b => { const m = await import(b + '/__pdfjs/pdf.mjs'); window.pdfjsLib = m; }, base);
  await page.evaluate(() => { state.documents = []; state.transactions = []; state.finEvents = []; selectedPeriod = { month: 9, year: 2026, startDate: null, endDate: null, mode: 'month' }; switchTab('documentos'); });
  return { page, errs, ctx };
}
const settle = page => page.waitForFunction(() => INGEST && INGEST.queue().length > 0 && INGEST.queue().every(q => ['concluido', 'duplicado', 'revisar', 'erro'].includes(q.status)), null, { timeout: 25000 });
const st = page => page.evaluate(() => ({ tx: state.transactions.filter(t => t.type === 'income').map(t => t.amount), ev: state.finEvents.filter(e => e.status !== 'cancelled').length, inc: compute().totalIncome, txId: state.documents[0] && state.documents[0].extractedData.txId }));

test('lançamento que sumiu (ex.: falha ao salvar) é recuperado, uma única vez, e a Renda/painel voltam a mostrar o líquido', async () => {
  const { page, errs, ctx } = await openApp();
  await page.setInputFiles('#doc-file-input', FX('A_holerite_colunas.pdf')); await settle(page);
  let s = await st(page); assert.deepEqual(s.tx, [4250.15]); assert.equal(s.inc, 4250.15);
  await page.evaluate(() => { state.transactions = []; state.finEvents = []; });            // simula: documento ficou, lançamento/agenda não
  s = await st(page); assert.equal(s.inc, 0); assert.ok(s.txId);                           // o documento ainda aponta para um lançamento que não existe
  await page.evaluate(() => docsHeal()); await page.evaluate(() => docsHeal());
  s = await st(page); assert.deepEqual(s.tx, [4250.15]); assert.equal(s.inc, 4250.15); assert.ok(s.ev >= 1);
  assert.deepEqual(errs, []); await ctx.close();
});
test('exclusão deliberada do lançamento é respeitada; o botão Lançar do documento refaz quando você pede', async () => {
  const { page, errs, ctx } = await openApp();
  await page.setInputFiles('#doc-file-input', FX('A_holerite_colunas.pdf')); await settle(page);
  const id = await page.evaluate(() => state.transactions[0].id); await page.evaluate(i => deleteTransaction(i), id);
  await page.evaluate(() => docsHeal()); assert.equal((await st(page)).tx.length, 0);        // você apagou: não volta sozinho
  await page.evaluate(() => createTransactionFromDoc(state.documents[0].id));                  // você pediu: volta
  const s = await st(page); assert.deepEqual(s.tx, [4250.15]); assert.equal(s.inc, 4250.15);
  assert.deepEqual(errs, []); await ctx.close();
});

test('layout "RECIBO DE PAGAMENTO" (itens informativos, "Total Liquido -->"): lido, líquido distribuído para Renda, painel e Agenda', async () => {
  const { page, errs, ctx } = await openApp();
  await page.setInputFiles('#doc-file-input', FX('V_recibo_informativos.pdf')); await settle(page);
  const d = await page.evaluate(() => { const x = state.documents[0].extractedData; return { st: x.state, comp: x.payslip.competencia, liq: x.payslip.totals.liquido }; });
  assert.deepEqual(d, { st: 'done', comp: '2026-09', liq: 1718.74 });
  const s = await st(page); assert.deepEqual(s.tx, [1718.74]); assert.equal(s.inc, 1718.74); assert.ok(s.ev >= 1);
  await page.evaluate(() => switchTab('dashboard')); assert.match(await page.textContent('#main'), /1\.719|1\.718/);
  assert.deepEqual(errs, []); await ctx.close();
});
