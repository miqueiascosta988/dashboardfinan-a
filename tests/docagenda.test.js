// Documentos → Agenda: holerite, contas, boletos, faturas, guias e dívidas viram eventos que ENTRAM ou SAEM, sem duplicar.
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
  await page.addInitScript(() => { window.AG_TODAY = '2026-10-10'; });
  await page.goto(base + '/index.html?demo=clt'); await page.waitForFunction(() => typeof startDemo === 'function' && typeof FinPlan === 'object' && typeof agendaFromDoc === 'function' && document.getElementById('app-screen') && !document.getElementById('app-screen').hidden, null, { timeout: 20000 });
  await page.evaluate(async b => { const m = await import(b + '/__pdfjs/pdf.mjs'); window.pdfjsLib = m; }, base);
  await page.evaluate(() => { state.documents = []; state.transactions = []; state.debts = []; state.finEvents = []; state.finPlans = []; state.profile_type = 'PF'; switchTab('documentos'); });
  return { page, errs, ctx };
}
const settle = page => page.waitForFunction(() => INGEST && INGEST.queue().length > 0 && INGEST.queue().every(q => ['concluido', 'duplicado', 'revisar', 'erro'].includes(q.status)), null, { timeout: 25000 });
const send = async (page, f) => { await page.evaluate(() => { try { INGEST.clear && INGEST.clear(); } catch (e) {} }); await page.setInputFiles('#doc-file-input', FX(f)); await settle(page); };
const evs = page => page.evaluate(() => state.finEvents.map(e => ({ key: e.key, kind: e.kind, title: e.title, due: e.dueDate, st: e.status, amount: e.amount, cat: e.category, notes: e.notes, origin: e.origin, ref: e.sourceRef })));

test('Holerite → agenda: ENTRA, dia estimado, detalhamento bruto/descontos/líquido, previsão dos próximos meses, sem duplicar no reenvio', async () => {
  const { page, errs, ctx } = await openApp();
  await send(page, 'A_holerite_colunas.pdf');
  let e = await evs(page); const main = e.find(x => x.key.endsWith(':0'));
  assert.equal(main.kind, 'income'); assert.equal(main.due, '2026-10-05'); assert.equal(main.amount, 4250.15); assert.equal(main.st, 'awaiting');   // data já passou: não marca recebido sozinho
  assert.match(main.notes, /ENTRA/); assert.match(main.notes, /líquido/i); assert.match(main.notes, /Data estimada/);
  const proj = e.filter(x => x.key.includes(':p')); assert.deepEqual(proj.map(x => x.due).sort(), ['2026-11-05', '2026-12-05']); assert.ok(proj.every(x => x.st === 'pending' && /previsto/.test(x.title)));
  await send(page, 'A_holerite_colunas.pdf'); assert.equal((await evs(page)).length, e.length);   // mesmo arquivo: nada novo
  await page.evaluate(() => switchTab('agenda'));
  assert.ok(await page.$('[data-ev][data-dir="in"] .ag-dir-in'));
  assert.deepEqual(errs, []); await ctx.close();
});

test('Holerite do mês seguinte substitui a previsão do mesmo mês; excluir o documento cancela os eventos dele', async () => {
  const { page, errs, ctx } = await openApp();
  await send(page, 'A_holerite_colunas.pdf'); await send(page, 'F_outubro.pdf');
  const e = await evs(page);
  const nov = e.filter(x => x.kind === 'income' && x.due.startsWith('2026-11') && x.st !== 'cancelled'); assert.equal(nov.length, 1); assert.ok(!/previsto/.test(nov[0].title));
  const id = await page.evaluate(() => state.documents[0].id); await page.evaluate(i => deleteDoc(i), id);
  const st = await page.evaluate(i => state.finEvents.filter(x => x.key.includes(i)).map(x => x.status), id); assert.ok(st.length > 0 && st.every(x => x === 'cancelled'));
  const rest = await page.evaluate(() => state.finEvents.filter(x => x.status !== 'cancelled' && x.key.endsWith(':0')).length); assert.equal(rest, 1);   // o outro holerite continua
  assert.deepEqual(errs, []); await ctx.close();
});

