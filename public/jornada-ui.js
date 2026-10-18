/* SM Financial — Jornada: cartão "Seu caminho em 3 passos" no topo do Início. Lógica em jornada.js. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var brl = function (v) { return 'R$ ' + Math.round(+v || 0).toLocaleString('pt-BR'); };
  function key() { return typeof fxKey === 'function' ? fxKey('jor') : 'financa-jor'; }
  function today() { if (window.AG_TODAY) return window.AG_TODAY; var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function flags() { var s = null; try { s = (window.PREFS && PREFS.data && PREFS.data.jor) || JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) {} return s || {}; }
  function input() {
    var L = function (k) { try { return visibleList(k); } catch (e) { return state[k] || []; } };
    var st = null; try { st = (window.PREFS && PREFS.data && PREFS.data.estr) || JSON.parse(localStorage.getItem(typeof fxKey === 'function' ? fxKey('estr') : 'financa-estr') || 'null'); } catch (e) {}
    var docs = []; try { docs = typeof docsOf === 'function' ? docsOf(state.profile_type) : (state.documents || []); } catch (e) {}
    return { today: today(), flags: flags(), transactions: L('transactions'), debts: L('debts'), documents: docs, strategy: st };
  }
  window.jrFlag = function (name) {
    var f = flags(); f[name] = true;
    try { localStorage.setItem(key(), JSON.stringify(f)); } catch (e) {}
    try { if (typeof prefsPush === 'function') prefsPush('jor', f); } catch (e) {}
    if (typeof renderCurrentTab === 'function') renderCurrentTab();
  };
  window.jrGo = function (tab) { if (typeof switchTab === 'function') switchTab(tab); };
  function css() {
    if (document.getElementById('jr-style')) return;
    var s = document.createElement('style'); s.id = 'jr-style';
    s.textContent = '#jr-card .jr-steps{display:flex;gap:8px;margin:12px 0;flex-wrap:wrap}'
      + '#jr-card .jr-s{flex:1 1 140px;padding:10px 12px;border-radius:12px;border:1px solid var(--border,#E3E8EF);font-size:13.5px;font-weight:700;color:var(--ink-3,#6B7A90)}'
      + '#jr-card .jr-s.on{border-color:var(--teal,#16324F);color:var(--ink,#101B2D);background:var(--card-alt,#EAEFF5)}'
      + '#jr-card .jr-s.ok{background:var(--income-light,#DDF3E8);color:var(--income,#0B6B47);border-color:transparent}'
      + '#jr-card .jr-n{display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--teal,#16324F);color:#fff;align-items:center;justify-content:center;font-size:12px;margin-right:6px}'
      + '#jr-card .jr-i{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border,#E3E8EF);font-size:14.5px;flex-wrap:wrap}'
      + '#jr-card .jr-i.done{color:var(--income,#0B6B47);font-weight:700}'
      + '#jr-card .jr-b{border:0;border-radius:10px;padding:9px 14px;font-weight:800;cursor:pointer;background:var(--teal,#16324F);color:#fff;font-size:14px}'
      + '#jr-card .jr-b.sec{background:transparent;color:var(--ink-2,#4A5668);text-decoration:underline;font-weight:600;padding:9px 6px}'
      + '#jr-card .jr-d{padding:12px 14px;border-radius:12px;margin-top:6px;font-size:14.5px;line-height:1.45}'
      + '#jr-card .jr-d.aperto{background:#F9DEDA}#jr-card .jr-d.atencao{background:var(--amber-light,#FBF1D6)}#jr-card .jr-d.ok{background:var(--income-light,#DDF3E8)}'
      + '#jr-card .jr-m{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:13.5px}';
    document.head.appendChild(s);
  }
  window.jornadaCard = function () {
    if (!window.Jornada) return '';
    css();
    var j = window.Jornada.build(input());
    var cls = function (n) { return (n === 1 ? j.step1 : n === 2 ? j.step1 : j.finished) ? 'ok' : (n === j.current ? 'on' : ''); };
    var steps = '<div class="jr-steps"><div class="jr-s ' + (j.step1 ? 'ok' : 'on') + '"><span class="jr-n">1</span>Reunir seus dados</div><div class="jr-s ' + (j.step1 ? 'ok' : '') + '"><span class="jr-n">2</span>Ver sua situação</div><div class="jr-s ' + (j.finished ? 'ok' : j.step1 ? 'on' : '') + '"><span class="jr-n">3</span>Seguir o plano</div></div>';
    var body = '';
    if (!j.step1) {
      body = '<div class="text-sm" style="color:var(--ink-2,#4A5668)">Passo 1 de 3: para mostrar sua situação de verdade, preciso destes dados (' + j.progress + ' de ' + j.of + ' prontos).</div>'
        + j.items.map(function (i) {
          return '<div class="jr-i ' + (i.done ? 'done' : '') + '" data-jr="' + i.id + '"><span>' + (i.done ? '✓ ' : '') + esc(i.done ? i.label : i.need) + '</span>'
            + (i.done ? '' : '<span><button class="jr-b" onclick="jrGo(\'' + i.tab + '\')">Abrir</button>'
              + (i.canSkip ? '<button class="jr-b sec" onclick="jrFlag(\'semDividas\')">Não tenho dívidas</button>' : '')
              + (i.id === 'docs' ? '<button class="jr-b sec" onclick="jrFlag(\'semDocs\')">Pular</button>' : '') + '</span>') + '</div>';
        }).join('');
    } else {
      var d = j.diag, p = j.plan;
      body = '<div class="jr-d ' + d.level + '" data-jr-diag="' + d.level + '"><b>Sua situação hoje:</b> ' + esc(d.msg) + '</div>'
        + '<div class="jr-m"><span>Entra: <b>' + brl(d.receita) + '</b></span><span>Gastos: <b>' + brl(d.gastos) + '</b></span><span>Parcelas: <b>' + brl(d.parcelas) + '</b></span><span>Sobra: <b>' + brl(d.sobra) + '</b></span>' + (d.dividaTotal ? '<span>Dívidas: <b>' + brl(d.dividaTotal) + '</b></span>' : '') + '</div>'
        + '<div class="jr-i" style="margin-top:12px"><span>' + (p.done ? '✓ Plano de ação montado. Siga as missões da semana.' : 'Agora falta o plano de ação: o consultor monta com você, passo a passo.') + '</span><button class="jr-b" onclick="jrGo(\'' + p.tab + '\')">' + esc(p.cta) + '</button></div>'
        + '<div style="margin-top:8px"><button class="jr-b sec" onclick="jrGo(\'receitas\')">Atualizar meus dados</button></div>';
    }
    return '<div class="card mb-24 animate-in" id="jr-card"><div class="card-title">Seu caminho em 3 passos</div>' + steps + body + '</div>';
  };
})();
