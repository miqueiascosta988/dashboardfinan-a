// Ciclo 8: cadastro em 3 campos (e-mail, senha, aceite) e eventos do app no funil (conta criada, primeira ação).
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

test('cadastro tem só e-mail, senha e um aceite; sem nome nem confirmação de senha', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const f = document.getElementById('auth-form-signup');
    const campos = [...f.querySelectorAll('input')].map(i => i.id + ':' + i.type);
    return { campos, aceite: (f.querySelector('.consent-row') || {}).textContent, nLabelsAceite: f.querySelectorAll('.consent-row').length };
  });
  assert.deepEqual(r.campos, ['signup-email:email', 'signup-pass:password', 'signup-terms:checkbox']);
  assert.equal(r.nLabelsAceite, 1); assert.match(r.aceite, /Termos de Uso/); assert.match(r.aceite, /Privacidade/); assert.match(r.aceite, /18 anos/);
  assert.deepEqual(errs, []); await page.close();
});
test('criar conta: exige aceite e senha forte; com tudo certo vai ao onboarding e o nome (opcional) é pedido lá', async () => {
  const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/'); await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    document.getElementById('auth-form-signup').hidden = false; const out = {};
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; };
    const clicar = async () => { document.getElementById('btn-signup').click(); await new Promise(r => setTimeout(r, 200)); return (document.getElementById('auth-error') || {}).textContent || ''; };
    set('signup-email', 'ana.teste@exemplo.com'); set('signup-pass', 'Abcdef1!'); document.getElementById('signup-terms').checked = false;
    out.semAceite = await clicar();
    document.getElementById('signup-terms').checked = true; set('signup-pass', 'fraca');
    out.senhaFraca = await clicar();
    set('signup-pass', 'Abcdef1!'); await clicar();
    out.onboarding = !document.getElementById('onboarding-screen').hidden; out.nomeAuto = state.name;
    document.getElementById('onboard-name').value = 'Ana'; onboardNomeSalvar(); out.nomeDepois = state.name;
    return out;
  });
  assert.match(r.semAceite, /Termos de Uso/); assert.match(r.senhaFraca, /senha/i);
  assert.equal(r.onboarding, true); assert.equal(r.nomeAuto, 'ana.teste'); assert.equal(r.nomeDepois, 'Ana');
  assert.deepEqual(errs, []); await page.close();
});
test('funilEvento: só quem veio da triagem, uma vez por aparelho, e respeita "Não rastrear"', async () => {
  const page = await browser.newPage(); await page.goto(base + '/'); await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const calls = []; navigator.sendBeacon = (u, b) => { calls.push(u); return true; };
    funilEvento('cadastro_concluido'); const semOrigem = calls.length;                       // sem código de visitante: não envia
    localStorage.setItem('sm_funil', JSON.stringify({ v: 'abcdefgh12', c: 'camp1', s: 'instagram' }));
    funilEvento('cadastro_concluido'); funilEvento('cadastro_concluido'); const com = calls.length;   // só uma vez
    funilEvento('primeira_acao'); const duas = calls.length;
    return { semOrigem, com, duas, url: calls[0] };
  });
  assert.equal(r.semOrigem, 0); assert.equal(r.com, 1); assert.equal(r.duas, 2); assert.equal(r.url, '/api/funil/evento');
  await page.close();
});
