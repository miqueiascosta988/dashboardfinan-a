const test = require('node:test'), assert = require('node:assert');
const { DI, pdfPages, fx } = require('./helpers');
async function run(name) {
  const pg = await pdfPages(fx(name));
  const r = DI.processDocument(pg, [], { fileName: name, hint: null, contentHash: 'h' + name, newId: () => 'id', now: '2026-10-20' });
  return r.outcomes[0].entity;
}
test('Netflix: serviço, plano, ciclo, datas, pagamento e valor', async () => {
  const e = await run('X1_netflix.pdf'), f = e.extractedData.fin, x = f.extra;
  assert.equal(e.category, 'assinatura'); assert.equal(f.direction, 'out'); assert.equal(f.amount, 44.9); assert.equal(f.date, '2026-10-05');
  assert.equal(x.servico, 'Netflix'); assert.equal(x.plano, 'Padrão com anúncios'); assert.equal(x.ciclo, 'mensal'); assert.equal(x.proxima, '2026-11-05'); assert.equal(x.desde, '2023-03-12');
  assert.match(x.pagamento, /4242/); assert.equal(x.pedido, 'NF8842931077'); assert.ok(x.renovAuto); assert.equal(x.catGasto, 'Lazer');
  assert.match(x.conta, /^m•••@/); assert.ok(!JSON.stringify(f).includes('marina.teste'));       // e-mail só mascarado
});
test('Spotify: desconto promocional é avisado', async () => {
  const f = (await run('X2_spotify.pdf')).extractedData.fin;
  assert.equal(f.extra.servico, 'Spotify'); assert.equal(f.extra.plano, 'Premium Individual'); assert.equal(f.amount, 23.9); assert.equal(f.extra.desconto, 5);
  assert.ok(f.notes.some(n => /desconto/i.test(n)));
});
test('Clube iFood e Uber One (anual → equivalente mensal)', async () => {
  const a = (await run('X3_ifood_clube.pdf')).extractedData.fin, b = (await run('X4_uber_one.pdf')).extractedData.fin;
  assert.equal(a.extra.servico, 'iFood'); assert.equal(a.extra.tipoCobranca, 'assinatura'); assert.equal(a.amount, 9.9); assert.equal(a.extra.catGasto, 'Alimentação');
  assert.equal(b.extra.servico, 'Uber'); assert.equal(b.extra.ciclo, 'anual'); assert.equal(b.amount, 119.9); assert.equal(b.extra.mensal, 9.99); assert.equal(b.extra.catGasto, 'Transporte');
});
test('Pedido iFood: itens, taxa, cupom, total e restaurante', async () => {
  const f = (await run('X5_ifood_pedido.pdf')).extractedData.fin, x = f.extra;
  assert.equal(x.tipoCobranca, 'pedido'); assert.equal(f.amount, 58.9); assert.equal(x.subtotal, 61); assert.equal(x.taxaEntrega, 7.9); assert.equal(x.desconto, 10);
  assert.equal(x.estabelecimento, 'Sabor Caseiro Teste'); assert.equal(x.itens.length, 2); assert.equal(x.pedido, '9912-4455');
});
test('Extrato PDF com coluna de saldo: lê tudo, sinais e fechamento do saldo', async () => {
  const f = (await run('X6_extrato_saldo.pdf')).extractedData.fin, x = f.extra;
  assert.equal(x.qtd, 7); assert.equal(x.entradas, 4700); assert.equal(x.saidas, 511.35); assert.equal(x.fecha, true);
  assert.deepEqual(x.movs[0], ['2026-09-01', 'PIX RECEBIDO MARIA TESTE', 500, 1, 0]); assert.equal(x.movs[1][3], 0);
  assert.deepEqual(x.servicos.map(s => s.servico).sort(), ['Netflix', 'Uber', 'iFood']);
});
test('Extrato PDF com colunas Crédito/Débito', async () => {
  const x = (await run('X7_extrato_colunas.pdf')).extractedData.fin.extra;
  assert.equal(x.qtd, 3); assert.equal(x.entradas, 300); assert.equal(x.saidas, 223.9); assert.equal(x.fecha, true); assert.equal(x.banco, 'Caixa');
});
test('Extrato com datas como cabeçalho e valores com + / −', async () => {
  const x = (await run('X8_extrato_datas.pdf')).extractedData.fin.extra;
  assert.equal(x.qtd, 4); assert.equal(x.entradas, 800); assert.equal(x.saidas, 1365.05); assert.equal(x.movs[3][0], '2026-10-06');
});
test('Extrato sem sinal: o sinal vem da diferença de saldo', async () => {
  const x = (await run('X9_extrato_sem_sinal.pdf')).extractedData.fin.extra;
  assert.equal(x.qtd, 3); assert.equal(x.entradas, 3000); assert.equal(x.saidas, 344.1); assert.equal(x.fecha, true); assert.equal(x.incertos, 0);
  assert.equal(x.servicos[0].servico, 'Disney+');
});
test('Fatura de cartão e boleto continuam sendo o que são', async () => {
  for (const [n, k] of [['K_fatura.pdf', 'fatura'], ['O_fatura_total.pdf', 'fatura'], ['M_boleto_valido.pdf', 'boleto'], ['A_holerite_colunas.pdf', 'holerite']]) {
    const pg = await pdfPages(fx(n)), r = DI.processDocument(pg, [], { fileName: n, hint: null, contentHash: 'h' + n, newId: () => 'id', now: '2026-10-20' });
    assert.equal(r.classification.kind, k, n);
  }
});
