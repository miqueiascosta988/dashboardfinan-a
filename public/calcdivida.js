/* SM Financial — Calculadora de dívidas + assistente (lógica pura, motor próprio, sem IA externa).
 * Tudo é conta de juros compostos mensais sobre os números informados; nada é enviado a servidor. Não é aconselhamento jurídico/financeiro. */
(function (root) {
  'use strict';
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var BRL = function (v) { return 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var PCT = function (v) { return (Math.round(v * 100) / 100).toLocaleString('pt-BR') + '%'; };
  var MESES = function (n) { return n >= 24 ? n + ' meses (cerca de ' + (Math.round(n / 12 * 10) / 10).toString().replace('.', ',') + ' anos)' : n === 1 ? '1 mês' : n + ' meses'; };
  var TIPOS = { cartao: 'Cartão de crédito (rotativo/parcelado)', cheque: 'Cheque especial', emprestimo: 'Empréstimo pessoal', consignado: 'Consignado', financiamento: 'Financiamento (veículo/imóvel)', loja: 'Crediário de loja', outro: 'Outro' };
  var ALTA = { cartao: 8, cheque: 7, loja: 6, emprestimo: 4, outro: 5, consignado: 2.5, financiamento: 2 };   // limiares de "juros alto" por tipo (% a.m.), regra de bolso para alertar, não é taxa de mercado

  function annualFromMonthly(m) { return (Math.pow(1 + m / 100, 12) - 1) * 100; }
  function monthlyFromAnnual(a) { return (Math.pow(1 + a / 100, 1 / 12) - 1) * 100; }

  // Simula pagar "pay" por mês (juros sobre o saldo, depois abate). null = a parcela não cobre os juros.
  function simulate(saldo, ratePct, pay) {
    var r = ratePct / 100, s = saldo, months = 0, interest = 0, paid = 0;
    if (saldo <= 0) return { months: 0, interest: 0, paid: 0 };
    if (pay <= 0 || (r > 0 && pay <= saldo * r)) return null;
    while (s > 0.005 && months < 1200) {
      var j = s * r, p = Math.min(pay, s + j); interest += j; paid += p; s = s + j - p; months++;
    }
    return months >= 1200 ? null : { months: months, interest: r2(interest), paid: r2(paid) };
  }
  // Parcela fixa para quitar em n meses (tabela Price).
  function payFor(saldo, ratePct, n) {
    var r = ratePct / 100; if (n <= 0) return null;
    return r2(r === 0 ? saldo / n : saldo * r / (1 - Math.pow(1 + r, -n)));
  }

  function analyze(o) {
    o = o || {}; var saldo = +o.saldo || 0, juros = +o.juros || 0, parcela = +o.parcela || 0, extra = +o.extra || 0, renda = +o.renda || 0, tipo = o.tipo || 'outro', alvo = +o.alvoMeses || 0;
    var out = { valid: saldo > 0 && parcela > 0, questions: [], explain: [], suggestions: [], scenarios: [] };
    if (!out.valid) { out.suggestions.push('Informe o saldo devedor e a parcela que você consegue pagar por mês para eu calcular.'); return out; }
    var jMes = r2(saldo * juros / 100), base = simulate(saldo, juros, parcela);
    out.interestFirst = jMes; out.annual = r2(annualFromMonthly(juros)); out.base = base;
    out.cover = parcela > jMes;
    // Perguntas que o assistente faz quando falta informação ou há dúvida de unidade
    if (!o.jurosInformado && juros === 0) out.questions.push({ id: 'juros', ask: 'Qual a taxa de juros mensal? Está no contrato, na fatura ou no app do banco (procure "juros a.m." ou "CET").', kind: 'number' });
    if (!o.tipo) out.questions.push({ id: 'tipo', ask: 'Que tipo de dívida é essa? Isso muda a prioridade e as opções de saída.', kind: 'tipo' });
    if (juros > 25) out.questions.push({ id: 'unidade', ask: 'Esse juros de ' + PCT(juros) + ' é ao mês ou ao ano? Se for ao ano, mude o campo para "ao ano".', kind: 'info' });
    if (!renda) out.questions.push({ id: 'renda', ask: 'Quanto você recebe por mês? Assim eu aviso se essa parcela está pesando demais.', kind: 'number' });
    if (!extra) out.questions.push({ id: 'extra', ask: 'Você consegue pagar um valor extra por mês (ou algum valor de uma vez, como 13º ou férias)? Veja abaixo o efeito.', kind: 'number' });

    // Explicações: de onde vem cada número
    out.explain.push({ q: 'De onde vem o juros do primeiro mês?', a: 'Saldo ' + BRL(saldo) + ' × taxa ' + PCT(juros) + ' ao mês = ' + BRL(jMes) + '. Esse é o custo de "manter" a dívida por um mês.' });
    out.explain.push({ q: 'Quanto da parcela vira dívida paga?', a: 'Da parcela de ' + BRL(parcela) + ', ' + BRL(Math.min(jMes, parcela)) + ' paga o juros e ' + BRL(Math.max(0, parcela - jMes)) + ' abate o saldo (' + PCT(Math.max(0, (parcela - jMes) / parcela * 100)) + ' da parcela).' });
    out.explain.push({ q: 'Por que o juros anual é maior que 12 × o mensal?', a: 'Juros são compostos: cada mês incide sobre o saldo já com os juros anteriores. ' + PCT(juros) + ' ao mês equivale a ' + PCT(out.annual) + ' ao ano, calculado como (1 + ' + String(juros).replace('.', ',') + '/100)^12 − 1.' });
    if (base) {
      out.explain.push({ q: 'Como calculei o prazo e o total de juros?', a: 'Simulo mês a mês: soma o juros do mês ao saldo, desconta a parcela e repete até zerar. Em ' + MESES(base.months) + ' você paga ' + BRL(base.paid) + ' no total, sendo ' + BRL(base.interest) + ' só de juros.' });
    }
    out.explain.push({ q: 'O que esse cálculo não inclui?', a: 'Seguros, tarifas, IOF, multas e atraso podem fazer o valor real ser maior. Para o número exato, peça ao credor o saldo para quitação e o CET.' });

    if (base) {
      var pctJ = base.paid > 0 ? base.interest / saldo * 100 : 0;
      out.totalCostPct = r2(pctJ);
      // Cenários com valor extra por mês
      var opts = [Math.round(parcela * 0.1), Math.round(parcela * 0.25), Math.round(parcela * 0.5)].filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; });
      if (extra > 0) opts = [extra].concat(opts.filter(function (v) { return v !== extra; }));
      opts.forEach(function (ex) { var s = simulate(saldo, juros, parcela + ex); if (s) out.scenarios.push({ extra: ex, months: s.months, saveMonths: base.months - s.months, interest: s.interest, saveInterest: r2(base.interest - s.interest), mine: ex === extra }); });
    }
    if (alvo > 0) out.target = { months: alvo, parcela: payFor(saldo, juros, alvo) };
    if (out.target) out.explain.push({ q: 'Como calculei a parcela para quitar em ' + alvo + ' meses?', a: 'Uso a fórmula de parcela fixa (tabela Price): saldo × taxa ÷ (1 − (1 + taxa)^−' + alvo + ') = ' + BRL(out.target.parcela) + ' por mês.' });

    // Sugestões de pagamento
    var S = out.suggestions;
    if (!out.cover) {
      S.push('Atenção: essa parcela não cobre nem o juros do mês (' + BRL(jMes) + '). Pagando só isso, a dívida cresce. O mínimo para começar a baixar o saldo é acima de ' + BRL(jMes) + '; procure negociar prazo/taxa ou aumentar a parcela.');
    } else if (base) {
      S.push('No ritmo atual, você quita em ' + MESES(base.months) + ' e paga ' + BRL(base.interest) + ' de juros (' + PCT(out.totalCostPct) + ' do valor devido).');
      var best = out.scenarios.filter(function (x) { return !x.mine; })[0] || out.scenarios[0];
      if (best && best.saveInterest > 0) S.push('Se acrescentar ' + BRL(best.extra) + ' por mês, você quita ' + MESES(best.saveMonths) + ' antes e economiza ' + BRL(best.saveInterest) + ' em juros.');
    }
    var lim = ALTA[tipo] || 5;
    if (juros >= lim) S.push('Esse juros (' + PCT(juros) + ' ao mês) é alto para ' + (TIPOS[tipo] || 'esse tipo de dívida').split(' (')[0].toLowerCase() + '. Vale pesquisar trocar essa dívida por outra mais barata (como consignado ou portabilidade) e pedir ao credor uma proposta de renegociação.');
    if (tipo === 'cartao') S.push('No cartão, evite o rotativo: se não der para pagar a fatura toda, negocie o parcelamento da fatura ou troque por crédito mais barato antes de a dívida crescer.');
    if (tipo === 'cheque') S.push('Cheque especial costuma ser a linha mais cara: priorize sair dele, mesmo que seja trocando por empréstimo com taxa menor.');
    if (tipo === 'financiamento' || tipo === 'consignado') S.push('Nesse tipo de dívida a taxa costuma ser menor. Se tiver outras dívidas mais caras, pague essas primeiro e mantenha esta no ritmo normal.');
    if (renda > 0) {
      var comp = parcela / renda * 100;
      if (comp > 30) S.push('Essa parcela consome ' + PCT(comp) + ' da sua renda. Acima de cerca de 30%, o orçamento fica apertado; considere renegociar para reduzir a parcela.');
      else S.push('Essa parcela equivale a ' + PCT(comp) + ' da sua renda, dentro de uma faixa que costuma ser administrável.');
    }
    S.push('Ao pagar antecipado ou quitar, você pode pedir a redução proporcional dos juros (direito do consumidor previsto no Código de Defesa do Consumidor). Peça o saldo de quitação por escrito. Este app não é consultoria jurídica ou financeira; em caso de dúvida, procure o Procon ou um profissional.');
    return out;
  }

  // Ordem de ataque para várias dívidas cadastradas (juros mais altos primeiro; sem juros informados, menor saldo).
  function prioritize(debts) {
    var l = (debts || []).filter(function (d) { return (+d.saldo || 0) > 0; });
    var withRate = l.some(function (d) { return (+d.juros || 0) > 0; });
    l = l.slice().sort(withRate ? function (a, b) { return (+b.juros || 0) - (+a.juros || 0) || a.saldo - b.saldo; } : function (a, b) { return a.saldo - b.saldo; });
    return l.map(function (d, i) { return { name: d.name, saldo: +d.saldo, juros: +d.juros || 0, order: i + 1, why: i === 0 ? (withRate ? 'Tem o juros mais alto: todo valor extra rende mais aqui. Pague o mínimo nas outras.' : 'É a menor dívida: quitar primeiro libera a parcela para a próxima.') : 'Pague o mínimo até quitar a anterior; depois use a parcela liberada aqui.' }; });
  }

  var api = { analyze: analyze, simulate: simulate, payFor: payFor, prioritize: prioritize, annualFromMonthly: annualFromMonthly, monthlyFromAnnual: monthlyFromAnnual, TIPOS: TIPOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CalcDivida = api;
})(typeof window !== 'undefined' ? window : this);
