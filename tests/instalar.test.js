// Guia de instalação do app para qualquer navegador
const test = require('node:test'), assert = require('node:assert');
const I = require('../public/instalar.js');
const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0' };
test('detecta plataforma e navegador', () => {
  assert.deepEqual([I.detect(UA.iosSafari, 'iPhone', 5).ios, I.detect(UA.iosSafari, 'iPhone', 5).browser], [true, 'safari']);
  assert.equal(I.detect(UA.iosChrome, 'iPhone', 5).browser, 'chrome');
  assert.equal(I.detect('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15', 'MacIntel', 5).ios, true);   // iPad moderno
  assert.equal(I.detect(UA.macSafari, 'MacIntel', 0).ios, false);
  assert.deepEqual([I.detect(UA.samsung, 'Linux', 5).android, I.detect(UA.samsung, 'Linux', 5).browser], [true, 'samsung']);
  assert.equal(I.detect(UA.winEdge, 'Win32', 0).browser, 'edge'); assert.equal(I.detect(UA.winFirefox, 'Win32', 0).browser, 'firefox'); assert.equal(I.detect(UA.winChrome, 'Win32', 0).mobile, false);
});
test('cada navegador recebe o passo a passo certo, sempre com pelo menos 2 passos', () => {
  const g = (ua, p, t) => I.guide(I.detect(ua, p, t));
  assert.match(g(UA.iosSafari, 'iPhone', 5).passos.join(' '), /Compartilhar.*Adicionar à Tela de Início/s);
  assert.match(g(UA.iosChrome, 'iPhone', 5).passos.join(' '), /Safari/);
  assert.match(g(UA.androidChrome, 'Linux', 5).passos.join(' '), /Instalar app/);
  assert.match(g(UA.samsung, 'Linux', 5).passos.join(' '), /Tela inicial/);
  assert.match(g(UA.androidFirefox, 'Linux', 5).passos.join(' '), /Instalar/);
  assert.match(g(UA.macSafari, 'MacIntel', 0).passos.join(' '), /Dock/);
  assert.match(g(UA.winFirefox, 'Win32', 0).passos.join(' '), /Chrome ou no Edge/);
  assert.match(g(UA.winChrome, 'Win32', 0).passos.join(' '), /barra de endereço/);
  for (const [ua, p, t] of [[UA.iosSafari, 'iPhone', 5], [UA.androidChrome, 'Linux', 5], [UA.winEdge, 'Win32', 0], [UA.winFirefox, 'Win32', 0], ['', '', 0]]) assert.ok(g(ua, p, t).passos.length >= 2);
});
test('standalone: esconde o botão quando já está instalado', () => {
  assert.equal(I.isStandalone({ matchMedia: () => ({ matches: true }), navigator: {} }), true);
  assert.equal(I.isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), true);
  assert.equal(I.isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} }), false); assert.equal(I.isStandalone({}), false);
});
