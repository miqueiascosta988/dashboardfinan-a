/* CardPlan — cartão de crédito parcelado (parcelou a fatura 2x, 3x…) e lista de urgência das dívidas.
   Funções puras (sem DOM): tudo o que aparece na tela vem de contas verificáveis a partir do que o usuário informou.
   Nada é inventado: o que falta (taxa, renda, valor parcelado) vira PERGUNTA/aviso, nunca um número chutado.
   Conteúdo educativo; não é recomendação individual de crédito. */
(function (root) {
  'use strict';
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var brl = function (v) { return 'R$ ' + r2(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var pct = function (v) { return (Math.round(v * 10) / 10).toString().replace('.', ',') + '%'; };

  // parcela de um financiamento price: PV, taxa mensal (fração), n
  function pmt(pv, r, n) { if (!(n > 0)) return 0; if (!r) return pv / n; var f = Math.pow(1 + r, n); return pv * r * f / (f - 1); }
  // valor presente de n parcelas p a taxa r
  function pvOf(p, r, n) { if (!(n > 0)) return 0; if (!r) return p * n; return p * (1 - Math.pow(1 + r, -n)) / r; }
  // taxa mensal implícita: valor parcelado, parcela, nº total de parcelas. null quando não dá para calcular.
  function irr(valor, parcela, n) {
    if (!(valor > 0 && parcela > 0 && n > 0)) return null;
    if (parcela * n < valor - 0.005) return null;            // parcelas somam menos que o valor: dado inconsistente
    if (parcela * n <= valor + 0.005) return 0;
    var lo = 0, hi = 1, i; for (i = 0; i < 100; i++) { var mid = (lo + hi) / 2; if (pmt(valor, mid, n) > parcela) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  }
  // meses para quitar saldo b, juros r (fração/mês), pagando p por mês. Infinity se a parcela não cobre os juros.
  function nper(b, r, p) {
    if (!(b > 0)) return 0; if (!(p > 0)) return Infinity; if (!r) return Math.ceil(b / p - 1e-9);
    if (p <= b * r + 1e-9) return Infinity;
    return Math.ceil(-Math.log(1 - b * r / p) / Math.log(1 + r) - 1e-9);
  }
  function interestTotal(b, r, p) { var n = nper(b, r, p); if (!isFinite(n)) return Infinity; return r2(Math.max(0, p * n - b)); }

  // ─────────────────────────────────────────────────────────────────────────
  // Um cartão com parcelamentos de fatura já feitos.
  // inp: { name, saldo, juros (% a.m. do cartão/rotativo; opcional), inclui (o saldo já contém as parcelas futuras?),
  //        plans: [{ parcela, restantes, valor (opcional: quanto foi parcelado), total (opcional: nº total de parcelas) }],
  //        renda, essenciais, outrasParcelas (outras dívidas, por mês), ofertaJuros (% a.m. que o banco ofereceu; opcional) }
  function analyzeCard(inp) {
    var name = inp.name || 'Cartão', saldo = Math.max(0, +inp.saldo || 0), inclui = inp.inclui !== false;
    var renda = +inp.renda > 0 ? +inp.renda : null, ess = +inp.essenciais > 0 ? +inp.essenciais : 0, outras = +inp.outrasParcelas > 0 ? +inp.outrasParcelas : 0;
    var cardRate = +inp.juros > 0 ? inp.juros / 100 : null;
    var warn = [], asks = [];
    var plans = (inp.plans || []).filter(function (p) { return p && +p.parcela > 0 && +p.restantes > 0; }).map(function (p, i) {
      var parcela = +p.parcela, rest = Math.round(+p.restantes), total = Math.round(+p.total) > 0 ? Math.round(+p.total) : null, valor = +p.valor > 0 ? +p.valor : null;
      var rate = (valor && (total || rest)) ? irr(valor, parcela, total || rest) : null;
      var nominal = r2(parcela * rest), pvRest = rate != null ? r2(pvOf(parcela, rate, rest)) : null;
      var label = (total ? total + 'x' : rest + ' restantes') + ' de ' + brl(parcela);
      return { id: p.id || ('p' + (i + 1)), parcela: parcela, restantes: rest, total: total, valor: valor, rate: rate, ratePct: rate != null ? r2(rate * 100) : null, nominal: nominal, pvRestante: pvRest, label: label,
               economiaQuitando: pvRest != null ? r2(nominal - pvRest) : null };
    });
    var plansMonthly = r2(plans.reduce(function (s, p) { return s + p.parcela; }, 0)), plansNominal = r2(plans.reduce(function (s, p) { return s + p.nominal; }, 0));
    var aberto = inclui ? r2(saldo - plansNominal) : saldo, inconsistente = false;
    if (aberto < 0) { inconsistente = true; aberto = 0; warn.push('O saldo informado (' + brl(saldo) + ') é menor que a soma das parcelas que faltam (' + brl(plansNominal) + '). Provavelmente o saldo NÃO inclui os parcelamentos: confira a opção "o saldo já inclui as parcelas?".'); }
    var totalCard = inclui ? saldo : r2(saldo + plansNominal);
    var livre = renda != null ? r2(renda - ess - outras - plansMonthly) : null;
    var pctComprometido = renda != null ? Math.round((plansMonthly + outras) / renda * 1000) / 10 : null;
    var nParcelamentos = plans.length;

    // taxa de referência para parcelar de novo: a oferecida pelo banco > a dos parcelamentos anteriores > a do cartão
    var rateRef = null, rateSrc = null;
    if (+inp.ofertaJuros > 0) { rateRef = inp.ofertaJuros / 100; rateSrc = 'a taxa que o banco ofereceu'; }
    else { var known = plans.filter(function (p) { return p.rate != null && p.rate > 0; }); if (known.length) { rateRef = known.reduce(function (s, p) { return s + p.rate; }, 0) / known.length; rateSrc = 'a taxa média dos seus parcelamentos anteriores'; } else if (cardRate != null) { rateRef = cardRate; rateSrc = 'a taxa do cartão que você informou'; } }
    if (rateRef == null && aberto > 0) asks.push('Qual taxa (% ao mês) o banco oferece para parcelar a fatura? Sem ela eu não consigo calcular a parcela com precisão.');
    if (renda == null) asks.push('Qual é a sua renda mensal? Sem ela não dá para dizer quanto cabe de parcela.');
    plans.forEach(function (p) { if (p.rate == null) asks.push('No parcelamento ' + p.label + ': quanto foi o valor parcelado e em quantas vezes no total? Com isso eu calculo o juros real que você paga.'); });

    // opções para o saldo EM ABERTO
    var options = [];
    if (aberto > 0 && rateRef != null) {
      [3, 6, 9, 12, 18, 24].forEach(function (n) {
        var p = r2(pmt(aberto, rateRef, n)), total = r2(p * n);
        options.push({ n: n, parcela: p, total: total, juros: r2(total - aberto), cabe: livre != null ? p <= livre * 0.8 : null, pctRenda: renda != null ? Math.round(p / renda * 1000) / 10 : null, pctApos: renda != null ? Math.round((plansMonthly + outras + p) / renda * 1000) / 10 : null });
      });
    }
    var primeiraQueCabe = options.filter(function (o) { return o.cabe && (o.pctApos == null || o.pctApos <= 35); })[0] || options.filter(function (o) { return o.cabe; })[0] || null;
    var rotativo = (aberto > 0 && cardRate != null) ? { jurosMes: r2(aberto * cardRate), taxaPct: r2(cardRate * 100) } : null;

    // veredito: parcelar de novo?
    var verdict, verdictKind;
    if (aberto <= 0.005) { verdictKind = 'nao'; verdict = 'Você não precisa parcelar de novo agora: não há saldo em aberto além dos parcelamentos que já está pagando. Mantenha as parcelas em dia.'; }
    else if (livre == null || rateRef == null) { verdictKind = 'dados'; verdict = 'Ainda falta informação para recomendar com segurança (' + (livre == null ? 'renda' : 'taxa de parcelamento') + '). Preencha para eu calcular a parcela e dizer se parcelar de novo cabe no seu mês.'; }
    else if (primeiraQueCabe) { verdictKind = 'cabe'; var o = primeiraQueCabe; verdict = 'Parcelar o saldo em aberto (' + brl(aberto) + ') pode fazer sentido UMA vez, desde que você pare de usar o cartão: em ' + o.n + 'x a parcela seria ' + brl(o.parcela) + ' (' + (o.pctRenda != null ? pct(o.pctRenda) + ' da renda, ' : '') + 'cabe no que sobra do mês) e o custo total de juros ' + brl(o.juros) + '. Com ela, suas parcelas passariam a ' + (o.pctApos != null ? pct(o.pctApos) + ' da renda' + (o.pctApos > 35 ? ' (acima de 35%: apertado; prefira reduzir o valor devido antes)' : ' (dentro do limite saudável de até 35%)') : 'um total maior') + '. Quanto menor o prazo que couber, menos juros você paga.'; }
    else { verdictKind = 'nao_cabe'; verdict = 'Parcelar de novo NÃO resolve: mesmo em 24x a parcela não cabe com folga no seu mês (sobram ' + brl(Math.max(0, livre)) + '). Só empurraria a dívida. O caminho é reduzir o valor devido (renegociar com desconto, quitar parte com 13º/reserva, trocar por dívida de taxa menor) e cortar gastos antes de parcelar.'; }

    // quando parar de usar o cartão
    var stop = false, stopReasons = [];
    if (aberto > 0.005 && nParcelamentos >= 1) { stop = true; stopReasons.push('há fatura em aberto e você já parcelou antes: usar o cartão agora soma compra nova a dívida antiga'); }
    if (nParcelamentos >= 2) { stop = true; stopReasons.push('são ' + nParcelamentos + ' parcelamentos de fatura ao mesmo tempo (bola de neve)'); }
    if (pctComprometido != null && pctComprometido >= 30) { stop = true; stopReasons.push('as parcelas já consomem ' + pct(pctComprometido) + ' da renda'); }
    if (rotativo && aberto > 0) { stop = true; stopReasons.push('o saldo em aberto pode cair no rotativo, a dívida mais cara que existe'); }
    var stopAdvice = stop
      ? 'Pare de usar o cartão para compras novas agora (' + stopReasons.join('; ') + '). Use débito ou Pix até quitar. Volte a usar quando: (1) não houver parcelamento de fatura ativo, (2) a fatura for paga integralmente por 3 meses seguidos e (3) o total do cartão ficar abaixo de 30% do seu limite pessoal de gasto.'
      : 'Por enquanto não há sinal de aperto. Mesmo assim: pague sempre a fatura inteira e evite parcelar a fatura.';

    // passos práticos, em ordem
    var steps = [];
    if (aberto > 0.005) {
      steps.push('Não deixe os ' + brl(aberto) + ' no rotativo' + (rotativo ? ': isso custaria cerca de ' + brl(rotativo.jurosMes) + ' de juros só no próximo mês.' : '.') + ' Rotativo é a taxa mais alta; qualquer parcelamento fixo costuma ser menor.');
      if (primeiraQueCabe) steps.push('Peça ao banco o parcelamento em ' + primeiraQueCabe.n + 'x e confira se a parcela fica perto de ' + brl(primeiraQueCabe.parcela) + ' (calculado com ' + rateSrc + '). Se vier bem maior, o banco está cobrando mais caro: negocie ou compare.');
      steps.push('Antes de parcelar, veja se dá para pagar uma parte à vista (13º, restituição, reserva): cada R$ 1 pago agora evita os juros desse R$ 1 nos próximos meses.');
    }
    if (plans.some(function (p) { return p.economiaQuitando; })) steps.push('Quitar um parcelamento antes do prazo dá desconto proporcional dos juros (direito previsto no art. 52, § 2º, do Código de Defesa do Consumidor). Pelas suas contas, quitar tudo hoje valeria cerca de ' + brl(plans.reduce(function (s, p) { return s + (p.pvRestante != null ? p.pvRestante : p.nominal); }, 0)) + ' em vez de ' + brl(plansNominal) + '. Peça ao banco o valor de quitação antecipada.');
    steps.push('Anote a data em que cada parcelamento termina: quando um acabar, a parcela livre deve ir para o próximo, não para novas compras.');
    if (livre != null && livre < 0) steps.push('Neste mês as obrigações passam da sua renda em ' + brl(-livre) + '. Antes de qualquer parcelamento, corte ou adie despesas não essenciais e converse com o banco sobre renegociar.');

    var empathy = 'Parcelar a fatura não é falha de caráter: é o que muita gente faz quando o mês aperta. O importante agora é parar a bola de neve e ter um plano com números. Dá para resolver passo a passo.';
    return { name: name, saldoInformado: saldo, inclui: inclui, inconsistente: inconsistente, aberto: aberto, totalCard: totalCard, plans: plans, plansMonthly: plansMonthly, plansNominal: plansNominal,
      livre: livre, pctComprometido: pctComprometido, rateRef: rateRef, rateRefPct: rateRef != null ? r2(rateRef * 100) : null, rateSrc: rateSrc, options: options, primeiraQueCabe: primeiraQueCabe, rotativo: rotativo,
      verdict: verdict, verdictKind: verdictKind, stop: stop, stopAdvice: stopAdvice, steps: steps, warn: warn, asks: asks, empathy: empathy };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lista de urgência. debts: [{ id, name, type, saldo, juros (% a.m. ou null), mensal, parcelas, overdue (bool), synthetic, kind }]
  // opts: { extra (R$/mês disponíveis além das parcelas, opcional), renda }
  var TYPE_RISK = { 'cheque especial': 520, 'cartão': 560, 'cartao': 560, 'cartão pj': 560 };
  function urgency(debts, opts) {
    opts = opts || {}; var extra = +opts.extra > 0 ? +opts.extra : 0, out = [];
    (debts || []).forEach(function (d) {
      if (!(d.saldo > 0)) return;
      var type = String(d.type || '').toLowerCase(), r = d.juros > 0 ? d.juros / 100 : null, mensal = +d.mensal > 0 ? +d.mensal : null, score = 0, why = [], how = [];
      var isCard = /cart[aã]o/.test(type) && !d.synthetic, isCheque = /cheque/.test(type), isPlan = !!d.synthetic || /parcelamento/.test(type), isFin = /financ/.test(type), isConsig = /consignad/.test(type + ' ' + String(d.name || '').toLowerCase());
      if (d.overdue) { score += 1000; why.push('já venceu e não foi marcada como paga: cada dia de atraso soma multa e juros'); }
      if (isCard) { score += TYPE_RISK['cartão']; why.push('cartão em aberto tem juros do rotativo, entre os mais altos do mercado'); }
      else if (isCheque) { score += TYPE_RISK['cheque especial']; why.push('cheque especial cobra juros muito altos'); }
      if (r != null) { score += Math.min(400, r * 100 * 20); if (r >= 0.05) why.push('juros de ' + pct(r * 100) + ' ao mês (' + pct((Math.pow(1 + r, 12) - 1) * 100) + ' ao ano)'); }
      else if (!isPlan) { score += 100; why.push('sem taxa de juros informada: não dá para saber o custo real'); }
      if (isPlan) { score -= 250; why.push('parcela fixa de um parcelamento já contratado: o essencial é pagar em dia'); }
      if (isFin) score -= 200;
      if (isConsig) { score -= 60; why.push('consignado: parcela descontada direto em folha (não atrasa) e juros bem menores que cartão e cheque especial'); }
      if (mensal && d.saldo <= mensal * 3) { score += 60; why.push('faltam poucas parcelas: dá para encerrar logo'); }
      // como quitar (com números)
      var n0 = r != null && mensal ? nper(d.saldo, r, mensal) : null;
      if (isCard) {
        if (r != null && mensal && mensal <= d.saldo * r + 0.01) how.push('Atenção: a parcela de ' + brl(mensal) + ' NÃO cobre os juros do mês (cerca de ' + brl(d.saldo * r) + '): a dívida está crescendo, não diminuindo.');
        how.push('Pague à vista o que puder (13º, restituição, reserva) e NÃO deixe o restante no rotativo.');
        how.push('Se não couber, parcele UMA vez no menor prazo que a parcela caiba no mês (veja o plano do cartão logo abaixo) e pare de usar o cartão.');
        if (extra > 0 && r != null) { var nE = nper(d.saldo, r, (mensal || 0) + extra); if (isFinite(nE)) how.push('Com ' + brl(extra) + ' por mês a mais nesta dívida, você a quita em cerca de ' + nE + ' mês(es).'); }
      } else if (isCheque) {
        how.push('Troque por uma dívida de taxa menor (empréstimo pessoal ou consignado, se for CLT) e zere o cheque especial: compare o custo efetivo total (CET) antes.');
        how.push('Se trocar, a nova parcela precisa caber no mês; depois peça ao banco para reduzir ou cancelar o limite, para não voltar.');
      } else if (isPlan) {
        how.push('Mantenha em dia. Só antecipe se sobrar dinheiro depois de quitar as dívidas mais caras: ao antecipar, o banco deve descontar os juros proporcionais (art. 52, § 2º, do CDC).');
      } else if (isConsig) {
        how.push('Mantenha o desconto em folha normalmente: ele não atrasa e tem juros menores que o cartão. Quite primeiro as dívidas de juros mais altos.');
        if (r != null && mensal) { if (isFinite(n0)) how.push('No ritmo atual (' + brl(mensal) + '/mês) você quita em ' + n0 + ' mês(es).'); if (extra > 0) { var nC = nper(d.saldo, r, mensal + extra); if (isFinite(nC) && isFinite(n0)) how.push('Só depois das dívidas mais caras: com ' + brl(extra) + ' a mais por mês, quitaria em ' + nC + ' mês(es) e economizaria cerca de ' + brl(interestTotal(d.saldo, r, mensal) - interestTotal(d.saldo, r, mensal + extra)) + ' de juros.'); } }
        how.push('Se a taxa estiver acima da de mercado, peça portabilidade para outro banco (sem custo para você) e compare o custo efetivo total. Atenção: se sair do emprego, o saldo pode ser cobrado das verbas rescisórias.');
      } else if (isFin) {
        how.push('Em geral é a menos urgente: juros menores e há garantia no bem. Mantenha em dia, porque atraso pode levar à perda do bem, e foque nas dívidas de juros altos primeiro.');
        if (r != null && mensal && extra > 0) { var nF = nper(d.saldo, r, mensal + extra); if (isFinite(nF) && isFinite(n0)) how.push('Quando as dívidas caras acabarem: ao antecipar parcelas, peça para amortizar as ÚLTIMAS do contrato. Com ' + brl(extra) + ' a mais por mês, quitaria em ' + nF + ' mês(es) e economizaria cerca de ' + brl(interestTotal(d.saldo, r, mensal) - interestTotal(d.saldo, r, mensal + extra)) + ' de juros.'); }
      } else {
        if (r != null && mensal) {
          if (!isFinite(n0)) how.push('A parcela de ' + brl(mensal) + ' não cobre os juros: a dívida não diminui. Renegocie ou aumente o valor pago.');
          else how.push('No ritmo atual (' + brl(mensal) + '/mês) você quita em ' + n0 + ' mês(es).');
          if (extra > 0) { var nX = nper(d.saldo, r, mensal + extra); if (isFinite(nX) && isFinite(n0)) { var eco = interestTotal(d.saldo, r, mensal) - interestTotal(d.saldo, r, mensal + extra); how.push('Colocando ' + brl(extra) + ' a mais por mês, quita em ' + nX + ' mês(es) e economiza cerca de ' + brl(eco) + ' de juros.'); } }
        } else how.push('Informe taxa e parcela para eu calcular o melhor caminho de quitação.');
        how.push('Se estiver atrasada, procure a renegociação direta com o credor antes de pagar: pedir desconto no saldo costuma funcionar.');
      }
      var level = score >= 900 ? 'urgente' : score >= 550 ? 'alta' : score >= 250 ? 'media' : 'baixa';
      out.push({ id: d.id, name: d.name, type: d.type, saldo: d.saldo, mensal: mensal, jurosPct: r != null ? r2(r * 100) : null, score: Math.round(score), level: level, why: why, how: how, mesesNoRitmo: n0 != null && isFinite(n0) ? n0 : null });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    out.forEach(function (x, i) { x.rank = i + 1; });
    return out;
  }


  // Plano de ataque mês a mês: mínimos de todas em dia + o valor extra vai para a 1ª da lista de urgência; quando uma quita, a parcela dela
  // (mais o extra) passa para a próxima. Compara com pagar só os mínimos. ordered: saída de urgency(); extra: R$/mês.
  function attackPlan(ordered, extra) {
    extra = +extra > 0 ? +extra : 0;
    var mk = function (x) { var r = x.jurosPct != null ? x.jurosPct / 100 : 0; return { id: x.id, name: x.name, b: x.saldo, r: r, min: x.mensal > 0 ? x.mensal : Math.max(1, x.saldo * (r + 0.01)), cleared: null, interest: 0 }; };
    var run = function (ex, snow) {
      var D = ordered.map(mk), m = 0, total = 0, cl = 0;
      while (m < 600 && D.some(function (d) { return d.b > 0.005; })) {
        m++; var pool = ex + (snow ? cl : 0);
        D.forEach(function (d) { if (d.b > 0.005) { var j = d.b * d.r; d.b += j; d.interest += j; total += j; } });
        D.forEach(function (d) { if (d.b > 0.005) d.b -= Math.min(d.min, d.b); });
        for (var i = 0; i < D.length && pool > 0.005; i++) { var q = D[i]; if (q.b > 0.005) { var pay = Math.min(pool, q.b); q.b -= pay; pool -= pay; } }
        D.forEach(function (d) { if (d.b <= 0.005 && !d.cleared) { d.b = 0; d.cleared = m; if (snow) cl += d.min; } });
      }
      var unfinished = D.some(function (d) { return d.b > 0.005; });
      return { D: D, months: m, unfinished: unfinished, interest: unfinished ? null : r2(total) };
    };
    var a = run(extra, true), base = run(0, false);
    return { extra: extra, steps: a.D.map(function (d) { return { id: d.id, name: d.name, clearedMonth: d.cleared, interest: d.cleared ? r2(d.interest) : null }; }), months: a.unfinished ? null : a.months, interest: a.interest, unfinished: a.unfinished,
      baseMonths: base.unfinished ? null : base.months, baseInterest: base.interest, baseUnfinished: base.unfinished,
      savedInterest: (a.interest != null && base.interest != null) ? r2(base.interest - a.interest) : null, savedMonths: (a.months != null && base.months != null && !a.unfinished && !base.unfinished) ? base.months - a.months : null };
  }

  // Expande os cartões em dívidas "sintéticas": o saldo em aberto + uma dívida por parcelamento de fatura.
  // cards: { [debtId]: { inclui, plans:[{id,parcela,restantes,valor,total}] } }
  function expandDebts(debts, cards) {
    var out = []; cards = cards || {};
    (debts || []).forEach(function (d) {
      var c = cards[d.id];
      if (!c || !c.plans || !c.plans.length) { out.push(d); return; }
      var a = analyzeCard({ name: d.name, saldo: d.saldo, juros: d.juros, inclui: c.inclui !== false, plans: c.plans });
      var copy = {}; Object.keys(d).forEach(function (k) { copy[k] = d[k]; }); copy.saldo = a.aberto; copy.cardOpen = true;
      if (a.aberto > 0.005) out.push(copy);
      a.plans.forEach(function (p) {
        out.push({ id: 'card:' + d.id + ':' + p.id, name: 'Parcelamento da fatura — ' + (d.name || 'Cartão') + ' (' + p.label + ')', type: 'Parcelamento', saldo: p.pvRestante != null ? p.pvRestante : p.nominal, juros: p.ratePct != null ? p.ratePct : 0, mensal: p.parcela, parcelas: p.restantes, profile: d.profile, synthetic: true, parentId: d.id });
      });
    });
    return out;
  }

  var API = { pmt: pmt, pvOf: pvOf, irr: irr, nper: nper, interestTotal: interestTotal, analyzeCard: analyzeCard, urgency: urgency, attackPlan: attackPlan, expandDebts: expandDebts, brl: brl };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CardPlan = API;
})(typeof window !== 'undefined' ? window : this);
