const test = require('node:test'), assert = require('node:assert');
const C = require('../src/lib/crm');
test('painel: funil por campanha, custos e ROAS (junção sem acento/maiúscula)', () => {
  const ev = [];
  for (let i = 0; i < 50; i++) ev.push({ visitor: 'v' + i, etapa: 'triagem_visita', campanha: 'Free Out' });
  for (let i = 0; i < 20; i++) ev.push({ visitor: 'v' + i, etapa: 'apresentacao_visita', campanha: 'free out' });
  for (let i = 0; i < 5; i++) ev.push({ visitor: 'v' + i, etapa: 'checkout_clique', campanha: 'FREE OUT' });
  ev.push({ visitor: 'v0', etapa: 'checkout_clique', campanha: 'Free Out' });   // duplicado: não conta de novo
  const ads = [{ campanha: 'Free Out', investimento: 100, impressoes: 10000, cliques: 200 }, { campanha: 'free out', investimento: 50, impressoes: 5000, cliques: 100 }];
  const leads = [{ etapa: 'cliente', campanha: 'free out', valor: 8 }, { etapa: 'cliente', campanha: 'FREE OUT', valor: 5 }, { etapa: 'perdido', campanha: 'free out', valor: 9 }];
  const p = C.painel(ev, ads, leads), r = p.rows[0];
  assert.equal(p.rows.length, 1); assert.equal(r.invest, 150); assert.equal(r.triagem_visita, 50); assert.equal(r.checkout_clique, 5);
  assert.equal(r.compras, 2); assert.equal(r.receita, 13); assert.equal(r.cpa, 75); assert.equal(r.ctr, 2); assert.equal(r.cpc, 0.5); assert.equal(r.roas, 0.09);
  assert.equal(p.funil[1].doTopo, 0); assert.equal(p.funil[2].deAnterior, null === 0 ? 0 : p.funil[2].deAnterior);
});
test('painel: sem dados não divide por zero', () => {
  const p = C.painel([], [], []); assert.equal(p.total.cpa, null); assert.equal(p.rows.length, 0);
});
test('CSV do gerenciador (pt-BR, ponto e vírgula, vírgula decimal)', () => {
  const csv = '﻿Dia;Nome da campanha;Valor usado (BRL);Impressões;Cliques no link\n2026-10-15;Free Out;"1.234,56";10.500;321\n16/10/2026;Free Out;50,10;800;12\n';
  const { rows, erro } = C.parseCsv(csv);
  assert.equal(erro, null); assert.deepEqual(rows[0], { dia: '2026-10-15', campanha: 'Free Out', investimento: 1234.56, impressoes: 10500, cliques: 321 }); assert.equal(rows[1].dia, '2026-10-16');
});
test('CSV em inglês e erro claro quando faltam colunas', () => {
  assert.equal(C.parseCsv('Day,Campaign name,Amount spent (BRL),Impressions,Link clicks\n2026-10-15,A,10.5,100,3').rows[0].investimento, 10.5);
  assert.match(C.parseCsv('a,b\n1,2').erro, /colunas/);
});
test('resposta da Meta vira linhas por dia/campanha', () => {
  const r = C.metaParse({ data: [{ campaign_name: 'X', date_start: '2026-10-15', spend: '12.30', impressions: '1000', inline_link_clicks: '40', clicks: '99' }, { date_start: '2026-10-15' }] });
  assert.deepEqual(r, [{ dia: '2026-10-15', campanha: 'X', investimento: 12.3, impressoes: 1000, cliques: 40 }]);
});