test('Conta/boleto, fatura e guia → agenda como SAI com vencimento; fatura mostra mínimo; reenvio não duplica; pagar não duplica o lançamento', async () => {
  const { page, errs, ctx } = await openApp();
  await send(page, 'M_boleto_valido.pdf'); await send(page, 'K_fatura.pdf'); await send(page, 'P_das.pdf');
  assert.equal((await evs(page)).filter(x => /Fatura/.test(x.title)).length, 0);         // fatura sem total legível fica em "Revisar": nada entra na agenda antes de você confirmar
  await page.evaluate(() => { const d = state.documents.find(z => z.category === 'fatura'); d.extractedData.fin.amount = 1800; d.extractedData.userConfirmed = true; syncDocTransaction(d); });
  const e = await evs(page), out = e.filter(x => x.kind === 'payable' && !x.key.includes(':p'));
  assert.equal(out.length, 3);
  const fat = out.find(x => /Fatura/.test(x.title)); assert.equal(fat.due, '2026-10-15'); assert.equal(fat.st, 'pending'); assert.match(fat.notes, /SAI/); assert.match(fat.notes, /mínimo/);
  const das = out.find(x => /DAS/.test(x.title)); assert.equal(das.due, '2026-10-20'); assert.equal(das.amount, 75.6);
  assert.ok(e.some(x => x.key.includes(':p') && /Fatura/.test(x.title)));       // fatura é recorrente: previsão
  await page.evaluate(() => state.documents.filter(z => z.category === 'fatura').forEach(d => syncDocTransaction(d))); assert.equal((await evs(page)).length, e.length);   // sincronizar de novo não duplica
  const txBefore = await page.evaluate(() => state.transactions.length);
  const id = await page.evaluate(() => state.finEvents.find(x => /Fatura/.test(x.title) && !x.key.includes(':p')).id);
  await page.evaluate(i => { agPayModal(i); return agPay(i); }, id);
  assert.equal(await page.evaluate(() => state.transactions.length), txBefore);   // o documento já tinha lançado: sem duplicar
  assert.equal(await page.evaluate(i => state.finEvents.find(x => x.id === i).status, id), 'paid');
  await page.evaluate(() => switchTab('agenda'));
  assert.ok(await page.$('[data-ev][data-dir="out"] .ag-dir-out'));
  assert.deepEqual(errs, []); await ctx.close();
});

test('Dívida: contrato com dia de vencimento vira parcelas SAI na agenda; sem o dia, pede a informação (não inventa)', async () => {
  const { page, errs, ctx } = await openApp();
  await send(page, 'U_emprestimo_dia.pdf');
  let e = await evs(page).then(r => r.filter(x => x.key.includes(':d'))); assert.equal(e.length, 6);
  assert.equal(e[0].due, '2026-10-10'); assert.equal(e[5].due, '2027-03-10'); assert.ok(e.every(x => x.kind === 'payable' && x.amount === 500 && x.cat === 'Dívidas' && x.ref));
  assert.equal(await page.evaluate(() => state.debts.length), 1);
  await page.evaluate(() => { state.documents = []; state.debts = []; state.finEvents = []; });
  await send(page, 'T_emprestimo.pdf');
  assert.equal((await evs(page)).length, 0);                                        // sem dia: nenhum evento inventado
  await page.evaluate(() => switchTab('agenda')); assert.match(await page.textContent('#main'), /Dívidas sem data de vencimento/);
  assert.deepEqual(errs, []); await ctx.close();
});

test('Documento antigo (mais de 90 dias) não polui a agenda: fica só no histórico de lançamentos', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => { window.AG_TODAY = '2027-03-10'; });
  await send(page, 'A_holerite_colunas.pdf');                       // competência 09/2026, lançamento 05/10/2026: já passou de 90 dias
  assert.equal((await evs(page)).length, 0); assert.equal(await page.evaluate(() => state.transactions.length), 1);
  assert.deepEqual(errs, []); await ctx.close();
});
