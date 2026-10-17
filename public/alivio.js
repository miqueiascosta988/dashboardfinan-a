/* Central de Alívio — lógica pura (testável em Node) + tela. Slogan: Do aperto ao plano, do plano ao alívio.
   Tudo é ESTIMATIVA calculada no navegador a partir do que o cliente cadastrou/enviou. Não é o CET oficial do contrato
   (que inclui IOF, tarifas e seguros): confirme com a instituição. */
(function (root) {
  'use strict';
  var DL = typeof require === 'function' && typeof module !== 'undefined' ? require('./debtlab.js') : root.DebtLab;
  var FPL = typeof require === 'function' && typeof module !== 'undefined' ? require('./finplan.js') : root.FinPlan;
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var pos = function (v) { return typeof v === 'number' && isFinite(v) && v > 0; };
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); };
  var brl = function (v) { return 'R$ ' + (Math.round(v * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var pct = function (v, d) { return (Math.round(v * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).toFixed(d == null ? 1 : d).replace('.', ',') + '%'; };
  var SLOGAN = 'Do aperto ao plano, do plano ao alívio.';

  // ───────── 1. RAIO-X DA DÍVIDA ─────────
  // taxa mensal implícita: a que faz as parcelas restantes valerem o saldo (bisseção). Mostra o custo REAL mesmo sem taxa cadastrada.
  function impliedRate(pv, pmt, n) {
    if (!pos(pv) || !pos(pmt) || !(n > 0)) return null;
    if (pmt * n <= pv + 0.005) return 0;
    var lo = 0, hi = 1, f = function (i) { return pmt * (1 - Math.pow(1 + i, -n)) / i; };
    if (f(hi) > pv) return null;
    for (var k = 0; k < 80; k++) { var mid = (lo + hi) / 2; if (f(mid) > pv) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function raioX(d) {
    var out = { ok: false, nome: d.nome || 'Dívida', saldo: pos(d.saldo) ? r2(d.saldo) : null, avisos: [] };
    if (!out.saldo) { out.avisos.push('Sem saldo devedor.'); return out; }
    var i = pos(d.jurosMes) ? d.jurosMes / 100 : null, origem = 'informada';
    if (i == null && pos(d.parcela) && d.restantes > 0) { i = impliedRate(d.saldo, d.parcela, d.restantes); origem = 'implícita nas parcelas'; }
    var par = pos(d.parcela) ? d.parcela : null;
    if (i == null && !par) { out.avisos.push('Faltam a taxa de juros ou o valor da parcela para calcular o custo real.'); return out; }
    out.jurosMes = i == null ? null : r2(i * 10000) / 100; out.origemTaxa = i == null ? null : origem;
    out.cetAnual = i == null ? null : r2((Math.pow(1 + i, 12) - 1) * 10000) / 100;
    if (par && i != null) {
      var sch = DL.schedule(d.saldo, i * 100, par, d.restantes > 0 ? d.restantes : null);
      if (sch) {
        out.meses = sch.meses; out.jurosRestantes = sch.jurosTotal; out.totalAPagar = sch.pagoTotal; out.parcela = par;
        out.pctJuros = sch.pagoTotal > 0 ? r2(sch.jurosTotal / sch.pagoTotal * 10000) / 100 : 0;
        out.centavosPorReal = r2(sch.jurosTotal / d.saldo * 100) / 100;     // quanto de juros para cada R$ 1 que ainda deve
        if (sch.naoCobre) out.avisos.push('A parcela não cobre nem os juros do mês: a dívida cresce. Priorize renegociar.');
      }
    }
    if (pos(d.quitacao)) {
      out.quitacao = r2(d.quitacao);
      if (out.totalAPagar != null) { out.economiaQuitando = r2(out.totalAPagar - d.quitacao); out.economiaNota = 'Diferença nominal entre pagar até o fim e quitar hoje (as parcelas são pagas ao longo do tempo; a quitação é um valor só).'; }
    } else out.avisos.push('Envie o demonstrativo (DED) com o valor de quitação para ver quanto custaria quitar hoje.');
    out.ok = true;
    out.frase = (out.jurosRestantes != null ? 'De tudo que você ainda vai pagar (' + brl(out.totalAPagar) + '), ' + brl(out.jurosRestantes) + ' (' + pct(out.pctJuros, 0) + ') é só juros. ' : '') + (out.cetAnual != null ? 'Isso equivale a cerca de ' + pct(out.cetAnual, 0) + ' ao ano.' : '');
    return out;
  }

  // ───────── 2. CAÇADOR DE ASSINATURAS ─────────
  var GRUPOS = [
    ['Vídeo', /netflix|prime video|amazon prime|disney|hbo|max\b|globoplay|paramount|apple tv|star\+|telecine|premiere|crunchyroll|youtube premium/],
    ['Música', /spotify|deezer|apple music|youtube music|amazon music|tidal/],
    ['Nuvem', /icloud|google one|dropbox|onedrive/],
    ['Delivery/Transporte', /ifood|rappi|uber|99\b|clube/],
    ['Academia/Saúde', /gympass|wellhub|smart fit|academia|totalpass/]
  ];
  function grupoDe(nome) { var n = norm(nome); for (var i = 0; i < GRUPOS.length; i++) if (GRUPOS[i][1].test(n)) return GRUPOS[i][0]; return null; }
  // subs: [{id,name,cat,price}]; txs: [{desc,date,amount,type}]; cobrancas: [{servico,valor,date}] (de documentos); today 'YYYY-MM-DD'
  function cacador(subs, txs, cobrancas, today) {
    subs = (subs || []).filter(function (s) { return s && pos(s.price); });
    var mensal = r2(subs.reduce(function (t, s) { return t + s.price; }, 0)), ach = [];
    var limite = new Date(Date.parse(today + 'T12:00:00Z') - 75 * 86400000).toISOString().slice(0, 10);
    // 1) parecidas (mesmo nome)
    var byName = {}; subs.forEach(function (s) { var k = norm(s.name); (byName[k] = byName[k] || []).push(s); });
    Object.keys(byName).forEach(function (k) { var l = byName[k]; if (l.length > 1) ach.push({ tipo: 'repetida', gravidade: 'alta', itens: l.map(function (s) { return s.name; }), economiaAno: r2(l.slice(1).reduce(function (t, s) { return t + s.price * 12; }, 0)), texto: l[0].name + ' aparece ' + l.length + ' vezes. Se for o mesmo serviço, você paga em dobro.' }); });
    // 2) sobreposição: 2+ do mesmo grupo (ex.: 3 streamings de vídeo)
    var byGrp = {}; subs.forEach(function (s) { var g = grupoDe(s.name); if (g) (byGrp[g] = byGrp[g] || []).push(s); });
    Object.keys(byGrp).forEach(function (g) { var l = byGrp[g].slice().sort(function (a, b) { return a.price - b.price; }); if (l.length >= 2 && new Set(l.map(function (s) { return norm(s.name); })).size >= 2) ach.push({ tipo: 'sobreposicao', gravidade: 'media', grupo: g, itens: l.map(function (s) { return s.name; }), economiaAno: r2(l[0].price * 12), texto: 'Você tem ' + l.length + ' assinaturas de ' + g.toLowerCase() + ' (' + l.map(function (s) { return s.name; }).join(', ') + '). Revezar entre elas, um mês de cada, costuma bastar; cancelar a mais barata já economiza.' }); });
    // 3) paradas: sem nenhuma cobrança parecida nos últimos ~75 dias
    var jaParada = {};
    if ((txs || []).length) subs.forEach(function (s) {
      var k = norm(s.name); if (k.length < 3 || jaParada[k]) return; jaParada[k] = 1;
      var vistas = (txs || []).filter(function (t) { return t.date >= limite && norm(t.desc || t.name).indexOf(k) >= 0; });
      if (!vistas.length) ach.push({ tipo: 'parada', gravidade: 'media', itens: [s.name], economiaAno: r2(s.price * 12), texto: 'Não encontrei cobrança de ' + s.name + ' nos seus lançamentos dos últimos 75 dias. Se não for mais usada, é dinheiro parado; se ainda é cobrada, falta lançar.' });
    });
    // 4) aumento de preço (pelos documentos enviados, por serviço)
    var porServ = {}; (cobrancas || []).forEach(function (c) { if (!c || !c.servico || !pos(c.valor) || !c.date) return; (porServ[norm(c.servico)] = porServ[norm(c.servico)] || { nome: c.servico, l: [] }).l.push(c); });
    Object.keys(porServ).forEach(function (k) {
      var l = porServ[k].l.sort(function (a, b) { return a.date < b.date ? -1 : 1; }); if (l.length < 2) return;
      var a = l[l.length - 2], b = l[l.length - 1];
      if (b.valor > a.valor * 1.03 + 0.005) ach.push({ tipo: 'aumento', gravidade: 'alta', itens: [porServ[k].nome], economiaAno: r2((b.valor - a.valor) * 12), de: a.valor, para: b.valor, texto: porServ[k].nome + ' subiu de ' + brl(a.valor) + ' para ' + brl(b.valor) + ' (+' + pct((b.valor / a.valor - 1) * 100, 1) + '). São ' + brl((b.valor - a.valor) * 12) + ' a mais por ano.' });
    });
    var ordem = { alta: 0, media: 1, baixa: 2 }; ach.sort(function (x, y) { return ordem[x.gravidade] - ordem[y.gravidade] || y.economiaAno - x.economiaAno; });
    return { quantidade: subs.length, totalMes: mensal, totalAno: r2(mensal * 12), achados: ach, economiaPotencialAno: r2(ach.reduce(function (t, a) { if (a.tipo === 'aumento') return t; if (a.tipo === 'parada' && ach.some(function (o) { return o.tipo === 'repetida' && o.itens[0] && norm(o.itens[0]) === norm(a.itens[0]); })) return t; return t + a.economiaAno; }, 0)), maisCaras: subs.slice().sort(function (a, b) { return b.price - a.price; }).slice(0, 3).map(function (s) { return { nome: s.name, ano: r2(s.price * 12) }; }) };
  }

  // ───────── 3. PLANO DE ALÍVIO: ordem de ataque ─────────
  var PESO = [[/rotativ|cheque especial/, 6], [/cart[aã]o/, 5], [/empr[eé]stimo pessoal|outras|renegociad/, 4], [/parcelamento|crediario/, 3], [/consignado/, 2], [/ve[ií]culo|imobili[aá]rio|garantia/, 1]];
  function pesoTipo(t) { var n = norm(t); for (var i = 0; i < PESO.length; i++) if (PESO[i][0].test(n)) return PESO[i][1]; return 3; }
  // debts: [{id,name,type,saldo,juros,mensal,parcelas,folha}] ; opts: {extra, start 'YYYY-MM-DD'}
  function prioridade(debts, opts) {
    opts = opts || {}; var lista = (debts || []).filter(function (d) { return d && d.saldo > 0; });
    var ord = lista.slice().sort(function (a, b) {
      var ja = a.juros > 0 ? a.juros : -1, jb = b.juros > 0 ? b.juros : -1;
      if (ja !== jb) return jb - ja;
      var pa = pesoTipo(a.type), pb = pesoTipo(b.type); if (pa !== pb) return pb - pa;
      return a.saldo - b.saldo;
    });
    var extra = pos(opts.extra) ? opts.extra : 0, start = opts.start;
    var base = start && lista.length ? FPL.simulate(lista, { extra: 0, order: ord.map(function (d) { return d.id; }), start: start }) : null;
    var plano = start && lista.length ? FPL.simulate(lista, { extra: extra, order: ord.map(function (d) { return d.id; }), start: start }) : null;
    var porDivida = {}; if (plano) plano.perDebt.forEach(function (p) { porDivida[p.id] = p; });
    var passos = ord.map(function (d, k) {
      var motivo = d.juros > 0 ? 'Maior custo: ' + String(d.juros).replace('.', ',') + '% ao mês' + (k === 0 ? ', então cada real extra aqui rende mais.' : '.') : 'Sem taxa informada: ordenada pelo tipo de crédito.';
      if (d.folha) motivo = 'Descontada em folha: segue o contracheque; só negocie se quiser reduzir a parcela.';
      var pd = porDivida[d.id];
      return { ordem: k + 1, id: d.id, nome: d.name, saldo: d.saldo, motivo: motivo, folha: !!d.folha, mesesParaQuitar: pd ? pd.months : null, extraVai: k === 0 && extra > 0 && !d.folha };
    });
    return { passos: passos, extra: extra, semExtra: base ? { meses: base.months, juros: base.totalInterest, fim: base.endDate } : null, comPlano: plano ? { meses: plano.months, juros: plano.totalInterest, fim: plano.endDate, naoQuita: plano.unfinished } : null, economiaJuros: base && plano ? r2(base.totalInterest - plano.totalInterest) : null, mesesAntes: base && plano ? base.months - plano.months : null };
  }

  // ───────── 4. ROTEIRO DE RENEGOCIAÇÃO (por dívida, na ordem de prioridade) ─────────
  var ABERTURA = [[/rotativ|cheque especial/, 0.5, 'o rotativo e o cheque especial têm os juros mais altos do país; é onde costuma haver mais espaço'], [/cart[aã]o/, 0.4, 'dívida de cartão costuma aceitar desconto para pagamento à vista'], [/empr[eé]stimo pessoal|outras|renegociad/, 0.3, 'empréstimo pessoal costuma aceitar desconto em liquidação antecipada'], [/parcelamento/, 0.2, 'parcelamento de compras costuma ter pouco espaço'], [/consignado/, 0.1, 'consignado tem taxa menor; o ganho maior está em portabilidade'], [/ve[ií]culo|imobili[aá]rio|garantia/, 0.05, 'financiamento com garantia tem pouco desconto; foque em amortizar parcelas do fim para reduzir juros']];
  function aberturaDe(t) { var n = norm(t); for (var i = 0; i < ABERTURA.length; i++) if (ABERTURA[i][0].test(n)) return ABERTURA[i]; return [null, 0.2, 'peça o melhor desconto à vista']; }
  // ctx: { vistaDisponivel, capacidadeMensal, atrasada:{id:bool}, nomeCliente }
  function roteiros(debts, ctx) {
    ctx = ctx || {}; var pr = prioridade(debts, {}), lump = pos(ctx.vistaDisponivel) ? ctx.vistaDisponivel : 0, cap = pos(ctx.capacidadeMensal) ? ctx.capacidadeMensal : 0, out = [];
    var porId = {}; (debts || []).forEach(function (d) { porId[d.id] = d; });
    var negociaveis = pr.passos.filter(function (p) { return !p.folha; });
    negociaveis.forEach(function (p, k) {
      var d = porId[p.id], ab = aberturaDe(d.type), atrasada = !!(ctx.atrasada && ctx.atrasada[d.id]);
      var desc = Math.min(0.7, ab[1] + (atrasada ? 0.1 : 0)), alvoVista = r2(d.saldo * (1 - desc));
      var modo;
      if (lump > 0 && lump >= alvoVista) { modo = 'vista'; lump = r2(lump - alvoVista); } else modo = 'parcelar';
      var rest = negociaveis.slice(k).length, parcShare = cap > 0 ? r2(cap / Math.max(1, rest)) : null, parcAlvo = parcShare && d.mensal > 0 && parcShare < d.mensal ? parcShare : null;
      var taxaAlvo = d.juros > 0 ? r2(Math.max(0.99, d.juros / 2) * 100) / 100 : null;
      var linhas = ['Olá! Sou cliente e quero regularizar o contrato "' + d.name + '", com saldo devedor de ' + brl(d.saldo) + (d.juros > 0 ? ' e taxa de ' + String(d.juros).replace('.', ',') + '% ao mês' : '') + '.'];
      if (modo === 'vista') {
        linhas.push('Tenho ' + brl(alvoVista) + ' disponíveis para quitar à vista nesta semana. Qual o maior desconto que vocês conseguem aplicar sobre juros e encargos para liquidação total hoje?');
      } else {
        linhas.push('Quero manter o pagamento em dia' + (parcAlvo ? ', mas preciso de uma parcela que caiba no meu orçamento (em torno de ' + brl(parcAlvo) + ' por mês)' : ' e posso manter o valor da parcela, desde que os juros e o prazo diminuam') + '. ' + (taxaAlvo ? 'Vocês conseguem reduzir a taxa para algo próximo de ' + String(taxaAlvo).replace('.', ',') + '% ao mês e reparcelar o saldo?' : 'Quais condições de reparcelamento com redução de juros vocês oferecem?'));
      }
      linhas.push('Por favor, envie a proposta por escrito, com o valor total, o CET (custo efetivo total) e a validade, e informe o número de protocolo deste atendimento. Obrigado(a).');
      out.push({ ordem: p.ordem, id: d.id, nome: d.name, saldo: d.saldo, modo: modo, motivoPrioridade: p.motivo, meta: modo === 'vista' ? 'Pedir desconto à vista: abra pedindo cerca de ' + Math.round(desc * 100) + '% (' + brl(alvoVista) + '). Aceitar menos é normal; ' + ab[2] + '.' : (parcAlvo ? 'Pedir parcela menor (alvo ' + brl(parcAlvo) + ') e juros menores.' : 'Pedir juros menores mantendo a parcela, para quitar mais rápido.'), desconto: modo === 'vista' ? desc : null, alvoVista: modo === 'vista' ? alvoVista : null, parcelaAlvo: modo === 'parcelar' ? parcAlvo : null, taxaAlvo: modo === 'parcelar' ? taxaAlvo : null, mensagem: linhas.join('\n\n'), canal: /cart[aã]o|rotativ|cheque/i.test(d.type) ? 'App do banco, chat ou central; se negarem, registre no Consumidor.gov.br.' : 'Chat/WhatsApp oficial ou agência; peça tudo por escrito.' });
    });
    return { roteiros: out, avisos: ['Os percentuais de abertura são metas de negociação, não promessa: o credor decide. Só pague por boleto ou link do canal oficial e nunca faça pagamento de "taxa" antecipada para liberar desconto.'] };
  }

  // ───────── 5. AUDITOR DE HOLERITE (mês contra mês) ─────────
  // prev/next: payslip {competencia, rows:[{desc,valor,kind:'provento'|'desconto',cat}], totals:{venc,desc,liquido}}
  function rubricas(p) { var m = {}; (p.rows || []).forEach(function (r) { if (!r || r.cat === 'ignorar' || !pos(r.valor)) return; var k = (r.kind || '') + '|' + norm(r.desc).replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim(); m[k] = m[k] || { desc: r.desc, kind: r.kind, cat: r.cat, valor: 0 }; m[k].valor = r2(m[k].valor + r.valor); }); return m; }
  function auditarHolerite(prev, next) {
    var out = { de: prev && prev.competencia, para: next && next.competencia, itens: [], resumo: null };
    if (!prev || !next || !prev.rows || !next.rows) { out.resumo = 'Preciso de dois holerites de meses diferentes para comparar.'; return out; }
    var a = rubricas(prev), b = rubricas(next), K = {}; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { K[k] = 1; });
    Object.keys(K).forEach(function (k) {
      var x = a[k], y = b[k], nome = (y || x).desc, desc = (y || x).kind === 'desconto';
      if (x && !y) out.itens.push({ tipo: 'sumiu', gravidade: desc ? 'baixa' : 'media', rubrica: nome, de: x.valor, para: 0, texto: (desc ? 'O desconto "' : 'O provento "') + nome + '" (' + brl(x.valor) + ') não aparece neste mês.' + (desc ? ' Pode ser quitação ou fim de parcelas; confira.' : ' Se era recorrente, vale perguntar ao RH.') });
      else if (!x && y) out.itens.push({ tipo: 'novo', gravidade: desc ? 'alta' : 'baixa', rubrica: nome, de: 0, para: y.valor, texto: (desc ? 'Novo desconto: "' : 'Novo provento: "') + nome + '" de ' + brl(y.valor) + '.' + (desc ? ' Se você não reconhece, peça a explicação ao RH.' : '') });
      else {
        var dif = r2(y.valor - x.valor), rel = x.valor > 0 ? dif / x.valor : 0;
        if (Math.abs(rel) >= 0.1 && Math.abs(dif) >= 20) out.itens.push({ tipo: dif > 0 ? 'subiu' : 'caiu', gravidade: desc && dif > 0 ? 'alta' : 'media', rubrica: nome, de: x.valor, para: y.valor, texto: nome + ' ' + (dif > 0 ? 'subiu' : 'caiu') + ' ' + pct(Math.abs(rel) * 100, 0) + ' (' + brl(x.valor) + ' → ' + brl(y.valor) + ').' + (desc && dif > 0 ? ' Descontos variam com salário/base e faltas; se não houve mudança sua, vale conferir.' : '') });
      }
    });
    var tp = prev.totals || {}, tn = next.totals || {};
    if (tp.venc > 0 && tn.venc > 0 && tp.desc >= 0 && tn.desc >= 0) {
      var ra = tp.desc / tp.venc, rb = tn.desc / tn.venc;
      if (Math.abs(rb - ra) >= 0.02) out.itens.push({ tipo: 'peso_descontos', gravidade: rb > ra ? 'alta' : 'baixa', rubrica: 'Descontos sobre o bruto', de: r2(ra * 100), para: r2(rb * 100), texto: 'Os descontos passaram de ' + pct(ra * 100, 1) + ' para ' + pct(rb * 100, 1) + ' do bruto.' });
    }
    if (tp.liquido > 0 && tn.liquido > 0 && Math.abs(tn.liquido / tp.liquido - 1) >= 0.1) out.itens.push({ tipo: 'liquido', gravidade: 'media', rubrica: 'Líquido', de: tp.liquido, para: tn.liquido, texto: 'O líquido mudou de ' + brl(tp.liquido) + ' para ' + brl(tn.liquido) + ' (' + (tn.liquido > tp.liquido ? '+' : '') + pct((tn.liquido / tp.liquido - 1) * 100, 0) + ').' });
    var ordem = { alta: 0, media: 1, baixa: 2 }; out.itens.sort(function (m, n) { return ordem[m.gravidade] - ordem[n.gravidade]; });
    out.resumo = out.itens.length ? out.itens.length + ' diferença(s) para você conferir. São pontos de atenção, não afirmam erro: o RH explica cada rubrica.' : 'Nada fora do padrão entre os dois meses.';
    return out;
  }

  // ───────── 6. PROGRESSO (avanço e recuo) ─────────
  // snaps: { 'YYYY-MM-DD': totalDevido }. Registra no máximo 1 ponto por dia.
  function registrar(snaps, total, today) { snaps = snaps || {}; if (!(total >= 0) || !today) return snaps; var ks = Object.keys(snaps).sort(); if (ks.length && ks[ks.length - 1] === today && snaps[today] === r2(total)) return snaps; snaps[today] = r2(total); return snaps; }
  function progresso(snaps, atual) {
    var ks = Object.keys(snaps || {}).sort(), serie = ks.map(function (k) { return { d: k, v: snaps[k] }; });
    var inicial = serie.reduce(function (m, s) { return Math.max(m, s.v); }, atual || 0);
    var pctQuitado = inicial > 0 ? Math.max(0, Math.min(100, (1 - (atual || 0) / inicial) * 100)) : 0;
    var meses = {}; serie.forEach(function (s) { meses[s.d.slice(0, 7)] = s.v; });
    var mk = Object.keys(meses).sort(), movs = [];
    for (var i = 1; i < mk.length; i++) movs.push({ mes: mk[i], delta: r2(meses[mk[i]] - meses[mk[i - 1]]), tipo: meses[mk[i]] > meses[mk[i - 1]] ? 'recuo' : meses[mk[i]] < meses[mk[i - 1]] ? 'avanco' : 'estavel' });
    var ult = movs.length ? movs[movs.length - 1] : null;
    return { serie: serie, inicial: r2(inicial), atual: r2(atual || 0), pct: r2(pctQuitado), movimentos: movs, ultimo: ult, pontos: serie.length, mensagem: pctQuitado >= 100 ? 'Dívidas quitadas!' : pctQuitado > 0 ? 'Já quitei ' + Math.floor(pctQuitado) + '% das minhas dívidas' : 'Começando a jornada' };
  }

  var api = { impliedRate: impliedRate, raioX: raioX, cacador: cacador, grupoDe: grupoDe, prioridade: prioridade, roteiros: roteiros, auditarHolerite: auditarHolerite, registrar: registrar, progresso: progresso, SLOGAN: SLOGAN, brl: brl, pct: pct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Alivio = api;
})(typeof window !== 'undefined' ? window : this);
