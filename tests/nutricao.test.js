// Sequência de e-mails da triagem: consentimento, 3 mensagens no prazo, parada ao comprar ou sair, segurança do cron
const test = require('node:test'), assert = require('node:assert'), Module = require('module');
const N = require('../src/lib/nutricao');
const NOW = Date.parse('2026-10-20T12:00:00Z'), DAY = 86400000;
const ENV = { CRON_SECRET: 'segredo', APP_URL: 'https://app.exemplo.com', SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 're', MAIL_FROM: 'SM <a@b.com>' };

test('lib: e-mail válido, etapas no prazo e textos com slogan, link de sair e sem recurso do produto', () => {
  assert.ok(N.validEmail('a@b.com')); assert.ok(!N.validEmail('a@b')); assert.ok(!N.validEmail('<x>@b.com'));
  const row = (o) => Object.assign({ step: 0, opt_out: false, converted: false, created_at: new Date(NOW).toISOString() }, o);
  assert.equal(N.dueStep(row({}), NOW), 1);
  assert.equal(N.dueStep(row({ step: 1 }), NOW + 1 * DAY), null);
  assert.equal(N.dueStep(row({ step: 1 }), NOW + 2 * DAY), 2);
  assert.equal(N.dueStep(row({ step: 2 }), NOW + 4 * DAY), null);
  assert.equal(N.dueStep(row({ step: 2 }), NOW + 5 * DAY), 3);
  assert.equal(N.dueStep(row({ step: 3 }), NOW + 30 * DAY), null);
  assert.equal(N.dueStep(row({ opt_out: true }), NOW), null); assert.equal(N.dueStep(row({ converted: true }), NOW), null);
  for (const s of [1, 2, 3]) { const m = N.buildNutricao(s, { appUrl: 'https://a', unsubUrl: 'https://a/sair', apresUrl: 'https://a/apresentacao' });
    assert.match(m.text, /Do aperto ao plano, do plano ao alívio\./); assert.match(m.html, /https:\/\/a\/sair/); assert.match(m.text, /https:\/\/a\/apresentacao/); }
});

function load(db) {
  Object.assign(process.env, ENV); const sent = [];
  const from = (table) => { const st = { f: [], op: 'select', patch: null, row: null }; const q = {
    select() { return q; }, eq(c, v) { st.f.push((r) => r[c] === v); return q; }, in(c, v) { st.f.push((r) => v.includes(r[c])); return q; },
    insert(v) { st.op = 'insert'; st.row = v; return q; }, update(v) { st.op = 'update'; st.patch = v; return q; }, single() { st.single = true; return q; },
    then(res, rej) { const t = (db[table] = db[table] || []); let out;
      if (st.op === 'insert') { const r = Object.assign({ id: '99999999-9999-9999-9999-99999999999' + (t.length % 10), step: 0, opt_out: false, converted: false, created_at: new Date(NOW).toISOString() }, st.row); t.push(r); out = { data: st.single ? r : [r], error: null }; }
      else if (st.op === 'update') { t.filter((r) => st.f.every((f) => f(r))).forEach((r) => Object.assign(r, st.patch)); out = { data: null, error: null }; }
      else out = { data: t.filter((r) => st.f.every((f) => f(r))), error: null };
      return Promise.resolve(out).then(res, rej); } }; return q; };
  const stack = [], expressStub = Object.assign(() => {}, { Router: () => ({ stack, get(p, ...h) { stack.push({ m: 'get', p, h }); }, post(p, ...h) { stack.push({ m: 'post', p, h }); } }), json: () => (q, s, n) => n && n() });
  const orig = Module._load; Module._load = function (r, ...a) { return r === '@supabase/supabase-js' ? { createClient: () => ({ from }) } : r === 'express' ? expressStub : orig.call(this, r, ...a); };
  delete require.cache[require.resolve('../src/routes/nutricao.js')]; const mod = require('../src/routes/nutricao.js'); Module._load = orig;
  const handler = (m, p) => stack.find((l) => l.m === m && l.p === p).h[l.h ? 0 : 0];
  const call = async (m, p, req) => { const route = stack.find((l) => l.m === m && l.p === p); let out = { c: 200 }; const res = { status(c) { out.c = c; return res; }, json(b) { out.b = b; return res; }, type() { return res; }, send(b) { out.html = b; return res; } };
    const r = Object.assign({ ip: '1.1.1.' + Math.random(), path: p, query: {}, headers: {}, body: {} }, req); let i = 0; const next = async () => { const h = route.h[i++]; if (h) await h(r, res, next); }; await next(); for (let k = 0; k < 60 && out.b === undefined && out.html === undefined; k++) await new Promise((x) => setTimeout(x, 10)); return out; };
  const g = globalThis.fetch; globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, text: async () => '' }; };
  return { mod, call, sent, supabase: { from }, restore: () => { globalThis.fetch = g; } };
}

