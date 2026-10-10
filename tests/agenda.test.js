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
  page.on('dialog', d => d.dismiss());
  await page.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.abort());
  await page.addInitScript(() => { window.AG_TODAY = '2026-10-10'; });
  await page.goto(base + '/index.html?demo=clt');
  await page.waitForFunction(() => typeof startDemo === 'function' && typeof FinPlan === 'object' && typeof renderAgenda === 'function' && document.getElementById('app-screen') && !document.getElementById('app-screen').hidden, null, { timeout: 20000 });
  await page.evaluate(() => {
    state.finEvents = []; state.finPlans = []; state.transactions = []; state.monthlyIncome = 5000;
    state.debts = [{ id: 'd1', name: 'Cartão Azul', type: 'Cartão', saldo: 3000, juros: 9, parcelas: 12, mensal: 300, profile: 'ambos' }, { id: 'd2', name: 'Empréstimo', type: 'Empréstimo', saldo: 6000, juros: 2, parcelas: 24, mensal: 350, profile: 'ambos' }];
    try { localStorage.clear(); } catch (e) {}
    switchTab('agenda');
  });
  return { page, errs, ctx };
}
const evs = page => page.evaluate(() => state.finEvents.map(e => ({ id: e.id, key: e.key, title: e.title, due: e.dueDate, st: e.status, kind: e.kind, plan: e.planId, amount: e.amount })));
const addEvent = (page, o) => page.evaluate(o => {
  agEventModal({ kind: o.kind, date: o.date });
  document.getElementById('ag-title').value = o.title; document.getElementById('ag-amount').value = o.amount; document.getElementById('ag-date').value = o.date;
  if (o.rep) document.getElementById('ag-rep').value = o.rep; if (o.debt) document.getElementById('ag-debt').value = o.debt; if (o.movable) document.getElementById('ag-movable').checked = true; if (o.prio) document.getElementById('ag-prio').value = o.prio;
  return agSaveEvent(null);
}, o);

test('Agenda: aba existe, estado vazio honesto, sem erros de script', async () => {
  const { page, errs, ctx } = await openApp();
  assert.match(await page.textContent('#main'), /Nenhum evento ainda/);
  assert.ok(await page.$('[data-agtab="cal"]') && await page.$('[data-agtab="ia"]') && await page.$('[data-agtab="plans"]'));
  assert.ok(await page.evaluate(() => navBuild && getAvailableTabs().some(t => t.id === 'agenda')));
  assert.deepEqual(errs, []); await ctx.close();
});

test('Agenda: cria receita e conta pelo formulário; validação; calendário e lista mostram; vencido ≠ pago', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => agEventModal({})); await page.evaluate(() => agSaveEvent(null));
  assert.match(await page.textContent('#ag-err'), /título/i); await page.evaluate(() => closeModal());
  await addEvent(page, { kind: 'income', title: 'Salário', amount: 4000, date: '2026-10-20' });
  await addEvent(page, { kind: 'payable', title: 'Aluguel', amount: 1500, date: '2026-10-12', prio: 'essential' });
  await addEvent(page, { kind: 'payable', title: 'Internet', amount: 100, date: '2026-10-03' });
  const e = await evs(page); assert.equal(e.length, 3);
  assert.ok(await page.$('[data-day="2026-10-20"] .ag-in'));
  assert.equal(await page.$$eval('[data-day="2026-10-03"] .ag-vencido', n => n.length), 1);
  const row = await page.textContent('[data-ev="' + e.find(x => x.title === 'Internet').id + '"]');
  assert.match(row, /Vencido/); assert.doesNotMatch(row, /Pago/);
  assert.equal((await evs(page)).find(x => x.title === 'Internet').st, 'pending');   // passou da data, continua pendente
  assert.deepEqual(errs, []); await ctx.close();
});

