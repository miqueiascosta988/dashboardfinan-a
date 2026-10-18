/* SM Financial — Calculadora de dívidas: tela. A conta e o assistente estão em calcdivida.js. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var BRL = function (v) { return 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var M = function (n) { return n === 1 ? '1 mês' : n + ' meses'; };
  var F = { saldo: '', juros: '', unidade: 'mes', parcela: '', extra: '', renda: '', alvo: '', tipo: '' };
  var num = function (v) { var n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? (parseFloat(v) || 0) : n; };
  var numLoose = function (v) { var s = String(v == null ? '' : v).trim(); if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s); return num(s); };

  function input() {
    var j = numLoose(F.juros); if (F.unidade === 'ano' && j) j = window.CalcDivida.monthlyFromAnnual(j);
    return { saldo: numLoose(F.saldo), juros: j, parcela: numLoose(F.parcela), extra: numLoose(F.extra), renda: numLoose(F.renda), alvoMeses: Math.round(numLoose(F.alvo)), tipo: F.tipo, jurosInformado: String(F.juros).trim() !== '' };
  }
  function css() {
    if (document.getElementById('cd-style')) return;
    var s = document.createElement('style'); s.id = 'cd-style';
    s.textContent = '#cd-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}#cd-form label{font-size:12px;color:var(--ink-3);display:block;margin-bottom:4px}'
      + '.cd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}.cd-k{padding:12px;border-radius:12px;background:var(--card-alt,#EAEFF5)}.cd-k b{display:block;font-size:19px;margin-top:2px}'
      + '.cd-bot{padding:11px 14px;border-radius:14px;background:var(--card-alt,#EAEFF5);margin-top:8px;font-size:14.5px;line-height:1.5}.cd-bot.warn{background:var(--amber-light,#FBF1D6)}'
      + '.cd-q{margin-top:8px;padding:11px 14px;border:1px dashed var(--border,#C9D2DE);border-radius:14px;font-size:14px}.cd-q button,.cd-q input{margin:6px 6px 0 0}'
      + '.cd-chip{border:1px solid var(--teal,#16324F);background:#fff;color:var(--teal,#16324F);border-radius:18px;padding:6px 12px;font-weight:700;cursor:pointer;font-size:13px}'
      + '#cd-out details{margin-top:8px;border:1px solid var(--border,#E3E8EF);border-radius:12px;padding:10px 14px;font-size:14px}#cd-out summary{cursor:pointer;font-weight:700}'
      + '#cd-out table{width:100%;border-collapse:collapse;font-size:13.5px}#cd-out td,#cd-out th{padding:7px 6px;border-top:1px solid var(--border,#E3E8EF);text-align:left}';
    document.head.appendChild(s);
  }
  function outHtml() {
    var C = window.CalcDivida, a = C.analyze(input());
    if (!a.valid) return '<div class="cd-bot">' + esc(a.suggestions[0]) + '</div>';
    var h = '<div class="cd-kpis"><div class="cd-k">Juros no 1º mês<b>' + BRL(a.interestFirst) + '</b></div><div class="cd-k">Juros ao ano (equivalente)<b>' + (Math.round(a.annual * 10) / 10).toLocaleString('pt-BR') + '%</b></div>'
      + (a.base ? '<div class="cd-k">Quita em<b>' + M(a.base.months) + '</b></div><div class="cd-k">Total de juros<b>' + BRL(a.base.interest) + '</b></div><div class="cd-k">Total pago<b>' + BRL(a.base.paid) + '</b></div>' : '<div class="cd-k">Quita em<b>nunca, nesse ritmo</b></div>') + '</div>';
    h += '<div class="card-title" style="margin:14px 0 4px">Sugestões do assistente</div>' + a.suggestions.map(function (s, i) { return '<div class="cd-bot' + (i === 0 && !a.cover ? ' warn' : '') + '">' + esc(s) + '</div>'; }).join('');
    if (a.target) h += '<div class="cd-bot"><b>Para quitar em ' + M(a.target.months) + ':</b> parcela de ' + BRL(a.target.parcela) + ' por mês.</div>';
    if (a.scenarios.length) h += '<div class="card-title" style="margin:16px 0 4px">E se eu pagar mais por mês?</div><table><tr><th>Extra</th><th>Quita em</th><th>Economiza</th></tr>' + a.scenarios.map(function (x) { return '<tr><td>+ ' + BRL(x.extra) + (x.mine ? ' (seu valor)' : '') + '</td><td>' + M(x.months) + ' (' + M(x.saveMonths) + ' antes)</td><td>' + BRL(x.saveInterest) + ' de juros</td></tr>'; }).join('') + '</table>';
    if (a.questions.length) h += '<div class="card-title" style="margin:16px 0 4px">Para eu ajudar melhor, me conta:</div>' + a.questions.map(qHtml).join('');
    h += '<div class="card-title" style="margin:16px 0 4px">Como cada cálculo foi feito</div>' + a.explain.map(function (e) { return '<details><summary>' + esc(e.q) + '</summary><div style="margin-top:6px">' + esc(e.a) + '</div></details>'; }).join('');
    return h;
  }
  function qHtml(q) {
    var body = '';
    if (q.kind === 'tipo') body = Object.keys(window.CalcDivida.TIPOS).map(function (k) { return '<button class="cd-chip" onclick="cdAnswer(\'tipo\',\'' + k + '\')">' + esc(window.CalcDivida.TIPOS[k].split(' (')[0]) + '</button>'; }).join('');
    else if (q.kind === 'number') body = '<input class="form-input" id="cd-a-' + q.id + '" inputmode="decimal" style="width:130px"><button class="cd-chip" onclick="cdAnswer(\'' + q.id + '\',document.getElementById(\'cd-a-' + q.id + '\').value)">Responder</button>';
    return '<div class="cd-q" data-q="' + q.id + '">' + esc(q.ask) + '<br>' + body + '</div>';
  }
  function refresh() { var o = document.getElementById('cd-out'); if (o) o.innerHTML = outHtml(); }
  window.cdAnswer = function (id, v) {
    if (id === 'tipo') F.tipo = v; else if (id === 'juros') F.juros = v; else if (id === 'renda') F.renda = v; else if (id === 'extra') F.extra = v;
    var map = { tipo: 'cd-tipo', juros: 'cd-juros', renda: 'cd-renda', extra: 'cd-extra' }, el = document.getElementById(map[id]); if (el) el.value = v;
    refresh();
  };
  window.cdBind = function () {
    var ids = { 'cd-saldo': 'saldo', 'cd-juros': 'juros', 'cd-unidade': 'unidade', 'cd-parcela': 'parcela', 'cd-extra': 'extra', 'cd-renda': 'renda', 'cd-alvo': 'alvo', 'cd-tipo': 'tipo' };
    Object.keys(ids).forEach(function (id) { var el = document.getElementById(id); if (el) { el.value = F[ids[id]]; var f = function () { F[ids[id]] = el.value; refresh(); }; el.addEventListener('input', f); el.addEventListener('change', f); } });
    var pick = document.getElementById('cd-pick');
    if (pick) pick.addEventListener('change', function () {
      var d = (window.visibleList ? visibleList('debts') : state.debts || [])[+pick.value]; if (!d) return;
      F.saldo = String(d.saldo || ''); F.juros = d.juros ? String(d.juros) : ''; F.unidade = 'mes'; F.parcela = d.mensal ? String(d.mensal) : '';
      var t = String(d.type || d.name || '').toLowerCase(); F.tipo = /cart/.test(t) ? 'cartao' : /cheque/.test(t) ? 'cheque' : /consig/.test(t) ? 'consignado' : /financ/.test(t) ? 'financiamento' : /emprest|empréstimo/.test(t) ? 'emprestimo' : /loja|crediario|crediário/.test(t) ? 'loja' : F.tipo;
      window.cdBind(); refresh();
    });
    refresh();
  };
  window.renderCalcDivida = function () {
    css();
    var debts = []; try { debts = visibleList('debts').filter(function (d) { return +d.saldo > 0; }); } catch (e) {}
    var all = []; try { all = visibleList('debts'); } catch (e) {}
    var pick = debts.length ? '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--ink-3);display:block;margin-bottom:4px">Usar uma dívida que já cadastrei</label><select id="cd-pick" class="form-select" style="max-width:320px"><option value="">Escolher…</option>' + all.map(function (d, i) { return +d.saldo > 0 ? '<option value="' + i + '">' + esc(d.name) + ' — ' + BRL(d.saldo) + '</option>' : ''; }).join('') + '</select></div>' : '';
    var prio = '';
    if (debts.length > 1) prio = '<div class="card mb-24 animate-in" id="cd-prio"><div class="card-title">Por qual dívida começar?</div>' + window.CalcDivida.prioritize(debts).map(function (p) { return '<div class="cd-bot"><b>' + p.order + 'º ' + esc(p.name) + '</b> (' + BRL(p.saldo) + (p.juros ? ', ' + String(p.juros).replace('.', ',') + '% ao mês' : '') + '): ' + esc(p.why) + '</div>'; }).join('') + '</div>';
    var tipos = '<option value="">Não sei / outro</option>' + Object.keys(window.CalcDivida.TIPOS).map(function (k) { return '<option value="' + k + '">' + esc(window.CalcDivida.TIPOS[k]) + '</option>'; }).join('');
    return '<div class="section-header animate-in"><div><div class="section-title">Calculadora de dívidas</div><div class="section-desc">Descubra quanto tempo falta, quanto vai pagar de juros e quanto economiza pagando um pouco mais. O assistente explica cada conta.</div></div></div>'
      + prio + '<div class="card mb-24 animate-in" id="cd-card">' + pick
      + '<div id="cd-form"><div><label>Saldo devedor (R$)</label><input id="cd-saldo" class="form-input" inputmode="decimal"></div>'
      + '<div><label>Juros</label><div style="display:flex;gap:6px"><input id="cd-juros" class="form-input" inputmode="decimal" placeholder="ex.: 3,5"><select id="cd-unidade" class="form-select"><option value="mes">% ao mês</option><option value="ano">% ao ano</option></select></div></div>'
      + '<div><label>Parcela por mês (R$)</label><input id="cd-parcela" class="form-input" inputmode="decimal"></div>'
      + '<div><label>Valor extra por mês (R$)</label><input id="cd-extra" class="form-input" inputmode="decimal"></div>'
      + '<div><label>Sua renda mensal (R$)</label><input id="cd-renda" class="form-input" inputmode="decimal"></div>'
      + '<div><label>Quero quitar em (meses)</label><input id="cd-alvo" class="form-input" inputmode="numeric"></div>'
      + '<div><label>Tipo de dívida</label><select id="cd-tipo" class="form-select">' + tipos + '</select></div></div>'
      + '<div id="cd-out"></div></div>';
  };
})();
