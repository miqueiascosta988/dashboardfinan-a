/* Central de Alívio — tela. Usa Alivio (alivio.js) e os globais do app. Slogan: Do aperto ao plano, do plano ao alívio. */
(function () {
  'use strict';
  var A = window.Alivio, esc = function (s) { return fxEsc(s); }, B = A.brl;
  var ST = { open: {}, hold: 'a' };

  function alvInit() { fxInit(); if (!FX.alv) FX.alv = { snap: {}, extra: 0, vista: 0, cap: 0 }; try { var s = JSON.parse(localStorage.getItem(fxKey('alv')) || 'null'); if (s && !FX.alv._l) Object.assign(FX.alv, s); } catch (e) {} FX.alv._l = true; if (!FX.alv.snap) FX.alv.snap = {}; return FX.alv; }
  function today() { return isoStr(new Date()); }
  function money(v) { return B(v || 0); }
  function debtList() { return debtsExpanded().filter(function (d) { return d.saldo > 0; }).map(function (d) { return { id: d.id, name: d.name || 'Dívida', type: d.type, saldo: d.saldo, juros: d.juros > 0 ? d.juros : 0, mensal: d.mensal || 0, parcelas: d.parcelas || 0, folha: !!(window.DebtLab && DebtLab.descontoFolha(d)) }; }); }
  function totalDevido() { return visibleList('debts').reduce(function (t, d) { return t + (d.saldo > 0 ? d.saldo : 0); }, 0); }
  function livreMes(c) { var r = (c.totalIncome || 0) - (c.totalExpense || 0); return r > 0 ? Math.round(r) : 0; }
  function txs() { return visibleList('transactions').filter(function (t) { return t.type === 'expense'; }).map(function (t) { var d = txDateObj(t); return { desc: t.desc, date: d ? isoStr(d) : '0000-00-00', amount: t.amount }; }); }
  function cobrancas() { var o = []; (state.documents || []).forEach(function (d) { var f = d.extractedData && d.extractedData.fin; if (f && f.extra && f.extra.tipoCobranca === 'assinatura' && f.counterparty && f.amount > 0) o.push({ servico: f.counterparty, valor: f.amount, date: f.date || (d.extractedData.processedAt || '').slice(0, 10) }); }); return o.filter(function (x) { return x.date; }); }

  // grava um ponto por dia do total devido (base do gráfico de avanço e recuo)
  function alvRecord() { var a = alvInit(), t = totalDevido(); if (!(t > 0) && !Object.keys(a.snap).length) return; var antes = JSON.stringify(a.snap); A.registrar(a.snap, t, today()); if (JSON.stringify(a.snap) !== antes) fxSave('alv'); }

  function chart(p) {
    var s = p.serie; if (s.length < 2) return '<div class="occ-b-desc">O gráfico aparece a partir do segundo dia de uso: o app registra seu total devido uma vez por dia.</div>';
    var W = 560, H = 150, pad = 8, max = Math.max.apply(null, s.map(function (x) { return x.v; })) || 1, n = s.length;
    var X = function (i) { return pad + i * (W - 2 * pad) / (n - 1); }, Y = function (v) { return pad + (1 - v / max) * (H - 2 * pad); };
    var seg = ''; for (var i = 1; i < n; i++) seg += '<line x1="' + X(i - 1) + '" y1="' + Y(s[i - 1].v) + '" x2="' + X(i) + '" y2="' + Y(s[i].v) + '" stroke="' + (s[i].v > s[i - 1].v ? 'var(--expense)' : 'var(--income)') + '" stroke-width="3" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Evolução do total devido: verde é avanço, vermelho é recuo">' + seg + '<circle cx="' + X(n - 1) + '" cy="' + Y(s[n - 1].v) + '" r="5" fill="var(--teal)"/></svg><div class="occ-b-desc" style="margin-top:4px">Verde: a dívida total caiu. Vermelho: subiu (recuo). Valores ficam só com você.</div>';
  }

  function secProgresso() {
    var p = A.progresso(alvInit().snap, totalDevido()), r = 52, C = 2 * Math.PI * r, off = C * (1 - p.pct / 100), ult = p.ultimo;
    var msg = ult ? (ult.tipo === 'avanco' ? '📉 No último mês sua dívida total caiu. Continue assim.' : ult.tipo === 'recuo' ? '⚠️ No último mês o total subiu. Vale revisar o que entrou de novo (juros, novas parcelas).' : 'Total estável no último mês.') : 'Seu ponto de partida foi registrado hoje.';
    return '<div class="card mb-24 animate-in"><div class="card-title">🏁 Meu progresso</div><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:10px">' +
      '<svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="' + Math.floor(p.pct) + ' por cento quitado"><circle cx="65" cy="65" r="' + r + '" fill="none" stroke="var(--border)" stroke-width="12"/><circle cx="65" cy="65" r="' + r + '" fill="none" stroke="var(--teal)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '" transform="rotate(-90 65 65)"/><text x="65" y="72" text-anchor="middle" font-size="26" font-weight="700" fill="var(--ink)">' + Math.floor(p.pct) + '%</text></svg>' +
      '<div style="flex:1;min-width:220px"><div style="font-weight:700;font-size:17px">' + esc(p.mensagem) + '</div><div class="occ-b-desc" style="margin:6px 0 10px">' + msg + '</div><button class="btn-save" onclick="alvShare()">📤 Compartilhar meu progresso</button> <span class="occ-b-desc">A imagem não mostra valores nem nome.</span></div></div><div style="margin-top:14px">' + chart(p) + '</div></div>';
  }

  window.alvShare = function () {
    var p = A.progresso(alvInit().snap, totalDevido()), W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
    var gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#0F3D3A'); gr.addColorStop(1, '#0B2523'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.fillStyle = '#9FE3D6'; g.font = '600 40px system-ui,sans-serif'; g.fillText('SM FINANCIAL', W / 2, 130);
    var cx = W / 2, cy = 560, R = 270; g.lineWidth = 56; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();
    g.strokeStyle = '#3DDBC0'; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.max(0.004, p.pct / 100)); g.stroke();
    g.fillStyle = '#fff'; g.font = '800 190px system-ui,sans-serif'; g.fillText(Math.floor(p.pct) + '%', cx, cy + 66);
    g.font = '700 62px system-ui,sans-serif'; var linhas = p.pct >= 100 ? ['Quitei todas', 'as minhas dívidas!'] : p.pct > 0 ? ['Já quitei ' + Math.floor(p.pct) + '%', 'das minhas dívidas'] : ['Comecei a sair', 'do aperto'];
    g.fillText(linhas[0], cx, 980); g.fillText(linhas[1], cx, 1052);
    var s = p.serie; if (s.length >= 2) { var mx = Math.max.apply(null, s.map(function (x) { return x.v; })) || 1, x0 = 200, x1 = W - 200, y0 = 1110, y1 = 1190; g.lineWidth = 8; for (var i = 1; i < s.length; i++) { g.strokeStyle = s[i].v > s[i - 1].v ? '#FF7A7A' : '#3DDBC0'; g.beginPath(); g.moveTo(x0 + (i - 1) * (x1 - x0) / (s.length - 1), y0 + (1 - s[i - 1].v / mx) * (y1 - y0)); g.lineTo(x0 + i * (x1 - x0) / (s.length - 1), y0 + (1 - s[i].v / mx) * (y1 - y0)); g.stroke(); } }
    g.fillStyle = '#9FE3D6'; g.font = 'italic 600 38px system-ui,sans-serif'; g.fillText(A.SLOGAN, cx, 1285);
    cv.toBlob(function (blob) {
      if (!blob) { showToast('Não consegui gerar a imagem neste aparelho.', 'error'); return; }
      var file = null; try { file = new File([blob], 'meu-progresso-sm-financial.png', { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], text: 'Meu progresso no SM Financial. ' + A.SLOGAN }).catch(function () {}); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'meu-progresso-sm-financial.png'; document.body.appendChild(a); a.click(); a.remove(); showToast('Imagem salva. É só postar!', 'success');
    }, 'image/png');
  };

  function kpi(l, v, sub) { return '<div class="kpi"><div class="kpi-label">' + l + '</div><div class="kpi-value" style="font-size:20px">' + v + '</div>' + (sub ? '<div class="occ-b-desc">' + sub + '</div>' : '') + '</div>'; }
  function secRaioX() {
    var ds = debtList().filter(function (d) { return !/cart[aã]o de cr/i.test(d.type || '') || d.mensal > 0; });
    if (!ds.length) return '<div class="card mb-24 animate-in"><div class="card-title">🔬 Raio-X da dívida</div><div class="occ-b-desc" style="margin-top:8px">Cadastre uma dívida ou envie o contrato/DED em Documentos para ver quanto do que você paga é juros.</div></div>';
    var cards = ds.map(function (d) {
      var I = typeof dlabInput === 'function' ? dlabInput(d.id) : null;
      var r = A.raioX({ nome: d.name, saldo: I ? I.saldo : d.saldo, jurosMes: I && I.jurosMes > 0 ? I.jurosMes : d.juros, parcela: I ? I.parcela : d.mensal, restantes: I ? I.restantes : d.parcelas, quitacao: I ? I.quitacao : null });
      if (!r.ok) return '<div class="card" style="padding:14px;margin-top:10px"><b>' + esc(d.name) + '</b><div class="occ-b-desc">' + esc(r.avisos.join(' ')) + '</div></div>';
      var bar = r.pctJuros != null ? '<div style="height:12px;border-radius:6px;overflow:hidden;background:var(--income);margin:10px 0 4px"><div style="width:' + r.pctJuros + '%;height:100%;background:var(--expense)"></div></div><div class="occ-b-desc">Vermelho: juros (' + A.pct(r.pctJuros, 0) + '). Verde: o que você realmente deve.</div>' : '';
      return '<div class="card" style="padding:16px;margin-top:12px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(d.name) + '</b><span class="occ-b-desc">taxa ' + r.origemTaxa + '</span></div>' +
        '<div class="kpi-grid" style="margin-top:10px">' + kpi('Você deve hoje', money(r.saldo)) + (r.totalAPagar != null ? kpi('Vai pagar até o fim', money(r.totalAPagar), r.meses + ' parcela(s)') : '') + (r.jurosRestantes != null ? kpi('Só de juros', money(r.jurosRestantes), 'R$ ' + (r.centavosPorReal).toFixed(2).replace('.', ',') + ' para cada R$ 1 devido') : '') + kpi('Custo ao ano', r.cetAnual != null ? A.pct(r.cetAnual, 0) : '—', 'juros mensais ' + (r.jurosMes != null ? A.pct(r.jurosMes, 2) : '—')) + (r.quitacao != null ? kpi('Quitar hoje', money(r.quitacao), r.economiaQuitando > 0 ? 'até ' + money(r.economiaQuitando) + ' a menos que pagar tudo' : '') : '') + '</div>' + bar +
        '<div style="margin-top:10px;font-weight:600">' + esc(r.frase) + '</div>' + (r.economiaNota ? '<div class="occ-b-desc">' + esc(r.economiaNota) + '</div>' : '') + r.avisos.map(function (a) { return '<div class="occ-b-desc" style="color:var(--gold)">' + esc(a) + '</div>'; }).join('') + '<button class="btn-sm" style="margin-top:8px" onclick="openDebtLab(\'' + d.id + '\')">🔎 Simular quitação</button></div>';
    }).join('');
    return '<div class="card mb-24 animate-in"><div class="card-title">🔬 Raio-X da dívida</div><div class="occ-b-desc" style="margin-top:6px">Quanto do que você paga é juros e quanto custaria quitar hoje. Estimativa pela taxa e parcelas informadas: não é o CET oficial (que inclui IOF e tarifas). Confirme com o credor.</div>' + cards + '</div>';
  }

  function secCacador() {
    var subs = visibleList('subscriptions'); if (!subs.length) return '<div class="card mb-24 animate-in"><div class="card-title">🕵️ Caçador de assinaturas</div><div class="occ-b-desc" style="margin-top:8px">Cadastre suas assinaturas (ou envie o recibo de uma) e eu somo o ano, aponto repetidas, paradas e aumentos de preço.</div><button class="btn-sm" style="margin-top:8px" onclick="switchTab(\'assinaturas\')">Ir para Assinaturas</button></div>';
    var r = A.cacador(subs.map(function (s) { return { id: s.id, name: s.name, cat: s.cat, price: s.price }; }), txs(), cobrancas(), today());
    var ic = { repetida: '🔁', sobreposicao: '🧩', parada: '💤', aumento: '📈' };
    return '<div class="card mb-24 animate-in"><div class="card-title">🕵️ Caçador de assinaturas</div><div class="kpi-grid" style="margin-top:10px">' + kpi('Por mês', money(r.totalMes), r.quantidade + ' assinatura(s)') + kpi('Por ano', money(r.totalAno), 'é o que isso custa de verdade') + kpi('Pode economizar', money(r.economiaPotencialAno), 'por ano, se cortar o que sobra') + '</div>' +
      (r.achados.length ? r.achados.map(function (a) { return '<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--card-alt);border-left:3px solid ' + (a.gravidade === 'alta' ? 'var(--expense)' : 'var(--gold)') + '">' + (ic[a.tipo] || '•') + ' ' + esc(a.texto) + '</div>'; }).join('') : '<div class="occ-b-desc" style="margin-top:10px">✅ Nada repetido, parado ou com aumento nos dados que tenho.</div>') +
      '<div class="occ-b-desc" style="margin-top:10px">Mais caras no ano: ' + r.maisCaras.map(function (m) { return esc(m.nome) + ' (' + money(m.ano) + ')'; }).join(', ') + '. Aumento de preço aparece quando você envia dois recibos do mesmo serviço em Documentos.</div></div>';
  }

  function secPlano(c) {
    var a = alvInit(), ds = debtList(); if (!ds.length) return '';
    var extra = a.extra > 0 ? a.extra : livreMes(c), pr = A.prioridade(ds, { extra: extra, start: today() });
    return '<div class="card mb-24 animate-in"><div class="card-title">🧭 Plano de alívio</div><div class="occ-b-desc" style="margin:6px 0 10px">Qual dívida atacar primeiro, e quanto você ganha. Quanto você consegue pagar <b>por mês além das parcelas</b>?</div><div class="form-group" style="max-width:260px"><input class="form-input" type="text" inputmode="decimal" value="' + (a.extra > 0 ? String(a.extra).replace('.', ',') : '') + '" placeholder="' + (livreMes(c) ? 'sobram cerca de ' + livreMes(c) : '0,00') + '" onchange="alvSet(\'extra\',this.value)"></div>' +
      pr.passos.map(function (p) { return '<div style="display:flex;gap:12px;margin-top:10px;align-items:flex-start"><div style="min-width:30px;height:30px;border-radius:15px;background:var(--teal);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">' + p.ordem + '</div><div><b>' + esc(p.nome) + '</b> <span class="occ-b-desc">' + money(p.saldo) + (p.mesesParaQuitar ? ' · quita em ~' + p.mesesParaQuitar + ' mes(es)' : '') + '</span><div class="occ-b-desc">' + esc(p.motivo) + (p.extraVai ? ' <b>O valor extra vai aqui.</b>' : '') + '</div></div></div>'; }).join('') +
      (pr.comPlano ? '<div class="kpi-grid" style="margin-top:14px">' + kpi('Livre das dívidas em', pr.comPlano.meses + ' mes(es)', pr.semExtra && pr.mesesAntes > 0 ? pr.mesesAntes + ' mes(es) antes que sem extra' : '') + kpi('Juros no caminho', money(pr.comPlano.juros), pr.economiaJuros > 0 ? 'economiza ' + money(pr.economiaJuros) : '') + '</div>' : '') +
      '<div class="ag-btns" style="margin-top:12px"><button class="btn-save" onclick="alvAplicar()">📅 Jogar as parcelas na Agenda</button></div><div class="occ-b-desc" style="margin-top:6px">Você revisa o que será criado antes de confirmar. Nada é pago automaticamente.</div></div>';
  }
  window.alvAplicar = function () { switchTab('agenda'); setTimeout(function () { try { if (window.AG) AG.view = 'plans'; renderCurrentTab(); setTimeout(function () { if (typeof agPlanConfirm === 'function') agPlanConfirm('A'); }, 60); } catch (e) { console.warn(e); } }, 40); };
  window.alvSet = function (k, v) { var a = alvInit(), n = typeof simNum === 'function' ? simNum(v) : parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0; a[k] = n > 0 ? n : 0; fxSave('alv'); renderCurrentTab(); };

  function secRoteiro(c) {
    var a = alvInit(), ds = debtList(); if (!ds.length) return '';
    var R = A.roteiros(ds, { vistaDisponivel: a.vista, capacidadeMensal: a.cap > 0 ? a.cap : livreMes(c) });
    var inp = function (k, lbl, ph) { return '<div class="form-group"><label class="form-label">' + lbl + '</label><input class="form-input" type="text" inputmode="decimal" value="' + (a[k] > 0 ? String(a[k]).replace('.', ',') : '') + '" placeholder="' + ph + '" onchange="alvSet(\'' + k + '\',this.value)"></div>'; };
    return '<div class="card mb-24 animate-in"><div class="card-title">💬 Roteiro de renegociação</div><div class="occ-b-desc" style="margin:6px 0 10px">Uma mensagem pronta para cada dívida, na ordem em que vale negociar, calculada com o que você pode pagar.</div><div class="occ-grid-3">' + inp('vista', 'Tenho para pagar à vista agora (R$)', '0,00') + inp('cap', 'Posso pagar por mês, somando tudo (R$)', livreMes(c) ? String(livreMes(c)) : '0,00') + '</div>' +
      (R.roteiros.length ? R.roteiros.map(function (r, i) { return '<div class="card" style="padding:14px;margin-top:12px"><div style="font-weight:700">' + r.ordem + 'º · ' + esc(r.nome) + ' <span class="occ-b-desc">(' + money(r.saldo) + ')</span></div><div class="occ-b-desc">' + esc(r.motivoPrioridade) + '</div><div style="margin:6px 0;font-weight:600">🎯 ' + esc(r.meta) + '</div><textarea class="form-input" id="alv-msg-' + i + '" rows="7" readonly style="resize:vertical">' + esc(r.mensagem) + '</textarea><div class="occ-b-desc" style="margin-top:4px">📍 ' + esc(r.canal) + '</div><button class="btn-sm" style="margin-top:8px" onclick="alvCopy(' + i + ')">Copiar mensagem</button></div>'; }).join('') : '<div class="occ-b-desc">As dívidas descontadas em folha seguem o contracheque; não há o que negociar por aqui.</div>') +
      R.avisos.map(function (t) { return '<div class="occ-b-desc" style="margin-top:10px;color:var(--gold)">⚠️ ' + esc(t) + '</div>'; }).join('') + '</div>';
  }
  window.alvCopy = function (i) { var el = document.getElementById('alv-msg-' + i); if (!el) return; el.select(); try { navigator.clipboard.writeText(el.value); } catch (e) { document.execCommand('copy'); } showToast('Mensagem copiada!', 'success'); };

  function secHolerite() {
    var docs = window.DocIntel ? DocIntel.payslipsForCalc(docsOf('PF')) : [];
    var head = '<div class="card mb-24 animate-in"><div class="card-title">🧾 Auditor de holerite</div>';
    if (docs.length < 2) return head + '<div class="occ-b-desc" style="margin-top:8px">Envie dois holerites de meses diferentes em Documentos (' + docs.length + ' de 2 até agora) e eu mostro o que mudou de um mês para o outro.</div><button class="btn-sm" style="margin-top:8px" onclick="switchTab(\'documentos\')">Enviar holerite</button></div>';
    var p = docs[docs.length - 2].extractedData.payslip, n = docs[docs.length - 1].extractedData.payslip, r = A.auditarHolerite(p, n), mm = function (c) { return c ? c.slice(5) + '/' + c.slice(0, 4) : '—'; };
    var cor = { alta: 'var(--expense)', media: 'var(--gold)', baixa: 'var(--income)' };
    return head + '<div class="occ-b-desc" style="margin:6px 0">Comparando <b>' + mm(r.de) + '</b> com <b>' + mm(r.para) + '</b>. ' + esc(r.resumo) + '</div>' + r.itens.map(function (i) { return '<div style="margin-top:8px;padding:10px 12px;border-radius:8px;background:var(--card-alt);border-left:3px solid ' + cor[i.gravidade] + '">' + esc(i.texto) + '</div>'; }).join('') + '</div>';
  }

  window.renderAlivio = function (c) {
    alvRecord(); c = c || {};
    return '<div class="section-header animate-in"><div><div class="section-title">Central de Alívio</div><div class="section-desc"><i>' + A.SLOGAN + '</i> Entenda o que você deve, escolha por onde começar e acompanhe sua evolução.</div></div></div>' +
      secProgresso() + secRaioX() + secPlano(c) + secRoteiro(c) + secCacador() + secHolerite();
  };
})();
