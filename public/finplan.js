/* SM Financial — motor de planejamento financeiro (puro: roda no navegador e no Node, sem rede e sem dependências).
 * Princípio: a "IA" interpreta e explica; os VALORES vêm daqui, de funções determinísticas e testáveis.
 * Dinheiro: centavos inteiros internamente (arredondamento half-up, uma única vez por operação). Datas: 'AAAA-MM-DD' (data local do usuário,
 * passada como parâmetro `today`; nada aqui lê o relógio). Nada é inventado: dado ausente vira pergunta ou "estimativa", nunca número fictício.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.FinPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────── dinheiro ─────────
  var cents = function (v) { return Math.round((Number(v) || 0) * 100 + (v < 0 ? -1e-9 : 1e-9)); };
  var money = function (c) { return Math.round(c) / 100; };
  var r2 = function (v) { return money(cents(v)); };
  var HIGH_INTEREST = 3; // % ao mês: limite DESTE app para sinalizar "juros altos" (não é definição oficial)

  // ───────── datas (sem fuso: tudo em data civil) ─────────
  function parse(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return null; return { y: +m[1], m: +m[2], d: +m[3] }; }
  function valid(iso) { var p = parse(iso); if (!p) return false; var t = new Date(Date.UTC(p.y, p.m - 1, p.d)); return t.getUTCFullYear() === p.y && t.getUTCMonth() === p.m - 1 && t.getUTCDate() === p.d; }
  function toIso(y, m, d) { return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }
  function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }               // dias do mês (m = 1..12)
  function addDays(iso, n) { var p = parse(iso), t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return toIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
  function addMonths(iso, n, anchorDay) {                                                // preserva o dia de ancoragem; mês curto → último dia
    var p = parse(iso), day = anchorDay || p.d, idx = p.y * 12 + (p.m - 1) + n, y = Math.floor(idx / 12), m = idx % 12 + 1;
    return toIso(y, m, Math.min(day, dim(y, m)));
  }
  function diffDays(a, b) { var x = parse(a), y = parse(b); return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 86400000); } // b - a
  function ym(iso) { return String(iso).slice(0, 7); }
  function monthEnd(iso) { var p = parse(iso); return toIso(p.y, p.m, dim(p.y, p.m)); }
  function monthStart(iso) { return String(iso).slice(0, 8) + '01'; }

  // ───────── eventos (compromissos) ─────────
  var NEAR_DAYS = 3;                                                                      // "próximo do vencimento" = até 3 dias
  function statusView(e, today) {                                                         // estado exibido; "vencido" nunca vira "pago" sozinho
    if (e.status === 'paid') return 'pago';
    if (e.status === 'cancelled') return 'cancelado';
    if (e.status === 'awaiting') return 'aguardando';
    var d = diffDays(today, e.dueDate);
    if (d < 0) return 'vencido';
    if (d <= NEAR_DAYS) return 'proximo';
    return 'a_pagar';
  }
  function pushHistory(e, action, info, at) {
    var h = (e.history || []).slice(-49); h.push({ at: at || null, action: action, info: info || null });
    return h;
  }
  function validateEvent(e) {
    var errs = [];
    if (!e || !String(e.title || '').trim()) errs.push('Informe o título.');
    if (!valid(e && e.dueDate)) errs.push('Data inválida.');
    if (!(Number(e && e.amount) > 0)) errs.push('Informe um valor maior que zero.');
    if (e && e.kind !== 'payable' && e.kind !== 'income') errs.push('Tipo inválido.');
    return errs;
  }
  function newEvent(o, nowIso) {                                                          // cria evento normalizado (idempotência: `key` única por usuário)
    return {
      id: o.id, key: o.key, planId: o.planId || null, kind: o.kind, title: String(o.title || '').trim().slice(0, 120), category: o.category || null,
      amount: r2(o.amount), dueDate: o.dueDate, status: o.status || 'pending', paidAt: o.paidAt || null, paidAmount: o.paidAmount == null ? null : r2(o.paidAmount),
      priority: o.priority || 'normal', origin: o.origin || 'manual', sourceRef: o.sourceRef || null, remindDays: o.remindDays || [1], notes: o.notes ? String(o.notes).slice(0, 300) : null,
      movable: !!o.movable, txId: o.txId || null, version: 1, userEdited: !!o.userEdited, history: [{ at: nowIso || null, action: 'criado', info: o.origin || 'manual' }]
    };
  }
  // "Repetir todo mês" (entrada manual): N eventos com chaves determinísticas ⇒ reenviar o formulário não duplica.
  function expandRecurring(base, count, groupId) {
    var out = [], anchor = parse(base.dueDate).d;
    for (var k = 0; k < Math.max(1, Math.min(60, count | 0)); k++) {
      var o = {}; Object.keys(base).forEach(function (x) { o[x] = base[x]; });
      o.dueDate = addMonths(base.dueDate, k, anchor); o.key = 'man:' + groupId + ':' + k; out.push(o);
    }
    return out;
  }

  // ───────── dívidas: amortização e simulação mês a mês ─────────
  // Dívida: { id, name, saldo, juros (% a.m., pode faltar), mensal (parcela mínima), parcelas (restantes, opcional) }
  function debtMissing(d) {
    var miss = [];
    if (!(d.saldo > 0)) miss.push('saldo'); if (!(d.mensal > 0)) miss.push('parcela mensal'); if (d.juros == null || isNaN(d.juros) || d.juros <= 0) miss.push('juros');
    return miss;
  }
  function pmt(pv, rate, n) { if (n <= 0) return 0; if (!rate) return pv / n; var f = Math.pow(1 + rate, n); return pv * rate * f / (f - 1); }
  // Simula pagamentos mensais. order: ids na ordem de prioridade do EXTRA. extra: reais por mês (além das parcelas mínimas). payDay por dívida.
  function simulate(debts, opts) {
    opts = opts || {}; var extra = cents(opts.extra || 0), start = opts.start, maxM = opts.maxMonths || 120, order = opts.order || debts.map(function (d) { return d.id; });
    var st = debts.map(function (d) { return { id: d.id, name: d.name, bal: cents(d.saldo), rate: (d.juros > 0 ? d.juros : 0) / 100, min: cents(d.mensal), unknown: !(d.juros > 0), day: (opts.payDay && opts.payDay[d.id]) || d.payDay || parse(start).d, n: 0, interest: 0, paid: 0 }; });
    var rows = [], totalInterest = 0, totalPaid = 0, endDate = null, month = 0;
    while (month < maxM && st.some(function (s) { return s.bal > 0; })) {
      month++;
      var ex = extra;
      st.forEach(function (s) {                                                            // juros do período e parcela mínima
        if (s.bal <= 0) return;
        var it = Math.round(s.bal * s.rate); s.bal += it; s.interest += it; totalInterest += it;
        var pay = Math.min(s.min, s.bal); s.bal -= pay; s.paid += pay; totalPaid += pay; s.n++;
        s.last = { it: it, pay: pay };
        rows.push({ debtId: s.id, name: s.name, n: s.n, month: month, date: addMonths(start, month - 1, s.day), amount: money(pay), interest: money(it), principal: money(pay - it), extra: false, balanceAfter: money(s.bal), _r: rows.length });
      });
      order.forEach(function (id) {                                                        // extra vai para a dívida prioritária que ainda deve
        var s = st.filter(function (x) { return x.id === id; })[0]; if (!s || s.bal <= 0 || ex <= 0) return;
        var pay = Math.min(ex, s.bal); s.bal -= pay; s.paid += pay; totalPaid += pay; ex -= pay;
        var row = null; for (var i = rows.length - 1; i >= 0; i--) if (rows[i].debtId === id && rows[i].month === month) { row = rows[i]; break; }
        if (row) { row.amount = money(cents(row.amount) + pay); row.principal = money(cents(row.principal) + pay); row.extra = true; row.balanceAfter = money(s.bal); }
        else rows.push({ debtId: id, name: s.name, n: s.n + 1, month: month, date: addMonths(start, month - 1, s.day), amount: money(pay), interest: 0, principal: money(pay), extra: true, balanceAfter: money(s.bal), _r: rows.length });
      });
      st.forEach(function (s) { if (s.bal <= 0 && !s.doneMonth) { s.doneMonth = month; } });
    }
    var unfinished = st.some(function (s) { return s.bal > 0; });
    rows.forEach(function (r) { delete r._r; });
    if (rows.length) endDate = rows.reduce(function (m, r) { return r.date > m ? r.date : m; }, rows[0].date);
    return { rows: rows, months: month, endDate: endDate, totalPaid: money(totalPaid), totalInterest: money(totalInterest), unfinished: unfinished, anyUnknownInterest: st.some(function (s) { return s.unknown; }), perDebt: st.map(function (s) { return { id: s.id, name: s.name, months: s.doneMonth || null, paid: money(s.paid), interest: money(s.interest), unknownInterest: s.unknown }; }) };
  }

  // ───────── contexto consolidado (única fonte para IA e calendário) ─────────
  var ESSENTIAL_CATS = ['Moradia', 'Alimentação', 'Saúde', 'Transporte', 'Educação', 'Aluguel/Sede', 'Folha de pagamento', 'Impostos'];
  function buildContext(inp) {
    var today = inp.today, events = (inp.events || []).filter(function (e) { return e && valid(e.dueDate); });
    var debts = (inp.debts || []).map(function (d) { return { id: d.id, name: d.name, saldo: Number(d.saldo) || 0, juros: d.juros == null ? null : Number(d.juros), mensal: Number(d.mensal) || 0, parcelas: d.parcelas || 0 }; });
    var horizonEnd = addDays(today, inp.horizonDays || 90), mStart = monthStart(today), mEnd = monthEnd(today);
    var pend = function (e) { return e.status === 'pending' || e.status === 'awaiting'; };
    var incomeEv = events.filter(function (e) { return e.kind === 'income' && e.status !== 'cancelled'; });
    var payEv = events.filter(function (e) { return e.kind === 'payable' && e.status !== 'cancelled'; });
    // renda considerada no mês: eventos de renda do mês (previstos/confirmados); se não houver, média de lançamentos recentes; se não, a renda do cadastro. Sempre rotulada.
    var incMonth = incomeEv.filter(function (e) { return e.dueDate >= mStart && e.dueDate <= mEnd; });
    var income = { amount: 0, source: 'nenhuma', confirmed: 0, expected: 0 };
    incMonth.forEach(function (e) { if (e.status === 'paid') income.confirmed += cents(e.paidAmount != null ? e.paidAmount : e.amount); else income.expected += cents(e.amount); });
    if (incMonth.length) { income.amount = money(income.confirmed + income.expected); income.source = 'calendário'; }
    else if (inp.avgIncome > 0) { income.amount = r2(inp.avgIncome); income.source = 'média dos lançamentos'; }
    else if (inp.monthlyIncome > 0) { income.amount = r2(inp.monthlyIncome); income.source = 'renda informada no cadastro'; }
    income.confirmed = money(income.confirmed); income.expected = money(income.expected);
    var nextIncome = incomeEv.filter(function (e) { return pend(e) && e.dueDate >= today; }).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; })[0] || null;
    var pending = payEv.filter(function (e) { return pend(e); });
    var overdue = pending.filter(function (e) { return e.dueDate < today; });
    var upcoming = pending.filter(function (e) { return e.dueDate >= today && e.dueDate <= horizonEnd; }).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : (a.dueDate > b.dueDate ? 1 : b.amount - a.amount); });
    // dívidas sem nenhum compromisso pendente no calendário: parcela estimada, sem data (não entra na linha do tempo)
    var covered = {}; pending.forEach(function (e) { if (e.sourceRef) covered[e.sourceRef] = true; });
    var undated = debts.filter(function (d) { return d.saldo > 0 && d.mensal > 0 && !covered[d.id]; });
    return { today: today, events: events, debts: debts, income: income, nextIncome: nextIncome, incomeEvents: incomeEv, pending: pending, overdue: overdue, upcoming: upcoming, undatedDebts: undated, openingBalance: inp.openingBalance == null ? null : Number(inp.openingBalance), reserveMonthly: inp.reserveMonthly == null ? null : Number(inp.reserveMonthly), horizonEnd: horizonEnd, avgEssential: Number(inp.avgEssential) || 0 };
  }

  // linha do tempo diária com saldo corrido. Sem saldo inicial informado, o saldo é RELATIVO (começa em 0): não é saldo bancário.
  function timeline(ctx, from, to) {
    var start = ctx.openingBalance == null ? 0 : cents(ctx.openingBalance), bal = start, days = {}, out = [];
    ctx.events.filter(function (e) { return e.status !== 'cancelled' && e.dueDate >= from && e.dueDate <= to; }).forEach(function (e) {
      if (e.status === 'paid') return;                                                       // já pago: já saiu do saldo informado
      (days[e.dueDate] = days[e.dueDate] || []).push(e);
    });
    Object.keys(days).sort().forEach(function (d) {
      var inc = 0, out_ = 0; days[d].forEach(function (e) { if (e.kind === 'income') inc += cents(e.amount); else out_ += cents(e.amount); });
      var before = bal; bal += inc - out_;
      out.push({ date: d, income: money(inc), outgo: money(out_), before: money(before), after: money(bal), events: days[d] });
    });
    return { relative: ctx.openingBalance == null, start: money(start), end: money(bal), days: out, min: out.length ? Math.min.apply(null, out.map(function (x) { return x.after; })) : money(start) };
  }

  // ───────── análise ─────────
  function analyze(ctx) {
    var out = { questions: [], risks: [], notes: [] }, income = ctx.income.amount;
    var pendMonth = ctx.pending.filter(function (e) { return ym(e.dueDate) === ym(ctx.today); });
    var committedC = 0; pendMonth.forEach(function (e) { committedC += cents(e.amount); });
    var paidMonth = ctx.events.filter(function (e) { return e.kind === 'payable' && e.status === 'paid' && e.paidAt && ym(e.paidAt) === ym(ctx.today); }).reduce(function (s, e) { return s + cents(e.paidAmount != null ? e.paidAmount : e.amount); }, 0);
    var undatedC = ctx.undatedDebts.reduce(function (s, d) { return s + cents(d.mensal); }, 0);
    out.pendingMonth = money(committedC); out.paidMonth = money(paidMonth); out.undatedMonthly = money(undatedC);
    out.committedAmount = money(committedC + paidMonth + undatedC);
    out.committedPct = income > 0 ? Math.round(out.committedAmount / income * 1000) / 10 : null;
    out.income = ctx.income; out.overdue = ctx.overdue; out.undatedDebts = ctx.undatedDebts;
    out.projectedLeft = income > 0 ? money(cents(income) - cents(out.committedAmount)) : null;       // renda prevista − obrigações: PROJEÇÃO, não saldo bancário
    // contas antes do próximo recebimento
    out.beforeNextIncome = ctx.nextIncome ? ctx.upcoming.filter(function (e) { return e.dueDate < ctx.nextIncome.dueDate; }) : [];
    out.beforeNextIncomeTotal = money(out.beforeNextIncome.reduce(function (s, e) { return s + cents(e.amount); }, 0));
    // aglomerações: 3 ou mais vencimentos numa janela de 3 dias
    var up = ctx.upcoming, clusters = [];
    for (var i = 0; i < up.length; i++) { var win = up.filter(function (e) { var d = diffDays(up[i].dueDate, e.dueDate); return d >= 0 && d <= 3; }); if (win.length >= 3 && (!clusters.length || clusters[clusters.length - 1].end < up[i].dueDate)) clusters.push({ start: up[i].dueDate, end: win[win.length - 1].dueDate, events: win, total: money(win.reduce(function (s, e) { return s + cents(e.amount); }, 0)) }); }
    out.clusters = clusters;
    // déficit: saldo corrido negativo (relativo ou real)
    var tl = timeline(ctx, ctx.today, ctx.horizonEnd); out.timeline = tl;
    out.deficits = tl.days.filter(function (d) { return d.after < 0; }).map(function (d) { return { date: d.date, balance: d.after }; });
    out.highInterest = ctx.debts.filter(function (d) { return d.juros != null && d.juros >= HIGH_INTEREST && d.saldo > 0; }).sort(function (a, b) { return b.juros - a.juros; });
    // riscos e perguntas (nunca inventar)
    if (ctx.overdue.length) out.risks.push({ level: 'alto', text: ctx.overdue.length + ' compromisso(s) vencido(s) e ainda não marcado(s) como pago(s).' });
    if (out.committedPct != null && out.committedPct >= 70) out.risks.push({ level: out.committedPct >= 90 ? 'alto' : 'medio', text: 'Cerca de ' + out.committedPct + '% da renda considerada já está comprometida.' });
    if (out.deficits.length) out.risks.push({ level: 'alto', text: 'O saldo projetado fica negativo em ' + out.deficits[0].date.split('-').reverse().join('/') + (tl.relative ? ' (saldo relativo, calculado só com receitas e contas do calendário).' : '.') });
    if (clusters.length) out.risks.push({ level: 'medio', text: 'Vários vencimentos juntos (' + clusters[0].events.length + ' contas em até 3 dias, total ' + clusters[0].total.toFixed(2).replace('.', ',') + ').' });
    if (out.highInterest.length) out.risks.push({ level: 'medio', text: 'Dívida com juros altos (a partir de ' + HIGH_INTEREST + '% ao mês): ' + out.highInterest.map(function (d) { return d.name; }).join(', ') + '.' });
    if (!(income > 0)) out.questions.push({ id: 'renda', text: 'Qual é a sua renda prevista e em que dia ela cai? Cadastre a data de recebimento no calendário.' });
    else if (ctx.income.source !== 'calendário') out.questions.push({ id: 'data_renda', text: 'Em que data você recebe sua renda? Sem essa data eu só consigo analisar o mês inteiro, não o dia a dia.' });
    ctx.undatedDebts.forEach(function (d) { out.questions.push({ id: 'venc_' + d.id, debtId: d.id, text: 'Qual é o dia de vencimento da parcela de "' + d.name + '"? Sem a data ela não entra na linha do tempo.' }); });
    ctx.debts.forEach(function (d) { if (d.saldo > 0 && (d.juros == null || d.juros <= 0)) out.questions.push({ id: 'juros_' + d.id, debtId: d.id, text: 'Qual é a taxa de juros de "' + d.name + '" (% ao mês)? Sem ela não calculo o custo total.' }); });
    if (ctx.openingBalance == null) out.notes.push('Sem saldo inicial informado: o saldo da linha do tempo é relativo (receitas e contas do calendário), não o saldo do seu banco.');
    return out;
  }

  // ───────── planos (opções) ─────────
  function essentialsMonthly(ctx) {                                                       // essenciais do mês: eventos essenciais pendentes; se não houver, a média informada
    var ev = ctx.pending.filter(function (e) { return e.priority === 'essential' && ym(e.dueDate) === ym(ctx.today); }).reduce(function (s, e) { return s + cents(e.amount); }, 0);
    return Math.max(money(ev), ctx.avgEssential || 0);
  }
  function surplusMonthly(ctx, opts) {                                                    // folga mensal = renda − essenciais − parcelas mínimas − reserva
    var income = ctx.income.amount; if (!(income > 0)) return null;
    var mins = ctx.debts.reduce(function (s, d) { return s + cents(d.mensal); }, 0), reserve = cents((opts && opts.reserve != null ? opts.reserve : ctx.reserveMonthly) || 0);
    var other = ctx.pending.filter(function (e) { return ym(e.dueDate) === ym(ctx.today) && !e.sourceRef; }).reduce(function (s, e) { return s + cents(e.amount); }, 0);
    return money(cents(income) - cents(essentialsMonthly(ctx)) * 1 - mins - reserve - Math.max(0, other - cents(essentialsMonthly(ctx))));
  }
  function planBase(id, title, strategy) { return { id: id, strategy: strategy, title: title, description: '', payments: [], metrics: {}, pros: [], cons: [], assumptions: [], missing: [], feasible: true, blockers: [] }; }
  function generatePlans(ctx, opts) {
    opts = opts || {}; var plans = [], debts = ctx.debts.filter(function (d) { return d.saldo > 0; }), income = ctx.income.amount, today = ctx.today;
    var start = opts.start || addDays(today, 1), payDay = opts.payDay || {};
    var baseline = null;
    function sim(extra, order) { return simulate(debts, { extra: extra, order: order, start: start, payDay: payDay }); }
    var withMin = debts.filter(function (d) { return d.mensal > 0; });
    var cannot = debts.length === 0 ? 'Não há dívidas com saldo cadastradas.' : (withMin.length < debts.length ? 'Alguma dívida está sem parcela mensal informada.' : null);
    var surplus = surplusMonthly(ctx, opts);
    var baseMissing = [];
    if (!(income > 0)) baseMissing.push('renda mensal prevista');
    debts.forEach(function (d) { if (!(d.juros > 0)) baseMissing.push('juros de "' + d.name + '"'); if (!(d.mensal > 0)) baseMissing.push('parcela de "' + d.name + '"'); });
    if (!cannot) baseline = sim(0, null);
    var avalOrder = debts.slice().sort(function (a, b) { return (b.juros || 0) - (a.juros || 0) || a.saldo - b.saldo; }).map(function (d) { return d.id; });
    function fill(p, s, extra) {
      p.payments = s.rows.map(function (r) { return { debtId: r.debtId, name: r.name, n: r.n, date: r.date, amount: r.amount, interest: r.interest, principal: r.principal, extra: r.extra }; });
      p.metrics = { totalPaid: s.totalPaid, totalInterest: s.anyUnknownInterest ? null : s.totalInterest, months: s.months, endDate: s.endDate, monthlyCommitment: money(withMin.reduce(function (a, d) { return a + cents(d.mensal); }, 0) + cents(extra || 0)), extraMonthly: extra || 0, unfinished: s.unfinished, interestKnown: !s.anyUnknownInterest,
        savedInterest: (baseline && !baseline.anyUnknownInterest && !s.anyUnknownInterest) ? money(cents(baseline.totalInterest) - cents(s.totalInterest)) : null, monthsSaved: baseline ? baseline.months - s.months : null };
    }
    // A — priorizar redução de juros (avalanche)
    var A = planBase('A', 'Priorizar a redução dos juros', 'juros'); A.description = 'Paga as parcelas mínimas de todas as dívidas e direciona a folga mensal para a dívida de maior taxa, depois para a próxima.';
    if (cannot) { A.feasible = false; A.blockers.push(cannot); }
    else if (surplus == null) { A.feasible = false; A.blockers.push('Preciso da sua renda prevista para calcular a folga mensal.'); }
    else {
      var extra = Math.max(0, surplus), s1 = sim(extra, avalOrder); fill(A, s1, extra);
      A.assumptions.push('Folga mensal = renda (' + ctx.income.source + ') − essenciais − parcelas mínimas − reserva = ' + surplus.toFixed(2).replace('.', ',') + '.');
      A.assumptions.push('Ordem do pagamento extra: maior taxa primeiro (' + avalOrder.map(function (id) { return (debts.filter(function (d) { return d.id === id; })[0] || {}).name; }).join(' → ') + ').');
      if (extra <= 0) { A.cons.push('Sem folga no mês: só as parcelas mínimas cabem. O plano não acelera a quitação.'); A.risks = ['Orçamento já comprometido.']; }
      else A.pros.push('Reduz o total de juros pagos e o prazo para quitar.');
      if (s1.anyUnknownInterest) A.missing.push('taxa de juros de alguma dívida (custo total não calculável)');
      A.cons.push('Exige disciplina para manter o valor extra todo mês.');
    }
    plans.push(A);
    // B — distribuir melhor os pagamentos (datas × recebimento). Só propõe mudar data de quem está marcado como alterável.
    var B = planBase('B', 'Distribuir melhor os pagamentos', 'distribuir'); B.description = 'Reorganiza a ordem e, quando o vencimento puder ser alterado, as datas, para que os pagamentos caiam depois do recebimento.';
    var ups = ctx.upcoming;
    if (!ups.length) { B.feasible = false; B.blockers.push('Não há compromissos futuros no calendário para reorganizar.'); }
    else if (!ctx.nextIncome) { B.feasible = false; B.blockers.push('Cadastre a data em que você recebe para eu distribuir os pagamentos.'); }
    else {
      var movable = ups.filter(function (e) { return e.movable; }), moves = [], inc = ctx.nextIncome.dueDate;
      movable.forEach(function (e) { if (e.dueDate < inc) moves.push({ eventId: e.id, key: e.key, title: e.title, from: e.dueDate, to: addDays(inc, 1), amount: e.amount }); });
      B.payments = moves.map(function (m) { return { eventId: m.eventId, name: m.title, date: m.to, amount: m.amount, from: m.from, move: true }; });
      var before = analyze(ctx), ctx2 = JSON.parse(JSON.stringify(ctx)); ctx2.events.forEach(function (e) { var m = moves.filter(function (x) { return x.eventId === e.id; })[0]; if (m) e.dueDate = m.to; });
      ctx2.upcoming = ctx2.upcoming.map(function (e) { var m = moves.filter(function (x) { return x.eventId === e.id; })[0]; if (m) e.dueDate = m.to; return e; });
      var after = analyze(Object.assign(ctx2, { pending: ctx2.pending.map(function (e) { var m = moves.filter(function (x) { return x.eventId === e.id; })[0]; if (m) e.dueDate = m.to; return e; }) }));
      B.metrics = { moved: moves.length, beforeNextIncomeBefore: before.beforeNextIncomeTotal, beforeNextIncomeAfter: after.beforeNextIncomeTotal, deficitsBefore: before.deficits.length, deficitsAfter: after.deficits.length, order: ups.slice(0, 10).map(function (e) { return { id: e.id, title: e.title, dueDate: e.dueDate, amount: e.amount }; }), totalInterest: null, monthsSaved: null };
      if (!movable.length) { B.cons.push('Nenhum vencimento está marcado como alterável. Mostro só a ordem sugerida de pagamento.'); B.missing.push('quais vencimentos podem ser alterados junto ao credor'); }
      else { B.pros.push('Concentra os pagamentos depois da data de recebimento.'); B.cons.push('Depende de o credor aceitar a nova data; mudar a data não altera valores neste cálculo.'); }
      B.assumptions.push('Só datas marcadas como alteráveis foram movidas. Não assumo que o credor aceite.');
    }
    plans.push(B);
    // C — reduzir o comprometimento mensal (somente com proposta informada pelo usuário)
    var C = planBase('C', 'Reduzir o comprometimento mensal', 'reduzir'); C.description = 'Compara a dívida atual com uma proposta de parcelamento/renegociação que você informou.';
    var offers = opts.offers || {}, offerIds = Object.keys(offers).filter(function (id) { var o = offers[id]; return o && o.parcelas > 0 && (o.parcela > 0 || o.juros >= 0); });
    if (!offerIds.length) { C.feasible = false; C.blockers.push('Para comparar, informe a proposta de parcelamento ou renegociação recebida (nº de parcelas e juros ou valor da parcela). Eu não presumo que ela exista.'); C.missing.push('proposta de renegociação'); }
    else {
      var rows = [], newMonthly = 0, oldMonthly = 0, oldTotal = 0, newTotal = 0, unknownOld = false;
      offerIds.forEach(function (id) {
        var d = debts.filter(function (x) { return x.id === id; })[0]; if (!d) return; var o = offers[id];
        var np = o.parcela > 0 ? o.parcela : r2(pmt(d.saldo, (o.juros || 0) / 100, o.parcelas));
        var cur = simulate([d], { extra: 0, start: start, payDay: payDay });
        if (!(d.juros > 0)) unknownOld = true;
        var nTotal = r2(np * o.parcelas + (o.custo || 0));
        for (var k = 1; k <= o.parcelas; k++) rows.push({ debtId: id, name: d.name, n: k, date: addMonths(start, k - 1, payDay[id] || parse(start).d), amount: np, interest: null, principal: null, extra: false, offer: true });
        newMonthly += cents(np); oldMonthly += cents(d.mensal); newTotal += cents(nTotal); oldTotal += cents(cur.totalPaid);
      });
      C.payments = rows; var worse = newTotal > oldTotal;
      C.metrics = { monthlyCommitment: money(newMonthly), monthlyBefore: money(oldMonthly), monthlyDelta: money(newMonthly - oldMonthly), totalPaid: money(newTotal), totalBefore: money(oldTotal), totalDelta: money(newTotal - oldTotal), months: Math.max.apply(null, offerIds.map(function (id) { return offers[id].parcelas; })), endDate: rows.length ? rows.reduce(function (m, r) { return r.date > m ? r.date : m; }, rows[0].date) : null, totalInterest: null, monthsSaved: null, interestKnown: !unknownOld };
      C.pros.push(newMonthly < oldMonthly ? 'Reduz o valor pago por mês em ' + money(oldMonthly - newMonthly).toFixed(2).replace('.', ',') + '.' : 'Não reduz a parcela mensal.');
      if (worse) C.cons.push('O custo total aumenta em ' + money(newTotal - oldTotal).toFixed(2).replace('.', ',') + ' (prazo maior = mais juros).');
      C.cons.push('Depende de a instituição confirmar essa proposta. Os valores são os que você informou.');
      C.assumptions.push('Comparação com a dívida atual pelas parcelas e juros cadastrados' + (unknownOld ? ' (juros atuais não informados: custo atual subestimado)' : '') + '.');
    }
    plans.push(C);
    // D — preservar reserva
    var D = planBase('D', 'Preservar uma reserva financeira', 'reserva'); D.description = 'Mantém só as parcelas mínimas e separa todo mês o valor de reserva que você definiu.';
    var reserve = opts.reserve != null ? opts.reserve : ctx.reserveMonthly;
    if (cannot) { D.feasible = false; D.blockers.push(cannot); }
    else if (!(reserve > 0)) { D.feasible = false; D.blockers.push('Defina quanto quer guardar por mês de reserva.'); D.missing.push('meta de reserva mensal'); }
    else if (surplus == null) { D.feasible = false; D.blockers.push('Preciso da sua renda prevista.'); }
    else {
      var s4 = sim(0, null); fill(D, s4, 0);
      var room = money(cents(surplus) + cents(reserve));                                      // folga SEM descontar a reserva
      D.metrics.reserveMonthly = reserve; D.metrics.leftAfterReserve = surplus; D.metrics.reserveInYear = r2(reserve * 12);
      if (surplus < 0) { D.feasible = false; D.blockers.push('Com a reserva de ' + reserve.toFixed(2).replace('.', ',') + ' faltam ' + Math.abs(surplus).toFixed(2).replace('.', ',') + ' por mês. Reduza a reserva ou aumente a renda.'); }
      else D.pros.push('Cria uma margem de segurança de ' + reserve.toFixed(2).replace('.', ',') + ' por mês sem atrasar parcelas.');
      D.cons.push('As dívidas são quitadas no prazo normal, sem pagamento extra: o custo de juros não diminui.');
      D.assumptions.push('Folga antes da reserva: ' + room.toFixed(2).replace('.', ',') + '.');
    }
    plans.push(D);
    plans.forEach(function (p) { p.missing = p.missing.concat(baseMissing.filter(function (m) { return p.missing.indexOf(m) < 0 && p.strategy !== 'distribuir'; })); p.missing = p.missing.filter(function (m, i, a) { return a.indexOf(m) === i; }); });
    return { plans: plans, baseline: baseline, surplus: surplus };
  }

  // ───────── plano → eventos (idempotente) ─────────
  function planToEvents(plan, planId) {
    var out = [];
    (plan.payments || []).forEach(function (p) {
      if (p.move) return;                                                                 // movimentos de data são tratados em reconcilePlan
      out.push({ key: 'plan:' + planId + ':' + p.debtId + ':' + p.n + (p.extra ? ':x' : ''), planId: planId, kind: 'payable', title: (p.offer ? 'Parcela renegociada ' : 'Parcela ') + p.n + ' · ' + p.name, category: 'Dívidas', amount: p.amount, dueDate: p.date, priority: 'high', origin: 'plan', sourceRef: p.debtId, remindDays: p.remindDays || [1] });
    });
    return out;
  }
  // Compara os eventos propostos com os existentes. Nunca apaga pago; nunca altera confirmado sem aviso: devolve conflitos para o usuário decidir.
  function reconcilePlan(existing, proposed, oldPlanId) {
    var byKey = {}; existing.forEach(function (e) { byKey[e.key] = e; });
    var res = { create: [], skip: [], conflicts: [], cancel: [], keepPaid: [] };
    proposed.forEach(function (p) {
      if (byKey[p.key]) { res.skip.push(byKey[p.key]); return; }                          // mesma chave: já existe (reenvio/recálculo) → não duplica
      var clash = existing.filter(function (e) { return e.kind === 'payable' && e.status !== 'cancelled' && e.sourceRef && e.sourceRef === p.sourceRef && ym(e.dueDate) === ym(p.dueDate) && e.planId !== p.planId; })[0];
      if (clash) res.conflicts.push({ existing: clash, proposed: p, paid: clash.status === 'paid' }); else res.create.push(p);
    });
    if (oldPlanId) existing.forEach(function (e) {
      if (e.planId !== oldPlanId) return;
      if (e.status === 'paid') res.keepPaid.push(e);
      else if (e.status === 'pending' || e.status === 'awaiting') { if (e.userEdited) res.conflicts.push({ existing: e, proposed: null, edited: true }); else res.cancel.push(e); }
    });
    return res;
  }

  // ───────── pagamento ─────────
  function markPaid(e, info, nowIso) {
    if (e.status === 'paid') return { event: e, changed: false };
    var n = Object.assign({}, e); n.status = 'paid'; n.paidAt = info.date; n.paidAmount = r2(info.amount != null ? info.amount : e.amount); n.version = (e.version || 1) + 1;
    n.history = pushHistory(e, 'pago', { date: info.date, amount: n.paidAmount }, nowIso); return { event: n, changed: true };
  }
  // Efeito de uma parcela paga na dívida de origem: juros do período saem primeiro, o resto amortiza o saldo. ESTIMATIVA (usa a taxa cadastrada).
  function debtAfterPayment(d, amount) {
    var bal = cents(d.saldo), rate = (d.juros > 0 ? d.juros : 0) / 100, it = Math.round(bal * rate), pay = cents(amount), principal = Math.max(0, pay - it);
    var nb = Math.max(0, bal - principal); return { saldo: money(nb), parcelas: d.parcelas > 0 ? Math.max(0, d.parcelas - 1) : d.parcelas, interestPart: money(Math.min(it, pay)), principalPart: money(principal), estimated: !(d.juros > 0) };
  }

  // ───────── lembretes dentro do app ─────────
  function dueReminders(events, today, defaults) {
    var out = [], def = defaults || [1];
    events.forEach(function (e) {
      if (e.kind !== 'payable' || (e.status !== 'pending' && e.status !== 'awaiting')) return;
      var d = diffDays(today, e.dueDate), days = (e.remindDays && e.remindDays.length ? e.remindDays : def);
      if (d < 0) out.push({ id: 'ev-late-' + e.id, eventId: e.id, level: 'danger', daysLeft: d, event: e, text: e.title + ' venceu em ' + e.dueDate.split('-').reverse().join('/') });
      else if (days.indexOf(d) >= 0 || (d === 0)) out.push({ id: 'ev-' + e.id + '-' + d, eventId: e.id, level: d <= 1 ? 'warning' : 'info', daysLeft: d, event: e, text: e.title + (d === 0 ? ' vence hoje' : ' vence em ' + d + ' dia(s)') });
    });
    return out.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  }

  // ───────── conversa: interpretação por regras + respostas montadas SÓ com dados reais ─────────
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var brl = function (v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var br = function (iso) { return iso.split('-').reverse().join('/'); };
  function listEv(es, n) { return es.slice(0, n || 6).map(function (e) { return '• ' + br(e.dueDate) + ' · ' + e.title + ' · ' + brl(e.amount); }).join('\n'); }
  function answer(question, ctx, extras) {
    var q = norm(question), a = analyze(ctx), acts = [];
    var no = { text: 'Ainda não sei responder isso. Posso falar sobre: sua situação no mês, quais contas pagar primeiro, quanto da renda está comprometida, contas antes de receber, parcelamento de uma dívida, distribuir pagamentos e quanto sobra com um plano.', actions: [{ label: 'Ver opções de plano', action: 'plans' }] };
    if (/comprometid|quanto da minha renda/.test(q)) {
      if (!(ctx.income.amount > 0)) return { text: 'Não tenho sua renda prevista para calcular. Cadastre a data e o valor do recebimento no calendário.', actions: [{ label: 'Abrir calendário', action: 'calendar' }] };
      return { text: 'Do que você considera de renda neste mês (' + brl(ctx.income.amount) + ', fonte: ' + ctx.income.source + '), ' + brl(a.committedAmount) + ' (' + String(a.committedPct).replace('.', ',') + '%) já está comprometido: ' + brl(a.pendingMonth) + ' a pagar, ' + brl(a.paidMonth) + ' já pago' + (a.undatedMonthly > 0 ? ' e ' + brl(a.undatedMonthly) + ' de parcelas de dívidas sem data (estimativa)' : '') + '.', actions: [{ label: 'Ver opções de plano', action: 'plans' }] };
    }
    if (/antes de (eu )?receber|antes do (proximo )?(salario|pagamento|recebimento)|ate (o )?proximo (salario|recebimento)/.test(q)) {
      if (!ctx.nextIncome) return { text: 'Não há data de recebimento futura no calendário. Cadastre quando você recebe para eu separar as contas que vencem antes.', actions: [{ label: 'Abrir calendário', action: 'calendar' }] };
      return { text: a.beforeNextIncome.length ? 'Antes de você receber em ' + br(ctx.nextIncome.dueDate) + ' (' + brl(ctx.nextIncome.amount) + ') vencem ' + a.beforeNextIncome.length + ' conta(s), somando ' + brl(a.beforeNextIncomeTotal) + ':\n' + listEv(a.beforeNextIncome) : 'Nenhuma conta do calendário vence antes de ' + br(ctx.nextIncome.dueDate) + ', quando você recebe.', actions: [{ label: 'Abrir calendário', action: 'calendar' }] };
    }
    if (/primeiro|prioridade|priorizar|qual(is)? (conta|pagar)|ordem/.test(q)) {
      var ord = ctx.overdue.concat(ctx.upcoming).slice().sort(function (x, y) { var px = x.priority === 'essential' ? 0 : (x.priority === 'high' ? 1 : 2), py = y.priority === 'essential' ? 0 : (y.priority === 'high' ? 1 : 2); return (x.dueDate < ctx.today ? 0 : 1) - (y.dueDate < ctx.today ? 0 : 1) || px - py || (x.dueDate < y.dueDate ? -1 : 1); });
      if (!ord.length) return { text: 'Não há compromissos pendentes no calendário. Cadastre suas contas com data para eu ordenar.', actions: [{ label: 'Abrir calendário', action: 'calendar' }] };
      return { text: 'Ordem sugerida (vencidas primeiro, depois essenciais, depois por data):\n' + listEv(ord, 6) + '\nCritério: atraso gera juros e multa, essenciais protegem o básico. É uma sugestão; a decisão é sua.', actions: [{ label: 'Abrir calendário', action: 'calendar' }] };
    }
    if (/como esta|situacao|resumo|panorama|este mes|neste mes/.test(q)) {
      var t = 'Situação em ' + br(ctx.today) + ':\n• Renda considerada: ' + (ctx.income.amount > 0 ? brl(ctx.income.amount) + ' (' + ctx.income.source + ')' : 'não informada') + '\n• A pagar neste mês: ' + brl(a.pendingMonth) + (a.overdue.length ? '\n• Vencidas: ' + a.overdue.length + ' (' + brl(a.overdue.reduce(function (s, e) { return s + e.amount; }, 0)) + ')' : '') + (a.committedPct != null ? '\n• Comprometimento: ' + String(a.committedPct).replace('.', ',') + '% da renda' : '') + (a.projectedLeft != null ? '\n• Sobra projetada (renda − obrigações, não é saldo bancário): ' + brl(a.projectedLeft) : '');
      if (a.risks.length) t += '\nAtenção:\n' + a.risks.map(function (r) { return '• ' + r.text; }).join('\n');
      if (a.questions.length) t += '\nPreciso saber: ' + a.questions[0].text;
      return { text: t, actions: [{ label: 'Ver opções de plano', action: 'plans' }, { label: 'Abrir calendário', action: 'calendar' }] };
    }
    if (/distribuir|organizar|espalhar|melhor os pagamentos/.test(q)) {
      var g = generatePlans(ctx, extras || {}).plans.filter(function (p) { return p.strategy === 'distribuir'; })[0];
      if (!g.feasible) return { text: g.blockers[0], actions: [{ label: 'Abrir calendário', action: 'calendar' }] };
      return { text: 'Hoje ' + brl(a.beforeNextIncomeTotal) + ' vence antes do seu próximo recebimento. ' + (g.metrics.moved ? 'Marquei ' + g.metrics.moved + ' conta(s) alteráveis que poderiam passar para depois do recebimento: isso reduziria para ' + brl(g.metrics.beforeNextIncomeAfter) + '.' : 'Nenhuma conta está marcada como alterável, então só consigo sugerir a ordem de pagamento. Marque no calendário quais vencimentos o credor permite mudar.'), actions: [{ label: 'Ver plano B', action: 'plan:B' }] };
    }
    if (/parcel|renegoci/.test(q)) {
      var nums = (q.match(/\d+([.,]\d+)?/g) || []).map(function (x) { return parseFloat(x.replace(',', '.')); });
      var debt = ctx.debts.filter(function (d) { return d.saldo > 0 && q.indexOf(norm(d.name).split(' ')[0]) >= 0; })[0] || (ctx.debts.filter(function (d) { return d.saldo > 0; }).length === 1 ? ctx.debts.filter(function (d) { return d.saldo > 0; })[0] : null);
      if (!debt) return { text: ctx.debts.length ? 'De qual dívida você quer simular o parcelamento? Dívidas cadastradas: ' + ctx.debts.filter(function (d) { return d.saldo > 0; }).map(function (d) { return d.name; }).join(', ') + '.' : 'Não há dívidas cadastradas para simular.', actions: [{ label: 'Abrir dívidas', action: 'debts' }] };
      var n = nums.filter(function (x) { return x >= 2 && x <= 120 && x === Math.floor(x); })[0];
      if (!n) return { text: 'Para simular o parcelamento de "' + debt.name + '" (saldo ' + brl(debt.saldo) + ') preciso do número de parcelas e da taxa ou do valor da parcela que o credor ofereceu. Ex.: "parcelar em 12x a 2,5% ao mês". Não presumo que essa condição exista.', actions: [] };
      var rate = (q.match(/(\d+[.,]?\d*)\s*%/) || [])[1]; rate = rate ? parseFloat(rate.replace(',', '.')) : null;
      if (rate == null) return { text: 'Com ' + n + ' parcelas, qual é a taxa de juros ao mês (ou o valor da parcela) oferecida? Sem isso eu não calculo o custo.', actions: [] };
      var np = r2(pmt(debt.saldo, rate / 100, n)), tot = r2(np * n), cur = simulate([debt], { start: ctx.today });
      return { text: 'Parcelar "' + debt.name + '" em ' + n + 'x a ' + String(rate).replace('.', ',') + '% ao mês dá parcela de ' + brl(np) + ' e total de ' + brl(tot) + ' (juros ' + brl(r2(tot - debt.saldo)) + '). Hoje: parcela ' + brl(debt.mensal) + (debt.juros > 0 ? ', total estimado ' + brl(cur.totalPaid) + ' em ' + cur.months + ' meses' : ' (juros atuais não informados, então não comparo o custo total)') + '. Estimativa com as condições que você informou.', actions: [{ label: 'Comparar nas opções', action: 'offer:' + debt.id + ':' + n + ':' + rate }] };
    }
    if (/mudar (o )?vencimento|trocar (a )?data|alterar (o )?vencimento/.test(q)) {
      var dia = (q.match(/dia (\d{1,2})/) || [])[1], ev = ctx.pending.filter(function (e) { return q.indexOf(norm(e.title).split(' ')[0]) >= 0 && norm(e.title).split(' ')[0].length > 2; })[0];
      if (!ev || !dia) return { text: 'Diga qual conta e o novo dia. Ex.: "mudar o vencimento da internet para o dia 20". Eu simulo o efeito, mas a mudança real depende do credor aceitar.', actions: [] };
      var p0 = parse(ev.dueDate), nd = toIso(p0.y, p0.m, Math.min(+dia, dim(p0.y, p0.m)));
      var ctx2 = JSON.parse(JSON.stringify(ctx)); ctx2.events.forEach(function (e) { if (e.id === ev.id) e.dueDate = nd; }); ctx2.pending.forEach(function (e) { if (e.id === ev.id) e.dueDate = nd; }); ctx2.upcoming.forEach(function (e) { if (e.id === ev.id) e.dueDate = nd; }); ctx2.upcoming.sort(function (x, y) { return x.dueDate < y.dueDate ? -1 : 1; });
      var a2 = analyze(ctx2);
      return { text: 'Mudando "' + ev.title + '" de ' + br(ev.dueDate) + ' para ' + br(nd) + ': o que vence antes do próximo recebimento passaria de ' + brl(a.beforeNextIncomeTotal) + ' para ' + brl(a2.beforeNextIncomeTotal) + ' e os dias com saldo negativo de ' + a.deficits.length + ' para ' + a2.deficits.length + '. Simulação: só vale se o credor permitir.', actions: [{ label: 'Editar no calendário', action: 'event:' + ev.id }] };
    }
    if (/sobrar|sobra|se eu escolher|quanto vai sobrar/.test(q)) {
      var gp = generatePlans(ctx, extras || {}).plans.filter(function (p) { return p.feasible && p.strategy !== 'reduzir'; });
      if (!gp.length) return { text: 'Ainda não consigo projetar planos: ' + (generatePlans(ctx, extras || {}).plans[0].blockers[0] || 'faltam dados.'), actions: [{ label: 'Ver opções de plano', action: 'plans' }] };
      var sp = generatePlans(ctx, extras || {}).surplus;
      return { text: 'A folga mensal estimada é ' + (sp == null ? 'indeterminada (falta a renda)' : brl(sp)) + ' (renda − essenciais − parcelas mínimas − reserva). Planos viáveis: ' + gp.map(function (p) { return p.id + ' — ' + p.title; }).join('; ') + '. Abra a comparação para ver o saldo após cada plano.', actions: [{ label: 'Comparar planos', action: 'plans' }] };
    }
    return no;
  }

  return {
    HIGH_INTEREST: HIGH_INTEREST, cents: cents, money: money, r2: r2,
    parse: parse, valid: valid, addDays: addDays, addMonths: addMonths, diffDays: diffDays, ym: ym, monthEnd: monthEnd, monthStart: monthStart, dim: dim,
    statusView: statusView, validateEvent: validateEvent, newEvent: newEvent, expandRecurring: expandRecurring, pushHistory: pushHistory,
    pmt: pmt, simulate: simulate, debtMissing: debtMissing,
    buildContext: buildContext, timeline: timeline, analyze: analyze, surplusMonthly: surplusMonthly, generatePlans: generatePlans,
    planToEvents: planToEvents, reconcilePlan: reconcilePlan, markPaid: markPaid, debtAfterPayment: debtAfterPayment, dueReminders: dueReminders, answer: answer
  };
});
