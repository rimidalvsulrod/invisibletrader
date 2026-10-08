// "Similar" matching: when Polymarket US has no exact copy of the trader's market, pick the closest US market
// about the same subject by comparing market metadata (asset/city/teams, bet type, threshold, time window),
// and buy the side that points the same way. Every result says what differs, e.g. "similar: line 44.5 vs 45.5".
const P = require('./polymarket-us');
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], H = 36e5, DAY = 864e5;
const num = s => Number(String(s).replace(/[$,]/g, '').replace(/k$/i, '000'));
const mon = s => MON.indexOf(String(s).slice(0, 3).toLowerCase());
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// America/New_York wall time -> UTC ms (handles daylight saving)
function et(y, m, d, h = 0, mi = 0) {
  const g = Date.UTC(y, m, d, h, mi), p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(g)).map(x => [x.type, x.value]));
  return g + (g - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute));
}
const h24 = (h, ap) => (+h % 12) + (/p/i.test(ap) ? 12 : 0);
const yearOf = (src, m) => { const e = Date.parse(src.endDate); const y = Number.isFinite(e) ? new Date(e).getUTCFullYear() : new Date().getUTCFullYear(); return m === 11 && Number.isFinite(e) && new Date(e).getUTCMonth() === 0 ? y - 1 : y; };