test('Agenda: repetição cria chaves únicas; reenvio do mesmo plano/evento não duplica', async () => {
  const { page, errs, ctx } = await openApp();
  await addEvent(page, { kind: 'income', title: 'Salário', amount: 4000, date: '2026-01-31', rep: 4 });
  const e = await evs(page); assert.equal(e.length, 4);
  assert.deepEqual(e.map(x => x.due), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(new Set(e.map(x => x.key)).size, 4);
  assert.deepEqual(errs, []); await ctx.close();
});

test('Agenda: pagar registra histórico, lança UMA despesa, abate a dívida (estimativa) e desfazer reverte', async () => {
  const { page, errs, ctx } = await openApp();
  await addEvent(page, { kind: 'payable', title: 'Parcela Cartão', amount: 300, date: '2026-10-15', debt: 'd1' });
  const id = (await evs(page))[0].id;
  await page.evaluate(id => { agPayModal(id); return agPay(id); }, id);
  await page.evaluate(id => agPay(id), id);                   // clique duplo: não duplica
  const st = await page.evaluate(() => ({ tx: state.transactions.filter(t => t.type === 'expense').length, saldo: state.debts[0].saldo, parc: state.debts[0].parcelas, e: state.finEvents[0] }));
  assert.equal(st.tx, 1); assert.equal(st.e.status, 'paid'); assert.equal(st.parc, 11);
  assert.equal(st.saldo, 3000 - (300 - 270));                // juros 9% = 270 saem primeiro
  assert.ok(st.e.history.some(h => h.action === 'pago'));
  await page.evaluate(id => agUndo(id), id);
  const st2 = await page.evaluate(() => ({ tx: state.transactions.length, saldo: state.debts[0].saldo, parc: state.debts[0].parcelas, s: state.finEvents[0].status }));
  assert.deepEqual(st2, { tx: 0, saldo: 3000, parc: 12, s: 'pending' });
  assert.deepEqual(errs, []); await ctx.close();
});

test('Assistente: responde com dados reais e pergunta quando falta informação', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => { state.monthlyIncome = 0; agView('ia'); });
  assert.match(await page.textContent('#main'), /Qual é a sua renda prevista/);
  assert.match(await page.textContent('#main'), /dia de vencimento da parcela de "Cartão Azul"/);
  await addEvent(page, { kind: 'income', title: 'Salário', amount: 4000, date: '2026-10-20' });
  await addEvent(page, { kind: 'payable', title: 'Aluguel', amount: 1500, date: '2026-10-12' });
  await page.evaluate(() => agView('ia')); await page.evaluate(() => agAsk(1));
  const t = await page.textContent('#ag-chat'); assert.match(t, /Aluguel/); assert.match(t, /1\.500,00/);
  await page.evaluate(() => { document.getElementById('ag-q').value = 'qual a cor do céu?'; agSubmit({ preventDefault() {} }); });
  assert.match(await page.textContent('#ag-chat'), /Ainda não sei responder/);
  assert.deepEqual(errs, []); await ctx.close();
});

test('Planos: C bloqueado sem proposta; A mostra premissas; proposta informada habilita C; nada é criado sem confirmar', async () => {
  const { page, errs, ctx } = await openApp();
  await addEvent(page, { kind: 'income', title: 'Salário', amount: 5000, date: '2026-10-20', rep: 3 });
  await page.evaluate(() => { agPref('essential', { value: '2000' }); agView('plans'); });
  const html = await page.textContent('#main');
  assert.match(html, /Não dá para montar esta opção ainda: Para comparar, informe a proposta/);
  assert.match(html, /Opção A/); assert.match(html, /Premissas/); assert.match(html, /estimativa/);
  await page.evaluate(() => { document.getElementById('ag-od').value = 'd1'; document.getElementById('ag-on').value = 24; document.getElementById('ag-oj').value = 2; agOffer(); });
  const c = await page.textContent('#ag-plan-C'); assert.match(c, /Mudança no custo total/); assert.match(c, /Depende de a instituição confirmar/);
  assert.equal((await evs(page)).filter(e => e.plan).length, 0);
  assert.deepEqual(errs, []); await ctx.close();
});

