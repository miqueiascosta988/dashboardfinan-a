/* SM Financial — medição do funil (triagem -> apresentação -> checkout). Anônima: guarda só um código aleatório do visitante e a origem/campanha do link.
 * Não coleta nome, e-mail, telefone nem respostas da triagem. Respeita o "Não rastrear" do navegador. */
(function () {
  'use strict';
  var KEY = 'sm_funil', mem = null;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return mem; } }
  function write(o) { mem = o; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function clean(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n || 60); }
  function rid() { try { return crypto.randomUUID(); } catch (e) { return 'v' + Math.random().toString(16).slice(2) + Date.now().toString(16); } }
  var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
  var st = read() || { v: rid() };
  var q = new URLSearchParams(location.search);
  // Primeiro contato manda: só grava a campanha se ainda não houver uma.
  var camp = clean(q.get('utm_campaign'), 100), src = clean(q.get('utm_source') || q.get('src')), med = clean(q.get('utm_medium')), cont = clean(q.get('utm_content'));
  if (!st.c && camp) st.c = camp;
  if (!st.s && src) st.s = src;
  if (!st.m && med) st.m = med;
  if (!st.ct && cont) st.ct = cont;
  write(st);

  function track(etapa) {
    if (dnt) return;
    var body = JSON.stringify({ etapa: etapa, visitor: st.v, campanha: st.c || null, src: st.s || null, medium: st.m || null, content: st.ct || null });
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/funil/evento', new Blob([body], { type: 'application/json' }))) return; } catch (e) {}
    try { fetch('/api/funil/evento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
  }
  // Clique para fora do site (checkout da Hotmart): registra e leva o código do visitante e a campanha no link (parâmetros src e sck da Hotmart).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var u; try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (u.host === location.host || !/^https?:$/.test(u.protocol)) return;
    if (/hotmart|pay\./i.test(u.host)) {
      if (st.c || st.s) u.searchParams.set('src', clean((st.c || st.s), 60).replace(/[^\w.-]+/g, '_'));
      u.searchParams.set('sck', st.v);
      a.href = u.toString();
      track('checkout_clique');
    }
  }, true);
  var page = /\/triagem/.test(location.pathname) ? 'triagem_visita' : /\/apresentacao/.test(location.pathname) ? 'apresentacao_visita' : null;
  if (page) track(page);
  window.smFunil = { track: track, state: function () { return { visitor: st.v, campanha: st.c || null }; } };
})();
