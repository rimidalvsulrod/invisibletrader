// Finds the Kalshi market that is the same bet as a Polymarket trade. Never guesses: anything ambiguous is skipped.
//  Yes/No questions: same key words both ways, every number matches, same direction words (above/before/not…),
//    resolve around the same time.
//  Games (moneyline / map winners / "Will X win on DATE?" / draws): both teams match a Kalshi game on the same
//    date (and start time when Kalshi lists one), exactly one such game, then the trader's team -> that team's market.
const K = require('./kalshi');
const DAY = 864e5, HR = 36e5;
const STOP = new Set('will the a an of in on at to be by for and or is are with from vs than this that win wins won who what which when have has get gets record during finish as'.split(' '));
// words that change what a question means: never allowed as an unexplained extra word on either side
const RISKY = new Set('first second third fourth last round place runner runoff ticket vice nominee nomination primary lose loses lost margin seats share majority finals semifinal quarterfinal mvp leader approve approval announce announces officially resign fired out'.split(' '));
const DIR = new Set('above below over under more less fewer higher lower before after not least most exceed exceeds lose loses lost'.split(' '));
const GEN = new Set('st state saint university univ college united city fc cf sc ac afc club team esports esport gaming real sporting athletic de del new los las san fort'.split(' '));
const MON = { january: 'jan', february: 'feb', march: 'mar', april: 'apr', june: 'jun', july: 'jul', august: 'aug', september: 'sep', sept: 'sep', october: 'oct', november: 'nov', december: 'dec' };
const MI = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const SYN = { leave: 'out', leaves: 'out', leaving: 'out', democrats: 'democrat', democratic: 'democrat', democratics: 'democrat', republicans: 'republican' };
const MN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// deadlines -> one token for the last day included: "before Nov 1, 2026" == "by Oct 31, 2026" == "d20261031"; "before 2027" == "d20261231"
const ymd = d => `d${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
function deadline(_, w, mon, day, yr) {
  const d = new Date(Date.UTC(+yr, MN.indexOf(mon), +day)), last = new Date(Date.UTC(+yr, MN.indexOf(mon) + 1, 0)).getUTCDate();
  if (w === 'before' && +day !== last) d.setUTCDate(d.getUTCDate() - 1); // "before Oct 31" is used to mean "by the end of Oct 31"
  return ` ${ymd(d)} `;
}
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\bpro (football|basketball|baseball|hockey)\b/g, (_, x) => ({ football: 'nfl', basketball: 'nba', baseball: 'mlb', hockey: 'nhl' })[x]).replace(/(\d),(\d{3})/g, '$1$2')
  .replace(/(?<!\d)\.|\.(?!\d)/g, '').replace(/[a-z]+/g, w => MON[w] || SYN[w] || w)
  .replace(/\b(before|by)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g, deadline)
  .replace(/\bbefore\s+(\d{4})\b/g, (_, y) => ` d${+y - 1}1231 `);
const tok = s => norm(s).replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(w => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
const dirs = ws => [...new Set(ws.filter(w => DIR.has(w)))].sort().join(',');
const cents = (d, c) => { const x = parseFloat(d); return isNaN(x) ? (c ?? 0) : Math.round(x * 100); };
const getJSON = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${u.split('?')[0]}`)));

/* ---------- Kalshi event index (all open events; refreshed every 15 min, 2 min if a page failed) ---------- */
const GAME = /^(?:(?:game\s*\d+|[^:]*\d[^:]*):\s*)?(.+?)\s+vs\.?\s+([^:]+?)(?::\s*map\s*(\d+))?\s*$/i;
const kDate = t => { const m = /-(\d{2})([A-Z]{3})(\d{2})(\d{4})?/.exec(t); return m && MI[m[2]] ? { d: `20${m[1]}-${String(MI[m[2]]).padStart(2, '0')}-${m[3]}`, hm: m[4] } : null; };
const IX = {}, LOADING = {};
// stale-while-revalidate: once loaded, callers never wait for the ~15s reload
async function eventIndex(env) {
  const c = IX[env]; if (c && Date.now() - c.t < (c.complete ? 6e5 : 12e4)) return c;
  const p = LOADING[env] ??= loadIndex(env).finally(() => { delete LOADING[env]; });
  if (c) { p.catch(() => {}); return c; } return p;
}
async function loadIndex(env) {
  const c = IX[env], { all, complete } = await K.openEvents(env); if (!all.length) { if (c) return c; throw new Error("couldn't load Kalshi events"); }
  const ev = all.map(e => { const g = GAME.exec(e.title || ''), kd = kDate(e.event_ticker || '');
    return { e: e.event_ticker, tk: new Set(tok(`${e.title} ${e.sub_title || ''}`)),
      g: g && kd && { sides: [g[1].trim(), g[2].trim()], map: g[3] ? +g[3] : 0, kd,
        abbr: String(e.sub_title || '').replace(/^map\s*\d+:\s*/i, '').replace(/\(.*?\)/g, '').split(/\s+vs\.?\s+/i).map(x => x.trim().toUpperCase()) } }; })
    .filter(e => e.e && e.tk.size), df = new Map();
  for (const e of ev) for (const w of e.tk) df.set(w, (df.get(w) || 0) + 1);
  return IX[env] = { t: Date.now(), complete, ev, games: ev.filter(e => e.g), df };
}
const EMC = new Map();
const shape = m => { const ws = tok(`${m.title} ${m.yes_sub_title || ''}`);
  return { ttk: new Set(tok(m.title)), t: m.ticker, title: m.title, sub: m.yes_sub_title, ya: cents(m.yes_ask_dollars, m.yes_ask), na: cents(m.no_ask_dollars, m.no_ask), tk: new Set(ws), dir: dirs(ws),
    ends: [m.close_time, m.expected_expiration_time].map(x => Date.parse(x)).filter(x => !isNaN(x)) }; };
