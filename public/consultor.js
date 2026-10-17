/* SM Financial — Consultor de estratégia (conversa guiada). Motor próprio: nada sai do aparelho e nenhum número é inventado.
 * O cliente escreve do jeito dele ("quero quitar o cartão até janeiro, em novembro e dezembro recebo o 13º, em janeiro tenho férias").
 * O motor entende datas e valores, pergunta só o que falta e monta o cronograma mês a mês com os números informados.
 * Lógica pura (sem tela): usada por consultor-ui.js e testada em tests/consultor.test.js. */
(function (root) {
  'use strict';
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var norm = function (s) { return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var cents = function (v) { return Math.round((+v || 0) * 100); };
  var money = function (c) { return c / 100; };
  var brl = function (v) { return 'R$ ' + (Math.round((+v || 0) * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: (Math.round(v * 100) % 100) ? 2 : 0, maximumFractionDigits: 2 }); };
  var pad = function (n) { return ('0' + n).slice(-2); };
  var ymOf = function (iso) { return String(iso).slice(0, 7); };
  var nextYm = function (ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1); };
  var addYm = function (ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; return (y + Math.floor(m / 12)) + '-' + pad(((m % 12) + 12) % 12 + 1); };
  var cmpYm = function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };
  var monthsBetween = function (a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); };
  var ymLabel = function (ym) { return MONTHS[+ym.slice(5, 7) - 1] + '/' + ym.slice(0, 4); };
  var ymShort = function (ym) { var s = MABBR[+ym.slice(5, 7) - 1]; return s.charAt(0).toUpperCase() + s.slice(1) + '/' + ym.slice(2, 4); };
  var monthName = function (ym) { return MONTHS[+ym.slice(5, 7) - 1]; };

  // ───────── entendimento de texto ─────────
  var MRX = '(janeiro|jan|fevereiro|fev|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)';
  function monthIdx(w) { var i = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(w.slice(0, 3)); return i; }
  // O mês citado vale para o próximo que chegar (este mês ou os seguintes).
  function ymFor(mi, today) { var ty = +today.slice(0, 4), tm = +today.slice(5, 7) - 1; return (mi >= tm ? ty : ty + 1) + '-' + pad(mi + 1); }
  function findMonth(t, today) { var m = new RegExp('\\b' + MRX + '\\b').exec(t); return m ? ymFor(monthIdx(m[1]), today) : null; }
  function toNum(s) {
    s = String(s).trim();
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (/^\d+(,\d{1,2})?$/.test(s)) return parseFloat(s.replace(',', '.'));
    if (/^\d+(\.\d{1,2})?$/.test(s)) return parseFloat(s);
    return null;
  }
  // Valores: "R$ 2.500,50", "2500", "2,5 mil", "3 mil reais". null = não achei.
  function parseMoney(text) {
    var t = norm(text), m = /r\$\s*([\d.]+(?:,\d{1,2})?)/.exec(t);
    if (m && toNum(m[1]) != null) return toNum(m[1]);
    m = /(\d+(?:[.,]\d+)?)\s*mil\b/.exec(t); if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
    m = /(\d[\d.]*(?:,\d{1,2})?)\s*(?:reais|real|conto|contos)\b/.exec(t); if (m && toNum(m[1]) != null) return toNum(m[1]);
    m = /^\s*([\d.]+(?:,\d{1,2})?)\s*$/.exec(t); if (m && toNum(m[1]) != null) return toNum(m[1]);
    return null;
  }
  var KINDS = [
    ['13', /\b13\s*o?\b|decimo\s*terceiro/, '13º salário'],
    ['ferias', /\bferias\b/, 'férias'],
    ['bonus', /\b(bonus|plr|premio|participacao nos lucros)\b/, 'bônus'],
    ['restituicao', /\b(restituicao|irpf|imposto de renda)\b/, 'restituição do imposto de renda'],
    ['rescisao', /\b(rescisao|fgts|acerto)\b/, 'rescisão/FGTS'],
    ['extra', /\b(dinheiro extra|renda extra|freela|freelance|venda do|vender)\b/, 'renda extra']];
  function clauses(t) {
    return t.replace(/\b(pois|porque|mas|sendo que)\b/g, '.').split(new RegExp('[;.!?\\n]|\\be\\s+(?=(?:em|no|na)\\s|' + MRX + ')'));
  }
  // Extrai o que o cliente já disse: objetivo, prazo, dívida citada e entradas extras (13º, férias...).
  function parseIntent(text, today, opts) {
    opts = opts || {}; var t = norm(text), out = { goal: null, deadline: null, debtHint: null, windfalls: [] };
    if (/\b(quit|zerar|liquid|eliminar|acabar com)/.test(t) || /\bpag(ar|o)\s+(o|a|toda|todo|tudo)\b/.test(t)) out.goal = 'quitar';
    else if (/\b(junt|guard|poup|reserva|economiz)/.test(t)) out.goal = 'juntar';
    else if (/\b(aperto|no vermelho|nao sei por onde|organizar|me organizar|estou enrolad)/.test(t)) out.goal = 'aperto';
    var cl = clauses(t);
    cl.forEach(function (c) {
      var goalVerb = /\b(quit|zerar|liquid|pag|junt|guard|poup|reserva|resolver|eliminar|acabar)/.test(c);
      var until = new RegExp('\\b(?:ate|antes de|no maximo em|ate o fim de)\\s+(?:o\\s+)?(?:mes de\\s+)?' + MRX + '\\b').exec(c);
      if (until && goalVerb && !out.deadline) out.deadline = ymFor(monthIdx(until[1]), today);
      if (!out.deadline && /\b(fim|final) do ano\b/.test(c) && goalVerb) out.deadline = ymFor(11, today);
      var inN = /\bem\s+(\d{1,2})\s+mes(es)?\b/.exec(c); if (inN && goalVerb && !out.deadline) out.deadline = addYm(today.slice(0, 7), +inN[1]);
      KINDS.forEach(function (k) {
        if (!k[1].test(c)) return;
        var mo = findMonth(c, today); if (!mo) return;
        var tr = /\b([12])\s*[ao]?\s*parcela|\b(primeira|segunda)\s+parcela/.exec(c), tranche = tr ? (tr[1] ? +tr[1] : (tr[2] === 'primeira' ? 1 : 2)) : null;
        if (k[0] === '13' && !tranche) tranche = 0;
        if (until && goalVerb && !/\b13\b|ferias|bonus/.test(c)) return;
        out.windfalls.push({ kind: k[0], label: k[2] + (k[0] === '13' && tranche ? ' (' + tranche + 'ª parcela)' : ''), tranche: tranche, ym: mo, amount: parseMoney(c.replace(/\b13\s*o?\b/g, '')) });
      });
    });
    if (opts.expectDeadline && !out.deadline) { var m = findMonth(t, today); if (m) out.deadline = m; var n = /\bem\s+(\d{1,2})\s+mes(es)?\b/.exec(t); if (n) out.deadline = addYm(today.slice(0, 7), +n[1]); if (/\b(fim|final) do ano\b/.test(t)) out.deadline = ymFor(11, today); }
    var hints = [['cartao', /cart[aã]o|cartao|fatura/], ['emprestimo', /emprestimo|consignado|pessoal/], ['financiamento', /financiamento|carro|moto|casa|imovel/], ['cheque', /cheque especial/], ['cheque', /limite/]];
    hints.forEach(function (h) { if (!out.debtHint && h[1].test(t)) out.debtHint = h[0]; });
    return out;
  }

  // ───────── cálculo do cronograma ─────────
  // p: { saldo, juros (% a.m.), mensal, extra, startYm, deadline, windfalls:[{ym,amount,label}], rate0 }
  function simulate(p, noWindfalls) {
    var r = (+p.juros || 0) / 100, bal = cents(p.saldo), rows = [], interestTotal = 0, ym = p.startYm, maxM = 120, finishYm = null, remaining = null;
    for (var i = 0; i < maxM; i++) {
      var it = Math.round(bal * r); bal += it; interestTotal += it;
      var wf = noWindfalls ? [] : (p.windfalls || []).filter(function (w) { return w.ym === ym && w.amount > 0; });
      var wfSum = wf.reduce(function (a, w) { return a + cents(w.amount); }, 0);
      var mn = cents(p.mensal), ex = cents(p.extra);
      var pay = Math.min(mn + ex + wfSum, bal), pMin = Math.min(mn, pay), pEx = Math.min(ex, pay - pMin), pWf = pay - pMin - pEx;
      bal -= pay;
      rows.push({ ym: ym, pay: money(pay), min: money(pMin), extra: money(pEx), windfall: money(pWf), windfalls: wf.map(function (w) { return w.label; }), interest: money(it), balance: money(bal) });
      if (ym === p.deadline) remaining = money(bal);
      if (bal <= 0 && !finishYm) { finishYm = ym; break; }
      if (p.deadline && cmpYm(ym, p.deadline) > 0 && finishYm) break;
      ym = nextYm(ym);
    }
    if (remaining == null && finishYm) remaining = 0;
    return { rows: rows, finishYm: finishYm, remaining: remaining, interestTotal: money(interestTotal), never: !finishYm };
  }
  // Menor extra mensal (em reais inteiros) para zerar até o prazo, com as entradas já informadas.
  function neededExtra(p) {
    var lo = 0, hi = Math.ceil(+p.saldo) + 1, q = function (e) { var s = simulate(Object.assign({}, p, { extra: e })); return s.finishYm && cmpYm(s.finishYm, p.deadline) <= 0; };
    if (!q(hi)) return null; if (q(lo)) return 0;
    while (hi - lo > 1) { var mid = Math.floor((lo + hi) / 2); if (q(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  function plan(S) {
    var p = { saldo: S.debt.saldo, juros: S.debt.juros || 0, mensal: S.debt.mensal || 0, extra: S.extra || 0, startYm: ymOf(S.today), deadline: S.deadline, windfalls: S.windfalls.filter(function (w) { return w.amount > 0; }) };
    var sim = simulate(p), shown = sim.rows.filter(function (r) { return cmpYm(r.ym, S.deadline) <= 0; });
    var ok = !!sim.finishYm && cmpYm(sim.finishYm, S.deadline) <= 0;
    var base = simulate(Object.assign({}, p, { extra: 0 }), true);
    var res = { ok: ok, rows: shown, finishYm: sim.finishYm, remaining: ok ? 0 : sim.remaining, interestTotal: sim.interestTotal, deadline: S.deadline, goal: S.goal, debt: S.debt,
      baseline: base.never ? null : { months: base.rows.length, interest: base.interestTotal, finishYm: base.finishYm }, saved: null, needExtra: null, lateYm: null, stuck: false };
    if (res.baseline) res.saved = Math.max(0, Math.round((res.baseline.interest - sim.interestTotal) * 100) / 100);
    if (!ok) { res.needExtra = neededExtra(p); res.lateYm = sim.finishYm; res.stuck = sim.never && !(S.extra > 0) && !(p.windfalls.length); }
    return res;
  }

  // ───────── conversa ─────────
  function ctxDefaults(c) { c = c || {}; return { today: c.today, name: c.name || '', debts: (c.debts || []).filter(function (d) { return d.saldo > 0; }), income: +c.income || 0, surplus: Math.max(0, Math.round(+c.surplus || 0)) }; }
  function replyBtn(label, value) { return { label: label, value: value }; }

  function ask(S) {
    var C = S.ctx;
    if (!S.goal) return { text: (C.name ? 'Oi, ' + C.name.split(/\s+/)[0] + '! ' : 'Oi! ') + 'Eu sou o consultor de estratégia. Me conta, do seu jeito, o que você quer resolver e até quando. Por exemplo: "quero quitar o cartão até janeiro, em novembro e dezembro recebo o 13º e em janeiro tenho férias".',
      replies: [replyBtn('Quitar uma dívida', '@goal:quitar'), replyBtn('Juntar dinheiro', '@goal:juntar'), replyBtn('Quero sair do aperto, mas não sei por onde', '@goal:aperto')] };
    if (S.goal === 'aperto') return diagnosis(S);
    if (S.goal === 'quitar' && !S.debt) {
      if (C.debts.length === 0) return { text: 'Você ainda não cadastrou dívidas, então vou usar o que você me disser. Qual é o saldo total dessa dívida hoje? (ex.: 4500)', replies: [], slot: 'saldo' };
      return { text: 'Qual dívida você quer quitar?', replies: C.debts.slice(0, 5).map(function (d) { return replyBtn(d.name + ' (' + brl(d.saldo) + ')', '@debt:' + d.id); }) };
    }
    if (S.goal === 'juntar' && S.target == null) return { text: 'Quanto você quer juntar no total? (ex.: 5000)', replies: [], slot: 'target' };
    if (S.goal === 'juntar' && S.have == null) return { text: 'E quanto você já tem guardado para isso hoje? (se nada, digite 0)', replies: [replyBtn('Nada ainda', '@have:0')], slot: 'have' };
    var d = S.debt;
    if (S.goal === 'quitar' && d.fromUser && !(d.mensal > 0) && !S.askedMensal) return { text: 'Qual é o valor da parcela que você paga hoje por essa dívida? (se não tem parcela fixa, digite 0)', replies: [replyBtn('Não tem parcela fixa', '@mensal:0')], slot: 'mensal' };
    if (S.goal === 'quitar' && !S.askedJuros && !(d.juros > 0)) return { text: 'Quanto de juros essa dívida cobra por mês? (ex.: 12, de 12% ao mês). Você acha no contrato ou na fatura. Se não souber, eu sigo sem juros e aviso que o prazo real pode ser maior.', replies: [replyBtn('Não sei', '@juros:0')], slot: 'juros' };
    if (!S.deadline) {
      var y = S.today, r = [1, 2, 3, 4, 6].map(function (n) { var ym = addYm(ymOf(y), n); return replyBtn(monthName(ym).charAt(0).toUpperCase() + monthName(ym).slice(1) + '/' + ym.slice(2, 4), '@dl:' + ym); });
      return { text: S.goal === 'juntar' ? 'Até quando você quer ter esse valor?' : 'Até quando você quer quitar?', replies: r, slot: 'deadline' };
    }
    if (!S.askedWindfalls) return { text: 'Vai entrar algum dinheiro extra até ' + ymLabel(S.deadline) + '? Pode ser 13º, férias, bônus, restituição, rescisão. Conta do seu jeito, com os meses.', replies: [replyBtn('Não, só o salário', '@wf:none')], slot: 'windfalls' };
    var miss = S.windfalls.filter(function (w) { return w.amount == null && cmpYm(w.ym, S.deadline) <= 0 && !w.skipped; })[0];
    if (miss) {
      var est = estimate(miss, C.income), r2 = [];
      if (est) r2.push(replyBtn('Estimar: ' + brl(est.value) + ' (' + est.how + ')', '@wfamt:' + est.value));
      r2.push(replyBtn('Não sei, deixar de fora', '@wfamt:0'));
      return { text: 'Quanto você espera receber de ' + miss.label + ' em ' + monthName(miss.ym) + '? Se tiver o valor líquido (o que cai na conta), é o melhor.' + (est ? ' Se preferir, uso uma estimativa e você ajusta depois.' : ''), replies: r2, slot: 'wfamt' };
    }
    if (S.extra == null) {
      var r3 = [];
      if (C.surplus > 0) r3.push(replyBtn('Usar ' + brl(C.surplus) + ' (com base nos meus números)', '@extra:' + C.surplus));
      r3.push(replyBtn('Não sobra nada', '@extra:0'));
      return { text: 'Quanto sobra por mês, de verdade, depois das contas fixas e da parcela de hoje? Esse é o valor extra que eu posso usar para acelerar.' + (C.surplus > 0 ? ' Pelos seus lançamentos, a sobra do mês aparece como ' + brl(C.surplus) + '.' : ''), replies: r3, slot: 'extra' };
    }
    return null;
  }
  function estimate(w, income) {
    if (!(income > 0)) return null;
    if (w.kind === '13') return w.tranche === 2 ? { value: Math.round(income * 0.45), how: '45% da renda, já com descontos estimados' } : { value: Math.round(income * 0.5), how: 'metade da renda' };
    if (w.kind === 'ferias') return { value: Math.round(income * 1.33 * 0.9), how: 'renda mais 1/3, com descontos estimados' };
    return null;
  }
  function diagnosis(S) {
    var C = S.ctx, lines = [];
    if (!C.debts.length) { S.goal = null; return { text: 'Para montar um plano, preciso saber o que você quer atingir. Você quer quitar alguma dívida ou juntar dinheiro?', replies: [replyBtn('Quitar uma dívida', '@goal:quitar'), replyBtn('Juntar dinheiro', '@goal:juntar')] }; }
    var worst = C.debts.slice().sort(function (a, b) { return (b.juros || 0) - (a.juros || 0) || b.saldo - a.saldo; })[0], tot = C.debts.reduce(function (a, d) { return a + d.saldo; }, 0);
    lines.push('Você tem ' + C.debts.length + (C.debts.length === 1 ? ' dívida' : ' dívidas') + ', somando ' + brl(tot) + '.');
    if (worst.juros > 0) lines.push('A mais cara é "' + worst.name + '" (' + String(worst.juros).replace('.', ',') + '% ao mês), então ela costuma ser a primeira a atacar.');
    lines.push('Vamos transformar isso em prazo e plano. Escolha a dívida que quer atacar primeiro:');
    return { text: lines.join(' '), replies: C.debts.slice(0, 5).map(function (d) { return replyBtn(d.name + ' (' + brl(d.saldo) + ')', '@debt:' + d.id); }), pickDebt: true };
  }

  function newSession(ctx) {
    var c = ctxDefaults(ctx), S = { ctx: c, today: c.today, goal: null, debt: null, target: null, have: null, deadline: null, windfalls: [], extra: null, askedWindfalls: false, askedJuros: false, askedMensal: false, slot: null, done: false, plan: null };
    return { S: S, msgs: [Object.assign({ role: 'bot' }, ask(S))] };
  }
  function pickDebt(S, hint) {
    var ds = S.ctx.debts; if (!ds.length) return null;
    if (ds.length === 1) return ds[0];
    if (hint) { var m = ds.filter(function (d) { var n = norm(d.name + ' ' + (d.type || '')); return hint === 'cartao' ? /cart|fatura|credito/.test(n) : hint === 'emprestimo' ? /emprest|consign|pessoal/.test(n) : hint === 'financiamento' ? /financ|carro|moto|casa|imovel/.test(n) : /cheque|limite/.test(n); }); if (m.length === 1) return m[0]; }
    return null;
  }
  function setDebt(S, d) { S.debt = { id: d.id, name: d.name, saldo: +d.saldo || 0, juros: d.juros == null ? 0 : +d.juros, mensal: +d.mensal || 0, fromUser: false }; if (S.debt.juros > 0) S.askedJuros = true; }

  // Recebe a fala do cliente (ou o valor de um botão "@...") e devolve as próximas mensagens.
  function reply(S0, text) {
    var S = JSON.parse(JSON.stringify(S0)), t = String(text || '').trim(), msgs = [];
    if (!t) return { S: S, msgs: [] };
    var cmd = /^@(\w+):(.*)$/.exec(t), slot = S.slot, understood = true;
    if (cmd) {
      var k = cmd[1], v = cmd[2];
      if (k === 'goal') { S.goal = v; if (v === 'quitar' && S.ctx.debts.length === 1) setDebt(S, S.ctx.debts[0]); }
      else if (k === 'debt') { var d = S.ctx.debts.filter(function (x) { return String(x.id) === v; })[0]; if (d) { setDebt(S, d); if (S.goal === 'aperto') S.goal = 'quitar'; } }
      else if (k === 'dl') S.deadline = v;
      else if (k === 'wf') { S.askedWindfalls = true; }
      else if (k === 'wfamt') { var w = S.windfalls.filter(function (x) { return x.amount == null && cmpYm(x.ym, S.deadline) <= 0 && !x.skipped; })[0]; if (w) { w.amount = +v; if (!(+v > 0)) w.skipped = true; } }
      else if (k === 'extra') S.extra = +v;
      else if (k === 'have') S.have = +v;
      else if (k === 'mensal') { S.debt.mensal = +v; S.askedMensal = true; }
      else if (k === 'juros') { S.debt.juros = +v; S.askedJuros = true; }
    } else {
      var I = parseIntent(t, S.today, { expectDeadline: slot === 'deadline' });
      if (!S.goal && I.goal) S.goal = I.goal;
      if (I.deadline && (!S.deadline || slot === 'deadline')) S.deadline = I.deadline;
      if (S.goal === 'quitar' && !S.debt && S.ctx.debts.length) {
        var nt = norm(t), byName = S.ctx.debts.filter(function (x) { var n = norm(x.name); return n.length >= 3 && (nt.indexOf(n) >= 0 || (nt.length >= 3 && n.indexOf(nt) >= 0)); });
        var pd = byName.length === 1 ? byName[0] : pickDebt(S, I.debtHint); if (pd) setDebt(S, pd);
      }
      if (I.windfalls.length) {
        S.askedWindfalls = true;
        I.windfalls.forEach(function (w) { if (!S.windfalls.some(function (x) { return x.ym === w.ym && x.kind === w.kind && x.tranche === w.tranche; })) S.windfalls.push(w); });
      }
      var num = parseMoney(t);
      if (slot === 'saldo' && num != null) { S.debt = { id: 'tmp', name: S.ctx.debtName || 'sua dívida', saldo: num, juros: 0, mensal: 0, fromUser: true }; }
      else if (slot === 'mensal' && num != null) { S.debt.mensal = num; S.askedMensal = true; }
      else if (slot === 'juros') { var jm = /(\d+(?:[.,]\d+)?)/.exec(t); if (jm) { S.debt.juros = parseFloat(jm[1].replace(',', '.')); S.askedJuros = true; } else if (/nao sei|n[aã]o sei|sem juros/.test(norm(t))) { S.debt.juros = 0; S.askedJuros = true; } else understood = false; }
      else if (slot === 'target' && num != null) S.target = num;
      else if (slot === 'have' && num != null) S.have = num;
      else if (slot === 'extra' && num != null) S.extra = num;
      else if (slot === 'extra' && /nada|nao sobra|zero/.test(norm(t))) S.extra = 0;
      else if (slot === 'wfamt' && num != null) { var w2 = S.windfalls.filter(function (x) { return x.amount == null && cmpYm(x.ym, S.deadline) <= 0 && !x.skipped; })[0]; if (w2) w2.amount = num; }
      else if (slot === 'windfalls' && !I.windfalls.length) { if (/\b(nao|nenhum|so o salario|nada)\b/.test(norm(t))) S.askedWindfalls = true; else understood = false; }
      else if (slot === 'deadline' && !I.deadline) understood = false;
      else if (slot === 'saldo' || slot === 'mensal' || slot === 'target' || slot === 'have' || slot === 'extra' || slot === 'wfamt') understood = false;
      else if (!S.goal && !I.goal && !I.windfalls.length && !I.deadline) understood = false;
    }
    if (S.goal === 'juntar' && S.target != null && S.have != null && !S.debt) S.debt = { id: 'meta', name: 'sua meta', saldo: Math.max(0, S.target - S.have), juros: 0, mensal: 0, fromUser: false }, S.askedJuros = true, S.askedMensal = true;
    if (S.goal === 'juntar' && S.debt && S.debt.id === 'meta') { S.debt.saldo = Math.max(0, (S.target || 0) - (S.have || 0)); }
    if (S.deadline && cmpYm(S.deadline, ymOf(S.today)) < 0) { S.deadline = null; msgs.push({ role: 'bot', text: 'Esse mês já passou. Escolha um mês a partir de agora.' }); }
    if (!understood) msgs.push({ role: 'bot', text: 'Não consegui entender essa resposta. Pode escrever de outro jeito? Pode usar os botões abaixo também.' });
    var q = ask(S);
    if (q) { S.slot = q.slot || null; msgs.push(Object.assign({ role: 'bot' }, q)); return { S: S, msgs: msgs }; }
    // tudo respondido: monta o plano
    S.plan = plan(S); S.done = true; S.slot = null;
    msgs.push({ role: 'bot', text: summary(S.plan, S), plan: S.plan, replies: S.plan.ok ? [replyBtn('Salvar este plano', '@save:1'), replyBtn('Refazer', '@restart:1')] : [replyBtn('Mais prazo', '@fix:late'), replyBtn('Mais dinheiro por mês', '@fix:extra'), replyBtn('Refazer', '@restart:1')] });
    return { S: S, msgs: msgs };
  }
  function summary(p, S) {
    var what = p.goal === 'juntar' ? 'juntar ' + brl(S.target) : 'quitar ' + (p.debt.name ? '"' + p.debt.name + '"' : 'a dívida');
    if (p.ok) {
      var out = ['Dá para ' + what + ' até ' + ymLabel(p.deadline) + (p.finishYm !== p.deadline ? ', e o último pagamento cai em ' + ymLabel(p.finishYm) : '') + '.'];
      if (p.goal !== 'juntar') out.push('Você paga ' + brl(p.interestTotal) + ' de juros no total' + (p.saved != null && p.saved > 0 ? ', ' + brl(p.saved) + ' a menos do que pagando só a parcela de hoje' : (p.baseline == null && p.debt.mensal > 0 ? '. Pagando só a parcela de hoje, essa dívida nem chegaria a cair, porque ela mal cobre os juros' : '')) + '.');
      out.push('Aqui está o seu cronograma mês a mês.');
      return out.join(' ');
    }
    var a = ['Com os números que você me deu, ainda não fecha até ' + ymLabel(p.deadline) + ': sobrariam ' + brl(p.remaining) + '.'];
    if (p.needExtra != null) a.push('Para fechar no prazo, você precisaria colocar cerca de ' + brl(p.needExtra) + ' por mês, além do que já informou.');
    if (p.lateYm) a.push('No ritmo atual, termina em ' + ymLabel(p.lateYm) + '.');
    if (p.stuck) a.push('Atenção: sem valor extra, a parcela não cobre os juros e a dívida não cai.');
    a.push('Escolha o que fazer:');
    return a.join(' ');
  }
  // Ajustes depois de um plano que não fechou.
  function fix(S0, what) {
    var S = JSON.parse(JSON.stringify(S0)); S.done = false; S.plan = null;
    if (what === 'late') { S.deadline = null; S.slot = 'deadline'; } else { S.extra = null; S.slot = 'extra'; }
    var q = ask(S); S.slot = q.slot || null; return { S: S, msgs: [Object.assign({ role: 'bot' }, q)] };
  }
  // Passos de ação (texto), derivados do cronograma.
  function actions(p, S) {
    var a = [], d = p.debt && p.debt.name ? '"' + p.debt.name + '"' : 'a dívida';
    if (p.goal === 'juntar') { a.push('Separe o valor logo que receber, antes de gastar: automatize a transferência para uma conta ou investimento à parte.'); }
    else {
      a.push('Esta semana: peça ao credor o saldo para quitação e a taxa de juros atual de ' + d + '. Em geral, quem quita antes do prazo tem direito à redução proporcional dos juros.');
      if ((S.ctx.debts || []).length > 1) a.push('Continue pagando em dia as parcelas das outras dívidas, para não abrir um novo buraco.');
    }
    p.rows.slice(0, 8).forEach(function (r) {
      var parts = []; if (r.min > 0) parts.push('parcela ' + brl(r.min)); if (r.extra > 0) parts.push('extra ' + brl(r.extra)); if (r.windfall > 0) parts.push(r.windfalls.join(' + ') + ' ' + brl(r.windfall));
      a.push('Em ' + monthName(r.ym) + ': ' + (p.goal === 'juntar' ? 'guarde ' : 'pague ') + brl(r.pay) + (parts.length ? ' (' + parts.join(' + ') + ')' : '') + '.');
    });
    a.push('Até o fim do plano, evite novas compras no crédito: o que entra de dívida nova atrasa a data final.');
    return a;
  }
  // Resumo guardado pelo app (alimenta o Plano da semana).
  function toSaved(p, S, todayIso) {
    return { v: 1, savedAt: todayIso, goal: p.goal, name: p.debt.name, deadline: p.deadline, ok: p.ok, rows: p.rows.map(function (r) { return { ym: r.ym, pay: r.pay }; }) };
  }
  var api = { newSession: newSession, reply: reply, fix: fix, plan: plan, simulate: simulate, neededExtra: neededExtra, parseIntent: parseIntent, parseMoney: parseMoney, actions: actions, toSaved: toSaved, ymLabel: ymLabel, ymShort: ymShort, brl: brl, estimate: estimate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Consultor = api;
})(typeof window !== 'undefined' ? window : this);
