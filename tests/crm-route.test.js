// Rotas do CRM: coleta anônima do funil, acesso restrito à equipe e sincronização com a Meta (com banco e rede simulados)
const test = require('node:test'), assert = require('node:assert'), Module = require('module');
let router, inserted = [], fetchLog = [];
function expressStub() {
  const routes = []; const r = { routes };
  ['get', 'post', 'patch', 'delete'].forEach((m) => { r[m] = (p, ...h) => routes.push({ m, p, h }); });
  const e = () => r; e.Router = () => r; e.json = () => (q, s, n) => n(); return e;
}
test.before(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'; process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.META_ACCESS_TOKEN = 'tok'; process.env.META_AD_ACCOUNT_ID = 'act_123';
  const orig = Module._load;
  Module._load = function (rq, ...a) { return rq === 'express' ? expressStub() : rq === '@supabase/supabase-js' ? { createClient: () => ({ from: (t) => ({ insert: async (row) => { inserted.push([t, row]); return {}; } }) }) } : orig.call(this, rq, ...a); };
  delete require.cache[require.resolve('../src/routes/crm.js')]; router = require('../src/routes/crm.js'); Module._load = orig;
});
const find = (m, p) => router.routes.find((r) => r.m === m && r.p === p);
const run = async (route, req) => { const res = { code: 200, body: null, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, type() { return this; }, send(b) { this.body = b; return this; } };
  let i = 0; const next = async () => { const h = route.h[i++]; if (h) await h(req, res, next); }; await next(); for (let k = 0; k < 40 && res.body == null; k++) await new Promise((r) => setTimeout(r, 10)); return res; };
test('evento anônimo: grava etapa válida e ignora o resto (sem dados pessoais)', async () => {
  const route = find('post', '/funil/evento');
  await run(route, { ip: '1', path: '/funil/evento', body: { etapa: 'triagem_visita', visitor: 'abcdef12-3456', campanha: 'Free <b>Out', src: 'instagram' } });
  assert.equal(inserted.length, 1); assert.equal(inserted[0][1].campanha, 'Free bOut'); assert.equal(inserted[0][1].etapa, 'triagem_visita');
  await run(route, { ip: '2', path: '/funil/evento', body: { etapa: 'compra', visitor: 'abcdef12-3456' } });   // compra só vem da Hotmart
  await run(route, { ip: '3', path: '/funil/evento', body: { etapa: 'triagem_fim', visitor: 'x' } });          // código inválido
  assert.equal(inserted.length, 1);
});
test('rotas da equipe exigem login (sem token: 401)', async () => {
  for (const [m, p] of [['get', '/crm/painel'], ['get', '/crm/leads'], ['post', '/crm/ads/meta'], ['post', '/crm/ads/csv'], ['get', '/crm/ui']]) {
    const r = await run(find(m, p), { ip: '9', path: p, headers: {}, query: {}, body: {} }); assert.equal(r.code, 401, p);
  }
});
test('Meta: consulta com token no cabeçalho, pagina e grava como fonte meta', async () => {
  const calls = []; const g = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push([String(url), init]);
    if (/auth\/v1\/user/.test(url)) return { ok: true, json: async () => ({ id: 'u1', email: 'a@b' }) };
    if (/rest\/v1\/crm_staff/.test(url)) return { ok: true, json: async () => [{ user_id: 'u1' }] };
    if (/graph\.facebook\.com/.test(url)) return { ok: true, json: async () => ({ data: [{ campaign_name: 'C1', date_start: '2026-10-15', spend: '10.5', impressions: '1000', inline_link_clicks: '30' }] }) };
    if (/rest\/v1\/crm_ads/.test(url)) return { ok: true, json: async () => ({}) };
    return { ok: false, json: async () => ({}) }; };
  try {
    const r = await run(find('post', '/crm/ads/meta'), { ip: '7', path: '/crm/ads/meta', headers: { authorization: 'Bearer t' }, query: {}, body: {} });
    assert.equal(r.body.n, 1);
    const meta = calls.find((c) => /graph\.facebook/.test(c[0])); assert.match(meta[0], /act_123\/insights/); assert.equal(meta[1].headers.Authorization, 'Bearer tok'); assert.doesNotMatch(meta[0], /tok/);
    const save = calls.find((c) => /crm_ads/.test(c[0])); assert.equal(JSON.parse(save[1].body)[0].fonte, 'meta'); assert.equal(JSON.parse(save[1].body)[0].campanha, 'C1');
  } finally { globalThis.fetch = g; }
});

test('equipes separadas: quem está só na Auditoria (staff) não entra no CRM, e a consulta usa crm_staff', async () => {
  const calls = []; const g = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url));
    if (/auth\/v1\/user/.test(url)) return { ok: true, json: async () => ({ id: 'u2', email: 'aud@b' }) };
    if (/rest\/v1\/crm_staff/.test(url)) return { ok: true, json: async () => [] };          // não está na lista do CRM
    if (/rest\/v1\/staff/.test(url)) return { ok: true, json: async () => [{ role: 'admin' }] };   // mas está na da Auditoria
    return { ok: false, json: async () => ({}) }; };
  try {
    for (const [m, p] of [['get', '/crm/painel'], ['get', '/crm/leads'], ['get', '/crm/ui'], ['post', '/crm/ads/meta']]) {
      const r = await run(find(m, p), { ip: '5' + p, path: p, headers: { authorization: 'Bearer t' }, query: {}, body: {} });
      assert.equal(r.code, 403, p); assert.match(r.body.error, /CRM/);
    }
    assert.ok(calls.some((u) => /crm_staff/.test(u))); assert.ok(!calls.some((u) => /rest\/v1\/staff\?/.test(u)));
  } finally { globalThis.fetch = g; }
});
test('migração 024 cria crm_staff separada e tira o CRM da equipe da Auditoria', () => {
  const sql = require('fs').readFileSync(require('path').join(__dirname, '..', 'supabase', 'migrations', '024_crm_equipe_separada.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.crm_staff/); assert.match(sql, /is_crm_staff\(\)/); assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /public\.is_staff\(\)/);
});
test('as duas telas não têm atalho uma para a outra', () => {
  const fs = require('fs'), p = require('path'), a = fs.readFileSync(p.join(__dirname, '..', 'src', 'internal', 'ui.html'), 'utf8'), c = fs.readFileSync(p.join(__dirname, '..', 'src', 'internal', 'crm.html'), 'utf8');
  assert.doesNotMatch(a, /api\/crm/); assert.doesNotMatch(c, /api\/interno/);
});
