/* Acessibilidade básica (AUD-04 e AUD-05): dá nome aos campos sem rótulo, deixa teclado e leitor de tela chegarem
   aos elementos clicáveis feitos com div/span e cria o link "Pular para o conteúdo". Só acrescenta atributos; não muda layout. */
(function (root) {
  'use strict';
  var NATIVOS = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|OPTION)$/;
  function limpar(t) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, 80); }
  // Nome do campo: rótulo do grupo > elemento anterior > texto solto ao lado > placeholder > nome genérico pelo tipo.
  function nomeDoCampo(el) {
    var t = '', grp = el.closest('.form-group, .sim-row, .field, .card, div');
    var lab = grp && grp.querySelector('label, .form-label, .sim-label, .form-hint');
    if (lab && lab !== el && !lab.contains(el)) t = limpar(lab.textContent);
    if (!t) { var p = el.previousElementSibling; if (p && !NATIVOS.test(p.tagName)) t = limpar(p.textContent); }
    if (!t && el.parentElement) t = limpar(Array.prototype.filter.call(el.parentElement.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join(' '));
    if (!t) t = limpar(el.getAttribute('placeholder'));
    if (!t) t = el.type === 'file' ? 'Escolher arquivo' : el.type === 'range' ? 'Ajustar valor' : el.tagName === 'SELECT' ? 'Escolher opção' : 'Campo';
    return t;
  }
  function nomear(rootEl) {
    (rootEl || document).querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea').forEach(function (el) {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return;
      if (el.labels && el.labels.length) return;
      el.setAttribute('aria-label', nomeDoCampo(el));
    });
  }
  // div/span com onclick viram botões para teclado e leitor de tela (sem tocar nos que já são nativos).
  function tornarAcessiveis(rootEl) {
    (rootEl || document).querySelectorAll('[onclick]').forEach(function (el) {
      if (NATIVOS.test(el.tagName) || el.getAttribute('role') || el.hasAttribute('tabindex')) return;
      if (el.querySelector('a,button,input,select,textarea')) return;
      el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
      if (!el.getAttribute('aria-label') && !limpar(el.textContent)) el.setAttribute('aria-label', 'Abrir');
    });
  }
  function aplicar() { try { nomear(document); tornarAcessiveis(document); } catch (e) { /* nunca quebra o app */ } }
  function pular() {
    if (document.querySelector('.skip-link')) return;
    var a = document.createElement('a'); a.className = 'skip-link'; a.href = '#main'; a.textContent = 'Pular para o conteúdo';
    a.addEventListener('click', function (ev) { var m = document.getElementById('main'); if (!m) return; ev.preventDefault(); m.setAttribute('tabindex', '-1'); m.focus(); });
    document.body.insertBefore(a, document.body.firstChild);
  }
  function iniciar() {
    pular(); aplicar(); var agendado = false;
    new MutationObserver(function () { if (agendado) return; agendado = true; (root.requestAnimationFrame || setTimeout)(function () { agendado = false; aplicar(); }); }).observe(document.body, { childList: true, subtree: true });
    // Enter e Espaço ativam os elementos que viraram botões.
    document.addEventListener('keydown', function (e) {
      var el = e.target; if (!el || el.getAttribute('role') !== 'button' || NATIVOS.test(el.tagName)) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  }
  var api = { nomeDoCampo: nomeDoCampo, nomear: nomear, tornarAcessiveis: tornarAcessiveis, aplicar: aplicar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.A11y = api; if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar(); } }
})(typeof window !== 'undefined' ? window : this);
