/* SM Financial — Cuidado com o cliente (ciclo 23).
 * Tudo aqui existe para o bem de quem usa, não para vender: proteção contra golpe, números explicados,
 * recomeço sem culpa, metas que cabem, contas do ano, conforto de leitura, lançamento rápido e por voz,
 * mini-lições, preparo para negociar e lançamentos guardados quando a internet cai.
 * As funções puras (parseVoz, ajustaMetas, provisaoAnuais, poucosDados, diasSem) são testadas em Node. */
(function (root) {
  'use strict';
  var r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  // ───────── lógica pura ─────────
  // "gastei 35 no mercado", "paguei 1.200,50 de aluguel", "recebi 300 reais do freela", "gastei 12 reais e 50 centavos na padaria"
  function parseVoz(txt) {
    var s = ' ' + semAcento(txt).replace(/r\$\s*/g, '') + ' ';
    var tipo = /\b(recebi|ganhei|entrou|caiu|recebimento)\b/.test(s) ? 'income' : 'expense';
    var valor = null, m;
    if ((m = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:reais|real)?(?:\s*e\s*(\d{1,2})\s*centavos?)?/.exec(s))) {
      var inteiro = +m[1].replace(/\./g, ''), cent = m[2] ? +(m[2].length === 1 ? m[2] + '0' : m[2]) : (m[3] ? +m[3] : 0);
      valor = r2(inteiro + cent / 100);
      s = s.slice(0, m.index) + ' # ' + s.slice(m.index + m[0].length);
    }
    if (!(valor > 0)) return null;
    var desc = '', d = /#\s*(?:reais\s*)?(?:no|na|nos|nas|em|de|do|da|com|pro|pra|para o|para a|para)\s+(.+?)\s*$/.exec(s);
    if (d) desc = d[1];
    else desc = s.replace('#', ' ').replace(/\b(eu|hoje|ontem|gastei|paguei|comprei|saiu|torrei|recebi|ganhei|entrou|caiu|reais|real|de|com)\b/g, ' ');
    desc = desc.replace(/\s+/g, ' ').trim();
    if (desc) desc = desc.charAt(0).toUpperCase() + desc.slice(1);
    return { type: tipo, amount: valor, desc: desc.slice(0, 80) };
  }
  // Poucos dados: o diagnóstico vira estimativa
  function poucosDados(nLanc, renda) { return nLanc < 5 || !(renda > 0); }
  // Dias desde o último lançamento
  function diasSem(datasISO, hojeISO) {
    var ult = (datasISO || []).filter(Boolean).sort().pop(); if (!ult) return null;
    return Math.round((Date.parse(hojeISO + 'T00:00:00Z') - Date.parse(ult.slice(0, 10) + 'T00:00:00Z')) / 86400000);
  }
  // Ajusta os aportes das metas ativas para caberem na sobra, na mesma proporção; devolve o novo prazo de cada uma.
  function ajustaMetas(goals, sobra, hoje) {
    var ativas = (goals || []).filter(function (g) { return (+g.monthly || 0) > 0 && (+g.current || 0) < (+g.target || 0); });
    var pedem = ativas.reduce(function (a, g) { return a + (+g.monthly); }, 0);
    if (!ativas.length || !(sobra > 0)) return { possivel: false, pedem: r2(pedem), itens: [] };
    var f = Math.min(1, sobra / pedem), y = hoje.getFullYear(), mo = hoje.getMonth();
    var prazo = function (rest, mensal) { var n = Math.ceil(rest / mensal), t = mo + n; return { meses: n, txt: MESES[((t % 12) + 12) % 12] + '/' + (y + Math.floor(t / 12)) }; };
    return { possivel: true, pedem: r2(pedem), cabe: r2(Math.min(sobra, pedem)), itens: ativas.map(function (g) {
      var rest = (+g.target) - (+g.current), novo = Math.max(1, Math.floor((+g.monthly) * f * 100) / 100);
      return { id: g.id, name: g.name, antes: r2(g.monthly), novo: novo, prazoAntes: prazo(rest, +g.monthly), prazoNovo: prazo(rest, novo) };
    }) };
  }
  // Contas do ano (IPVA, IPTU, matrícula…): quanto separar por mês e quando vence cada uma
  function provisaoAnuais(lista, mesAtual) {
    var it = (lista || []).filter(function (x) { return (+x.valor || 0) > 0 && x.mes >= 1 && x.mes <= 12; }).map(function (x) {
      var faltam = ((x.mes - mesAtual) % 12 + 12) % 12;
      return { id: x.id, nome: x.nome, valor: r2(x.valor), mes: x.mes, faltam: faltam, porMes: r2(x.valor / 12) };
    }).sort(function (a, b) { return a.faltam - b.faltam; });
    return { porMes: r2(it.reduce(function (a, x) { return a + x.porMes; }, 0)), total: r2(it.reduce(function (a, x) { return a + x.valor; }, 0)), itens: it };
  }
  var PURO = { parseVoz: parseVoz, poucosDados: poucosDados, diasSem: diasSem, ajustaMetas: ajustaMetas, provisaoAnuais: provisaoAnuais };
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // ───────── tela (navegador) ─────────
  var KEY = function () { return typeof fxKey === 'function' ? fxKey('cuidado') : 'sm_cuidado'; };
  var P = {};
  function load() { try { P = JSON.parse(localStorage.getItem(KEY()) || '{}') || {}; } catch (e) { P = {}; } try { var nv = window.PREFS && PREFS.data && PREFS.data.cuidado; if (nv && !Object.keys(P).length) P = nv; } catch (e) {} }
  function save() { try { localStorage.setItem(KEY(), JSON.stringify(P)); } catch (e) {} try { if (typeof prefsPush === 'function') prefsPush('cuidado', P); } catch (e) {} }
  function esc(s) { return typeof fxEsc === 'function' ? fxEsc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hojeISO() { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); }
  function txISO(t) { try { var d = parseTxDate(t); return d ? d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) : null; } catch (e) { return null; } }
  function rerender() { try { renderCurrentTab(); } catch (e) {} }
  function brl(v) { return typeof fmt === 'function' ? fmt(v) : 'R$ ' + v; }
  function brlS(v) { return typeof fmtS === 'function' ? fmtS(v) : 'R$ ' + v; }

  // 1) Golpes: aviso fixo nas dívidas e no Modo Crise
  function golpeHtml() {
    return '<div class="card mb-24 animate-in cu-golpe" data-cu="golpe"><div class="card-title" style="margin:0 0 6px">🛡️ Cuidado com golpes de dívida</div>'
      + '<div class="occ-b-desc" style="line-height:1.6">Ninguém limpa o nome “em 24 horas” nem libera empréstimo pedindo <b>taxa ou depósito antecipado</b>: isso é golpe. Negocie só pelos canais oficiais do credor (app, site ou telefone que está no contrato ou no cartão) e só pague boleto que você conferiu ali. Desconfie de quem chama primeiro pelo WhatsApp oferecendo desconto.</div></div>';
  }
  // 3) Apoio no Modo Crise
  function apoioHtml() {
    return '<div class="occ-b-desc" style="margin-top:10px;font-size:13px">💬 Se o aperto está pesando também na cabeça, você não precisa passar por isso sozinho(a). O <b>CVV</b> atende de graça, 24 horas, pelo telefone <b>188</b> ou em <a href="https://cvv.org.br" target="_blank" rel="noopener">cvv.org.br</a>.</div>';
  }

  // 5 e 6) Como calculamos + poucos dados
  function nLancMes() { try { return filterByPeriod(visibleList('transactions'), 'date').length; } catch (e) { return 0; } }
  function avisoDadosHtml(c) {
    if (!c || !poucosDados(nLancMes(), c.totalIncome)) return '';
    return '<div class="occ-b-desc cu-poucos" data-cu="poucos" style="margin:-10px 0 18px;font-size:12.5px">ℹ️ Com ' + nLancMes() + ' lançamento(s) e ' + (c.totalIncome > 0 ? 'renda registrada' : 'sem renda registrada') + ' neste período, os números abaixo são uma <b>estimativa</b>. Quanto mais você lançar, mais certos eles ficam.</div>';
  }
  function info(chave, rotulo) { return '<button type="button" class="cu-i" aria-label="Como calculamos: ' + esc(rotulo || chave) + '" onclick="event.stopPropagation();Cuidado.explica(\'' + chave + '\')">ⓘ</button>'; }
  var GLOSSARIO = {
    patrimonio: ['Patrimônio líquido', 'É tudo o que você tem (dinheiro em conta, aplicações, bens) menos tudo o que você deve. Negativo quer dizer que as dívidas são maiores que o que você tem.'],
    taxa: ['Taxa de economia', 'Quanto da sua renda do mês sobrou, em porcentagem. Ex.: renda de R$ 2.000 e sobra de R$ 200 = 10%.'],
    juros: ['Juros ao mês (a.m.)', 'Quanto a dívida cresce por mês. 5% a.m. numa dívida de R$ 1.000 são R$ 50 a mais no mês seguinte, se nada for pago.'],
    amortizacao: ['Amortização', 'É a parte da parcela que realmente diminui a dívida. O resto da parcela é juros.'],
    rotativo: ['Rotativo do cartão', 'É o que acontece quando você paga menos que o total da fatura: o que falta vira dívida com juros muito altos.']
  };
  function explica(k) {
    var c = compute(), corpo = '';
    if (k === 'sobra') {
      corpo = '<p>Sobra do mês = <b>renda</b> − <b>gastos lançados</b> − <b>parcelas de dívidas que ainda não aparecem nos gastos</b>.</p><table class="cu-t"><tr><td>Renda</td><td>' + brl(c.totalIncome) + '</td></tr><tr><td>Gastos lançados</td><td>− ' + brl(c.totalExpense) + '</td></tr><tr><td>Parcelas não lançadas</td><td>− ' + brl(c.parcelasFora || 0) + '</td></tr><tr><td><b>Sobra</b></td><td><b>' + brlS(c.sobra) + '</b></td></tr></table>';
      try { var it = Resumo.sobra(c.totalIncome, c.totalExpense, visibleList('debts').map(function (d) { return { id: d.id, name: d.name, mensal: d.mensal, folha: DebtLab.descontoFolha(d) }; }), c.expenses).itens;
        if (it.length) corpo += '<p style="margin-top:12px"><b>Parcelas consideradas:</b></p><ul>' + it.map(function (x) { return '<li>' + esc(x.name) + ': ' + brl(x.mensal) + ' — ' + (x.lancada ? 'já está nos seus gastos, não desconto de novo' : 'ainda não lançada, descontada aqui') + '</li>'; }).join('') + '</ul>'; } catch (e) {}
      corpo += '<p class="cu-m">Se uma parcela já foi paga e lançada com outro nome, edite o lançamento para incluir o nome da dívida.</p>';
    } else if (k === 'nota') {
      var ex = { 'Reserva financeira': 'meses de gastos que o seu dinheiro guardado cobre (6 meses ou mais = nota máxima)', 'Nível de dívidas': 'quanto as parcelas pesam na renda (quanto menos, melhor)', 'Economia mensal': 'quanto da renda sobra (40% ou mais = nota máxima)', 'Gastos fixos': 'quanto da renda vai para contas fixas (quanto menos, mais folga)', 'Investimentos': 'parte do que você tem que está investida' };
      corpo = '<p>A nota é a média destes cinco pontos (de 0 a 100). Item sem dado não entra na média.</p><table class="cu-t">' + c.healthItems.map(function (i) { return '<tr><td>' + esc(i.name) + '<div class="cu-m">' + esc(ex[i.name] || '') + '</div></td><td>' + (i.na ? 'sem dado' : i.score) + '</td></tr>'; }).join('') + '</table>';
    } else if (k === 'parcelas') {
      corpo = '<p>Parcelas ÷ renda = <b>' + brl(c.totalDebtMonthly - (c.debtFolha || 0)) + '</b> de parcelas por mês ÷ <b>' + brl(c.totalIncome) + '</b> de renda.</p><p class="cu-m">Parcela de consignado já descontada no salário não entra, para não contar duas vezes. Acima de 30% costuma apertar o orçamento.</p>';
    } else if (GLOSSARIO[k]) { openModal(GLOSSARIO[k][0], '<p style="line-height:1.6">' + GLOSSARIO[k][1] + '</p><div class="modal-actions"><button class="btn-save" onclick="closeModal()">Entendi</button></div>'); return; }
    openModal('Como calculamos', '<div class="cu-ex" style="line-height:1.6">' + corpo + '</div><div class="modal-actions"><button class="btn-save" onclick="closeModal()">Entendi</button></div>');
  }
  function termo(k) { return GLOSSARIO[k] ? '<button type="button" class="cu-i" aria-label="O que é ' + esc(GLOSSARIO[k][0]) + '" onclick="event.stopPropagation();Cuidado.explica(\'' + k + '\')">ⓘ</button>' : ''; }

  // 9) Recomeçar sem culpa
  function recomecoHtml() {
    if (window.DEMO && DEMO.on) return '';
    var datas = []; try { visibleList('transactions').forEach(function (t) { var d = txISO(t); if (d) datas.push(d); }); } catch (e) {}
    var dias = diasSem(datas, hojeISO());
    if (dias == null || dias < 14 || (P.recomeco && P.recomeco >= datas.sort().pop()) || P.recomecoAdiado === hojeISO()) return '';
    return '<div class="card mb-24 animate-in occ-banner" data-cu="recomeco"><div><div class="occ-b-title">👋 Que bom te ver de volta</div><div class="occ-b-desc">Faz ' + dias + ' dias desde o seu último lançamento. Sem culpa: dá para recomeçar a partir de hoje. As contas antigas que ficaram marcadas como vencidas vão para “pendências antigas” na Agenda, sem apagar nada.</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-add" onclick="Cuidado.recomecar()">Recomeçar a partir de hoje</button><button class="btn-sm" onclick="Cuidado.adiar()">Agora não</button></div></div>';
  }
  function recomecar() { P.recomeco = hojeISO(); save(); rerender(); try { showToast('Pronto. Recomeçando a partir de hoje. Um lançamento de cada vez.', 'success'); } catch (e) {} }
  function adiar() { P.recomecoAdiado = hojeISO(); save(); rerender(); }
  function recomecoData() { return P.recomeco || null; }

  // 10) Metas que cabem
  function ajustarMetasModal() {
    var c = compute(), a = ajustaMetas(visibleList('goals'), c.sobra, new Date());
    if (!a.possivel) { openModal('Ajustar metas', '<p style="line-height:1.6">Neste mês não sobra dinheiro depois dos gastos e das parcelas, então não dá para propor um ritmo para as metas. O melhor agora é pausar as metas de longo prazo e cuidar do mês. Quando sobrar, eu calculo de novo.</p><div class="modal-actions"><button class="btn-save" onclick="closeModal()">Entendi</button></div>'); return; }
    openModal('Ajustar metas à sua sobra', '<p style="line-height:1.6">As metas pedem <b>' + brl(a.pedem) + '/mês</b> e sobram <b>' + brl(c.sobra) + '</b>. Proposta: dividir a sobra na mesma proporção de hoje. Os valores e os prazos ficam assim:</p><table class="cu-t"><tr><th>Meta</th><th>Por mês</th><th>Prazo</th></tr>' + a.itens.map(function (i) { return '<tr><td>' + esc(i.name) + '</td><td>' + brl(i.antes) + ' → <b>' + brl(i.novo) + '</b></td><td>' + i.prazoAntes.txt + ' → <b>' + i.prazoNovo.txt + '</b></td></tr>'; }).join('') + '</table><p class="cu-m">Você pode mudar cada meta depois. Nada é movimentado: o app só registra o plano.</p><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancelar</button><button class="btn-save" onclick="Cuidado.aplicarMetas()">Usar estes prazos</button></div>');
  }
  async function aplicarMetas() {
    var c = compute(), a = ajustaMetas(visibleList('goals'), c.sobra, new Date()); if (!a.possivel) return;
    for (var k = 0; k < a.itens.length; k++) { var i = a.itens[k], g = state.goals.find(function (x) { return x.id === i.id; }); if (!g) continue; g.monthly = i.novo;
      try { await dbUpsert('goals', { id: g.id, user_id: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null, name: g.name, icon: g.icon, target_amount: g.target, current_amount: g.current, monthly_contribution: g.monthly, profile: g.profile }); } catch (e) {} }
    closeModal(); rerender(); try { showToast('Metas ajustadas à sua sobra.', 'success'); } catch (e) {}
  }

  // 11) Contas do ano
  function anuais() { return Array.isArray(P.anuais) ? P.anuais : []; }
  function anuaisHtml() {
    var pv = provisaoAnuais(anuais(), new Date().getMonth() + 1);
    var lista = pv.itens.length ? '<div style="margin-top:10px">' + pv.itens.map(function (x) { return '<div class="cu-row"><span>' + esc(x.nome) + ' · ' + MESES_L[x.mes - 1] + (x.faltam === 0 ? ' <b class="cu-red">(este mês)</b>' : ' (em ' + x.faltam + (x.faltam === 1 ? ' mês)' : ' meses)')) + '</span><span>' + brl(x.valor) + ' <button class="cu-x" aria-label="Remover ' + esc(x.nome) + '" onclick="Cuidado.removerAnual(\'' + x.id + '\')">×</button></span></div>'; }).join('') + '</div><div class="occ-b-desc" style="margin-top:8px">Separe <b>' + brl(pv.porMes) + ' por mês</b> e essas contas não pegam você de surpresa.</div>' : '<div class="occ-b-desc">IPVA, IPTU, matrícula, material escolar, seguro… Cadastre as contas que vêm uma vez por ano e eu digo quanto separar por mês.</div>';
    return '<div class="card mb-24 animate-in" data-cu="anuais"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div class="card-title" style="margin:0">📅 Contas do ano</div><button class="btn-sm" onclick="Cuidado.novaAnual()">+ Adicionar</button></div>' + lista + '</div>';
  }
  function novaAnual() {
    openModal('Conta do ano', '<div class="form-group"><label class="form-label" for="cu-an">Nome</label><input class="form-input" id="cu-an" maxlength="60" placeholder="Ex: IPVA"></div><div class="form-row"><div class="form-group"><label class="form-label" for="cu-av">Valor</label><input class="form-input" id="cu-av" inputmode="decimal" data-money placeholder="0"></div><div class="form-group"><label class="form-label" for="cu-am">Mês em que vence</label><select class="form-select" id="cu-am">' + MESES_L.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + '</option>'; }).join('') + '</select></div></div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancelar</button><button class="btn-save" onclick="Cuidado.salvarAnual()">Salvar</button></div>');
  }
  function salvarAnual() {
    var nome = (document.getElementById('cu-an').value || '').trim(), v = parseFloat(document.getElementById('cu-av').value), mes = +document.getElementById('cu-am').value;
    if (!nome || !(v > 0)) { try { showToast('Preencha o nome e um valor maior que zero.', 'error'); } catch (e) {} return; }
    P.anuais = anuais().concat([{ id: 'a' + Date.now().toString(36), nome: nome.slice(0, 60), valor: r2(v), mes: mes }]); save(); closeModal(); rerender();
  }
  function removerAnual(id) { P.anuais = anuais().filter(function (x) { return x.id !== id; }); save(); rerender(); }

  // 12, 13, 15, 16, 17) Acessibilidade e conforto
  function aplicaVisual() {
    var h = document.documentElement; h.classList.remove('cu-fs1', 'cu-fs2'); if (P.fonte === 1) h.classList.add('cu-fs1'); if (P.fonte === 2) h.classList.add('cu-fs2');
    h.classList.toggle('cu-hc', !!P.contraste);
    var fab = document.getElementById('cu-fab'); if (fab) fab.hidden = !document.getElementById('app-screen') || document.getElementById('app-screen').hidden;
  }
  function confortoModal() {
    var demo = window.DEMO && DEMO.on, ck = function (id, on, txt, sub) { return '<label class="cu-ck"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> <span><b>' + txt + '</b>' + (sub ? '<br><small>' + sub + '</small>' : '') + '</span></label>'; };
    openModal('Acessibilidade e conforto', '<div class="form-group"><label class="form-label" for="cu-fonte">Tamanho da letra</label><select class="form-select" id="cu-fonte"><option value="0">Normal</option><option value="1"' + (P.fonte === 1 ? ' selected' : '') + '>Grande</option><option value="2"' + (P.fonte === 2 ? ' selected' : '') + '>Muito grande</option></select></div>'
      + ck('cu-hc', P.contraste, 'Alto contraste', 'Textos mais escuros e bordas mais fortes.')
      + ck('cu-oc', P.ocultoAoAbrir, 'Abrir sempre com os valores ocultos', 'Bom para quem divide o celular ou usa o app em público.')
      + ck('cu-nd', P.avisosDiscretos, 'Avisos sem valores', 'O sino de avisos mostra “R$ ••••” no lugar dos valores.')
      + ck('cu-vz', P.voz, 'Lançar por voz', 'Usa o reconhecimento de voz do seu navegador. Atenção: no Chrome e no Safari o áudio pode ser processado pelo Google ou pela Apple para virar texto. O SM Financial recebe só o texto, e você confere antes de salvar.')
      + '<div class="card" style="margin-top:14px;padding:14px"><b>Seus dados são seus.</b><div class="occ-b-desc">Você pode baixar tudo (JSON, CSV ou Excel) ou apagar a sua conta quando quiser, em qualquer plano.</div>' + (demo ? '<div class="cu-m">Na demonstração não há dados reais.</div>' : '<button class="btn-sm" style="margin-top:8px" onclick="closeModal();openPrivacyModal()">Abrir “Privacidade e meus dados”</button>') + '</div>'
      + '<div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Fechar</button><button class="btn-save" onclick="Cuidado.salvarConforto()">Salvar</button></div>');
  }
  function salvarConforto() {
    var g = function (id) { var e = document.getElementById(id); return !!(e && e.checked); };
    P.fonte = +document.getElementById('cu-fonte').value || 0; P.contraste = g('cu-hc'); P.ocultoAoAbrir = g('cu-oc'); P.avisosDiscretos = g('cu-nd'); P.voz = g('cu-vz');
    save(); aplicaVisual(); closeModal(); try { renderNotifications(); updateNotifBadge(); } catch (e) {} rerender(); try { showToast('Preferências salvas.', 'success'); } catch (e) {}
  }

  // 8 e 17) Lançamento em 2 toques e por voz
  function recentes() {
    var vis = {}, out = [];
    try { visibleList('transactions').filter(function (t) { return t.type === 'expense' && !t.recur; }).sort(function (a, b) { return (txISO(b) || '') < (txISO(a) || '') ? -1 : 1; }).forEach(function (t) {
      var k = semAcento(t.desc); if (!k || vis[k] || out.length >= 5) return; vis[k] = 1; out.push(t); }); } catch (e) {}
    return out;
  }
  function rapido() {
    var rc = recentes(), voz = P.voz && (window.SpeechRecognition || window.webkitSpeechRecognition);
    openModal('Lançar rápido', '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-primary" style="flex:1;min-width:120px" onclick="closeModal();openTransactionModal(\'expense\')">− Gasto</button><button class="btn-primary" style="flex:1;min-width:120px" onclick="closeModal();openTransactionModal(\'income\')">+ Receita</button>' + (voz ? '<button class="btn-secondary" style="flex:1;min-width:120px" onclick="Cuidado.ouvir()">🎙️ Falar</button>' : '') + '</div>'
      + (rc.length ? '<div class="occ-b-desc" style="margin:14px 0 6px">Repetir um gasto recente:</div><div class="cu-chips">' + rc.map(function (t, i) { return '<button class="cu-chip" onclick="Cuidado.repetir(' + i + ')">' + esc(t.desc) + ' · ' + brl(t.amount) + '</button>'; }).join('') + '</div>' : '')
      + (P.voz && !voz ? '<div class="cu-m" style="margin-top:10px">Este navegador não tem reconhecimento de voz.</div>' : '') + '<div id="cu-voz-st" class="cu-m" role="status" style="margin-top:10px"></div>');
  }
  function preenche(type, o) {
    openTransactionModal(type);
    setTimeout(function () { var d = document.getElementById('m-desc'), a = document.getElementById('m-amount'), c = document.getElementById('m-cat');
      if (d && o.desc) { d.value = o.desc; d.dispatchEvent(new Event('input', { bubbles: true })); }
      if (a && o.amount) { a.value = o.amount; a.dispatchEvent(new Event('input', { bubbles: true })); }
      if (c) { var cat = o.cat || (typeof learnedCat === 'function' && o.desc ? (learnedCat(o.desc, type) || (typeof guessTxCategory === 'function' ? guessTxCategory(o.desc, type) : null)) : null); if (cat) for (var i = 0; i < c.options.length; i++) if (c.options[i].text === cat) c.selectedIndex = i; } }, 30);
  }
  function repetir(i) { var t = recentes()[i]; if (!t) return; closeModal(); preenche('expense', { desc: t.desc, amount: t.amount, cat: t.cat }); }
  function ouvir() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, st = document.getElementById('cu-voz-st'); if (!SR) return;
    var rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 1;
    if (st) st.textContent = 'Ouvindo… diga, por exemplo: “gastei 35 no mercado”.';
    rec.onresult = function (ev) { var txt = ev.results[0][0].transcript, p = parseVoz(txt);
      if (!p) { if (st) st.textContent = 'Entendi “' + txt + '”, mas não achei o valor. Tente de novo dizendo o número.'; return; }
      closeModal(); preenche(p.type, p); try { showToast('Confira e toque em Salvar: “' + txt + '”', 'info'); } catch (e) {} };
    rec.onerror = function (e) { if (st) st.textContent = e.error === 'not-allowed' ? 'O microfone foi bloqueado. Libere nas configurações do navegador.' : 'Não consegui ouvir. Tente de novo.'; };
    try { rec.start(); } catch (e) {}
  }
  function fab() {
    if (document.getElementById('cu-fab')) return;
    var b = document.createElement('button'); b.id = 'cu-fab'; b.type = 'button'; b.className = 'cu-fab'; b.setAttribute('aria-label', 'Lançar rápido'); b.title = 'Lançar rápido'; b.textContent = '+';
    b.onclick = rapido; document.body.appendChild(b);
  }

  // 18) Mini-lições no momento certo
  var LICOES = {
    cartao: '💡 <b>Entenda em 1 minuto:</b> pagar menos que o total da fatura joga o resto no <b>rotativo</b>, um dos juros mais caros do país. Se a fatura não fecha, compare antes: parcelar a fatura ou negociar costuma sair mais barato do que deixar rolar.',
    divida: '💡 <b>Entenda em 1 minuto:</b> com mais de uma dívida, pague o mínimo de todas em dia e coloque o dinheiro extra na que cobra <b>mais juros</b>. Atraso vem antes de tudo, porque gera multa e juros de mora.',
    meta: '💡 <b>Entenda em 1 minuto:</b> antes de outras metas, vale ter uma <b>reserva de emergência</b> (alguns meses de gastos guardados em aplicação de resgate imediato). É ela que evita uma dívida nova quando aparece um imprevisto.'
  };
  function licao(tipo) {
    var mb = document.getElementById('modal-body'); if (!mb || mb.querySelector('.cu-licao')) return;
    var d = document.createElement('div'); d.className = 'cu-licao'; d.innerHTML = LICOES[tipo]; mb.insertBefore(d, mb.firstChild);
  }

  // 19) Preparar a negociação (grátis)
  function negociar(id) {
    var d = visibleList('debts').find(function (x) { return x.id === id; }); if (!d) return;
    var c = compute(), cabe = Math.max(0, r2((c.sobra || 0) + (d.mensal || 0)));
    openModal('Preparar a negociação', '<div style="line-height:1.6"><p><b>' + esc(d.name) + '</b> — saldo informado: ' + brl(d.saldo) + (d.juros > 0 ? ' · ' + String(d.juros).replace('.', ',') + '% a.m.' : '') + (d.mensal > 0 ? ' · parcela atual: ' + brl(d.mensal) : '') + '</p>'
      + '<p><b>Parcela máxima que cabe hoje:</b> ' + (c.sobra >= 0 ? brl(cabe) + ' (a sua sobra do mês somada à parcela atual desta dívida). Não aceite parcela acima disso.' : (cabe > 0 ? 'hoje a sua sobra é negativa (' + brlS(c.sobra) + '), então nem a parcela atual cabe. Peça parcelas de até ' + brl(cabe) + ' ou um prazo de carência, e explique isso ao credor.' : 'neste mês não sobra dinheiro nem para a parcela atual. Diga isso ao credor e peça carência ou parcelas bem menores.')) + '</p>'
      + '<p><b>O que pedir:</b></p><ul><li>O valor total que você vai pagar no final (não só a parcela).</li><li>O Custo Efetivo Total (CET) do acordo.</li><li>Desconto para pagamento à vista, se tiver reserva.</li><li>Tudo por escrito, com número de protocolo.</li></ul>'
      + '<p><b>Antes de pagar:</b> confira se o boleto é do credor, pelo app ou site oficial dele. Nunca pague boleto recebido por WhatsApp de número desconhecido.</p></div>'
      + '<div class="modal-actions"><button class="btn-save" onclick="closeModal()">Entendi</button></div>');
  }

  // 14) Lançamentos guardados quando a internet cai
  var QK = function () { return (typeof fxKey === 'function' ? fxKey('fila') : 'sm_fila'); };
  function fila() { try { return JSON.parse(localStorage.getItem(QK()) || '[]') || []; } catch (e) { return []; } }
  function setFila(q) { try { localStorage.setItem(QK(), JSON.stringify(q)); } catch (e) {} atualizaFila(); }
  function enfileira(op) { var q = fila(); q.push(op); setFila(q); }
  function atualizaFila() {
    var n = fila().length, el = document.getElementById('cu-off');
    if (!n && navigator.onLine !== false) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'cu-off'; el.className = 'cu-off'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = navigator.onLine === false ? '📴 Sem internet. ' + (n ? n + ' alteração(ões) guardada(s) neste aparelho; envio quando a conexão voltar.' : 'Você pode continuar lançando: eu guardo e envio depois.') : '⏳ Enviando ' + n + ' alteração(ões) guardada(s)…';
  }
  function logado() { try { return !!(typeof sb !== 'undefined' && sb && typeof currentUser !== 'undefined' && currentUser); } catch (e) { return false; } }
  var enviando = false;
  async function esvazia() {
    if (enviando || navigator.onLine === false || !logado()) { atualizaFila(); return; }
    var q = fila(); if (!q.length) { atualizaFila(); return; }
    enviando = true; atualizaFila();
    try { while (q.length) { var op = q[0]; var r = op.op === 'del' ? await sb.from(op.t).delete().eq('id', op.id) : await sb.from(op.t).upsert(op.r); if (r && r.error && /fetch|network|Failed/i.test(r.error.message || '')) break; q.shift(); setFila(q); } } catch (e) {}
    enviando = false; atualizaFila();
  }
  function protegeGravacao() {
    if (typeof dbUpsert !== 'function' || dbUpsert.__cu) return;
    var up = dbUpsert, del = dbDelete;
    var rede = function (e) { return navigator.onLine === false || /fetch|network|Failed to fetch|Load failed/i.test(String(e && (e.message || e))); };
    // o supabase-js devolve { error } em falha de rede (não lança): por isso a gravação é feita aqui e só recai na original se o erro não for de rede
    root.dbUpsert = async function (t, r) {
      if (!logado()) return up(t, r);
      if (navigator.onLine === false) { enfileira({ op: 'up', t: t, r: r }); return; }
      try { var res = await sb.from(t).upsert(r); if (res && res.error) { if (rede(res.error)) { enfileira({ op: 'up', t: t, r: r }); return; } return up(t, r); } }
      catch (e) { if (rede(e)) { enfileira({ op: 'up', t: t, r: r }); return; } throw e; }
    };
    root.dbDelete = async function (t, id) {
      if (!logado()) return del(t, id);
      if (navigator.onLine === false) { enfileira({ op: 'del', t: t, id: id }); return; }
      try { var res = await sb.from(t).delete().eq('id', id); if (res && res.error && rede(res.error)) enfileira({ op: 'del', t: t, id: id }); }
      catch (e) { if (rede(e)) { enfileira({ op: 'del', t: t, id: id }); return; } throw e; }
    };
    root.dbUpsert.__cu = true;
    window.addEventListener('online', esvazia); window.addEventListener('offline', atualizaFila);
  }

  // 12) Avisos sem valores no sino
  function protegeAvisos() {
    if (typeof generateNotifications !== 'function' || generateNotifications.__cu) return;
    var g = generateNotifications, rx = /(R\$|US\$|€|£)\s?[-−]?\s?\d[\d.]*(,\d{1,2})?/g;
    root.generateNotifications = function () { var l = g.apply(this, arguments); if (!P.avisosDiscretos) return l; return l.map(function (n) { var x = Object.assign({}, n); x.title = String(x.title || '').replace(rx, '$1 ••••'); x.desc = String(x.desc || '').replace(rx, '$1 ••••'); return x; }); };
    root.generateNotifications.__cu = true;
  }
  // 18) Lições: entram nos formulários de dívida e de meta
  function protegeModais() {
    if (typeof openDebtModal === 'function' && !openDebtModal.__cu) { var od = openDebtModal; root.openDebtModal = function (ex) { var r = od.apply(this, arguments); licao(ex && /cart/i.test(String(ex.type || '')) ? 'cartao' : 'divida'); return r; }; root.openDebtModal.__cu = true; }
    if (typeof openGoalModal === 'function' && !openGoalModal.__cu) { var og = openGoalModal; root.openGoalModal = function () { var r = og.apply(this, arguments); licao('meta'); return r; }; root.openGoalModal.__cu = true; }
  }

  // 20) Conquistas financeiras de verdade (selos do jogo)
  function conquistas(c) {
    try {
      if (!window.Jogo || !Jogo.ganhar) return;
      var mapa = P.saldos || {}, mudou = false;
      visibleList('debts').forEach(function (d) { var antes = mapa[d.id]; if (antes > 0 && !((+d.saldo || 0) > 0)) Jogo.ganhar('divida-quitada'); if (mapa[d.id] !== (+d.saldo || 0)) { mapa[d.id] = +d.saldo || 0; mudou = true; } });
      if (mudou) { P.saldos = mapa; save(); }
      if (c && c.totalExpense > 0 && typeof liquidAssetsTotal === 'function' && liquidAssetsTotal() >= c.totalExpense) Jogo.ganhar('reserva-1-mes');
    } catch (e) {}
  }

  function inicioHtml(c) { conquistas(c); return recomecoHtml() + avisoDadosHtml(c) + anuaisHtml(); }
  function aoEntrar() {
    load(); aplicaVisual(); fab(); protegeGravacao(); protegeAvisos(); protegeModais(); esvazia();
    try { if (P.ocultoAoAbrir && window.Conforto && !Conforto.oculto()) Conforto.toggleOculto(); } catch (e) {}
  }
  load();
  root.Cuidado = Object.assign({}, PURO, { golpeHtml: golpeHtml, apoioHtml: apoioHtml, avisoDadosHtml: avisoDadosHtml, info: info, termo: termo, explica: explica, recomecoHtml: recomecoHtml, recomecar: recomecar, adiar: adiar, recomecoData: recomecoData,
    ajustarMetasModal: ajustarMetasModal, aplicarMetas: aplicarMetas, anuaisHtml: anuaisHtml, novaAnual: novaAnual, salvarAnual: salvarAnual, removerAnual: removerAnual,
    confortoModal: confortoModal, salvarConforto: salvarConforto, rapido: rapido, repetir: repetir, ouvir: ouvir, negociar: negociar, inicioHtml: inicioHtml, aoEntrar: aoEntrar, fila: fila, esvazia: esvazia, prefs: function () { return P; } });
})(typeof window !== 'undefined' ? window : globalThis);
