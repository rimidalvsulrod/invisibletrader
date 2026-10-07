// Conservative Polymarket International -> Polymarket US matcher. It never
// selects a close second: a candidate must pass hard semantic guards and beat
// the runner-up by a meaningful score margin.
const P = require('./polymarket-us');
const STOP = new Set('will the a an of in on at to be by for and or is are with from vs than this that win wins won who what which when have has get gets record during finish as'.split(' '));
const RISKY = new Set('first second third fourth last round place runner runoff ticket vice nominee nomination primary lose loses lost margin seats share majority finals semifinal quarterfinal mvp leader approve approval announce announces officially resign fired out'.split(' '));
const DIR = new Set('above below over under more less fewer higher lower before after not least most exceed exceeds lose loses lost'.split(' '));
const MONTH = { january: 'jan', february: 'feb', march: 'mar', april: 'apr', june: 'jun', july: 'jul', august: 'aug', september: 'sep', sept: 'sep', october: 'oct', november: 'nov', december: 'dec' };
const SYN = { democrats: 'democrat', democratic: 'democrat', republicans: 'republican', leave: 'out', leaves: 'out', leaving: 'out', usa: 'us', 'u.s': 'us' };
const DAY = 864e5, CACHE = { t: 0, rows: [], loading: null };
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2').replace(/[a-z]+/g, w => MONTH[w] || SYN[w] || w);
const tokens = s => norm(s).replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(w => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
const directions = a => [...new Set(a.filter(x => DIR.has(x)))].sort().join(',');
const date = x => { const n = Date.parse(x); return Number.isFinite(n) ? n : NaN; };
async function index() {
  if (CACHE.rows.length && Date.now() - CACHE.t < 10 * 60e3) return CACHE.rows;
  if (!CACHE.loading) CACHE.loading = P.allOpenMarkets().then(rows => { CACHE.rows = rows.filter(m => m.active && !m.closed && m.slug); CACHE.t = Date.now(); return CACHE.rows; }).finally(() => { CACHE.loading = null; });
  return CACHE.loading;
}
async function sourceMarket(source) {
  const id = source.conditionId || source.condition_id;
  if (!id) return source;
  const u = `https://gamma-api.polymarket.com/markets?condition_ids=${encodeURIComponent(id)}`;
  const r = await fetch(u).then(x => x.ok ? x.json() : []).catch(() => []);
  const m = r?.[0]; return m ? { ...source, endDate: m.endDate || source.endDate, gameStartTime: m.gameStartTime || source.gameStartTime } : source;
}
function score(source, target, threshold) {
  const a = [...new Set(tokens(source.title))], b = [...new Set(tokens(`${target.question || ''} ${target.title || ''} ${target.subtitle || ''}`))];
  if (a.length < 3) return { reason: 'source question is too short to match safely' };
  const bs = new Set(b), common = a.filter(w => bs.has(w)), nums = a.filter(w => /\d/.test(w));
  if (!nums.every(w => bs.has(w))) return { reason: 'a number or date differs' };
  if (directions(a) !== directions(b)) return { reason: 'direction wording differs (above/below/before/not)' };
  const extraA = a.filter(w => !bs.has(w)), as = new Set(a), extraB = b.filter(w => !as.has(w));
  if (extraA.some(w => RISKY.has(w)) || extraB.some(w => RISKY.has(w))) return { reason: 'material wording differs' };
  if (extraA.length > 2 || extraB.length > 2) return { reason: 'too much wording differs' };
  const overlap = common.length / a.length;
  if (overlap < threshold) return { reason: `only ${Math.round(overlap * 100)}% of key words match` };
  const srcEnd = date(source.endDate), dstEnd = date(target.endDate);
  if (!isNaN(srcEnd) && !isNaN(dstEnd)) { const window = srcEnd - Date.now() > 30 * DAY ? 120 : 3; if (Math.abs(srcEnd - dstEnd) > window * DAY) return { reason: 'resolution dates differ' }; }
  // Reward exact dates/numbers and short title agreement, not just loose keyword overlap.
  return { score: overlap * 100 + (nums.length ? 5 : 0) - extraA.length * 4 - extraB.length * 4 };
}
async function resolve(source, threshold = .78) {
  source = await sourceMarket(source);
  const rows = await index(); const candidates = [];
  for (const m of rows) { const r = score(source, m, threshold); if (r.score != null) candidates.push({ m, score: r.score }); }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return { reason: 'no open Polymarket US market matched safely' };
  if (candidates.length > 1 && candidates[0].score - candidates[1].score < 7) return { reason: `ambiguous: ${candidates.length} US markets match similarly` };
  const hit = candidates[0], ask = Number(hit.m.bestAskQuote?.value ?? hit.m.marketSides?.find(x => x.long)?.price);
  if (!Number.isFinite(ask) || ask <= 0 || ask >= 1) return { reason: 'matched US market has no executable ask' };
  const outcome = String(source.outcome || '').toLowerCase();
  if (outcome !== 'yes' && outcome !== 'no') return { reason: 'only Yes/No source outcomes are copied' };
  return { m: hit.m, side: outcome, ask, score: Math.round(hit.score), candidates: candidates.length };
}
module.exports = { resolve, index, tokens, score };
