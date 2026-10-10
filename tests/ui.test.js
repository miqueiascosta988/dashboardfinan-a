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

test('UI: holerite enviado como "Outros" é reconhecido, guardado UMA vez e alimenta Simulador e Perfil de Renda', async () => {
  const { page, errs, ctx } = await openApp();
  fs.copyFileSync(FX('A_holerite_colunas.pdf'), '/tmp/documento_qualquer.pdf');   // nome sem pistas
  await page.setInputFiles('#doc-file-input', '/tmp/documento_qualquer.pdf'); await settle(page);
  let d = await docs(page); assert.equal(d.length, 1); assert.equal(d[0].cat, 'holerite'); assert.equal(d[0].liq, 4250.15);
  assert.match(await page.locator('#ingest-panel').innerText(), /reconhecido como holerite/);
  // Simulador CLT: mesmos dados, sem novo upload
  await page.evaluate(() => switchTab('simuladorclt'));
  const sim = await page.evaluate(() => ({ salary: SIM.salary, vars: SIM.variaveis, n: SIM.holerites.length }));
  assert.deepEqual(sim, { salary: 5000, vars: 540, n: 1 });
  assert.match(await page.locator('#main').innerText(), /09\/2026/);
  // Perfil de Renda lê os mesmos números
  await page.evaluate(() => switchTab('perfilrenda'));
  assert.match(await page.locator('#main').innerHTML(), /value="5000"/, 'Perfil de Renda usa o mesmo salário lido');
  await page.evaluate(() => switchTab('simuladorclt'));
  // reenvio pelo Simulador (outra aba) → repetido, nada somado
  await page.setInputFiles('#main input[type=file]', FX('A_holerite_colunas.pdf')); await settle(page);
  await page.waitForFunction(() => INGEST.queue().length === 2 && INGEST.queue()[1].status === 'duplicado');
  d = await docs(page); assert.equal(d.length, 1);
  assert.equal(await page.evaluate(() => SIM.holerites.length), 1);
  assert.deepEqual(errs, []); await ctx.close();
});

test('UI: duas vias + páginas repetidas + mês seguinte: média e totais corretos, sem erros', async () => {
  const { page, errs, ctx } = await openApp();
  await page.setInputFiles('#doc-file-input', [FX('B_duas_vias_na_pagina.pdf'), FX('C_paginas_repetidas.pdf'), FX('F_outubro.pdf')]); await settle(page);
  await page.waitForFunction(() => INGEST.queue().length === 3 && INGEST.queue().every(q => q.status !== 'aguardando' && q.status !== 'analisando'));
  const d = await docs(page); assert.deepEqual(d.map(x => x.comp).sort(), ['2026-09', '2026-10']);
  const s = await page.evaluate(() => ({ vars: SIM.variaveis, sal: SIM.salary })); assert.deepEqual(s, { vars: 810, sal: 5000 });
  assert.match(await page.locator('.doc-meta').first().innerText() + await page.locator('.doc-grid').innerText(), /vias contadas 1x/);
  assert.deepEqual(errs, []); await ctx.close();
});

test('UI: documento duvidoso fica "Revisar", fora dos cálculos; ao confirmar, passa a valer em todas as abas', async () => {
  const { page, errs, ctx } = await openApp();
  await page.setInputFiles('#doc-file-input', FX('H_parcial.pdf')); await settle(page);
  assert.equal(await page.evaluate(() => DocIntel.calcInputs(state.documents)), null);
  assert.match(await page.locator('#main').innerText(), /aguardam sua revisão/);
  const id = (await docs(page))[0].id;
  await page.evaluate(id => openPayslipReview(id), id);
  await page.fill('#ps-comp', '2026-09'); await page.fill('#ps-tv', '3000,00'); await page.fill('#ps-td', '300,00'); await page.fill('#ps-tl', '2700,00');
  await page.click('.btn-save');
  const d = (await docs(page))[0]; assert.equal(d.state, 'done');
  assert.deepEqual(await page.evaluate(() => { const i = DocIntel.calcInputs(state.documents); return [i.count, i.salary, SIM.salary]; }), [1, 3000, 3000]);
  assert.deepEqual(errs, []); await ctx.close();
});

test('UI: conflito (mesma competência, valores diferentes) pergunta ao usuário e não duplica', async () => {
  const { page, errs, ctx } = await openApp();
  await page.setInputFiles('#doc-file-input', FX('A_holerite_colunas.pdf')); await settle(page);
  await page.setInputFiles('#doc-file-input', FX('G_setembro_corrigido.pdf'));
  await page.waitForFunction(() => INGEST.queue().length === 2 && INGEST.queue()[1].status === 'revisar');
  assert.match(await page.locator('#ingest-panel').innerText(), /É correção/);
  assert.equal((await docs(page)).length, 1);
  await page.click('text=É correção (substituir)');
  const d = await docs(page); assert.equal(d.length, 1); assert.equal(d[0].liq, 4346.27);
  assert.deepEqual(errs, []); await ctx.close();
});
