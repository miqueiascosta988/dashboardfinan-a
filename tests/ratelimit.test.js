// Limite de requisições: bloqueia após o máximo e guarda só código (hash) do IP
const test = require('node:test'), assert = require('node:assert');
const Module = require('module'), orig = Module._load;
Module._load = function (r, ...a) { return r === '@supabase/supabase-js' ? { createClient: () => ({}) } : orig.call(this, r, ...a); };
const { limiter } = require('../src/lib/ratelimit'); Module._load = orig;
test('limiter: libera até o máximo e responde 429 depois; IPs diferentes não se misturam', async () => {
  delete process.env.SUPABASE_URL;
  const mw = limiter(2, 60000), run = async (ip) => { let c = 200, nexted = false; await mw({ ip, path: '/x' }, { status(n) { c = n; return { json() {} }; } }, () => { nexted = true; }); return nexted ? 200 : c; };
  assert.equal(await run('9.9.9.9'), 200); assert.equal(await run('9.9.9.9'), 200); assert.equal(await run('9.9.9.9'), 429); assert.equal(await run('8.8.8.8'), 200);
});
