/* Conforto — ocultar valores, bloqueio por PIN, modo simples, desafio das 52 semanas e alertas de limite.
   Parte 1: contas puras (testadas em Node). Parte 2: telas (usa as funções globais do app).
   Honestidade: o PIN é uma trava de conveniência NESTE aparelho (protege contra quem pega o celular desbloqueado).
   Ele não substitui a senha da conta e não é guardado na nuvem. */
(function (root) {
  'use strict';
  var KEY = 'sm_conf', PINK = 'sm_pin', PINF = 'sm_pin_f';
  var S = { oculto: false, simples: false, desafio: null };

  // ───────── Parte 1: lógica pura ─────────
  function limites(budgets, gastos) {
    var out = [];
    Object.keys(budgets || {}).forEach(function (cat) {
      var lim = +budgets[cat] || 0, gasto = +(gastos || {})[cat] || 0;
      if (!(lim > 0)) return;
      var pct = gasto / lim * 100;
      if (pct >= 100) out.push({ cat: cat, pct: Math.round(pct), nivel: 'over', gasto: gasto, limite: lim });
      else if (pct >= 80) out.push({ cat: cat, pct: Math.round(pct), nivel: 'warn', gasto: gasto, limite: lim });
    });
    return out.sort(function (a, b) { return b.pct - a.pct; });
  }
  function pinValido(p) { return /^\d{4,6}$/.test(String(p || '')); }
  function espera(falhas) { return falhas < 5 ? 0 : Math.min(300000, 30000 * (falhas - 4)); }   // 5ª falha: 30 s, depois cresce
  function desafioTotal(base) { return Math.round(base * 52 * 53 / 2 * 100) / 100; }              // 1×base + 2×base + … + 52×base
  function desafioGuardado(base, done) { var s = 0; (done || []).forEach(function (n) { if (n >= 1 && n <= 52) s += n * base; }); return Math.round(s * 100) / 100; }
  function baseValida(v) { v = +v; return v > 0 && v <= 1000 ? Math.round(v * 100) / 100 : null; }

  var API = { limites: limites, pinValido: pinValido, espera: espera, desafioTotal: desafioTotal, desafioGuardado: desafioGuardado, baseValida: baseValida };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;

  // ───────── Parte 2: telas ─────────
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function load() { try { var j = JSON.parse(ls(KEY) || 'null'); if (j) { S.oculto = !!j.oculto; S.simples = !!j.simples; S.desafio = j.desafio || null; } } catch (e) {} }
  function save() { ls(KEY, JSON.stringify(S)); try { if (typeof prefsPush === 'function') prefsPush('conforto', S); } catch (e) {} }
  function esc(s) { return typeof fxEsc === 'function' ? fxEsc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sha(txt) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  function temPin() { try { var p = JSON.parse(ls(PINK) || 'null'); return !!(p && p.h && p.s); } catch (e) { return false; } }
  function conferePin(pin) { var p = JSON.parse(ls(PINK) || 'null'); if (!p) return Promise.resolve(false); return sha(p.s + pin).then(function (h) { return h === p.h; }); }

  function atualizaBotoes() {
    var o = document.getElementById('btn-oculto'), m = document.getElementById('btn-simples'), p = document.getElementById('btn-pin');
    if (o) { o.setAttribute('aria-pressed', String(S.oculto)); o.textContent = S.oculto ? '🙈' : '👁'; o.title = S.oculto ? 'Mostrar valores' : 'Ocultar valores'; o.setAttribute('aria-label', o.title); }
    if (m) { m.setAttribute('aria-pressed', String(S.simples)); m.textContent = S.simples ? '🧩 Modo completo' : '🧩 Simples'; }
    if (p) p.textContent = temPin() ? '🔒 PIN ativo' : '🔒 PIN';
  }
  function rerender() { try { renderNav(); renderCurrentTab(); renderNotifications(); updateNotifBadge(); } catch (e) {} }

  function toggleOculto() { S.oculto = !S.oculto; save(); atualizaBotoes(); rerender(); }
  function toggleSimples() {
    S.simples = !S.simples; save(); atualizaBotoes();
    try { if (S.simples) { currentTab = 'simples'; } else if (currentTab === 'simples') { currentTab = 'dashboard'; } } catch (e) {}
    rerender();
  }

  // ───── PIN ─────
  function trava() {
    if (!temPin() || document.getElementById('pin-lock')) return;
    var d = document.createElement('div'); d.id = 'pin-lock'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Aplicativo bloqueado');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg,#0b1220);display:flex;align-items:center;justify-content:center;padding:24px';
    d.innerHTML = '<div style="max-width:320px;width:100%;text-align:center"><div style="font-size:40px" aria-hidden="true">🔒</div>'
      + '<h2 style="margin:8px 0 4px">Aplicativo bloqueado</h2><div style="color:var(--ink-3);margin-bottom:14px">Digite seu PIN para ver seus dados.</div>'
      + '<label class="form-label" for="pin-in" style="display:block;text-align:left">PIN</label>'
      + '<input class="form-input" id="pin-in" type="password" inputmode="numeric" autocomplete="off" maxlength="6" style="text-align:center;font-size:22px;letter-spacing:6px" />'
      + '<div id="pin-err" role="alert" style="min-height:20px;color:var(--expense);margin:6px 0"></div>'
      + '<button class="btn-primary" id="pin-go">Desbloquear</button>'
      + '<button class="btn-secondary" id="pin-out" style="margin-top:10px;width:100%">Esqueci o PIN: sair da conta</button></div>';
    document.body.appendChild(d);
    var inp = d.querySelector('#pin-in'), err = d.querySelector('#pin-err');
    function tentar() {
      var f = JSON.parse(ls(PINF) || '{"n":0,"t":0}'), w = espera(f.n), resta = f.t + w - Date.now();
      if (w && resta > 0) { err.textContent = 'Muitas tentativas. Aguarde ' + Math.ceil(resta / 1000) + 's.'; return; }
      conferePin(inp.value).then(function (ok) {
        if (ok) { ls(PINF, null); d.remove(); return; }
        f.n++; f.t = Date.now(); ls(PINF, JSON.stringify(f)); inp.value = '';
        err.textContent = espera(f.n) ? 'PIN incorreto. Aguarde ' + (espera(f.n) / 1000) + 's para tentar de novo.' : 'PIN incorreto.';
      });
    }
    d.querySelector('#pin-go').onclick = tentar;
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') tentar(); });
    d.querySelector('#pin-out').onclick = function () { ls(PINK, null); ls(PINF, null); d.remove(); var b = document.getElementById('btn-logout'); if (b) b.click(); else location.reload(); };
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }
  function abrirPin() {
    var tem = temPin();
    openModal('Bloqueio por PIN', '<div class="onboard-desc">Pede um PIN de 4 a 6 números ao abrir o app e depois de 1 minuto fora dele. É uma trava só deste aparelho; ela não substitui a senha da conta.</div>'
      + (tem ? '<div class="form-group"><label class="form-label" for="pin-atual">PIN atual</label><input class="form-input" id="pin-atual" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>' : '')
      + '<div class="form-group"><label class="form-label" for="pin-novo">' + (tem ? 'Novo PIN (deixe vazio para remover o bloqueio)' : 'Escolha um PIN (4 a 6 números)') + '</label><input class="form-input" id="pin-novo" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>'
      + '<div id="pin-msg" role="alert" style="min-height:20px;color:var(--expense)"></div>'
      + '<button class="btn-primary" onclick="Conforto.salvarPin()">Salvar</button>'
      + (tem ? '<button class="btn-secondary" style="margin-top:10px;width:100%" onclick="closeModal();Conforto.trava()">Bloquear agora</button>' : ''));
  }
  function salvarPin() {
    var msg = document.getElementById('pin-msg'), novo = (document.getElementById('pin-novo') || {}).value || '', atualEl = document.getElementById('pin-atual');
    if (!(window.crypto && crypto.subtle)) { msg.textContent = 'Este navegador não permite o bloqueio por PIN (precisa de conexão segura).'; return; }
    function aplicar() {
      if (!novo) { ls(PINK, null); ls(PINF, null); closeModal(); atualizaBotoes(); showToast('Bloqueio por PIN removido', 'info'); return; }
      if (!pinValido(novo)) { msg.textContent = 'Use de 4 a 6 números.'; return; }
      var salt = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(8)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      sha(salt + novo).then(function (h) { ls(PINK, JSON.stringify({ s: salt, h: h })); ls(PINF, null); closeModal(); atualizaBotoes(); showToast('PIN ativado ✔', 'success'); });
    }
    if (atualEl) conferePin(atualEl.value).then(function (ok) { if (!ok) { msg.textContent = 'PIN atual incorreto.'; return; } aplicar(); });
    else aplicar();
  }
  var saiuEm = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) saiuEm = Date.now();
    else if (saiuEm && Date.now() - saiuEm > 60000) { var app = document.getElementById('app-screen'); if (app && !app.hidden) trava(); }
  });

  // ───── Desafio das 52 semanas (acompanhamento; não move dinheiro) ─────
  function desafioHtml() {
    var d = S.desafio;
    if (!d || !d.base) {
      return '<div class="card animate-in" style="margin-top:16px"><div class="card-title">🏁 Desafio das 52 semanas</div>'
        + '<div class="card-subtitle" style="margin:6px 0 12px">Na semana 1 você guarda 1× o valor base, na semana 2 guarda 2×, e assim até a 52. Aqui você só marca o que já guardou: o app não movimenta dinheiro.</div>'
        + '<div class="form-group"><label class="form-label" for="des-base">Valor base por semana (R$)</label><input class="form-input" id="des-base" inputmode="decimal" value="1,00" style="max-width:160px"></div>'
        + '<button class="btn-primary" onclick="Conforto.iniciaDesafio()">Começar o desafio</button><div id="des-msg" role="alert" style="color:var(--expense);margin-top:6px"></div></div>';
    }
    var done = d.done || [], tot = desafioTotal(d.base), gua = desafioGuardado(d.base, done);
    var cel = ''; for (var n = 1; n <= 52; n++) { var on = done.indexOf(n) >= 0; cel += '<button type="button" class="btn-sm" aria-pressed="' + on + '" onclick="Conforto.semana(' + n + ')" style="' + (on ? 'background:var(--income);color:#fff;' : '') + 'min-width:64px">S' + n + '<br><small>' + fmt(n * d.base) + '</small></button>'; }
    return '<div class="card animate-in" style="margin-top:16px"><div class="card-title">🏁 Desafio das 52 semanas</div>'
      + '<div class="card-subtitle" style="margin:6px 0 10px">Guardado: <b>' + fmt(gua) + '</b> de ' + fmt(tot) + ' · ' + done.length + ' de 52 semanas</div>'
      + '<div style="height:8px;border-radius:4px;background:var(--border);overflow:hidden;margin-bottom:12px"><div style="height:100%;width:' + Math.round(gua / tot * 100) + '%;background:var(--income)"></div></div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">' + cel + '</div>'
      + '<button class="btn-secondary" style="margin-top:12px" onclick="Conforto.reiniciaDesafio()">Recomeçar</button></div>';
  }
  function iniciaDesafio() {
    var v = (document.getElementById('des-base') || {}).value || ''; v = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
    var b = baseValida(v), m = document.getElementById('des-msg');
    if (!b) { if (m) m.textContent = 'Informe um valor entre R$ 0,01 e R$ 1.000,00.'; return; }
    S.desafio = { base: b, done: [], inicio: new Date().toISOString().slice(0, 10) }; save(); renderCurrentTab();
  }
  function semana(n) { var d = S.desafio; if (!d) return; var i = (d.done || []).indexOf(n); if (i >= 0) d.done.splice(i, 1); else d.done.push(n); save(); renderCurrentTab(); }
  function reiniciaDesafio() { if (window.confirm('Recomeçar o desafio? As semanas marcadas serão apagadas.')) { S.desafio = null; save(); renderCurrentTab(); } }

  // ───── Alertas de limite por categoria ─────
  function alertasLimites() {
    var g = {};
    filterByPeriod(visibleList('transactions').filter(function (t) { return t.type === 'expense'; }), 'date').forEach(function (e) { g[e.cat] = (g[e.cat] || 0) + e.amount; });
    var chave = new Date().getFullYear() + '-' + currentMonth();
    return limites(state.budgets, g).map(function (a) {
      return { id: 'limite-' + a.cat + '-' + a.nivel + '-' + chave, icon: a.nivel === 'over' ? '🚨' : '⚠️', type: a.nivel === 'over' ? 'danger' : 'warning',
        title: a.nivel === 'over' ? 'Limite de ' + a.cat + ' estourado' : 'Limite de ' + a.cat + ' quase no fim',
        desc: fmt(a.gasto) + ' de ' + fmt(a.limite) + ' (' + a.pct + '%)', time: 'Agora', tab: 'orcamento' };
    });
  }

  // ───── Modo simples ─────
  function barra(p, cor) { return '<div style="height:8px;border-radius:4px;background:var(--border);overflow:hidden"><div style="height:100%;width:' + Math.min(100, Math.max(0, p)) + '%;background:' + cor + '"></div></div>'; }
  function renderSimples(c) {
    var tx = filterByPeriod(visibleList('transactions'), 'date'), ent = 0, sai = 0, cats = {};
    tx.forEach(function (t) { if (t.type === 'income') ent += t.amount; else { sai += t.amount; cats[t.cat] = (cats[t.cat] || 0) + t.amount; } });
    var saldo = ent - sai, vazio = !tx.length;
    var topo = Object.keys(cats).map(function (k) { return [k, cats[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
    var lim = limites(state.budgets, cats);
    var contas = []; try { contas = generateNotifications().filter(function (n) { return /^(due-|debtdue-)/.test(n.id); }).slice(0, 3); } catch (e) {}
    var metas = visibleList('goals').slice().sort(function (a, b) { return (b.target > 0 ? b.current / b.target : 0) - (a.target > 0 ? a.current / a.target : 0); });
    var meta = metas.filter(function (g) { return g.target > 0 && g.current < g.target; })[0] || metas[0];
    var nota = c.healthTotal;
    var h = '<div class="section-header animate-in"><div><div class="section-title">Resumo</div><div class="section-desc">Só o que importa, numa tela.</div></div></div>';
    h += '<div class="card animate-in" style="text-align:center;padding:22px"><div class="card-subtitle">' + (vazio ? 'Ainda não há lançamentos neste período' : (saldo >= 0 ? 'Sobrou neste período' : 'Faltou neste período')) + '</div>'
      + '<div style="font-size:34px;font-weight:800;color:' + (vazio ? 'var(--ink-3)' : saldo >= 0 ? 'var(--income)' : 'var(--expense)') + '">' + (vazio ? '—' : fmtS(saldo)) + '</div>'
      + (vazio ? '' : '<div style="color:var(--ink-3)">Entrou ' + fmt(ent) + ' · Saiu ' + fmt(sai) + '</div>') + '</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><button class="btn-primary" style="flex:1;min-width:130px" onclick="openTransactionModal(\'income\')">+ Receita</button>'
      + '<button class="btn-primary" style="flex:1;min-width:130px" onclick="openTransactionModal(\'expense\')">+ Despesa</button>'
      + '<button class="btn-secondary" style="flex:1;min-width:130px" onclick="openDocUploadModal()">📄 Enviar documento</button></div>';
    if (topo.length) h += '<div class="card animate-in"><div class="card-title">Para onde foi o dinheiro</div>' + topo.map(function (t) { return '<div style="margin-top:10px"><div style="display:flex;justify-content:space-between"><span>' + esc(t[0]) + '</span><b>' + fmt(t[1]) + '</b></div>' + barra(sai > 0 ? t[1] / sai * 100 : 0, 'var(--expense)') + '</div>'; }).join('') + '</div>';
    if (Object.keys(state.budgets || {}).length) h += '<div class="card animate-in" style="margin-top:14px"><div class="card-title">Limites</div>' + (lim.length ? lim.map(function (a) { return '<div style="margin-top:8px;color:' + (a.nivel === 'over' ? 'var(--expense)' : 'var(--gold-text)') + '">' + (a.nivel === 'over' ? '🚨 ' : '⚠️ ') + esc(a.cat) + ': ' + a.pct + '% do limite</div>'; }).join('') : '<div style="margin-top:8px;color:var(--income)">✔ Tudo dentro dos limites</div>') + '</div>';
    if (contas.length) h += '<div class="card animate-in" style="margin-top:14px"><div class="card-title">Contas a vencer</div>' + contas.map(function (n) { return '<div style="margin-top:8px">' + n.icon + ' ' + n.desc + '</div>'; }).join('') + '</div>';
    if (meta) { var p = meta.target > 0 ? meta.current / meta.target * 100 : 0; h += '<div class="card animate-in" style="margin-top:14px"><div class="card-title">Sua meta: ' + esc(meta.name) + '</div><div style="margin:8px 0;color:var(--ink-3)">' + fmt(meta.current) + ' de ' + fmt(meta.target) + ' (' + Math.round(p) + '%)</div>' + barra(p, 'var(--income)') + '</div>'; }
    h += '<div class="card animate-in" style="margin-top:14px"><div class="card-title">Nota de saúde financeira</div><div style="font-size:26px;font-weight:800;margin-top:6px">' + (nota == null ? '—' : nota + '/100') + '</div><div style="color:var(--ink-3)">' + (nota == null ? 'Lance renda e gastos para calcular.' : 'Calculada com os seus números.') + '</div></div>';
    h += (window.Jogo ? '<div style="margin-top:14px">' + Jogo.cardHtml(c) + '</div>' : '');
    h += '<div style="text-align:center;margin:18px 0"><button class="btn-secondary" onclick="Conforto.toggleSimples()">Ver o app completo</button></div>';
    return h;
  }
  function navSimples(byId) {
    var out = [{ id: 'g-simples', icon: '🧩', label: 'Resumo', kids: [{ id: 'simples', label: 'Resumo' }] }];
    ['receitas', 'despesas', 'orcamento', 'metas'].forEach(function (id) { if (byId[id]) out.push({ id: 'g-' + id, icon: id === 'receitas' ? '💰' : id === 'despesas' ? '💸' : id === 'orcamento' ? '📊' : '🎯', label: byId[id].label, kids: [byId[id]] }); });
    return out;
  }

  function aoEntrar() {
    load();
    try { var nv = PREFS && PREFS.data && PREFS.data.conforto; if (nv && !ls(KEY)) { S.oculto = !!nv.oculto; S.simples = !!nv.simples; S.desafio = nv.desafio || null; ls(KEY, JSON.stringify(S)); } } catch (e) {}
    atualizaBotoes();
    if (S.simples && currentTab !== 'simples') { currentTab = 'simples'; rerender(); }
    if (temPin()) trava();
  }

  root.Conforto = Object.assign({}, API, {
    oculto: function () { return S.oculto; }, simples: function () { return S.simples; },
    toggleOculto: toggleOculto, toggleSimples: toggleSimples, abrirPin: abrirPin, salvarPin: salvarPin, trava: trava,
    desafioHtml: desafioHtml, iniciaDesafio: iniciaDesafio, semana: semana, reiniciaDesafio: reiniciaDesafio,
    alertasLimites: alertasLimites, renderSimples: renderSimples, navSimples: navSimples, aoEntrar: aoEntrar, init: function () { load(); atualizaBotoes(); }
  });
  load();
})(typeof window !== 'undefined' ? window : globalThis);
