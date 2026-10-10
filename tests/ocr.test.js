// Teste de ponta a ponta no navegador (Chromium): upload → fila → armazenamento central → abas relacionadas.
// pdf.js real (mesmo parser) é servido localmente porque o sandbox não alcança o CDN.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http');
const test = require('node:test'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', 'public'), FX = n => path.join(__dirname, 'fixtures', n);
const PDFJS = process.env.PDFJS_DIR || '/home/claude/.npm-global/lib/node_modules/pdfjs-dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json', '.mjs': 'text/javascript' };
let server, base, browser;
test.before(async () => {
  server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = u.startsWith('/__pdfjs/') ? path.join(PDFJS, 'legacy/build', u.slice(9)) : path.join(ROOT, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
  await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });

async function openApp() {
  const ctx = await browser.newContext(), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.abort());   // sem internet no teste (registrada primeiro: as rotas abaixo têm prioridade)
  await page.route('**/pdfjs-dist@3.11.174/build/pdf.min.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/pdfjs-dist@3.11.174/build/pdf.worker.min.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(PDFJS, 'legacy/build/pdf.worker.mjs')) }));
  await page.goto(base + '/index.html?demo=clt'); await page.waitForFunction(() => typeof startDemo === 'function' && document.getElementById('app-screen') && !document.getElementById('app-screen').hidden, null, { timeout: 15000 });
  await page.evaluate(async b => { const m = await import(b + '/__pdfjs/pdf.mjs'); window.pdfjsLib = m; }, base);
  await page.evaluate(() => { state.documents = []; switchTab('documentos'); });
  return { page, errs, ctx };
}
const settle = page => page.waitForFunction(() => INGEST && INGEST.queue().every(q => ['concluido', 'duplicado', 'revisar', 'erro'].includes(q.status)) && INGEST.queue().length > 0, null, { timeout: 20000 });
const docs = page => page.evaluate(() => state.documents.map(d => ({ id: d.id, cat: d.category, state: d.extractedData.state, liq: d.extractedData.payslip && d.extractedData.payslip.totals.liquido, comp: d.extractedData.payslip && d.extractedData.payslip.competencia })));




const send = async (page, f) => {
  const n = await page.evaluate(() => (INGEST ? INGEST.queue().length : 0));
  await page.setInputFiles('#doc-file-input', FX(f));
  await page.waitForFunction(k => INGEST && INGEST.queue().length > k && INGEST.queue().every(q => ['concluido', 'duplicado', 'revisar', 'erro'].includes(q.status)), n, { timeout: 60000 });
};
const txs = page => page.evaluate(() => state.transactions.map(t => ({ type: t.type, amount: t.amount, date: t.date })));
const fresh = async () => { const o = await openApp(); await o.page.evaluate(() => { state.transactions = []; state.debts = []; state.documents = []; }); return o; };
const payslip = page => page.evaluate(() => state.documents.map(d => ({ state: d.extractedData.state, ocr: !!d.extractedData.ocr, liq: d.extractedData.payslip && d.extractedData.payslip.totals.liquido, comp: d.extractedData.payslip && d.extractedData.payslip.competencia, fin: d.extractedData.fin && d.extractedData.fin.amount })));

test('OCR: holerite escaneado (imagem) é lido, mas NÃO lança sozinho; após o usuário confirmar, lança', async () => {
  const { page, errs, ctx } = await fresh();
  await send(page, 'OCR_A_holerite_colunas.png');
  const d = await payslip(page); assert.equal(d.length, 1); assert.deepEqual([d[0].ocr, d[0].state, d[0].liq, d[0].comp], [true, 'needs_review', 4250.15, '2026-09']);
  assert.equal((await txs(page)).length, 0);
  await page.evaluate(() => openPayslipReview(state.documents[0].id)); await page.evaluate(() => savePayslipReview(state.documents[0].id));
  const t = await txs(page); assert.equal(t.length, 1); assert.equal(t[0].amount, 4250.15);
  assert.deepEqual(errs, []); await ctx.close();
});
test('OCR: foto torta, com ruído e compressão, é endireitada e lida; fica em revisão', async () => {
  const { page, ctx } = await fresh(); await send(page, 'OCR_A_holerite_foto.jpg');
  const d = await payslip(page); assert.equal(d.length, 1); assert.deepEqual([d[0].ocr, d[0].state, d[0].liq], [true, 'needs_review', 4250.15]); assert.equal((await txs(page)).length, 0); await ctx.close();
});
test('OCR: PDF escaneado (só imagem) passa pelo OCR e vai para revisão sem lançar valor', async () => {
  const { page, ctx } = await fresh(); await send(page, 'OCR_A_holerite_escaneado.pdf');
  const d = await payslip(page); assert.equal(d.length, 1); assert.equal(d[0].ocr, true); assert.equal(d[0].comp, '2026-09'); assert.equal(d[0].state, 'needs_review'); assert.equal((await txs(page)).length, 0); await ctx.close();
});
test('OCR: boleto e fatura em imagem são lidos; lançam só depois da confirmação', async () => {
  const { page, ctx } = await fresh(); await send(page, 'OCR_M_boleto_valido.png'); await send(page, 'OCR_O_fatura_total.png');
  const d = await payslip(page); assert.deepEqual(d.map(x => x.fin).sort((a, b) => a - b), [260, 1234.56]); assert.ok(d.every(x => x.ocr && x.state === 'needs_review')); assert.equal((await txs(page)).length, 0);
  await page.evaluate(() => state.documents.forEach(x => { openFinReview(x.id); saveFinReview(x.id); }));
  const t = await txs(page); assert.deepEqual(t.map(x => x.amount).sort((a, b) => a - b), [260, 1234.56]); assert.ok(t.every(x => x.type === 'expense')); await ctx.close();
});
test('OCR: a mesma imagem enviada duas vezes, e o mesmo holerite em PDF de texto + imagem, contam uma vez', async () => {
  const { page, ctx } = await fresh();
  await send(page, 'OCR_A_holerite_colunas.png'); await send(page, 'OCR_A_holerite_colunas.png'); assert.equal((await payslip(page)).length, 1);
  await send(page, 'A_holerite_colunas.pdf'); assert.equal((await payslip(page)).length, 1); await ctx.close();
});
test('OCR indisponível (falha ao carregar o leitor): não quebra, vai para revisão manual e não lança nada', async () => {
  const { page, errs, ctx } = await fresh(); await page.evaluate(() => { window.ocrGetWorker = async () => { throw new Error('Leitor de imagens (OCR) indisponível agora.'); }; });   // simula falha de carregamento do OCR
  await send(page, 'OCR_M_boleto_valido.png'); const d = await page.evaluate(() => state.documents.map(x => ({ st: x.extractedData.state, un: !!x.extractedData.unreadable })));
  assert.deepEqual(d, [{ st: 'needs_review', un: true }]); assert.equal((await txs(page)).length, 0); assert.deepEqual(errs, []); await ctx.close();
});