/* ---------------- crypto ---------------- */
const COIN = [[/\b(bitcoin|btc)\b/i, 'btc'], [/\b(ethereum|eth)\b/i, 'eth'], [/\b(solana|sol)\b/i, 'sol'], [/\bxrp\b/i, 'xrp'], [/\b(dogecoin|doge)\b/i, 'doge'], [/\bbnb\b/i, 'bnb'], [/\bhyperliquid\b/i, 'hype']];
const coinOf = s => (COIN.find(([r]) => r.test(s)) || [])[1] || null;
const TIME = /(\d{1,2}):(\d{2})\s?(AM|PM) ET on (?:[A-Z][a-z]{2}, )?([A-Z][a-z]+) (\d{1,2}), (\d{4})/g;
const times = d => [...String(d).matchAll(TIME)].map(r => et(+r[6], mon(r[4]), +r[5], h24(r[1], r[3]), +r[2]));
// US crypto market -> {coin, kind:'updown'|'at'|'touch', ...}
function usCrypto(m) {
  if (m.category !== 'crypto') return null;
  const d = String(m.description || ''), coin = coinOf(`${m.question} ${d.slice(0, 120)}`); if (!coin) return null;
  const T = times(d), first = d.split(/\n|Outcome sourced/)[0];
  if (/settle to Up if/i.test(first) && T.length >= 2) return { coin, kind: 'updown', a: T[1], b: T[0] };
  let r;
  if ((r = /at any point/i.test(first) && /(below|above)\s+\$?([\d,]+(?:\.\d+)?)/i.exec(first))) return { coin, kind: 'touch', dir: /below/i.test(r[1]) ? 'low' : 'high', x: num(r[2]), t: T.at(-1) ?? Date.parse(m.endDate) };
  if ((r = /between \$?([\d,]+(?:\.\d+)?) (?:and|to) \$?([\d,]+(?:\.\d+)?)/i.exec(first))) return { coin, kind: 'at', lo: num(r[1]), hi: num(r[2]), t: T.at(-1) };
  if ((r = /\$?([\d,]+(?:\.\d+)?) or (above|below)/i.exec(first))) return { coin, kind: 'at', lo: /above/i.test(r[2]) ? num(r[1]) : -Infinity, hi: /below/i.test(r[2]) ? num(r[1]) : Infinity, t: T.at(-1) };
  if ((r = /at or above \$?([\d,]+(?:\.\d+)?)/i.exec(first))) return { coin, kind: 'at', lo: num(r[1]), hi: Infinity, t: T.at(-1) };
  return null;
}
// the trader's (international) crypto market -> same shape, plus which outcome means "yes"
function srcCrypto(src) {
  const t = String(src.title || ''), o = String(src.outcome || ''), coin = coinOf(t); if (!coin) return null;
  const end = Date.parse(src.endDate); let r;
  if (/up or down/i.test(t)) {
    const yes = /^up$/i.test(o) ? true : /^down$/i.test(o) ? false : null; if (yes == null) return null;
    const u = /-updown-(\d+)(m|h)-(\d{9,})$/.exec(src.slug || '');
    if (u) { const a = +u[3] * 1e3; return { coin, kind: 'updown', a, b: a + +u[1] * (u[2] === 'm' ? 6e4 : H), yes }; }
    if ((r = /([A-Z][a-z]+) (\d{1,2}), (\d{1,2})(?::(\d{2}))?(AM|PM)(?:-(\d{1,2})(?::(\d{2}))?(AM|PM))? ET/.exec(t))) {
      const M = mon(r[1]), y = yearOf(src, M), a = et(y, M, +r[2], h24(r[3], r[5]), +(r[4] || 0));
      const b = r[6] ? et(y, M, +r[2], h24(r[6], r[8]), +(r[7] || 0)) : a + H; return { coin, kind: 'updown', a, b: b > a ? b : b + DAY, yes };
    }
    if ((r = /on ([A-Z][a-z]+) (\d{1,2})/.exec(t))) { const M = mon(r[1]), b = et(yearOf(src, M), M, +r[2], 12); return { coin, kind: 'updown', a: b - DAY, b, yes }; }
    return Number.isFinite(end) ? { coin, kind: 'updown', a: end - DAY, b: end, yes } : null;
  }
  // "What price will Bitcoin hit in October?" with outcomes like "↑ 120,000" / "↓ 80,000"
  if ((r = /^([↑↓])\s*\$?([\d,.]+k?)$/.exec(o.trim()))) return Number.isFinite(end) ? { coin, kind: 'touch', dir: r[1] === '↑' ? 'high' : 'low', x: num(r[2]), t: end, yes: true } : null;
  const yes = /^yes$/i.test(o) ? true : /^no$/i.test(o) ? false : null; if (yes == null) return null;
  const day = (/on ([A-Z][a-z]+) (\d{1,2})(?:,? (\d{1,2})(?::(\d{2}))?\s?(AM|PM) ET)?/.exec(t) || []);
  // "on October 8, 1AM ET" settles at that hour; plain "on October 8" settles at noon ET
  const at = day[1] ? et(yearOf(src, mon(day[1])), mon(day[1]), +day[2], day[3] ? h24(day[3], day[5]) : 12, +(day[4] || 0)) : end;
  if ((r = /between \$?([\d,.]+k?) and \$?([\d,.]+k?)/i.exec(t))) return { coin, kind: 'at', lo: num(r[1]), hi: num(r[2]), t: at, yes };
  if ((r = /\b(above|over|greater than) \$?([\d,.]+k?)/i.exec(t)) && !/\b(reach|hit)\b/i.test(t)) return { coin, kind: 'at', lo: num(r[2]), hi: Infinity, t: at, yes };
  if ((r = /\b(below|under|less than) \$?([\d,.]+k?)/i.exec(t)) && !/\b(dip|fall|drop)\b/i.test(t)) return { coin, kind: 'at', lo: -Infinity, hi: num(r[2]), t: at, yes };
  if ((r = /\b(reach|hit|above)\s+\$?([\d,.]+k?)/i.exec(t))) return { coin, kind: 'touch', dir: 'high', x: num(r[2]), t: day[1] ? at + 12 * H : end, yes };
  if ((r = /\b(dip|fall|drop)\s+(?:to|below)\s+\$?([\d,.]+k?)/i.exec(t))) return { coin, kind: 'touch', dir: 'low', x: num(r[2]), t: day[1] ? at + 12 * H : end, yes };
  return null;
}
const money = x => Number.isFinite(x) ? `$${Math.round(x).toLocaleString('en-US')}` : '';
const when = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ') + 'Z';
function crypto(src, rows) {
  const s = srcCrypto(src); if (!s || !Number.isFinite(s.t ?? s.b)) return null;
  // a coin with no US markets (ETH, SOL, XRP...) is copied as Bitcoin over the same window: they move together
  const coins = new Set(rows.map(usCrypto).filter(Boolean).map(u => u.coin)), coin = coins.has(s.coin) ? s.coin : s.kind === 'updown' ? 'btc' : null;
  if (!coin) return null;
  let best = null;
  for (const m of rows) {
    const u = usCrypto(m); if (!u || u.coin !== coin) continue;
    let cost, side = s.yes ? 'yes' : 'no', why;
    if (s.kind === 'updown' && u.kind === 'updown') {
      const ov = Math.min(s.b, u.b) - Math.max(s.a, u.a), sl = s.b - s.a, ul = u.b - u.a;
      if (ov < Math.min(sl, ul) / 2 || ul > Math.max(4 * sl, sl + H)) continue; // overlapping windows of a comparable length only
      cost = (s.b - s.a + u.b - u.a - 2 * Math.max(0, ov)) / H; why = `up/down window ${when(u.a)} to ${when(u.b)}`;
    } else if (s.kind === 'at' && u.kind === 'at' && Number.isFinite(u.t)) {
      const dt = Math.abs(u.t - s.t) / H; if (dt > 36) continue;
      // compare the "yes" ranges: single thresholds by level, bands by centre
      const sAbove = s.hi === Infinity, sBelow = s.lo === -Infinity, uAbove = u.hi === Infinity, uBelow = u.lo === -Infinity;
      const sx = sAbove ? s.lo : sBelow ? s.hi : (s.lo + s.hi) / 2, ux = uAbove ? u.lo : uBelow ? u.hi : (u.lo + u.hi) / 2;
      if ((sAbove || sBelow) !== (uAbove || uBelow)) continue; // threshold vs band
      if (sBelow && uAbove || sAbove && uBelow) side = s.yes ? 'no' : 'yes'; // "below X" == NOT "at or above X"
      cost = dt + Math.abs(ux - sx) / sx * 200; why = `price ${uAbove ? 'at or above' : uBelow ? 'at or below' : 'between'} ${money(uAbove ? u.lo : uBelow ? u.hi : u.lo)}${!uAbove && !uBelow ? ` and ${money(u.hi)}` : ''} at ${when(u.t)}`;
    } else if (s.kind === 'touch' && u.kind === 'touch' && u.dir === s.dir && Number.isFinite(u.t)) {
      const dd = (u.t - s.t) / DAY; if (dd < -1) continue; // the US window must cover the trader's deadline
      cost = Math.abs(dd) * 2 + Math.abs(u.x - s.x) / s.x * 200; why = `touches ${money(u.x)} by ${when(u.t)}`;
    } else continue;
    if (!best || cost < best.cost) best = { m, side, cost, why };
  }
  return best ? { m: best.m, side: best.side, how: `similar: ${coin !== s.coin ? `${coin.toUpperCase()} instead of ${s.coin.toUpperCase()}, ` : ''}${best.why}`, similar: true } : null;
}

