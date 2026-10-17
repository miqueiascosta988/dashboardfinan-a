/* SM Financial — Plano da semana: cartão do Início. A lógica está em weekplan.js; aqui só há tela e o "feito" do cliente. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var brl = function (v) { return 'R$ ' + Math.round(+v || 0).toLocaleString('pt-BR'); };
  var br = function (iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; };
  function todayISO() { if (window.AG_TODAY) return window.AG_TODAY; var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function key() { return typeof fxKey === 'function' ? fxKey('wk') : 'financa-wk'; }

  function input() {
    var L = function (k) { try { return visibleList(k); } catch (e) { return state[k] || []; } };
    var ev = (state.finEvents || []).filter(function (e) { try { return window.agendaEvProfile ? window.agendaEvProfile(e) === state.profile_type : true; } catch (x) { return true; } });
    var strategy = null; try { strategy = (window.PREFS && PREFS.data && PREFS.data.estr) || JSON.parse(localStorage.getItem(typeof fxKey === 'function' ? fxKey('estr') : 'financa-estr') || 'null'); } catch (e) {}
    return { strategy: strategy, today: todayISO(), transactions: L('transactions'), debts: L('debts'), goals: L('goals'), subscriptions: L('subscriptions'), events: ev };
  }
  function saved() {
    var s = null;
    try { s = (window.PREFS && PREFS.data && PREFS.data.wk) || JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) {}
    return s && s.week && Array.isArray(s.done) ? s : { week: null, done: [] };
  }
  function doneIds(week) { var s = saved(); return s.week === week ? s.done : []; }

  window.wkToggle = function (id) {
    var p = window.WeekPlan.build(input()), cur = doneIds(p.week).slice(), i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1); else cur.push(id);
    var v = { week: p.week, done: cur };
    try { localStorage.setItem(key(), JSON.stringify(v)); } catch (e) {}
    try { if (typeof prefsPush === 'function') prefsPush('wk', v); } catch (e) {}
    if (typeof renderCurrentTab === 'function') renderCurrentTab();
  };

  function css() {
    if (document.getElementById('wk-style')) return;
    var s = document.createElement('style'); s.id = 'wk-style';
    s.textContent = '#wk-card .wk-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}'
      + '#wk-card .wk-chip{font-size:12px;font-weight:800;padding:5px 11px;border-radius:20px;background:var(--card-alt,#EAEFF5);color:var(--ink-2,#4A5668)}'
      + '#wk-card .wk-free{margin-top:12px;padding:12px 14px;border-radius:12px;background:var(--amber-light,#FBF1D6);font-size:14.5px;line-height:1.45}'
      + '#wk-card .wk-m{display:flex;gap:12px;align-items:flex-start;margin-top:12px;padding:12px 14px;border:1px solid var(--border,#E3E8EF);border-radius:14px}'
      + '#wk-card .wk-m.done{background:var(--income-light,#DDF3E8);border-color:transparent}'
      + '#wk-card .wk-ck{flex:none;width:28px;height:28px;border-radius:50%;border:2px solid var(--ink-3,#8A94A6);background:#fff;color:#fff;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;margin-top:1px}'
      + '#wk-card .wk-m.done .wk-ck{background:var(--income,#0B6B47);border-color:var(--income,#0B6B47)}'
      + '#wk-card .wk-ck[disabled]{cursor:default}'
      + '#wk-card .wk-ck:focus-visible{outline:3px solid #D4AF4F;outline-offset:2px}'
      + '#wk-card .wk-t{font-weight:800;font-size:15.5px;line-height:1.3}'
      + '#wk-card .wk-w{margin-top:3px;font-size:13.5px;line-height:1.45;color:var(--ink-2,#4A5668)}'
      + '#wk-card .wk-bar{height:6px;border-radius:3px;background:var(--border,#E3E8EF);margin-top:8px;overflow:hidden}'
      + '#wk-card .wk-bar i{display:block;height:100%;border-radius:3px;background:var(--teal,#16324F)}'
      + '#wk-card .wk-bar i.over{background:var(--expense,#9B2C22)}'
      + '#wk-card .wk-st{margin-top:5px;font-size:12.5px;font-weight:700;color:var(--ink-3,#6B7A90)}'
      + '#wk-card .wk-pay{margin-top:14px;font-size:13.5px;color:var(--ink-2,#4A5668)}#wk-card .wk-pay b{color:var(--ink,#101B2D)}'
      + '#wk-card .wk-note{margin-top:12px;font-size:12px;color:var(--ink-3,#8A94A6)}';
    document.head.appendChild(s);
  }
  function months(n) { return n >= 24 ? 'cerca de ' + (Math.round(n / 12 * 10) / 10).toString().replace('.', ',') + ' anos' : n === 1 ? '1 mês' : n + ' meses'; }

  window.weekPlanCard = function () {
    if (!window.WeekPlan) return '';
    css();
    var p = window.WeekPlan.build(input()), done = doneIds(p.week), total = p.missions.length, ok = 0;
    var rows = p.missions.map(function (m) {
      var isDone, extra = '';
      if (m.kind === 'spend') {
        var pct = m.target ? Math.min(100, Math.round(m.spent / m.target * 100)) : 0;
        extra = '<div class="wk-bar" aria-hidden="true"><i class="' + (m.status === 'over' ? 'over' : '') + '" style="width:' + pct + '%"></i></div><div class="wk-st">' + brl(m.spent) + ' de ' + brl(m.target) + ' · ' + (m.status === 'over' ? 'passou do limite' : m.status === 'near' ? 'perto do limite' : 'no ritmo') + '</div>';
        isDone = m.status !== 'over' && done.indexOf(m.id) >= 0;
      } else if (m.kind === 'log') {
        isDone = m.count >= m.need;
        extra = '<div class="wk-bar" aria-hidden="true"><i style="width:' + Math.min(100, Math.round(m.count / m.need * 100)) + '%"></i></div><div class="wk-st">' + Math.min(m.count, m.need) + ' de ' + m.need + ' lançamentos</div>';
      } else isDone = done.indexOf(m.id) >= 0;
      if (isDone) ok++;
      var auto = m.kind === 'log';
      return '<div class="wk-m' + (isDone ? ' done' : '') + '" data-m="' + esc(m.id) + '"><button class="wk-ck" ' + (auto ? 'disabled ' : 'onclick="wkToggle(\'' + esc(m.id) + '\')" ') + 'aria-pressed="' + isDone + '" aria-label="' + (isDone ? 'Desmarcar' : 'Marcar como feito') + ': ' + esc(m.title) + '">' + (isDone ? '✓' : '') + '</button><div><div class="wk-t">' + m.icon + ' ' + esc(m.title) + '</div><div class="wk-w">' + esc(m.why) + '</div>' + extra + '</div></div>';
    }).join('');
    var f = p.freedom, free = '';
    if (f) free = '<div class="wk-free">' + (f.months != null ? '⏳ No ritmo atual, faltam <b>' + months(f.months) + '</b> para quitar ' + brl(f.total) + ' em dívidas.' : '⚠️ A parcela de <b>' + esc(f.stuck[0]) + '</b> não cobre nem os juros. Negocie ou aumente o pagamento para a dívida começar a cair.') + '</div>';
    var pay = p.payables.length ? '<div class="wk-pay"><b>Vencimentos até domingo:</b> ' + p.payables.slice(0, 3).map(function (x) { return esc(x.title) + ' ' + brl(x.amount) + ' (' + (x.late ? 'venceu ' : '') + br(x.dueDate) + ')'; }).join(' · ') + '</div>' : '';
    var msg = total && ok === total ? '<div class="wk-free" style="background:var(--income-light,#DDF3E8)">🎉 Semana cumprida. Um passo de cada vez, o alívio chega.</div>' : '';
    var real = typeof currentUser !== 'undefined' && currentUser && !(typeof DEMO !== 'undefined' && DEMO.on);
    return '<div class="card mb-24 animate-in" id="wk-card"><div class="wk-top"><div><div class="card-title" style="margin:0">🎯 Plano da semana</div><div class="card-subtitle">De ' + br(p.start) + ' a ' + br(p.end) + ' · missões escolhidas com base nos seus números</div></div><span class="wk-chip">' + ok + ' de ' + total + ' feitas</span></div>'
      + free + rows + msg + pay + (real ? '<div class="wk-note">Toda segunda-feira você recebe este plano por e-mail. Para parar de receber, use o link no final do e-mail.</div>' : '') + '</div>';
  };
})();
