/* SM Financial — Resumo do mês (lógica pura, testada em Node). Uma única regra para "quanto sobra", usada no painel,
 * no Modo Simples, no simulador de compra, no "caminho em 3 passos" e no comparativo.
 * Regra: sobra = renda do mês − gastos lançados no mês − parcelas de dívidas que AINDA NÃO aparecem nos gastos.
 * Assim a parcela que o cliente já lançou como gasto não é descontada duas vezes, e a que ele não lançou não some. */
(function (root) {
  'use strict';
  var r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  var STOP = { parcela: 1, parcelas: 1, juros: 1, pagamento: 1, pgto: 1, mensal: 1, credito: 1, conta: 1, contas: 1, divida: 1, dividas: 1, valor: 1, minimo: 1, fatura: 0 };
  var GENERIC = { pessoal: 1, loja: 1, compra: 1, compras: 1, casa: 1, banco: 1, geral: 1, outros: 1, especial: 1 };
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function tokens(s) { return norm(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4 && !STOP[w]; }); }

  // debts: [{ id, name, mensal, folha }]; expenses: lançamentos de gasto do MESMO período [{ desc, amount }]
  function parcelasFora(debts, expenses) {
    var used = {}, itens = [], fora = 0, lancadas = 0;
    (debts || []).forEach(function (d) {
      var m = +d.mensal || 0; if (!(m > 0) || d.folha) return;
      var tk = tokens(d.name), hit = -1;
      (expenses || []).some(function (e, i) {
        if (used[i]) return false;
        var a = +e.amount || 0, et = tokens(e.desc || e.description);
        var mesmoValor = Math.abs(a - m) <= Math.max(1, m * 0.02);
        var dividaNaDesc = /parcel|emprest|financ|cart|cheque|consig|acordo|divid|juros/.test(norm(e.desc || e.description));
        var comum = tk.filter(function (w) { return et.indexOf(w) >= 0; });
        var mesmoNome = comum.some(function (w) { return !GENERIC[w]; }) || (comum.length > 0 && dividaNaDesc);
        if (mesmoNome || (mesmoValor && dividaNaDesc)) { hit = i; return true; }
        return false;
      });
      if (hit >= 0) { used[hit] = true; lancadas += m; } else fora += m;
      itens.push({ id: d.id, name: d.name, mensal: r2(m), lancada: hit >= 0 });
    });
    return { fora: r2(fora), lancadas: r2(lancadas), itens: itens };
  }

  function sobra(renda, gastos, debts, expenses) {
    var p = parcelasFora(debts, expenses), s = r2((+renda || 0) - (+gastos || 0) - p.fora);
    return { renda: r2(renda), gastos: r2(gastos), parcelasFora: p.fora, parcelasLancadas: p.lancadas, sobra: s, taxa: renda > 0 ? Math.round(s / renda * 1000) / 10 : 0, itens: p.itens };
  }

  // Variação entre meses. Percentual só faz sentido quando a base é positiva e os dois valores têm o mesmo sinal.
  function variacao(atual, anterior) {
    atual = +atual || 0; anterior = +anterior || 0;
    if (anterior === 0) return { tipo: 'sem-base' };
    if (anterior < 0 || atual < 0) return { tipo: 'absoluta', diff: r2(atual - anterior), anterior: r2(anterior) };
    var p = (atual - anterior) / anterior * 100;
    return { tipo: 'pct', pct: Math.round(p * 10) / 10, sobe: p >= 0 };
  }

  // Série real dos últimos n meses (sem números simulados). txs: [{ date 'AAAA-MM-DD', type, amount }]; ref: { year, month (0-11) }
  function serieMensal(txs, ref, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var mo = ref.month - i, y = ref.year + Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
      var key = y + '-' + ('0' + (mo + 1)).slice(-2), inc = 0, exp = 0, cnt = 0;
      (txs || []).forEach(function (t) {
        if (String(t.date || '').slice(0, 7) !== key) return; cnt++;
        if (t.type === 'income') inc += +t.amount || 0; else if (t.type === 'expense') exp += +t.amount || 0;
      });
      out.push({ key: key, year: y, month: mo, income: r2(inc), expense: r2(exp), vazio: cnt === 0 });
    }
    return out;
  }

  // Economia ao quitar hoje uma dívida parcelada. Pelo contrato: parcelas restantes × valor − saldo para quitar.
  // Sem número de parcelas, usa a taxa: total que ainda seria pago até zerar − saldo. Parcela que não cobre os juros: não quita.
  function economiaAntecipacao(d) {
    var s = +d.saldo || 0, p = +d.mensal || 0, n = +d.parcelas || 0, i = (+d.juros || 0) / 100;
    if (!(s > 0) || !(p > 0)) return { tipo: 'sem-dados' };
    var naoCobre = i > 0 && p <= s * i;
    if (n > 0) {
      var total = r2(n * p), eco = r2(Math.max(0, total - s));
      var nTaxa = (i > 0 && !naoCobre) ? -Math.log(1 - s * i / p) / Math.log(1 + i) : null;
      var confere = !naoCobre && (nTaxa == null || Math.abs(nTaxa - n) <= Math.max(1, n * 0.1));
      return { tipo: 'contrato', economia: eco, totalRestante: total, confere: confere, naoCobre: naoCobre };
    }
    if (naoCobre) return { tipo: 'nao-quita' };
    if (!(i > 0)) return { tipo: 'sem-juros', economia: 0 };
    var nper = -Math.log(1 - s * i / p) / Math.log(1 + i), meses = Math.ceil(nper);
    var restante = r2(p * nper);
    return { tipo: 'taxa', economia: r2(Math.max(0, restante - s)), totalRestante: restante, meses: meses };
  }

  function plural(n, um, varios) { return (Math.abs(n) === 1 ? um : varios); }
  function meses(n) { var v = Math.round(n * 10) / 10; return String(v).replace('.', ',') + ' ' + plural(v, 'mês', 'meses'); }

  var api = { norm: norm, tokens: tokens, parcelasFora: parcelasFora, sobra: sobra, variacao: variacao, serieMensal: serieMensal, economiaAntecipacao: economiaAntecipacao, plural: plural, meses: meses };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Resumo = api;
})(typeof window !== 'undefined' ? window : this);