/* ---------------- daily high temperature (NYC, Miami, Chicago, LA, SF on Polymarket US) ---------------- */
const CITY = { nyc: 'nyc', 'new york': 'nyc', 'new york city': 'nyc', miami: 'mia', chicago: 'mdw', 'los angeles': 'lax', la: 'lax', 'san francisco': 'sfo', sf: 'sfo' };
function weather(src, rows) {
  const t = String(src.title || ''), o = String(src.outcome || '').toLowerCase();
  const r = /highest temperature in (.+?)(?: \(.+?\))? be (.+?) on ([A-Z][a-z]+) (\d{1,2})/i.exec(t); if (!r || (o !== 'yes' && o !== 'no')) return null;
  const city = CITY[norm(r[1])]; if (!city) return null;
  const M = mon(r[3]), date = `${yearOf(src, M)}-${String(M + 1).padStart(2, '0')}-${String(+r[4]).padStart(2, '0')}`;
  const b = r[2].replace(/°/g, ''), C = /C\b/.test(b), f = x => C ? x * 9 / 5 + 32 : x; let lo, hi, z;
  if ((z = /(-?\d+)\s*[FC]? or (?:below|lower|less)/i.exec(b))) { lo = -200; hi = f(+z[1] + (C ? .5 : 0)); }
  else if ((z = /(-?\d+)\s*[FC]? or (?:higher|above|more)/i.exec(b))) { lo = f(+z[1] - (C ? .5 : 0)); hi = 200; }
  else if ((z = /(-?\d+)\s*-\s*(-?\d+)/.exec(b))) { lo = f(+z[1] - (C ? .5 : 0)); hi = f(+z[2] + (C ? .5 : 0)); }
  else if ((z = /(-?\d+)/.exec(b))) { lo = f(+z[1] - (C ? .5 : 0)); hi = f(+z[1] + (C ? .5 : 0)); }
  else return null;
  if (!C) { hi += .999; } // whole degrees: "66-67F" covers 66.0 to 67.999
  let best = null;
  for (const m of rows) {
    const k = new RegExp(`^tc-temp-${city}high-${date}-(?:lt(\\d+)|gte(\\d+)lt(\\d+)|gte(\\d+))f$`).exec(m.slug); if (!k) continue;
    const ulo = k[1] ? -200 : +(k[2] || k[4]), uhi = k[1] ? +k[1] : k[3] ? +k[3] : 200;
    const ov = Math.min(hi, uhi) - Math.max(lo, ulo), cost = -ov + Math.abs((Math.max(lo, -150) + Math.min(hi, 150)) / 2 - (Math.max(ulo, -150) + Math.min(uhi, 150)) / 2) / 100;
    if (ov > 0 && (!best || cost < best.cost)) best = { m, cost, label: k[1] ? `below ${k[1]}F` : k[4] ? `${k[4]}F or higher` : `${k[2]}F to ${+k[3] - 1}F` };
  }
  return best ? { m: best.m, side: o, how: `similar: ${city.toUpperCase()} high ${best.label} (Polymarket US weather station)`, similar: true } : null;
}

