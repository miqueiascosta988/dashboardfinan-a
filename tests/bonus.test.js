// Ciclo 10: bônus de boas-vindas (3 documentos em 48 h no plano Free) + eventos no CRM.
const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../public/bonus.js'), C = require('../src/lib/crm.js');
const H = 3600000, t0 = Date.parse('2026-11-04T12:00:00Z'), iso = new Date(t0).toISOString();

test('vale por 48 h e 3 documentos; o 4º e depois do prazo não', () => {
  assert.equal(B.info(iso, 0, t0 + 1 * H).ativo, true);
  assert.equal(B.info(iso, 2, t0 + 47 * H).ativo, true); assert.equal(B.info(iso, 2, t0 + 47 * H).restantes, 1);
  assert.equal(B.info(iso, 3, t0 + 1 * H).ativo, false); assert.equal(B.info(iso, 3, t0 + 1 * H).motivo, 'esgotado');
  assert.equal(B.info(iso, 0, t0 + 48 * H).ativo, false); assert.equal(B.info(iso, 0, t0 + 48 * H).motivo, 'prazo');
  assert.equal(B.info(iso, 0, t0 + 49 * H).ativo, false);
});
test('falha fechada: sem data válida ou relógio antes do cadastro, não libera', () => {
  assert.equal(B.info(null, 0, t0).ativo, false); assert.equal(B.info('lixo', 0, t0).ativo, false); assert.equal(B.info(iso, 0, t0 - H).ativo, false);
  assert.equal(B.info(iso, -5, t0 + H).usados, 0); assert.equal(B.info(iso, 99, t0 + H).usados, 3);
});
test('usar conta de 1 em 1 e para em 3; não altera o original', () => {
  const s0 = B.emptyStore(), s1 = B.usar(s0), s3 = B.usar(B.usar(s1)), s4 = B.usar(s3);
  assert.equal(s0.n, 0); assert.equal(s1.n, 1); assert.equal(s3.n, 3); assert.equal(s4.n, 3); assert.equal(B.usar(null).n, 1);
});
test('aviso: texto com restantes e horas; sem aviso quando inativo', () => {
  const a = B.aviso(B.info(iso, 1, t0 + 17 * H + 1000));
  assert.match(a.titulo, /2 de 3 documentos/); assert.match(a.texto, /31 horas/);
  assert.equal(B.aviso(B.info(iso, 3, t0 + H)), null); assert.equal(B.aviso(null), null);
  assert.match(B.aviso(B.info(iso, 2, t0 + 47 * H + 1000)).texto, /1 documento\b.*1 hora\b/);
});
test('CRM conta bônus usado e esgotado por visitante', () => {
  const ev = [{ visitor: 'v1abcdefgh', etapa: 'bonus_usado', campanha: 'x' }, { visitor: 'v1abcdefgh', etapa: 'bonus_esgotado', campanha: 'x' }, { visitor: 'v2abcdefgh', etapa: 'bonus_usado', campanha: 'x' }, { visitor: 'v2abcdefgh', etapa: 'bonus_usado', campanha: 'x' }];
  const p = C.painel(ev, [], []);
  assert.equal(p.total.bonus_usado, 2); assert.equal(p.total.bonus_esgotado, 1);
  assert.ok(C.ETAPAS.includes('bonus_usado') && C.ETAPAS.includes('bonus_esgotado'));
});
