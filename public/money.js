/* Money — leitura e exibição de valores em reais, no jeito que o brasileiro digita.
   Funções puras (sem DOM) + um "melhorador" de campos marcados com data-money.
   Regras (documentadas, para não haver surpresa):
   - "3.200,50", "3200,50", "3200.50" e "R$ 3.200,50" valem todos 3200,50.
   - Com vírgula e ponto juntos, o ÚLTIMO símbolo é o decimal ("1.234,5" e "1,234.5" = 1234,5).
   - Só vírgula: é decimal ("12,5" = 12,50). Várias vírgulas: separador de milhar ("1,234,567").
   - Só ponto: vários pontos = milhar ("1.234.567"). Um ponto com exatamente 3 dígitos depois e 1 a 3 antes
     (e sem começar com zero) = milhar, como se escreve no Brasil ("3.200" = 3200). Qualquer outro caso = decimal ("1500.75", "3.5").
   - Mais de 2 casas decimais é inválido (nunca arredonda calado). Letras e símbolos soltos são inválidos.
   - Negativo só é aceito quando o campo permite (data-money-neg).
   O valor mostrado embaixo do campo ("= R$ 3.200,50") deixa a interpretação visível antes de salvar. */
(function (root) {
  'use strict';
  var r2 = function (v) { return Math.round(v * 100 + (v < 0 ? -1e-9 : 1e-9)) / 100; };

  // Devolve { ok, value, empty, reason }. value é number (2 casas) quando ok.
  function parse(input, opts) {
    opts = opts || {};
    var s = input == null ? '' : String(input);
    s = s.replace(/R\$/gi, '').replace(/[\s ]/g, '');
    if (s === '') return { ok: true, empty: true, value: null };
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.charAt(0) === '-' || s.charAt(0) === '−') { neg = true; s = s.slice(1); }
    if (s.charAt(0) === '+') s = s.slice(1);
    if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return { ok: false, reason: 'caracteres' };
    if (neg && !opts.allowNegative) return { ok: false, reason: 'negativo' };
    var lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(','), dec = null, ip, fp;
    var nDot = (s.match(/\./g) || []).length, nCom = (s.match(/,/g) || []).length;
    if (lastDot >= 0 && lastCom >= 0) {
      dec = lastDot > lastCom ? '.' : ',';
      var other = dec === '.' ? ',' : '.';
      if ((s.match(new RegExp('\\' + dec, 'g')) || []).length > 1) return { ok: false, reason: 'formato' };
      ip = s.slice(0, s.lastIndexOf(dec)).split(other).join(''); fp = s.slice(s.lastIndexOf(dec) + 1);
      // os grupos de milhar precisam ter 3 dígitos (exceto o primeiro)
      var grp = s.slice(0, s.lastIndexOf(dec)).split(other);
      for (var i = 1; i < grp.length; i++) if (grp[i].length !== 3) return { ok: false, reason: 'formato' };
      if (grp[0].length < 1 || grp[0].length > 3) return { ok: false, reason: 'formato' };
    } else if (lastCom >= 0) {
      if (nCom === 1) { ip = s.slice(0, lastCom); fp = s.slice(lastCom + 1); }
      else { var g = s.split(','); for (var j = 1; j < g.length; j++) if (g[j].length !== 3) return { ok: false, reason: 'formato' }; ip = g.join(''); fp = ''; }
    } else if (lastDot >= 0) {
      if (nDot > 1) { var g2 = s.split('.'); for (var k = 1; k < g2.length; k++) if (g2[k].length !== 3) return { ok: false, reason: 'formato' }; ip = g2.join(''); fp = ''; }
      else {
        var a = s.slice(0, lastDot), b = s.slice(lastDot + 1);
        if (b.length === 3 && a.length >= 1 && a.length <= 3 && a.charAt(0) !== '0') { ip = a + b; fp = ''; }   // "3.200" = 3200
        else { ip = a; fp = b; }
      }
    } else { ip = s; fp = ''; }
    if (ip === '') ip = '0';
    if (!/^\d+$/.test(ip) || (fp !== '' && !/^\d+$/.test(fp))) return { ok: false, reason: 'formato' };
    if (fp.length > 2) return { ok: false, reason: 'casas' };
    var v = Number(ip + (fp ? '.' + fp : ''));
    if (!isFinite(v) || v > 1e12) return { ok: false, reason: 'tamanho' };
    return { ok: true, empty: false, value: r2(neg ? -v : v) };
  }

  // 1500.75 -> "1.500,75" (sem R$, para dentro do campo)
  function formatField(n) {
    if (n == null || !isFinite(n)) return '';
    var neg = n < 0, x = Math.abs(r2(n)).toFixed(2).split('.');
    return (neg ? '-' : '') + x[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + x[1];
  }
  function brl(n) { return 'R$ ' + formatField(n); }

  var MSG = { caracteres: 'Use só números, vírgula e ponto. Exemplo: 3.200,50', negativo: 'Este campo não aceita valor negativo.', formato: 'Não entendi esse valor. Exemplo: 3.200,50', casas: 'Use no máximo 2 casas depois da vírgula (centavos).', tamanho: 'Esse valor é grande demais.' };

  // ── Campos na tela ──────────────────────────────────────────────
  var hasDom = typeof document !== 'undefined' && typeof HTMLInputElement !== 'undefined';
  var proto = hasDom ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;

  function raw(el) { return proto.get.call(el); }
  function state(el) { return parse(raw(el), { allowNegative: el.hasAttribute('data-money-neg') }); }

  function hintOf(el) {
    var h = el._moneyHint;
    if (!h) {
      h = document.createElement('div'); h.className = 'money-hint'; h.setAttribute('aria-live', 'polite');
      h.style.cssText = 'font-size:12px;margin-top:4px;min-height:16px;color:var(--ink-3)';
      el.insertAdjacentElement('afterend', h); el._moneyHint = h;
    }
    return h;
  }
  function refresh(el) {
    var st = state(el), h = hintOf(el);
    if (!st.ok) { h.textContent = MSG[st.reason] || MSG.formato; h.style.color = 'var(--expense, #c0392b)'; el.setAttribute('aria-invalid', 'true'); }
    else { el.removeAttribute('aria-invalid'); h.style.color = 'var(--ink-3)'; h.textContent = st.empty ? '' : '= ' + brl(st.value); }
  }
  function enhance(el) {
    if (!hasDom || el._money) return; el._money = true;
    var initial = raw(el);
    try { el.type = 'text'; } catch (e) { /* ignore */ }
    el.setAttribute('inputmode', 'decimal'); el.setAttribute('autocomplete', 'off'); el.removeAttribute('step'); el.removeAttribute('min');
    // valor que veio do sistema (número em JS) é formatado; o que o cliente digita é interpretado pelas regras acima
    if (initial !== '' && isFinite(Number(initial))) proto.set.call(el, formatField(Number(initial)));
    Object.defineProperty(el, 'value', {
      configurable: true,
      // quem lê o campo (parseFloat(el.value)) recebe sempre um número em ponto decimal; vazio/inválido => ''
      get: function () { var st = state(el); return st.ok && !st.empty ? String(st.value) : ''; },
      set: function (v) { proto.set.call(el, v === '' || v == null ? '' : (isFinite(Number(v)) ? formatField(Number(v)) : String(v))); refresh(el); }
    });
    el.addEventListener('input', function () { refresh(el); });
    el.addEventListener('blur', function () { var st = state(el); if (st.ok && !st.empty) proto.set.call(el, formatField(st.value)); refresh(el); });
    refresh(el);
  }
  function scan(rootEl) { if (!hasDom) return; (rootEl || document).querySelectorAll('input[data-money]').forEach(enhance); }
  // true se algum campo da lista tem texto que não dá para interpretar (e avisa o cliente)
  function hasInvalid(ids, toast) {
    if (!hasDom) return false;
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]); if (!el || !el._money) continue;
      var st = state(el);
      if (!st.ok) { refresh(el); if (toast) toast(MSG[st.reason] || MSG.formato, 'error'); try { el.focus(); } catch (e) { /* ignore */ } return true; }
    }
    return false;
  }
  if (hasDom) {
    var start = function () {
      scan(document);
      new MutationObserver(function (muts) { muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.matches && n.matches('input[data-money]')) enhance(n); if (n.querySelectorAll) scan(n); } }); }); }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }

  var api = { parse: parse, formatField: formatField, brl: brl, hasInvalid: hasInvalid, scan: scan, MSG: MSG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Money = api;
})(typeof window !== 'undefined' ? window : this);
