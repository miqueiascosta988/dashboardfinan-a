/* Teste de 7 dias (Basic por R$ 5) e depois Basic R$ 8/mês. Lógica pura: o servidor grava plan_status='trialing' + plan_expires_at. */
(function (root) {
  'use strict';
  var DIA = 86400000, DIAS = 7;
  var PAGOS = ['basic', 'plus', 'pro', 'business'], BLOQ = ['canceled', 'cancelled', 'unpaid', 'incomplete_expired'];
  // Estado do teste: { on, expirado, diasRestantes, fim } — 'on' só vale enquanto a data não passou.
  function info(profile, now) {
    var p = profile || {}, t = now == null ? Date.now() : now;
    if (p.plan_status !== 'trialing') return { on: false, expirado: false, diasRestantes: null, fim: null };
    var fim = p.plan_expires_at ? Date.parse(p.plan_expires_at) : NaN;
    if (!isFinite(fim)) return { on: false, expirado: true, diasRestantes: 0, fim: null };      // sem data = não libera (falha fechada)
    var rest = Math.ceil((fim - t) / DIA);
    return { on: fim > t, expirado: fim <= t, diasRestantes: Math.max(0, rest), fim: new Date(fim).toISOString() };
  }
  function temAcesso(profile, now) {
    var p = profile || {};
    if (PAGOS.indexOf(p.plan) < 0 || BLOQ.indexOf(p.plan_status) >= 0) return false;
    var i = info(p, now); return p.plan_status === 'trialing' ? i.on : true;
  }
  function fimDoTeste(now, dias) { return new Date((now == null ? Date.now() : now) + (dias || DIAS) * DIA).toISOString(); }
  // Mensagem do aviso (null = sem aviso). Dias 1-4 discreto, 5-7 pede a decisão.
  function aviso(profile, now) {
    var i = info(profile, now);
    if (i.expirado) return { nivel: 'expirado', titulo: 'Seu teste de 7 dias terminou', texto: 'Continue por R$ 8,00/mês para manter seus dados, o Raio-X e o plano de alívio.' };
    if (!i.on) return null;
    var d = i.diasRestantes;
    return { nivel: d <= 2 ? 'urgente' : 'normal', titulo: d <= 1 ? 'Último dia do seu teste' : 'Faltam ' + d + ' dias do seu teste', texto: d <= 2 ? 'Para continuar sem perder nada, assine o Basic por R$ 8,00/mês. Cancele quando quiser.' : 'Aproveite: envie um contrato ou holerite e veja o Raio-X da sua dívida. Depois do teste, o Basic custa R$ 8,00/mês.' };
  }
  var api = { info: info, temAcesso: temAcesso, fimDoTeste: fimDoTeste, aviso: aviso, DIAS: DIAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trial = api;
})(typeof window !== 'undefined' ? window : this);
