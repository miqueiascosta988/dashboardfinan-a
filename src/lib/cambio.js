// Cotações de câmbio de todas as moedas: busca uma vez e guarda em memória (atualização diária no provedor).
// Fonte principal: ExchangeRate-API (open.er-api.com), ~160 moedas, atualiza 1x ao dia. Reserva: BCE via Frankfurter (~30 moedas, dias úteis).
const PRIMARY = 'https://open.er-api.com/v6/latest/USD';
const FALLBACK = 'https://api.frankfurter.dev/v1/latest?base=USD';
const TTL = 6 * 3600 * 1000;
let cache = null;

function norm(rates) {
  const out = {};
  Object.keys(rates || {}).forEach((k) => { const v = Number(rates[k]); if (/^[A-Z]{3}$/.test(k) && v > 0 && isFinite(v)) out[k] = v; });
  return out;
}
async function getJson(fetchFn, url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetchFn(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
async function fetchRates(fetchFn) {
  try {
    const j = await getJson(fetchFn, PRIMARY);
    const rates = norm(j.rates);
    if (j.result === 'success' && rates.BRL && Object.keys(rates).length > 50) {
      rates.USD = 1;
      return { base: 'USD', rates, date: new Date((j.time_last_update_unix || 0) * 1000).toISOString().slice(0, 10), nextUpdate: j.time_next_update_unix ? new Date(j.time_next_update_unix * 1000).toISOString() : null,
        source: { name: 'ExchangeRate-API', url: 'https://www.exchangerate-api.com', note: 'Taxas de mercado, atualizadas uma vez por dia.' } };
    }
    throw new Error('resposta inesperada');
  } catch (e) {
    const j = await getJson(fetchFn, FALLBACK), rates = norm(j.rates);
    if (!rates.BRL) throw new Error('sem BRL');
    rates.USD = 1;
    return { base: 'USD', rates, date: j.date, nextUpdate: null,
      source: { name: 'Banco Central Europeu (via Frankfurter)', url: 'https://frankfurter.dev', note: 'Taxas de referência do BCE, dias úteis (cerca de 30 moedas).' } };
  }
}
async function getCambio(fetchFn = globalThis.fetch, now = Date.now()) {
  if (cache && now - cache.at < TTL) return { ...cache.data, fetchedAt: new Date(cache.at).toISOString(), cached: true };
  try {
    const data = await fetchRates(fetchFn); cache = { at: now, data };
    return { ...data, fetchedAt: new Date(now).toISOString(), cached: false };
  } catch (e) {
    if (cache) return { ...cache.data, fetchedAt: new Date(cache.at).toISOString(), cached: true, stale: true };
    throw e;
  }
}
function _reset() { cache = null; }
module.exports = { getCambio, fetchRates, _reset };
