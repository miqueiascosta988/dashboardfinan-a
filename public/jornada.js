/* SM Financial — Jornada em 3 passos (lógica pura): 1 Reunir dados -> 2 Situação atual -> 3 Plano de ação.
 * Só lê o que o cliente já cadastrou; não grava nada nem inventa números. */
(function (root) {
  'use strict';
  var round = function (v) { return Math.round(v * 100) / 100; };
  function ymOf(d, today) {
    var W = root.WeekPlan; var s = W && W.txISO ? W.txISO(d, today) : String(d || '').slice(0, 10);
    return s ? s.slice(0, 7) : null;
  }
  function build(o) {
    o = o || {}; var today = o.today, flags = o.flags || {}, tx = o.transactions || [], debts = (o.debts || []).filter(function (d) { return (+d.saldo || 0) > 0; });
    var inc = tx.filter(function (t) { return t.type === 'income'; }), exp = tx.filter(function (t) { return t.type === 'expense'; });
    var items = [
      { id: 'renda', label: 'Sua renda', done: inc.length >= 1, need: 'Registre quanto entra por mês', tab: 'receitas', required: true },
      { id: 'gastos', label: 'Seus gastos (mínimo 5)', done: exp.length >= 5, count: exp.length, need: 'Registre pelo menos 5 gastos (' + exp.length + '/5)', tab: 'despesas', required: true },
      { id: 'dividas', label: 'Suas dívidas', done: debts.length > 0 || !!flags.semDividas, need: 'Cadastre suas dívidas ou diga que não tem', tab: 'dividas', required: true, canSkip: debts.length === 0 },
      { id: 'docs', label: 'Documentos (opcional)', done: (o.documents || []).length > 0 || !!flags.semDocs, need: 'Envie faturas e comprovantes para conferir os números', tab: 'documentos', required: false }
    ];
    var req = items.filter(function (i) { return i.required; }), got = req.filter(function (i) { return i.done; }).length;
    var step1 = got === req.length, nextItem = items.filter(function (i) { return !i.done; })[0] || null;
    var ym = today ? today.slice(0, 7) : null;
    var m = tx.filter(function (t) { return ymOf(t.date, today) === ym; }); if (!m.length) m = tx;
    var rec = round(m.filter(function (t) { return t.type === 'income'; }).reduce(function (a, t) { return a + (+t.amount || 0); }, 0));
    var gas = round(m.filter(function (t) { return t.type === 'expense'; }).reduce(function (a, t) { return a + (+t.amount || 0); }, 0));
    var parc = round(debts.reduce(function (a, d) { return a + (+d.mensal || 0); }, 0)), total = round(debts.reduce(function (a, d) { return a + (+d.saldo || 0); }, 0));
    var sobra = round(rec - gas - parc), comp = rec > 0 ? round(parc / rec) : 0, level = null, msg = null;
    if (step1) {
      if (rec <= 0) { level = 'atencao'; msg = 'Sem renda registrada neste período, o diagnóstico fica incompleto.'; }
      else if (sobra < 0 || comp > 0.4) { level = 'aperto'; msg = sobra < 0 ? 'Você está gastando mais do que ganha.' : 'As parcelas das dívidas pesam demais na sua renda.'; }
      else if (comp > 0.2 || sobra < rec * 0.1) { level = 'atencao'; msg = 'Dá para respirar, mas a margem é curta.'; }
      else { level = 'ok'; msg = 'Suas contas fecham com folga.'; }
    }
    var hasPlan = !!(o.strategy && o.strategy.rows && o.strategy.rows.length), plan = null;
    if (step1) {
      if (hasPlan) plan = { done: true, cta: 'Ver o plano de ação da semana', tab: 'dashboard' };
      else plan = { done: false, cta: level === 'ok' ? 'Montar meu plano com o consultor' : 'Montar meu plano de saída com o consultor', tab: 'estrategia' };
    }
    var current = !step1 ? 1 : !hasPlan ? 3 : 3;
    return { step1: step1, progress: got, of: req.length, items: items, next: nextItem, diag: step1 ? { level: level, msg: msg, receita: rec, gastos: gas, parcelas: parc, sobra: sobra, comprometimento: comp, dividaTotal: total } : null, plan: plan, current: current, finished: step1 && hasPlan };
  }
  var api = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Jornada = api;
})(typeof window !== 'undefined' ? window : this);
