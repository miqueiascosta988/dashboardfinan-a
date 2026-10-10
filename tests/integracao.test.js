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


const txs = page => page.evaluate(() => state.transactions.filter(t => t.type === 'income' && /Salário líquido/.test(t.desc)).map(t => ({ id: t.id, date: t.date, amount: t.amount, desc: t.desc, cat: t.cat })));
const send = async (page, f) => { await page.setInputFiles('#doc-file-input', FX(f)); await settle(page); };

test('Integração: holerite vira UMA receita (líquido, 5º dia do mês seguinte), reenvio não duplica, e o painel soma', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => { state.transactions = []; });
  await send(page, 'A_holerite_colunas.pdf');
  let t = await txs(page); assert.equal(t.length, 1); assert.equal(t[0].amount, 4250.15); assert.equal(t[0].date, '2026-10-05'); assert.match(t[0].desc, /09\/2026/);
  await page.evaluate(() => { selectedPeriod = { mode: 'all' }; });
  assert.equal(await page.evaluate(() => compute().totalIncome), 4250.15);   // alimenta o painel
  await send(page, 'A_holerite_colunas.pdf'); await send(page, 'B_duas_vias_na_pagina.pdf');   // mesmo arquivo e duas vias
  assert.equal((await txs(page)).length, 1);
  assert.equal(await page.evaluate(() => compute().totalIncome), 4250.15);
  await send(page, 'F_outubro.pdf'); t = await txs(page); assert.equal(t.length, 2);   // outro mês = outra receita
  assert.deepEqual(errs, []); await ctx.close();
});

test('Integração: correção (mesma competência) atualiza o MESMO lançamento; excluir o documento remove o lançamento', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => { state.transactions = []; });
  await send(page, 'A_holerite_colunas.pdf');
  await send(page, 'G_setembro_corrigido.pdf');
  const id = await page.evaluate(() => INGEST.queue().slice(-1)[0].id);
  await page.evaluate(id => ingestResolve(id, 0, 'replace'), id);
  await page.waitForTimeout(300);
  const t = await txs(page); assert.equal(t.length, 1); assert.equal(t[0].amount, 4346.27);
  await page.evaluate(() => deleteDoc(state.documents[0].id));
  assert.equal((await txs(page)).length, 0); await ctx.close();
});

test('Integração: receita já digitada à mão no mesmo valor/mês não é duplicada; excluir o documento NÃO apaga o lançamento manual', async () => {
  const { page, ctx } = await openApp();
  await page.evaluate(() => { state.transactions = [{ id: crypto.randomUUID(), date: '2026-10-05', desc: 'Salário', cat: 'Trabalho', amount: 4250.15, type: 'income', recur: false, profile: 'ambos' }]; });
  await send(page, 'A_holerite_colunas.pdf');
  assert.equal(await page.evaluate(() => state.transactions.filter(t => t.type === 'income').length), 1);
  await page.evaluate(() => deleteDoc(state.documents[0].id));
  assert.equal(await page.evaluate(() => state.transactions.length), 1); await ctx.close();
});

test('Integração: documento duvidoso/ilegível NÃO gera receita até ser confirmado; ao confirmar, gera', async () => {
  const { page, ctx } = await openApp();
  await page.evaluate(() => { state.transactions = []; });
  await send(page, 'I_digitalizado.pdf'); await send(page, 'H_parcial.pdf');
  assert.equal((await txs(page)).length, 0);
  await page.evaluate(() => { const d = state.documents.find(x => x.extractedData.payslip); const p = d.extractedData.payslip; p.competencia = '2026-08'; p.totals = { venc: 3000, desc: 500, liquido: 2500 }; d.extractedData.userConfirmed = true; d.extractedData.state = 'done'; syncDocTransaction(d); });
  const t = await txs(page); assert.equal(t.length, 1); assert.equal(t[0].amount, 2500); assert.equal(t[0].date, '2026-09-05'); await ctx.close();
});
