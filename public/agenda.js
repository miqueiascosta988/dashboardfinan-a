/* SM Financial — Agenda financeira (calendário interno) + Assistente + Planos de pagamento.
 * Interface sobre o motor puro finplan.js (todos os valores vêm dele; aqui só há tela, persistência e confirmação do usuário).
 * Dados: state.finEvents / state.finPlans, gravados em fin_events / fin_plans (migration 017). Lembretes só dentro do app.
 */
(function () {
  'use strict';
  var FP = window.FinPlan;
  var AG = { view: 'cal', month: null, chat: [], offers: {}, pendingPlanId: null, busy: false, warned: false, bFilter: 'all' };
  window.AG = AG;
  var S = function () { var s = state; if (!s.finEvents) s.finEvents = []; if (!s.finPlans) s.finPlans = []; return s; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var brl = function (v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var br = function (iso) { return iso ? iso.split('-').reverse().join('/') : '—'; };
  var pad = function (n) { return ('0' + n).slice(-2); };
  function today() { if (window.AG_TODAY) return window.AG_TODAY; var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var STATUS = { a_pagar: ['A pagar', 'ag-st-open'], proximo: ['Vence em breve', 'ag-st-near'], vencido: ['Vencido', 'ag-st-late'], pago: ['Pago', 'ag-st-paid'], cancelado: ['Cancelado', 'ag-st-off'], aguardando: ['Aguardando confirmação', 'ag-st-wait'] };
  var PRIO = { essential: 'Essencial', high: 'Alta', normal: 'Normal', low: 'Baixa' };
  var CATS = ['Moradia', 'Alimentação', 'Saúde', 'Educação', 'Transporte', 'Dívidas', 'Impostos', 'Assinaturas', 'Lazer', 'Salário', 'Outras receitas', 'Outros'];

  // ───────── persistência ─────────
  function toRow(e) {
    return { id: e.id, user_id: currentUser && currentUser.id, key: e.key, plan_id: e.planId || null, kind: e.kind, title: e.title, category: e.category || null, amount: e.amount, due_date: e.dueDate, status: e.status, paid_at: e.paidAt || null, paid_amount: e.paidAmount, priority: e.priority, origin: ['manual', 'plan', 'document', 'debt', 'recurring'].indexOf(e.origin) >= 0 ? e.origin : 'manual', source_ref: e.sourceRef || null, remind_days: e.remindDays || [1], notes: e.notes || null, movable: !!e.movable, user_edited: !!e.userEdited, tx_id: e.txId || null, version: e.version || 1, history: e.history || [] };
  }
  function fromRow(r) {
    return { id: r.id, key: r.key, planId: r.plan_id, kind: r.kind, title: r.title, category: r.category, amount: parseFloat(r.amount), dueDate: String(r.due_date).slice(0, 10), status: r.status, paidAt: r.paid_at ? String(r.paid_at).slice(0, 10) : null, paidAmount: r.paid_amount == null ? null : parseFloat(r.paid_amount), priority: r.priority, origin: r.origin, sourceRef: r.source_ref, remindDays: r.remind_days || [1], notes: r.notes, movable: !!r.movable, userEdited: !!r.user_edited, txId: r.tx_id, version: r.version || 1, history: r.history || [] };
  }
  async function dbSave(table, row) {
    if (!(typeof sb !== 'undefined' && sb && currentUser)) return true;
    try {
      var r = await sb.from(table).upsert(row);
      if (r && r.error) { warn(r.error.message); return false; }
    } catch (e) { warn(String(e)); return false; }
    return true;
  }
  function warn(msg) { console.warn('agenda: não salvou na nuvem:', msg); if (!AG.warned) { AG.warned = true; showToast('A agenda não foi salva na nuvem (rode a migração 017 no Supabase). Ela continua nesta sessão.', 'warning'); } }
  window.agendaLoad = async function () {
    var s = S(); s.finEvents = []; s.finPlans = [];
    if (!(typeof sb !== 'undefined' && sb && currentUser)) return;
    try {
      var a = await sb.from('fin_events').select('*').eq('user_id', currentUser.id).order('due_date', { ascending: true });
      var b = await sb.from('fin_plans').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true });
      if (a.error || b.error) { console.warn('agenda indisponível (migração 017?)', (a.error || b.error).message); return; }
      s.finEvents = (a.data || []).map(fromRow);
      s.finPlans = (b.data || []).map(function (r) { return { id: r.id, strategy: r.strategy, status: r.status, title: r.title, data: r.data || {}, confirmedAt: r.confirmed_at, replacedAt: r.replaced_at }; });
    } catch (e) { console.warn(e); }
  };
  function saveEvent(e) { return dbSave('fin_events', toRow(e)); }
  function savePlan(p) { return dbSave('fin_plans', { id: p.id, user_id: currentUser && currentUser.id, strategy: p.strategy, status: p.status, title: p.title, data: p.data, confirmed_at: p.confirmedAt, replaced_at: p.replacedAt || null }); }
  function nowIso() { return new Date().toISOString(); }

  // ───────── preferências do planejador (essenciais, reserva, saldo) ─────────
  function prefs() { var k = typeof fxKey === 'function' ? fxKey('agenda') : 'agenda'; try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function setPref(name, val) { var p = prefs(); if (val === '' || val == null || isNaN(val)) delete p[name]; else p[name] = val; try { localStorage.setItem(fxKey('agenda'), JSON.stringify(p)); } catch (e) {} prefsPush('agenda', p); }
  window.agPref = function (name, el) { setPref(name, el.value === '' ? null : parseFloat(el.value)); renderCurrentTab(); };

  // ───────── contexto ─────────
  function avgIncome() {
    var by = {}; S().transactions.forEach(function (t) { if (t.type === 'income' && /^\d{4}-\d{2}/.test(String(t.date))) { var m = String(t.date).slice(0, 7); by[m] = (by[m] || 0) + t.amount; } });
    var k = Object.keys(by); return k.length ? k.reduce(function (s, m) { return s + by[m]; }, 0) / k.length : 0;
  }
  function inputs() {
    var s = S(), P = prefs();
    return { today: today(), events: s.finEvents, monthlyIncome: s.monthlyIncome, avgIncome: avgIncome(), openingBalance: P.opening == null ? null : P.opening, reserveMonthly: P.reserve == null ? null : P.reserve, avgEssential: P.essential || 0,
      debts: visibleList('debts').filter(function (d) { return d.saldo > 0; }).map(function (d) { return { id: d.id, name: d.name, saldo: d.saldo, juros: d.juros > 0 ? d.juros : null, mensal: d.mensal, parcelas: d.parcelas }; }) };
  }
  function ctx() { return FP.buildContext(inputs()); }
  function planInputs(cx) {
    var payDay = {}, notes = [];
    cx.debts.forEach(function (d) { var e = cx.pending.filter(function (x) { return x.sourceRef === d.id; })[0]; if (e) payDay[d.id] = FP.parse(e.dueDate).d; });
    return { start: FP.addDays(cx.today, 1), payDay: payDay, offers: AG.offers, reserve: prefs().reserve };
  }

  // ───────── helpers de evento ─────────
  function find(id) { return S().finEvents.filter(function (e) { return e.id === id; })[0]; }
  function view(e) { return FP.statusView(e, today()); }
  function badge(e) { var v = view(e), s = STATUS[v]; return '<span class="ag-badge ' + s[1] + '">' + s[0] + '</span>'; }

  // ───────── render principal ─────────
  window.renderAgenda = function () {
    if (!AG.month) AG.month = today().slice(0, 7);
    var tabs = [['cal', '📅 Calendário'], ['ia', '🤖 Assistente'], ['plans', '🧭 Planos']];
    return agStyle() + '<div class="section-header animate-in"><div><div class="section-title">Agenda &amp; IA</div><div class="section-desc">Seus vencimentos e recebimentos, e um assistente que propõe caminhos para quitar dívidas. Os valores vêm de cálculos verificáveis; nada é inventado.</div></div><div><button class="btn-sm btn-primary-sm" onclick="agEventModal()">+ Novo evento</button></div></div>'
      + '<div class="ag-tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" aria-selected="' + (AG.view === t[0]) + '" class="ag-tab' + (AG.view === t[0] ? ' on' : '') + '" data-agtab="' + t[0] + '" onclick="agView(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('') + '</div>'
      + agKpis() + (AG.view === 'cal' ? agCalendar() : AG.view === 'ia' ? agAssistant() : agPlans());
  };
  window.agView = function (v) { AG.view = v; renderCurrentTab(); };

  function agKpis() {
    var cx = ctx(), a = FP.analyze(cx), inc = cx.income;
    var k = [
      ['Renda do mês', inc.amount > 0 ? brl(inc.amount) : '—', inc.amount > 0 ? 'Recebido ' + brl(inc.confirmed) + ' · previsto ' + brl(inc.expected) + ' · fonte: ' + inc.source : 'Cadastre quando você recebe'],
      ['A pagar no mês', brl(a.pendingMonth), 'Já pago: ' + brl(a.paidMonth) + (a.undatedMonthly > 0 ? ' · +' + brl(a.undatedMonthly) + ' de parcelas sem data (estimativa)' : '')],
      ['Vencidos', String(a.overdue.length), a.overdue.length ? 'Total ' + brl(a.overdue.reduce(function (s, e) { return s + e.amount; }, 0)) + ' · só marco como pago quando você confirmar' : 'Nada vencido'],
      ['Comprometido', a.committedPct == null ? '—' : String(a.committedPct).replace('.', ',') + '%', a.committedPct == null ? 'Falta a renda prevista' : 'Obrigações do mês ÷ renda considerada']
    ];
    return '<div class="kpi-grid mb-24 ag-kpis">' + k.map(function (x, i) { return '<div class="kpi animate-in stagger-' + (i + 1) + '"><div class="kpi-label">' + x[0] + '</div><div class="kpi-value">' + x[1] + '</div><div class="ag-sub">' + esc(x[2]) + '</div></div>'; }).join('') + '</div>';
  }

  // ───────── calendário ─────────
  function agCalendar() {
    var s = S(), y = +AG.month.slice(0, 4), m = +AG.month.slice(5, 7), first = new Date(y, m - 1, 1).getDay(), nd = FP.dim(y, m), t = today();
    var byDay = {}; s.finEvents.forEach(function (e) { if (e.status !== 'cancelled' && FP.ym(e.dueDate) === AG.month) (byDay[e.dueDate] = byDay[e.dueDate] || []).push(e); });
    var cells = '', i, risk = agRiskDays();
    ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(function (d) { cells += '<div class="ag-wd">' + d + '</div>'; });
    for (i = 0; i < first; i++) cells += '<div class="ag-cell ag-empty"></div>';
    for (var d = 1; d <= nd; d++) {
      var iso = y + '-' + pad(m) + '-' + pad(d), ev = byDay[iso] || [];
      cells += '<div class="ag-cell' + (iso === t ? ' ag-today' : '') + (risk[iso] ? ' ag-risk' : '') + '"' + (risk[iso] ? ' title="' + esc(risk[iso]) + '"' : '') + ' data-day="' + iso + '" tabindex="0" role="button" aria-label="Dia ' + d + ', ' + ev.length + ' evento(s)" onclick="agDay(\'' + iso + '\')" onkeydown="if(event.key===\'Enter\')agDay(\'' + iso + '\')"><div class="ag-dn">' + d + '</div>'
        + ev.slice(0, 3).map(function (e) { var v = view(e); return '<div class="ag-chip ' + (e.kind === 'income' ? 'ag-in' : 'ag-' + v) + '" title="' + esc(e.title) + '">' + esc(e.title) + '</div>'; }).join('') + (ev.length > 3 ? '<div class="ag-more">+' + (ev.length - 3) + '</div>' : '') + '</div>';
    }
    var strip = agStrip();
    var up = s.finEvents.filter(function (e) { return e.status !== 'cancelled' && e.status !== 'paid' && e.dueDate >= FP.addDays(t, -60); }).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; }).slice(0, 25);
    var ctxx = ctx(), no = '';
    if (!s.finEvents.length) no = '<div class="ag-empty">Nenhum evento ainda. Use <b>+ Novo evento</b> para cadastrar a data do seu salário, de uma dívida ou de qualquer conta. Você também pode repetir por vários meses.</div>';
    var undated = ctxx.undatedDebts.length ? '<div class="ag-note">Dívidas sem data de vencimento no calendário: ' + ctxx.undatedDebts.map(function (d) { return '<a href="#" onclick="agEventModal({debtId:\'' + d.id + '\'});return false">' + esc(d.name) + '</a>'; }).join(', ') + '. Informe o dia para elas entrarem na linha do tempo.</div>' : '';
    return strip + '<div class="card animate-in"><div class="ag-nav"><button class="btn-sm" aria-label="Mês anterior" onclick="agMonth(-1)">‹</button><div class="card-title" style="margin:0">' + MONTHS[m - 1] + ' de ' + y + '</div><button class="btn-sm" aria-label="Próximo mês" onclick="agMonth(1)">›</button><button class="btn-sm" onclick="agMonth(0)">Hoje</button></div>'
      + '<div class="ag-grid">' + cells + '</div><div class="ag-legend"><span class="ag-chip ag-in">Receita</span><span class="ag-chip ag-a_pagar">A pagar</span><span class="ag-chip ag-proximo">Em breve</span><span class="ag-chip ag-vencido">Vencido</span><span class="ag-chip ag-pago">Pago</span><span class="ag-chip ag-aguardando">Aguardando</span></div></div>'
      + undated + no + '<div class="card animate-in" style="margin-top:16px"><div class="card-title">Próximos e pendentes</div>'
      + (up.length ? '<div class="ag-list">' + up.map(agRow).join('') + '</div>' : '<div class="ag-sub">Nada pendente.</div>') + '</div>';
  }
  function agRiskDays() {   // o assistente marca no calendário os dias que merecem atenção
    var r = {}, a = FP.analyze(ctx());
    a.clusters.forEach(function (c) { for (var d = c.start; d <= c.end; d = FP.addDays(d, 1)) r[d] = 'Vários vencimentos juntos'; });
    a.deficits.forEach(function (x) { r[x.date] = 'Saldo projetado negativo'; });
    return r;
  }
  function agStrip() {
    var cx = ctx(), a = FP.analyze(cx), items = a.risks.slice(0, 2).map(function (x) { return esc(x.text); });
    if (cx.nextIncome && a.beforeNextIncome.length) items.push('Até o próximo recebimento (' + br(cx.nextIncome.dueDate) + ') vencem ' + brl(a.beforeNextIncomeTotal) + '.');
    if (!items.length && !a.questions.length) return '';
    return '<div class="ag-note" id="ag-strip"><b>🤖 Leitura do assistente</b><ul class="ag-ul">' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + (a.questions[0] ? '<li>' + esc(a.questions[0].text) + '</li>' : '') + '</ul><button class="btn-sm" onclick="agView(\'ia\')">Conversar com o assistente</button> <button class="btn-sm" onclick="agView(\'plans\')">Ver opções de plano</button></div>';
  }
  function agRow(e) {
    return '<div class="ag-row" data-ev="' + e.id + '"><div class="ag-rd"><b>' + br(e.dueDate) + '</b></div><div class="ag-rm"><div>' + (e.kind === 'income' ? '💰 ' : '') + esc(e.title) + ' ' + badge(e) + (e.origin === 'plan' ? ' <span class="ag-tag">plano</span>' : '') + '</div><div class="ag-sub">' + esc(e.category || '') + (e.notes ? ' · ' + esc(e.notes) : '') + '</div></div><div class="ag-ra ' + (e.kind === 'income' ? 'ag-pos' : '') + '">' + (e.kind === 'income' ? '+' : '') + brl(e.amount) + '</div><div class="ag-btns">'
      + (e.status === 'paid' ? '<button class="btn-sm" onclick="agUndo(\'' + e.id + '\')">Desfazer</button>' : '<button class="btn-sm btn-primary-sm" onclick="agPayModal(\'' + e.id + '\')">' + (e.kind === 'income' ? 'Recebi' : 'Pagar') + '</button>') + '<button class="btn-sm" onclick="agEventModal({id:\'' + e.id + '\'})">Editar</button></div></div>';
  }
  window.agAskDay = function (iso) { closeModal(); AG.view = 'ia'; var p = iso.split('-'); ask('o que vence dia ' + p[2] + '/' + p[1] + '?'); };
  window.agMonth = function (d) { var y = +AG.month.slice(0, 4), m = +AG.month.slice(5, 7); if (d === 0) AG.month = today().slice(0, 7); else { var x = new Date(y, m - 1 + d, 1); AG.month = x.getFullYear() + '-' + pad(x.getMonth() + 1); } renderCurrentTab(); };
  window.agDay = function (iso) {
    var ev = S().finEvents.filter(function (e) { return e.dueDate === iso && e.status !== 'cancelled'; });
    openModal('Dia ' + br(iso), (ev.length ? '<div class="ag-list">' + ev.map(agRow).join('') + '</div>' : '<div class="ag-sub">Nada neste dia.</div>') + '<div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Fechar</button><button class="btn-cancel" onclick="agAskDay(\'' + iso + '\')">Perguntar ao assistente</button><button class="btn-save" onclick="agEventModal({date:\'' + iso + '\'})">+ Adicionar neste dia</button></div>');
  };

  // ───────── evento: criar / editar ─────────
  window.agEventModal = function (o) {
    o = o || {}; var e = o.id ? find(o.id) : null, debt = o.debtId ? S().debts.filter(function (d) { return d.id === o.debtId; })[0] : null, isE = !!e;
    var v = e || { kind: o.kind || 'payable', title: debt ? 'Parcela ' + debt.name : (o.title || ''), category: debt ? 'Dívidas' : (o.category || ''), amount: debt ? debt.mensal : (o.amount || ''), dueDate: o.date || today(), priority: debt ? 'high' : 'normal', remindDays: [1], notes: '', movable: false, sourceRef: debt ? debt.id : null };
    var rep = o.rep != null ? o.rep : (debt && debt.parcelas > 0 ? debt.parcelas : 1), rd = v.remindDays || [1], debts = visibleList('debts');
    openModal(isE ? 'Editar evento' : 'Novo evento',
      '<div class="form-row"><div class="form-group"><label class="form-label" for="ag-kind">Tipo</label><select class="form-select" id="ag-kind"><option value="payable"' + (v.kind === 'payable' ? ' selected' : '') + '>Conta a pagar</option><option value="income"' + (v.kind === 'income' ? ' selected' : '') + '>Receita (salário ou outro valor)</option></select></div><div class="form-group"><label class="form-label" for="ag-title">Título</label><input class="form-input" id="ag-title" maxlength="120" value="' + esc(v.title) + '"></div></div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label" for="ag-amount">Valor (R$)</label><input class="form-input" type="number" step="0.01" id="ag-amount" value="' + esc(v.amount) + '"></div><div class="form-group"><label class="form-label" for="ag-date">Data</label><input class="form-input" type="date" id="ag-date" value="' + v.dueDate + '"></div></div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label" for="ag-cat">Categoria</label><select class="form-select" id="ag-cat"><option value="">—</option>' + CATS.map(function (c) { return '<option' + (v.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div><div class="form-group"><label class="form-label" for="ag-prio">Prioridade</label><select class="form-select" id="ag-prio">' + Object.keys(PRIO).map(function (k) { return '<option value="' + k + '"' + (v.priority === k ? ' selected' : '') + '>' + PRIO[k] + '</option>'; }).join('') + '</select></div></div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label" for="ag-debt">Vinculada à dívida</label><select class="form-select" id="ag-debt"><option value="">Nenhuma</option>' + debts.map(function (d) { return '<option value="' + d.id + '"' + (v.sourceRef === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select></div>'
      + (isE ? '<div class="form-group"></div>' : '<div class="form-group"><label class="form-label" for="ag-rep">Repetir por quantos meses</label><input class="form-input" type="number" min="1" max="60" id="ag-rep" value="' + rep + '"></div>') + '</div>'
      + '<div class="form-group"><label class="form-label">Lembrar (dentro do app)</label><div class="ag-checks">' + [[0, 'No dia'], [1, '1 dia antes'], [3, '3 dias antes'], [7, '7 dias antes']].map(function (r) { return '<label><input type="checkbox" class="ag-rd" value="' + r[0] + '"' + (rd.indexOf(r[0]) >= 0 ? ' checked' : '') + '> ' + r[1] + '</label>'; }).join('') + '<label>Outro: <input type="number" min="0" max="60" id="ag-rd-x" style="width:64px" value="' + (rd.filter(function (x) { return [0, 1, 3, 7].indexOf(x) < 0; })[0] || '') + '"> dias antes</label></div><div class="ag-sub">Vencidos continuam aparecendo nos alertas até você marcar como pagos.</div></div>'
      + '<div class="form-group"><label class="ag-checks"><input type="checkbox" id="ag-movable"' + (v.movable ? ' checked' : '') + '> Posso pedir ao credor para mudar este vencimento (só marque se isso for verdade)</label></div>'
      + '<div class="form-group"><label class="form-label" for="ag-notes">Observações</label><input class="form-input" id="ag-notes" maxlength="300" value="' + esc(v.notes || '') + '"></div><div id="ag-err" class="ag-err" role="alert"></div>'
      + '<div class="modal-actions">' + (isE && e.status !== 'paid' ? '<button class="btn-danger" onclick="agCancelEvent(\'' + e.id + '\')">Cancelar evento</button>' : '') + '<button class="btn-cancel" onclick="closeModal()">Fechar</button><button class="btn-save" onclick="agSaveEvent(' + (isE ? "'" + e.id + "'" : 'null') + ')">Salvar</button></div>');
  };
  window.agSaveEvent = async function (id) {
    var g = function (x) { return document.getElementById(x); }, s = S();
    var rd = Array.prototype.slice.call(document.querySelectorAll('.ag-rd:checked')).map(function (x) { return +x.value; }), x = g('ag-rd-x').value; if (x !== '' && rd.indexOf(+x) < 0) rd.push(+x);
    var f = { kind: g('ag-kind').value, title: g('ag-title').value.trim(), category: g('ag-cat').value || null, amount: parseFloat(g('ag-amount').value), dueDate: g('ag-date').value, priority: g('ag-prio').value, sourceRef: g('ag-debt').value || null, remindDays: rd.length ? rd : [1], movable: g('ag-movable').checked, notes: g('ag-notes').value.trim() || null };
    var errs = FP.validateEvent(f); if (errs.length) { g('ag-err').textContent = errs.join(' '); return; }
    if (id) {
      var e = find(id); if (!e) return;
      var before = { dueDate: e.dueDate, amount: e.amount }; Object.assign(e, f); e.amount = FP.r2(f.amount); e.userEdited = true; e.version = (e.version || 1) + 1; e.history = FP.pushHistory(e, 'editado', before, nowIso());
      if (e.status === 'paid') { e.history = FP.pushHistory(e, 'editado após pago', null, nowIso()); }
      await saveEvent(e); showToast('Evento atualizado', 'success');
    } else {
      var n = Math.max(1, Math.min(60, parseInt(g('ag-rep').value, 10) || 1)), gid = genId();
      var base = Object.assign({}, f, { origin: n > 1 ? 'recurring' : (f.sourceRef ? 'debt' : 'manual') });
      var list = FP.expandRecurring(base, n, gid), made = [];
      list.forEach(function (o) { o.id = genId(); var ne = FP.newEvent(o, nowIso()); s.finEvents.push(ne); made.push(ne); });
      for (var i = 0; i < made.length; i++) await saveEvent(made[i]);
      showToast(n > 1 ? n + ' eventos criados' : 'Evento criado', 'success');
    }
    closeModal(); renderCurrentTab();
  };
  window.agCancelEvent = async function (id) {
    var e = find(id); if (!e || e.status === 'paid') return; e.status = 'cancelled'; e.version++; e.history = FP.pushHistory(e, 'cancelado', null, nowIso()); await saveEvent(e); closeModal(); renderCurrentTab(); showToast('Evento cancelado (o histórico foi mantido)', 'info');
  };

  // ───────── pagamento manual / histórico ─────────
  window.agPayModal = function (id) {
    var e = find(id); if (!e) return; var inc = e.kind === 'income', debt = e.sourceRef ? S().debts.filter(function (d) { return d.id === e.sourceRef; })[0] : null;
    openModal(inc ? 'Registrar recebimento' : 'Registrar pagamento', '<div class="ag-sub" style="margin-bottom:10px">' + esc(e.title) + ' · vencimento ' + br(e.dueDate) + ' · previsto ' + brl(e.amount) + '</div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label" for="ag-pdate">Data do ' + (inc ? 'recebimento' : 'pagamento') + '</label><input class="form-input" type="date" id="ag-pdate" value="' + today() + '"></div><div class="form-group"><label class="form-label" for="ag-pamt">Valor ' + (inc ? 'recebido' : 'pago') + ' (R$)</label><input class="form-input" type="number" step="0.01" id="ag-pamt" value="' + e.amount + '"></div></div>'
      + '<div class="ag-checks"><label><input type="checkbox" id="ag-ptx" checked> Lançar em ' + (inc ? 'Renda' : 'Despesas') + ' (sem duplicar se já existir)</label>' + (debt && !inc ? '<label><input type="checkbox" id="ag-pdebt" checked> Abater da dívida "' + esc(debt.name) + '" (estimativa: juros do período saem primeiro)</label>' : '') + '</div><div id="ag-err" class="ag-err" role="alert"></div>'
      + '<div class="modal-actions"><button class="btn-cancel" onclick="agAwait(\'' + id + '\')">Marcar como aguardando confirmação</button><button class="btn-save" onclick="agPay(\'' + id + '\')">Confirmar</button></div>');
  };
  window.agAwait = async function (id) { var e = find(id); if (!e) return; e.status = 'awaiting'; e.version++; e.history = FP.pushHistory(e, 'aguardando confirmação', null, nowIso()); await saveEvent(e); closeModal(); renderCurrentTab(); };
  window.agPay = async function (id) {
    var e = find(id); if (!e || e.status === 'paid') { closeModal(); return; }
    var date = document.getElementById('ag-pdate').value, amt = parseFloat(document.getElementById('ag-pamt').value);
    if (!FP.valid(date) || !(amt > 0)) { document.getElementById('ag-err').textContent = 'Informe uma data válida e um valor maior que zero.'; return; }
    var s = S(), info = { date: date, amount: amt }, extra = {};
    if (document.getElementById('ag-ptx') && document.getElementById('ag-ptx').checked) {
      var type = e.kind === 'income' ? 'income' : 'expense', dup = s.transactions.filter(function (t) { return t.type === type && Math.abs(t.amount - amt) < 0.01 && String(t.date).slice(0, 10) === date; })[0];
      if (dup) { extra.linkedTx = dup.id; showToast('Já existe um lançamento desse valor nessa data: vinculei, sem duplicar.', 'info'); }
      else { var t = { id: genId(), date: date, desc: e.title, cat: e.category || (type === 'income' ? 'Outras receitas' : 'Outros'), amount: FP.r2(amt), type: type, recur: false, profile: s.profile_type }; s.transactions.push(t); docTxPersist(t); extra.txId = t.id; }
    }
    if (document.getElementById('ag-pdebt') && document.getElementById('ag-pdebt').checked) {
      var d = s.debts.filter(function (z) { return z.id === e.sourceRef; })[0];
      if (d) { var r = FP.debtAfterPayment(d, amt); extra.debtUndo = { saldo: d.saldo, parcelas: d.parcelas }; d.saldo = r.saldo; d.parcelas = r.parcelas; dbUpsert('debts', { id: d.id, user_id: currentUser && currentUser.id, name: d.name, type: d.type, balance: d.saldo, interest_rate: d.juros, installments: d.parcelas || null, monthly_payment: d.mensal, profile: d.profile }); extra.debtEstimated = true; }
    }
    var p = FP.markPaid(e, info, nowIso()); Object.assign(e, p.event); if (extra.txId) e.txId = extra.txId;
    e.history = FP.pushHistory(e, 'pago', Object.assign({ date: date, amount: amt }, extra), nowIso());
    await saveEvent(e); closeModal(); renderCurrentTab(); showToast((e.kind === 'income' ? 'Recebimento' : 'Pagamento') + ' registrado' + (extra.debtEstimated ? ' · saldo da dívida atualizado (estimativa)' : ''), 'success');
  };
  window.agUndo = async function (id) {
    var e = find(id); if (!e || e.status !== 'paid') return; var s = S(), last = (e.history || []).filter(function (h) { return h.action === 'pago'; }).pop(), info = (last && last.info) || {};
    if (e.txId) { s.transactions = s.transactions.filter(function (t) { return t.id !== e.txId; }); dbDelete('transactions', e.txId); e.txId = null; }
    if (info.debtUndo) { var d = s.debts.filter(function (z) { return z.id === e.sourceRef; })[0]; if (d) { d.saldo = info.debtUndo.saldo; d.parcelas = info.debtUndo.parcelas; dbUpsert('debts', { id: d.id, user_id: currentUser && currentUser.id, name: d.name, type: d.type, balance: d.saldo, interest_rate: d.juros, installments: d.parcelas || null, monthly_payment: d.mensal, profile: d.profile }); } }
    e.status = 'pending'; e.paidAt = null; e.paidAmount = null; e.version++; e.history = FP.pushHistory(e, 'pagamento desfeito', null, nowIso()); await saveEvent(e); closeModal(); renderCurrentTab(); showToast('Pagamento desfeito', 'info');
  };

  // ───────── assistente ─────────
  var SUGG = ['Como está minha situação neste mês?', 'Quais contas vencem antes de eu receber?', 'Qual conta pagar primeiro?', 'Quanto da minha renda está comprometida?', 'Como distribuir melhor meus pagamentos?', 'O que acontece se eu parcelar em 12x a 2,5% ao mês?'];
  function agAssistant() {
    var cx = ctx(), a = FP.analyze(cx);
    var risks = a.risks.length ? '<ul class="ag-ul">' + a.risks.map(function (r) { return '<li class="ag-r-' + r.level + '">' + esc(r.text) + '</li>'; }).join('') + '</ul>' : '<div class="ag-sub">Nenhum alerta com os dados atuais.</div>';
    var qs = a.questions.length ? '<div class="ag-q"><b>Preciso saber</b>' + a.questions.slice(0, 5).map(function (q) { return '<div class="ag-qrow">' + esc(q.text) + ' <button class="btn-sm" onclick="agAnswerQ(\'' + q.id + '\')">Informar</button></div>'; }).join('') + '</div>' : '';
    var chat = AG.chat.map(function (m) { return '<div class="ag-msg ag-' + m.role + '"><div>' + esc(m.text).replace(/\n/g, '<br>') + '</div>' + (m.actions || []).map(function (x) { return '<button class="btn-sm" onclick="agAct(\'' + x.action.replace(/'/g, '') + '\')">' + esc(x.label) + '</button>'; }).join(' ') + '</div>'; }).join('');
    return '<div class="card animate-in"><div class="card-title">Leitura da sua situação</div>' + risks + (a.notes || []).map(function (n) { return '<div class="ag-note">' + esc(n) + '</div>'; }).join('') + qs + '</div>'
      + '<div class="card animate-in" style="margin-top:16px"><div class="card-title">Pergunte ao assistente</div><div class="ag-sub">Motor próprio, sem enviar seus dados a nenhum serviço externo: ele só usa o que está cadastrado e diz quando faltar algo.</div><div class="ag-chat" id="ag-chat" aria-live="polite">' + (chat || '<div class="ag-sub">Escolha uma pergunta ou escreva a sua.</div>') + '</div>'
      + '<div class="ag-suggest">' + SUGG.map(function (q, i) { return '<button class="btn-sm" onclick="agAsk(' + i + ')">' + esc(q) + '</button>'; }).join('') + '</div>'
      + '<form class="ag-ask" onsubmit="agSubmit(event)"><input class="form-input" id="ag-q" placeholder="Ex.: o que vence antes de eu receber?" aria-label="Pergunta ao assistente" autocomplete="off"><button class="btn-save" type="submit">Perguntar</button></form></div>';
  }
  var nrm = function (x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
  function money(q) { var m = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/.exec(q.replace(/dia\s+\d{1,2}(\/\d{1,2})?/, '')); return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null; }
  function dayIso(q) { var m = /dia\s+(\d{1,2})(?:\/(\d{1,2}))?/.exec(q); if (!m) return null; var t = today(), y = +t.slice(0, 4), mo = m[2] ? +m[2] : +t.slice(5, 7), iso = y + '-' + pad(mo) + '-' + pad(+m[1]); return FP.valid(iso) ? iso : null; }
  function command(q, cx) {   // o assistente age no calendário, mas só abre o formulário já preenchido: quem confirma é você
    var n = nrm(q), ev, pg = /^(ja )?(paguei|pago|quitei|recebi)\b\s*(.*)$/.exec(n);
    if (pg) {
      var key = pg[3].replace(/\b(a|o|as|os|de|da|do|minha|meu|conta|parcela)\b/g, '').trim().split(/\s+/)[0] || '';
      ev = key.length > 2 ? cx.pending.filter(function (e) { return nrm(e.title).indexOf(key) >= 0; }).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; })[0] : null;
      if (!ev) return { text: 'Não achei no calendário um compromisso pendente com esse nome. Diga o nome como está na agenda ou cadastre-o.', actions: [{ label: 'Abrir calendário', action: 'calendar' }] };
      return { text: 'Encontrei "' + ev.title + '" de ' + brl(ev.amount) + ' (vence ' + br(ev.dueDate) + '). Abri o registro para você confirmar a data e o valor. Não marco nada como pago sozinho.', actions: [{ label: 'Registrar agora', action: 'pay:' + ev.id }], open: 'pay:' + ev.id };
    }
    var add = /^(adicionar|adicione|lancar|lance|cadastrar|cadastre|criar|crie|agendar|agende)\b(.*)$/.exec(n);
    if (add) {
      var rest = add[2], inc = /salario|receita|recebimento|renda|pix|entrada/.test(rest), v = money(rest), d = dayIso(rest);
      var name = inc ? (/salario/.test(rest) ? 'Salário' : 'Receita') : rest.replace(/dia\s+\d{1,2}(\/\d{1,2})?/, '').replace(/r\$\s*[\d.,]+|[\d.,]+/g, '').replace(/\b(uma|um|a|o|de|da|do|conta|pagamento|para|no|na|valor|reais)\b/g, '').replace(/\s+/g, ' ').trim();
      name = name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
      var o = { kind: inc ? 'income' : 'payable', title: name, amount: v || '', date: d || today(), category: inc ? 'Salário' : '' };
      return { text: 'Preparei ' + (inc ? 'a receita' : 'a conta') + (name ? ' "' + name + '"' : '') + (v ? ' de ' + brl(v) : '') + (d ? ' para ' + br(d) : '') + '. Confira o formulário e salve' + (v && d ? '.' : '; faltou ' + (!v && !d ? 'valor e data' : !v ? 'o valor' : 'a data') + ', deixei para você preencher.') + ' Só entra no calendário quando você salvar.', actions: [], open: o };
    }
    var dm = /(?:dia|em)\s+(\d{1,2})\/(\d{1,2})/.exec(n);
    if (dm && /(vence|tem|o que)/.test(n)) {
      var iso = today().slice(0, 4) + '-' + pad(+dm[2]) + '-' + pad(+dm[1]);
      if (!FP.valid(iso)) return { text: 'Essa data não é válida.', actions: [] };
      var day = cx.events.filter(function (e) { return e.dueDate === iso && e.status !== 'cancelled'; });
      if (!day.length) return { text: 'Não há nada cadastrado para ' + br(iso) + '.', actions: [{ label: 'Adicionar neste dia', action: 'newday:' + iso }] };
      var tl = FP.timeline(cx, cx.today, iso), dd = tl.days.filter(function (x) { return x.date === iso; })[0];
      return { text: 'Em ' + br(iso) + ':\n' + day.map(function (e) { return '• ' + (e.kind === 'income' ? 'recebe ' : 'paga ') + e.title + ' ' + brl(e.amount) + ' (' + STATUS[view(e)][0] + ')'; }).join('\n') + (dd ? '\nSaldo projetado ao fim do dia: ' + brl(dd.after) + (tl.relative ? ' (relativo, sem o saldo do seu banco)' : '') + '.' : ''), actions: [{ label: 'Ver no calendário', action: 'month:' + iso.slice(0, 7) }] };
    }
    return null;
  }
  function ask(q) { var cx = ctx(); AG.chat.push({ role: 'user', text: q }); var cmd = command(q, cx), r = cmd || FP.answer(q, cx, planInputs(cx));
 AG.chat.push({ role: 'ai', text: r.text, actions: r.actions }); if (AG.chat.length > 40) AG.chat = AG.chat.slice(-40); renderCurrentTab(); var c = document.getElementById('ag-chat'); if (c) c.scrollTop = c.scrollHeight; if (r.open) { if (typeof r.open === 'string') agAct(r.open); else agEventModal(r.open); } }
  window.agAsk = function (i) { ask(SUGG[i]); };
  window.agSubmit = function (ev) { ev.preventDefault(); var v = document.getElementById('ag-q').value.trim(); if (v) ask(v); };
  window.agAnswerQ = function (id) {
    if (id === 'renda' || id === 'data_renda') return agEventModal({ kind: 'income', title: 'Salário', category: 'Salário', amount: S().monthlyIncome || '', rep: 12 });
    if (id.indexOf('venc_') === 0) return agEventModal({ debtId: id.slice(5) });
    if (id.indexOf('juros_') === 0) { var d = S().debts.filter(function (z) { return z.id === id.slice(6); })[0]; if (d) return openDebtModal(d); }
  };
  window.agAct = function (a) {
    if (a === 'plans') return agView('plans'); if (a === 'calendar') return agView('cal'); if (a === 'debts') return switchTab('dividas');
    if (a.indexOf('plan:') === 0) { AG.view = 'plans'; renderCurrentTab(); var el = document.getElementById('ag-plan-' + a.slice(5)); if (el) el.scrollIntoView({ block: 'center' }); return; }
    if (a.indexOf('event:') === 0) return agEventModal({ id: a.slice(6) });
    if (a.indexOf('pay:') === 0) return agPayModal(a.slice(4));
    if (a.indexOf('newday:') === 0) return agEventModal({ date: a.slice(7) });
    if (a.indexOf('month:') === 0) { AG.month = a.slice(6); return agView('cal'); }
    if (a.indexOf('offer:') === 0) { var p = a.split(':'); AG.offers[p[1]] = { parcelas: +p[2], juros: +p[3] }; return agView('plans'); }
  };

  // ───────── planos ─────────
  function planCard(p, active) {
    var m = p.metrics || {}, ok = p.feasible, isA = active && active.strategy === p.strategy;
    var line = [];
    if (ok && p.strategy !== 'distribuir') {
      line.push(['Pagamento mensal', m.monthlyCommitment != null ? brl(m.monthlyCommitment) : '—']);
      line.push(['Total a pagar', m.totalPaid != null ? brl(m.totalPaid) : '—']);
      line.push(['Juros totais', m.totalInterest != null ? brl(m.totalInterest) : 'não calculável (falta taxa)']);
      line.push(['Término', m.endDate ? br(m.endDate) + ' (' + m.months + ' meses)' : '—']);
      if (m.savedInterest != null) line.push(['Economia de juros vs. só o mínimo', brl(m.savedInterest)]);
      if (m.monthlyDelta != null) line.push(['Mudança na parcela mensal', (m.monthlyDelta <= 0 ? '−' : '+') + brl(Math.abs(m.monthlyDelta))]);
      if (m.totalDelta != null) line.push(['Mudança no custo total', (m.totalDelta <= 0 ? '−' : '+') + brl(Math.abs(m.totalDelta))]);
      if (m.leftAfterReserve != null) line.push(['Sobra mensal projetada após a reserva', brl(m.leftAfterReserve)]);
    }
    if (ok && p.strategy === 'distribuir') { line.push(['Vencimentos que podem mudar', String(m.moved)]); line.push(['Vence antes de receber: hoje → depois', brl(m.beforeNextIncomeBefore) + ' → ' + brl(m.beforeNextIncomeAfter)]); line.push(['Dias com saldo negativo: hoje → depois', m.deficitsBefore + ' → ' + m.deficitsAfter]); }
    var li = function (arr) { return arr.length ? '<ul class="ag-ul">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; };
    return '<div class="card ag-plan' + (isA ? ' ag-active' : '') + '" id="ag-plan-' + p.id + '" data-plan="' + p.id + '"><div class="ag-ph"><div><b>Opção ' + p.id + ' · ' + esc(p.title) + '</b>' + (isA ? ' <span class="ag-tag">plano ativo</span>' : '') + '</div><span class="ag-tag">estimativa</span></div><div class="ag-sub">' + esc(p.description) + '</div>'
      + (ok ? '<div class="ag-mets">' + line.map(function (x) { return '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' : '<div class="ag-note">Não dá para montar esta opção ainda: ' + esc(p.blockers.join(' ')) + '</div>')
      + (p.pros.length ? '<div class="ag-sub"><b>Vantagens</b></div>' + li(p.pros) : '') + (p.cons.length ? '<div class="ag-sub"><b>Riscos e desvantagens</b></div>' + li(p.cons) : '')
      + (p.assumptions.length ? '<div class="ag-sub"><b>Premissas</b></div>' + li(p.assumptions) : '') + (p.missing.length ? '<div class="ag-sub"><b>Informações que faltam</b></div>' + li(p.missing) : '')
      + (ok ? '<div class="ag-btns" style="margin-top:10px">' + (p.strategy === 'distribuir' && !m.moved ? '' : '<button class="btn-save" onclick="agPlanConfirm(\'' + p.id + '\')">' + (isA ? 'Recalcular e reaplicar' : 'Escolher este plano') + '</button>') + '</div>' : '') + '</div>';
  }
  function agPlans() {
    var s = S(), cx = ctx(), P = prefs(), r = FP.generatePlans(cx, planInputs(cx)), active = s.finPlans.filter(function (p) { return p.status === 'active'; })[0];
    var debts = cx.debts, off = AG.offers;
    var offerForm = '<div class="ag-offer"><b>Tenho uma proposta de renegociação</b><div class="ag-sub">Só informe o que o credor realmente ofereceu. Sem isso a opção C fica desativada.</div>' + (debts.length ? '<div class="ag-ask"><select class="form-select" id="ag-od">' + debts.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('') + '</select><input class="form-input" id="ag-on" type="number" min="2" max="120" placeholder="nº de parcelas"><input class="form-input" id="ag-oj" type="number" step="0.01" min="0" placeholder="juros % a.m."><input class="form-input" id="ag-op" type="number" step="0.01" min="0" placeholder="ou valor da parcela"><button class="btn-sm btn-primary-sm" onclick="agOffer()">Comparar</button></div>' : '<div class="ag-sub">Cadastre uma dívida primeiro.</div>')
      + Object.keys(off).map(function (id) { var d = debts.filter(function (x) { return x.id === id; })[0]; return d ? '<div class="ag-sub">Proposta informada para ' + esc(d.name) + ': ' + off[id].parcelas + 'x' + (off[id].parcela ? ' de ' + brl(off[id].parcela) : ' a ' + off[id].juros + '% a.m.') + ' <a href="#" onclick="agOfferDel(\'' + id + '\');return false">remover</a></div>' : ''; }).join('') + '</div>';
    var inputsF = '<div class="ag-ask"><label class="ag-lbl">Gastos essenciais por mês (R$)<input class="form-input" type="number" step="0.01" value="' + (P.essential == null ? '' : P.essential) + '" onchange="agPref(\'essential\',this)"></label><label class="ag-lbl">Reserva por mês (R$)<input class="form-input" type="number" step="0.01" value="' + (P.reserve == null ? '' : P.reserve) + '" onchange="agPref(\'reserve\',this)"></label><label class="ag-lbl">Saldo atual na conta (R$, opcional)<input class="form-input" type="number" step="0.01" value="' + (P.opening == null ? '' : P.opening) + '" onchange="agPref(\'opening\',this)"></label></div>';
    var banner = active ? '<div class="ag-note ag-active-b">Plano ativo: <b>' + esc(active.title) + '</b> (desde ' + br(String(active.confirmedAt).slice(0, 10)) + '). Ao escolher outro, o histórico é preservado: o que já foi pago não é apagado.<button class="btn-sm" onclick="agPlanCancel()" style="margin-left:8px">Cancelar plano</button></div>' : '';
    return banner + '<div class="card animate-in"><div class="card-title">Dados usados nos cálculos</div>' + inputsF + '<div class="ag-sub">Folga mensal estimada: <b>' + (r.surplus == null ? 'indeterminada (falta a renda)' : brl(r.surplus)) + '</b> = renda − essenciais − parcelas mínimas − reserva. Sem saldo informado, o saldo da linha do tempo é relativo (não é o do seu banco).</div></div>'
      + '<div class="card animate-in" style="margin-top:16px">' + offerForm + '</div>'
      + '<div class="ag-plans" style="margin-top:16px">' + r.plans.map(function (p) { return planCard(p, active); }).join('') + '</div><div class="ag-sub" style="margin-top:12px">Simulações com os dados cadastrados. Não consideram multas, tarifas ou mudanças de taxa, e não presumem que o credor aceite renegociar ou mudar datas. Decisão sempre sua.</div>';
  }
  window.agOffer = function () {
    var id = document.getElementById('ag-od').value, n = parseInt(document.getElementById('ag-on').value, 10), j = parseFloat(document.getElementById('ag-oj').value), p = parseFloat(document.getElementById('ag-op').value);
    if (!(n >= 2) || (!(p > 0) && !(j >= 0))) { showToast('Informe o número de parcelas e a taxa ou o valor da parcela.', 'warning'); return; }
    AG.offers[id] = { parcelas: n, juros: j >= 0 ? j : 0, parcela: p > 0 ? p : 0 }; renderCurrentTab();
  };
  window.agOfferDel = function (id) { delete AG.offers[id]; renderCurrentTab(); };

  function planById(id) { var cx = ctx(); return FP.generatePlans(cx, planInputs(cx)).plans.filter(function (p) { return p.id === id; })[0]; }
  function diff(plan, pid, active) {
    var s = S(), proposed = FP.planToEvents(plan, pid), rec = FP.reconcilePlan(s.finEvents, proposed, active && active.id), moves = plan.payments.filter(function (p) { return p.move; });
    return { proposed: proposed, rec: rec, moves: moves };
  }
  window.agPlanConfirm = function (id) {
    var plan = planById(id); if (!plan || !plan.feasible) return; var active = S().finPlans.filter(function (p) { return p.status === 'active'; })[0];
    AG.pendingPlanId = genId(); var d = diff(plan, AG.pendingPlanId, active), r = d.rec;
    var warn = [];
    if (r.keepPaid.length) warn.push(r.keepPaid.length + ' pagamento(s) já feito(s) do plano anterior serão mantidos no histórico.');
    if (r.cancel.length) warn.push(r.cancel.length + ' evento(s) pendente(s) do plano anterior serão cancelados (continuam no histórico).');
    r.conflicts.forEach(function (c) { warn.push(c.edited ? 'Você editou "' + c.existing.title + '" (' + br(c.existing.dueDate) + '): vou manter do jeito que você deixou.' : 'Já existe "' + c.existing.title + '" em ' + br(c.existing.dueDate) + (c.paid ? ' (pago)' : '') + ' para a mesma dívida e mês: mantenho o existente e não crio o novo.'); });
    openModal('Confirmar opção ' + plan.id, '<div class="ag-sub"><b>' + esc(plan.title) + '</b>. Nada é criado até você confirmar.</div><ul class="ag-ul"><li>Criar <b>' + r.create.length + '</b> evento(s) no calendário' + (d.moves.length ? '' : '') + '</li>' + (d.moves.length ? '<li>Mudar a data de <b>' + d.moves.length + '</b> vencimento(s) que você marcou como alteráveis (só vale se o credor aceitar)</li>' : '') + '<li>' + r.skip.length + ' já existem (não duplico)</li></ul>'
      + (warn.length ? '<div class="ag-note"><b>Atenção</b><ul class="ag-ul">' + warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : '') + '<div class="ag-sub">Estimativa com as premissas mostradas. Nenhum pagamento é feito automaticamente: você confirma cada um quando pagar.</div>'
      + '<div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Voltar</button><button class="btn-save" id="ag-confirm" onclick="agPlanApply(\'' + id + '\')">Confirmar plano</button></div>');
  };
  window.agPlanApply = async function (id) {
    if (AG.busy) return; var s = S(), pid = AG.pendingPlanId; if (!pid || s.finPlans.some(function (p) { return p.id === pid; })) { closeModal(); return; }   // idempotente: confirmar duas vezes não duplica
    AG.busy = true;
    try {
      var plan = planById(id), active = s.finPlans.filter(function (p) { return p.status === 'active'; })[0], d = diff(plan, pid, active), r = d.rec, ts = nowIso();
      if (active) { active.status = 'replaced'; active.replacedAt = ts; await savePlan(active); }
      var np = { id: pid, strategy: plan.strategy, status: 'active', title: 'Opção ' + plan.id + ' · ' + plan.title, confirmedAt: ts, data: { option: plan.id, metrics: plan.metrics, assumptions: plan.assumptions, missing: plan.missing, params: { essential: prefs().essential || null, reserve: prefs().reserve || null, offers: AG.offers } } };
      s.finPlans.push(np); await savePlan(np);
      for (var i = 0; i < r.cancel.length; i++) { var c = r.cancel[i]; c.status = 'cancelled'; c.version++; c.history = FP.pushHistory(c, 'cancelado: plano trocado', { to: pid }, ts); await saveEvent(c); }
      for (var j = 0; j < r.create.length; j++) { var o = r.create[j]; o.id = genId(); o.planId = pid; var ne = FP.newEvent(o, ts); s.finEvents.push(ne); await saveEvent(ne); }
      for (var k = 0; k < d.moves.length; k++) { var mv = d.moves[k], ev = find(mv.eventId); if (ev && ev.status !== 'paid') { var old = ev.dueDate; ev.dueDate = mv.date; ev.version++; ev.planId = pid; ev.history = FP.pushHistory(ev, 'data alterada pelo plano', { from: old, to: mv.date }, ts); await saveEvent(ev); } }
      closeModal(); renderCurrentTab(); showToast('Plano confirmado: ' + r.create.length + ' evento(s) criado(s)' + (r.cancel.length ? ', ' + r.cancel.length + ' cancelado(s)' : '') + (r.keepPaid.length ? ', ' + r.keepPaid.length + ' pago(s) mantido(s)' : ''), 'success');
    } finally { AG.busy = false; AG.pendingPlanId = null; }
  };
  window.agPlanCancel = function () {
    var s = S(), a = s.finPlans.filter(function (p) { return p.status === 'active'; })[0]; if (!a) return;
    var pend = s.finEvents.filter(function (e) { return e.planId === a.id && (e.status === 'pending' || e.status === 'awaiting') && !e.userEdited; }).length, paid = s.finEvents.filter(function (e) { return e.planId === a.id && e.status === 'paid'; }).length;
    openModal('Cancelar o plano ativo?', '<div class="ag-sub">Serão cancelados ' + pend + ' evento(s) pendente(s) ainda não editados por você. ' + paid + ' pagamento(s) já feito(s) continuam no histórico.</div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Voltar</button><button class="btn-danger" onclick="agPlanCancelDo()">Cancelar plano</button></div>');
  };
  window.agPlanCancelDo = async function () {
    var s = S(), a = s.finPlans.filter(function (p) { return p.status === 'active'; })[0]; if (!a) return closeModal(); var ts = nowIso();
    a.status = 'cancelled'; a.replacedAt = ts; await savePlan(a);
    for (var i = 0; i < s.finEvents.length; i++) { var e = s.finEvents[i]; if (e.planId === a.id && (e.status === 'pending' || e.status === 'awaiting') && !e.userEdited) { e.status = 'cancelled'; e.version++; e.history = FP.pushHistory(e, 'cancelado: plano cancelado', null, ts); await saveEvent(e); } }
    closeModal(); renderCurrentTab(); showToast('Plano cancelado; o histórico foi mantido', 'info');
  };

  // ───────── painel / lembretes ─────────
  window.agendaCard = function () {
    var s = S(); if (!s.finEvents.length) return '';
    var cx = ctx(), a = FP.analyze(cx), up = cx.overdue.concat(cx.upcoming).slice(0, 4);
    return '<div class="card mb-24 animate-in" id="ag-dash"><div class="ag-ph"><div class="card-title" style="margin:0">📅 Agenda financeira</div><button class="btn-sm" onclick="switchTab(\'agenda\')">Abrir</button></div><div class="ag-mets"><div><span>Renda do mês (' + esc(cx.income.source) + ')</span><b>' + (cx.income.amount > 0 ? brl(cx.income.amount) : '—') + '</b></div><div><span>Recebido / previsto</span><b>' + brl(cx.income.confirmed) + ' / ' + brl(cx.income.expected) + '</b></div><div><span>A pagar no mês</span><b>' + brl(a.pendingMonth) + '</b></div>' + (a.overdue.length ? '<div><span>Vencidos</span><b style="color:var(--expense)">' + a.overdue.length + '</b></div>' : '') + '</div>'
      + (up.length ? '<div class="ag-list" style="margin-top:8px">' + up.map(function (e) { return '<div class="ag-row"><div class="ag-rd"><b>' + br(e.dueDate) + '</b></div><div class="ag-rm">' + esc(e.title) + ' ' + badge(e) + '</div><div class="ag-ra">' + brl(e.amount) + '</div></div>'; }).join('') + '</div>' : '<div class="ag-sub">Nada pendente nos próximos dias.</div>') + '</div>';
  };
  window.agendaNotifs = function () {
    try {
      return FP.dueReminders(S().finEvents, today(), [1]).map(function (r) {
        return { id: r.id, icon: r.level === 'danger' ? '🚨' : '🔔', title: r.event.title, desc: (r.daysLeft < 0 ? 'Vencido há ' + (-r.daysLeft) + ' dia(s)' : r.daysLeft === 0 ? 'Vence hoje' : 'Vence em ' + r.daysLeft + ' dia(s)') + ' · ' + br(r.event.dueDate), type: r.level === 'danger' ? 'danger' : 'warning', time: 'Agenda', tab: 'agenda' };
      });
    } catch (e) { return []; }
  };

  function agStyle() {
    if (document.getElementById('ag-style')) return '';
    return '<style id="ag-style">.ag-tabs{display:flex;gap:8px;margin:0 0 16px;flex-wrap:wrap}.ag-tab{padding:8px 14px;border-radius:999px;border:1px solid var(--border,#ddd);background:var(--card,#fff);color:inherit;cursor:pointer;font:inherit}.ag-tab.on{background:var(--teal,#0f766e);color:#fff;border-color:transparent}.ag-sub{font-size:12px;opacity:.75;margin-top:4px}.ag-kpis .kpi-value{font-size:22px}'
      + '.ag-nav{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:12px}.ag-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.ag-wd{text-align:center;font-size:11px;opacity:.7;padding:4px 0}.ag-cell{min-height:74px;border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:4px;cursor:pointer;overflow:hidden;background:var(--card-alt,transparent)}.ag-cell.ag-empty{border:none;background:none;cursor:default}.ag-cell.ag-today{outline:2px solid var(--teal,#0f766e)}.ag-dn{font-size:11px;font-weight:700;opacity:.8}'
      + '.ag-chip{font-size:10px;padding:1px 5px;border-radius:5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;background:#e5e7eb;color:#111}.ag-in{background:#bbf7d0;color:#14532d}.ag-vencido{background:#fecaca;color:#7f1d1d}.ag-proximo{background:#fde68a;color:#78350f}.ag-a_pagar{background:#dbeafe;color:#1e3a8a}.ag-pago{background:#e5e7eb;color:#4b5563;text-decoration:line-through}.ag-aguardando{background:#ede9fe;color:#4c1d95}.ag-risk{outline:2px dashed #dc2626}.ag-more{font-size:10px;opacity:.7}.ag-legend{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.ag-legend .ag-chip{display:inline-block}'
      + '.ag-list{display:flex;flex-direction:column;gap:6px}.ag-row{display:grid;grid-template-columns:78px 1fr auto auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border,#eee)}.ag-ra{font-weight:700;white-space:nowrap}.ag-pos{color:#15803d}.ag-btns{display:flex;gap:6px}.ag-badge{font-size:10px;padding:2px 7px;border-radius:999px;font-weight:700}.ag-st-open{background:#dbeafe;color:#1e3a8a}.ag-st-near{background:#fde68a;color:#78350f}.ag-st-late{background:#fecaca;color:#7f1d1d}.ag-st-paid{background:#d1fae5;color:#065f46}.ag-st-off{background:#e5e7eb;color:#4b5563}.ag-st-wait{background:#ede9fe;color:#4c1d95}.ag-tag{font-size:10px;border:1px solid currentColor;border-radius:999px;padding:1px 6px;opacity:.75}'
      + '.ag-note{margin:10px 0;padding:10px 12px;border-radius:8px;background:var(--card-alt,#f3f4f6);font-size:13px}.ag-active-b{border-left:3px solid var(--teal,#0f766e)}.ag-empty{padding:16px;text-align:center;opacity:.8}.ag-err{color:#b91c1c;font-size:13px;min-height:18px}.ag-checks{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:13px}.ag-ul{margin:6px 0 6px 18px;font-size:13px}.ag-r-alto{color:#b91c1c}.ag-r-medio{color:#b45309}'
      + '.ag-chat{max-height:320px;overflow:auto;margin:10px 0;display:flex;flex-direction:column;gap:8px}.ag-msg{padding:8px 12px;border-radius:12px;max-width:92%;font-size:14px}.ag-user{align-self:flex-end;background:var(--teal,#0f766e);color:#fff}.ag-ai{align-self:flex-start;background:var(--card-alt,#f3f4f6)}.ag-suggest{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.ag-ask{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.ag-ask .form-input,.ag-ask .form-select{flex:1;min-width:120px}.ag-lbl{display:flex;flex-direction:column;font-size:12px;gap:4px;flex:1;min-width:150px}.ag-q{margin-top:10px}.ag-qrow{margin:6px 0;font-size:13px}'
      + '.ag-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}.ag-ph{display:flex;justify-content:space-between;align-items:center;gap:8px}.ag-mets{display:grid;gap:4px;margin:10px 0}.ag-mets div{display:flex;justify-content:space-between;gap:10px;font-size:13px;border-bottom:1px dashed var(--border,#e5e7eb);padding:3px 0}.ag-active{border:2px solid var(--teal,#0f766e)}.ag-offer{font-size:14px}'
      + '@media(max-width:640px){.ag-cell{min-height:56px}.ag-chip{font-size:9px}.ag-row{grid-template-columns:1fr auto}.ag-rd{grid-column:1/-1}}</style>';
  }
})();
