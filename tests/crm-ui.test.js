// CRM na tela (API simulada) e rastreio do funil nas páginas públicas
const test = require('node:test'), assert = require('node:assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let srv, base, browser; const events = [], inscritos = [];
const painel = { dias: 30, metaConfigurada: false, rows: [{ campanha: 'Free Out', invest: 150, impressoes: 15000, cliques: 300, triagem_visita: 50, triagem_fim: 30, apresentacao_visita: 20, checkout_clique: 5, compras: 2, receita: 13, ctr: 2, cpc: 0.5, custoVisita: 3, custoCheckout: 30, cpa: 75, roas: 0.09 }],
  total: { invest: 150, impressoes: 15000, cliques: 300, triagem_visita: 50, triagem_fim: 30, apresentacao_visita: 20, checkout_clique: 5, compras: 2, receita: 13, ctr: 2, cpc: 0.5, cpa: 75, roas: 0.09 },
  funil: [{ etapa: 'triagem_visita', n: 50, deAnterior: null }, { etapa: 'triagem_fim', n: 30, deAnterior: 60 }, { etapa: 'apresentacao_visita', n: 20, deAnterior: 66.67 }, { etapa: 'checkout_clique', n: 5, deAnterior: 25 }, { etapa: 'compra', n: 2, deAnterior: 40 }] };
test.before(async () => {
  srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/api/funil/evento') { let b = ''; q.on('data', (c) => b += c); q.on('end', () => { try { events.push(JSON.parse(b)); } catch (e) {} r.statusCode = 204; r.end(); }); return; }
    if (u === '/api/funil/inscrever') { let b = ''; q.on('data', (c) => b += c); q.on('end', () => { try { inscritos.push(JSON.parse(b)); } catch (e) {} r.setHeader('content-type', 'application/json'); r.end('{"ok":true}'); }); return; }
    if (u === '/api/config') { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ hotmartCheckoutTrial: 'https://pay.hotmart.com/ABC?off=2h91nw12' })); }
    if (u === '/api/crm/painel') { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify(painel)); }
    if (u === '/api/crm/leads') { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ leads: [{ id: '11111111-1111-1111-1111-111111111111', nome: 'Maria', contato: '@maria', etapa: 'conversando', proximo_contato: '2020-01-01', notas: '' }] })); }
    const f = u === '/crm' ? path.join(ROOT, 'src/internal/crm.html') : path.join(ROOT, 'public', decodeURIComponent(u).replace(/^\/$/, '/index.html').replace(/^\/(triagem|apresentacao)$/, '/$1.html'));
    fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'); r.end(b); });
  });
  await new Promise((r) => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });
test('CRM: painel com funil e custos, contatos com follow-up e gerador de link', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => sessionStorage.setItem('sm_int_token', 't'));
  await page.goto(base + '/crm'); await page.waitForSelector('.kpis');
  const t = await page.textContent('#v');
  assert.match(t, /Visitou a triagem/); assert.match(t, /Free Out/); assert.match(t, /R\$\s?75,00/); assert.match(t, /0,09x/);
  await page.click('#tabs [data-t="leads"]'); assert.match(await page.textContent('#v'), /Para falar hoje \(1\)/); assert.match(await page.textContent('#v'), /Maria/);
  await page.click('#tabs [data-t="links"]'); await page.fill('#gc', 'Free Out'); const link = await page.inputValue('#gout');
  assert.match(link, /\/triagem\?utm_source=instagram&utm_medium=cpc&utm_campaign=Free\+Out/);
  await page.click('#tabs [data-t="ads"]'); assert.match(await page.textContent('#v'), /META_ACCESS_TOKEN/);
  assert.deepEqual(errs, []);
});
test('funil: triagem e apresentação registram etapas e o checkout leva campanha e visitante', async () => {
  events.length = 0;
  const ctx = await browser.newContext(); const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/triagem?utm_source=instagram&utm_medium=cpc&utm_campaign=Free%20Out'); await page.waitForTimeout(400);
  assert.ok(events.some(e => e.etapa === 'triagem_visita' && e.campanha === 'Free Out' && e.src === 'instagram'));
  for (let i = 0; i < 5; i++) { await page.click('.opt >> nth=0'); await page.waitForTimeout(600); }
  await page.waitForSelector('#cta'); await page.waitForTimeout(300);
  assert.ok(events.some(e => e.etapa === 'triagem_fim'));
  await page.goto(base + '/apresentacao'); await page.waitForTimeout(600);
  const ev = events.find(e => e.etapa === 'apresentacao_visita'); assert.ok(ev && ev.campanha === 'Free Out', 'campanha lembrada do primeiro contato');
  const href = await page.evaluate(() => { const a = document.getElementById('cta1'); a.addEventListener('click', e => e.preventDefault()); a.click(); return a.href; });
  await page.waitForTimeout(500);
  assert.match(href, /pay\.hotmart\.com/); assert.match(href, /sck=/); assert.match(href, /src=Free_Out/);
  assert.ok(events.some(e => e.etapa === 'checkout_clique'));
  assert.deepEqual(errs, []);
  await ctx.close(); await new Promise(r => setTimeout(r, 300));
});
test('funil respeita Não rastrear', async () => {
  events.length = 0;
  const ctx = await browser.newContext(); await ctx.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }));
  const page = await ctx.newPage(); await page.goto(base + '/triagem?utm_campaign=X'); await page.waitForTimeout(800);
  assert.equal(events.filter(e => e.campanha === 'X').length, 0);
});

test('triagem: e-mail opcional só é enviado com autorização marcada, junto com a campanha', async () => {
  inscritos.length = 0;
  const ctx = await browser.newContext(); const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/triagem?utm_campaign=Free%20Out'); await page.waitForTimeout(300);
  for (let i = 0; i < 5; i++) { await page.click('.opt >> nth=0'); await page.waitForTimeout(600); }
  await page.waitForSelector('#nf');
  await page.fill('#ne', 'ana@exemplo.com'); await page.click('.nb');
  assert.match(await page.textContent('#nm'), /autoriza/i); assert.equal(inscritos.length, 0);
  await page.check('#nk'); await page.click('.nb'); await page.waitForSelector('.nm.ok');
  assert.equal(inscritos.length, 1); assert.equal(inscritos[0].email, 'ana@exemplo.com'); assert.equal(inscritos[0].consentimento, true); assert.equal(inscritos[0].campanha, 'Free Out');
  assert.deepEqual(errs, []);
  await ctx.close();
});
