// Leitura de valores em reais: o jeito que o brasileiro digita precisa dar o mesmo número, sempre.
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../public/money.js');
const val = (s, o) => { const r = M.parse(s, o); return r.ok ? (r.empty ? null : r.value) : 'ERRO:' + r.reason; };

test('o caso que quebrou na auditoria: 3.200,50 vale 3200,50 (não R$ 3)', () => {
  assert.equal(val('3.200,50'), 3200.5);
  assert.equal(val('3200,50'), 3200.5);
  assert.equal(val('3200.50'), 3200.5);
  assert.equal(val('R$ 3.200,50'), 3200.5);
  assert.equal(val('3.200'), 3200);          // jeito brasileiro de escrever milhar
  assert.equal(val('3200'), 3200);
});
test('decimais e centavos', () => {
  assert.equal(val('1500.75'), 1500.75);
  assert.equal(val('1500,75'), 1500.75);
  assert.equal(val('0,5'), 0.5);
  assert.equal(val('0.5'), 0.5);
  assert.equal(val('3.5'), 3.5);
  assert.equal(val(',99'), 0.99);
  assert.equal(val('12,5'), 12.5);
  assert.equal(val('0.123'), 'ERRO:casas');   // 3 casas depois do ponto começando em zero não é milhar: recusa em vez de arredondar calado
  assert.equal(val('10,999'), 'ERRO:casas');
});
test('milhares múltiplos e formato americano', () => {
  assert.equal(val('1.234.567,89'), 1234567.89);
  assert.equal(val('1.234.567'), 1234567);
  assert.equal(val('1,234,567.89'), 1234567.89);
  assert.equal(val('1,234,567'), 1234567);
  assert.equal(val('1.234,5'), 1234.5);
});
test('zero, vazio e espaços', () => {
  assert.equal(val('0'), 0);
  assert.equal(val('0,00'), 0);
  assert.equal(val(''), null);
  assert.equal(val('   '), null);
  assert.equal(val(null), null);
  assert.equal(val(' R$  10 '), 10);
});
test('negativos só quando o campo permite', () => {
  assert.equal(val('-50'), 'ERRO:negativo');
  assert.equal(val('(50,00)'), 'ERRO:negativo');
  assert.equal(val('-50,25', { allowNegative: true }), -50.25);
});
test('entradas inválidas são recusadas (nunca viram zero em silêncio)', () => {
  assert.equal(val('abc'), 'ERRO:caracteres');
  assert.equal(val('12a'), 'ERRO:caracteres');
  assert.equal(val('1,2,3'), 'ERRO:formato');
  assert.equal(val('1.2.3'), 'ERRO:formato');
  assert.equal(val('1..2'), 'ERRO:formato');
  assert.equal(val('1,23,456,78'), 'ERRO:formato');
  assert.equal(val('99999999999999'), 'ERRO:tamanho');
  assert.equal(val('.'), 'ERRO:caracteres');
});
test('formatação para o campo e para a tela: sempre 2 casas', () => {
  assert.equal(M.formatField(1500.75), '1.500,75');
  assert.equal(M.formatField(3), '3,00');
  assert.equal(M.formatField(0), '0,00');
  assert.equal(M.formatField(-1234.5), '-1.234,50');
  assert.equal(M.brl(3200.5), 'R$ 3.200,50');
  assert.equal(M.formatField(0.1 + 0.2), '0,30');
});
test('ida e volta: o que é formatado é lido de novo igual', () => {
  for (const n of [0, 0.01, 1, 9.99, 10, 99.9, 1000, 1234.56, 3200.5, 99999.99, 1234567.89]) {
    assert.equal(M.parse(M.formatField(n)).value, n, String(n));
  }
});
