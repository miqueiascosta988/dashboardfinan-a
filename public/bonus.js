/* Bônus de boas-vindas do plano Free: até 3 documentos nas primeiras 48 horas depois do cadastro. Lógica pura (sem rede). */
(function (root) {
  'use strict';
  var HORA = 3600000, HORAS = 48, DOCS = 3;
  function num(n) { n = parseInt(n, 10); return isFinite(n) && n > 0 ? n : 0; }
  // createdAt = data de criação da conta (ISO). Sem data válida o bônus não vale (falha fechada).
  function info(createdAt, usados, now) {
    var t = now == null ? Date.now() : now, ini = Date.parse(createdAt), u = Math.min(DOCS, num(usados));
    if (!isFinite(ini)) return { ativo: false, usados: u, restantes: 0, horasRestantes: 0, fim: null, motivo: 'sem-data' };
    var fim = ini + HORAS * HORA, dentro = t >= ini && t < fim, rest = DOCS - u;
    var motivo = !dentro ? 'prazo' : rest <= 0 ? 'esgotado' : null;
    return { ativo: dentro && rest > 0, usados: u, restantes: dentro ? rest : 0, horasRestantes: dentro ? Math.max(1, Math.ceil((fim - t) / HORA)) : 0, fim: new Date(fim).toISOString(), motivo: motivo };
  }
  function emptyStore() { return { v: 1, n: 0 }; }
  function usar(store) { var s = store && store.v === 1 ? store : emptyStore(); return { v: 1, n: Math.min(DOCS, num(s.n) + 1) }; }
  function aviso(i) {
    if (!i || !i.ativo) return null;
    return { titulo: 'Bônus de boas-vindas: ' + i.restantes + ' de ' + DOCS + ' documentos',
      texto: 'Envie até ' + i.restantes + (i.restantes === 1 ? ' documento' : ' documentos') + ' sem o limite do plano grátis. Acaba em ' + i.horasRestantes + (i.horasRestantes === 1 ? ' hora' : ' horas') + '.' };
  }
  var api = { info: info, usar: usar, emptyStore: emptyStore, aviso: aviso, DOCS: DOCS, HORAS: HORAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Bonus = api;
})(typeof window !== 'undefined' ? window : globalThis);
