// Polymarket (international) trade -> the same bet on Polymarket US. Never guesses: ambiguous = skip.
//  Sports: US slugs are the international slug with a type prefix, so these map exactly:
//    game winner  nhl-col-wpg-2026-10-07          -> aec-nhl-col-wpg-2026-10-07     (first team = YES)
//    total        ...-2026-10-07-total-6pt5        -> tsc-...-2026-10-07-6pt5        (Over = YES)
//    team / draw  ...-2026-10-07-vit | -draw       -> atc-...-2026-10-07-vit | -draw (Yes/No)
//    map/game N   ...-2026-10-07-game4             -> astatc-...-2026-10-07-game4    ("Will <team> win game 4")
//    The trader's outcome must also name the same team as the US side, or the trade is skipped.
//  Everything else: strict word matching against the US question + description (see score()).
const P = require('./polymarket-us'), SIM = require('./similar');
const STOP = new Set('will the a an of in on at to be by for and or is are with from vs than this that win wins won who what which when have has get gets record during finish as scheduled upcoming event'.split(' '));
const RISKY = new Set('first second third fourth last round place runner runoff ticket vice nominee nomination primary lose loses lost margin seats share majority finals semifinal quarterfinal mvp leader approve approval announce announces officially resign fired out'.split(' '));
const DIR = new Set('above below over under more less fewer higher lower before after not least most exceed exceeds lose loses lost'.split(' '));
const MONTH = { january: 'jan', february: 'feb', march: 'mar', april: 'apr', june: 'jun', july: 'jul', august: 'aug', september: 'sep', sept: 'sep', october: 'oct', november: 'nov', december: 'dec' };
const SYN = { championship: 'winner', democrats: 'democrat', democratic: 'democrat', democratics: 'democrat', republicans: 'republican', leave: 'out', leaves: 'out', leaving: 'out', usa: 'us' };
const MN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY = 864e5, CACHE = { t: 0, rows: [], bySlug: new Map(), loading: null };
// deadlines -> one token for the last day included: "before Nov 1, 2026" == "by Oct 31, 2026" == "d20261031"
function deadline(_, w, mon, day, yr) {
  const d = new Date(Date.UTC(+yr, MN.indexOf(mon), +day)), last = new Date(Date.UTC(+yr, MN.indexOf(mon) + 1, 0)).getUTCDate();
  if (w === 'before' && +day !== last) d.setUTCDate(d.getUTCDate() - 1);
  return ` d${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')} `;
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(20\d\d)[-/](\d\d)\b/g, '$1-20$2') // seasons: "2026-27" == "2026-2027"
  .replace(/(\d),(\d{3})/g, '$1$2').replace(/(?<!\d)\.|\.(?!\d)/g, '').replace(/[a-z]+/g, w => MONTH[w] || SYN[w] || w)
  .replace(/\b(before|by)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g, deadline)
  .replace(/\bbefore\s+(\d{4})\b/g, (_, y) => ` d${+y - 1}1231 `);
