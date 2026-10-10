// Gera public/tutorial/holerite.mp4: gravação do próprio app (modo demonstração, holerite FICTÍCIO) com legendas.
// Uso: NODE_PATH=$(npm root -g) node scripts/make_tutorial_video.js  (precisa de playwright, pdfjs-dist e ffmpeg)
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', 'public'), PDF = path.join(__dirname, '..', 'tests', 'fixtures', 'A_holerite_colunas.pdf');
const PDFJS = process.env.PDFJS_DIR || path.join(cp.execSync('npm root -g').toString().trim(), 'pdfjs-dist');
const OUT = path.join(ROOT, 'tutorial'), TMP = path.join(__dirname, '..', '.video_tmp');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json', '.mjs': 'text/javascript' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = u.startsWith('/__pdfjs/') ? path.join(PDFJS, 'legacy/build', u.slice(9)) : path.join(ROOT, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
(async () => {
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: TMP, size: { width: 1280, height: 720 } } }), page = await ctx.newPage();
  await page.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.abort());
  await page.route('**/pdfjs-dist@3.11.174/build/pdf.min.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/pdfjs-dist@3.11.174/build/pdf.worker.min.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(PDFJS, 'legacy/build/pdf.worker.mjs')) }));
  await page.goto(base + '/index.html?demo=clt'); await page.waitForFunction(() => typeof startDemo === 'function' && document.getElementById('app-screen') && !document.getElementById('app-screen').hidden, null, { timeout: 20000 });
  await page.evaluate(async b => { const m = await import(b + '/__pdfjs/pdf.mjs'); window.pdfjsLib = m; }, base);
  await page.evaluate(() => { state.documents = []; state.transactions = []; selectedPeriod = { month: new Date().getMonth(), year: new Date().getFullYear(), startDate: null, endDate: null, mode: 'month' }; try { document.querySelectorAll('.tour-overlay,.gt-panel,#gt-panel').forEach(e => e.remove()); } catch (e) {} });
  await page.addStyleTag({ content: '#vid-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1040px;width:92%;z-index:99999;background:rgba(10,20,30,.92);color:#fff;font:600 26px/1.35 system-ui,sans-serif;padding:16px 24px;border-radius:14px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.5)}#vid-title{position:fixed;inset:0;z-index:100000;background:linear-gradient(135deg,#0f766e,#0b3b4a);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;font-family:system-ui,sans-serif}#vid-title h1{font-size:54px;margin:0 0 16px}#vid-title p{font-size:28px;margin:0;opacity:.92;max-width:900px}.vid-hl{outline:5px solid #f59e0b!important;outline-offset:4px;border-radius:10px;animation:vp 1s ease-in-out infinite}@keyframes vp{50%{outline-color:#fde68a}}' });
  const cap = (t) => page.evaluate(t => { let e = document.getElementById('vid-cap'); if (!t) { if (e) e.remove(); return; } if (!e) { e = document.createElement('div'); e.id = 'vid-cap'; document.body.appendChild(e); } e.textContent = t; }, t);
  const title = (h, p) => page.evaluate(([h, p]) => { let e = document.getElementById('vid-title'); if (!h) { if (e) e.remove(); return; } if (!e) { e = document.createElement('div'); e.id = 'vid-title'; document.body.appendChild(e); } e.innerHTML = '<h1></h1><p></p>'; e.firstChild.textContent = h; e.lastChild.textContent = p; }, [h, p]);
  const hl = async (sel) => { await page.evaluate(s => { document.querySelectorAll('.vid-hl').forEach(x => x.classList.remove('vid-hl')); const e = document.querySelector(s); if (e) { e.scrollIntoView({ block: 'center' }); e.classList.add('vid-hl'); } }, sel); };
  const unhl = () => page.evaluate(() => document.querySelectorAll('.vid-hl').forEach(x => x.classList.remove('vid-hl')));
  const wait = ms => page.waitForTimeout(ms);
  // ── roteiro ──
  await title('Como enviar seu holerite', 'Leitura automática e distribuição do valor líquido no SM Financial'); await wait(4000); await title();
  await cap('Passo 1 · Abra a aba Documentos, no menu.'); await page.evaluate(() => switchTab('documentos')); await wait(1500); await hl('.nav-btn[data-tab="documentos"], .nav-btn[data-tabs~="documentos"]'); await wait(3000);
  await cap('Passo 2 · Envie o holerite em PDF (o do RH, em texto) ou uma foto nítida, de frente e bem iluminada.'); await unhl(); await hl('.upload-zone'); await wait(5500);
  await cap('A leitura acontece no seu aparelho: o arquivo não é enviado para ninguém.'); await wait(4000);
  await page.setInputFiles('#doc-file-input', PDF);
  await cap('O app lê o holerite, confere os totais e identifica o mês de competência.'); await unhl();
  await page.waitForFunction(() => INGEST && INGEST.queue().length > 0 && INGEST.queue().every(q => ['concluido', 'duplicado', 'revisar', 'erro'].includes(q.status)), null, { timeout: 30000 }); await wait(2500);
  await cap('Pronto: o card mostra "Lançado". Foi lançado o valor LÍQUIDO, o que realmente cai na sua conta.'); await hl('.doc-card'); await wait(6000);
  await cap('Fotos e PDFs escaneados ficam como "Revisar": confira os valores e confirme antes de lançar.'); await wait(5500);
  await cap('Passo 3 · A receita entra na aba Renda, no 5º dia do mês seguinte à competência (data legal de pagamento).'); await unhl(); await page.evaluate(() => { const t = state.transactions[0]; if (t) { selectedPeriod = { month: +t.date.slice(5, 7) - 1, year: +t.date.slice(0, 4), startDate: null, endDate: null, mode: 'month' }; } switchTab('receitas'); }); await wait(7000);
  await cap('O mesmo valor alimenta o painel, o orçamento, a saúde financeira e as projeções.'); await page.evaluate(() => switchTab('dashboard')); await wait(6500);
  await cap('Se o holerite for de um mês antigo, o card mostra "ver nesse mês" para ir direto ao período certo.'); await page.evaluate(() => switchTab('documentos')); await wait(6000);
  await cap('Enviou duas vezes ou mandou as duas vias? O app conta uma vez só. Excluir o documento remove o lançamento.'); await wait(6500);
  await cap('Adiantamento, vale e INSS aparecem como descontos: o líquido já considera tudo isso.'); await wait(5500);
  await cap(''); await title('Pronto!', 'Dúvidas? Fale com a gente pelo botão de WhatsApp no rodapé.'); await wait(4500);
  const vp = page.video(); await ctx.close(); const src = await vp.path(); await browser.close(); server.close();
  cp.execSync(`ffmpeg -y -loglevel error -i "${src}" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart -an "${path.join(OUT, 'holerite.mp4')}"`);
  cp.execSync(`ffmpeg -y -loglevel error -ss 12 -i "${path.join(OUT, 'holerite.mp4')}" -frames:v 1 "${path.join(OUT, 'holerite.jpg')}"`);
  fs.rmSync(TMP, { recursive: true, force: true }); console.log('OK', fs.statSync(path.join(OUT, 'holerite.mp4')).size);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
