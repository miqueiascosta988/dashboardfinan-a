/* Guia — primeiros passos interativos do SM Financial.
   Regras (decididas com o dono do produto):
   1. Cada etapa só avança quando o cliente FAZ a ação de verdade (anexa o documento, salva a renda, salva os gastos).
      Não existe botão "Próximo" para fingir que fez. O que existe é "Pular esta etapa".
   2. Pular avisa o que fica sem cálculo e pede confirmação. A etapa continua pendente: aparece em "Retomar etapas puladas"
      e é concluída sozinha se o cliente fizer a ação depois.
   3. Documento que o app não consegue ler com segurança fica em "A revisar" e o guia segue em frente (avisando).
   4. Tudo fica salvo na conta (user_prefs, chave "gd") e em cache local: quem sair e entrar de novo continua de onde parou.
   Parte 1 deste arquivo: lógica pura (sem DOM), testada em Node. Parte 2: tela (balão + destaque). */
(function (root) {
  'use strict';

  // ───────── Parte 1: lógica pura ─────────
  var STEPS = [
    { id: 'meta', title: 'O que você quer resolver agora?', tab: 'dashboard', ask: true,
      text: 'Escolha uma opção. Eu organizo os próximos passos em volta dela.',
      warn: 'Sem essa escolha eu sigo com o caminho mais comum: ver para onde vai o seu dinheiro.' },
    { id: 'doc', title: 'Anexe seu holerite ou fatura', tab: 'documentos',
      text: 'Arraste o arquivo para a área destacada ou clique nela para escolher. Prefira o PDF original: é lido com mais precisão.',
      wait: 'Estou esperando você anexar um documento.',
      warn: 'Sem um documento eu não consigo conferir seus números automaticamente. Você ainda pode digitar tudo à mão nas próximas etapas.' },
    { id: 'renda', title: 'Registre quanto entra por mês', tab: 'receitas', need: 1, kind: 'income',
      text: 'Clique em "+ Novo" e preencha os campos que eu destacar. Pode digitar o valor do jeito brasileiro, por exemplo 3.200,50.',
      wait: 'Estou esperando você salvar a sua renda.',
      warn: 'Sem a renda eu não consigo calcular o que sobra no mês. A Visão Geral e a nota de saúde ficam sem dados.' },
    { id: 'gastos', title: 'Registre 5 gastos', tab: 'despesas', need: 5, kind: 'expense',
      text: 'Pense no que você pagou esta semana: aluguel, mercado, transporte. Cada gasto salvo conta.',
      wait: 'Estou esperando você salvar os gastos.',
      warn: 'Sem gastos registrados eu não consigo mostrar para onde vai o seu dinheiro nem calcular a sua economia.' },
    { id: 'resultado', title: 'Veja o resultado do mês', tab: 'dashboard', ack: true,
      text: 'Este é o resumo calculado com os números que você acabou de colocar.',
      wait: 'Abra a aba Início para ver o resumo.',
      warn: 'Você poderá ver o resumo do mês a qualquer momento na aba Início.' },
    { id: 'proximo', title: 'Seu próximo passo', tab: 'dashboard', byGoal: true,
      text: '', wait: '', warn: 'Você pode fazer este passo depois, quando quiser, pelo menu.' }
  ];
  var GOALS = {
    ver: { label: 'Ver para onde vai meu dinheiro', tab: 'orcamento', title: 'Defina um limite de gasto (Orçamento)', text: 'Escolha uma categoria, digite o limite do mês e salve.', wait: 'Estou esperando você salvar um limite no Orçamento.', warn: 'Sem limites, eu não consigo avisar quando uma categoria estourar.' },
    dividas: { label: 'Sair das dívidas', tab: 'dividas', title: 'Cadastre suas dívidas', text: 'Clique em "+ Nova dívida". Se não tiver nenhuma, use "Não tenho dívidas" na Visão Geral.', wait: 'Estou esperando você cadastrar uma dívida (ou dizer que não tem).', warn: 'Sem as dívidas eu não consigo montar um plano de saída nem priorizar qual pagar primeiro.' },
    juntar: { label: 'Juntar dinheiro', tab: 'metas', title: 'Crie sua primeira meta', text: 'Dê um nome, o valor que quer juntar e quanto consegue guardar por mês.', wait: 'Estou esperando você salvar uma meta.', warn: 'Sem uma meta, eu não consigo calcular em quantos meses você chega lá.' }
  };

  function stepDef(id, goal) {
    var s = null; for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) s = STEPS[i];
    if (!s) return null;
    if (!s.byGoal) return s;
    var g = GOALS[goal] || GOALS.ver;
    return { id: s.id, title: g.title, tab: g.tab, text: g.text, wait: g.wait, warn: g.warn, byGoal: true, goalKey: GOALS[goal] ? goal : 'ver' };
  }

  // O que o app já registrou (contagens). ctx: { incomes, expenses, docs, debts, goals, budgets, semDividas, tab }
  function detect(id, ctx, saved) {
    switch (id) {
      case 'meta': return !!(saved && saved.goal);
      case 'doc': return (ctx.docs || 0) >= 1;
      case 'renda': return (ctx.incomes || 0) >= 1;
      case 'gastos': return (ctx.expenses || 0) >= 5;
      case 'resultado': return !!(saved && saved.steps && saved.steps.resultado && saved.steps.resultado.ack);
      case 'proximo':
        var g = (saved && saved.goal) || 'ver';
        if (g === 'dividas') return (ctx.debts || 0) > 0 || !!ctx.semDividas;
        if (g === 'juntar') return (ctx.goals || 0) > 0;
        return (ctx.budgets || 0) > 0;
    }
    return false;
  }

  // Estado de cada etapa: 'done' | 'skipped' | 'pending'. Etapa pulada que o cliente cumpre depois vira 'done'.
  function evaluate(ctx, saved) {
    saved = saved || {}; var st = saved.steps || {}, out = [], current = null, i;
    for (i = 0; i < STEPS.length; i++) {
      var id = STEPS[i].id, rec = st[id] || {}, status;
      if (detect(id, ctx || {}, saved) && !(id === 'meta' && !saved.goal)) status = 'done';
      else if (rec.s === 'skipped') status = 'skipped';
      else status = 'pending';
      // etapas que dependem de dados novos só contam depois de a anterior estar resolvida (feito ou pulado)
      out.push({ id: id, status: status });
    }
    for (i = 0; i < out.length; i++) { if (out[i].status === 'pending') { current = out[i].id; break; } }
    var done = out.filter(function (s) { return s.status === 'done'; }).length, skipped = out.filter(function (s) { return s.status === 'skipped'; });
    return { steps: out, current: current, done: done, total: out.length, skipped: skipped.map(function (s) { return s.id; }), finished: current === null, allDone: done === out.length };
  }

  function initial() { return { v: 1, goal: null, active: false, offered: false, steps: {} }; }
  function markSkipped(saved, id, now) { saved = clone(saved); saved.steps = saved.steps || {}; saved.steps[id] = { s: 'skipped', t: now || new Date().toISOString() }; return saved; }
  function markAck(saved, id, now) { saved = clone(saved); saved.steps = saved.steps || {}; saved.steps[id] = { s: 'done', ack: true, t: now || new Date().toISOString() }; return saved; }
  function setGoal(saved, goal) { saved = clone(saved); if (GOALS[goal]) saved.goal = goal; return saved; }
  function clone(o) { return JSON.parse(JSON.stringify(o || initial())); }

  var core = { STEPS: STEPS, GOALS: GOALS, stepDef: stepDef, detect: detect, evaluate: evaluate, initial: initial, markSkipped: markSkipped, markAck: markAck, setGoal: setGoal };
  if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

  // ───────── Parte 2: tela (só no navegador) ─────────
  var G = { html: null, saved: null, timer: null, el: null, ring: null, activated: null, confirmSkip: null, lastDone: 0, mini: false };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function curTab() { try { return typeof currentTab !== 'undefined' ? currentTab : null; } catch (e) { return null; } }
  function key() { try { return typeof fxKey === 'function' ? fxKey('gd') : 'financa-gd'; } catch (e) { return 'financa-gd'; } }
  function load() {
    var s = null;
    try { s = (typeof PREFS !== 'undefined' && PREFS.data && PREFS.data.gd) || JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) { /* ignore */ }
    G.saved = s && s.v === 1 ? s : initial();
    return G.saved;
  }
  function save() {
    try { localStorage.setItem(key(), JSON.stringify(G.saved)); } catch (e) { /* ignore */ }
    try { if (typeof prefsPush === 'function') prefsPush('gd', G.saved); } catch (e) { /* ignore */ }
  }
  function L(k) { try { return visibleList(k); } catch (e) { return (typeof state !== 'undefined' && state[k]) || []; } }
  function ctx() {
    var tx = L('transactions'), docs = []; try { docs = typeof docsOf === 'function' ? docsOf(state.profile_type) : (state.documents || []); } catch (e) { docs = (typeof state !== 'undefined' && state.documents) || []; }
    var jor = {}; try { jor = (typeof PREFS !== 'undefined' && PREFS.data && PREFS.data.jor) || JSON.parse(localStorage.getItem(fxKey('jor')) || 'null') || {}; } catch (e) { /* ignore */ }
    var budgets = 0; try { budgets = Object.keys(state.budgets || {}).filter(function (k) { return state.budgets[k] > 0; }).length; } catch (e) { /* ignore */ }
    return { incomes: tx.filter(function (t) { return t.type === 'income'; }).length, expenses: tx.filter(function (t) { return t.type === 'expense'; }).length, docs: docs.length, debts: L('debts').filter(function (d) { return (+d.saldo || 0) > 0; }).length, goals: L('goals').length, budgets: budgets, semDividas: !!jor.semDividas, tab: curTab() };
  }
  function ev() { var r = evaluate(ctx(), G.saved || load()); if (r.done > 0) { try { if (typeof funilEvento === 'function') funilEvento('primeira_acao'); } catch (e) { /* ignore */ } } return r; }   // 1ª etapa concluída = 'primeira_acao' no funil (uma vez por aparelho)
  function isOn() { return !!(G.saved && G.saved.active); }
  function toast(m, t) { try { if (typeof showToast === 'function') showToast(m, t || 'success'); } catch (e) { /* ignore */ } }

  function css() {
    if (document.getElementById('gd-style')) return;
    var s = document.createElement('style'); s.id = 'gd-style';
    s.textContent = '#gd-ring{position:fixed;z-index:9998;pointer-events:none;border:3px solid #D4AF4F;border-radius:12px;box-shadow:0 0 0 9999px rgba(6,12,24,.8);animation:gdr 1.6s ease-in-out infinite;transition:all .25s}#gd-dim{position:fixed;inset:0;z-index:9997;background:rgba(6,12,24,.8);pointer-events:none}'
      + '.gd-sh{position:fixed;z-index:9997;background:transparent;cursor:not-allowed}#gd-box.gd-nudge{animation:gdn .45s}@keyframes gdn{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}@keyframes gdr{0%,100%{border-color:#D4AF4F}50%{border-color:#F3DA8C}}@keyframes gdp{0%,100%{opacity:1}50%{opacity:.4}}'
      + '#gd-box{position:fixed;z-index:9999;width:min(360px,calc(100vw - 24px));background:var(--card,#fff);color:var(--ink,#101B2D);border-radius:16px;box-shadow:0 12px 40px rgba(16,27,45,.28);border:1px solid var(--border,#E3E8EF);padding:16px 16px 12px;font-size:14px;line-height:1.5}'
      + '#gd-box.dock{left:12px;right:12px;bottom:12px;width:auto;top:auto}'
      + '#gd-box .gd-top{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--ink-3,#6B7A90);margin-bottom:6px}'
      + '#gd-box .gd-bar{height:4px;border-radius:4px;background:var(--border,#E3E8EF);overflow:hidden;margin-bottom:10px}#gd-box .gd-bar i{display:block;height:100%;background:#D4AF4F;transition:width .4s}'
      + '#gd-box h4{margin:0 0 6px;font-size:16px;font-weight:800}#gd-box p{margin:0 0 8px;color:var(--ink-2,#4A5668)}'
      + '#gd-box .gd-wait{font-size:12.5px;color:var(--ink-3,#6B7A90);display:flex;gap:6px;align-items:center;margin:6px 0 8px}#gd-box .gd-wait:before{content:"";width:8px;height:8px;border-radius:50%;background:#D4AF4F;animation:gdp 1.2s infinite}'
      + '#gd-box .gd-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}'
      + '#gd-box button{border:0;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer;font-size:13.5px;background:var(--teal,#16324F);color:#fff}'
      + '#gd-box button.sec{background:transparent;color:var(--ink-2,#4A5668);text-decoration:underline;font-weight:600}'
      + '#gd-box button.opt{width:100%;text-align:left;background:var(--card-alt,#EAEFF5);color:var(--ink,#101B2D);margin-bottom:6px;border:1px solid var(--border,#E3E8EF)}'
      + '#gd-box .gd-warn{background:var(--amber-light,#FBF1D6);border-radius:10px;padding:10px 12px;margin:6px 0}'
      + '#gd-mini{position:fixed;z-index:9999;right:14px;bottom:14px;background:#16324F;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}'
      + '#gd-card .gd-skip{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--border,#E3E8EF);flex-wrap:wrap}'
      + '#gd-card button{border:0;border-radius:10px;padding:9px 14px;font-weight:800;cursor:pointer;background:var(--teal,#16324F);color:#fff;font-size:14px}';
    document.head.appendChild(s);
  }
  function resolveTarget(stepId, goal) {
    var q = function (s) { return document.querySelector(s); };
    var modal = q('#modal-overlay.open');
    if (stepId === 'doc') return { el: q('#main .upload-zone') || q('#main .upload-zone-title'), hint: 'Clique aqui ou arraste o arquivo.' };
    if (stepId === 'renda' || stepId === 'gastos') {
      if (modal) {
        var d = q('#m-date'), de = q('#m-desc'), am = q('#m-amount');
        if (d && !d.value.trim()) return { el: d, hint: 'Digite a data no formato DD/MM. Exemplo: 05/11.' };
        if (de && !de.value.trim()) return { el: de, hint: stepId === 'renda' ? 'Descreva a entrada. Exemplo: Salário.' : 'Descreva o gasto. Exemplo: Aluguel.' };
        if (am && !am.value.trim()) return { el: am, hint: 'Digite o valor. Pode usar 3.200,50.' };
        return { el: q('#modal-overlay .modal-body .btn-save') || q('.btn-save'), hint: 'Agora clique em Salvar.' };
      }
      var btns = document.querySelectorAll('#main button, #main a.btn-add'), b = null;
      for (var i = 0; i < btns.length; i++) { if (/^\s*\+\s*Novo\b/.test(btns[i].textContent || '')) { b = btns[i]; break; } }
      return { el: b, hint: 'Clique em "+ Novo".' };
    }
    if (stepId === 'resultado') return { el: q('#main .kpi-grid') || q('#main .hero-card'), hint: '' };
    if (stepId === 'proximo') {
      if (modal) return { el: q('#modal-overlay .modal-body .form-input') || q('#modal-overlay .modal-body'), hint: 'Preencha e salve.' };
      var nb = null, bb = document.querySelectorAll('#main button, #main a.btn-add');
      for (var j = 0; j < bb.length; j++) { if (/^\s*\+\s*(Novo|Nova)\b/.test(bb[j].textContent || '')) { nb = bb[j]; break; } }
      return { el: nb, hint: '' };
    }
    return { el: null, hint: '' };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function place(box, target) {
    var vw = window.innerWidth, vh = window.innerHeight, narrow = vw < 700;
    box.classList.toggle('dock', narrow);
    if (!G.ring) { G.ring = document.createElement('div'); G.ring.id = 'gd-ring'; document.body.appendChild(G.ring); }
    if (target && target.el && target.el.getBoundingClientRect) {
      var r = target.el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        if (r.top < 60 || r.bottom > vh - 20) { try { target.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ } }
        var mdl = document.querySelector('#modal-overlay.open .modal'), mr = mdl && mdl.getBoundingClientRect();
        if (mr && mr.width > 0) shield({ l: mr.left, t: mr.top, r: mr.right, b: mr.bottom }); else shield({ l: r.left - 6, t: r.top - 6, r: r.right + 6, b: r.bottom + 6 });
        dim(false); G.ring.style.display = 'block'; G.ring.style.left = (r.left - 6) + 'px'; G.ring.style.top = (r.top - 6) + 'px'; G.ring.style.width = (r.width + 12) + 'px'; G.ring.style.height = (r.height + 12) + 'px';
        if (!narrow) {
          var bw = 360, bh = box.offsetHeight || 220, left = clamp(r.left, 12, vw - bw - 12), top = r.bottom + 16;
          if (top + bh > vh - 12) top = r.top - bh - 16;
          if (top < 12) { top = clamp(vh - bh - 16, 12, vh); left = clamp(r.right + 16, 12, vw - bw - 12); }
          box.style.left = left + 'px'; box.style.top = top + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto';
        }
        return;
      }
    }
    G.ring.style.display = 'none'; unshield(); dim(true);
    if (!narrow) { box.style.left = 'auto'; box.style.right = '24px'; box.style.top = 'auto'; box.style.bottom = '24px'; }
  }
  // TRAVA: enquanto há um alvo na tela, só o alvo (ou o formulário aberto) e o balão respondem a clique.
  // Quatro painéis transparentes cobrem o resto da tela; o "buraco" é a área liberada.
  var SH = ['t', 'b', 'l', 'r'];
  function unshield() { SH.forEach(function (k) { var e = document.getElementById('gd-sh-' + k); if (e) e.remove(); }); }
  function nudge() { if (!G.el) return; G.el.classList.remove('gd-nudge'); void G.el.offsetWidth; G.el.classList.add('gd-nudge'); setTimeout(function () { if (G.el) G.el.classList.remove('gd-nudge'); }, 500); }
  function shield(a) {   // a = {l,t,r,b} em pixels da janela
    var vw = window.innerWidth, vh = window.innerHeight;
    var pos = { t: [0, 0, vw, Math.max(0, a.t)], b: [0, a.b, vw, Math.max(0, vh - a.b)], l: [0, a.t, Math.max(0, a.l), Math.max(0, a.b - a.t)], r: [a.r, a.t, Math.max(0, vw - a.r), Math.max(0, a.b - a.t)] };
    SH.forEach(function (k) {
      var e = document.getElementById('gd-sh-' + k);
      if (!e) { e = document.createElement('div'); e.id = 'gd-sh-' + k; e.className = 'gd-sh'; e.setAttribute('aria-hidden', 'true'); e.addEventListener('click', nudge); document.body.appendChild(e); }
      var p = pos[k]; e.style.left = p[0] + 'px'; e.style.top = p[1] + 'px'; e.style.width = p[2] + 'px'; e.style.height = p[3] + 'px';
    });
  }
  function dim(on) { var d = document.getElementById('gd-dim'); if (on && !d) { d = document.createElement('div'); d.id = 'gd-dim'; document.body.appendChild(d); } else if (!on && d) d.remove(); }
  function progressText(id, c) {
    if (id === 'gastos') return ' (' + Math.min(c.expenses, 5) + ' de 5)';
    return '';
  }
  function resultHtml() {
    try {
      var c = compute(), f = typeof fmtD === 'function' ? fmtD : function (v) { return v.toFixed(2); }, sign = c.resultado < 0 ? 'faltaram ' : 'sobraram ';
      return '<div class="gd-warn" style="background:var(--card-alt,#EAEFF5)">Neste mês entraram <b>' + f(c.totalIncome) + '</b>, saíram <b>' + f(c.totalExpense) + '</b> e ' + sign + '<b>' + f(Math.abs(c.resultado)) + '</b>.</div>';
    } catch (e) { return ''; }
  }
  function render() {
    if (!isOn()) { hide(); return; }
    css(); var e = ev(), c = ctx();
    if (e.finished) { finish(e); return; }
    var id = e.current, def = stepDef(id, G.saved.goal), idx = STEPS.map(function (s) { return s.id; }).indexOf(id);
    if (G.activated !== id) {   // ao entrar numa etapa, leva o cliente até a aba certa (uma vez)
      G.activated = id; G.confirmSkip = null; G.mini = false;
      try { if (def.tab && curTab() !== def.tab && typeof switchTab === 'function') switchTab(def.tab); } catch (er) { /* ignore */ }
    }
    if (G.mini) { showMini(); return; }
    if (G.mini === false && document.getElementById('gd-mini')) document.getElementById('gd-mini').remove();
    if (!G.el) { G.el = document.createElement('div'); G.el.id = 'gd-box'; G.el.setAttribute('role', 'dialog'); G.el.setAttribute('aria-live', 'polite'); G.el.setAttribute('aria-label', 'Guia de primeiros passos'); document.body.appendChild(G.el); }
    var target = resolveTarget(id, G.saved.goal), off = def.tab && curTab() !== def.tab && !(document.querySelector('#modal-overlay.open'));
    var html = '<div class="gd-top"><span>Passo ' + (idx + 1) + ' de ' + STEPS.length + '</span><span>' + e.done + ' concluídos</span></div><div class="gd-bar"><i style="width:' + Math.round(e.done / e.total * 100) + '%"></i></div>';
    if (G.confirmSkip === id) {
      html += '<h4>Pular esta etapa?</h4><div class="gd-warn">' + esc(def.warn) + '</div><p>A etapa continua pendente. Você pode retomá-la quando quiser pela Visão Geral.</p><div class="gd-row"><button data-gd="back">Voltar</button><button class="sec" data-gd="skipok">Pular mesmo assim</button></div>';
    } else if (id === 'meta') {
      html += '<h4>' + esc(def.title) + '</h4><p>' + esc(def.text) + '</p>' + Object.keys(GOALS).map(function (k) { return '<button class="opt" data-gd="goal:' + k + '">' + esc(GOALS[k].label) + '</button>'; }).join('')
        + '<div class="gd-row"><button class="sec" data-gd="skip">Pular esta etapa</button><button class="sec" data-gd="mini">Continuar depois</button></div>';
    } else if (id === 'resultado') {
      var onDash = curTab() === 'dashboard';
      html += '<h4>' + esc(def.title) + '</h4><p>' + esc(def.text) + '</p>' + (onDash ? resultHtml() + '<div class="gd-row"><button data-gd="ack">Entendi, continuar</button><button class="sec" data-gd="skip">Pular esta etapa</button></div>' : '<div class="gd-wait">' + esc(def.wait) + '</div><div class="gd-row"><button data-gd="go">Levar até lá</button><button class="sec" data-gd="skip">Pular esta etapa</button></div>');
    } else {
      var docNote = '';
      try { var pend = docsOf(state.profile_type).filter(function (d) { return d.status !== 'processado'; }).length; if (pend && id !== 'doc') docNote = '<div class="gd-warn">Seu documento ficou em <b>A revisar</b>: não consegui ler com segurança. Vamos seguir, e você confere depois na aba Documentos.</div>'; } catch (er) { /* ignore */ }
      html += '<h4>' + esc(def.title) + progressText(id, c) + '</h4><p>' + esc(def.text) + '</p>' + (target.hint ? '<p><b>' + esc(target.hint) + '</b></p>' : '') + docNote
        + '<div class="gd-wait">' + esc(def.wait) + '</div><div class="gd-row">' + (off ? '<button data-gd="go">Levar até lá</button>' : '') + '<button class="sec" data-gd="skip">Pular esta etapa</button><button class="sec" data-gd="mini">Continuar depois</button></div>';
    }
    G.el.style.display = 'block';
    if (G.html !== html) {   // só redesenha o balão quando o conteúdo muda: refazer a cada tique "comia" cliques nos botões
      G.html = html; G.el.innerHTML = html;
      G.el.querySelectorAll('[data-gd]').forEach(function (b) { b.onclick = function () { act(b.getAttribute('data-gd')); }; });
    }
    place(G.el, id === 'meta' || G.confirmSkip === id ? { el: null } : target);
  }
  function showMini() {
    dim(false); unshield(); if (G.el) G.el.style.display = 'none'; if (G.ring) G.ring.style.display = 'none';
    var m = document.getElementById('gd-mini');
    if (!m) { m = document.createElement('button'); m.id = 'gd-mini'; m.textContent = 'Continuar o guia'; m.onclick = function () { G.mini = false; G.activated = null; render(); }; document.body.appendChild(m); }
  }
  function hide() { G.html = null; dim(false); unshield(); if (G.el) G.el.style.display = 'none'; if (G.ring) G.ring.style.display = 'none'; var m = document.getElementById('gd-mini'); if (m) m.remove(); }
  function finish(e) {
    G.saved.active = false; G.saved.finishedAt = new Date().toISOString(); save(); hide(); stopTimer();
    if (e.skipped.length) toast('Guia encerrado. Faltam ' + e.skipped.length + ' etapa(s) puladas: retome pela Visão Geral.', 'info');
    else toast('Parabéns! Você concluiu os primeiros passos.', 'success');
    try { if (typeof renderCurrentTab === 'function') renderCurrentTab(); } catch (er) { /* ignore */ }
  }
  function act(a) {
    var e = ev(), id = e.current;
    if (a.indexOf('goal:') === 0) { G.saved = setGoal(G.saved, a.slice(5)); save(); toast('Combinado! Vou organizar os passos em volta disso.', 'success'); }
    else if (a === 'skip') G.confirmSkip = id;
    else if (a === 'back') G.confirmSkip = null;
    else if (a === 'skipok') { G.saved = markSkipped(G.saved, id); G.confirmSkip = null; save(); }
    else if (a === 'ack') { G.saved = markAck(G.saved, id); save(); }
    else if (a === 'go') { var d = stepDef(id, G.saved.goal); try { switchTab(d.tab); } catch (er) { /* ignore */ } }
    else if (a === 'mini') { G.mini = true; }
    G.activated = (a === 'goal:' || /^goal:|skipok|ack/.test(a)) ? null : G.activated;
    render();
  }
  function tick() {
    if (!isOn()) return;
    var before = G.lastDone, e = ev();
    if (e.done !== before) {   // uma etapa foi concluída de verdade
      if (e.done > before && before !== 0 || (e.done > before && G.lastSeen)) toast('Etapa concluída!', 'success');
      G.lastDone = e.done; G.activated = null; G.confirmSkip = null;
    }
    G.lastSeen = true; render();
  }
  var rafS = 0; function onScroll() { if (rafS) return; rafS = requestAnimationFrame(function () { rafS = 0; if (isOn() && !G.mini) render(); }); }
  function startTimer() { stopTimer(); G.timer = setInterval(tick, 700); window.addEventListener('resize', onResize); window.addEventListener('scroll', onScroll, true); }
  function stopTimer() { if (G.timer) clearInterval(G.timer); G.timer = null; window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll, true); }
  function onResize() { render(); }

  var Guia = {
    isOn: isOn,
    state: function () { return { saved: G.saved, eval: ev() }; },
    start: function (opts) {
      load(); G.saved.active = true; G.saved.offered = true; delete G.saved.finishedAt;
      if (opts && opts.restart) { G.saved.steps = {}; G.saved.goal = null; }
      save(); G.activated = null; G.mini = false; G.lastDone = ev().done; G.lastSeen = false; startTimer(); render();
    },
    resume: function () { this.start(); },
    stop: function () { G.html = null; dim(false); unshield(); stopTimer(); G.el && G.el.remove(); G.ring && G.ring.remove(); var m = document.getElementById('gd-mini'); if (m) m.remove(); G.el = null; G.ring = null; G.saved = null; G.activated = null; },
    // chamada depois do login e do carregamento dos dados: retoma de onde parou ou oferece o guia a conta nova
    boot: function () {
      this.stop(); load();
      var demo = false; try { demo = !!(DEMO && DEMO.on); } catch (e) { /* ignore */ }
      if (demo) return;
      if (G.saved.active) { G.lastDone = ev().done; G.lastSeen = false; startTimer(); render(); return; }
      var c = ctx();
      if (!G.saved.offered && !G.saved.finishedAt && c.incomes + c.expenses + c.docs === 0) {   // conta nova e vazia: oferece uma vez
        G.saved.offered = true; save();
        setTimeout(function () { try { if (!(root.Onboard && Onboard.isOn && Onboard.isOn()) && !document.querySelector('#modal-overlay.open')) Guia.start(); } catch (e) { /* ignore */ } }, 2500);
      }
    },
    card: function () {   // cartão na Visão Geral: começar, continuar ou retomar etapas puladas
      try {
        css(); load(); var e = ev();
        if (G.saved.active) return '<div class="card mb-24 animate-in" id="gd-card"><div class="card-title">Primeiros passos guiados</div><p style="margin:6px 0 10px">Você está na etapa ' + (STEPS.map(function (s) { return s.id; }).indexOf(e.current) + 1) + ' de ' + STEPS.length + '. Continue de onde parou.</p><button onclick="Guia.resume()">Continuar o guia</button></div>';
        if (e.skipped.length) {
          return '<div class="card mb-24 animate-in" id="gd-card"><div class="card-title">Retomar etapas puladas</div>' + e.skipped.map(function (id) { var d = stepDef(id, G.saved.goal); return '<div class="gd-skip"><span>' + esc(d.title) + '</span><button onclick="Guia.resumeAt(\'' + id + '\')">Retomar</button></div>'; }).join('') + '</div>';
        }
        var cx = ctx(); if (!e.allDone && !G.saved.finishedAt && !G.saved.offered && cx.incomes + cx.expenses + cx.docs === 0) return   /* convite só para conta vazia; quem já tem dados vê a Jornada */ '<div class="card mb-24 animate-in" id="gd-card"><div class="card-title">Primeiros passos guiados</div><p style="margin:6px 0 10px">Eu te levo campo por campo, em poucos minutos.</p><button onclick="Guia.start()">Começar</button></div>';
        if (!e.allDone && !G.saved.active && G.saved.offered && !G.saved.finishedAt) return '<div class="card mb-24 animate-in" id="gd-card"><div class="card-title">Primeiros passos guiados</div><p style="margin:6px 0 10px">Faltam ' + (e.total - e.done) + ' etapas. Continue de onde parou.</p><button onclick="Guia.resume()">Continuar o guia</button></div>';
      } catch (er) { /* ignore */ }
      return '';
    },
    resumeAt: function (id) {   // reabre uma etapa pulada: ela volta a ser pendente
      load(); if (G.saved.steps && G.saved.steps[id]) delete G.saved.steps[id]; save(); this.start();
    },
    _model: core
  };
  root.Guia = Guia; root.guiaCard = Guia.card;
})(typeof window !== 'undefined' ? window : this);