async function evMarkets(env, ev) {
  const k = env + ev, c = EMC.get(k); if (c && Date.now() - c.t < 3e4) return c.data;
  const data = (await K.eventMarkets(env, ev)).map(shape).filter(m => m.t);
  if (EMC.size > 500) EMC.clear(); EMC.set(k, { t: Date.now(), data }); return data;
}

/* ---------- Polymarket market info ---------- */
const PMC = new Map();
async function pmInfo(cid, slug) {
  if (PMC.has(cid)) return PMC.get(cid);
  const u = `https://gamma-api.polymarket.com/markets?condition_ids=${cid}`;
  const m = await getJSON(u).then(r => r?.[0] || getJSON(u + '&closed=true').then(r => r?.[0]))
    .then(m => m || (slug ? getJSON(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`).then(r => r?.[0]) : null)).catch(() => null);
  const i = m ? { end: Date.parse(m.endDate), start: Date.parse(String(m.gameStartTime || '').replace(' ', 'T').replace(/\+00$/, 'Z')), type: m.sportsMarketType || '' } : { end: NaN, start: NaN, type: '' };
  if (m) { PMC.set(cid, i); if (PMC.size > 5000) PMC.clear(); } return i;
}

/* ---------- Yes/No questions ---------- */
function matchQuestion(title, mk, th, end) {
  const ws = [...new Set(tok(title))]; if (ws.length < 3) return { reason: 'question too short to match safely' };
  const nums = ws.filter(w => /\d/.test(w)), d = dirs(ws); let best = null, near = null;
  for (const m of mk) {
    const has = w => m.tk.has(w) || !!m.ev?.has(w); // words in the event title ("2026 Nobel Peace Prize winner") count too
    let h = 0; for (const w of ws) if (has(w)) h++; const s = h / ws.length;
    if (s < th || !nums.every(has)) continue;
    // extra words may appear on one side only (a word on each side is a swap: "rushing" vs "receiving", "Kyren" vs "Jameson"):
    // Kalshi at most 1, Polymarket at most 2, none meaning-changing, and Kalshi may not add numbers.
    // When every Polymarket word is covered, Kalshi's subtitle (often just the candidate's name) isn't counted as extra.
    const px = ws.filter(w => !has(w)), kx = [...(px.length ? m.tk : m.ttk || m.tk)].filter(w => !ws.includes(w));
    if ((kx.length && px.length) || kx.length > 1 || px.length > 2 || kx.some(w => RISKY.has(w) || /\d/.test(w)) || px.some(w => RISKY.has(w))) continue;
    if (m.dir !== d) { near ??= 'wording differs (above/below/before/after/not)'; continue; }
    // short-term markets must resolve within 3 days of each other; long-dated ones (Polymarket end dates are often loose) within 120.
    // Polymarket sometimes has no end date: then the question's own year/date (already required to match) has to do.
    if (isNaN(end) ? !nums.length : !m.ends.some(x => Math.abs(x - end) <= (end - Date.now() > 30 * DAY ? 120 : 3) * DAY)) { near ??= isNaN(end) ? 'could not confirm the resolution date' : 'resolves on a different date'; continue; }
    if (!best || s > best.s) best = { m, s };
  }
  return best || { reason: near || 'not on Kalshi' };
}
async function questionMarkets(env, title) { // markets of the 12 events sharing the rarest words with the question
  const ix = await eventIndex(env), N = ix.ev.length, ws = [...new Set(tok(title))];
  const top = ix.ev.map(e => { let s = 0; for (const w of ws) if (e.tk.has(w)) s += Math.log(N / ix.df.get(w)); return { e: e.e, tk: e.tk, s }; })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12);
  const out = []; for (let i = 0; i < top.length; i += 4) (await Promise.all(top.slice(i, i + 4).map(x => evMarkets(env, x.e).then(ms => ms.map(m => ({ ...m, ev: x.tk })))))).forEach(m => out.push(...m));
  return out;
}

/* ---------- games ---------- */
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
// does Polymarket team p (tokens) name Kalshi team k (raw)? Every distinctive Kalshi word must appear; a trailing
// 1–2 letter tag ("New York Y", "Chicago WS") must match the initials of the remaining Polymarket words.
function sideHit(p, k) {
  const raw = k.trim().split(/\s+/), kt = tok(k);
  let sig = kt.filter(w => w.length > 2 && !GEN.has(w));
  if (sig.length > 1 && /^[A-Z]{2,4}$/.test(raw[0])) sig = sig.filter(w => w !== raw[0].toLowerCase()); // "BUF Bills": city code optional
  if (!sig.length) sig = kt.filter(w => !GEN.has(w)); // short names: "OG", "G2"
  if (!sig.length || !sig.every(w => p.some(x => same(x, w)))) return false;
  const last = raw[raw.length - 1];
  if (raw.length > 1 && /^[A-Za-z]{1,2}$/.test(last) && !p.includes(last.toLowerCase())) {
    const ini = p.filter(x => !kt.some(w => same(x, w))).map(x => x[0]).join('');
    if (!ini.startsWith(last.toLowerCase())) return false;
  }
  return true;
}
const etDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const dayDiff = (kd, start) => Math.round(Math.abs(Date.parse(kd.d) - Date.parse(etDay(start))) / DAY);
const timeOk = (kd, start) => !kd.hm || Math.abs(Date.parse(`${kd.d}T${kd.hm.slice(0, 2)}:${kd.hm.slice(2)}:00-04:00`) - start) <= 4 * HR; // ±4h covers EST/EDT
function parseGame(title) {
  let m;
  if ((m = /^will (.+?) win on (\d{4}-\d{2}-\d{2})\??$/i.exec(title))) return { sides: [m[1]], map: 0, pick: 0 };
  if ((m = /^will (.+?) vs\.? (.+?) end in a draw\??$/i.exec(title))) return { sides: [m[1], m[2]], map: 0, pick: 'tie' };
  const seg = String(title).split(/:\s+/).filter(x => /\svs\.?\s/i.test(x)); if (!seg.length) return null;
  let t = seg[seg.length - 1], map = 0;
  const mm = /\s-\s(?:map|game)\s*(\d+)\s+winner/i.exec(t); if (mm) map = +mm[1];
  t = t.replace(/\s-\s.*$/, '').replace(/\(bo\d+\)/ig, '').replace(/\([^)]*,[^)]*\)/g, '').trim();
  const s = t.split(/\s+vs\.?\s+/i); return s.length === 2 && s[0] && s[1] ? { sides: s.map(x => x.trim()), map } : null;
}
// slug like "nhl-fla-sj-2026-10-01": league + both teams' codes, in title order
const slugCodes = slug => { const m = /^([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-\d{4}-\d{2}-\d{2}/.exec(slug || ''); return m ? { lg: m[1].toUpperCase(), c: [m[2].toUpperCase(), m[3].toUpperCase()] } : null; };
async function matchGame(env, g, outcome, start, slug) {
  if (isNaN(start)) return { reason: "couldn't get the game time from Polymarket" };
  const P = g.sides.map(tok), sc = P.length === 2 ? slugCodes(slug) : null; let pick = g.pick, buyNo = false;
  if (pick === undefined) { // the trader's team
    const eq = g.sides.map(x => norm(x) === norm(outcome)), o = tok(outcome).filter(w => !GEN.has(w)), hits = eq[0] !== eq[1] ? eq : P.map(p => o.some(w => p.includes(w)));
    if (hits[0] === hits[1]) return { reason: `couldn't tell which team "${outcome}" is` }; pick = hits[0] ? 0 : 1;
  } else { const o = String(outcome).toLowerCase(); if (o !== 'yes' && o !== 'no') return { reason: 'not a Yes/No market' }; buyNo = o === 'no'; }
  const ix = await eventIndex(env); let found = [];
  for (const e of ix.games) {
    if (e.g.map !== g.map) continue;
    // same calendar day; tennis/UFC tickers keep the originally scheduled day, so they may be up to 3 days off
    const dd = dayDiff(e.g.kd, start); if (dd > (P.length === 2 && /MATCH|FIGHT/.test(e.e.split('-')[0]) ? 3 : 0)) continue;
    const code = sc && e.e.includes(sc.lg) && e.g.abbr.length === 2; // same league: team codes are reliable
    const H = P.map((p, i) => e.g.sides.map((k, j) => sideHit(p, k) || (code && sc.c[i] === e.g.abbr[j])));
    let map = null; // PM side index -> Kalshi side index
    if (P.length === 2) { if (H[0][0] && H[1][1] && !H[0][1] && !H[1][0]) map = [0, 1]; else if (H[0][1] && H[1][0] && !H[0][0] && !H[1][1]) map = [1, 0]; }
    else if (H[0][0] !== H[0][1] && tok(g.sides[0]).filter(w => !GEN.has(w)).every(w => tok(e.g.sides[H[0][0] ? 0 : 1]).some(x => same(x, w)))) map = [H[0][0] ? 0 : 1];
    if (map) found.push({ e, map, dd });
  }
  if (found.some(f => f.dd === 0)) found = found.filter(f => f.dd === 0); // same day wins over a nearby day
  if (found.length > 1) found = found.filter(f => timeOk(f.e.g.kd, start)); // doubleheaders: closest start time
  if (!found.length) return { reason: 'game not on Kalshi' };
  if (found.length > 1) return { reason: 'more than one Kalshi game fits — skipped to be safe' };
  const { e, map } = found[0], mk = await evMarkets(env, e.e);
  const sideOf = m => { const suf = m.t.split('-').pop().toUpperCase(); if (suf === 'TIE') return 'tie';
    const i = e.g.abbr.indexOf(suf); if (i >= 0 && e.g.abbr.length === 2) return i;
    const st = tok(m.sub), h = e.g.sides.map(k => tok(k).some(w => w.length > 2 && st.some(x => same(x, w)))); return h[0] !== h[1] ? (h[0] ? 0 : 1) : -1; };
  const want = pick === 'tie' ? 'tie' : map[pick], ms = mk.filter(m => sideOf(m) === want);
  if (ms.length !== 1) return { reason: "couldn't find that team's market on Kalshi" };
  return { m: ms[0], side: buyNo ? 'no' : 'yes' };
}

// Fed meeting decisions: "no change / increase / decrease by 25 / 50+ bps after the October 2026 meeting" -> KXFEDDECISION
function fedTicker(title) {
  const t = norm(title); if (!/\bfed\b/.test(t)) return null;
  const my = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})\s+meeting\b/.exec(t); if (!my) return null;
  let code = null;
  if (/\bno change\b/.test(t)) code = 'H0';
  else { const m = /\b(increase|hike|raise|decrease|cut|lower)s?\s+(?:interest\s+)?rates?\s+by\s+(\d+)(\+)?\s*bps\b/.exec(t); if (!m) return null;
    const n = +m[2]; code = n === 25 && !m[3] ? '25' : n >= 50 ? '26' : null; if (!code) return null; code = (/increase|hike|raise/.test(m[1]) ? 'H' : 'C') + code; }
  return `KXFEDDECISION-${my[2].slice(2)}${my[1].toUpperCase()}-${code}`;
}

// -> { m: kalshi market, side: 'yes'|'no' } or { reason }
async function resolve(env, t, th) {
  const info = await pmInfo(t.conditionId, t.slug), o = String(t.outcome).toLowerCase(), yn = o === 'yes' || o === 'no';
  const g = /moneyline/.test(info.type) || !info.type ? parseGame(t.title) : null;
  if (g && (g.pick !== undefined) === yn) return matchGame(env, g, t.outcome, isNaN(info.start) ? info.end : info.start, t.slug || t.eventSlug);
  if (!yn) return { reason: info.type && !/moneyline/.test(info.type) ? `${info.type.replace(/_/g, ' ')} markets aren't copied (only winners and Yes/No)` : 'not a Yes/No or game-winner market' };
  const fed = fedTicker(t.title);
  if (fed) { const m = await K.market(env, fed).catch(() => null); return m && ['active', 'open'].includes(m.status) ? { m: shape(m), side: o } : { reason: 'that Fed meeting market is not open on Kalshi' }; }
  const b = matchQuestion(t.title, await questionMarkets(env, t.title), th, info.end);
  return b.m ? { m: b.m, side: o } : b;
}
module.exports = { resolve, tok, dirs, matchQuestion, parseGame, sideHit, eventIndex, pmInfo };
