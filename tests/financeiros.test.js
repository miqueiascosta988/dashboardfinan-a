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



const send = async (page, f) => { await page.setInputFiles('#doc-file-input', FX(f)); await settle(page); };
const all = page => page.evaluate(() => state.transactions.map(t => ({ id: t.id, type: t.type, amount: t.amount, date: t.date, desc: t.desc, cat: t.cat })));
const fresh = async () => { const o = await openApp(); await o.page.evaluate(() => { state.transactions = []; state.debts = []; state.doc_number = '12345678000195'; state.doc_type = 'cnpj'; }); return o; };

test('Docs financeiros: boleto vira DESPESA na data de vencimento, categoria deduzida, painel soma, reenvio não duplica', async () => {
  const { page, errs, ctx } = await fresh();
  await send(page, 'M_boleto_valido.pdf');
  let t = await all(page); assert.equal(t.length, 1); assert.deepEqual([t[0].type, t[0].amount, t[0].date, t[0].cat], ['expense', 260, '2026-10-10', 'Moradia']);
  await page.evaluate(() => { selectedPeriod = { mode: 'all' }; }); assert.equal(await page.evaluate(() => compute().totalExpense), 260);
  await send(page, 'M_boleto_valido.pdf'); assert.equal((await all(page)).length, 1);
  assert.deepEqual(errs, []); await ctx.close();
});
test('Docs financeiros: boleto com valor impresso diferente do código da linha digitável NÃO lança; corrigido pelo usuário, lança', async () => {
  const { page, ctx } = await fresh();
  await send(page, 'N_boleto_valor_divergente.pdf'); assert.equal((await all(page)).length, 0);
  assert.equal(await page.evaluate(() => state.documents[0].extractedData.state), 'needs_review');
  await page.evaluate(() => openFinReview(state.documents[0].id)); await page.fill('#fr-val', '260,00'); await page.evaluate(() => saveFinReview(state.documents[0].id));
  const t = await all(page); assert.equal(t.length, 1); assert.equal(t[0].amount, 260); await ctx.close();
});
test('Docs financeiros: mesmo boleto com valor diferente pergunta (conflito) e não soma', async () => {
  const { page, ctx } = await fresh();
  await send(page, 'M_boleto_valido.pdf'); await send(page, 'N_boleto_valor_divergente.pdf');
  assert.equal(await page.evaluate(() => INGEST.queue().slice(-1)[0].status), 'revisar'); assert.equal((await all(page)).length, 1); await ctx.close();
});
test('Docs financeiros: fatura com total lança despesa no vencimento; fatura só com "pagamento mínimo" não lança', async () => {
  const { page, ctx } = await fresh();
  await send(page, 'K_fatura.pdf'); assert.equal((await all(page)).length, 0);
  await send(page, 'O_fatura_total.pdf'); const t = await all(page); assert.equal(t.length, 1); assert.deepEqual([t[0].type, t[0].amount, t[0].date], ['expense', 1234.56, '2026-11-15']); await ctx.close();
});
test('Docs financeiros: DAS vira despesa de imposto', async () => {
  const { page, ctx } = await fresh(); await send(page, 'P_das.pdf');
  const t = await all(page); assert.equal(t.length, 1); assert.deepEqual([t[0].type, t[0].amount, t[0].date], ['expense', 75.6, '2026-10-20']); assert.match(t[0].desc, /DAS/); await ctx.close();
});
test('Docs financeiros: nota fiscal — emitida por mim ENTRA, recebida SAI, de terceiros pergunta', async () => {
  const { page, ctx } = await fresh(); await page.evaluate(() => { state.profile_type = 'PJ'; });
  await send(page, 'Q_nf_emitida.pdf'); await send(page, 'R_nf_recebida.pdf'); await send(page, 'S_nf_terceiros.pdf');
  const t = await all(page); assert.equal(t.length, 2);
  assert.deepEqual(t.filter(x => x.amount === 1500).map(x => x.type), ['income']); assert.deepEqual(t.filter(x => x.amount === 820).map(x => x.type), ['expense']);
  await page.evaluate(() => { const d = state.documents.find(x => x.extractedData.fin && x.extractedData.fin.amount === 99.9); openFinReview(d.id); });
  await page.selectOption('#fr-dir', 'out'); await page.evaluate(() => saveFinReview(state.documents.find(x => x.extractedData.fin.amount === 99.9).id));
  assert.equal((await all(page)).length, 3); await ctx.close();
});
test('Docs financeiros: sem CPF/CNPJ cadastrado, a direção da nota NÃO é adivinhada', async () => {
  const { page, ctx } = await fresh(); await page.evaluate(() => { state.doc_number = null; state.profile_type = 'PJ'; });
  await send(page, 'Q_nf_emitida.pdf'); assert.equal((await all(page)).length, 0); assert.equal(await page.evaluate(() => state.documents[0].extractedData.fin.direction), 'unknown'); await ctx.close();
});
test('Docs financeiros: empréstimo vira DÍVIDA (saldo, parcela, prazo, juros); reenvio não duplica; excluir remove', async () => {
  const { page, ctx } = await fresh();
  await send(page, 'T_emprestimo.pdf'); let d = await page.evaluate(() => state.debts.map(z => [z.saldo, z.mensal, z.parcelas, z.juros]));
  assert.deepEqual(d, [[12000, 480, 24, 2.5]]); await send(page, 'T_emprestimo.pdf'); assert.equal(await page.evaluate(() => state.debts.length), 1);
  assert.equal((await all(page)).length, 0);   // dívida não é despesa do mês
  await page.evaluate(() => deleteDoc(state.documents[0].id)); assert.equal(await page.evaluate(() => state.debts.length), 0); await ctx.close();
});
test('Docs financeiros: excluir o documento remove só o lançamento que ele criou', async () => {
  const { page, ctx } = await fresh(); await send(page, 'M_boleto_valido.pdf');
  await page.evaluate(() => deleteDoc(state.documents[0].id)); assert.equal((await all(page)).length, 0); await ctx.close();
});
