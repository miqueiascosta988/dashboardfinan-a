// CRM / funil / tráfego pago: contas puras (sem rede, sem banco). Tudo sai dos eventos, leads e anúncios informados.
const ETAPAS = ['triagem_visita', 'triagem_fim', 'apresentacao_visita', 'checkout_clique', 'compra'];
const r2 = (v) => Math.round(v * 100) / 100;
const div = (a, b) => (b > 0 ? r2(a / b) : null);
// Chave de junção entre a campanha do anúncio e a do link (utm_campaign): minúscula, sem acento, sem espaços extras.
const key = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() || '(sem campanha)';

function painel(events, ads, leads) {
  const by = {};
  const get = (label) => { const k = key(label); return by[k] || (by[k] = { campanha: label || '(sem campanha)', invest: 0, impressoes: 0, cliques: 0, visitors: {}, compras: 0, receita: 0 }); };
  (ads || []).forEach((a) => { const c = get(a.campanha); c.invest += +a.investimento || 0; c.impressoes += +a.impressoes || 0; c.cliques += +a.cliques || 0; });
  const seen = {};
  (events || []).forEach((e) => {
    const c = get(e.campanha); const id = e.visitor + '|' + e.etapa;
    if (seen[key(e.campanha) + id]) return; seen[key(e.campanha) + id] = 1;
    (c.visitors[e.etapa] = c.visitors[e.etapa] || 0); c.visitors[e.etapa]++;
  });
  (leads || []).filter((l) => l.etapa === 'cliente' || l.etapa === 'trial').forEach((l) => { if (!l.campanha) return; const c = get(l.campanha); if (l.etapa === 'cliente') { c.compras++; c.receita += +l.valor || 0; } });
  const rows = Object.values(by).map((c) => {
    const v = (e) => c.visitors[e] || 0;
    return { campanha: c.campanha, invest: r2(c.invest), impressoes: c.impressoes, cliques: c.cliques,
      triagem_visita: v('triagem_visita'), triagem_fim: v('triagem_fim'), apresentacao_visita: v('apresentacao_visita'), checkout_clique: v('checkout_clique'),
      compras: c.compras, receita: r2(c.receita),
      ctr: div(c.cliques * 100, c.impressoes), cpc: div(c.invest, c.cliques), custoVisita: div(c.invest, v('triagem_visita')), custoCheckout: div(c.invest, v('checkout_clique')), cpa: div(c.invest, c.compras), roas: div(c.receita, c.invest) };
  }).sort((a, b) => b.invest - a.invest || b.triagem_visita - a.triagem_visita);
  const sum = (f) => rows.reduce((t, r) => t + (r[f] || 0), 0);
  const tot = { invest: r2(sum('invest')), impressoes: sum('impressoes'), cliques: sum('cliques'), triagem_visita: sum('triagem_visita'), triagem_fim: sum('triagem_fim'), apresentacao_visita: sum('apresentacao_visita'), checkout_clique: sum('checkout_clique'), compras: sum('compras'), receita: r2(sum('receita')) };
  tot.ctr = div(tot.cliques * 100, tot.impressoes); tot.cpc = div(tot.invest, tot.cliques); tot.cpa = div(tot.invest, tot.compras); tot.roas = div(tot.receita, tot.invest);
  const funil = ETAPAS.slice(0, 4).map((e) => ({ etapa: e, n: tot[e] }));
  funil.push({ etapa: 'compra', n: tot.compras });
  funil.forEach((f, i) => { f.deAnterior = i ? div(f.n * 100, funil[i - 1].n) : null; f.doTopo = div(f.n * 100, funil[0].n); });
  return { rows, total: tot, funil };
}

// Números: aceita "1.234,56" (pt-BR), "1234.56" e "R$ 12,30".
function num(v) {
  let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isFinite(n) ? n : 0;
}
function isoDay(v) {
  const s = String(v || '').trim(); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return null;
}
function splitLine(line, d) { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); }
// Relatório exportado do Gerenciador de Anúncios (CSV em português ou inglês).
function parseCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], erro: 'Arquivo vazio ou sem linhas de dados.' };
  const d = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = splitLine(lines[0], d).map((h) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  const find = (...rx) => { for (const r of rx) { const i = head.findIndex((h) => r.test(h)); if (i >= 0) return i; } return -1; };
  const ic = find(/nome da campanha/, /campaign name/, /^campanha/), idia = find(/^dia$/, /^day$/, /^data/, /in[i]cio d/, /reporting starts/), iv = find(/valor usado/, /amount spent/, /investimento/, /gasto/, /spend/),
    ii = find(/impress/), ik = find(/cliques no link/, /link clicks/, /^cliques/, /clicks/);
  if (ic < 0 || iv < 0 || idia < 0) return { rows: [], erro: 'Não encontrei as colunas "Nome da campanha", "Dia" e "Valor usado". No Gerenciador, detalhe o relatório por Dia.' };
  const rows = [];
  for (const l of lines.slice(1)) { const c = splitLine(l, d), dia = isoDay(c[idia]); if (!dia || !c[ic]) continue; rows.push({ dia, campanha: c[ic], investimento: r2(num(c[iv])), impressoes: Math.round(num(c[ii])), cliques: Math.round(num(c[ik])) }); }
  return { rows, erro: rows.length ? null : 'Nenhuma linha válida (confira a coluna Dia).' };
}
// Resposta da Marketing API da Meta (insights por campanha e por dia).
function metaParse(json) {
  return ((json && json.data) || []).filter((x) => x && x.campaign_name && x.date_start).map((x) => ({ dia: x.date_start, campanha: x.campaign_name, investimento: r2(+x.spend || 0), impressoes: Math.round(+x.impressions || 0), cliques: Math.round(+(x.inline_link_clicks != null ? x.inline_link_clicks : x.clicks) || 0) }));
}
const cleanStr = (v, n = 60) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) || null;
module.exports = { ETAPAS, painel, parseCsv, metaParse, num, isoDay, key, cleanStr };
