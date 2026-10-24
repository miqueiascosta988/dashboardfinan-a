// Perfil, idioma e tutoriais em vídeo: traduções completas, troca de e-mail/senha com confirmação e exclusão via suporte.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http');
const test = require('node:test'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', 'public');
let server, base, browser;
test.before(async () => {
  server = http.createServer((q, r) => { const f = path.join(ROOT, q.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
  await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });
async function open(persona, vp) {
  const page = await browser.newPage({ viewport: vp || { width: 1280, height: 800 } }); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net|fonts\.g|supabase/, r => r.abort());
  await page.goto(base + '/index.html?demo=' + persona); await page.waitForFunction(() => typeof startDemo === 'function' && !document.getElementById('app-screen').hidden);
  return { page, errs };
}
test('dicionário: todas as chaves têm EN e ES, sem vazio e com os mesmos marcadores', async () => {
  const { page } = await open('clt');
  const r = await page.evaluate(() => {
    const bad = [];
    Object.entries(I18N.dict).forEach(([k, v]) => { if (!Array.isArray(v) || v.length !== 2 || v.some(x => !String(x).trim())) bad.push('dict:' + k); });
    Object.entries(I18N.strings).forEach(([k, v]) => { if (!Array.isArray(v) || v.length !== 3 || v.some(x => !String(x).trim())) bad.push('str:' + k); else { const ph = x => (x.match(/[%{][^ ]*/g) || []).join(); if (v.some(x => ph(x) !== ph(v[0]))) bad.push('ph:' + k); if (v[1] === v[0] && v[0].length > 24) bad.push('igual-pt:' + k); } });
    return bad;
  });
  assert.deepEqual(r, []); await page.close();
});
test('menus: todos os rótulos de menu de todos os perfis têm tradução; troca de idioma muda menu e html lang', async () => {
  for (const persona of ['clt', 'autonomo', 'negativado', 'mei', 'simples', 'presumido']) {
    const { page, errs } = await open(persona);
    const labels = await page.evaluate(() => { const o = []; navBuild().forEach(g => { o.push(g.label); g.kids.forEach(k => o.push(k.label)); }); return [...new Set(o)]; });
    const missing = await page.evaluate(L => L.filter(l => !I18N.dict[l]), labels);
    assert.deepEqual(missing, [], persona + ': rótulos sem tradução');
    await page.evaluate(() => I18N.set('en', true));
    const en = await page.evaluate(() => ({ lang: document.documentElement.lang, nav: [...document.querySelectorAll('#nav .nav-btn')].map(b => b.textContent.trim()), exp: document.getElementById('btn-export').textContent.trim() }));
    assert.equal(en.lang, 'en'); assert.ok(en.nav.some(t => /Home/.test(t)) && !en.nav.some(t => /Início/.test(t)), 'menu em inglês: ' + en.nav.join('|')); assert.match(en.exp, /Export/);
    await page.evaluate(() => I18N.set('es', true));
    const es = await page.evaluate(() => [...document.querySelectorAll('#nav .nav-btn')].map(b => b.textContent.trim()));
    assert.ok(es.some(t => /Inicio/.test(t)), 'menu em espanhol: ' + es.join('|'));
    await page.evaluate(() => I18N.set('pt', true));
    assert.ok((await page.evaluate(() => document.querySelector('#nav .nav-btn').textContent)).includes('Início'));
    assert.deepEqual(errs, []); await page.close();
  }
});
test('idioma persiste ao recarregar e perfil muda de idioma', async () => {
  const { page, errs } = await open('clt');
  await page.click('#perfil-btn'); await page.waitForSelector('#pf-lang');
  await page.click('#pf-lang [data-lang="es"]');
  assert.match(await page.textContent('#main .section-title'), /Mi perfil/); assert.equal(await page.evaluate(() => localStorage.getItem('sm-lang')), 'es');
  await page.reload(); await page.waitForFunction(() => typeof startDemo === 'function' && !document.getElementById('app-screen').hidden);
  assert.equal(await page.evaluate(() => I18N.get()), 'es');
  assert.deepEqual(errs, []); await page.close();
});
test('perfil: seções, demonstração bloqueia alterações e exclusão abre WhatsApp do suporte', async () => {
  const { page, errs } = await open('clt');
  await page.click('#perfil-btn'); await page.waitForSelector('#pf-email');
  for (const id of ['pf-new-email', 'pf-email-pass', 'pf-cur-pass', 'pf-new-pass', 'pf-new-pass2', 'pf-email-btn', 'pf-pass-btn']) assert.ok(await page.isDisabled('#' + id), id + ' desabilitado na demo');
  const links = await page.$$eval('#pf-del a[href^="https://wa.me/"]', a => a.map(x => x.href));
  assert.ok(links.length >= 1, 'link de WhatsApp'); assert.match(decodeURIComponent(links[0]), /exclus/i);
  assert.ok(await page.$('#pf-del a[href*="5511960384846"]'), 'usa o número oficial do suporte');
  assert.deepEqual(errs, []); await page.close();
});
test('alterar e-mail e senha: exige senha atual correta, regras e confirmação', async () => {
  const { page, errs } = await open('clt');
  await page.evaluate(() => {
    window.__calls = []; DEMO.on = false; currentUser = { id: 'u1', email: 'ana@exemplo.com' };
    sb = { auth: {
      signInWithPassword: async o => { __calls.push(['sign', o.email, o.password]); return o.password === 'Certa123' ? { data: {}, error: null } : { data: null, error: { message: 'bad' } }; },
      updateUser: async o => { __calls.push(['upd', JSON.stringify(o)]); return { data: {}, error: null }; } } };
    Perfil.open();
  });
  await page.waitForSelector('#pf-email');
  const msg = id => page.textContent('#' + id);
  // e-mail
  await page.fill('#pf-new-email', 'ana@exemplo.com'); await page.fill('#pf-email-pass', 'Certa123'); await page.click('#pf-email-btn');
  assert.match(await msg('pf-email-msg'), /válido e diferente/);
  await page.fill('#pf-new-email', 'nova@exemplo.com'); await page.fill('#pf-email-pass', 'Errada1'); await page.click('#pf-email-btn');
  await page.waitForFunction(() => /incorreta/.test(document.getElementById('pf-email-msg').textContent));
  assert.equal(await page.evaluate(() => __calls.filter(c => c[0] === 'upd').length), 0, 'senha errada não altera nada');
  await page.fill('#pf-email-pass', 'Certa123'); await page.click('#pf-email-btn');
  await page.waitForFunction(() => /confirmação/.test(document.getElementById('pf-email-msg').textContent));
  assert.deepEqual(await page.evaluate(() => __calls.filter(c => c[0] === 'upd')), [['upd', '{"email":"nova@exemplo.com"}']]);
  // senha
  await page.fill('#pf-cur-pass', ''); await page.click('#pf-pass-btn'); assert.match(await msg('pf-pass-msg'), /senha atual/i);
  await page.fill('#pf-cur-pass', 'Certa123'); await page.fill('#pf-new-pass', 'fraca'); await page.fill('#pf-new-pass2', 'fraca'); await page.click('#pf-pass-btn'); assert.match(await msg('pf-pass-msg'), /regras/);
  await page.fill('#pf-new-pass', 'Nova12345'); await page.fill('#pf-new-pass2', 'Outra12345'); await page.click('#pf-pass-btn'); assert.match(await msg('pf-pass-msg'), /não coincidem/);
  await page.fill('#pf-new-pass', 'Certa123'); await page.fill('#pf-new-pass2', 'Certa123'); await page.click('#pf-pass-btn'); assert.match(await msg('pf-pass-msg'), /diferente da atual/);
  await page.fill('#pf-new-pass', 'Nova12345'); await page.fill('#pf-new-pass2', 'Nova12345'); await page.click('#pf-pass-btn');
  await page.waitForFunction(() => /sucesso/.test(document.getElementById('pf-pass-msg').textContent));
  assert.ok((await page.evaluate(() => __calls.filter(c => c[0] === 'upd'))).some(c => c[1] === '{"password":"Nova12345"}'));
  assert.equal(await page.inputValue('#pf-new-pass'), '', 'campos limpos após salvar');
  assert.deepEqual(errs, []); await page.close();
});
test('bloqueio após 3 senhas erradas seguidas', async () => {
  const { page } = await open('clt');
  await page.evaluate(() => { DEMO.on = false; currentUser = { id: 'u1', email: 'ana@exemplo.com' }; sb = { auth: { signInWithPassword: async () => ({ error: { message: 'bad' } }), updateUser: async () => ({ error: null }) } }; Perfil.open(); });
  await page.waitForSelector('#pf-pass');
  for (let i = 0; i < 3; i++) { await page.fill('#pf-cur-pass', 'x' + i); await page.fill('#pf-new-pass', 'Nova12345'); await page.fill('#pf-new-pass2', 'Nova12345'); await page.click('#pf-pass-btn'); await page.waitForFunction(() => /incorreta|Muitas/.test(document.getElementById('pf-pass-msg').textContent)); }
  await page.click('#pf-pass-btn'); assert.match(await page.textContent('#pf-pass-msg'), /Muitas tentativas/); await page.close();
});
test('tutoriais: módulos, aulas de 1 a 3 min, botão por aba e vídeo ausente cai no resumo', async () => {
  for (const persona of ['clt', 'mei', 'presumido']) {
    const { page, errs } = await open(persona);
    const info = await page.evaluate(() => ({ L: Tutor.lessons().map(l => ({ id: l.id, min: l.min, m: l.m, t: l.t, d: l.d })), avail: getAvailableTabs().map(t => t.id), groups: navBuild().map(g => g.id) }));
    info.L.forEach(l => { assert.ok(l.min >= 1 && l.min <= 3, l.id + ' duração'); assert.ok(l.t.length === 3 && l.t.every(Boolean), l.id + ' títulos nos 3 idiomas'); assert.ok(l.d.length > 20); });
    const ids = new Set(info.L.map(l => l.id)); assert.equal(ids.size, info.L.length, 'ids únicos');
    for (const id of info.avail) { assert.ok(await page.evaluate(i => !!Tutor.lessonFor(i), id), 'aba sem tutorial: ' + id); }
    for (const id of info.avail) {
      await page.evaluate(t => switchTab(t), id);
      assert.equal(await page.locator('#main .tut-bar').count(), 1, 'um botão de tutorial em ' + id);
    }
    await page.evaluate(() => switchTab('dashboard')); await page.click('#main .tut-bar button');
    await page.waitForSelector('#modal-overlay.open .tut-soon'); assert.match(await page.textContent('#modal-body'), /Vídeo em produção/);
    await page.click('#modal-body >> text=← Voltar'); assert.ok(await page.locator('#modal-body .tut-mod').count() >= 5);
    assert.deepEqual(errs, []); await page.close();
  }
});
test('tutorial inicial agora abre o vídeo (e o tour antigo continua na ajuda)', async () => {
  const { page, errs } = await open('clt');
  await page.click('#gt-btn'); await page.waitForSelector('#modal-overlay.open .tut-mod'); assert.equal(await page.locator('#ob-root').count(), 0);
  await page.evaluate(() => closeModal()); await page.click('#help-btn'); const t = await page.textContent('.help-panel'); assert.match(t, /Tutoriais em vídeo/); assert.match(t, /Tour com balões/);
  assert.deepEqual(errs, []); await page.close();
});
test('celular: perfil sem rolagem lateral', async () => {
  const { page } = await open('clt', { width: 390, height: 800 });
  await page.evaluate(() => Perfil.open()); await page.waitForSelector('#pf-email');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.close();
});
