// Fatura com parcelas no app: lê "N de M", projeta o que falta como previsto e não duplica entre faturas.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { DI, pdfPages, fx } = require('./helpers');
const PUB = path.join(__dirname, '..', 'public');
let srv, base, browser;
test.before(async () => {
  srv = http.createServer((q, r) => { const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); r.end(b); }); });
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
async function entity(name, id) { const pg = await pdfPages(fx(name)); const e = DI.processDocument(pg, [], { fileName: name, hint: null, contentHash: 'h' + name, newId: () => id, now: '2026-11-06' }).outcomes[0].entity; e.extractedData.userConfirmed = true; e.extractedData.state = 'done'; return e; }

test('fatura com parcelas: reconhece, projeta o que falta como prevista, não duplica e completa o histórico com fatura antiga', async () => {
  const nov = await entity('Z_fatura_parcelas_nov.pdf', 'd-nov'), set = await entity('Z_fatura_parcelas_set.pdf', 'd-set');
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500);
  const r = await page.evaluate(([a, b]) => {
    state.transactions = []; PREFS.data = {}; try { localStorage.removeItem(fxKey('pcl')); } catch (e) {}
    state.documents.unshift(stampDocNew(a)); syncDocTransaction(state.documents.find(z => z.id === a.id)); syncDocTransaction(state.documents.find(z => z.id === a.id));   // 2ª chamada: não duplica
    const s1 = pclStore(), p1 = Parcelas.project(s1);
    state.documents.unshift(stampDocNew(b)); syncDocTransaction(state.documents.find(z => z.id === b.id));
    const s2 = pclStore(), h = Parcelas.history(s2); switchTab('dashboard');
    return { plans: Object.keys(s1.plans).length, proj: p1.map(p => p.desc + ' ' + p.n + '/' + p.m).slice(0, 3), n: p1.length, first: p1[0].date, paid: h.paid.map(p => p.desc + ' ' + p.n).sort(), gaps: h.gaps.length, soma: state.transactions.reduce((t, x) => t + x.amount, 0), html: (document.getElementById('pcl-card') || {}).textContent || '' };
  }, [nov, set]);
  assert.equal(r.plans, 2, 'seguro (2 de 12) e Magazine (04/10)');
  assert.equal(r.n, 10 + 6, '10 do seguro + 6 do Magazine');
  assert.equal(r.first, '2026-12-12');
  assert.deepEqual(r.paid, ['Magazine Luiza 4', 'Seguro automovel 1', 'Seguro automovel 2']);
  assert.ok(/prevista/.test(r.html) && /Ainda faltam/.test(r.html) && /Informar o dia do vencimento do Nubank/.test(r.html));
  assert.equal(r.soma, 649 + 439, 'previstas nunca entram nos lançamentos pagos');
  assert.deepEqual(errs, []); await page.close();
});
