// Indicadores de mercado para a aba Investimentos, direto da fonte oficial (Banco Central do Brasil, séries SGS).
// Cada indicador devolve valor, data de referência e a URL da série, para o app mostrar a fonte.
const SERIES = {
  selic: { id: 432, nome: 'Meta da taxa Selic', unidade: '% a.a.', min: 0.5, max: 40 },
  cdi: { id: 4389, nome: 'CDI anualizado (base 252)', unidade: '% a.a.', min: 0.5, max: 40 },
  ipca12: { id: 13522, nome: 'IPCA acumulado em 12 meses', unidade: '%', min: -5, max: 60 },
  tr: { id: 226, nome: 'Taxa Referencial (TR)', unidade: '% no mês', min: 0, max: 3 },
};
const TTL = 6 * 3600 * 1000;
let cache = null;
const urlOf = (id) => 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + id + '/dados/ultimos/1?formato=json';
const isoOf = (br) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; };

async function getJson(fetchFn, url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetchFn(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
async function fetchAll(fetchFn) {
  const keys = Object.keys(SERIES), out = {};
  await Promise.all(keys.map(async (k) => {
    const s = SERIES[k];
    try {
      const j = await getJson(fetchFn, urlOf(s.id)), row = Array.isArray(j) && j[j.length - 1], v = row && parseFloat(String(row.valor).replace(',', '.'));
      if (row && isFinite(v) && v >= s.min && v <= s.max && isoOf(row.data)) out[k] = { valor: v, data: isoOf(row.data), nome: s.nome, unidade: s.unidade, fonte: 'Banco Central do Brasil (SGS ' + s.id + ')', url: urlOf(s.id) };
    } catch (e) { /* indicador indisponível: o app mostra a referência anterior, marcada como não atualizada */ }
  }));
  // Poupança (regra atual): Selic > 8,5% a.a. => 0,5% ao mês + TR; senão 70% da Selic + TR. Calculada a partir de Selic e TR oficiais.
  if (out.selic && out.tr) {
    const tr = out.tr.valor / 100, mensal = out.selic.valor > 8.5 ? (1.005 * (1 + tr) - 1) : (Math.pow(1 + out.selic.valor * 0.7 / 100, 1 / 12) * (1 + tr) - 1);
    out.poupanca = { valor: Math.round((Math.pow(1 + mensal, 12) - 1) * 10000) / 100, data: out.tr.data, nome: 'Poupança (estimativa anual)', unidade: '% a.a.', fonte: 'Cálculo pela regra da poupança com Selic e TR do Banco Central', url: out.tr.url };
  }
  return out;
}
async function getMercado(fetchFn = globalThis.fetch, now = Date.now()) {
  if (cache && now - cache.at < TTL) return { ...cache.data, fetchedAt: new Date(cache.at).toISOString(), cached: true };
  const data = await fetchAll(fetchFn);
  if (!Object.keys(data).length) { if (cache) return { ...cache.data, fetchedAt: new Date(cache.at).toISOString(), cached: true, stale: true }; throw new Error('sem dados'); }
  // Mantém o último valor bom de indicadores que falharam desta vez
  if (cache) Object.keys(cache.data.indicadores).forEach((k) => { if (!data[k]) data[k] = { ...cache.data.indicadores[k], stale: true }; });
  cache = { at: now, data: { indicadores: data } };
  return { indicadores: data, fetchedAt: new Date(now).toISOString(), cached: false };
}
function _reset() { cache = null; }
module.exports = { getMercado, SERIES, _reset };
