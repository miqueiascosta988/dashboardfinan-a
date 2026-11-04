/* Recorrentes — projeta os próximos 12 meses dos lançamentos marcados como recorrentes.
   Regras (decididas com o dono do produto):
   - Gera 12 meses à frente, como PREVISTOS: nunca são somados como pago nem viram lançamento sozinhos.
   - Cada série é identificada por tipo + descrição + categoria; o valor e o dia vêm do último lançamento real da série.
   - Se o mês já tem lançamento real da série, não gera previsto para ele.
   - Cancelar vale só daqui pra frente: remove os previstos depois da data do cancelamento; lançamentos já feitos NUNCA são apagados.
     Um lançamento recorrente novo, posterior ao cancelamento, reativa a série.
   Funções puras, testadas em Node. */
(function (root) {
  'use strict';
  var HORIZONTE = 12;
  var r2 = function (v) { return Math.round(v * 100 + 1e-9) / 100; };
  var strip = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  function keyOf(t) { return (t.type === 'income' ? 'i' : 'e') + '|' + strip(t.desc || t.cat).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' + strip(t.cat).toLowerCase().trim(); }
  // 'AAAA-MM-DD' ou 'DD/MM' (ano = refYear) → 'AAAA-MM-DD' ou null
  function isoOf(date, refYear) {
    if (typeof date !== 'string') return null; var m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(date))) return refYear + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    return null;
  }
  function addMonths(iso, k, day) {
    var y = +iso.slice(0, 4), mo = +iso.slice(5, 7) - 1 + k, d = day || +iso.slice(8, 10);
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); d = Math.min(d, last);
    return y + '-' + pad(mo + 1) + '-' + pad(d);
  }
  function emptyStore() { return { v: 1, fim: {} }; }

  // Séries a partir dos lançamentos recorrentes. today: 'AAAA-MM-DD'.
  function series(txs, store, today) {
    store = store || emptyStore(); var by = {}, y = +today.slice(0, 4);
    (txs || []).forEach(function (t) {
      if (!t || !t.recur || !(t.amount > 0)) return;
      var iso = isoOf(t.date, y); if (!iso) return;
      var k = keyOf(t), s = by[k] || (by[k] = { key: k, type: t.type, desc: t.desc || t.cat, cat: t.cat, ultimaData: '', valor: 0, meses: {} });
      s.meses[iso.slice(0, 7)] = true;
      if (iso >= s.ultimaData) { s.ultimaData = iso; s.valor = r2(t.amount); s.desc = t.desc || t.cat; }
    });
    return Object.keys(by).map(function (k) {
      var s = by[k], fim = (store.fim || {})[k];
      s.dia = +s.ultimaData.slice(8, 10);
      s.cancelada = !!fim && s.ultimaData <= fim;   // lançamento novo depois do cancelamento reativa
      s.fim = s.cancelada ? fim : null;
      return s;
    }).sort(function (a, b) { return a.desc.localeCompare(b.desc); });
  }
  // Previstos dos próximos 12 meses (datas depois de hoje, sem mês que já tem lançamento real da série).
  function project(txs, store, today, meses) {
    var out = [], n = meses || HORIZONTE;
    series(txs, store, today).forEach(function (s) {
      if (s.cancelada) return;
      for (var i = 0; i <= n; i++) {
        var base = addMonths(today.slice(0, 7) + '-01', i, 1).slice(0, 7), d = addMonths(base + '-01', 0, s.dia);
        if (d <= today) continue; if (s.meses[base]) continue;
        out.push({ key: s.key, date: d, desc: s.desc, cat: s.cat, type: s.type, valor: s.valor, baseadoEm: s.ultimaData });
        if (out.filter(function (p) { return p.key === s.key; }).length >= n) break;
      }
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  // Cancela daqui pra frente: guarda a data; nenhum lançamento existente é tocado.
  function cancel(store, key, today) { store = JSON.parse(JSON.stringify(store || emptyStore())); store.fim = store.fim || {}; store.fim[key] = today; return store; }
  function resume(store, key) { store = JSON.parse(JSON.stringify(store || emptyStore())); if (store.fim) delete store.fim[key]; return store; }
  var api = { HORIZONTE: HORIZONTE, keyOf: keyOf, isoOf: isoOf, addMonths: addMonths, emptyStore: emptyStore, series: series, project: project, cancel: cancel, resume: resume };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Recorrentes = api;
})(typeof window !== 'undefined' ? window : this);
