/* Parcelas — detecta compra parcelada na fatura ("Seguro automóvel 2 de 12 R$ 399,00"), guarda o plano e projeta o que falta.
   Regras (decididas com o dono do produto):
   - Lê a parcela que aparece na fatura (N de M). Parcelas anteriores à primeira vista NÃO são inventadas: ficam "sem dados" até o cliente preencher.
   - A data das parcelas futuras usa o dia informado pelo cliente (por cartão); sem resposta, usa o dia do vencimento da fatura onde a parcela apareceu.
   - Mesma parcela em faturas diferentes não conta duas vezes (chave = descrição base + M + valor).
   - "Prevista" nunca é somada como paga. Padrão incerto ("02/12" solto) pede confirmação; categoria incerta vai para "A revisar".
   Funções puras, testadas em Node. */
(function (root) {
  'use strict';
  var r2 = function (v) { return Math.round(v * 100 + 1e-9) / 100; };
  var strip = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); };

  // → { n, m, base, certeza:'alta'|'media' } ou null
  function detect(desc) {
    var s = strip(desc).replace(/\s+/g, ' ').trim(), m;
    var pats = [
      [/\bparc(?:ela)?\.?\s*0*(\d{1,2})\s*(?:de|\/)\s*0*(\d{1,2})\b/i, 'alta'],
      [/\b0*(\d{1,2})\s+de\s+0*(\d{1,2})\b/i, 'alta'],
      [/\b0*(\d{1,2})\s*\/\s*0*(\d{1,2})\s*$/i, 'media']
    ];
    for (var i = 0; i < pats.length; i++) {
      m = pats[i][0].exec(s); if (!m) continue;
      var n = +m[1], t = +m[2];
      if (t < 2 || t > 60 || n < 1 || n > t) continue;
      var base = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\bparc(?:ela)?s?\.?\b/ig, '').replace(/[\s\-–:*]+$/g, '').replace(/^[\s\-–:*]+/g, '').replace(/\s+/g, ' ').trim();
      if (!base) continue;
      return { n: n, m: t, base: base, certeza: pats[i][1] };
    }
    return null;
  }
  function planKey(base, m, valor) { return strip(base).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' + m + '|' + r2(valor).toFixed(2); }

  function addMonths(iso, k, day) {   // iso AAAA-MM-DD; fixa o dia (limitado ao fim do mês)
    var y = +iso.slice(0, 4), mo = +iso.slice(5, 7) - 1 + k, d = day || +iso.slice(8, 10);
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); d = Math.min(d, last);
    return y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function validIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z')); }

  // store = { plans: { key: { key, desc, m, valor, cat, seen: {n: 'AAAA-MM-DD'}, doc: [ids] } }, dia: { cartao: 10 } }
  function emptyStore() { return { v: 1, plans: {}, dia: {} }; }
  // Registra as parcelas lidas numa fatura. compras: [[data,desc,valor,...]]; opts: { docId, banco, venc, cat(fn) }
  function ingest(store, compras, opts) {
    store = JSON.parse(JSON.stringify(store || emptyStore())); opts = opts || {};
    var novas = 0, repetidas = 0, confirmar = [];
    (compras || []).forEach(function (c) {
      var d = detect(c[1]); if (!d) return;
      var key = planKey(d.base, d.m, c[2]), p = store.plans[key];
      var ref = validIso(opts.venc) ? opts.venc : (validIso(c[0]) ? c[0] : null); if (!ref) return;
      if (!p) { p = store.plans[key] = { key: key, desc: d.base, m: d.m, valor: r2(c[2]), cat: opts.cat ? opts.cat(d.base) : null, banco: opts.banco || null, seen: {}, docs: [] }; }
      if (p.seen[d.n]) { repetidas++; if (opts.docId && p.docs.indexOf(opts.docId) < 0) p.docs.push(opts.docId); return; }   // já registrada por outra fatura
      p.seen[d.n] = ref; novas++; if (opts.docId && p.docs.indexOf(opts.docId) < 0) p.docs.push(opts.docId);
      if (d.certeza === 'media') confirmar.push(key);
    });
    return { store: store, novas: novas, repetidas: repetidas, confirmar: confirmar };
  }
  // Parcelas que faltam, a partir da maior já vista. today: 'AAAA-MM-DD'.
  function project(store, opts) {
    opts = opts || {}; var out = [];
    Object.keys((store && store.plans) || {}).forEach(function (k) {
      var p = store.plans[k], ns = Object.keys(p.seen).map(Number).sort(function (a, b) { return a - b; }); if (!ns.length) return;
      var last = ns[ns.length - 1], lastDate = p.seen[last], day = (store.dia && p.banco && store.dia[p.banco]) || +lastDate.slice(8, 10);
      for (var n = last + 1; n <= p.m; n++) out.push({ key: k, n: n, m: p.m, desc: p.desc, valor: p.valor, date: addMonths(lastDate, n - last, day), status: 'prevista', cat: p.cat, banco: p.banco });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }
  // Parcelas já pagas conhecidas (vistas em faturas) e lacunas (anteriores à primeira vista, que o cliente pode preencher).
  function history(store) {
    var paid = [], gaps = [];
    Object.keys((store && store.plans) || {}).forEach(function (k) {
      var p = store.plans[k], ns = Object.keys(p.seen).map(Number).sort(function (a, b) { return a - b; });
      ns.forEach(function (n) { paid.push({ key: k, n: n, m: p.m, desc: p.desc, valor: p.valor, date: p.seen[n], status: 'paga' }); });
      for (var n = 1; n < ns[0]; n++) gaps.push({ key: k, n: n, m: p.m, desc: p.desc, status: 'sem dados' });
      for (var j = 1; j < ns.length; j++) for (var q = ns[j - 1] + 1; q < ns[j]; q++) gaps.push({ key: k, n: q, m: p.m, desc: p.desc, status: 'sem dados' });
    });
    return { paid: paid, gaps: gaps };
  }
  function setDia(store, banco, dia) { store = JSON.parse(JSON.stringify(store || emptyStore())); dia = Math.round(+dia); if (banco && dia >= 1 && dia <= 31) { store.dia[banco] = dia; } return store; }
  function fillGap(store, key, n, iso) { store = JSON.parse(JSON.stringify(store)); if (store.plans[key] && validIso(iso) && !store.plans[key].seen[n] && n >= 1 && n <= store.plans[key].m) store.plans[key].seen[n] = iso; return store; }

  var api = { detect: detect, planKey: planKey, addMonths: addMonths, emptyStore: emptyStore, ingest: ingest, project: project, history: history, setDia: setDia, fillGap: fillGap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Parcelas = api;
})(typeof window !== 'undefined' ? window : this);
