const test = require('node:test'), assert = require('node:assert');
const cfg = require('../vercel.json');
test('câmera (scanner de boleto/QR) e microfone (lançar por voz) liberados só para o próprio site', () => {
  const pp = cfg.routes.find(r => r.headers && r.headers['Permissions-Policy']).headers['Permissions-Policy'];
  assert.match(pp, /camera=\(self\)/); assert.match(pp, /microphone=\(self\)/); assert.match(pp, /geolocation=\(\)/);
});
