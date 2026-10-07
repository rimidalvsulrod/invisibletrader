// Polymarket (international) trade -> the same bet on Polymarket US. Never guesses: ambiguous = skip.
//  Sports: US slugs are the international slug with a type prefix, so these map exactly:
//    game winner  nhl-col-wpg-2026-10-07          -> aec-nhl-col-wpg-2026-10-07     (first team = YES)
//    total        ...-2026-10-07-total-6pt5        -> tsc-...-2026-10-07-6pt5        (Over = YES)
//    team / draw  ...-2026-10-07-vit | -draw       -> atc-...-2026-10-07-vit | -draw (Yes/No)
//    map/game N   ...-2026-10-07-game4             -> astatc-...-2026-10-07-game4    ("Will <team> win game 4")
//    The trader's outcome must also name the same team as the US side, or the trade is skipped.
//  Everything else: strict word matching against the US question + description (see score()).
const P = require('./polymarket-us');
const STOP = new Set('will the a an of in on at to be by for and or is are with from vs than this that win wins won who what which when have has get gets record during finish as scheduled upcoming event'.split(' '));
const RISKY = new Set('first second third fourth last round place runner runoff ticket vice nominee nomination primary lose loses lost margin seats share majority finals semifinal quarterfinal mvp leader approve approval announce announces officially resign fired out'.split(' '));
const DIR = new Set('above below over under more less fewer higher lower before after not least most exceed exceeds lose loses lost'.split(' '));
const MONTH = { january: 'jan', february: 'feb', march: 'mar', april: 'apr', june: 'jun', july: 'jul', august: 'aug', september: 'sep', sept: 'sep', october: 'oct', november: 'nov', december: 'dec' };
const SYN = { democrats: 'democrat', democratic: 'democrat', democratics: 'democrat', republicans: 'republican', leave: 'out', leaves: 'out', leaving: 'out', usa: 'us' };
const MN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY = 864e5, CACHE = { t: 0, rows: [], bySlug: new Map(), loading: null };
// deadlines -> one token for the last day included: "before Nov 1, 2026" == "by Oct 31, 2026" == "d20261031"
function deadline(_, w, mon, day, yr) {
  const d = new Date(Date.UTC(+yr, MN.indexOf(mon), +day)), last = new Date(Date.UTC(+yr, MN.indexOf(mon) + 1, 0)).getUTCDate();
  if (w === 'before' && +day !== last) d.setUTCDate(d.getUTCDate() - 1);
  return ` d${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')} `;
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/(\d),(\d{3})/g, '$1$2').replace(/(?<!\d)\.|\.(?!\d)/g, '').replace(/[a-z]+/g, w => MONTH[w] || SYN[w] || w)
  .replace(/\b(before|by)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g, deadline)
  .replace(/\bbefore\s+(\d{4})\b/g, (_, y) => ` d${+y - 1}1231 `);
