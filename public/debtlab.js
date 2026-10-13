/* DebtLab — matemática financeira de dívidas (100% determinística, sem IA, testável em Node e no navegador).
 * A IA interpreta documentos e explica; TODO número que aparece para o usuário nasce daqui.
 * Regras de honestidade: nada de inventar taxa, desconto ou regra do credor. Sem dado → devolve `faltam` e não calcula.
 */
(function (root) {
  'use strict';
  function r2(v) { return Math.round(v * 100) / 100; }
  function pos(v) { return typeof v === 'number' && isFinite(v) && v > 0; }

  // ───────── categorias de dívida (obrigatórias) ─────────
  var CATS_PF = ['Empréstimo pessoal', 'Consignado CLT', 'Consignado público', 'Financiamento imobiliário', 'Financiamento de veículo', 'Cartão de crédito', 'Crédito rotativo', 'Cheque especial', 'Crédito com garantia', 'Parcelamento de compras', 'Dívida renegociada', 'Outras dívidas'];
  var CATS_PJ = ['Empréstimo PJ', 'Capital de giro', 'Financiamento de veículo', 'Financiamento imobiliário', 'Cartão de crédito', 'Cheque especial', 'Crédito com garantia', 'Parcelamento de compras', 'Dívida renegociada', 'Outras dívidas'];
  function categories(profile) { return profile === 'PJ' ? CATS_PJ.slice() : CATS_PF.slice(); }
  var LEGACY = { 'Cartão': 'Cartão de crédito', 'Cartão PJ': 'Cartão de crédito', 'Parcelamento': 'Parcelamento de compras', 'Outro': 'Outras dívidas' };   // Financiamento/Empréstimo antigos são ambíguos: pedem confirmação
  function isValidCategory(c, profile) { return categories(profile).indexOf(c) >= 0 || (profile == null && (CATS_PF.indexOf(c) >= 0 || CATS_PJ.indexOf(c) >= 0)); }
  function normalizeLegacy(type) { return LEGACY[type] || (isValidCategory(type) ? type : null); }
  // Cadastro só conclui com categoria válida.
  function validateDebt(d, profile) {
    var faltam = [];
    if (!d || !String(d.name || '').trim()) faltam.push('nome');
    if (!d || !isValidCategory(d.type, profile)) faltam.push('categoria');
    return { ok: faltam.length === 0, faltam: faltam, msg: faltam.indexOf('categoria') >= 0 ? 'Escolha a categoria da dívida para concluir o cadastro.' : (faltam.length ? 'Preencha: ' + faltam.join(', ') + '.' : '') };
  }
  // Parcela descontada direto na folha/benefício (consignado): já saiu do líquido, então não pode ser subtraída de novo do caixa.
  function descontoFolha(d) { return !!d && d.folha !== false && (d.folha === true || /^Consignado/.test(normalizeLegacy(d.type) || '')); }
  function needsClassification(d) { return !d || !normalizeLegacy(d.type); }   // 'Cartão', 'Parcelamento', 'Outro' antigos têm equivalente direto; 'Empréstimo'/'Financiamento' antigos são ambíguos

  // ───────── matemática básica ─────────
  function pmtFor(pv, i, n) { if (!pos(pv) || !(n > 0)) return null; if (!(i > 0)) return r2(pv / n); return r2(pv * i / (1 - Math.pow(1 + i, -n))); }
  function nper(pv, i, pmt) { if (!pos(pv) || !pos(pmt)) return null; if (!(i > 0)) return pv / pmt; if (pmt <= pv * i + 1e-9) return Infinity; return -Math.log(1 - pv * i / pmt) / Math.log(1 + i); }
  function pvOf(pmt, i, n) { if (!pos(pmt) || !(n > 0)) return null; if (!(i > 0)) return r2(pmt * n); return r2(pmt * (1 - Math.pow(1 + i, -n)) / i); }
  function monthlyFromAnnual(aPct) { return pos(aPct) ? r2((Math.pow(1 + aPct / 100, 1 / 12) - 1) * 100) : null; }

  // Cronograma PRICE/parcela fixa. Última parcela fecha o saldo. Se a parcela não cobre os juros, para e avisa (dívida cresce).
  function schedule(saldo, jurosPct, parcela, n) {
    var i = (jurosPct || 0) / 100, bal = saldo, rows = [], jt = 0, at = 0, naoCobre = false, max = n && n > 0 ? n : 720;
    if (!pos(saldo) || !pos(parcela)) return null;
    for (var k = 1; k <= max && bal > 0.005; k++) {
      var j = r2(bal * i), a = r2(parcela - j), pay = parcela;
      if (a <= 0) { naoCobre = true; a = 0; }
      if (a >= bal - 0.005 || (n && k === n)) { a = r2(bal); pay = r2(j + a); }
      bal = r2(bal - a); rows.push({ k: k, juros: j, amort: a, parcela: pay, saldo: Math.max(0, bal) }); jt += j; at += a;
      if (naoCobre) break;
    }
    return { rows: rows, jurosTotal: r2(jt), amortTotal: r2(at), pagoTotal: r2(jt + at), naoCobre: naoCobre, meses: rows.length, restou: bal > 0.005 ? r2(bal) : 0 };
  }

  // ───────── A/B/C/D: o que cada número significa ─────────
  // in: { saldo, quitacao, refDate, jurosMes, parcelas:[{due,valor}] | {parcela, restantes, primeiraDue} }
  function monthsBetween(a, b) { return (Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000 / 30.4375; }
  function expandParcelas(inp) {
    if (Array.isArray(inp.parcelas)) return inp.parcelas.filter(function (p) { return pos(p.valor); });
    if (inp.parcelas && pos(inp.parcelas.parcela) && inp.parcelas.restantes > 0 && !inp.parcelas.primeiraDue) { var und = []; for (var q = 0; q < inp.parcelas.restantes; q++) und.push({ due: null, valor: inp.parcelas.parcela }); return und; }
    if (inp.parcelas && pos(inp.parcelas.parcela) && inp.parcelas.restantes > 0 && inp.parcelas.primeiraDue) {
      var out = [], f = inp.parcelas.primeiraDue, y = +f.slice(0, 4), m = +f.slice(5, 7) - 1, d = +f.slice(8, 10);
      for (var k = 0; k < inp.parcelas.restantes; k++) { var mm = m + k, yy = y + Math.floor(mm / 12), mo = ((mm % 12) + 12) % 12, dim = new Date(yy, mo + 1, 0).getDate(); out.push({ due: yy + '-' + ('0' + (mo + 1)).slice(-2) + '-' + ('0' + Math.min(d, dim)).slice(-2), valor: inp.parcelas.parcela }); }
      return out;
    }
    return [];
  }
  function understand(inp) {
    var faltam = [], notas = [], ps = expandParcelas(inp), nominal = ps.length ? r2(ps.reduce(function (s, p) { return s + p.valor; }, 0)) : null;
    var i = pos(inp.jurosMes) ? inp.jurosMes / 100 : null, ref = inp.refDate || null, out = { A_quitacao: pos(inp.quitacao) ? r2(inp.quitacao) : null, B_somaParcelas: nominal, saldoDevedor: pos(inp.saldo) ? r2(inp.saldo) : null, C_custoFinanceiroFuturo: null, D_economia: null, D_economiaNominal: null, faltam: faltam, notas: notas, refDate: ref };
    if (out.A_quitacao == null) faltam.push('valor de quitação antecipada informado pelo credor');
    if (nominal == null) faltam.push('parcelas restantes (valor e vencimentos)');
    if (i == null) faltam.push('taxa de juros mensal do contrato');
    if (!ref) faltam.push('data de referência do demonstrativo');
    // C: juros e encargos futuros embutidos = soma nominal − saldo devedor (só quando o saldo é o principal em aberto, como no DED)
    if (nominal != null && out.saldoDevedor != null) {
      out.C_custoFinanceiroFuturo = r2(nominal - out.saldoDevedor);
      if (out.C_custoFinanceiroFuturo < 0) { notas.push('A soma das parcelas é menor que o saldo devedor: confira o documento (parcelas incompletas ou saldo com encargos).'); out.C_custoFinanceiroFuturo = null; }
    }
    // D: só compara valores comparáveis (mesma data): parcelas trazidas a valor presente na taxa do contrato × quitação
    if (out.A_quitacao != null && nominal != null) {
      out.D_economiaNominal = r2(nominal - out.A_quitacao);
      notas.push('Diferença nominal (soma das parcelas − quitação) NÃO é economia líquida: as parcelas são pagas ao longo do tempo e o valor da quitação é de uma data só.');
      if (i != null && ref && ps.every(function (p) { return p.due; })) {
        var pv = 0; ps.forEach(function (p) { var t = Math.max(0, monthsBetween(ref, p.due)); pv += p.valor / Math.pow(1 + i, t); });
        out.parcelasValorPresente = r2(pv); out.D_economia = r2(pv - out.A_quitacao);
        notas.push('Economia comparável = parcelas restantes trazidas a valor presente na taxa do contrato (' + String(r2(inp.jurosMes)).replace('.', ',') + '% a.m.) − valor de quitação, ambos em ' + ref + '.');
      } else notas.push('Sem a taxa do contrato e a data de referência, não dá para estimar a economia comparável.');
    }
    if (out.A_quitacao != null && out.saldoDevedor != null && out.A_quitacao > out.saldoDevedor * 1.15) notas.push('O valor de quitação está bem acima do saldo devedor: pode incluir multa, encargos ou IOF. Confirme com o credor.');
    if (out.A_quitacao != null && out.saldoDevedor != null && out.A_quitacao < out.saldoDevedor * 0.9) notas.push('O valor de quitação é menor que o saldo devedor: o credor pode estar aplicando desconto de juros futuros (comum na liquidação antecipada). Confirme o valor e a validade.');
    out.explicacao = (nominal != null && out.A_quitacao != null) ? 'Se você continuar pagando conforme o cronograma atual, o total nominal previsto é de R$ ' + fmtBR(nominal) + '. O valor informado para quitar o contrato' + (ref ? ' em ' + brDate(ref) : '') + ' é de R$ ' + fmtBR(out.A_quitacao) + '. ' + (out.D_economia != null ? 'A economia estimada, comparando valores na mesma data, é de R$ ' + fmtBR(out.D_economia) + ' (diferença nominal bruta: R$ ' + fmtBR(out.D_economiaNominal) + ')' : 'A diferença nominal bruta é de R$ ' + fmtBR(out.D_economiaNominal) + ', mas faltam dados para compará-los na mesma data') + ', sujeita às condições contratuais e à confirmação do credor.' : null;
    return out;
  }
  function fmtBR(v) { return (Math.round(v * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function brDate(iso) { return /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : iso; }

  // ───────── amortização extraordinária (hipotética: o credor pode recalcular de outra forma) ─────────
  // in: { saldo, jurosMes, parcela, restantes, valor, estrategia:'prazo'|'prestacao', orcamentoLivre? }
  function simulateExtra(inp) {
    var faltam = [];
    if (!pos(inp.saldo)) faltam.push('saldo devedor'); if (!pos(inp.parcela)) faltam.push('valor da parcela'); if (!(inp.restantes > 0)) faltam.push('parcelas restantes');
    if (!(typeof inp.jurosMes === 'number' && inp.jurosMes >= 0)) faltam.push('taxa de juros mensal');
    if (!pos(inp.valor)) faltam.push('valor da amortização');
    if (faltam.length) return { ok: false, faltam: faltam };
    var base = schedule(inp.saldo, inp.jurosMes, inp.parcela, inp.restantes), i = inp.jurosMes / 100;
    var premissas = ['Taxa de ' + String(inp.jurosMes).replace('.', ',') + '% ao mês constante, parcela fixa (tabela Price) e amortização aplicada hoje, sem tarifas.', 'Simulação HIPOTÉTICA: o credor pode recalcular o contrato de outra forma. Peça a simulação oficial antes de pagar.'];
    var res = { ok: true, hipotetico: true, estrategia: inp.estrategia, valor: r2(Math.min(inp.valor, inp.saldo)), premissas: premissas, original: { parcela: inp.parcela, restantes: base.meses, totalFuturo: base.pagoTotal, jurosFuturos: base.jurosTotal } };
    if (inp.valor >= inp.saldo - 0.005) { res.quitou = true; res.saldoApos = 0; res.parcelaApos = 0; res.restantes = 0; res.totalFuturo = 0; res.jurosFuturos = 0; res.economiaJuros = base.jurosTotal; res.desembolsoHoje = r2(inp.saldo); res.totalComAmortizacao = r2(inp.saldo); res.diferencaTotalVsOriginal = r2(base.pagoTotal - inp.saldo); res.deltaPrazo = base.meses; res.deltaParcela = inp.parcela; return res; }
    var s2 = r2(inp.saldo - inp.valor), sch, parc2;
    if (inp.estrategia === 'prestacao') { parc2 = pmtFor(s2, i, inp.restantes); sch = schedule(s2, inp.jurosMes, parc2, inp.restantes); }
    else { parc2 = inp.parcela; sch = schedule(s2, inp.jurosMes, parc2, 0); if (sch.naoCobre) return { ok: false, faltam: ['parcela maior que os juros do saldo restante'] }; }
    res.saldoApos = s2; res.parcelaApos = parc2; res.restantes = sch.meses; res.totalFuturo = sch.pagoTotal; res.jurosFuturos = sch.jurosTotal;
    res.economiaJuros = r2(base.jurosTotal - sch.jurosTotal); res.totalComAmortizacao = r2(inp.valor + sch.pagoTotal); res.diferencaTotalVsOriginal = r2(base.pagoTotal - res.totalComAmortizacao);
    res.deltaPrazo = base.meses - sch.meses; res.deltaParcela = r2(inp.parcela - parc2);
    res.impactoOrcamento = inp.estrategia === 'prestacao' ? { mensal: -res.deltaParcela, texto: 'Libera ' + 'R$ ' + fmtBR(res.deltaParcela) + ' por mês no orçamento.' } : { mensal: 0, texto: 'A parcela mensal continua a mesma; o prazo encurta em ' + res.deltaPrazo + ' mês(es).' };
    res.impactoOrcamento.hoje = -res.valor;
    if (pos(inp.orcamentoLivre) && inp.valor > inp.orcamentoLivre) res.aviso = 'Esse valor é maior que o orçamento livre informado (R$ ' + fmtBR(inp.orcamentoLivre) + '): confira sua reserva antes de amortizar.';
    return res;
  }
  function sugestoesValor(saldo, orcamentoLivre) { var base = [1000, 5000, 10000].filter(function (v) { return v < saldo; }); if (pos(orcamentoLivre) && orcamentoLivre < saldo && base.indexOf(Math.round(orcamentoLivre)) < 0) base.push(Math.round(orcamentoLivre)); return base.sort(function (a, b) { return a - b; }); }

  // ───────── comparação de cenários para a mesma dívida ─────────
  function compareScenarios(inp) {
    var rows = [], base = (pos(inp.saldo) && pos(inp.parcela) && inp.restantes > 0 && typeof inp.jurosMes === 'number') ? schedule(inp.saldo, inp.jurosMes, inp.parcela, inp.restantes) : null, u = understand({ saldo: inp.saldo, quitacao: inp.quitacao, refDate: inp.refDate, jurosMes: inp.jurosMes, parcelas: { parcela: inp.parcela, restantes: inp.restantes, primeiraDue: inp.proximoVenc } });
    rows.push({ id: 'manter', nome: 'Continuar pagando normalmente', hoje: 0, parcela: inp.parcela || null, restantes: inp.restantes || null, totalFuturo: base ? base.pagoTotal : (u.B_somaParcelas), jurosFuturos: base ? base.jurosTotal : u.C_custoFinanceiroFuturo, confirmar: [], liquidez: 'Mantém seu dinheiro disponível; você segue pagando juros.' });
    if (pos(inp.quitacao)) rows.push({ id: 'quitar', nome: 'Quitar antecipadamente', hoje: r2(inp.quitacao), parcela: 0, restantes: 0, totalFuturo: 0, jurosFuturos: 0, economia: u.D_economia, economiaNominal: u.D_economiaNominal, confirmar: ['Valor e validade da quitação (confirmar com o credor)'], liquidez: 'Usa R$ ' + fmtBR(inp.quitacao) + ' de uma vez: confira reserva e contas próximas.' });
    else rows.push({ id: 'quitar', nome: 'Quitar antecipadamente', hoje: null, confirmar: ['Informe o valor de quitação do DED ou peça ao credor'], liquidez: '—' });
    (inp.valores || []).forEach(function (v) { ['prazo', 'prestacao'].forEach(function (e) { var s = simulateExtra({ saldo: inp.saldo, jurosMes: inp.jurosMes, parcela: inp.parcela, restantes: inp.restantes, valor: v, estrategia: e, orcamentoLivre: inp.orcamentoLivre }); if (s.ok) rows.push({ id: e + ':' + v, nome: 'Amortizar R$ ' + fmtBR(v) + ' — ' + (e === 'prazo' ? 'reduzir prazo' : 'reduzir parcela'), hoje: s.valor, parcela: s.parcelaApos, restantes: s.restantes, totalFuturo: s.totalFuturo, jurosFuturos: s.jurosFuturos, economiaJuros: s.economiaJuros, deltaPrazo: s.deltaPrazo, deltaParcela: s.deltaParcela, hipotetico: true, confirmar: ['Se o credor permite amortização parcial e como recalcula'], liquidez: s.aviso || s.impactoOrcamento.texto }); }); });
    if (inp.renegociacao && pos(inp.renegociacao.parcela) && inp.renegociacao.restantes > 0) { var rn = inp.renegociacao, tot = r2(rn.parcela * rn.restantes + (rn.entrada || 0)); rows.push({ id: 'renegociar', nome: 'Renegociação (proposta informada por você)', hoje: rn.entrada || 0, parcela: rn.parcela, restantes: rn.restantes, totalFuturo: tot, jurosFuturos: null, diferencaTotal: base ? r2(base.pagoTotal - tot) : null, confirmar: ['Proposta formal do credor por escrito'], liquidez: 'Compare o total com o cenário atual antes de aceitar.' }); }
    return { rows: rows, entendimento: u };
  }

  // ───────── histórico mensal do DED ─────────
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
  function staleness(lastRef, today) { if (!lastRef) return { status: 'sem_ded', dias: null, msg: 'Sem demonstrativo (DED) enviado ainda.' }; var d = daysBetween(lastRef, today); return d <= 35 ? { status: 'atualizado', dias: d, msg: 'DED de ' + brDate(lastRef) + ' (atualizado).' } : { status: 'desatualizado', dias: d, msg: 'Último DED em ' + brDate(lastRef) + ' (há ' + d + ' dias). Envie o do mês para acompanhar a evolução.' }; }
  // compara DED anterior × novo: o saldo informado × o saldo que a projeção previa
  function compareDed(prev, next, jurosMes, parcela) {
    if (!prev || !next || !pos(prev.saldo) || !pos(next.saldo) || !prev.refDate || !next.refDate) return { ok: false, faltam: ['saldo e data dos dois demonstrativos'] };
    var meses = Math.round(monthsBetween(prev.refDate, next.refDate)), out = { ok: true, meses: meses, saldoAnterior: prev.saldo, saldoAtual: next.saldo, variacao: r2(next.saldo - prev.saldo) };
    if (meses <= 0) return { ok: false, faltam: ['o novo DED precisa ser posterior ao anterior'] };
    if (typeof jurosMes === 'number' && pos(parcela)) {
      var sch = schedule(prev.saldo, jurosMes, parcela, 0), k = Math.min(meses, sch ? sch.rows.length : 0), esperado = sch ? (k >= sch.rows.length ? 0 : sch.rows[k - 1].saldo) : null;
      out.saldoEsperado = esperado; out.diferenca = esperado != null ? r2(next.saldo - esperado) : null;
      var tol = Math.max(2, prev.saldo * 0.005);
      if (out.diferenca != null && out.diferenca < -tol) { out.amortizacaoExtraEstimada = r2(-out.diferenca); out.leitura = 'O saldo está R$ ' + fmtBR(-out.diferenca) + ' abaixo do projetado: indica amortização extraordinária (ou desconto) não explicada pelas parcelas normais.'; }
      else if (out.diferenca != null && out.diferenca > tol) out.leitura = 'O saldo está R$ ' + fmtBR(out.diferenca) + ' acima do projetado: pode haver parcela em atraso, encargos ou taxa diferente da informada.';
      else out.leitura = 'O saldo informado confere com a projeção (diferença dentro da tolerância).';
    }
    return out;
  }
  // um DED novo é do mesmo contrato de uma dívida já cadastrada?
  function matchContract(cand, list) {
    var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); };
    var byHash = cand.contratoHash ? (list || []).filter(function (x) { return x.contratoHash && x.contratoHash === cand.contratoHash; })[0] : null;
    if (byHash) return { action: 'same', id: byHash.id, motivo: 'mesmo número de contrato' };
    var sim = (list || []).filter(function (x) { return x.credor && cand.credor && (norm(x.credor).indexOf(norm(cand.credor)) >= 0 || norm(cand.credor).indexOf(norm(x.credor)) >= 0) && (!cand.tipo || !x.tipo || x.tipo === cand.tipo) && pos(x.parcela) && pos(cand.parcela) && Math.abs(x.parcela - cand.parcela) / x.parcela <= 0.02 && !(x.contratoHash && cand.contratoHash && x.contratoHash !== cand.contratoHash); });
    if (sim.length === 1) return { action: 'ask', id: sim[0].id, motivo: 'mesmo credor e parcela parecida' };
    if (sim.length > 1) return { action: 'ask', id: null, candidatos: sim.map(function (x) { return x.id; }), motivo: 'mais de uma dívida parecida' };
    return { action: 'new', id: null };
  }

  var api = { CATS_PF: CATS_PF, CATS_PJ: CATS_PJ, categories: categories, isValidCategory: isValidCategory, normalizeLegacy: normalizeLegacy, validateDebt: validateDebt, needsClassification: needsClassification, descontoFolha: descontoFolha, pmtFor: pmtFor, nper: nper, pvOf: pvOf, monthlyFromAnnual: monthlyFromAnnual, schedule: schedule, understand: understand, simulateExtra: simulateExtra, sugestoesValor: sugestoesValor, compareScenarios: compareScenarios, staleness: staleness, compareDed: compareDed, matchContract: matchContract, fmtBR: fmtBR, brDate: brDate, r2: r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DebtLab = api;
})(typeof window !== 'undefined' ? window : this);
