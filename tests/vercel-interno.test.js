// A área interna e o CRM precisam ter rota própria na Vercel (senão /interno/ cai no app principal)
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const match = (u) => cfg.routes.find((r) => !r.continue && new RegExp('^' + r.src + '$').test(u));
test('/interno e /interno/ vão para a página da equipe, sem cache e sem indexar', () => {
  for (const u of ['/interno', '/interno/']) { const r = match(u); assert.equal(r.dest, '/public/interno/index.html', u); assert.match(r.headers['X-Robots-Tag'], /noindex/); assert.equal(r.headers['Cache-Control'], 'no-store'); }
});
test('/crm redireciona para o login da equipe já apontando para o CRM', () => {
  const r = match('/crm'); assert.equal(r.status, 302); assert.equal(r.headers.Location, '/interno/?crm=1');
});
test('rotas antigas continuam: /triagem, /apresentacao e /api', () => {
  assert.equal(match('/triagem').dest, '/public/triagem.html'); assert.equal(match('/apresentacao').dest, '/public/apresentacao.html'); assert.equal(match('/api/crm/painel').dest, '/api/index.js');
});
test('login interno abre o CRM quando o link traz ?crm=1', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'interno', 'index.html'), 'utf8');
  assert.match(s, /crm\?'\/api\/crm\/ui':'\/api\/interno\/ui'/);
});
test('cabeçalhos de segurança valem para todas as páginas, inclusive as estáticas', () => {
  const g = cfg.routes[0]; assert.equal(g.continue, true); assert.equal(g.src, '/(.*)');
  assert.equal(g.headers['X-Frame-Options'], 'DENY'); assert.equal(g.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(g.headers['Referrer-Policy'], /strict-origin/); assert.match(g.headers['Strict-Transport-Security'], /max-age=\d+/);
  const csp = g.headers['Content-Security-Policy'];
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) assert.ok(csp.includes(d), d);
});