const tokens = s => norm(s).replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(w => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
const directions = a => [...new Set(a.filter(x => DIR.has(x)))].sort().join(',');
const date = x => { const n = Date.parse(x); return Number.isFinite(n) ? n : NaN; };
const firstSentence = s => String(s || '').split(/(?<=[?.])\s/)[0].slice(0, 240);

// the US catalog (non-sports + sports futures) refreshes every 60s in the background; once loaded, lookups never wait for it
const REFRESH = 60e3;
async function index() {
  const fresh = Date.now() - CACHE.t < REFRESH;
  if (!fresh && !CACHE.loading) CACHE.loading = P.allOpenMarkets().then(rows => {
    rows = rows.filter(m => m.active && !m.closed && m.slug);
    CACHE.rows = rows; CACHE.bySlug = new Map(rows.map(m => [m.slug, m])); CACHE.t = Date.now(); return CACHE;
  }).catch(e => { if (!CACHE.rows.length) throw e; return CACHE; }).finally(() => { CACHE.loading = null; });
  return CACHE.rows.length ? CACHE : CACHE.loading;
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
  const pick = (m, side, why) => m ? { m, side, how: why } : { reason: 'this market is not open on Polymarket US (not listed there, or already over)' };
  if (!suffix) { // game winner: the trader's team must be one of the two sides
    const m = await get(`aec-${game}`); if (!m) return { reason: 'game is not open on Polymarket US (not listed there, or already over)' };
    const sides = m.marketSides || [], hit = sides.filter(s => sameTeam(out, s));
    if (hit.length !== 1) return { reason: `couldn't confirm "${out}" is one of ${sides.map(s => s.description).join(' / ')}` };
    return pick(m, hit[0].long ? 'yes' : 'no', 'same game (exact market ID)');
  }
  let t = /^total-(\d+pt\d+)$/.exec(suffix);
  if (t) { if (o !== 'over' && o !== 'under') return { reason: 'total market without Over/Under outcome' }; // baseball/hockey "tsc-<game>-6pt5", football "tsc-<game>-total-44pt5"
    return pick(await get(`tsc-${game}-${t[1]}`) || await get(`tsc-${game}-total-${t[1]}`), o === 'over' ? 'yes' : 'no', 'same total line (exact market ID)'); }
  if (/^game\d+$/.test(suffix)) { // "Will <first team> win game N"
    const m = await get(`astatc-${game}-${suffix}`); if (!m) return { reason: 'game-N market not listed on Polymarket US' };
    const q = norm(m.question), on = norm(out); if (on.length < 2) return { reason: 'unclear team' };
    const named = q.replace(/^will\s+/, '').split(/\s+win\s+/)[0];
    return pick(m, named.includes(on) || on.includes(named) ? 'yes' : 'no', 'same game-N winner (exact market ID)');
  }
  if (/^[a-z0-9]+$/.test(suffix) && (o === 'yes' || o === 'no')) return pick(await get(`atc-${game}-${suffix}`), o, 'same team/draw result (exact market ID)');
  const H = { 'first-half': '1h', 'second-half': '2h' };
  // spreads: "Spread: Brewers (-2.5)" -> asc-<game>[-1h|-2h]-neg|pos-2pt5; US sides carry the team names, long side = Yes
  t = /^(?:(first-half|second-half)-)?spread-(?:home|away)-(\d+pt\d+)$/.exec(suffix);
  if (t) {
    const h = t[1] ? `-${H[t[1]]}` : '', line = Number(t[2].replace('pt', '.')), fav = /\(-[\d.]+\)/.test(source.title || '') ? String(source.title).replace(/^.*?:\s*/, '').replace(/\s*\(-[\d.]+\).*$/, '') : '';
    for (const sign of ['neg', 'pos']) {
      const m = await get(`asc-${game}${h}-${sign}-${t[2]}`); if (!m) continue;
      const sides = m.marketSides || [], yes = sides.find(x => x.long), no = sides.find(x => !x.long); if (!yes || !no) continue;
      const favSide = Number(yes.description) < 0 ? yes : no; // the side giving points (-line) is the favourite
      if (Math.abs(Number(yes.description)) !== line || !fav || !sameTeam(fav, favSide)) continue;
      if (sameTeam(out, yes) && !sameTeam(out, no)) return pick(m, 'yes', 'same spread (exact market ID)');
      if (sameTeam(out, no) && !sameTeam(out, yes)) return pick(m, 'no', 'same spread (exact market ID)');
    }
    return { reason: 'this spread is not listed on Polymarket US' };
  }
  // half totals: first-half-total-1pt5 -> tsc-<game>-1h-1pt5 (Over = Yes)
  t = /^(first-half|second-half)-total-(\d+pt\d+)$/.exec(suffix);
  if (t) { if (o !== 'over' && o !== 'under') return { reason: 'total market without Over/Under outcome' }; return pick(await get(`tsc-${game}-${H[t[1]]}-${t[2]}`), o === 'over' ? 'yes' : 'no', 'same half total (exact market ID)'); }
  // team totals: [first-half-|second-half-]team-total-home|away-3pt5 -> tsc-<game>-tt|tt1h|tt2h-<team abbr>-3pt5, team confirmed from the US description
  t = /^(?:(first-half|second-half)-)?team-total-(?:home|away)-(\d+pt\d+)$/.exec(suffix);
  if (t) {
    if (o !== 'over' && o !== 'under') return { reason: 'total market without Over/Under outcome' };
    const who = norm(String(source.title || '').replace(/^.*?:\s*/, '')), [, a1, a2] = game.split('-');
    for (const ab of [a1, a2]) {
      const m = await get(`tsc-${game}-tt${t[1] ? H[t[1]] : ''}-${ab}-${t[2]}`); if (!m) continue;
      const team = /Over if (.+?) scores/.exec(m.description || ''); if (team && who.includes(norm(team[1]))) return pick(m, o === 'over' ? 'yes' : 'no', 'same team total (exact market ID)');
    }
    return { reason: 'this team total is not listed on Polymarket US' };
  }
  return { reason: `${suffix.replace(/-/g, ' ')} markets are not listed on Polymarket US` };
}

/* ---------- US elections: party races map exactly ---------- */
const STATES = { alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy' };
function electionMatch(source, rows) {
  const title = String(source.title || ''), o = String(source.outcome || '').toLowerCase();
  if (o !== 'yes' && o !== 'no') return null;
  let r = /^Will the (Democrats|Republicans) win the (.+?) (Senate|Governor|gubernatorial) (?:race|election) in 2026\??$/i.exec(title), re;
  if (r) { const st = STATES[r[2].toLowerCase()]; if (!st) return null; re = new RegExp(`-us${/senate/i.test(r[3]) ? 'se' : 'gub'}-${st}-2026-11-03-${/^d/i.test(r[1]) ? 'dem' : 'rep'}$`); }
  else if ((r = /^Will (?:the )?(Democrats|Republicans) win ([A-Z]{2})-(\d{1,2})\b/.exec(title))) re = new RegExp(`-ushr-${r[2].toLowerCase()}-${r[3].padStart(2, '0')}-2026-11-03-${/^d/i.test(r[1]) ? 'dem' : 'rep'}$`);
  else return null;
  const hit = rows.filter(m => re.test(m.slug));
  return hit.length === 1 ? { m: hit[0], side: o, how: 'same election race (exact market ID)' } : { reason: 'this election market is not listed on Polymarket US' };
}

/* ---------- everything else: strict word matching ---------- */
function score(source, target, threshold, loose = false) {
  const a = [...new Set(tokens(source.title))], b = [...new Set(tokens(`${target.question || ''} ${target.title || ''} ${loose ? String(target.description || '').slice(0, 400) : firstSentence(target.description)}`))];
  if (a.length < 3) return { reason: 'source question is too short to match safely' };
  const bs = new Set(b), common = a.filter(w => bs.has(w)), nums = a.filter(w => /\d/.test(w));
  if (!nums.every(w => bs.has(w))) return { reason: 'a number or date differs' };
  if (directions(a) !== directions(b)) return { reason: 'direction wording differs (above/below/before/not)' };
  const extraA = a.filter(w => !bs.has(w)), as = new Set(a), extraB = b.filter(w => !as.has(w));
  if (!loose && (extraA.some(w => RISKY.has(w)) || extraB.some(w => RISKY.has(w)))) return { reason: 'material wording differs' };
  if (extraA.length > (loose ? 4 : 2)) return { reason: 'too much wording differs' };
  // a name in the trader's question that the US market doesn't mention is a different subject ("Kyren" vs "Jameson" Williams)
  const caps = new Set(String(source.title).split(/\s+/).slice(1).filter(w => /^[A-Z][a-z]/.test(w)).map(w => tokens(w)[0]).filter(Boolean));
  if (extraA.some(w => caps.has(w))) return { reason: 'a name in the question is missing from the US market' };
  const overlap = common.length / a.length;
  if (overlap < threshold) return { reason: `only ${Math.round(overlap * 100)}% of key words match` };
  const srcEnd = date(source.endDate), dstEnd = date(target.endDate);
  if (!isNaN(srcEnd) && !isNaN(dstEnd)) { const window = srcEnd - Date.now() > 30 * DAY ? (loose ? 240 : 120) : (loose ? 10 : 3); if (Math.abs(srcEnd - dstEnd) > window * DAY) return { reason: 'resolution dates differ' }; }
  return { score: overlap * 100 + (nums.length ? 5 : 0) - extraA.length * 6 - Math.min(extraB.length, 10) };
}
// -> { m: US market, side: 'yes'|'no', how, similar? } or { reason }
// opt.similar (default on): when there is no exact copy, take the closest US market on the same subject
async function resolve(source, threshold = .78, opt = {}) {
  const similar = opt.similar !== false, sp = await sportsMatch(source);
  if (sp?.m) return sp;
  if (sp) {
    // the same game can be filed under the next / previous day on Polymarket US (time zones): try those dates too
    const g = GAME.exec(String(source.slug)), suffix = g[2] ? `-${g[2]}` : '', d = Date.parse(g[1].slice(-10) + 'T00:00:00Z');
    const games = [g[1], ...[-1, 1].map(k => g[1].slice(0, -10) + new Date(d + k * DAY).toISOString().slice(0, 10))];
    // ...but only when the kick-off time agrees, so a series' next game (same teams, next day) is never used instead
    const src = await sourceMarket(source), start = Date.parse(src.gameStartTime || ''), sameKickoff = m => Number.isFinite(start) && Math.abs(Date.parse(m.gameStartTime || '') - start) < 12 * 36e5;
    for (const game of games.slice(1)) { const r = await sportsMatch({ ...source, slug: game + suffix }); if (r?.m && sameKickoff(r.m)) return { ...r, how: `${r.how}, listed under ${game.slice(-10)}` }; }
    if (similar) for (const [i, game] of games.entries()) { const r = await SIM.sports(source, game, g[2] || '').catch(() => null); if (r && (i === 0 || sameKickoff(r.m))) return r; }
    return sp;
  }
  const { rows } = await index();
  const el = electionMatch(source, rows); if (el?.m) return el;
  source = await sourceMarket(source);
  if (similar) { const r = SIM.crypto(source, rows) || SIM.weather(source, rows); if (r) return r; }
  const o = String(source.outcome || '').toLowerCase();
  if (o !== 'yes' && o !== 'no') return { reason: `"${source.outcome}" markets like this are not listed on Polymarket US` };
  const words = loose => { const c = [];
    for (const m of rows) { if ((m.marketSides || []).some(x => !/^(yes|no)$/i.test(x.description || ''))) continue; const r = score(source, m, loose ? Math.min(threshold, .6) : threshold, loose); if (r.score != null) c.push({ m, score: r.score }); }
    return c.sort((x, y) => y.score - x.score); };
  let c = words(false);
  if (c.length && !(c.length > 1 && c[0].score - c[1].score < 7)) return { m: c[0].m, side: o, how: `wording match ${Math.round(c[0].score)}/100` };
  if (!similar) return { reason: c.length ? `ambiguous: ${c.length} US markets match similarly` : 'no matching market is open on Polymarket US' };
  c = words(true);
  if (c.length && !(c.length > 1 && c[0].score - c[1].score < 3)) return { m: c[0].m, side: o, how: `similar: closest US market (${Math.round(c[0].score)}/100 wording)`, similar: true };
  return { reason: c.length ? `${c.length} US markets are equally close, none clearly the same` : 'nothing like this is listed on Polymarket US' };
}
module.exports = { resolve, index, tokens, score, sportsMatch, electionMatch };
