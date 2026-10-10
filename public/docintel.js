/* SM Financial · Camada central de inteligência de documentos (DocIntel)
 *
 * Responsabilidades separadas (de baixo para cima):
 *   1. Texto estruturado  → buildLines()        (itens do PDF com posição → linhas e células)
 *   2. Classificação      → classify()          (pelo CONTEÚDO; nome do arquivo/aba são só dicas)
 *   3. Extração           → parsePayslip()      (holerite → dados estruturados, por coluna/seção/palavra)
 *   4. Validação          → validatePayslip()   (totais, líquido, FGTS, confiança; nunca inventa valor)
 *   5. Identidade         → identity()/finSig() (impressão digital do holerite)
 *   6. Duplicidade        → decide()/mergeSegments() (duas vias, páginas repetidas, reenvio)
 *   7. Cálculo            → NÃO está aqui: as regras trabalhistas são determinísticas em /src/calc/clt.js
 *
 * Módulo puro (sem DOM): roda no navegador e no Node (testes automatizados).
 * Privacidade: o CPF nunca é guardado por inteiro (só máscara + hash), e o arquivo nunca sai do navegador.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DocIntel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA = 2;
  var MONEY = /(?:^|[^\d.,])(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?![\d])/g;
  var MONEY_CELL = /^-?(\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;

  // ───────── utilidades ─────────
  function num(s) {
    if (typeof s === 'number') return s;
    var n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function strip(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function norm(s) { return strip(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function isMoney(s) { return MONEY_CELL.test(String(s).trim()); }

  // ───────── 1. texto estruturado ─────────
  // items: [{ s, x, y, w }]  (coordenadas do PDF; y maior = mais acima)
  function buildLines(items) {
    var rows = [];
    items.filter(function (i) { return i.s && String(i.s).trim() !== ''; }).forEach(function (it) {
      var row = null;
      for (var k = 0; k < rows.length; k++) if (Math.abs(rows[k].y - it.y) <= 2.5) { row = rows[k]; break; }
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (row) {
      var its = row.items.sort(function (a, b) { return a.x - b.x; });
      var cells = [];
      its.forEach(function (it) {
        var w = it.w != null ? it.w : String(it.s).length * 4.2;
        var last = cells[cells.length - 1];
        // junta pedaços da mesma célula (lacuna pequena); lacuna grande = outra coluna
        if (last && it.x - (last.x + last.w) < 7) { last.s += (it.x - (last.x + last.w) > 1.2 ? ' ' : '') + it.s; last.w = it.x + w - last.x; }
        else cells.push({ s: String(it.s), x: it.x, w: w });
      });
      cells.forEach(function (c) { c.s = c.s.replace(/\s+/g, ' ').trim(); c.c = c.x + c.w / 2; });
      return { y: row.y, cells: cells, text: cells.map(function (c) { return c.s; }).join(' ') };
    });
  }
  function allText(lines) { return lines.map(function (l) { return l.text; }).join('\n'); }

  // ───────── 2. classificação por conteúdo ─────────
  var SIGNALS = {
    holerite: [
      [/recibo de pagamento|demonstrativo de pagamento|contra-?cheque|holerite|folha de pagamento|recibo de salario/, 3],
      [/\bvencimentos?\b|\bproventos?\b/, 2], [/\bdescontos?\b/, 1.5], [/l[ií]quido\s*(a\s*receber)?/, 2],
      [/\binss\b/, 1.5], [/\bfgts\b/, 1.5], [/\birrf\b|imposto de renda/, 1], [/\bcbo\b|admiss[aã]o|\bcargo\b|fun[cç][aã]o/, 1.5],
      [/sal[aá]rio\s*base|sal[aá]rio\s*contrib/, 1.5], [/compet[eê]ncia/, 1]
    ],
    extrato: [[/saldo\s*(anterior|final|dispon[ií]vel)/, 3], [/extrato/, 2.5], [/ag[eê]ncia|conta\s*corrente|\bpix\b|\bted\b|\bdoc\b/, 1.5], [/lan[cç]amentos?|movimenta[cç][aã]o/, 1.5], [/(\d{2}\/\d{2}.{0,60}){5,}/, 2]],
    fatura: [[/fatura/, 3], [/pagamento\s*m[ií]nimo/, 3], [/limite\s*(de\s*cr[eé]dito|dispon[ií]vel|total)/, 2], [/cart[aã]o\s*(de\s*cr[eé]dito|final|com final)/, 2], [/vencimento/, 1]],
    boleto: [[/linha\s*digit[aá]vel|c[oó]digo\s*de\s*barras/, 3], [/benefici[aá]rio|cedente|sacado|pagador/, 2], [/boleto/, 2.5], [/\b\d{5}\.\d{5}\s\d{5}\.\d{6}/, 3]],
    nf: [[/nota\s*fiscal|nf-?e|nfs-?e|danfe/, 3], [/chave\s*de\s*acesso/, 2.5], [/\bicms\b|\biss\b|valor\s*total\s*da\s*nota/, 1.5]],
    imposto: [[/informe\s*de\s*rendimentos|\birpf\b|declara[cç][aã]o\s*de\s*imposto/, 4], [/\bdas\b|simples\s*nacional|documento de arrecada/, 3]],
    contrato: [[/contrato\s*(de|individual)/, 2.5], [/cl[aá]usula|contratante|contratada/, 2.5], [/\bpartes\b/, 1]],
    emprestimo: [[/empr[eé]stimo|financiamento|consignado/, 2.5], [/\bcet\b|taxa\s*de\s*juros|parcelas?\s*restantes?/, 2], [/saldo\s*devedor/, 2.5]]
  };
  // fileName e hint (aba escolhida) só desempatam: peso pequeno de propósito.
  function classify(text, fileName, hint) {
    var t = strip(text).toLowerCase();
    var scores = {}, signals = {};
    Object.keys(SIGNALS).forEach(function (k) {
      var s = 0, sig = [];
      SIGNALS[k].forEach(function (p) { if (p[0].test(t)) { s += p[1]; sig.push(String(p[0]).slice(1, 24)); } });
      scores[k] = s; signals[k] = sig;
    });
    var fn = strip(fileName || '').toLowerCase();
    var fnMap = { holerite: /holerite|contracheque|contra-cheque|folha|salario/, extrato: /extrato/, fatura: /fatura/, boleto: /boleto/, nf: /\bnf|nota|danfe/, imposto: /irpf|informe|\bdas\b/, contrato: /contrato/, emprestimo: /emprestimo|financiamento/ };
    Object.keys(fnMap).forEach(function (k) { if (fnMap[k].test(fn)) scores[k] += 0.75; });
    if (hint && scores[hint] != null) scores[hint] += 0.5;
    var best = 'outro', bs = 0, second = 0;
    Object.keys(scores).forEach(function (k) { if (scores[k] > bs) { second = bs; bs = scores[k]; best = k; } else if (scores[k] > second) second = scores[k]; });
    // holerite exige evidência estrutural, não só uma palavra solta
    var titulo = /recibo de pagamento|demonstrativo de pagamento|contra-?cheque|holerite|recibo de salario|folha de pagamento/.test(t);
    if (best === 'holerite' && !(/l[ií]quido/.test(t) && /(vencimentos?|proventos?)/.test(t) && /descontos?/.test(t)) && !(titulo && bs >= 4) && bs < 6) { best = 'outro'; }
    if (bs < 3) best = 'outro';
    var conf = bs <= 0 ? 0 : Math.min(1, (bs - second * 0.5) / (bs + 2));
    return { kind: best, score: r2(bs), confidence: r2(conf), scores: scores, byContent: bs >= 3 };
  }

  // ───────── 3. extração do holerite ─────────
  var MESES = { janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12 };
  function findCompetencia(lines) {
    var head = lines.slice(0, 40).map(function (l) { return strip(l.text).toLowerCase(); });
    var ordered = head.filter(function (t) { return /compet|refer|per[ií]odo|mes\/?ano|m[eê]s/.test(t); }).concat(head);
    for (var i = 0; i < ordered.length; i++) {
      var t = ordered[i];
      var r = /(\d{2})\/(\d{2})\/(20\d{2})\s*(?:a|ate|-)\s*(\d{2})\/(\d{2})\/(20\d{2})/.exec(t); // intervalo → mês do fim
      if (r) return r[6] + '-' + r[5];
      var m1 = /(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*(?:de|\/|-|\.)?\s*(20\d{2})/.exec(t);
      if (m1) return m1[2] + '-' + ('0' + MESES[m1[1]]).slice(-2);
      var m2 = /\b(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/.exec(t);
      if (m2) return m2[2] + '-' + ('0' + m2[1]).slice(-2);
    }
    return null;
  }
  function findTipo(lines) {
    var head = lines.slice(0, 14).map(function (l) { return strip(l.text).toLowerCase(); }).join(' | ');
    if (/13[o°º]?\s*(\.|-)?\s*salario|gratificacao natalina|decimo terceiro|13\s*salario/.test(head) && !/adiantamento/.test(head)) return '13o';
    if (/adiantamento\s*(de\s*)?(13|decimo|salarial|quinzenal)|1[ªa]?\s*parcela\s*(do\s*)?13/.test(head)) return 'adiantamento';
    if (/recibo de ferias|aviso de ferias|\bferias\b.*recibo/.test(head)) return 'ferias';
    if (/rescis/.test(head)) return 'rescisao';
    if (/complementar|folha\s*complementar/.test(head)) return 'complementar';
    return 'mensal';
  }
  var LABEL_ANY = /^(nome|funcion[aá]rio|colaborador|empregado|cpf|cnpj|empresa|empregador|raz[aã]o social|cargo|fun[cç][aã]o|cbo|admiss[aã]o|compet[eê]ncia|c[oó]d|descri[cç][aã]o|refer[eê]ncia|vencimentos|descontos|proventos|total|l[ií]quido|base|sal[aá]rio|banco|ag[eê]ncia|conta|matr[ií]cula|dep|depto|departamento|setor|local)\b/i;

  function cellAfterLabel(lines, li, ci, labelRe) {
    var cell = lines[li].cells[ci];
    var m = labelRe.exec(strip(cell.s));
    var rest = m ? cell.s.slice(Math.min(cell.s.length, m[0].length)).replace(/^[\s:.\-–]+/, '') : '';
    if (rest && !LABEL_ANY.test(strip(rest))) return rest;
    var next = lines[li].cells[ci + 1];
    if (next && !LABEL_ANY.test(strip(next.s))) return next.s;
    var below = lines[li + 1] && nearestCell(lines[li + 1], cell.c, 140);
    if (below && !LABEL_ANY.test(strip(below.s))) return below.s;
    return null;
  }
  function nearestCell(line, cx, maxd) {
    var best = null, bd = maxd == null ? 1e9 : maxd;
    line.cells.forEach(function (c) { var d = Math.abs(c.c - cx); if (d < bd) { bd = d; best = c; } });
    return best;
  }
  // valor monetário associado a um rótulo: na mesma célula, à direita na mesma linha ou logo abaixo (alinhado)
  function valueForLabel(lines, li, ci) {
    var line = lines[li], cell = line.cells[ci];
    var inCell = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/.exec(cell.s);
    if (inCell && cell.s.replace(inCell[0], '').trim().length > 2) return num(inCell[1]);
    for (var k = ci + 1; k < line.cells.length; k++) {
      var c = line.cells[k];
      if (isMoney(c.s)) return num(c.s);
      if (/[a-z]{3,}/i.test(c.s) && !isMoney(c.s)) break; // outro rótulo: para
    }
    for (var d = 1; d <= 2; d++) {
      var nl = lines[li + d]; if (!nl) break;
      var cand = nl.cells.filter(function (x) { return isMoney(x.s); });
      if (!cand.length) continue;
      var best = null, bd = 95;
      cand.forEach(function (x) { var dd = Math.abs(x.c - cell.c); if (dd < bd) { bd = dd; best = x; } });
      if (best) return num(best.s);
    }
    return null;
  }

  var RX = {
    totVenc: /^(total\s*(de\s*)?(vencimentos|proventos|rendimentos|bruto)|tot\.?\s*(venc|prov)\w*|sal[aá]rio\s*bruto|total\s*bruto)/i,
    totDesc: /^(total\s*(de\s*)?descontos|tot\.?\s*desc\w*)/i,
    liquido: /(valor\s*)?l[ií]quido(\s*(a\s*receber|do\s*m[eê]s|de\s*pagamento))?/i,
    baseInss: /(base\s*(de\s*c[aá]lc\w*\s*)?(do\s*|p\/?\s*)?inss|sal[aá]rio\s*(de\s*)?contrib\w*|base\s*previd\w*)/i,
    baseFgts: /(base\s*(de\s*c[aá]lc\w*\s*)?(do\s*|p\/?\s*)?fgts|base\s*fgts|sal[aá]rio\s*(base\s*)?fgts)/i,
    fgtsMes: /(fgts\s*(do\s*m[eê]s|m[eê]s|dep[oó]sito|a\s*recolher|\(8%\))|dep[oó]sito\s*(do\s*)?fgts|valor\s*(do\s*)?fgts)/i,
    baseIrrf: /(base\s*(de\s*c[aá]lc\w*\s*)?(do\s*|p\/?\s*)?(irrf|ir\b|imposto de renda)|base\s*irrf)/i,
    irrfFaixa: /(faixa\s*irrf|al[ií]quota\s*irrf)/i
  };

  function classifyRow(desc) {
    var d = strip(desc).toLowerCase();
    if (/base|contribui[cç]ao\s*sindical\s*base/.test(d) && /inss|fgts|irrf|\bir\b/.test(d)) return { kind: null, cat: 'ignorar', skip: true };
    if (/\binss\b|previd/.test(d)) return { kind: 'desconto', cat: 'inss' };
    if (/irrf|imposto de renda|\bir\b|i\.r\./.test(d)) return { kind: 'desconto', cat: 'irrf' };
    if (/consign|emprestimo|financiamento/.test(d)) return { kind: 'desconto', cat: 'consig' };
    if (/adiantamento\s*(de\s*)?(13|decimo)|1[ªa]?\s*parcela.*13/.test(d)) return { kind: 'desconto', cat: 'ignorar' };
    if (/adiantamento|vale|plano|mensalidade|pensao|falta|atraso|co-?participa|seguro|sindic|contribui|odont|medic|refeic|alimenta|transporte/.test(d)) return { kind: 'desconto', cat: 'outros' };
    if (/13[o°º]?\s*(\.|-)?\s*sal|ferias|abono|1\/3|rescis|aviso previo|indeniza|salario familia|licenca|maternidade|ajuda de custo/.test(d)) return { kind: 'provento', cat: 'ignorar' };
    if (/horas?\s*extras?|\bh\.?e\.?\b|adicional|comiss|gratifica|dsr|descanso|periculos|insalubr|bonus|premio|plr|produtividade|noturno|sobreaviso|participacao|gorjeta|quebra de caixa/.test(d)) return { kind: 'provento', cat: 'variavel' };
    if (/salario|ordenado|vencimento|remunera|pro-?labore|mensalidade escolar/.test(d)) return { kind: 'provento', cat: 'base' };
    return { kind: null, cat: 'ignorar' };
  }

  function findColumns(lines) {
    // cabeçalho da tabela: linha com "Vencimentos/Proventos" e "Descontos" (e, se houver, "Referência")
    for (var i = 0; i < lines.length; i++) {
      var cs = lines[i].cells, v = null, d = null, rf = null, ds = null;
      cs.forEach(function (c) {
        var t = strip(c.s).toLowerCase();
        if (/^(vencimentos?|proventos?|rendimentos?)$/.test(t)) v = c;
        else if (/^descontos?$/.test(t)) d = c;
        else if (/^(refer[eê]ncia|ref\.?|qtd\.?|quant\w*)$/.test(t)) rf = c;
        else if (/^(descri[cç][aã]o|rubrica|evento|hist[oó]rico)/.test(t)) ds = c;
      });
      if (v && d) return { idx: i, venc: v.c, desc: d.c, ref: rf ? rf.c : null, descr: ds ? ds.c : null };
    }
    return null;
  }

  function parsePayslip(lines) {
    var p = { schema: SCHEMA, kind: 'holerite', competencia: findCompetencia(lines), tipo: findTipo(lines), worker: {}, employer: {}, rows: [], totals: {}, bases: {}, notes: [] };
    var i, c;
    // identificação (dado mínimo; CPF nunca guardado por inteiro)
    lines.forEach(function (l, li) {
      l.cells.forEach(function (cell, ci) {
        var t = strip(cell.s);
        if (!p.worker.name && /^(nome|funcionario|colaborador|empregado)\b/i.test(t) && !/empresa|empregador/i.test(t)) {
          var v = cellAfterLabel(lines, li, ci, /^(nome( do (funcionario|colaborador|empregado))?|funcionario|colaborador|empregado)\s*[:.\-]?/i);
          if (v && /[A-Za-zÀ-ú]{3,}/.test(v) && !isMoney(v) && !/^\d/.test(v)) p.worker.name = v.replace(/\s+\d+.*$/, '').trim();
        }
        if (!p.employer.name && /^(empresa|empregador|raz[aã]o social)\b/i.test(t)) {
          var e = cellAfterLabel(lines, li, ci, /^(empresa|empregador|raz[aã]o social)\s*[:.\-]?/i);
          if (e && /[A-Za-zÀ-ú]{3,}/.test(e) && !/^\d/.test(e)) p.employer.name = e.trim();
        }
      });
    });
    var txt = allText(lines);
    var cpf = /\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b/.exec(txt);
    if (cpf) { p.worker.cpfDigits = cpf[1] + cpf[2] + cpf[3] + cpf[4]; p.worker.cpfMask = '***.' + cpf[2] + '.' + cpf[3] + '-**'; }
    var cnpj = /\b(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})\b/.exec(txt);
    if (cnpj) p.employer.cnpjDigits = cnpj[1] + cnpj[2] + cnpj[3] + cnpj[4] + cnpj[5];

    // totais, líquido e bases (rótulo → valor alinhado)
    lines.forEach(function (l, li) {
      l.cells.forEach(function (cell, ci) {
        var t = strip(cell.s);
        var tt = t.replace(/\s*[:.]\s*$/, '');
        var v;
        if (RX.totVenc.test(tt) && p.totals.venc == null) { v = valueForLabel(lines, li, ci); if (v != null) p.totals.venc = v; }
        else if (RX.totDesc.test(tt) && p.totals.desc == null) { v = valueForLabel(lines, li, ci); if (v != null) p.totals.desc = v; }
        else if (RX.liquido.test(tt) && !/sal[aá]rio\s*l[ií]quido\s*base/i.test(tt) && p.totals.liquido == null && tt.length < 34) { v = valueForLabel(lines, li, ci); if (v != null) p.totals.liquido = v; }
        else if (RX.baseInss.test(tt) && p.bases.inss == null) { v = valueForLabel(lines, li, ci); if (v != null) p.bases.inss = v; }
        else if (RX.baseFgts.test(tt) && p.bases.fgts == null) { v = valueForLabel(lines, li, ci); if (v != null) p.bases.fgts = v; }
        else if (RX.baseIrrf.test(tt) && p.bases.irrf == null) { v = valueForLabel(lines, li, ci); if (v != null) p.bases.irrf = v; }
        else if (RX.fgtsMes.test(tt) && p.bases.fgtsMes == null) { v = valueForLabel(lines, li, ci); if (v != null) p.bases.fgtsMes = v; }
      });
    });

    // linhas de evento (rubricas)
    var col = findColumns(lines), start = col ? col.idx + 1 : 0, end = lines.length;
    for (i = start; i < lines.length; i++) if (RX.totVenc.test(strip(lines[i].text)) || RX.totDesc.test(strip(lines[i].text)) || /^total/i.test(strip(lines[i].text))) { end = i; break; }
    var section = null;
    for (i = start; i < end; i++) {
      var l = lines[i], tl = strip(l.text).toLowerCase().trim();
      if (/^(proventos|vencimentos|rendimentos)$/.test(tl)) { section = 'provento'; continue; }
      if (/^descontos$/.test(tl)) { section = 'desconto'; continue; }
      var moneyCells = l.cells.filter(function (x) { return isMoney(x.s); });
      if (!moneyCells.length) continue;
      var textCells = l.cells.filter(function (x) { return !isMoney(x.s) && /[A-Za-zÀ-ú]{3}/.test(x.s); });
      if (!textCells.length) continue;
      var desc = textCells.map(function (x) { return x.s; }).join(' ').replace(/^\d{1,5}\s+/, '').trim();
      if (RX.baseInss.test(strip(desc)) || RX.baseFgts.test(strip(desc)) || RX.baseIrrf.test(strip(desc)) || RX.fgtsMes.test(strip(desc)) || RX.liquido.test(strip(desc)) || /^(valor|ref)/i.test(strip(desc))) continue;
      var codeCell = l.cells.filter(function (x) { return /^\d{1,5}$/.test(x.s); })[0];
      var row = { code: codeCell ? codeCell.s : null, desc: desc.slice(0, 60), ref: null, valor: null, kind: null, kindSource: null, cat: 'ignorar' };
      if (col) {
        moneyCells.forEach(function (m) {
          var dv = Math.abs(m.c - col.venc), dd = Math.abs(m.c - col.desc), dr = col.ref != null ? Math.abs(m.c - col.ref) : 1e9;
          var mn = Math.min(dv, dd, dr);
          if (mn === dr && dr < dv && dr < dd) row.ref = num(m.s);
          else if (mn === dv) { row.valor = num(m.s); row.kind = 'provento'; row.kindSource = 'coluna'; }
          else { row.valor = num(m.s); row.kind = 'desconto'; row.kindSource = 'coluna'; }
        });
      } else {
        row.valor = num(moneyCells[moneyCells.length - 1].s);
        if (moneyCells.length > 1) row.ref = num(moneyCells[0].s);
        if (section) { row.kind = section; row.kindSource = 'secao'; }
      }
      var cr = classifyRow(row.desc);
      if (cr.skip) continue;
      if (!row.kind && cr.kind) { row.kind = cr.kind; row.kindSource = 'palavra'; }
      row.cat = cr.cat;
      if (row.kind === 'desconto' && row.cat === 'base') row.cat = 'outros';
      if (row.kind === 'provento' && (row.cat === 'inss' || row.cat === 'irrf' || row.cat === 'consig' || row.cat === 'outros')) row.cat = 'ignorar';
      if (row.valor == null) continue;
      p.rows.push(row);
    }
    p.pageSpan = null;
    return validatePayslip(p);
  }

  // ───────── 4. validação ─────────
  function validatePayslip(p) {
    var checks = [], conf = 1, unk = p.rows.filter(function (r) { return !r.kind; });
    function chk(id, ok, msg, penalty) { checks.push({ id: id, ok: ok, msg: msg }); if (!ok) conf -= penalty; }
    var sum = function (k) { return r2(p.rows.filter(function (r) { return r.kind === k; }).reduce(function (s, r) { return s + r.valor; }, 0)); };
    // tenta resolver linhas sem coluna/seção usando os totais impressos (nunca chuta quando não fecha)
    if (unk.length && p.totals.venc != null && p.totals.desc != null && unk.length <= 12) {
      var baseV = sum('provento'), n = unk.length, best = null;
      for (var mask = 0; mask < (1 << n); mask++) {
        var v = baseV, d = sum('desconto');
        unk.forEach(function (r, i) { if (mask & (1 << i)) v += r.valor; else d += r.valor; });
        if (Math.abs(v - p.totals.venc) < 0.011 && Math.abs(d - p.totals.desc) < 0.011) { if (best == null) best = mask; else { best = -1; break; } }
      }
      if (best != null && best >= 0) { unk.forEach(function (r, i) { r.kind = (best & (1 << i)) ? 'provento' : 'desconto'; r.kindSource = 'totais'; if (r.kind === 'provento' && r.cat === 'ignorar') r.cat = 'ignorar'; }); p.notes.push('Algumas linhas foram classificadas pela conferência com os totais do documento.'); unk = []; conf -= 0.05; }
    }
    chk('competencia', !!p.competencia, 'Competência (mês/ano) não encontrada.', 0.25);
    chk('liquido', p.totals.liquido != null, 'Líquido a receber não encontrado.', 0.25);
    chk('totais', p.totals.venc != null && p.totals.desc != null, 'Totais de vencimentos/descontos não encontrados.', 0.15);
    chk('trabalhador', !!(p.worker.cpfDigits || p.worker.name), 'Trabalhador (nome/CPF) não identificado.', 0.1);
    chk('rubricas', p.rows.length > 0, 'Nenhuma rubrica (linha de evento) reconhecida.', 0.3);
    chk('indefinidas', unk.length === 0, unk.length + ' linha(s) sem coluna de provento/desconto definida.', 0.15);
    if (p.totals.venc != null && p.rows.length && !unk.length) chk('soma_venc', Math.abs(sum('provento') - p.totals.venc) < 0.02, 'Soma dos proventos (' + sum('provento').toFixed(2) + ') difere do total impresso (' + p.totals.venc.toFixed(2) + ').', 0.3);
    if (p.totals.desc != null && p.rows.length && !unk.length) chk('soma_desc', Math.abs(sum('desconto') - p.totals.desc) < 0.02, 'Soma dos descontos (' + sum('desconto').toFixed(2) + ') difere do total impresso (' + p.totals.desc.toFixed(2) + ').', 0.3);
    if (p.totals.venc != null && p.totals.desc != null && p.totals.liquido != null) chk('liquido_conf', Math.abs(p.totals.venc - p.totals.desc - p.totals.liquido) < 0.02, 'Vencimentos − descontos (' + r2(p.totals.venc - p.totals.desc).toFixed(2) + ') não bate com o líquido (' + p.totals.liquido.toFixed(2) + ').', 0.35);
    if (p.bases.fgtsMes != null && p.bases.fgts != null && p.bases.fgts > 0) chk('fgts8', Math.abs(p.bases.fgtsMes - p.bases.fgts * 0.08) <= Math.max(0.05, p.bases.fgts * 0.002), 'FGTS do mês (' + p.bases.fgtsMes.toFixed(2) + ') não corresponde a 8% da base (' + r2(p.bases.fgts * 0.08).toFixed(2) + ').', 0.1);
    if (p.bases.fgtsMes != null && p.bases.fgts != null && p.bases.fgtsMes === p.bases.fgts) chk('fgts_confuso', false, 'Base do FGTS e FGTS do mês têm o mesmo valor: possível leitura trocada.', 0.1);
    p.checks = checks; p.confidence = r2(Math.max(0, Math.min(1, conf)));
    var critical = checks.some(function (c) { return !c.ok && /^(liquido|competencia|rubricas|soma_venc|soma_desc|liquido_conf|indefinidas)$/.test(c.id); });
    p.status = (p.confidence >= 0.85 && !critical) ? 'done' : (p.confidence > 0.3 && p.rows.length ? 'needs_review' : 'failed');
    return p;
  }

  // ───────── 5. identidade e assinatura financeira ─────────
  function identityString(p) {
    var who = p.worker.cpfDigits ? 'cpf:' + p.worker.cpfDigits : (p.worker.name ? 'nome:' + norm(p.worker.name) : 'sem-trabalhador');
    var emp = p.employer.cnpjDigits ? 'cnpj:' + p.employer.cnpjDigits : (p.employer.name ? 'emp:' + norm(p.employer.name) : 'sem-empresa');
    return [who, emp, p.competencia || 'sem-competencia', p.tipo || 'mensal'].join('|');
  }
  function finSig(p) {
    var t = p.totals;
    if (t.liquido == null && t.venc == null) return 'rows:' + p.rows.map(function (r) { return r.kind + r.valor.toFixed(2); }).sort().join(',');
    return [t.liquido != null ? t.liquido.toFixed(2) : '?', t.venc != null ? t.venc.toFixed(2) : '?', t.desc != null ? t.desc.toFixed(2) : '?'].join('|');
  }
  function weakParts(p) { return { worker: !!(p.worker.cpfDigits || p.worker.name), employer: !!(p.employer.cnpjDigits || p.employer.name) }; }
  function sameWorker(a, b) {
    if (a.worker.cpfDigits && b.worker.cpfDigits) return a.worker.cpfDigits === b.worker.cpfDigits;
    if (a.worker.name && b.worker.name) return norm(a.worker.name) === norm(b.worker.name);
    return null; // desconhecido
  }
  function sameEmployer(a, b) {
    if (a.employer.cnpjDigits && b.employer.cnpjDigits) return a.employer.cnpjDigits === b.employer.cnpjDigits;
    if (a.employer.name && b.employer.name) return norm(a.employer.name) === norm(b.employer.name);
    return null;
  }

  // ───────── 6. duplicidade ─────────
  // Compara um candidato com holerites já guardados. Nunca descarta sozinho um documento com valores diferentes.
  function compare(a, b) {
    if (!a.competencia || !b.competencia || a.competencia !== b.competencia || (a.tipo || 'mensal') !== (b.tipo || 'mensal')) return { relation: 'distinct', reason: 'competência ou tipo diferente' };
    var sw = sameWorker(a, b), se = sameEmployer(a, b);
    if (sw === false || se === false) return { relation: 'distinct', reason: sw === false ? 'trabalhador diferente' : 'empresa diferente' };
    var sameFin = finSig(a) === finSig(b);
    var unknown = (sw === null) || (se === null);
    if (sameFin && !unknown) return { relation: 'duplicate', reason: 'mesmo trabalhador, empresa, competência e valores (segunda via ou reenvio)' };
    if (sameFin && unknown) return { relation: 'maybe_duplicate', reason: 'valores idênticos, mas faltam dados para confirmar o trabalhador/empresa' };
    return { relation: 'conflict', reason: 'mesma competência e trabalhador, porém valores diferentes (correção, folha complementar ou erro de leitura?)' };
  }
  function decide(existing, cand, candHash) {
    for (var i = 0; i < existing.length; i++) {
      var e = existing[i];
      if (candHash && e.contentHash && e.contentHash === candHash) return { action: 'duplicate', target: e.id, reason: 'arquivo idêntico já enviado' };
    }
    var maybe = null;
    for (var j = 0; j < existing.length; j++) {
      var ex = existing[j]; if (!ex.payslip) continue;
      if (!cand) continue;
      var c = compare(ex.payslip, cand);
      if (c.relation === 'duplicate') return { action: 'duplicate', target: ex.id, reason: c.reason };
      if (c.relation === 'conflict') return { action: 'conflict', target: ex.id, reason: c.reason };
      if (c.relation === 'maybe_duplicate' && !maybe) maybe = { action: 'confirm', target: ex.id, reason: c.reason };
    }
    return maybe || { action: 'new' };
  }
  // Une segmentos do MESMO arquivo (duas vias na página, páginas repetidas): conta cada lançamento uma vez.
  function mergeSegments(segs) {
    var out = [];
    segs.forEach(function (s) {
      var merged = false;
      for (var i = 0; i < out.length; i++) {
        var c = compare(out[i].payslip, s.payslip);
        if (c.relation === 'duplicate' || c.relation === 'maybe_duplicate') {
          out[i].pages = out[i].pages.concat(s.pages); out[i].copies = (out[i].copies || 1) + 1;
          if (s.payslip.confidence > out[i].payslip.confidence) { out[i].payslip = s.payslip; }
          merged = true; break;
        }
      }
      if (!merged) { s.copies = 1; out.push(s); }
    });
    // dentro do arquivo, mesma competência com valores diferentes → exige confirmação do usuário
    for (var a = 0; a < out.length; a++) for (var b = a + 1; b < out.length; b++) {
      if (compare(out[a].payslip, out[b].payslip).relation === 'conflict') { out[b].conflictWith = a; }
    }
    return out;
  }

  // Segmenta uma página em vias (cada via começa num título de holerite).
  var ANCHOR = /(recibo de pagamento|demonstrativo de pagamento|contra-?cheque|holerite|recibo de salario|folha de pagamento)/i;
  function splitSegments(lines) {
    var idx = [];
    lines.forEach(function (l, i) { if (ANCHOR.test(strip(l.text))) idx.push(i); });
    // mantém só âncoras separadas por pelo menos uma tabela de totais entre elas
    var starts = [];
    idx.forEach(function (i) {
      if (!starts.length) { starts.push(i); return; }
      var prev = starts[starts.length - 1];
      var between = lines.slice(prev, i).some(function (l) { return RX.liquido.test(strip(l.text)) || /^total/i.test(strip(l.text)); });
      if (between) starts.push(i);
    });
    if (starts.length < 2) return [lines];
    var segs = [];
    starts.forEach(function (s, k) { segs.push(lines.slice(k === 0 ? 0 : s, k + 1 < starts.length ? starts[k + 1] : lines.length)); });
    return segs;
  }

  // Pipeline puro: páginas já convertidas em linhas → holerites distintos do arquivo.
  function analyzePages(pagesLines) {
    var segs = [];
    pagesLines.forEach(function (lines, pi) {
      splitSegments(lines).forEach(function (sl) {
        var cls = classify(allText(sl), '', null);
        if (cls.kind !== 'holerite') return;
        var p = parsePayslip(sl);
        if (!p.rows.length && p.totals.liquido == null) return;
        segs.push({ payslip: p, pages: [pi + 1] });
      });
    });
    return mergeSegments(segs);
  }


  // ───────── 7. entidade lógica única + pipeline do documento ─────────
  function extractAmount(lines, kind) {
    var re = kind === 'fatura' ? /(total\s*da\s*fatura|valor\s*total|total\s*a\s*pagar|pagamento\s*total)/i : /(valor\s*do\s*documento|valor\s*cobrado|total\s*a\s*pagar|valor\s*total|valor)/i;
    for (var i = 0; i < lines.length; i++) for (var j = 0; j < lines[i].cells.length; j++) {
      if (re.test(strip(lines[i].cells[j].s))) { var v = valueForLabel(lines, i, j); if (v != null && v > 0) return v; }
    }
    return 0;
  }
  var KIND_TYPE = { holerite: 'income', nf: 'income' };
  function docFromPayslip(seg, ctx, cls) {
    var p = seg.payslip, id = ctx.newId();
    return {
      id: id, name: 'Holerite ' + (p.competencia ? p.competencia.slice(5) + '/' + p.competencia.slice(0, 4) : '(competência a confirmar)') + (p.tipo && p.tipo !== 'mensal' ? ' · ' + p.tipo : ''),
      type: 'income', category: 'holerite', amount: p.totals.liquido != null ? p.totals.liquido : 0, date: ctx.dateLabel || '',
      status: p.status === 'done' ? 'processado' : 'revisar', fileSize: ctx.fileSize || 0, mimeType: ctx.mimeType || 'application/pdf',
      extractedData: { schema: SCHEMA, kind: 'holerite', contentHash: ctx.contentHash || null, identity: identityString(p), payslip: strip1(p), classification: { kind: cls.kind, confidence: cls.confidence, byContent: cls.byContent },
        hint: ctx.hint || null, confidence: p.confidence, state: p.status, checks: p.checks, pages: seg.pages, copies: seg.copies || 1, files: [ctx.fileName], processedAt: ctx.now || null, userConfirmed: false }
    };
  }
  function strip1(p) { // o que fica guardado: sem CPF completo nem texto bruto do documento
    var q = JSON.parse(JSON.stringify(p)); delete q.worker.cpfDigits; delete q.employer.cnpjDigits; q.worker.cpfHash = p.worker.cpfDigits ? hash53(p.worker.cpfDigits) : null; q.employer.cnpjHash = p.employer.cnpjDigits ? hash53(p.employer.cnpjDigits) : null; delete q.checks; return q;
  }
  function hash53(str, seed) { // não criptográfico: só para comparar identidades dentro da conta do próprio usuário
    var h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
    for (var i = 0; i < str.length; i++) { var ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  // Os dados guardados trocam CPF/CNPJ completos por hash; compare() precisa de campos equivalentes:
  function revive(stored) {
    if (!stored) return stored; var q = JSON.parse(JSON.stringify(stored));
    if (q.worker && q.worker.cpfHash && !q.worker.cpfDigits) q.worker.cpfDigits = 'h:' + q.worker.cpfHash;
    if (q.employer && q.employer.cnpjHash && !q.employer.cnpjDigits) q.employer.cnpjDigits = 'h:' + q.employer.cnpjHash;
    return q;
  }
  function liveCandidate(p) { var q = JSON.parse(JSON.stringify(p)); if (q.worker.cpfDigits) q.worker.cpfDigits = 'h:' + hash53(q.worker.cpfDigits); if (q.employer.cnpjDigits) q.employer.cnpjDigits = 'h:' + hash53(q.employer.cnpjDigits); return q; }
  function existingView(docs) {
    return (docs || []).filter(function (d) { return d && d.extractedData && d.extractedData.payslip; }).map(function (d) {
      return { id: d.id, contentHash: d.extractedData.contentHash, payslip: revive(d.extractedData.payslip) };
    }).concat((docs || []).filter(function (d) { return d && d.extractedData && !d.extractedData.payslip && d.extractedData.contentHash; }).map(function (d) { return { id: d.id, contentHash: d.extractedData.contentHash }; }));
  }

  // Processa UM arquivo já convertido em páginas/linhas e devolve resultados por entidade lógica.
  // ctx: { fileName, hint, contentHash, newId, now, dateLabel, fileSize, mimeType }
  function processDocument(pagesLines, existingDocs, ctx) {
    var text = pagesLines.map(allText).join('\n').trim();
    var result = { classification: null, outcomes: [] };
    if (text.replace(/\s/g, '').length < 25) {            // sem camada de texto (foto, escaneado, imagem)
      var k0 = classify('', ctx.fileName, ctx.hint);
      var kind0 = k0.kind !== 'outro' ? k0.kind : (ctx.hint && ctx.hint !== 'outro' ? ctx.hint : 'outro');
      result.classification = { kind: kind0, confidence: 0, byContent: false };
      var dup0 = decide(existingView(existingDocs), null, ctx.contentHash);
      if (dup0.action === 'duplicate') { result.outcomes.push({ action: 'duplicate', target: dup0.target, reason: dup0.reason }); return result; }
      result.outcomes.push({ action: 'new', unreadable: true, entity: { id: ctx.newId(), name: ctx.fileName, type: KIND_TYPE[kind0] || 'expense', category: kind0, amount: 0, date: ctx.dateLabel || '', status: 'revisar', fileSize: ctx.fileSize || 0, mimeType: ctx.mimeType || '',
        extractedData: { schema: SCHEMA, kind: kind0, contentHash: ctx.contentHash || null, classification: result.classification, hint: ctx.hint || null, confidence: 0, state: 'needs_review', unreadable: true, notes: ['Sem texto legível (digitalizado ou foto). Confirme os dados manualmente.'], files: [ctx.fileName], processedAt: ctx.now || null, userConfirmed: false } } });
      return result;
    }
    var cls = classify(text, ctx.fileName, ctx.hint); result.classification = cls;
    if (cls.kind !== 'holerite') {
      var dup = decide(existingView(existingDocs), null, ctx.contentHash);
      if (dup.action === 'duplicate') { result.outcomes.push({ action: 'duplicate', target: dup.target, reason: dup.reason }); return result; }
      var amt = extractAmount([].concat.apply([], pagesLines), cls.kind);
      result.outcomes.push({ action: 'new', entity: { id: ctx.newId(), name: ctx.fileName, type: KIND_TYPE[cls.kind] || 'expense', category: cls.kind, amount: amt, date: ctx.dateLabel || '', status: cls.byContent ? 'processado' : 'revisar', fileSize: ctx.fileSize || 0, mimeType: ctx.mimeType || '',
        extractedData: { schema: SCHEMA, kind: cls.kind, contentHash: ctx.contentHash || null, classification: { kind: cls.kind, confidence: cls.confidence, byContent: cls.byContent }, hint: ctx.hint || null, confidence: cls.confidence, state: cls.byContent ? 'done' : 'needs_review', files: [ctx.fileName], processedAt: ctx.now || null, userConfirmed: false } } });
      return result;
    }
    var segs = analyzePages(pagesLines);
    if (!segs.length) { // parece holerite, mas nada estruturado foi lido
      result.outcomes.push({ action: 'new', unreadable: true, entity: { id: ctx.newId(), name: ctx.fileName, type: 'income', category: 'holerite', amount: 0, date: ctx.dateLabel || '', status: 'revisar', fileSize: ctx.fileSize || 0, mimeType: ctx.mimeType || '',
        extractedData: { schema: SCHEMA, kind: 'holerite', contentHash: ctx.contentHash || null, classification: { kind: 'holerite', confidence: cls.confidence, byContent: true }, hint: ctx.hint || null, confidence: 0, state: 'needs_review', unreadable: true, notes: ['Documento reconhecido como holerite, mas os valores não puderam ser lidos.'], files: [ctx.fileName], processedAt: ctx.now || null, userConfirmed: false } } });
      return result;
    }
    var pool = (existingDocs || []).slice(), accepted = [];
    segs.forEach(function (seg) {
      var cand = liveCandidate(seg.payslip), view = existingView(pool);
      var d = decide(view, cand, ctx.contentHash);
      // idêntico a outro holerite deste mesmo arquivo já aceito? (mergeSegments já tratou; aqui cobre conflitos internos)
      var ent = docFromPayslip({ payslip: liveStore(seg.payslip), pages: seg.pages, copies: seg.copies }, ctx, cls);
      ent.extractedData.identity = hash53(identityString(seg.payslip));
      if (d.action === 'new') { result.outcomes.push({ action: 'new', entity: ent }); pool.push(ent); accepted.push(ent); }
      else result.outcomes.push({ action: d.action, target: d.target, reason: d.reason, entity: ent, copies: seg.copies || 1 });
    });
    return result;
  }
  function liveStore(p) { return p; }

  // Decisão do usuário diante de conflito/dúvida. Devolve o que a camada de dados deve fazer.
  function resolveOutcome(outcome, choice) {
    if (choice === 'ignore') return { op: 'none' };
    if (choice === 'replace') return { op: 'replace', id: outcome.target, entity: outcome.entity };
    if (choice === 'keep_both') { var e = JSON.parse(JSON.stringify(outcome.entity)); e.extractedData.payslip.tipo = 'complementar'; e.extractedData.userConfirmed = true; e.name = e.name.replace(/ · .*/, '') + ' · complementar'; return { op: 'add', entity: e }; }
    return { op: 'none' };
  }

  // ───────── 8. dados derivados para os cálculos (uma única fonte para todas as abas) ─────────
  var ELIGIBLE = function (d) { var x = d.extractedData; return x && x.payslip && (x.state === 'done' || x.userConfirmed) && x.payslip.tipo === 'mensal' && x.payslip.competencia; };
  function payslipsForCalc(docs) {
    var byComp = {};
    (docs || []).filter(ELIGIBLE).forEach(function (d) { byComp[d.extractedData.payslip.competencia] = d; }); // uma por competência
    return Object.keys(byComp).sort().map(function (k) { return byComp[k]; });
  }
  function sumCat(p, cat) { return r2(p.rows.filter(function (r) { return r.cat === cat; }).reduce(function (s, r) { return s + r.valor; }, 0)); }
  function calcInputs(docs) {
    var list = payslipsForCalc(docs).slice(-12); if (!list.length) return null;
    var last = list[list.length - 1].extractedData.payslip;
    var vars = list.map(function (d) { return sumCat(d.extractedData.payslip, 'variavel'); });
    return { count: list.length, competencias: list.map(function (d) { return d.extractedData.payslip.competencia; }), salary: sumCat(last, 'base'), variaveis: r2(vars.reduce(function (a, b) { return a + b; }, 0) / vars.length), consig: sumCat(last, 'consig'), liquidoUltimo: last.totals.liquido, ultimaCompetencia: last.competencia };
  }
  function pendingReview(docs) { return (docs || []).filter(function (d) { return d.extractedData && d.extractedData.state === 'needs_review' && !d.extractedData.userConfirmed && d.extractedData.payslip; }).length; }


  // ───────── 9. fila de processamento (um ponto de entrada; sequencial, com falha e nova tentativa) ─────────
  // deps: { getDocs(), extractPages(file), hashFile(file), newId(), now(), dateLabel(), commit({op,entity,id}), onUpdate(queue) }
  // Estados do item: aguardando → analisando → concluido | revisar | duplicado | erro
  function createIngestor(deps) {
    var queue = [], chain = Promise.resolve(), seq = 0;
    function notify() { if (deps.onUpdate) deps.onUpdate(queue.slice()); }
    function setS(it, st, msg) { it.status = st; it.msg = msg || ''; notify(); }
    function exec(it) {
      setS(it, 'analisando');
      return Promise.resolve().then(function () { return Promise.all([deps.extractPages(it.file), deps.hashFile(it.file)]); }).then(function (r) {
        var ctx = { fileName: it.name, hint: it.hint, contentHash: r[1], newId: deps.newId, now: deps.now ? deps.now() : null, dateLabel: deps.dateLabel ? deps.dateLabel() : '', fileSize: it.file && it.file.size, mimeType: it.file && it.file.type };
        var res = processDocument(r[0], deps.getDocs(), ctx);
        it.classification = res.classification; it.added = 0; it.dups = 0; it.pending = []; it.addedIds = [];
        res.outcomes.forEach(function (o) {
          if (o.action === 'new') { deps.commit({ op: 'add', entity: o.entity }); it.added++; it.addedIds.push(o.entity.id); if (o.entity.extractedData.state === 'needs_review') it.review = true; }
          else if (o.action === 'duplicate') { it.dups++; it.dupReason = o.reason; }
          else { it.pending.push(o); }
        });
        if (it.pending.length) return setS(it, 'revisar', 'Possível correção ou documento repetido: confirme o que fazer.');
        if (it.added === 0 && it.dups > 0) return setS(it, 'duplicado', 'Já estava registrado (' + it.dupReason + '). Nada foi somado de novo.');
        var extra = [];
        if (it.dups) extra.push(it.dups + ' cópia(s) repetida(s) ignorada(s)');
        res.outcomes.forEach(function (o) { if (o.action === 'new' && o.entity.extractedData.copies > 1) extra.push('as ' + o.entity.extractedData.copies + ' vias/páginas iguais contaram uma única vez'); });
        return setS(it, it.review ? 'revisar' : 'concluido', (extra.join('; ') || (it.review ? 'Confira os dados lidos.' : 'Documento lido e disponível em todas as áreas.')));
      }).catch(function (e) { setS(it, 'erro', (e && e.message) || 'Falha ao processar'); });
    }
    return {
      add: function (files, hint) {
        var items = Array.prototype.slice.call(files || []).map(function (f) { var it = { id: 'q' + (++seq), name: f.name, file: f, hint: hint || null, status: 'aguardando', msg: '' }; queue.push(it); return it; });
        notify();
        items.forEach(function (it) { chain = chain.then(function () { return exec(it); }); });
        return chain;
      },
      retry: function (id) { var it = queue.filter(function (x) { return x.id === id; })[0]; if (!it || it.status !== 'erro') return Promise.resolve(); chain = chain.then(function () { return exec(it); }); return chain; },
      resolve: function (id, idx, choice) {
        var it = queue.filter(function (x) { return x.id === id; })[0]; if (!it || !it.pending || !it.pending[idx]) return;
        var act = resolveOutcome(it.pending[idx], choice);
        if (act.op === 'add' || act.op === 'replace') { deps.commit(act); (it.addedIds = it.addedIds || []).push(act.op === 'add' ? act.entity.id : act.id); }
        it.pending.splice(idx, 1);
        if (!it.pending.length) setS(it, 'concluido', choice === 'ignore' ? 'Ignorado por você; nada foi alterado.' : 'Decisão aplicada.'); else notify();
      },
      queue: function () { return queue.slice(); },
      clearDone: function () { queue = queue.filter(function (x) { return x.status === 'aguardando' || x.status === 'analisando' || x.status === 'erro' || x.status === 'revisar'; }); notify(); }
    };
  }

  return {
    SCHEMA: SCHEMA, num: num, norm: norm, buildLines: buildLines, allText: allText, classify: classify,
    parsePayslip: parsePayslip, validatePayslip: validatePayslip, identityString: identityString, finSig: finSig,
    compare: compare, decide: decide, mergeSegments: mergeSegments, splitSegments: splitSegments, analyzePages: analyzePages,
    createIngestor: createIngestor, processDocument: processDocument, resolveOutcome: resolveOutcome, payslipsForCalc: payslipsForCalc, calcInputs: calcInputs, pendingReview: pendingReview, hash53: hash53, existingView: existingView
  };
});
