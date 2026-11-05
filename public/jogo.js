/* Jogo — sequência de dias, missões da semana, selos, nível e lembrete diário.
   Regra de ouro: só premia AÇÕES QUE AJUDAM (registrar, enviar documento, abrir a análise), nunca "gastar" nem tempo de uso.
   Parte 1: contas puras (testadas em Node). Parte 2: tela e lembrete (usa funções globais do app).
   Lembrete: notificação local do navegador. Só dispara com o app/PWA aberto ou em segundo plano; com o app fechado
   seria preciso Web Push (servidor), que NÃO está incluído aqui. */
(function (root) {
  'use strict';
  var KEY = 'sm_jogo';

  // ───────── Parte 1: lógica pura ─────────
  function dkey(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDias(k, n) { var p = k.split('-').map(Number); return dkey(new Date(p[0], p[1] - 1, p[2] + n)); }
  function semanaKey(k) {   // semana ISO (segunda a domingo): AAAA-Www
    var p = k.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2])), dia = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dia);
    var ini = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)), n = Math.ceil(((d - ini) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + '-W' + ('0' + n).slice(-2);
  }
  // Dias seguidos com atividade. Vale até o fim de hoje (se hoje ainda não teve, conta a partir de ontem).
  // "Dia de graça": 1 dia perdido entre dois dias ativos é perdoado, no máximo 1 vez a cada 7 dias.
  function sequencia(dias, hoje) {
    var set = {}; (dias || []).forEach(function (k) { set[k] = 1; });
    var cur = set[hoje] ? hoje : addDias(hoje, -1);
    if (!set[cur]) return { n: 0, graca: false, hoje: false };
    var n = 0, i = 0, ultima = -99, graca = false;
    for (var guard = 0; guard < 800; guard++) {
      if (set[cur]) { n++; cur = addDias(cur, -1); i++; continue; }
      var ant = addDias(cur, -1);
      if (set[ant] && i - ultima >= 7) { ultima = i; graca = true; cur = ant; i++; continue; }
      break;
    }
    return { n: n, graca: graca, hoje: !!set[hoje] };
  }
  var MISSOES = {
    lanc5: { titulo: 'Registre 5 lançamentos', dica: 'Renda ou gasto, à mão ou por extrato.' },
    doc: { titulo: 'Envie 1 documento ou extrato', dica: 'Boleto, fatura, holerite ou extrato.' },
    meta: { titulo: 'Crie uma meta nova', dica: 'Uma reserva, uma viagem, uma dívida a quitar.' },
    saude: { titulo: 'Abra a sua Saúde Financeira', dica: 'Veja a nota e o ponto de atenção.' },
    orc: { titulo: 'Confira o seu Orçamento', dica: 'Veja os limites por categoria.' }
  };
  function missoesDaSemana(wk) {   // 3 por semana: lanc5 sempre + 2 que giram
    var n = parseInt(String(wk).split('-W')[1], 10) || 0, rot = ['doc', 'meta', 'saude', 'orc'];
    return ['lanc5', rot[n % 4], rot[(n + 1) % 4]];
  }
  var SELOS = [
    { id: 'primeiro-lancamento', e: '✍️', nome: 'Primeiro lançamento' }, { id: 'primeiro-doc', e: '📄', nome: 'Primeiro documento' },
    { id: 'seq-3', e: '🔥', nome: '3 dias seguidos' }, { id: 'seq-7', e: '🔥', nome: '7 dias seguidos' }, { id: 'seq-30', e: '🏆', nome: '30 dias seguidos' },
    { id: 'meta-50', e: '🎯', nome: 'Meta na metade' }, { id: 'no-azul', e: '💚', nome: 'Período no azul' }
  ];
  function nivel(nota) {
    if (nota == null) return { nome: 'Sem nota ainda', dica: 'Lance renda e gastos para ver o seu nível.' };
    if (nota >= 80) return { nome: 'Sólido', dica: 'Suas finanças estão bem sustentadas.' };
    if (nota >= 60) return { nome: 'Estável', dica: 'Bom caminho. Falta pouco para o próximo nível.' };
    if (nota >= 40) return { nome: 'Organizando', dica: 'Já saiu do zero. Foque no ponto de atenção.' };
    return { nome: 'Começando', dica: 'O primeiro passo é registrar o mês.' };
  }
  var API = { dkey: dkey, addDias: addDias, semanaKey: semanaKey, sequencia: sequencia, missoesDaSemana: missoesDaSemana, MISSOES: MISSOES, SELOS: SELOS, nivel: nivel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;

  // ───────── Parte 2: estado, tela e lembrete ─────────
  var S = { dias: [], sem: null, selos: {}, lembrete: { on: false, hora: 20 }, lembrouEm: null };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function hojeK() { return dkey(new Date()); }
  function load() { try { var j = JSON.parse(ls(KEY) || 'null'); if (j) { S.dias = j.dias || []; S.sem = j.sem || null; S.selos = j.selos || {}; S.lembrete = j.lembrete || S.lembrete; S.lembrouEm = j.lembrouEm || null; } } catch (e) {} }
  function save() { S.dias = S.dias.slice(-400); ls(KEY, JSON.stringify(S)); try { if (typeof prefsPush === 'function') prefsPush('jogo', S); } catch (e) {} }
  function nuvem() {   // junta com o que veio da conta (outro aparelho): une dias e selos, mantém a semana mais nova
    try {
      var c = (typeof PREFS !== 'undefined' && PREFS.data && PREFS.data.jogo) || null; if (!c) return;
      var set = {}; S.dias.concat(c.dias || []).forEach(function (k) { set[k] = 1; }); S.dias = Object.keys(set).sort();
      Object.keys(c.selos || {}).forEach(function (k) { if (!S.selos[k]) S.selos[k] = c.selos[k]; });
      if (c.sem && (!S.sem || c.sem.k > S.sem.k)) S.sem = c.sem;
      if (c.lembrete && !S.lembrete.on) S.lembrete = c.lembrete;
    } catch (e) {}
  }
  function esc(s) { return typeof fxEsc === 'function' ? fxEsc(s) : String(s); }
  function metasQtd() { try { return visibleList('goals').length; } catch (e) { return 0; } }
  function semana() {
    var k = semanaKey(hojeK());
    if (!S.sem || S.sem.k !== k) S.sem = { k: k, lanc: 0, doc: 0, g0: metasQtd(), visitas: {}, feitas: [] };
    return S.sem;
  }
  function feita(id, w) {
    if (id === 'lanc5') return w.lanc >= 5; if (id === 'doc') return w.doc >= 1; if (id === 'meta') return metasQtd() > w.g0;
    if (id === 'saude') return !!w.visitas.saude; if (id === 'orc') return !!w.visitas.orcamento; return false;
  }
  function toast(m) { try { showToast(m, 'success'); } catch (e) {} }
  function ganha(id) { if (S.selos[id]) return; S.selos[id] = hojeK(); var s = SELOS.filter(function (x) { return x.id === id; })[0]; if (s) setTimeout(function () { toast('Novo selo: ' + s.e + ' ' + s.nome); }, 300); }
  function avaliar(c) {
    var w = semana(), seq = sequencia(S.dias, hojeK());
    missoesDaSemana(w.k).forEach(function (id) { if (w.feitas.indexOf(id) < 0 && feita(id, w)) { w.feitas.push(id); setTimeout(function () { toast('Missão cumprida: ' + MISSOES[id].titulo + ' ✔'); }, 200); } });
    if (seq.n >= 3) ganha('seq-3'); if (seq.n >= 7) ganha('seq-7'); if (seq.n >= 30) ganha('seq-30');
    try {
      if (visibleList('goals').some(function (g) { return g.target > 0 && g.current / g.target >= 0.5; })) ganha('meta-50');
      if (c) { var tx = filterByPeriod(visibleList('transactions'), 'date'); if (tx.length >= 5 && c.totalIncome > c.totalExpense) ganha('no-azul'); }
    } catch (e) {}
  }
  function registrar(tipo, n) {
    var h = hojeK(), w = semana(); n = n > 0 ? n : 1;
    if (S.dias.indexOf(h) < 0) S.dias.push(h);
    if (tipo === 'doc') { w.doc += 1; ganha('primeiro-doc'); } else { w.lanc += n; ganha('primeiro-lancamento'); }
    avaliar(); save();
  }
  function visitou(tab) { var w = semana(); if ((tab === 'saude' || tab === 'orcamento') && !w.visitas[tab]) { w.visitas[tab] = 1; avaliar(); save(); } }
  function ativoHoje() { return S.dias.indexOf(hojeK()) >= 0; }

  function cardHtml(c) {
    var w = semana(); avaliar(c); save();
    var seq = sequencia(S.dias, hojeK()), nv = nivel(c ? c.healthTotal : null), ms = missoesDaSemana(w.k);
    var linhaSeq = seq.n > 0 ? '🔥 <b>' + seq.n + ' dia' + (seq.n > 1 ? 's' : '') + ' seguido' + (seq.n > 1 ? 's' : '') + '</b>' + (seq.hoje ? ' · hoje já conta ✔' : ' · registre algo hoje para manter a sequência') : '🔥 Comece a sua sequência: registre um lançamento hoje.';
    var h = '<div class="card animate-in" style="margin-bottom:16px"><div class="card-title">🎮 Seu progresso</div>'
      + '<div style="margin:8px 0">' + linhaSeq + '</div><div style="color:var(--ink-3);font-size:13px;margin-bottom:10px">Nível: <b>' + esc(nv.nome) + '</b> · ' + esc(nv.dica) + '</div>'
      + '<div class="card-subtitle" style="margin-bottom:6px">Missões desta semana</div>'
      + ms.map(function (id) { var ok = w.feitas.indexOf(id) >= 0; return '<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><span aria-hidden="true">' + (ok ? '✅' : '⬜') + '</span><div><div style="' + (ok ? 'text-decoration:line-through;color:var(--ink-3)' : '') + '">' + MISSOES[id].titulo + '</div><div style="font-size:12px;color:var(--ink-3)">' + MISSOES[id].dica + '</div></div></div>'; }).join('');
    var ganhos = SELOS.filter(function (s) { return S.selos[s.id]; });
    h += '<details style="margin-top:10px"><summary style="cursor:pointer">Selos (' + ganhos.length + ' de ' + SELOS.length + ') e lembrete</summary><div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0">'
      + SELOS.map(function (s) { var ok = !!S.selos[s.id]; return '<span title="' + esc(s.nome) + '" style="padding:4px 8px;border-radius:12px;border:1px solid var(--border);' + (ok ? '' : 'opacity:.45;filter:grayscale(1)') + '">' + s.e + ' ' + esc(s.nome) + '</span>'; }).join('')
      + '</div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="jg-lemb" ' + (S.lembrete.on ? 'checked' : '') + ' onchange="Jogo.lembrete(this.checked)"> Lembrete diário às ' + S.lembrete.hora + 'h se eu ainda não registrei nada</label>'
      + '<div style="font-size:12px;color:var(--ink-3);margin-top:4px">Funciona com o app aberto ou instalado em segundo plano. Com o app fechado, o lembrete aparece no sino ao abrir.</div></details></div>';
    return h;
  }

  // ───── Lembrete ─────
  function notificar(titulo, corpo) {
    function plano() { try { new Notification(titulo, { body: corpo, icon: '/icons/icon-192.png', tag: 'sm-lembrete' }); } catch (e) {} }
    try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) { navigator.serviceWorker.getRegistration().then(function (r) { if (r && r.showNotification) r.showNotification(titulo, { body: corpo, icon: '/icons/icon-192.png', tag: 'sm-lembrete' }); else plano(); }).catch(plano); return; } } catch (e) {}
    plano();
  }
  function lembrete(on) {
    if (!on) { S.lembrete.on = false; save(); return; }
    if (!('Notification' in window)) { S.lembrete.on = false; save(); try { showToast('Este navegador não permite lembretes. Use o sino do app.', 'info'); } catch (e) {} var c = document.getElementById('jg-lemb'); if (c) c.checked = false; return; }
    Notification.requestPermission().then(function (p) {
      S.lembrete.on = (p === 'granted'); save();
      try { showToast(p === 'granted' ? 'Lembrete diário ativado ✔' : 'Sem permissão de notificação: o lembrete ficou desligado.', p === 'granted' ? 'success' : 'info'); } catch (e) {}
      var c = document.getElementById('jg-lemb'); if (c) c.checked = S.lembrete.on;
    });
  }
  function checarLembrete() {
    try {
      if (!S.lembrete.on || !('Notification' in window) || Notification.permission !== 'granted') return;
      var h = hojeK(); if (ativoHoje() || S.lembrouEm === h || new Date().getHours() < S.lembrete.hora) return;
      S.lembrouEm = h; save(); var seq = sequencia(S.dias, h);
      notificar('SM Financial', seq.n > 0 ? 'Sua sequência de ' + seq.n + ' dia(s) está em jogo. Registre um gasto de hoje em 10 segundos.' : 'Que tal registrar o que gastou hoje? Leva 10 segundos.');
    } catch (e) {}
  }
  function notifs() {   // vai para o sino do app
    if (ativoHoje()) return [];
    var seq = sequencia(S.dias, hojeK());
    return [{ id: 'lembrete-hoje-' + hojeK(), icon: '📝', type: 'info', title: 'Registre o que gastou hoje', desc: seq.n > 0 ? 'Sua sequência de ' + seq.n + ' dia(s) continua se você registrar algo hoje.' : 'Leva 10 segundos e começa a sua sequência.', time: 'Hoje', tab: 'despesas' }];
  }
  function aoEntrar() { load(); nuvem(); semana(); save(); checarLembrete(); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checarLembrete(); });
  setInterval(checarLembrete, 5 * 60 * 1000);

  root.Jogo = Object.assign({}, API, { registrar: registrar, visitou: visitou, cardHtml: cardHtml, lembrete: lembrete, checarLembrete: checarLembrete, notifs: notifs, aoEntrar: aoEntrar, estado: function () { return S; } });
  load();
})(typeof window !== 'undefined' ? window : globalThis);