/* ---------------- sports: same game, nearest market ---------------- */
const line = s => { const r = /(\d+)pt(\d+)/.exec(s); return r ? Number(`${r[1]}.${r[2]}`) : null; };
const seg = s => /first-half|1h|halftime/.test(s) ? '1h' : /second-half|2h/.test(s) ? '2h' : /(^|-)(1q|2q|3q|4q)(-|$)/.test(s) ? 'q' : /map|game\d|m\d/.test(s) ? 'map' : '';
const names = side => [side?.description, side?.team?.name, side?.team?.alias, side?.team?.safeName, side?.team?.abbreviation].filter(Boolean).map(norm).filter(x => x.length > 1);
const isTeam = (txt, side) => { const o = norm(txt); return !!o && names(side).some(n => n === o || (n.length > 3 && (o.includes(n) || n.includes(o)))); };
async function sports(src, game, suffix) {
  const ev = await P.event(game).catch(() => null); if (!ev || !ev.markets.length) return null;
  const out = String(src.outcome || ''), o = out.toLowerCase(), ms = ev.markets, sg = seg(suffix), L = line(suffix);
  const win = ms.find(m => m.slug === `aec-${game}`), sides = win?.marketSides || [];
  const teamWin = (txt, why) => { // the game-winner side (or the soccer "Will X win" market) for a team
    const hit = sides.filter(x => isTeam(txt, x));
    if (win && hit.length === 1) return { m: win, side: hit[0].long ? 'yes' : 'no', how: `similar: ${why}, copied as ${hit[0].description} to win the game`, similar: true };
    const atc = ms.filter(m => m.slug.startsWith(`atc-${game}-`) && !/-draw$|-winner-/.test(m.slug) && norm(m.question).includes(norm(txt).split(' ').pop()));
    return atc.length === 1 ? { m: atc[0], side: 'yes', how: `similar: ${why}, copied as ${txt} to win`, similar: true } : null;
  };
  // player props, "CeeDee Lamb: Receiving Yards O/U 79.5" -> "Will CeeDee Lamb record 80+ receiving yards?" (Over 79.5 == 80+, exactly)
  const head = String(src.title || '').split(':')[0];
  if ((o === 'over' || o === 'under') && /:/.test(src.title || '') && !/\bvs\.?\b/i.test(head)) {
    const pl = norm(head), stat = norm(String(src.title).split(':')[1].replace(/O\/U.*$/i, '')).replace(/s\b/g, ''), Lp = Number((/O\/U\s*([\d.]+)/i.exec(src.title) || [])[1]);
    if (!pl || !stat || !Number.isFinite(Lp)) return null;
    let best = null;
    for (const m of ms) {
      const q = /^Will (.+?) (?:record|score|have|make|throw|get) (\d+(?:\.\d+)?)\+ (.+?)\??$/i.exec(m.question || ''); if (!q) continue;
      if (norm(q[1]) !== pl || norm(q[3]).replace(/s\b/g, '') !== stat) continue;
      const cost = Math.abs(+q[2] - Math.ceil(Lp)); if (!best || cost < best.cost) best = { m, cost, n: +q[2] };
    }
    if (!best) return null; // never stand a player prop in for a game total
    const exact = best.n === Math.ceil(Lp);
    return { m: best.m, side: o === 'over' ? 'yes' : 'no', how: exact ? 'same player prop (exact line)' : `similar: ${head} ${best.n}+ instead of O/U ${Lp}`, similar: !exact };
  }
  // Over / Under on any total: same segment and team when possible, nearest line
  if (o === 'over' || o === 'under') {
    if (L == null) return null;
    const team = /team-total-(home|away)/.test(suffix), tname = norm(String(src.title).replace(/^.*?:\s*/, ''));
    let best = null;
    for (const m of ms) {
      if (!m.slug.startsWith('tsc-')) continue;
      const rest = m.slug.slice(`tsc-${game}-`.length), ml = line(rest); if (ml == null) continue;
      const mTeam = /^tt/.test(rest), who = (/Over if (.+?) scores/.exec(m.description || '') || [])[1];
      if (team !== mTeam && !(mTeam === false)) continue; // never turn a game total into one team's total
      if (team && mTeam && !(who && tname.includes(norm(who)))) continue;
      const cost = (seg(rest) === sg ? 0 : 100) + (team === mTeam ? 0 : 50) + Math.abs(ml - L);
      if (!best || cost < best.cost) best = { m, cost, ml, rest };
    }
    if (best && best.ml === L && seg(best.rest) === sg && /^tt/.test(best.rest) === team) return { m: best.m, side: o === 'over' ? 'yes' : 'no', how: 'same total line (exact market)' };
    return best ? { m: best.m, side: o === 'over' ? 'yes' : 'no', how: `similar: ${o === 'over' ? 'Over' : 'Under'} ${best.ml}${seg(best.rest) !== sg || /^tt/.test(best.rest) !== team ? ` (${best.m.question.replace(/^Will the total in /, '').replace(/\?$/, '')})` : ''} instead of ${L}`, similar: true } : null;
  }
  // spreads / handicaps: the trader's team at the nearest line, else that team to win
  if (/spread|handicap/.test(suffix)) {
    // "Spread: Jaguars (-2.5)" or "Game Handicap: TY (-1.5) vs LGD Gaming (+1.5)" -> each named side with its line
    const pairs = [...String(src.title || '').replace(/^.*?:\s*/, '').matchAll(/([^()]+?)\s*\(([+-][\d.]+)\)/g)].map(r => ({ name: r[1].replace(/^\s*vs\.?\s*/i, '').trim(), x: +r[2] }));
    let best = null, myLine = null;
    for (const m of ms) {
      if (!m.slug.startsWith('asc-')) continue;
      const mine = (m.marketSides || []).find(x => isTeam(out, x)); if (!mine || !pairs.length) continue;
      const p = pairs.find(q => isTeam(q.name, mine) || isTeam(out, { description: q.name }));
      myLine = p ? p.x : pairs.length === 1 ? -pairs[0].x : null; if (myLine == null) continue;
      const cost = (seg(m.slug.slice(game.length + 5)) === sg ? 0 : 100) + Math.abs(Number(mine.description) - myLine);
      if (!best || cost < best.cost) best = { m, cost, mine, myLine };
    }
    if (best) return { m: best.m, side: best.mine.long ? 'yes' : 'no', how: `similar: ${out} ${best.mine.description} (trader had ${best.myLine > 0 ? '+' : ''}${best.myLine})`, similar: true };
    return teamWin(out, 'no matching spread');
  }
  // anything naming a team (half / quarter winner, map winner, halftime result...) -> that team to win
  const t = teamWin(out, `${suffix.replace(/-/g, ' ')} not listed`); if (t) return t;
  // Yes/No props about one side, e.g. "harris-win-by-ko-tko": Yes -> that side wins, No -> the other side
  if (o === 'yes' || o === 'no') {
    const words = suffix.split('-'), hit = sides.filter(x => names(x).some(n => n.split(' ').some(w => w.length > 2 && words.includes(w))));
    if (hit.length === 1) { const s = o === 'yes' ? hit[0] : sides.find(x => x !== hit[0]); if (s) return { m: win, side: s.long ? 'yes' : 'no', how: `similar: copied as ${s.description} to win`, similar: true }; }
  }
  return null;
}

module.exports = { crypto, weather, sports, srcCrypto, usCrypto, et };
