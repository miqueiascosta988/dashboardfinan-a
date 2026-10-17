/* SM Financial — Consultor de estratégia: tela do chat (aba Estratégia). A lógica está em consultor.js. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CS = { sess: null, msgs: [], saved: false, sig: '' };
  window.CS = CS;
  function todayISO() { if (window.AG_TODAY) return window.AG_TODAY; var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function ctx(c) {
    var income = (c && c.totalIncome) || state.monthlyIncome || 0, exp = (c && c.totalExpense) || 0, L;
    try { L = visibleList('debts'); } catch (e) { L = state.debts || []; }
    return { today: todayISO(), name: state.name || '', income: income, surplus: income - exp, debts: L.map(function (d) { return { id: d.id, name: d.name, type: d.type, saldo: d.saldo, juros: d.juros, mensal: d.mensal }; }) };
  }
  function start(c) { var r = Consultor.newSession(ctx(c)); CS.sess = r.S; CS.msgs = r.msgs; CS.saved = false; CS.sig = (state.profile_type || '') + '|' + (state.debts || []).length; }
  function css() {
    if (document.getElementById('cs-style')) return;
    var s = document.createElement('style'); s.id = 'cs-style';
    s.textContent = '#cs-card .cs-chat{max-height:520px;overflow:auto;display:flex;flex-direction:column;gap:10px;margin:12px 0;padding-right:4px}'
      + '#cs-card .cs-m{padding:10px 14px;border-radius:14px;max-width:94%;font-size:14.5px;line-height:1.5;overflow-wrap:anywhere}'
      + '#cs-card .cs-bot{align-self:flex-start;background:var(--card-alt,#EAEFF5);color:var(--ink,#101B2D)}'
      + '#cs-card .cs-user{align-self:flex-end;background:var(--teal,#16324F);color:#fff}'
      + '#cs-card .cs-q{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}'
      + '#cs-card .cs-qb{font:inherit;font-weight:700;font-size:13.5px;border-radius:20px;padding:8px 14px;border:1.5px solid var(--teal,#16324F);background:#fff;color:var(--teal,#16324F);cursor:pointer;text-align:left}'
      + '#cs-card .cs-qb:hover{background:var(--card-alt,#EAEFF5)}#cs-card .cs-qb:focus-visible,#cs-card .cs-in:focus-visible{outline:3px solid #D4AF4F;outline-offset:2px}'
      + '#cs-card .cs-form{display:flex;gap:8px;margin-top:6px}#cs-card .cs-in{flex:1;min-width:0;font:inherit;font-size:15px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--border,#E3E8EF);background:var(--card,#fff);color:var(--ink,#101B2D)}'
      + '#cs-card .cs-send{font:inherit;font-weight:800;border:0;border-radius:12px;padding:0 18px;background:var(--teal,#16324F);color:#fff;cursor:pointer}'
      + '#cs-card .cs-tbl{width:100%;border-collapse:collapse;margin-top:10px;font-size:13.5px}#cs-card .cs-tbl th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3,#6B7A90);padding:4px 6px}'
      + '#cs-card .cs-tbl td{padding:7px 6px;border-top:1px solid var(--border,#E3E8EF);vertical-align:top}#cs-card .cs-tbl td.n{text-align:right;white-space:nowrap;font-weight:700}'
      + '#cs-card .cs-act{margin:10px 0 0;padding-left:20px}#cs-card .cs-act li{margin:4px 0}'
      + '#cs-card .cs-note{margin-top:10px;font-size:12px;color:var(--ink-3,#6B7A90)}#cs-card .cs-ok{margin-top:8px;font-weight:700;color:var(--income,#0B6B47)}';
    document.head.appendChild(s);
  }
  function planHtml(p) {
    var rows = p.rows.map(function (r) {
      var d = []; if (r.min > 0) d.push('parcela ' + Consultor.brl(r.min)); if (r.extra > 0) d.push('extra ' + Consultor.brl(r.extra)); if (r.windfall > 0) d.push(esc(r.windfalls.join(' + ')) + ' ' + Consultor.brl(r.windfall));
      return '<tr><td>' + esc(Consultor.ymShort(r.ym)) + '</td><td>' + d.join(' + ') + '</td><td class="n">' + Consultor.brl(r.pay) + '</td><td class="n">' + Consultor.brl(r.balance) + '</td></tr>';
    }).join('');
    var acts = Consultor.actions(p, CS.sess).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');
    return '<table class="cs-tbl"><thead><tr><th>Mês</th><th>De onde vem</th><th style="text-align:right">' + (p.goal === 'juntar' ? 'Guardar' : 'Pagar') + '</th><th style="text-align:right">' + (p.goal === 'juntar' ? 'Falta' : 'Saldo') + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<div style="margin-top:12px;font-weight:800">Passo a passo</div><ol class="cs-act">' + acts + '</ol>'
      + '<div class="cs-note">Simulação educativa feita com os números que você informou. Juros e prazos reais podem variar; confirme com o credor. Não é recomendação financeira individual.</div>';
  }
  window.consultorCard = function (c) {
    if (!window.Consultor) return '';
    css();
    var sig = (state.profile_type || '') + '|' + (state.debts || []).length;
    if (!CS.sess || CS.sig !== sig) start(c);
    var last = CS.msgs.length - 1, chat = CS.msgs.map(function (m, i) {
      var h = '<div class="cs-m ' + (m.role === 'user' ? 'cs-user' : 'cs-bot') + '">' + esc(m.text).replace(/\n/g, '<br>') + (m.plan ? planHtml(m.plan) : '') + (m.saved ? '<div class="cs-ok">✓ Plano salvo. Ele aparece no seu Plano da semana, no Início.</div>' : '');
      if (m.role === 'bot' && i === last && m.replies && m.replies.length) h += '<div class="cs-q">' + m.replies.map(function (b, k) { return '<button class="cs-qb" onclick="csQuick(' + k + ')">' + esc(b.label) + '</button>'; }).join('') + '</div>';
      return h + '</div>';
    }).join('');
    return '<div class="card mb-24 animate-in" id="cs-card"><div class="card-header"><div><div class="card-title">🤖 Consultor de estratégia</div><div class="card-subtitle">Conte seu objetivo do seu jeito. Eu pergunto o que faltar e monto o plano mês a mês. Suas respostas ficam neste aparelho.</div></div></div>'
      + '<div class="cs-chat" id="cs-chat" aria-live="polite">' + chat + '</div>'
      + '<form class="cs-form" onsubmit="csSubmit(event)"><input class="cs-in" id="cs-in" type="text" autocomplete="off" maxlength="600" placeholder="Escreva aqui. Ex.: quero quitar o cartão até janeiro" aria-label="Mensagem para o consultor"><button class="cs-send" type="submit">Enviar</button></form>'
      + '<div style="margin-top:8px"><button class="cs-qb" style="border-color:var(--border,#E3E8EF);color:var(--ink-3,#6B7A90)" onclick="csRestart()">↺ Recomeçar conversa</button></div></div>';
  };
  function after() { if (typeof renderCurrentTab === 'function') renderCurrentTab(); setTimeout(function () { var c = document.getElementById('cs-chat'); if (c) c.scrollTop = c.scrollHeight; var i = document.getElementById('cs-in'); if (i) i.focus({ preventScroll: true }); }, 30); }
  function send(value, label) {
    var v = String(value || '').trim(); if (!v || !CS.sess) return;
    if (v === '@restart:1') { start(); return after(); }
    CS.msgs.push({ role: 'user', text: label || v });
    if (v === '@save:1') { save(); return after(); }
    var r = /^@fix:(\w+)$/.exec(v) ? Consultor.fix(CS.sess, RegExp.$1) : Consultor.reply(CS.sess, v);
    CS.sess = r.S; CS.msgs = CS.msgs.concat(r.msgs); if (CS.msgs.length > 60) CS.msgs = CS.msgs.slice(-60);
    after();
  }
  function save() {
    var p = CS.sess && CS.sess.plan; if (!p) return;
    var v = Consultor.toSaved(p, CS.sess, todayISO()), k = typeof fxKey === 'function' ? fxKey('estr') : 'financa-estr';
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    try { if (typeof prefsPush === 'function') prefsPush('estr', v); } catch (e) {}
    CS.saved = true; CS.msgs.push({ role: 'bot', text: 'Pronto! Salvei o plano. A cada semana, eu te lembro do valor do mês no Plano da semana. Se algo mudar, é só conversar comigo de novo e refazer.', saved: true });
    try { if (typeof showToast === 'function') showToast('Plano salvo no seu Plano da semana', 'success'); } catch (e) {}
  }
  window.csQuick = function (k) { var m = CS.msgs[CS.msgs.length - 1]; var b = m && m.replies && m.replies[k]; if (b) send(b.value, b.label); };
  window.csSubmit = function (e) { e.preventDefault(); var i = document.getElementById('cs-in'); if (!i) return; var v = i.value; i.value = ''; send(v); };
  window.csRestart = function () { start(); after(); };
})();
