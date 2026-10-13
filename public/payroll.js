/* Payroll — renda mensal real a partir do holerite (adiantamento, complementos, reembolsos) e conciliação com o extrato.
 * Determinístico. O extrato é EVIDÊNCIA complementar: nunca vira renda salarial sem correspondência clara ou confirmação do usuário.
 */
(function (root) {
  'use strict';
  function r2(v) { return Math.round(v * 100) / 100; }
  function sum(rows, f) { return r2(rows.filter(f).reduce(function (s, r) { return s + (+r.valor || 0); }, 0)); }

  // Como o holerite apresenta o adiantamento?  'deduzido': o líquido já vem DEPOIS do adiantamento → renda do mês = líquido + adiantamento.
  // 'incluso': o líquido é o total do mês e o adiantamento é só informativo → renda do mês = líquido (não somar). 'indeterminado': pede confirmação.
  function analyzePayslip(p) {
    var t = p && p.totals || {}, rows = (p && p.rows) || [], out = { bruto: t.venc || null, descontos: t.desc || null, liquidoHolerite: t.liquido || null, adiantamento: 0, modo: 'sem_adiantamento', avisos: [] };
    if (!(t.liquido > 0)) { out.avisos.push('Líquido não encontrado no holerite.'); out.liquidoTotalMes = null; return out; }
    var adv = sum(rows, function (r) { return r.cat === 'adiantamento'; });
    out.reembolsos = sum(rows, function (r) { return r.kind === 'provento' && r.cat === 'reembolso'; });
    out.complementar = sum(rows, function (r) { return r.kind === 'provento' && r.cat === 'complementar'; });
    out.adiantamento = adv;
    if (!(adv > 0)) { out.liquidoTotalMes = r2(t.liquido); out.saldoFinalPago = r2(t.liquido); }
    else {
      var descAll = sum(rows, function (r) { return r.kind === 'desconto' && r.cat !== 'ignorar'; }), descRows = descAll;
      var consistente = t.venc > 0 && t.desc != null && Math.abs(t.venc - t.desc - t.liquido) < 0.11;
      if (consistente && Math.abs(descRows - t.desc) < 0.11) { out.modo = 'deduzido'; out.liquidoTotalMes = r2(t.liquido + adv); out.saldoFinalPago = r2(t.liquido); out.adiantamentoLiquido = adv; out.avisos.push('O líquido de R$ ' + t.liquido.toFixed(2).replace('.', ',') + ' já vem depois do adiantamento: renda do mês = adiantamento + líquido, sem contar duas vezes.'); }
      else if (consistente && Math.abs(descRows - adv - t.desc) < 0.11) { out.modo = 'incluso'; out.liquidoTotalMes = r2(t.liquido); out.saldoFinalPago = r2(t.liquido - adv); out.adiantamentoLiquido = adv; out.avisos.push('O adiantamento aparece só como informativo: o líquido já é o total do mês. Não somamos o adiantamento de novo.'); }
      else { out.modo = 'indeterminado'; out.liquidoTotalMes = r2(t.liquido); out.saldoFinalPago = null; out.adiantamentoLiquido = adv; out.precisaConfirmar = true; out.avisos.push('Não deu para saber se o líquido já considera o adiantamento. Usamos só o líquido; confirme pelo extrato.'); }
    }
    // descontos em folha que viram obrigação já paga na fonte (consignado) e os demais, para o usuário ver para onde foi o bruto
    var dc = { inss: 0, irrf: 0, consignado: 0, outros: 0, itensConsignado: [] };
    rows.forEach(function (r) { if (r.kind !== 'desconto' || r.cat === 'ignorar' || r.cat === 'adiantamento') return; var v = +r.valor || 0; if (r.cat === 'inss') dc.inss += v; else if (r.cat === 'irrf') dc.irrf += v; else if (r.cat === 'consig') { dc.consignado += v; dc.itensConsignado.push({ desc: r.desc, valor: r2(v) }); } else dc.outros += v; });
    ['inss', 'irrf', 'consignado', 'outros'].forEach(function (k) { dc[k] = r2(dc[k]); });
    out.descontosFolha = dc;
    if (dc.consignado > 0) out.avisos.push('Consignado de R$ ' + dc.consignado.toFixed(2).replace('.', ',') + ' é descontado no holerite: já está fora do líquido e não é cobrado de novo na conta.');
    out.rendaRecorrenteLiquida = r2(out.liquidoTotalMes - (out.reembolsos || 0));
    if (out.reembolsos > 0) out.avisos.push('Reembolsos (R$ ' + out.reembolsos.toFixed(2).replace('.', ',') + ') não entram na renda recorrente.');
    return out;
  }

  var SAL_RE = /(sal[aá]rio|\bsal\b|folha|pagto\s*sal|pgto\s*sal|proventos?|remunera|adiant|vale\s*salar|13[oº]|ferias|f[eé]rias)/i;
  var REEMB_RE = /(estorno|reembolso|restitui|devolu|cashback|ressarc)/i;
  var TRANSF_RE = /(pix|ted|doc|transf)/i;
  // expected: derivado de analyzePayslip + competência 'YYYY-MM'. credits: [{id,date:'YYYY-MM-DD',desc,valor>0}]. opts: {empregador, confirm:{id:'salario'|'outro'}, diaFechamento}
  function reconcile(income, comp, credits, opts) {
    opts = opts || {}; var confirm = opts.confirm || {}, tol = 0.5, used = {}, exp = [];
    if (!income || !income.liquidoTotalMes || !comp) return { ok: false, faltam: ['holerite com competência e líquido'] };
    var y = +comp.slice(0, 4), m = +comp.slice(5, 7), nm = m === 12 ? [y + 1, 1] : [y, m + 1], pad = function (n) { return ('0' + n).slice(-2); };
    if (income.adiantamento > 0 && income.modo !== 'indeterminado') {
      exp.push({ tipo: 'adiantamento', valor: income.adiantamentoLiquido, de: comp + '-05', ate: comp + '-28' });
      if (income.saldoFinalPago > 0) exp.push({ tipo: 'saldo', valor: income.saldoFinalPago, de: comp + '-25', ate: nm[0] + '-' + pad(nm[1]) + '-12' });
    } else exp.push({ tipo: 'salario', valor: income.liquidoTotalMes, de: comp + '-25', ate: nm[0] + '-' + pad(nm[1]) + '-12' });
    var cs = (credits || []).filter(function (c) { return c.valor > 0; }), matched = [], faltando = [];
    var emp = opts.empregador ? new RegExp(String(opts.empregador).replace(/[^\w ]/g, '').split(/\s+/).filter(function (w) { return w.length > 3; }).slice(0, 2).join('|') || '^$', 'i') : null;
    exp.forEach(function (e) {
      var cands = cs.filter(function (c) { return !used[c.id] && Math.abs(c.valor - e.valor) <= tol; });
      var scored = cands.map(function (c) { var inWin = c.date >= e.de && c.date <= e.ate, sal = SAL_RE.test(c.desc || '') || (emp && emp.test(c.desc || '')); return { c: c, inWin: inWin, sal: sal, conf: confirm[c.id] }; });
      var ok = scored.filter(function (s) { return s.conf === 'salario' || (s.conf !== 'outro' && s.inWin && (s.sal || !TRANSF_RE.test(s.c.desc || ''))) || (s.conf !== 'outro' && s.sal); })[0];
      if (ok) { used[ok.c.id] = 1; matched.push({ tipo: e.tipo, esperado: e.valor, credito: ok.c, certeza: ok.conf === 'salario' ? 'confirmado' : (ok.sal && ok.inWin ? 'alta' : 'media') }); return; }
      var poss = scored.filter(function (s) { return s.conf !== 'outro'; })[0];
      faltando.push({ tipo: e.tipo, esperado: e.valor, possivel: poss ? poss.c : null, motivo: poss ? 'Há um crédito com o mesmo valor, mas sem sinal claro de que é salário (confirme).' : 'Nenhum crédito com esse valor no extrato enviado.' });
    });
    // créditos sem correspondência: separa transferência pessoal, reembolso e desconhecido; duplicados exatos nunca contam duas vezes
    var rest = cs.filter(function (c) { return !used[c.id]; }), sem = [], dups = [];
    rest.forEach(function (c) {
      if (confirm[c.id] === 'outro') return;
      var twin = matched.filter(function (mm) { return Math.abs(mm.credito.valor - c.valor) <= tol && mm.credito.date === c.date; })[0];
      if (twin) { dups.push({ credito: c, motivo: 'Crédito idêntico a um já conciliado (mesma data e valor): não foi somado de novo.' }); return; }
      var kind = REEMB_RE.test(c.desc || '') ? 'reembolso' : (SAL_RE.test(c.desc || '') ? 'possivel_salario' : (TRANSF_RE.test(c.desc || '') ? 'transferencia' : 'sem_origem'));
      if (c.valor >= 100 && kind !== 'reembolso') sem.push({ credito: c, tipo: kind, precisaConfirmar: kind !== 'transferencia' || true });
    });
    var conc = r2(matched.reduce(function (s, mm) { return s + mm.credito.valor; }, 0));
    return { ok: true, esperado: exp, conciliados: matched, faltando: faltando, semOrigem: sem, duplicados: dups, camadas: { rendaContratualBruta: income.bruto || null, liquidaCalculada: income.liquidoTotalMes, identificadaNoExtrato: conc + r2(faltando.reduce(function (s, f) { return s + (f.possivel ? f.possivel.valor : 0); }, 0)), efetivamenteConciliada: conc }, completo: matched.length === exp.length, rendaMensalConciliada: conc };
  }
  // confere o consignado do holerite com as dívidas cadastradas (parcela igual, tolerância de centavos)
  function matchConsignado(analysis, debts) {
    var c = analysis && analysis.descontosFolha && analysis.descontosFolha.consignado; if (!(c > 0)) return null;
    var list = (debts || []).filter(function (d) { return d && d.mensal > 0; });
    var exact = list.filter(function (d) { return Math.abs(d.mensal - c) <= 0.5; });
    if (exact.length) return { status: 'confere', total: c, dividas: exact.map(function (d) { return d.name; }) };
    var cons = list.filter(function (d) { return /^Consignado/.test(d.type || ''); }), soma = cons.reduce(function (a, d) { return a + d.mensal; }, 0);
    if (soma > 0 && Math.abs(soma - c) <= 0.5) return { status: 'confere_soma', total: c, dividas: cons.map(function (d) { return d.name; }) };
    return { status: list.length ? 'diverge' : 'sem_divida', total: c, cadastrado: r2(soma) };
  }
  var api = { analyzePayslip: analyzePayslip, reconcile: reconcile, matchConsignado: matchConsignado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Payroll = api;
})(typeof window !== 'undefined' ? window : this);