const tokens = s => norm(s).replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(w => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
const directions = a => [...new Set(a.filter(x => DIR.has(x)))].sort().join(',');
const date = x => { const n = Date.parse(x); return Number.isFinite(n) ? n : NaN; };
const firstSentence = s => String(s || '').split(/(?<=[?.])\s/)[0].slice(0, 240);

async function index() {
  if (CACHE.rows.length && Date.now() - CACHE.t < 10 * 60e3) return CACHE;
  if (!CACHE.loading) CACHE.loading = P.allOpenMarkets().then(rows => {
    rows = rows.filter(m => m.active && !m.closed && m.slug);
    CACHE.rows = rows; CACHE.bySlug = new Map(rows.map(m => [m.slug, m])); CACHE.t = Date.now(); return CACHE;
  }).finally(() => { CACHE.loading = null; });
  return CACHE.loading;
}
async function sourceMarket(source) {
  const id = source.conditionId || source.condition_id;
  if (!id || (source.endDate && source.gameStartTime)) return source;
  const m = await fetch(`https://gamma-api.polymarket.com/markets?condition_ids=${encodeURIComponent(id)}`).then(x => x.ok ? x.json() : []).then(r => r?.[0]).catch(() => null);
  return m ? { ...source, endDate: m.endDate || source.endDate, gameStartTime: m.gameStartTime || source.gameStartTime } : source;
}

/* ---------- sports: exact slug mapping ---------- */
const GAME = /^([a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2})(?:-(.+))?$/;
const names = side => [side?.description, side?.team?.name, side?.team?.alias, side?.team?.safeName].filter(Boolean).map(norm);
const sameTeam = (outcome, side) => { const o = norm(outcome); return names(side).some(n => n === o || (n.length > 3 && (o.includes(n) || n.includes(o)))); };
async function sportsMatch(source, get = P.marketBySlug) {
  const g = GAME.exec(String(source.slug || '')); if (!g) return null; // not a sports-style slug
  const [, game, suffix = ''] = g, out = String(source.outcome || ''), o = out.toLowerCase();
  const pick = (m, side, why) => m ? { m, side, how: why } : { reason: 'game market not listed on Polymarket US' };
  if (!suffix) { // game winner: the trader's team must be one of the two sides
    const m = await get(`aec-${game}`); if (!m) return { reason: 'game not listed on Polymarket US' };
    const sides = m.marketSides || [], hit = sides.filter(s => sameTeam(out, s));
    if (hit.length !== 1) return { reason: `couldn't confirm "${out}" is one of ${sides.map(s => s.description).join(' / ')}` };
    return pick(m, hit[0].long ? 'yes' : 'no', 'same game (exact market ID)');
  }
  let t = /^total-(\d+pt\d+)$/.exec(suffix);
  if (t) { if (o !== 'over' && o !== 'under') return { reason: 'total market without Over/Under outcome' }; return pick(await get(`tsc-${game}-${t[1]}`), o === 'over' ? 'yes' : 'no', 'same total line (exact market ID)'); }
  if (/^game\d+$/.test(suffix)) { // "Will <first team> win game N"
    const m = await get(`astatc-${game}-${suffix}`); if (!m) return { reason: 'game-N market not listed on Polymarket US' };
    const q = norm(m.question), on = norm(out); if (on.length < 2) return { reason: 'unclear team' };
    const named = q.replace(/^will\s+/, '').split(/\s+win\s+/)[0];
    return pick(m, named.includes(on) || on.includes(named) ? 'yes' : 'no', 'same game-N winner (exact market ID)');
  }
  if (/^[a-z0-9]+$/.test(suffix) && (o === 'yes' || o === 'no')) return pick(await get(`atc-${game}-${suffix}`), o, 'same team/draw result (exact market ID)');
  return { reason: `${suffix.replace(/-/g, ' ')} markets aren't mapped to Polymarket US yet` };
}

/* ---------- everything else: strict word matching ---------- */
function score(source, target, threshold) {
  const a = [...new Set(tokens(source.title))], b = [...new Set(tokens(`${target.question || ''} ${target.title || ''} ${firstSentence(target.description)}`))];
  if (a.length < 3) return { reason: 'source question is too short to match safely' };
  const bs = new Set(b), common = a.filter(w => bs.has(w)), nums = a.filter(w => /\d/.test(w));
  if (!nums.every(w => bs.has(w))) return { reason: 'a number or date differs' };
  if (directions(a) !== directions(b)) return { reason: 'direction wording differs (above/below/before/not)' };
  const extraA = a.filter(w => !bs.has(w)), as = new Set(a), extraB = b.filter(w => !as.has(w));
  if (extraA.some(w => RISKY.has(w)) || extraB.some(w => RISKY.has(w))) return { reason: 'material wording differs' };
  if (extraA.length > 2) return { reason: 'too much wording differs' };
  // a name in the trader's question that the US market doesn't mention is a different subject ("Kyren" vs "Jameson" Williams)
  const caps = new Set(String(source.title).split(/\s+/).slice(1).filter(w => /^[A-Z][a-z]/.test(w)).map(w => tokens(w)[0]).filter(Boolean));
  if (extraA.some(w => caps.has(w))) return { reason: 'a name in the question is missing from the US market' };
  const overlap = common.length / a.length;
  if (overlap < threshold) return { reason: `only ${Math.round(overlap * 100)}% of key words match` };
  const srcEnd = date(source.endDate), dstEnd = date(target.endDate);
  if (!isNaN(srcEnd) && !isNaN(dstEnd)) { const window = srcEnd - Date.now() > 30 * DAY ? 120 : 3; if (Math.abs(srcEnd - dstEnd) > window * DAY) return { reason: 'resolution dates differ' }; }
  return { score: overlap * 100 + (nums.length ? 5 : 0) - extraA.length * 6 - Math.min(extraB.length, 10) };
}
// -> { m: US market, side: 'yes'|'no', how } or { reason }
async function resolve(source, threshold = .78) {
  const s = await sportsMatch(source); if (s) return s;
  const { rows } = await index();
  const o = String(source.outcome || '').toLowerCase();
  if (o !== 'yes' && o !== 'no') return { reason: 'not a Yes/No question or a mapped game market' };
  source = await sourceMarket(source); const c = [];
  for (const m of rows) { if ((m.marketSides || []).some(x => !/^(yes|no)$/i.test(x.description || ''))) continue; const r = score(source, m, threshold); if (r.score != null) c.push({ m, score: r.score }); }
  c.sort((x, y) => y.score - x.score);
  if (!c.length) return { reason: 'no open Polymarket US market matched safely' };
  if (c.length > 1 && c[0].score - c[1].score < 7) return { reason: `ambiguous: ${c.length} US markets match similarly` };
  return { m: c[0].m, side: o, how: `wording match ${Math.round(c[0].score)}/100` };
}
module.exports = { resolve, index, tokens, score, sportsMatch };
