// ═══════════════════════════════════════════════════════
// Motor de cálculo CLT (servidor) — INSS/IRRF 2026, férias, 13º, rescisão e previsão de salário.
// Roda só no servidor: o navegador envia os dados e recebe o resultado. Atualizar TAX2026 a cada janeiro.
// © 360 Suítes — todos os direitos reservados.
// ═══════════════════════════════════════════════════════
'use strict';
let SIM = null, ANO = new Date().getFullYear();
const TAX2026 = {
  salarioMinimo: 1621.00,
  inssFaixas: [[1621.00, .075], [2902.84, .09], [4354.27, .12], [8475.55, .14]],   // [teto da faixa, alíquota]
  irrfFaixas: [[2428.80, 0, 0], [2826.65, .075, 182.16], [3751.05, .15, 394.16], [4664.68, .225, 675.49], [Infinity, .275, 908.73]],
  deducaoDependente: 189.59,
  descontoSimplificado: 607.20,
  redutorIsencao: 5000.00, redutorLimite: 7350.00, redutorA: 978.62, redutorB: 0.133145,
};
function inssCalc(base) {
  const teto = TAX2026.inssFaixas[TAX2026.inssFaixas.length - 1][0];
  const b = Math.max(0, Math.min(base, teto)); let prev = 0, tot = 0;
  TAX2026.inssFaixas.forEach(f => { if (b > prev) tot += (Math.min(b, f[0]) - prev) * f[1]; prev = f[0]; });
  return Math.round(tot * 100) / 100;
}
function irrfCalc(rendTrib, inss, dependentes, pensao) {
  const legal = inss + (dependentes || 0) * TAX2026.deducaoDependente + (pensao || 0);
  const ded = Math.max(legal, TAX2026.descontoSimplificado);
  const base = Math.max(0, rendTrib - ded);
  const f = TAX2026.irrfFaixas.find(x => base <= x[0]);
  const tabela = Math.max(0, base * f[1] - f[2]);
  let redutor = 0;
  if (rendTrib <= TAX2026.redutorIsencao) redutor = tabela;
  else if (rendTrib <= TAX2026.redutorLimite) redutor = Math.min(tabela, Math.max(0, TAX2026.redutorA - TAX2026.redutorB * rendTrib));
  const r2 = v => Math.round(v * 100) / 100;
  return { base: r2(base), tabela: r2(tabela), redutor: r2(redutor), valor: r2(Math.max(0, tabela - redutor)), usouSimplificado: ded === TAX2026.descontoSimplificado && legal < TAX2026.descontoSimplificado };
}
const simBRL = v => (v < 0 ? '- ' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const simR2 = v => Math.round(v * 100) / 100;
function simAvos(ini, fim) {
  if (!ini || !fim || fim < ini) return 0; let n = 0;
  for (let y = ini.getFullYear(), m = ini.getMonth(); y < fim.getFullYear() || (y === fim.getFullYear() && m <= fim.getMonth()); m++) {
    if (m > 11) { m = 0; y++; if (y > fim.getFullYear()) break; }
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const s = ini > first ? ini : first, e = fim < last ? fim : last;
    const days = Math.round((e - s) / 86400000) + 1; if (days >= 15) n++;
    if (y === fim.getFullYear() && m === fim.getMonth()) break;
  }
  return n;
}
const simDate = s => { if (!s) return null; const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d; };

// ── Cálculo: FÉRIAS ──
function simCalcFerias() {
  const f = SIM.ferias, remun = SIM.salary + SIM.variaveis, L = [];
  if (SIM.salary <= 0) return { erro: 'Informe o salário base (ou envie um holerite).' };
  const faltas = f.faltas || 0;
  const direito = faltas <= 5 ? 30 : faltas <= 14 ? 24 : faltas <= 23 ? 18 : faltas <= 32 ? 12 : 0;
  if (direito === 0) return { erro: 'Com mais de 32 faltas injustificadas no período aquisitivo não há direito a férias.' };
  const gozoOpt = f.opcao === '20+10' ? Math.min(direito, 20) : Math.min(direito, parseInt(f.opcao, 10));
  const abonoDias = f.opcao === '20+10' ? Math.min(10, Math.floor(direito / 3)) : 0;
  const dia = remun / 30;
  const ferias = simR2(dia * gozoOpt), terco = simR2(ferias / 3), abono = simR2(dia * abonoDias), tercoAbono = simR2(abono / 3);
  const trib = ferias + terco, inss = inssCalc(trib), ir = irrfCalc(trib, inss, SIM.dep, 0);
  const adiant = f.adiant13 ? simR2(remun / 2) : 0;
  const outros = f.outrosDesc || 0;
  L.push({ k: 'info', t: 'Remuneração de referência', v: simBRL(remun), n: 'Salário ' + simBRL(SIM.salary) + (SIM.variaveis ? ' + média de variáveis ' + simBRL(SIM.variaveis) : '') });
  L.push({ k: 'info', t: 'Dias de direito', v: direito + ' dias', n: faltas > 5 ? faltas + ' faltas injustificadas reduzem o direito (CLT art. 130)' : 'Até 5 faltas: 30 dias' });
  L.push({ k: '+', t: 'Férias (' + gozoOpt + ' dias)', v: simBRL(ferias), n: 'remuneração ÷ 30 × ' + gozoOpt });
  L.push({ k: '+', t: '1/3 constitucional', v: simBRL(terco) });
  if (abonoDias) { L.push({ k: '+', t: 'Abono pecuniário (' + abonoDias + ' dias)', v: simBRL(abono), n: 'Não sofre INSS nem IRRF' }); L.push({ k: '+', t: '1/3 do abono', v: simBRL(tercoAbono), n: 'Não sofre INSS nem IRRF' }); }
  L.push({ k: '-', t: 'INSS', v: simBRL(inss), n: 'Sobre férias + 1/3, tabela progressiva 2026' });
  L.push({ k: '-', t: 'IRRF', v: simBRL(ir.valor), n: 'Tabela ' + (ir.usouSimplificado ? 'com desconto simplificado' : 'com deduções legais') + (ir.redutor ? '; redutor Lei 15.270: ' + simBRL(ir.redutor) : '') });
  if (adiant) L.push({ k: '+', t: '1ª parcela do 13º (adiantamento)', v: simBRL(adiant), n: 'Sem desconto nesta parcela; INSS e IRRF vêm na 2ª parcela' });
  if (outros) L.push({ k: '-', t: 'Outros descontos informados', v: simBRL(outros), n: 'Consignado, adiantamentos etc. — depende de como sua empresa lança' });
  const liquido = simR2(ferias + terco + abono + tercoAbono + adiant - inss - ir.valor - outros);
  return { titulo: 'Férias', liquido, linhas: L, aviso: 'As férias costumam ser tributadas junto com o salário do mês, então INSS e IRRF reais podem ser um pouco maiores. O pagamento deve ocorrer até 2 dias antes do início das férias.' };
}

// ── Cálculo: RESCISÃO ──
function simCalcResc() {
  const r = SIM.resc, remun = SIM.salary + SIM.variaveis, L = [];
  const adm = simDate(r.admissao), sai = simDate(r.saida);
  if (SIM.salary <= 0) return { erro: 'Informe o salário base (ou envie um holerite).' };
  if (!adm || !sai || sai < adm) return { erro: 'Informe datas de admissão e saída válidas.' };
  const tipo = r.tipo, justa = tipo === 'justa_causa';
  const anos = Math.floor((sai - adm) / (365.25 * 86400000));
  const dia = remun / 30;
  const saldoDias = Math.min(30, sai.getDate());
  const saldo = simR2(dia * saldoDias);
  let avisoDias = 0, avisoVal = 0, avisoDesc = 0;
  if (tipo === 'sem_justa' || tipo === 'acordo') {
    if (r.aviso === 'indenizado') { avisoDias = Math.min(90, 30 + 3 * anos); avisoVal = simR2(dia * avisoDias * (tipo === 'acordo' ? 0.5 : 1)); }
  } else if (tipo === 'pedido' && r.aviso === 'nao_cumprido') { avisoDesc = simR2(remun); }
  const diasProj = tipo === 'acordo' ? Math.floor(avisoDias / 2) : avisoDias;
  const fimProj = new Date(sai.getTime() + diasProj * 86400000);
  // 13º
  let decimo = 0, avos13 = 0;
  if (!justa) {
    const iniAno = new Date(fimProj.getFullYear(), 0, 1); avos13 = simAvos(adm > iniAno ? adm : iniAno, fimProj);
    decimo = simR2(remun * avos13 / 12);
  }
  const decimoLiq = Math.max(0, decimo - (r.adiant13 || 0));
  // férias
  const venc = Math.max(0, parseInt(r.feriasVenc, 10) || 0);
  const feriasVenc = simR2(venc * remun * 4 / 3);
  let avosF = 0, feriasProp = 0;
  if (!justa) {
    let ult = new Date(adm); while (new Date(ult.getFullYear() + 1, ult.getMonth(), ult.getDate()) <= fimProj) ult = new Date(ult.getFullYear() + 1, ult.getMonth(), ult.getDate());
    // se já há período vencido não gozado, o proporcional parte do último aniversário
    avosF = simAvos(ult, fimProj); if (avosF > 12) avosF = 12;
    feriasProp = simR2(remun * avosF / 12 * 4 / 3);
  }
  // tributos
  const inssSaldo = inssCalc(saldo), irSaldo = irrfCalc(saldo, inssSaldo, SIM.dep, 0);
  const inss13 = inssCalc(decimoLiq + (r.adiant13 || 0)), ir13 = irrfCalc(decimo, inss13, SIM.dep, 0);
  const descEmp = Math.min(r.descEmpregador || 0, remun), capado = (r.descEmpregador || 0) > remun;
  L.push({ k: 'info', t: 'Remuneração de referência', v: simBRL(remun), n: 'Salário ' + simBRL(SIM.salary) + (SIM.variaveis ? ' + média de variáveis ' + simBRL(SIM.variaveis) : '') });
  L.push({ k: '+', t: 'Saldo de salário (' + saldoDias + ' dias)', v: simBRL(saldo) });
  if (avisoVal) L.push({ k: '+', t: 'Aviso prévio indenizado (' + (tipo === 'acordo' ? Math.floor(avisoDias / 2) + ' dias, 50% por acordo' : avisoDias + ' dias') + ')', v: simBRL(avisoVal), n: '30 dias + 3 por ano completo (máx. 90). Sem INSS/IRRF' });
  if (!justa) L.push({ k: '+', t: '13º proporcional (' + avos13 + '/12)', v: simBRL(decimo), n: (diasProj ? 'Inclui projeção do aviso. ' : '') + 'Mês conta com 15 dias ou mais' });
  if (venc) L.push({ k: '+', t: 'Férias vencidas + 1/3 (' + venc + ' período)', v: simBRL(feriasVenc), n: 'Indenizadas: sem INSS/IRRF' });
  if (!justa) L.push({ k: '+', t: 'Férias proporcionais + 1/3 (' + avosF + '/12)', v: simBRL(feriasProp), n: 'Indenizadas: sem INSS/IRRF' });
  if (r.adiant13) L.push({ k: '-', t: '13º já recebido (adiantamento)', v: simBRL(r.adiant13) });
  L.push({ k: '-', t: 'INSS sobre saldo de salário', v: simBRL(inssSaldo) });
  L.push({ k: '-', t: 'IRRF sobre saldo de salário', v: simBRL(irSaldo.valor), n: irSaldo.redutor ? 'Redutor Lei 15.270: ' + simBRL(irSaldo.redutor) : '' });
  if (decimoLiq || decimo) { L.push({ k: '-', t: 'INSS sobre 13º', v: simBRL(inss13) }); L.push({ k: '-', t: 'IRRF sobre 13º (tributação separada)', v: simBRL(ir13.valor), n: ir13.redutor ? 'Redutor Lei 15.270: ' + simBRL(ir13.redutor) + ' — confirme com o RH' : '' }); }
  if (avisoDesc) L.push({ k: '-', t: 'Aviso prévio não cumprido', v: simBRL(avisoDesc), n: 'Empresa pode descontar até 30 dias' });
  if (descEmp) L.push({ k: '-', t: 'Descontos do empregador (adiantamentos etc.)', v: simBRL(descEmp), n: capado ? 'Limitado a 1 remuneração (CLT art. 477 §5º)' : 'Compensação limitada a 1 remuneração (CLT art. 477 §5º)' });
  if (r.descConsig) L.push({ k: '-', t: 'Consignado descontado na rescisão', v: simBRL(r.descConsig), n: 'Valor informado por você — confira o contrato e o TRCT' });
  const liquido = simR2(saldo + avisoVal + decimoLiq + feriasVenc + feriasProp - inssSaldo - irSaldo.valor - (decimoLiq || decimo ? inss13 + ir13.valor : 0) - avisoDesc - descEmp - (r.descConsig || 0));
  // FGTS
  const baseFgts = saldo + decimo + avisoVal, depFgts = simR2(baseFgts * 0.08);
  let fgtsExtra = null;
  if (tipo === 'sem_justa' || tipo === 'acordo') {
    const total = (r.fgts || 0) + depFgts, multa = simR2(total * (tipo === 'acordo' ? 0.2 : 0.4));
    const saque = tipo === 'acordo' ? simR2(total * 0.8 + multa) : simR2(total + multa);
    fgtsExtra = { linhas: [
      { k: 'info', t: 'Depósito do FGTS rescisório (8%)', v: simBRL(depFgts), n: 'Sobre saldo de salário, 13º e aviso — pago pela empresa na conta do FGTS' },
      { k: '+', t: 'Multa rescisória (' + (tipo === 'acordo' ? '20%' : '40%') + ')', v: simBRL(multa), n: 'Sobre o saldo total do FGTS' },
      { k: '+', t: 'FGTS disponível para saque', v: simBRL(saque), n: tipo === 'acordo' ? 'No acordo, saca 80% do saldo + multa' : 'Saca 100% do saldo + multa' }] };
    if (!r.fgts) fgtsExtra.linhas.unshift({ k: 'info', t: 'Saldo do FGTS não informado', v: '—', n: 'Informe o saldo (app do FGTS) para calcular a multa' });
  }
  const av = [];
  if (tipo === 'acordo') av.push('No acordo, a projeção do aviso para 13º e férias foi estimada pela metade dos dias.');
  if (tipo === 'pedido' && r.aviso === 'nao_cumprido') av.push('Pedido de demissão sem cumprir o aviso gera desconto.');
  av.push('O valor oficial é o do TRCT emitido pela sua empresa; convenção coletiva e médias específicas podem alterar o resultado.');
  return { titulo: 'Rescisão', liquido, linhas: L, fgts: fgtsExtra, aviso: av.join(' ') };
}

// ── Cálculo: 13º SALÁRIO ──
function simCalcDecimo() {
  const d = SIM.dec, remun = SIM.salary + SIM.variaveis, ano = ANO, L = [];
  if (SIM.salary <= 0) return { erro: 'Informe o salário base (ou envie um holerite).' };
  const adm = simDate(d.adm);
  const admNoAno = adm && adm.getFullYear() === ano;
  const avosBase = admNoAno ? simAvos(adm, new Date(ano, 11, 31)) : 12;
  const avos = Math.max(0, Math.min(12, avosBase - (d.afast || 0)));
  if (avos === 0) return { erro: 'Sem meses com direito ao 13º neste ano.' };
  const total = simR2(remun * avos / 12);
  const p1 = simR2(total / 2), p1paga = d.paga > 0 ? d.paga : p1;
  const inss = inssCalc(total), ir = irrfCalc(total, inss, SIM.dep, 0);
  const desc = d.desc || 0;
  const p2 = simR2(total - p1paga - inss - ir.valor - desc);
  L.push({ k: 'info', t: 'Remuneração de referência', v: simBRL(remun), n: 'Salário ' + simBRL(SIM.salary) + (SIM.variaveis ? ' + média de variáveis ' + simBRL(SIM.variaveis) : '') });
  L.push({ k: 'info', t: 'Meses com direito (avos)', v: avos + '/12', n: (admNoAno ? 'Admissão em ' + d.adm.split('-').reverse().join('/') + ': conta o mês com 15 dias ou mais. ' : '') + (d.afast ? d.afast + ' mês(es) sem direito descontado(s).' : (admNoAno ? '' : 'Ano completo.')) });
  L.push({ k: '+', t: '13º bruto', v: simBRL(total), n: 'remuneração × ' + avos + '/12' });
  L.push({ k: '+', t: '1ª parcela (até 30/11)' + (d.paga > 0 ? ' — já recebida' : ''), v: simBRL(p1paga), n: 'Metade do 13º, sem descontos' });
  L.push({ k: '-', t: 'INSS sobre o 13º', v: simBRL(inss), n: 'Calculado à parte do salário, tabela 2026' });
  L.push({ k: '-', t: 'IRRF sobre o 13º', v: simBRL(ir.valor), n: 'Tributação exclusiva na fonte' + (ir.redutor ? '; redutor Lei 15.270: ' + simBRL(ir.redutor) + ' — confirme com o RH' : '') });
  if (desc) L.push({ k: '-', t: 'Outros descontos na 2ª parcela', v: simBRL(desc), n: 'Consignado, adiantamentos etc. — valor informado por você' });
  L.push({ k: 'info', t: '2ª parcela líquida (até 20/12)', v: simBRL(p2), n: 'Total − 1ª parcela − INSS − IRRF' + (desc ? ' − descontos' : '') });
  return { titulo: '13º salário', liquido: simR2(p1paga + p2), linhas: L, aviso: 'O valor mostrado é o total líquido (1ª + 2ª parcela). Na prática: a 1ª parcela é paga sem desconto e todo o INSS e IRRF saem da 2ª. Se a empresa calcular a 1ª parcela sobre o salário do mês anterior, o valor pode diferir um pouco.' };
}

const MARGEM_CONSIGNADO = 0.35, VT_PERC = 0.06;
function prevPmtRate(pv, pmt, n) {   // taxa mensal implícita de um financiamento (bisseção)
  if (!(pv > 0 && pmt > 0 && n > 0) || pmt * n <= pv) return 0;
  let lo = 1e-6, hi = 1.5;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2, v = pmt * (1 - Math.pow(1 + m, -n)) / m; if (v > pv) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function prevCalc() {
  const P = SIM.prev, salario = SIM.salary, bruto = SIM.salary + SIM.variaveis;
  if (salario <= 0) return { erro: 'Informe o salário base (ou envie um holerite).' };
  const inss = inssCalc(bruto), ir = irrfCalc(bruto, inss, SIM.dep, P.pensao || 0);
  const vt = P.vtOn ? simR2(Math.min(salario * VT_PERC, P.vtCusto > 0 ? P.vtCusto : salario * VT_PERC)) : 0;
  const consigAtual = P.consigAtual === null ? SIM.consig : P.consigAtual;
  const L = [{ k: '+', t: 'Salário bruto', v: simBRL(bruto), n: 'Salário ' + simBRL(salario) + (SIM.variaveis ? ' + variáveis ' + simBRL(SIM.variaveis) : '') },
    { k: '-', t: 'INSS', v: simBRL(inss), n: 'Tabela progressiva 2026' },
    { k: '-', t: 'IRRF', v: simBRL(ir.valor), n: (ir.usouSimplificado ? 'Desconto simplificado' : 'Deduções legais') + (ir.redutor ? '; redutor Lei 15.270: ' + simBRL(ir.redutor) : '') }];
  if (vt) L.push({ k: '-', t: 'Vale-transporte', v: simBRL(vt), n: 'Até 6% do salário básico, limitado ao custo do vale' });
  if (P.saude) L.push({ k: '-', t: 'Plano de saúde / odonto', v: simBRL(P.saude) });
  if (P.pensao) L.push({ k: '-', t: 'Pensão alimentícia', v: simBRL(P.pensao), n: 'Também reduz a base do IRRF' });
  if (consigAtual) L.push({ k: '-', t: 'Consignado já em folha', v: simBRL(consigAtual), n: 'Parcela do último holerite' });
  if (P.outros) L.push({ k: '-', t: 'Outros descontos', v: simBRL(P.outros) });
  const descontos = inss + ir.valor + vt + (P.saude || 0) + (P.pensao || 0) + consigAtual + (P.outros || 0);
  const liquidoAtual = simR2(bruto - descontos);
  const disponivel = Math.max(0, bruto - inss - ir.valor - (P.pensao || 0));
  const margem = simR2(disponivel * MARGEM_CONSIGNADO), livre = simR2(Math.max(0, margem - consigAtual));
  const N = P.novo, out = { liquidoAtual, linhas: L, margem, livre, disponivel, consigAtual };
  if (N.parcela > 0) {
    out.novo = { liquido: simR2(liquidoAtual - N.parcela), excede: N.parcela > livre, excesso: simR2(Math.max(0, N.parcela - livre)) };
    if (N.n > 0) {
      out.novo.total = simR2(N.parcela * N.n);
      if (N.liberado > 0) { out.novo.juros = simR2(out.novo.total - N.liberado); out.novo.taxaImpl = prevPmtRate(N.liberado, N.parcela, N.n); }
    }
  }
  const taxa = N.taxa > 0 ? N.taxa / 100 : (out.novo && out.novo.taxaImpl) || 0;
  if (taxa > 0 && N.n > 0 && livre > 0) out.capacidade = { taxa, valor: simR2(livre * (1 - Math.pow(1 + taxa, -N.n)) / taxa) };
  return out;
}

// ── Entrada validada: só campos conhecidos, números finitos e limitados ──
const num = (v, max = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, -max), max) : 0; };
const str = (v, re, len = 12) => { v = String(v == null ? '' : v).slice(0, len); return re.test(v) ? v : ''; };
const DATE = /^(\d{4}-\d{2}-\d{2})?$/;
function buildSim(b) {
  b = b || {}; const f = b.ferias || {}, d = b.dec || {}, r = b.resc || {}, p = b.prev || {}, n = p.novo || {};
  return {
    mode: ['ferias', 'dec', 'resc'].includes(b.mode) ? b.mode : 'ferias',
    salary: num(b.salary), variaveis: num(b.variaveis), consig: num(b.consig), dep: Math.round(num(b.dep, 20)),
    ferias: { faltas: Math.round(num(f.faltas, 400)), opcao: ['30', '20+10', '15'].includes(f.opcao) ? f.opcao : '30', adiant13: !!f.adiant13, outrosDesc: num(f.outrosDesc) },
    dec: { adm: str(d.adm, DATE, 10), afast: Math.round(num(d.afast, 12)), paga: num(d.paga), desc: num(d.desc) },
    resc: { admissao: str(r.admissao, DATE, 10), saida: str(r.saida, DATE, 10), tipo: ['sem_justa', 'pedido', 'acordo', 'justa'].includes(r.tipo) ? r.tipo : 'sem_justa', aviso: ['indenizado', 'trabalhado', 'dispensado'].includes(r.aviso) ? r.aviso : 'indenizado', feriasVenc: Math.round(num(r.feriasVenc, 2)), fgts: num(r.fgts), adiant13: num(r.adiant13), descEmpregador: num(r.descEmpregador), descConsig: num(r.descConsig) },
    prev: { vtOn: !!p.vtOn, vtCusto: num(p.vtCusto), saude: num(p.saude), pensao: num(p.pensao), outros: num(p.outros), consigAtual: p.consigAtual === null || p.consigAtual === undefined ? null : num(p.consigAtual), novo: { parcela: num(n.parcela), n: Math.round(num(n.n, 600)), liberado: num(n.liberado), taxa: num(n.taxa, 100) } },
    out: null, msg: '',
  };
}
function run(kind, body) {
  SIM = buildSim(body); ANO = Math.round(num(body && body.ano, 3000)) || new Date().getFullYear();
  if (kind === 'prev') return prevCalc();
  return SIM.mode === 'ferias' ? simCalcFerias() : SIM.mode === 'dec' ? simCalcDecimo() : simCalcResc();
}
module.exports = { run, inssCalc, irrfCalc };