test('inscrição com confirmação: só envia o e-mail de confirmação; a sequência começa depois do clique', async () => {
  const db = {}; const t = load(db);
  try {
    assert.equal((await t.call('post', '/funil/inscrever', { body: { email: 'a@b.com' } })).c, 400);
    assert.equal((await t.call('post', '/funil/inscrever', { body: { email: 'ruim', consentimento: true } })).c, 400);
    assert.equal(db.nutricao, undefined);
    const ok = await t.call('post', '/funil/inscrever', { body: { email: ' Ana@B.com ', consentimento: true, visitor: 'abcdef12-3456', campanha: 'Free Out' } });
    assert.equal(ok.c, 200); assert.equal(db.nutricao.length, 1); assert.equal(db.nutricao[0].email, 'ana@b.com');
    assert.ok(!db.nutricao[0].confirmed_at); assert.equal(db.crm_leads, undefined);
    assert.equal(t.sent.length, 1); assert.match(t.sent[0].subject, /Confirme/); const link = /nutricao\/confirmar\?i=([0-9a-f-]+)&(?:amp;)?t=([\w-]+)/.exec(t.sent[0].html);
    assert.ok(link);
    // repetir logo em seguida não reenvia (limite de 1 por hora) nem duplica
    await t.call('post', '/funil/inscrever', { body: { email: 'ana@b.com', consentimento: true } });
    assert.equal(db.nutricao.length, 1); assert.equal(t.sent.length, 1);
    // link inválido não confirma
    assert.equal((await t.call('get', '/nutricao/confirmar', { query: { i: link[1], t: 'x'.repeat(32) } })).c, 400); assert.ok(!db.nutricao[0].confirmed_at);
    // link válido confirma, cria o contato no CRM e envia o 1º e-mail uma única vez
    assert.equal((await t.call('get', '/nutricao/confirmar', { query: { i: link[1], t: link[2] } })).c, 200);
    assert.ok(db.nutricao[0].confirmed_at); assert.equal(db.crm_leads.length, 1); assert.equal(db.crm_leads[0].origem, 'triagem');
    assert.equal(t.sent.length, 2); assert.match(t.sent[1].html, /utm_campaign=Free\+Out/);
    await t.call('get', '/nutricao/confirmar', { query: { i: link[1], t: link[2] } });
    assert.equal(t.sent.length, 2); assert.equal(db.crm_leads.length, 1);
  } finally { t.restore(); }
});

test('cron: exige segredo; envia só o que venceu; para quem comprou ou saiu', async () => {
  const U = (n) => '0000000' + n + '-0000-0000-0000-000000000000';
  const mk = (n, o) => Object.assign({ id: U(n), email: 'p' + n + '@x.com', campanha: null, step: 1, confirmed_at: '2026-10-01T00:00:00Z', opt_out: false, converted: false, created_at: new Date(NOW - 2 * DAY).toISOString() }, o);
  const db = { nutricao: [mk(1), mk(2, { created_at: new Date(NOW - 1 * DAY).toISOString() }), mk(3), mk(4, { opt_out: true }), mk(5), mk(6, { confirmed_at: null })], profiles: [{ email: 'p3@x.com', plan: 'basic' }], crm_leads: [{ email: 'p5@x.com', etapa: 'cliente' }] };
  const t = load(db);
  try {
    assert.equal((await t.call('get', '/cron/nutricao', { headers: {} })).c, 401);
    const r = await t.mod.runNutricao({ supabase: t.supabase, now: NOW, send: async (m) => { t.sent.push(m); return { sent: true }; }, appUrl: ENV.APP_URL, limit: 40, budgetMs: 5000 });
    assert.equal(r.sent, 1); assert.equal(r.converted, 2);
    assert.equal(db.nutricao[0].step, 2); assert.equal(db.nutricao[1].step, 1); assert.equal(db.nutricao[2].converted, true); assert.equal(db.nutricao[4].converted, true);
    const again = await t.mod.runNutricao({ supabase: t.supabase, now: NOW, send: async () => ({ sent: true }), appUrl: ENV.APP_URL, limit: 40, budgetMs: 5000 });
    assert.equal(again.sent, 0);
  } finally { t.restore(); }
});

test('sair: só com link assinado', async () => {
  const id = '11111111-1111-1111-1111-111111111111', db = { nutricao: [{ id, email: 'a@b.com', step: 1, opt_out: false }] }; const t = load(db);
  try {
    assert.equal((await t.call('get', '/nutricao/sair', { query: { i: id, t: 'falso' } })).c, 400); assert.equal(db.nutricao[0].opt_out, false);
    const tok = require('crypto').createHmac('sha256', 'segredo').update('nutri:' + id).digest('base64url').slice(0, 32);
    const ok = await t.call('get', '/nutricao/sair', { query: { i: id, t: tok } }); assert.equal(ok.c, 200); assert.equal(db.nutricao[0].opt_out, true);
  } finally { t.restore(); }
});
