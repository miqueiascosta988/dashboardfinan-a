// Bateria PF (Fase "rodada 2"): personas pessoa física passando pelos fluxos reais do app, sem opinião fictícia.
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
const abrir = async () => { const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(base + '/?demo=clt'); await page.waitForTimeout(1500); return { page, errs }; };

test('Persona Free (assalariada): 15 lançamentos e o 16º bloqueia com aviso', async () => {
  const { page, errs } = await abrir();
  const r = await page.evaluate(async () => {
    window.planoEfetivo = () => 'free'; state.transactions = []; const out = { toasts: [] }; window.showToast = m => out.toasts.push(m); window.switchTab = () => {};
    let ok = 0;
    for (let i = 0; i < 17; i++) { openTransactionModal('expense'); document.getElementById('m-amount').value = String(10 + i); document.getElementById('m-desc').value = 'Gasto ' + i; await saveTransaction('expense'); }
    out.n = state.transactions.length; return out;
  });
  assert.equal(r.n, 15); assert.ok(r.toasts.some(t => /15 lançamentos/.test(t)), 'aviso cita o limite'); assert.deepEqual(errs, []); await page.close();
});
test('Persona Basic (autônomo): passa de 20 e vai até 60; o 61º bloqueia', async () => {
  const { page } = await abrir();
  const r = await page.evaluate(async () => {
    window.planoEfetivo = () => 'basic'; state.transactions = []; const out = { toasts: [] }; window.showToast = m => out.toasts.push(m); window.switchTab = () => {};
    for (let i = 0; i < 62; i++) { openTransactionModal('expense'); document.getElementById('m-amount').value = String(10 + (i % 50)); document.getElementById('m-desc').value = 'Item ' + i; await saveTransaction('expense'); }
    out.n = state.transactions.length; return out;
  });
  assert.equal(r.n, 60); assert.ok(r.toasts.some(t => /60 lançamentos/.test(t))); await page.close();
});
test('Persona Basic (endividado): importa CSV 1 vez no mês; a 2ª é barrada com mensagem clara', async () => {
  const { page, errs } = await abrir();
  const r = await page.evaluate(async () => {
    window.planoEfetivo = () => 'basic'; window.canImportFree = () => false; state.transactions = []; const out = { toasts: [] }; window.showToast = m => out.toasts.push(m); window.switchTab = () => {};
    try { localStorage.removeItem(ofKey()); } catch (e) {}
    const hoje = new Date(), d = n => { const x = new Date(hoje.getFullYear(), hoje.getMonth(), n); return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear(); };
    const csv = 'Data;Descrição;Valor\n' + [1, 2, 3, 4, 5].map(n => d(n) + ';Mercado ' + n + ';-' + (30 + n) + ',50').join('\n') + '\n' + d(5) + ';Salário;3500,00\n';
    out.liberado1 = importLiberado(); processStatementText('extrato_banco.csv', csv); out.preview = !!pendingStatementImport && pendingStatementImport.rows.length;
    confirmStatementImport(); out.apos = state.transactions.length; out.liberado2 = importLiberado();
    triggerStatementFileInput(); out.msg2 = out.toasts[out.toasts.length - 1]; return out;
  });
  assert.equal(r.liberado1, true); assert.equal(r.preview, 6); assert.equal(r.apos, 6); assert.equal(r.liberado2, false); assert.match(r.msg2, /1 importação de extrato por mês/); assert.deepEqual(errs, []); await page.close();
});
test('Persona Basic: extrato grande (80 linhas) importa só até o teto de 60 e avisa o que ficou de fora', async () => {
  const { page } = await abrir();
  const r = await page.evaluate(async () => {
    window.planoEfetivo = () => 'basic'; window.canImportFree = () => false; state.transactions = []; const out = { toasts: [] }; window.showToast = m => { out.toasts.push(m); (window.__t = window.__t || []).push(m); }; window.switchTab = () => {};
    try { localStorage.removeItem(ofKey()); } catch (e) {}
    const h = new Date(); const L = []; for (let i = 0; i < 80; i++) { const dia = (i % 27) + 1; L.push(String(dia).padStart(2, '0') + '/' + String(h.getMonth() + 1).padStart(2, '0') + '/' + h.getFullYear() + ';Compra ' + i + ';-' + (10 + i) + ',00'); }
    processStatementText('grande.csv', 'Data;Descrição;Valor\n' + L.join('\n')); confirmStatementImport();
    out.importadas = state.transactions.length;
    openTransactionModal('expense'); document.getElementById('m-amount').value = '25'; document.getElementById('m-desc').value = 'Manual'; await saveTransaction('expense');
    out.depoisManual = state.transactions.length; out.toast = out.toasts[out.toasts.length - 1]; return out;
  });
  await page.waitForTimeout(3000); const msgs = await page.evaluate(() => window.__t || []); assert.equal(r.importadas, 60); assert.ok(msgs.some(m => /20 transação\(ões\) mais antigas ficaram de fora/.test(m)), 'aviso do que ficou de fora'); await page.close();
});
test('Persona nova no Free: bônus de 3 documentos nas primeiras 48 h aparece no painel', async () => {
  const { page } = await abrir();
  const r = await page.evaluate(() => { DEMO.on = false; profile = { plan: 'free' }; currentUser = { id: 'u9', created_at: new Date(Date.now() - 3600000).toISOString() }; try { localStorage.removeItem(fxKey('bonus')); } catch (e) {} PREFS.data = PREFS.data || {}; delete PREFS.data.bonus; return bonusBannerHtml(); });
  assert.match(r, /3 de 3 documentos/); await page.close();
});
test('Todas as abas PF abrem sem erro de JavaScript (modo assalariado, autônomo e negativado)', async () => {
  for (const demo of ['clt', 'autonomo', 'negativado']) {
    const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(base + '/?demo=' + demo); await page.waitForTimeout(1200);
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-tab]')).map(e => e.getAttribute('data-tab')).filter((v, i, a) => v && a.indexOf(v) === i));
    for (const t of tabs) { await page.evaluate(x => { try { switchTab(x); } catch (e) { throw e; } }, t); await page.waitForTimeout(150); }
    assert.ok(tabs.length > 5, demo + ': abas encontradas ' + tabs.length); assert.deepEqual(errs, [], demo + ' erros: ' + errs.join(' | ')); await page.close();
  }
});
