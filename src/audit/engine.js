'use strict';
// Motor da Auditoria Fiscal (estimativa) — uso INTERNO. Roda só no servidor.
// Entrada: dados de UMA empresa (perfil, lançamentos, documentos). Saída: relatório estruturado (sem HTML).
const MEI_ANNUAL_LIMIT = 81000, SM2026 = 1621;
const PJ_TYPES = {
  mei: { label: 'MEI', regime: 'MEI' }, simples: { label: 'ME / Simples Nacional', regime: 'Simples' }, epp: { label: 'EPP', regime: 'Simples' },
  presumido: { label: 'Lucro Presumido', regime: 'Lucro Presumido' }, real: { label: 'Lucro Real', regime: 'Lucro Presumido' },
  liberal: { label: 'Profissional liberal', regime: 'Simples' }, ong: { label: 'Associação / ONG', regime: 'Lucro Presumido' }, startup: { label: 'Startup', regime: 'Simples' },
};
const PJ_ACTIVITIES = { comercio: { label: 'Comércio', annex: 'I', dasExtra: 1 }, servicos: { label: 'Serviços', annex: 'III', dasExtra: 5 }, misto: { label: 'Misto', annex: 'III', dasExtra: 6 } };
const SIMPLES_TABLE = {
  I:   [[180000,.04,0],[360000,.073,5940],[720000,.095,13860],[1800000,.107,22500],[3600000,.143,87300],[4800000,.19,378000]],
  II:  [[180000,.045,0],[360000,.078,5940],[720000,.10,13860],[1800000,.112,22500],[3600000,.147,85500],[4800000,.30,720000]],
  III: [[180000,.06,0],[360000,.112,9360],[720000,.135,17640],[1800000,.16,35640],[3600000,.21,125640],[4800000,.33,648000]],
};
function simplesEstimate(rbt12, activity) {
  const annex = (PJ_ACTIVITIES[activity] || PJ_ACTIVITIES.servicos).annex, tbl = SIMPLES_TABLE[annex];
  if (!rbt12 || rbt12 <= 0) return { annex, faixa: 1, nominal: tbl[0][1], effective: tbl[0][1] };
  let i = tbl.findIndex(r => rbt12 <= r[0]); if (i < 0) i = tbl.length - 1;
  return { annex, faixa: i + 1, nominal: tbl[i][1], effective: Math.max(0, (rbt12 * tbl[i][1] - tbl[i][2]) / rbt12) };
}
function txDateObj(t) { if (!t || !t.date) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t.date)); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
const fmt = (v) => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (v) => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ═══════════════════════════════════════════════════════
// AUDITORIA FISCAL (PJ) — agente de auditoria por regras (estimativa)
// Roda no navegador sobre os lançamentos, documentos e cadastro do usuário.
// Não substitui contador: produz achados, exposição estimada e plano de ação.
// ═══════════════════════════════════════════════════════
var SIMPLES_V = [[180000,.155,0],[360000,.18,4500],[720000,.195,9900],[1800000,.205,17100],[3600000,.23,62100],[4800000,.305,540000]];
var AUD_STEPS = ['Lendo o cadastro e o CNPJ', 'Conferindo limites de faturamento', 'Simulando alíquota e Fator R', 'Cruzando receitas com notas fiscais', 'Verificando pagamento de impostos', 'Revisando pró-labore e distribuição de lucros', 'Procurando mistura PF/PJ e lançamentos duplicados', 'Comparando regimes tributários', 'Montando o relatório'];
var AUD_RE = {
  tax: /\b(das|darf|dae|simples nacional|irpj|csll|pis|cofins|iss|icms|imposto|tributo|guia)\b/i,
  prolabore: /pr[oó]-?\s?labore|prolabore/i,
  folha: /pr[oó]-?\s?labore|prolabore|sal[aá]rio|folha|funcion[aá]rio|colaborador|inss|fgts|13[ºo]|f[eé]rias/i,
  lucro: /distribui[cç][aã]o|lucros?\b|dividend/i,
  pessoal: /supermercado|restaurante|lazer|netflix|spotify|academia|farm[aá]cia|roupa|cinema|escola|faculdade|viagem|pessoal/i,
  nf: /\bnf\b|nf-?e|nfs-?e|nota fiscal|danfe/i
};
function audText(t) { return String(t.cat || '') + ' ' + String(t.desc || ''); }
function audSum(a) { return a.reduce(function(s, t) { return s + (+t.amount || 0); }, 0); }
function audEff(tbl, rbt) {
  if (!(rbt > 0)) return tbl[0][1];
  var i = tbl.findIndex(function(r) { return rbt <= r[0]; }); if (i < 0) i = tbl.length - 1;
  return Math.max(0, (rbt * tbl[i][1] - tbl[i][2]) / rbt);
}
function audPct(v) { return (v * 100).toFixed(1).replace('.', ',') + '%'; }
function audCollect(ctx) {
  var now = ctx.now, from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  var tx = ctx.transactions.filter(function(t) { var d = txDateObj(t); return d && d >= from; });
  var inc = tx.filter(function(t) { return t.type === 'income'; }), exp = tx.filter(function(t) { return t.type !== 'income'; });
  var mk = {}; inc.forEach(function(t) { var d = txDateObj(t); mk[d.getFullYear() + '-' + d.getMonth()] = 1; });
  var nm = Object.keys(mk).length, rev = audSum(inc);
  return { now: now, tx: tx, inc: inc, exp: exp, rev: rev, expTotal: audSum(exp), nm: nm, annual: nm >= 12 ? rev : (nm ? rev / nm * 12 : 0), projected: nm > 0 && nm < 12 };
}
// Comparativo de regimes (estimativa de imposto mensal; não inclui INSS patronal nem ICMS/IPI)
function audCompare(annual, act, ratioR) {
  if (!(annual > 0)) return null;
  var A = PJ_ACTIVITIES[act] || PJ_ACTIVITIES.servicos, R = annual / 12, rows = [];
  if (annual <= MEI_ANNUAL_LIMIT) rows.push({ id: 'MEI', label: 'MEI', monthly: 0.05 * SM2026 + A.dasExtra, note: 'DAS fixo. Vedado a algumas atividades e a empresas com sócio.' });
  if (annual <= 4800000) {
    var tbl = SIMPLES_TABLE[A.annex], note = 'Anexo ' + A.annex;
    if (act !== 'comercio' && ratioR != null && ratioR < 0.28) { tbl = SIMPLES_V; note = 'Anexo V (Fator R abaixo de 28%)'; }
    rows.push({ id: 'Simples', label: 'Simples Nacional', monthly: R * audEff(tbl, annual), note: note });
  }
  var k = act === 'comercio' ? { ir: .08, cs: .12, iss: 0 } : act === 'misto' ? { ir: .20, cs: .22, iss: .015 } : { ir: .32, cs: .32, iss: .03 };
  var bIR = R * k.ir, irpj = bIR * .15 + Math.max(0, bIR - 20000) * .10;
  rows.push({ id: 'Lucro Presumido', label: 'Lucro Presumido', monthly: irpj + R * k.cs * .09 + R * .0065 + R * .03 + R * k.iss, note: 'IRPJ, CSLL, PIS, Cofins e ISS (~3% em serviços). Sem INSS patronal nem ICMS/IPI.' });
  rows.forEach(function(r) { r.pct = r.monthly / R; });
  return rows;
}
function audBuild(ctx) {
  var D = audCollect(ctx), items = [], skipped = [], k = ctx.k, act = ctx.act || 'servicos', cd = ctx.cd, regime = ctx.regime;
  var yr = D.now.getFullYear(), T = k ? PJ_TYPES[k] : null;
  var isMei = k === 'mei', isOng = k === 'ong', isSimples = !!T && T.regime === 'Simples' && !isMei, isLP = !!T && T.regime === 'Lucro Presumido' && !isOng;
  var hasRev = D.inc.length > 0, base = D.annual, executed = 0;
  function add(o) { executed++; items.push(o); }
  function skip(txt) { skipped.push(txt); }
  var docs = ctx.documents || [];

  // Fator R (necessário antes do comparativo)
  var folha = audSum(D.exp.filter(function(t) { return AUD_RE.folha.test(audText(t)); }));
  var ratioR = D.rev > 0 ? folha / D.rev : null;
  var cmp = audCompare(base, act, (isSimples && act !== 'comercio') ? ratioR : null);
  var curRow = cmp && cmp.filter(function(r) { return r.id === regime; })[0];
  var eff = isMei ? 0.04 : (curRow ? curRow.pct : 0.06);

  // 1) Cadastro
  if (!k) add({ sev: 'warn', area: 'Cadastro', title: 'Tipo da empresa não definido', detail: 'Sem saber se é MEI, Simples, Presumido ou outro, as checagens por regime ficam limitadas.', why: 'Limites, alíquotas e obrigações mudam por regime.', fix: 'Defina o tipo, a atividade e como a empresa fatura.', rank: 2 });
  else add({ sev: 'ok', area: 'Cadastro', title: 'Perfil da empresa definido: ' + T.label, detail: 'Atividade: ' + ((PJ_ACTIVITIES[ctx.act] || {}).label || 'não informada') + '.' });
  if (!ctx.docNumber) add({ sev: 'warn', area: 'Cadastro', title: 'CNPJ não informado', detail: 'Sem o CNPJ não dá para conferir situação cadastral, enquadramento e atividade (CNAE).', why: 'A conferência com os dados públicos da Receita é a base de uma auditoria confiável.', fix: 'Informe o CNPJ no cadastro.', rank: 2 });
  else if (ctx.docType === 'cpf') add({ sev: 'info', area: 'Cadastro', title: 'Você informou CPF em vez de CNPJ', detail: 'Para a auditoria da empresa, informe o CNPJ.' });
  else if (!cd) { add({ sev: 'info', area: 'Cadastro', title: 'CNPJ informado, sem consulta à Receita', detail: 'A consulta automática não foi concluída (ou o CNPJ é alfanumérico). Os cruzamentos com situação, Simples/MEI e CNAE não foram feitos.' }); skip('Cruzamento com situação cadastral, opção pelo Simples/MEI e CNAE (consulta do CNPJ indisponível)'); }
  if (cd) {
    var sit = String(cd.situacao || '').toUpperCase();
    if (sit && sit !== 'ATIVA') add({ sev: 'crit', area: 'Cadastro', title: 'CNPJ com situação "' + sit + '"', detail: 'A consulta do cadastro mostra situação diferente de ATIVA.', why: 'Empresa inapta, suspensa ou baixada não pode emitir nota nem operar regularmente.', fix: 'Regularize a situação cadastral junto à Receita Federal antes de seguir faturando.', base: 'Cadastro CNPJ (Receita Federal)', rank: 0 });
    else if (sit) add({ sev: 'ok', area: 'Cadastro', title: 'Situação cadastral ATIVA', detail: 'Conforme a consulta feita no cadastro (pode ter mudado desde então).' });
    if (k === 'mei' && cd.mei === false) add({ sev: 'warn', area: 'Cadastro', title: 'Você marcou MEI, mas o CNPJ não consta como optante pelo MEI', detail: 'Pode ter havido desenquadramento ou o tipo foi escolhido errado.', fix: 'Confirme no Portal do Simples Nacional e ajuste o tipo da empresa.', rank: 1 });
    if ((k === 'simples' || k === 'epp') && cd.simples === false && cd.mei === false) add({ sev: 'crit', area: 'Cadastro', title: 'CNPJ não consta como optante pelo Simples Nacional', detail: 'Você marcou Simples, mas a Receita não mostra a opção.', why: 'Pagar DAS sem ser optante não quita os tributos do regime em que a empresa realmente está.', fix: 'Verifique a opção/exclusão no Portal do Simples Nacional com o contador.', base: 'LC 123/2006', rank: 0 });
    if ((k === 'presumido' || k === 'real') && cd.simples === true) add({ sev: 'warn', area: 'Cadastro', title: 'CNPJ consta como optante pelo Simples, mas o perfil está em Presumido/Real', detail: 'Perfil e cadastro apontam regimes diferentes.', fix: 'Ajuste o perfil ou confirme o regime com o contador.', rank: 1 });
    if (cd.cnae) {
      var div = parseInt(String(cd.cnae).slice(0, 2), 10), derived = (div >= 45 && div <= 47) ? 'comercio' : (div >= 10 && div <= 33) ? 'industria' : 'servicos';
      if (derived === 'industria') add({ sev: 'info', area: 'Cadastro', title: 'CNAE de atividade industrial', detail: 'Esta auditoria cobre a visão simplificada: IPI, ICMS-ST e regimes especiais ficam fora do escopo — fale com o contador.' });
      else if (act !== 'misto' && derived !== act) add({ sev: 'warn', area: 'Cadastro', title: 'Atividade cadastrada difere do CNAE principal', detail: 'O CNAE ' + String(cd.cnae) + ' sugere ' + (derived === 'comercio' ? 'comércio' : 'serviços') + ', mas o perfil está como ' + ((PJ_ACTIVITIES[act] || {}).label || act).toLowerCase() + '.', why: 'A atividade define o anexo do Simples e as bases do Presumido.', fix: 'Corrija a atividade no perfil.', rank: 2 });
    }
  }

  // 2) Limites
  if (!hasRev) { skip('Limites de faturamento, Fator R, notas fiscais e impostos (não há receitas lançadas nos últimos 12 meses)'); }
  else if (k) {
    if (isMei) {
      var lim = MEI_ANNUAL_LIMIT, prop = false;
      if (cd && cd.abertura && parseInt(String(cd.abertura).slice(0, 4), 10) === yr) { var mo = parseInt(String(cd.abertura).slice(5, 7), 10); if (mo) { lim = 6750 * (13 - mo); prop = true; } }
      var ytd = audSum(D.inc.filter(function(t) { return txDateObj(t).getFullYear() === yr; })), p = ytd / lim, exc = Math.max(0, ytd - lim), est = simplesEstimate(ytd, act);
      var limTxt = 'Faturado no ano ' + fmt(ytd) + ' de ' + fmt(lim) + (prop ? ' (limite proporcional ao ano de abertura)' : '') + '.';
      if (p > 1.2) add({ sev: 'crit', area: 'Limites', title: 'MEI com faturamento mais de 20% acima do limite', detail: limTxt + ' Excesso de ' + fmt(exc) + ' (' + audPct(exc / lim) + ').', why: 'Acima de 20% do limite o desenquadramento tem efeitos retroativos e os tributos passam a ser apurados como empresa do Simples.', fix: 'Procure o contador agora para comunicar o desenquadramento e migrar para ME no Simples.', base: 'LC 123/2006, art. 18-A (limite do MEI) e 18-E', exposure: ytd * est.effective, expLabel: 'ordem de grandeza: tributos como ME sobre o faturado no ano', rank: 0 });
      else if (p > 1) add({ sev: 'crit', area: 'Limites', title: 'MEI acima do limite anual (até 20%)', detail: limTxt + ' Excesso de ' + fmt(exc) + '.', why: 'O excesso até 20% gera DAS complementar e o desenquadramento vale a partir do ano seguinte.', fix: 'Recolha a diferença do DAS sobre o excesso no prazo e planeje a migração para ME.', base: 'LC 123/2006, art. 18-A', exposure: exc * est.nominal, expLabel: 'alíquota nominal do Simples sobre o excesso', rank: 0 });
      else if (p >= 0.8) add({ sev: 'warn', area: 'Limites', title: 'MEI perto do limite anual (' + Math.round(p * 100) + '%)', detail: limTxt + ' Faltam ' + fmt(lim - ytd) + '.', why: 'Passar do limite muda a tributação e pode exigir migração de regime.', fix: 'Projete o faturamento até dezembro e, se for passar, planeje a migração para ME antes.', base: 'LC 123/2006, art. 18-A', rank: 2 });
      else add({ sev: 'ok', area: 'Limites', title: 'MEI dentro do limite anual (' + Math.round(p * 100) + '%)', detail: limTxt });
    } else if (isSimples || k === 'epp') {
      var e2 = simplesEstimate(base, act), tbl = SIMPLES_TABLE[e2.annex], proj = D.projected ? ' (projeção anualizada de ' + D.nm + ' meses com receita)' : '';
      if (base > 4800000) add({ sev: 'crit', area: 'Limites', title: 'Receita acima do teto do Simples Nacional', detail: 'Receita de ' + fmt(base) + proj + ' contra teto de R$ 4,8 milhões.', why: 'Passar do teto leva à exclusão do Simples e à tributação pelo Presumido ou Real.', fix: 'Planeje com o contador a saída do Simples e a escolha do novo regime.', base: 'LC 123/2006, art. 3º', rank: 0 });
      else {
        if (base > 3600000) add({ sev: 'warn', area: 'Limites', title: 'Receita acima do sublimite estadual (R$ 3,6 milhões)', detail: 'Acima do sublimite, ICMS e ISS passam a ser recolhidos fora do DAS conforme o estado/município.', fix: 'Confirme com o contador como fica ICMS/ISS no seu estado.', base: 'LC 123/2006, art. 19', rank: 1 });
        else if (base >= 4800000 * 0.85) add({ sev: 'warn', area: 'Limites', title: 'Receita perto do teto do Simples (' + Math.round(base / 48000) + '%)', detail: 'Receita de ' + fmt(base) + proj + '.', fix: 'Acompanhe mês a mês e prepare a transição.', base: 'LC 123/2006, art. 3º', rank: 2 });
        else if (k === 'simples' && base > 360000) add({ sev: 'warn', area: 'Limites', title: 'Receita passou do limite de ME (R$ 360 mil)', detail: 'Receita de ' + fmt(base) + proj + '. A empresa passa a EPP — continua no Simples.', fix: 'Atualize o enquadramento no perfil e confirme o porte com o contador.', base: 'LC 123/2006, art. 3º', rank: 2 });
        else add({ sev: 'ok', area: 'Limites', title: 'Receita dentro dos tetos do Simples', detail: 'Receita de ' + fmt(base) + proj + '.' });
        if (e2.faixa < 6) {
          var lim2 = tbl[e2.faixa - 1][0];
          if (base >= lim2 * 0.92) { var next = audEff(tbl, lim2 + 1); add({ sev: 'warn', area: 'Limites', title: 'Perto da próxima faixa do Anexo ' + e2.annex, detail: 'A ' + fmt(lim2 - base) + ' da faixa ' + (e2.faixa + 1) + ': alíquota efetiva sobe de ' + audPct(e2.effective) + ' para ~' + audPct(next) + '.', why: 'A alíquota é calculada pela receita dos últimos 12 meses.', fix: 'Antecipe o impacto no preço e no caixa; avalie se vale concentrar faturamento em outro período.', base: 'LC 123/2006, art. 18', rank: 3 }); }
        }
      }
    } else if (isLP) add({ sev: 'ok', area: 'Limites', title: 'Sem teto de receita relevante para o Presumido/Real nesta faixa', detail: 'O limite do Lucro Presumido é de R$ 78 milhões por ano.' });
  } else skip('Limites por regime (tipo da empresa não definido)');

  // 3) Fator R
  if (hasRev && isSimples && act !== 'comercio' && D.rev > 0) {
    var effV = audEff(SIMPLES_V, base), effIII = audEff(SIMPLES_TABLE.III, base);
    if (ratioR < 0.28) add({ sev: 'warn', area: 'Alíquota', title: 'Fator R estimado em ' + audPct(ratioR) + ' (mínimo 28%)', detail: 'Folha, pró-labore e encargos somam ' + fmt(folha) + ' para ' + fmt(D.rev) + ' de receita. Se a sua atividade estiver sujeita ao Fator R, pode cair no Anexo V (alíquota efetiva ~' + audPct(effV) + ' contra ~' + audPct(effIII) + ' no Anexo III).', why: 'Serviços sujeitos ao Fator R pagam pelo Anexo III quando folha/receita (12 meses) é de pelo menos 28%; abaixo disso, pagam pelo Anexo V, mais caro.', fix: 'Compare elevar o pró-labore (com INSS) contra pagar o Anexo V. Só vale para atividades sujeitas ao Fator R — o contador confirma pelo seu CNAE.', base: 'LC 123/2006, art. 18, §5º-J e seguintes', exposure: Math.max(0, base * (effV - effIII)), expLabel: 'diferença anual estimada entre Anexo V e III', rank: 1 });
    else add({ sev: 'ok', area: 'Alíquota', title: 'Fator R estimado em ' + audPct(ratioR) + ' (acima de 28%)', detail: 'Folha e pró-labore somam ' + fmt(folha) + ' no período — mantém a tributação pelo Anexo III, se a atividade for sujeita ao Fator R.' });
  } else if (isSimples && act !== 'comercio') skip('Fator R (sem receitas lançadas)');

  // 4) Pró-labore
  if (k && !isMei && !isOng && hasRev) {
    var m3 = [], dd; for (var i = 1; i <= 3; i++) { dd = new Date(D.now.getFullYear(), D.now.getMonth() - i, 1); m3.push(dd.getFullYear() + '-' + dd.getMonth()); }
    var plb = D.exp.filter(function(t) { var d = txDateObj(t); return d && m3.indexOf(d.getFullYear() + '-' + d.getMonth()) !== -1 && AUD_RE.prolabore.test(audText(t)); });
    if (!plb.length) add({ sev: 'warn', area: 'Sócios', title: 'Nenhum pró-labore lançado nos últimos 3 meses', detail: 'Não achei lançamentos de pró-labore.', why: 'Sócio que administra a empresa deve ter pró-labore com INSS; retirar dinheiro sem classificar pode ser enquadrado como remuneração disfarçada.', fix: 'Defina o pró-labore e lance todo mês (e a guia do INSS correspondente). Se já paga, lance com a palavra "pró-labore".', base: 'Lei 8.212/1991 (INSS do contribuinte individual)', rank: 2 });
    else add({ sev: 'ok', area: 'Sócios', title: 'Pró-labore lançado', detail: plb.length + ' lançamento(s) nos últimos 3 meses.' });
  }

  // 5) Pagamento de impostos (3 meses fechados)
  if (k && !isOng && hasRev) {
    var miss = [], mn = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'], checked = 0;
    for (var j = 1; j <= 3; j++) {
      var ref = new Date(D.now.getFullYear(), D.now.getMonth() - j, 1), key = ref.getFullYear() + '-' + ref.getMonth();
      var inM = D.inc.filter(function(t) { var d = txDateObj(t); return d.getFullYear() + '-' + d.getMonth() === key; });
      if (!inM.length) continue; checked++;
      var hasTax = D.exp.some(function(t) { var d = txDateObj(t); return d.getFullYear() + '-' + d.getMonth() === key && AUD_RE.tax.test(audText(t)); });
      if (!hasTax) miss.push(mn[ref.getMonth()]);
    }
    if (checked) {
      if (miss.length) add({ sev: 'warn', area: 'Impostos', title: 'Sem pagamento de imposto registrado em ' + miss.join(', '), detail: 'Houve faturamento nesses meses, mas não achei lançamento de DAS, DARF, ISS ou similar.', why: 'Pode ser só falta de lançamento — ou imposto não pago, com multa e juros.', fix: 'Lance as guias pagas (categoria de impostos). Se não pagou, regularize e emita a guia atualizada.', base: 'Lei 9.430/1996, art. 61 (multa de mora)', exposure: curRow ? curRow.monthly * miss.length : null, expLabel: 'imposto mensal estimado × meses sem registro', rank: 1 });
      else add({ sev: 'ok', area: 'Impostos', title: 'Impostos registrados nos últimos meses fechados', detail: 'Encontrei lançamentos de imposto em todos os meses com faturamento.' });
    } else skip('Pagamento de impostos (sem receitas nos 3 últimos meses fechados)');
  }

  // 6) Receitas × notas fiscais
  if (k && hasRev) {
    var nfs = docs.filter(function(d) { return d.category === 'nf' || d.type === 'nf' || AUD_RE.nf.test(String(d.name || '')); }).length;
    var ratio = Math.min(1, nfs / D.inc.length);
    var nfDet = D.inc.length + ' recebimento(s) lançado(s) e ' + nfs + ' nota(s) fiscal(is) anexada(s) em Documentos.';
    if (ratio < 0.7) add({ sev: isMei ? 'info' : 'warn', area: 'Receitas', title: nfs === 0 ? 'Nenhuma nota fiscal anexada' : 'Menos notas do que recebimentos', detail: nfDet, why: isMei ? 'O MEI só é obrigado a emitir nota para empresas (PJ); para pessoa física é opcional. Mesmo assim, guardar comprovantes protege a empresa.' : 'Receita sem nota correspondente é o primeiro ponto que o Fisco cruza com extratos e declarações.', fix: 'Anexe as notas na aba Documentos e emita nota de todo serviço/venda tributável.', base: 'LC 123/2006, art. 26', exposure: isMei ? null : D.rev * (1 - ratio) * eff, expLabel: 'potencial, não entra no total: receita sem nota × alíquota estimada', noSum: true, rank: 1 });
    else add({ sev: 'ok', area: 'Receitas', title: 'Notas fiscais compatíveis com os recebimentos', detail: nfDet });
  }

  // 7) Despesas altas sem comprovante
  var high = D.exp.filter(function(t) { return (+t.amount || 0) >= 500; });
  if (k && high.length) {
    var unm = high.filter(function(t) { return !docs.some(function(d) { return (+d.amount || 0) > 0 && Math.abs(d.amount - t.amount) <= 0.01; }); });
    if (unm.length / high.length > 0.5) add({ sev: 'warn', area: 'Despesas', title: unm.length + ' de ' + high.length + ' despesas acima de R$ 500 sem comprovante correspondente', detail: 'Soma das despesas sem documento: ' + fmt(audSum(unm)) + '. Comparação por valor com os documentos anexados.', why: 'Despesa sem comprovante pode ser glosada em fiscalização e em prestação de contas.', fix: 'Anexe notas e recibos na aba Documentos, com o valor preenchido.', base: 'RIR/2018 (comprovação de custos e despesas)', rank: 3 });
    else add({ sev: 'ok', area: 'Despesas', title: 'Despesas relevantes com comprovante', detail: (high.length - unm.length) + ' de ' + high.length + ' despesas acima de R$ 500 têm documento com o mesmo valor.' });
  }

  // 8) Mistura PF/PJ
  if (k && D.exp.length) {
    var pes = D.exp.filter(function(t) { return AUD_RE.pessoal.test(audText(t)); }), sh = D.expTotal > 0 ? audSum(pes) / D.expTotal : 0;
    if (pes.length && (sh >= 0.1 || pes.length >= 3)) add({ sev: 'warn', area: 'Despesas', title: 'Possíveis gastos pessoais na empresa', detail: pes.length + ' lançamento(s) parecem pessoais (' + audPct(sh) + ' dos custos), como: ' + pes.slice(0, 3).map(function(t) { return String(t.desc || t.cat); }).join(', ') + '.', why: 'Misturar contas pessoais e da empresa dificulta a prova de despesa necessária e pode levar à desconsideração da personalidade jurídica.', fix: 'Revise e reclassifique; gastos pessoais devem sair como pró-labore ou distribuição de lucros.', base: 'Código Civil, art. 50 (confusão patrimonial)', rank: 2 });
    else add({ sev: 'ok', area: 'Despesas', title: 'Sem sinais claros de mistura PF/PJ', detail: 'A checagem é por palavras nos lançamentos; não substitui revisão manual.' });
  }

  // 9) Distribuição de lucros
  if (k && !isOng && D.exp.length) {
    var dist = audSum(D.exp.filter(function(t) { return AUD_RE.lucro.test(audText(t)); }));
    if (dist > 0) {
      var resultado = D.rev - (D.expTotal - dist);
      if (dist > Math.max(0, resultado)) add({ sev: 'crit', area: 'Sócios', title: 'Distribuição de lucros maior que o resultado apurado', detail: 'Distribuído ' + fmt(dist) + ' contra resultado de ' + (resultado < 0 ? '- ' : '') + fmt(resultado) + ' nos últimos 12 meses (receitas menos custos lançados).', why: 'Lucro distribuído acima do lucro contábil/presumido pode ser tributado ou reclassificado como pró-labore.', fix: 'Confira a apuração com o contador e, se preciso, reclassifique parte como pró-labore.', base: 'Lei 9.249/1995, art. 10', rank: 0 });
      else add({ sev: 'ok', area: 'Sócios', title: 'Distribuição de lucros compatível com o resultado', detail: 'Distribuído ' + fmt(dist) + ' de um resultado de ' + fmt(resultado) + '.' });
      if (dist >= 600000) add({ sev: 'info', area: 'Sócios', title: 'Atenção às novas regras de tributação de dividendos', detail: 'Pela Lei 15.270/2025, a partir de 2026, distribuições acima de R$ 50 mil por mês de uma mesma empresa para um mesmo sócio podem sofrer retenção na fonte. Confirme com o contador.', base: 'Lei 15.270/2025' });
    }
  }

  // 10) Duplicados e organização
  if (D.tx.length) {
    var seen = {}, dup = 0;
    D.tx.forEach(function(t) { var kk = [t.type, t.date, (+t.amount || 0).toFixed(2), String(t.desc || '').toLowerCase()].join('|'); if (seen[kk]) dup++; else seen[kk] = 1; });
    if (dup) add({ sev: 'warn', area: 'Dados', title: dup + ' lançamento(s) possivelmente duplicado(s)', detail: 'Mesma data, tipo, valor e descrição.', why: 'Duplicidades inflam receita ou custo e distorcem imposto e limites.', fix: 'Revise e exclua o que for repetido.', rank: 3 });
    else add({ sev: 'ok', area: 'Dados', title: 'Sem duplicidades evidentes', detail: 'Nenhum lançamento repetido (mesma data, valor e descrição).' });
    var outros = D.exp.filter(function(t) { return /outro/i.test(String(t.cat || '')); });
    if (D.exp.length >= 5 && D.expTotal > 0 && audSum(outros) / D.expTotal >= 0.25) add({ sev: 'warn', area: 'Dados', title: 'Muitos custos na categoria "Outros" (' + audPct(audSum(outros) / D.expTotal) + ')', detail: 'Categorias genéricas atrapalham a análise e a comprovação.', fix: 'Reclassifique em categorias específicas.', rank: 4 });
    if (hasRev && D.exp.length >= 3) { var mg = (D.rev - D.expTotal) / D.rev; if (mg > 0.7) add({ sev: 'info', area: 'Dados', title: 'Margem muito alta (' + audPct(mg) + ')', detail: 'Pode indicar custos ainda não lançados — isso distorce Fator R, pró-labore e resultado.' }); else if (mg < 0) add({ sev: 'info', area: 'Dados', title: 'Custos maiores que receitas nos últimos 12 meses', detail: 'Resultado negativo de ' + fmt(D.rev - D.expTotal) + ' no período.' }); }
  } else skip('Duplicidades e organização dos dados (sem lançamentos nos últimos 12 meses)');

  // 11) Reforma
  if (k) add({ sev: 'info', area: 'Reforma', title: '2026 é o ano de teste da CBS/IBS', detail: 'Em 2026 as notas passam a destacar CBS (0,9%) e IBS (0,1%) em fase de teste, com compensação. Convém conferir com o seu emissor de notas e o contador.', base: 'EC 132/2023 e LC 214/2025' });

  // ordenação, nota e exposição
  var order = { crit: 0, warn: 1, info: 2, ok: 3 };
  items.sort(function(a, b) { return order[a.sev] - order[b.sev] || (a.rank == null ? 9 : a.rank) - (b.rank == null ? 9 : b.rank); });
  var nc = items.filter(function(x) { return x.sev === 'crit'; }).length, nw = items.filter(function(x) { return x.sev === 'warn'; }).length, no = items.filter(function(x) { return x.sev === 'ok'; }).length;
  var score = Math.max(0, Math.min(100, 100 - nc * 18 - nw * 6));
  var level = nc ? 'Risco alto' : nw >= 3 ? 'Atenção' : nw ? 'Atenção leve' : 'Saudável';
  var exposure = items.reduce(function(s, x) { return s + (x.exposure > 0 && !x.noSum ? x.exposure : 0); }, 0);
  var plan = items.filter(function(x) { return x.sev === 'crit' || x.sev === 'warn'; }).slice(0, 6).map(function(x, i) { return { n: i + 1, title: x.title, fix: x.fix || '', prazo: x.sev === 'crit' ? 'Imediato' : 'Neste mês' }; });
  return { when: D.now.toISOString(), regimeAtual: regime, k: k, annual: D.annual, projected: D.projected, nDocs: docs.length, client: ctx.client, items: items, skipped: skipped, cmp: cmp, score: score, level: level, nc: nc, nw: nw, no: no, exposure: exposure, plan: plan, executed: executed, nTx: D.tx.length };
}
function audCalendar(k) {
  if (!k || k === 'ong') return [];
  var out = [], n = new Date();
  function nextDay(d) { var x = new Date(n.getFullYear(), n.getMonth(), d); if (x < new Date(n.getFullYear(), n.getMonth(), n.getDate())) x = new Date(n.getFullYear(), n.getMonth() + 1, d); return x; }
  var f = function(x) { return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0'); };
  if (k === 'mei') { out.push(['DAS-MEI mensal', 'dia 20 · próximo ' + f(nextDay(20))]); out.push(['Declaração anual (DASN-SIMEI)', 'até 31/05']); }
  else if (PJ_TYPES[k].regime === 'Simples') { out.push(['DAS (Simples Nacional)', 'dia 20 · próximo ' + f(nextDay(20))]); out.push(['PGDAS-D (declaração mensal)', 'até o vencimento do DAS']); out.push(['DEFIS (declaração anual)', 'até 31/03']); }
  else { out.push(['DCTFWeb', 'dia 15 · próximo ' + f(nextDay(15))]); out.push(['PIS/Cofins', 'dia 25 · próximo ' + f(nextDay(25))]); out.push(['IRPJ/CSLL', 'apuração trimestral']); out.push(['ECF / ECD', 'prazos anuais — confirme com o contador']); }
  return out;
}

// Prepara o contexto a partir das linhas do banco (perfil, transações, documentos)
function buildContext(profile, txRows, docRows, now) {
  profile = profile || {};
  now = now || new Date();
  const k = PJ_TYPES[profile.company_type] ? profile.company_type : null;
  const act = profile.pj_activity === 'industria' ? 'misto' : (PJ_ACTIVITIES[profile.pj_activity] ? profile.pj_activity : null);
  const transactions = (txRows || []).filter(t => !t.profile || t.profile === 'PJ' || t.profile === 'ambos').map(t => ({ type: t.type, date: t.date, desc: t.description || '', cat: t.category || '', amount: parseFloat(t.amount) || 0 }));
  const documents = (docRows || []).map(d => ({ name: d.name, type: d.type, category: d.category, amount: parseFloat(d.amount) || 0 }));
  const cd = profile.cnpj_data && typeof profile.cnpj_data === 'object' ? profile.cnpj_data : null;
  return { now, k, act, regime: k ? PJ_TYPES[k].regime : null, cd, docType: profile.document_type || null, docNumber: profile.document_number || null, transactions, documents,
    client: { tipo: k ? PJ_TYPES[k].label : null, atividade: act ? PJ_ACTIVITIES[act].label : null, razao: cd && cd.razao_social || null, plano: profile.plan || 'free' } };
}
function audit(profile, txRows, docRows, now) { const ctx = buildContext(profile, txRows, docRows, now); const r = audBuild(ctx); r.calendar = audCalendar(r.k); return r; }
module.exports = { audit, buildContext, audBuild, audCalendar, audCompare, simplesEstimate };