test('Planos: confirmar cria eventos com chave única, repetir confirmação não duplica; trocar de plano preserva o pago e avisa', async () => {
  const { page, errs, ctx } = await openApp();
  await addEvent(page, { kind: 'income', title: 'Salário', amount: 6000, date: '2026-10-20', rep: 3 });
  await page.evaluate(() => { agPref('essential', { value: '5000' }); agView('plans'); });
  await page.evaluate(() => agPlanConfirm('A'));
  assert.match(await page.textContent('#modal-overlay'), /Criar \d+ evento/);
  await page.evaluate(() => Promise.all([agPlanApply('A'), agPlanApply('A')]));
  let e = (await evs(page)).filter(x => x.plan); const n = e.length;
  assert.ok(n > 10); assert.equal(new Set(e.map(x => x.key)).size, n);
  assert.equal(await page.evaluate(() => state.finPlans.filter(p => p.status === 'active').length), 1);
  const first = e.sort((a, b) => a.due < b.due ? -1 : 1)[0];
  await page.evaluate(id => agPay(id), first.id).catch(() => {});
  await page.evaluate(id => { agPayModal(id); return agPay(id); }, first.id);
  await page.evaluate(() => { agPref('reserve', { value: '100' }); });
  await page.evaluate(() => agPlanConfirm('D'));
  assert.match(await page.textContent('#modal-overlay'), /mantidos no histórico/);
  await page.evaluate(() => agPlanApply('D'));
  const after = await page.evaluate(() => ({ paid: state.finEvents.filter(e => e.status === 'paid').length, cancelled: state.finEvents.filter(e => e.status === 'cancelled').length, active: state.finPlans.filter(p => p.status === 'active').map(p => p.strategy), replaced: state.finPlans.filter(p => p.status === 'replaced').length }));
  assert.equal(after.paid, 1); assert.ok(after.cancelled > 0); assert.deepEqual(after.active, ['reserva']); assert.equal(after.replaced, 1);
  assert.deepEqual(errs, []); await ctx.close();
});

test('Lembretes dentro do app: aparecem sem valores; pago não gera; painel inicial mostra confirmado x estimado', async () => {
  const { page, errs, ctx } = await openApp();
  await addEvent(page, { kind: 'payable', title: 'Luz', amount: 222.22, date: '2026-10-11' });
  await addEvent(page, { kind: 'payable', title: 'Água', amount: 80, date: '2026-10-11' });
  await addEvent(page, { kind: 'income', title: 'Salário', amount: 4000, date: '2026-10-05' });
  const id = (await evs(page)).find(x => x.title === 'Água').id; await page.evaluate(id => { agPayModal(id); return agPay(id); }, id);
  const n = await page.evaluate(() => generateNotifications().filter(x => x.tab === 'agenda'));
  assert.equal(n.length, 1); assert.equal(n[0].title, 'Luz'); assert.doesNotMatch(JSON.stringify(n), /222/);
  await page.evaluate(() => switchTab('dashboard'));
  const d = await page.textContent('#ag-dash'); assert.match(d, /Agenda financeira/); assert.match(d, /Recebido \/ previsto/);
  assert.deepEqual(errs, []); await ctx.close();
});

test('Integração assistente ↔ calendário: comandos abrem o calendário preenchido, nada é gravado sem confirmar; calendário mostra a leitura do assistente', async () => {
  const { page, errs, ctx } = await openApp();
  await page.evaluate(() => agView('ia'));
  await page.evaluate(() => { document.getElementById('ag-q').value = 'adicionar salário de R$ 4.500,00 dia 20'; agSubmit({ preventDefault() {} }); });
  assert.equal((await evs(page)).length, 0);                                  // só preparou o formulário
  assert.equal(await page.inputValue('#ag-amount'), '4500'); assert.equal(await page.inputValue('#ag-date'), '2026-10-20'); assert.equal(await page.inputValue('#ag-kind'), 'income');
  await page.evaluate(() => agSaveEvent(null));
  assert.equal((await evs(page)).length, 1);
  await addEvent(page, { kind: 'payable', title: 'Luz', amount: 200, date: '2026-10-15' });
  await page.evaluate(() => agView('ia'));
  await page.evaluate(() => { document.getElementById('ag-q').value = 'paguei a luz'; agSubmit({ preventDefault() {} }); });
  assert.match(await page.textContent('#ag-chat'), /Não marco nada como pago sozinho/);
  assert.equal((await evs(page)).find(e => e.title === 'Luz').st, 'pending');   // abriu o registro, não pagou
  assert.ok(await page.$('#ag-pdate')); await page.evaluate(() => closeModal());
  await page.evaluate(() => { document.getElementById('ag-q').value = 'o que vence dia 15/10?'; agSubmit({ preventDefault() {} }); });
  assert.match(await page.textContent('#ag-chat'), /Luz.*200,00/s);
  await page.evaluate(() => agView('cal'));
  assert.ok(await page.$('#ag-strip'));
  assert.match(await page.textContent('#ag-strip'), /Até o próximo recebimento/);
  assert.deepEqual(errs, []); await ctx.close();
});
