/* SM Financial — Plano da semana. Lógica pura (sem tela): escolhe 1 a 3 missões a partir dos dados do próprio cliente.
 * Usada no app (cartão do Início) e no servidor (e-mail de segunda). Nada aqui grava dados nem inventa números:
 * tudo vem dos lançamentos, dívidas, metas, assinaturas e vencimentos que o cliente já cadastrou. */
(function (root) {
  'use strict';
  var DAY = 86400000;
  var pad = function (n) { return ('0' + n).slice(-2); };
  var iso = function (d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  var parse = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
  var round2 = function (v) { return Math.round(v * 100) / 100; };

  // Lançamentos podem vir como 2026-10-17 (banco) ou 17/10 | 17/10/2026 (digitados no app, ano/mês atuais).
  function txISO(date, todayISO) {
    var s = String(date || ''), d = parse(s);
    if (d) return iso(d);
    var m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s), t = parse(todayISO);
    if (!m || !t) return null;
    var y = m[3] ? +m[3] : t.getUTCFullYear(), c = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    if (!m[3] && c.getTime() - t.getTime() > 31 * DAY) c = new Date(Date.UTC(y - 1, +m[2] - 1, +m[1]));
    return iso(c);
  }
  // Semana de segunda a domingo que contém "hoje".
  function weekRange(todayISO) {
    var t = parse(todayISO), dow = (t.getUTCDay() + 6) % 7, start = new Date(t.getTime() - dow * DAY), end = new Date(start.getTime() + 6 * DAY);
    var th = new Date(start.getTime() + 3 * DAY), jan1 = new Date(Date.UTC(th.getUTCFullYear(), 0, 1));            // semana ISO: a quinta decide o ano
    var wk = Math.floor((th.getTime() - jan1.getTime()) / DAY / 7) + 1;
    return { key: th.getUTCFullYear() + '-W' + pad(wk), start: iso(start), end: iso(end) };
  }
  // Meses para quitar no ritmo atual (parcela atual). null = alguma parcela não cobre nem os juros.
  function monthsToPay(d) {
    var s = +d.saldo || 0, p = +d.mensal || 0, r = (+d.juros || 0) / 100;
    if (s <= 0) return 0;
    if (p <= 0) return null;
    if (r <= 0) return Math.ceil(s / p);
    if (p <= s * r) return null;
    return Math.ceil(-Math.log(1 - (s * r) / p) / Math.log(1 + r));
  }
  var FIXED = /moradia|aluguel|imposto|d[ií]vida|folha|sal[aá]rio/i;   // despesas fixas não entram como "corte da semana"

  function build(input) {
    var o = input || {}, today = o.today, wk = weekRange(today);
    var tx = (o.transactions || []).map(function (t) { return { d: txISO(t.date, today), cat: t.cat || t.category || 'Outros', amount: +t.amount || 0, type: t.type }; }).filter(function (t) { return t.d; });
    var debts = (o.debts || []).filter(function (d) { return (+d.saldo || 0) > 0; });
    var missions = [];

    // 1) Dívida: a mais cara primeiro (juros); sem juros informados, a menor (fôlego rápido).
    if (debts.length) {
      var withRate = debts.some(function (d) { return (+d.juros || 0) > 0; });
      var pick = debts.slice().sort(withRate ? function (a, b) { return (+b.juros || 0) - (+a.juros || 0) || b.saldo - a.saldo; } : function (a, b) { return a.saldo - b.saldo; })[0];
      missions.push({ id: 'debt', kind: 'debt', icon: '🎯', auto: false, ref: pick.name,
        title: 'Pague ou negocie "' + pick.name + '"',
        why: withRate ? 'É a dívida mais cara hoje: ' + String(+pick.juros).replace('.', ',') + '% ao mês. Cada real aqui rende mais alívio.' : 'Quitar a menor dívida primeiro dá fôlego rápido e libera dinheiro no mês.' });
    }

    // 2) Gasto da semana: 10% abaixo da média semanal das 4 semanas anteriores, na categoria variável que mais pesa.
    var prevStart = iso(new Date(parse(wk.start).getTime() - 28 * DAY)), base = {}, now = {};
    tx.forEach(function (t) {
      if (t.type !== 'expense' || FIXED.test(t.cat)) return;
      if (t.d >= prevStart && t.d < wk.start) base[t.cat] = (base[t.cat] || 0) + t.amount;
      else if (t.d >= wk.start && t.d <= wk.end) now[t.cat] = (now[t.cat] || 0) + t.amount;
    });
    var cats = Object.keys(base).sort(function (a, b) { return base[b] - base[a]; });
    if (cats.length && base[cats[0]] / 4 >= 20) {
      var cat = cats[0], avg = base[cat] / 4, target = Math.round(avg * 0.9), spent = round2(now[cat] || 0);
      missions.push({ id: 'spend', kind: 'spend', icon: '✂️', auto: true, ref: cat, target: target, spent: spent, avg: Math.round(avg),
        status: spent > target ? 'over' : spent > target * 0.8 ? 'near' : 'ok',
        title: 'Gaste até R$ ' + target + ' com ' + cat + ' esta semana',
        why: 'Nas últimas semanas, a média foi de R$ ' + Math.round(avg) + ' por semana. Cortar 10% já faz diferença no fim do mês.' });
    }

    // 3) Registrar a semana: quando há poucos lançamentos nos últimos 7 dias (ou nenhum dado ainda).
    var thisWeek = tx.filter(function (t) { return t.d >= wk.start && t.d <= wk.end; }).length, empty = tx.length === 0;
    if (thisWeek < 3 && missions.length < 3) {
      var need = empty ? 4 : 3;
      missions.push({ id: 'log', kind: 'log', icon: '📝', auto: true, count: thisWeek, need: need,
        title: empty ? 'Comece por aqui: registre sua renda e 3 gastos' : 'Registre os gastos desta semana (' + need + ' lançamentos)',
        why: empty ? 'Com esses números, o app monta o seu plano de verdade. Leva poucos minutos.' : 'Sem os números em dia, o plano fica no escuro. Registre o que gastou nesta semana.' });
    }

    // 4) Assinaturas: rever a mais cara. 5) Meta: o aporte semanal.
    var subs = (o.subscriptions || []).filter(function (s) { return (+s.price || 0) > 0; });
    if (subs.length && missions.length < 3) {
      var tot = subs.reduce(function (a, s) { return a + (+s.price); }, 0), top = subs.slice().sort(function (a, b) { return b.price - a.price; })[0];
      missions.push({ id: 'subs', kind: 'subs', icon: '🔁', auto: false, ref: top.name,
        title: 'Revise "' + top.name + '" (R$ ' + Math.round(top.price) + '/mês)',
        why: 'Suas assinaturas somam R$ ' + Math.round(tot) + ' por mês. Cancelar o que você não usa é alívio imediato.' });
    }
    var goals = (o.goals || []).filter(function (g) { return (+g.monthly || 0) > 0 && (+g.current || 0) < (+g.target || 0); });
    if (goals.length && missions.length < 3) {
      var g = goals[0], weekly = Math.max(1, Math.round(g.monthly / 4.33));
      missions.push({ id: 'goal', kind: 'goal', icon: '🌱', auto: false, ref: g.name,
        title: 'Guarde R$ ' + weekly + ' para "' + g.name + '"',
        why: 'É o aporte semanal que mantém a meta no ritmo planejado.' });
    }
    missions = missions.slice(0, 3);

    // Contagem regressiva: meses para quitar tudo no ritmo atual.
    var freedom = null;
    if (debts.length) {
      var per = debts.map(function (d) { return { name: d.name, months: monthsToPay(d) }; }), bad = per.filter(function (x) { return x.months == null; });
      freedom = { total: round2(debts.reduce(function (a, d) { return a + (+d.saldo); }, 0)), count: debts.length,
        months: bad.length ? null : per.reduce(function (m, x) { return Math.max(m, x.months); }, 0), stuck: bad.map(function (x) { return x.name; }) };
    }

    // Vencimentos da semana (e atrasados) vindos da agenda do próprio cliente.
    var payables = (o.events || []).filter(function (e) { return e.kind === 'payable' && e.status === 'pending' && e.dueDate && e.dueDate <= wk.end; })
      .sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; }).slice(0, 5)
      .map(function (e) { return { title: e.title, amount: +e.amount, dueDate: e.dueDate, late: e.dueDate < today }; });

    return { week: wk.key, start: wk.start, end: wk.end, missions: missions, freedom: freedom, payables: payables, empty: empty };
  }
  var api = { build: build, weekRange: weekRange, monthsToPay: monthsToPay, txISO: txISO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WeekPlan = api;
})(typeof window !== 'undefined' ? window : this);
