// Edge Lab (paper only): three mechanical strategies on Polymarket US, found by scanning every open game and futures event.
//  1. Ladder gaps: alternate lines must be monotone ("29+ saves" can't be likelier than "23+"). When a harder line's BID is above an
//     easier line's ASK, buy NO on the hard one + YES on the easy one: costs under $1 and always pays at least $1.
//  2. Set gaps: one-winner sets (division, league, election winner) whose YES asks add up to under $1 minus fees.
//  3. Underdogs: pre-game sides priced 6-20c on winner/spread/total markets. Backtest on global Polymarket suggested cheap sides win
//     more often than their price; this is the forward test on real US books (a hypothesis, not a proven edge).
// Fills are sequential, thinnest leg first, with a fresh re-quote before each next leg: if the price ran away the first leg stays
// unhedged (that is the real leg risk). Every gap is tracked, so the tab shows how long gaps actually live.
const crypto = require('crypto'), db = require('./db'), S = require('./settings'), P = require('./polymarket-us');
const GW = P.GATEWAY, UA = { 'user-agent': 'Mozilla/5.0 (mimic)' };
const fee = p => 0.0695 * p * (1 - p), num = x => { x = Number(x); return Number.isFinite(x) ? x : null; };
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const DEF = { ladder: 5, set: 5, dog: .5 }; // % of the paper account per trade
const R = { minLadder: .015, minSet: .02, abort: .005, cap: { ladder: 20, set: 6, dog: 30 }, lead: 3 * 6e4, maxQty: 200, share: .1,
  dogLo: .06, dogHi: .2, dogSpread: .03, dogStart: [20 * 6e4, 36 * 36e5] };
const DOGT = /^(football|basketball|hockey|baseball|soccer|tennis|ufc)_.*(full_game_winner|full_time_winner|match_winner|fight_winner|full_game_spread|full_game_total)$/;

async function get(u) { for (let i = 0; ; i++) { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25e3) }); if (r.ok) return r.json(); if (r.status < 500 && r.status !== 429) throw new Error(r.status); } catch (e) { if (i >= 2) throw e; } await new Promise(z => setTimeout(z, 500 * (i + 1))); } }
async function events() { // every open event with its markets (CDN-cached pages, six at a time)
  const out = []; for (let off = 0; off < 20000; off += 600) {
    const pages = await Promise.all([0, 1, 2, 3, 4, 5].map(i => get(`${GW}/v1/events?limit=100&offset=${off + i * 100}&active=true&closed=false`).then(j => j.events || []).catch(() => [])));
    for (const p of pages) out.push(...p); if (pages.some(p => p.length < 100)) break; }
  return out;
}
function flat(evs) {
  const out = []; for (const e of evs) for (const m of e.markets || []) { if (!m.slug || m.closed || m.active === false) continue;
    out.push({ ev: e.slug, s: m.slug, t: m.sportsMarketType || m.marketType || '', q: m.question || '', bb: num(m.bestBidQuote?.value), ba: num(m.bestAskQuote?.value), gs: Date.parse(m.gameStartTime || e.startTime) || 0 }); }
  return out;
}

/* ---------- 1. ladders ---------- */
// ascending val => the YES price must be non-decreasing
function ladders(M) {
  const L = new Map(), add = (k, val, m) => { if (!L.has(k)) L.set(k, []); L.get(k).push({ val, m }); };
  for (const m of M) { let x;
    if ((x = m.s.match(/^(.*)-(pos|neg)-(\d+)pt(\d+)$/)) && /cover/.test(m.q)) add(x[1] + '|' + (m.q.match(/Will the (.+?) cover/)?.[1] || '?'), (x[2] === 'pos' ? 1 : -1) * Number(`${x[3]}.${x[4]}`), m);
    else if ((x = m.s.match(/^(.*)-(\d+)pt(\d+)$/)) && /more than|over/i.test(m.q)) add(x[1] + '|over', -Number(`${x[2]}.${x[3]}`), m);
    else if ((x = m.s.match(/^(.*)-gte(\d+)$/))) add(x[1] + '|gte', -Number(x[2]), m); }
  return L;
}
function ladderGaps(L, now) {
  const out = [];
  for (const [key, v] of L) { const it = v.filter(x => x.m.bb > 0 && x.m.ba > 0 && x.m.gs > now + R.lead).sort((a, b) => a.val - b.val); let best = null;
    for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) { const lo = it[i].m, hi = it[j].m, edge = lo.bb - hi.ba - fee(1 - lo.bb) - fee(hi.ba); if (edge > R.minLadder && (!best || edge > best.edge)) best = { kind: 'ladder', key: lo.s + '|' + hi.s, edge, lo, hi, label: key.split('|')[0] }; }
    if (best) out.push(best); }
  return out.sort((a, b) => b.edge - a.edge);
}

/* ---------- 2. one-winner sets ---------- */
function setGaps(M) {
  const G = new Map(); for (const m of M) { if (m.t !== 'futures' && m.t !== 'election') continue; const k = m.ev + '|' + m.q; if (!G.has(k)) G.set(k, []); G.get(k).push(m); }
  const out = [];
  for (const [k, v] of G) { if (v.length < 3 || v.length > 40 || !/winner|champion/i.test(v[0].q) || /leader|most |first|series|qualif/i.test(v[0].q) || v.some(m => !(m.ba > 0))) continue;
    const sa = v.reduce((n, m) => n + m.ba, 0), edge = 1 - sa - v.reduce((n, m) => n + fee(m.ba), 0); if (edge > R.minSet) out.push({ kind: 'set', key: k, edge, legs: v, label: v[0].q }); }
  return out.sort((a, b) => b.edge - a.edge);
}

/* ---------- 3. underdogs ---------- */
function dogs(M, now) {
  const best = new Map();
  for (const m of M) { if (!DOGT.test(m.t) || !(m.bb > 0 && m.ba > 0) || m.ba - m.bb > R.dogSpread || m.gs < now + R.dogStart[0] || m.gs > now + R.dogStart[1]) continue;
    for (const [side, px] of [['yes', m.ba], ['no', 1 - m.bb]]) { if (px < R.dogLo || px >= R.dogHi) continue; const k = m.ev + '|' + m.t, d = Math.abs(px - .12);
      if (!best.has(k) || d < best.get(k).d) best.set(k, { kind: 'dog', key: m.s, side, px, m, d, label: m.q }); } }
  return [...best.values()].sort((a, b) => a.d - b.d);
}

/* ---------- scanning + gap persistence ---------- */
let CUR = { ladder: [], set: [], dog: [], stats: {}, t: 0 }; const SEEN = new Map(), HIST = []; let scanErr = '';
async function scan() {
  const evs = await events(), M = flat(evs), now = Date.now(), L = ladders(M);
  const gaps = [...ladderGaps(L, now), ...setGaps(M)], live = new Set(gaps.map(g => g.key));
  for (const g of gaps) { const s = SEEN.get(g.key); if (s) { s.last = now; s.edge = g.edge; } else SEEN.set(g.key, { first: now, last: now, edge: g.edge, kind: g.kind, label: g.label, peak: g.edge }); const z = SEEN.get(g.key); z.peak = Math.max(z.peak, g.edge); }
  for (const [k, s] of SEEN) if (!live.has(k) && now - s.last > 9e4) { HIST.unshift({ kind: s.kind, label: s.label, edge: s.peak, lasted: s.last - s.first, gone: now }); SEEN.delete(k); }
  if (HIST.length > 40) HIST.length = 40;
  CUR = { ladder: gaps.filter(g => g.kind === 'ladder'), set: gaps.filter(g => g.kind === 'set'), dog: dogs(M, now), t: now, stats: { events: evs.length, markets: M.length, ladders: L.size } };
  scanErr = ''; return CUR;
}

/* ---------- per user ---------- */
async function open(uid) {
  await db.q("INSERT INTO edgebot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM edgebot WHERE uid=$1', [uid]), c = J(row.cfg, {});
  return { row, cfg: { ladder: c.ladder > 0 ? c.ladder : DEF.ladder, set: c.set > 0 ? c.set : DEF.set, dog: c.dog > 0 ? c.dog : DEF.dog } };
}
async function equity(row) { const o = await db.one("SELECT coalesce(sum(cost),0) AS c FROM edgetrades WHERE uid=$1 AND status='open'", [row.uid]); return Number(row.paper) + Number(o.c); }
async function record(row, strat, ref, label, legs, qty, gs) { // debit the paper account and store the position
  const cost = legs.reduce((n, l) => n + (l.px + fee(l.px)) * qty, 0), d = await db.q('UPDATE edgebot SET paper=paper-$2 WHERE uid=$1 AND paper>=$2 RETURNING paper', [row.uid, cost]); if (!d.length) return false; row.paper = Number(d[0].paper);
  await db.q('INSERT INTO edgetrades (id, uid, ts, strat, ref, label, legs, qty, cost, status, gs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [crypto.randomBytes(8).toString('hex'), row.uid, Date.now(), strat, ref, label.slice(0, 120), JSON.stringify(legs), qty, cost, 'open', gs || 0]); return true;
}
const openCount = (uid, strat) => db.one("SELECT count(*)::int AS n FROM edgetrades WHERE uid=$1 AND strat=$2 AND status='open'", [uid, strat]).then(r => r.n);
// fill a list of legs one after another, thinnest first, re-quoting each next leg fresh; stop and leave the rest unhedged if the price ran away
async function fillLegs(plan, qty, okAfter) { // plan: [{s, side, px, depth, q}] -> filled legs
  const order = plan.slice().sort((a, b) => a.depth - b.depth), done = [];
  for (let i = 0; i < order.length; i++) { const l = order[i];
    if (i > 0) { const q = await P.bbo(l.s); if (!q.open) break; const px = l.side === 'yes' ? q.ask : 1 - q.bid; if (!(px > 0 && px < 1)) break; l.px = px; if (!okAfter(done, order.slice(i))) break; }
    done.push({ s: l.s, side: l.side, px: l.px }); }
  return done;
}
async function enterLadder(row, cfg, g) {
  if (await db.one('SELECT id FROM edgetrades WHERE uid=$1 AND ref=$2', [row.uid, g.key]) || await openCount(row.uid, 'ladder') >= R.cap.ladder) return;
  const a = await P.bbo(g.lo.s), b = await P.bbo(g.hi.s); if (!a.open || !b.open || !(a.bid > 0 && b.ask > 0)) return;
  const edge = a.bid - b.ask - fee(1 - a.bid) - fee(b.ask); if (!(edge >= R.minLadder)) return;
  const eq = await equity(row), per = (1 - a.bid) + b.ask + fee(1 - a.bid) + fee(b.ask), shares = Math.min(a.bidShares || 0, b.askShares || 0);
  const qty = Math.min(R.maxQty, Math.floor(eq * cfg.ladder / 100 / per), Math.floor(shares * R.share)); if (qty < 1) return;
  const legs = await fillLegs([{ s: g.lo.s, side: 'no', px: 1 - a.bid, depth: a.bidShares }, { s: g.hi.s, side: 'yes', px: b.ask, depth: b.askShares }], qty,
    (done, rest) => 1 - done.reduce((n, l) => n + l.px + fee(l.px), 0) - rest.reduce((n, l) => n + l.px + fee(l.px), 0) >= R.abort);
  if (legs.length) await record(row, 'ladder', g.key, g.label, legs, qty, g.lo.gs);
}
async function enterSet(row, cfg, g) {
  if (await db.one('SELECT id FROM edgetrades WHERE uid=$1 AND ref=$2 AND ts>$3', [row.uid, g.key, Date.now() - 36e5]) || await openCount(row.uid, 'set') >= R.cap.set) return;
  const qs = []; for (const m of g.legs) { const q = await P.bbo(m.s); if (!q.open || !(q.ask > 0)) return; qs.push({ s: m.s, side: 'yes', px: q.ask, depth: q.askShares || 0, settle: q.settle }); }
  const sett = qs.reduce((n, l) => n + l.settle, 0); if (!(Math.abs(sett - 1) <= .03)) return; // the exchange's own reference prices must add to exactly 1: proof the set is complete
  const per = qs.reduce((n, l) => n + l.px + fee(l.px), 0); if (1 - per < R.minSet) return;
  const eq = await equity(row), qty = Math.min(R.maxQty, Math.floor(eq * cfg.set / 100 / per), Math.floor(Math.min(...qs.map(l => l.depth)) * R.share)); if (qty < 1) return;
  const legs = await fillLegs(qs, qty, (done, rest) => 1 - done.reduce((n, l) => n + l.px + fee(l.px), 0) - rest.reduce((n, l) => n + l.px + fee(l.px), 0) >= R.abort);
  if (legs.length) await record(row, 'set', g.key, g.label, legs, qty, g.legs[0].gs);
}
async function enterDog(row, cfg, g) {
  if (await db.one('SELECT id FROM edgetrades WHERE uid=$1 AND ref=$2', [row.uid, g.key]) || await openCount(row.uid, 'dog') >= R.cap.dog) return;
  const q = await P.bbo(g.m.s); if (!q.open || !(q.bid > 0 && q.ask > 0) || q.ask - q.bid > R.dogSpread) return;
  const px = g.side === 'yes' ? q.ask : 1 - q.bid; if (!(px >= R.dogLo && px < R.dogHi)) return;
  const eq = await equity(row), qty = Math.max(1, Math.floor(eq * cfg.dog / 100 / (px + fee(px)))); if (qty * (px + fee(px)) > row.paper) return;
  await record(row, 'dog', g.key, g.label, [{ s: g.m.s, side: g.side, px }], qty, g.m.gs);
}
let execBusy = false;
async function execute(cur) {
  if (execBusy) return; execBusy = true;
  try { const rows = await db.q('SELECT b.* FROM edgebot b JOIN users u ON u.id=b.uid WHERE b.enabled=true AND u.verified=true');
    for (const r of rows) { const { cfg } = await open(r.uid);
      for (const g of cur.ladder.slice(0, 3)) await enterLadder(r, cfg, g).catch(e => console.error('edge ladder', e.message));
      for (const g of cur.set.slice(0, 2)) await enterSet(r, cfg, g).catch(e => console.error('edge set', e.message));
      for (const g of cur.dog.slice(0, 4)) await enterDog(r, cfg, g).catch(e => console.error('edge dog', e.message)); }
  } finally { execBusy = false; }
}

/* ---------- settlement ---------- */
async function settle() {
  const open = await db.q("SELECT * FROM edgetrades WHERE status='open'"), res = new Map();
  for (const t of open) { const legs = J(t.legs, []); if (Date.now() < Number(t.gs) + 30 * 6e4) continue; let all = true, pay = 0;
    for (const l of legs) { if (!res.has(l.s)) { const m = await P.marketRaw(l.s); let y = null; if (m && /RESOLVED/.test(m.status || '')) { const op = Array.isArray(m.outcomePrices) ? m.outcomePrices : J(m.outcomePrices, null); if (op && Number.isFinite(Number(op[0]))) y = Number(op[0]); } res.set(l.s, y); }
      const y = res.get(l.s); if (y === null) { all = false; break; } pay += t.qty * (l.side === 'yes' ? y : 1 - y); }
    if (!all) continue; const pnl = pay - Number(t.cost);
    const d = await db.q("UPDATE edgetrades SET status=$2, payoff=$3, pnl=$4, settledts=$5 WHERE id=$1 AND status='open' RETURNING id", [t.id, pnl > 0 ? 'won' : 'lost', pay, pnl, Date.now()]);
    if (d.length && pay) await db.q('UPDATE edgebot SET paper=paper+$2 WHERE uid=$1', [t.uid, pay]); }
}

/* ---------- loop ---------- */
let busy = false, lastScan = 0, lastSettle = 0, lastPub = 0;
async function tick() { // runner: every second; scans every 60s, settles every 2 minutes
  if (busy) return; busy = true;
  try {
    if (Date.now() - lastScan >= 6e4) { lastScan = Date.now(); try { const cur = await scan(); execute(cur).catch(() => {}); } catch (e) { scanErr = e.message; } }
    if (Date.now() - lastSettle >= 12e4) { lastSettle = Date.now(); await settle().catch(e => { scanErr = e.message; }); }
    if (Date.now() - lastPub > 5e3 && CUR.t) { lastPub = Date.now(); const f = g => ({ kind: g.kind, label: g.label, edge: g.edge, key: g.key, age: SEEN.get(g.key) ? Date.now() - SEEN.get(g.key).first : 0 });
      await S.set('edgelive', JSON.stringify({ t: Date.now(), scanned: CUR.t, err: scanErr, stats: CUR.stats, gaps: [...CUR.ladder.slice(0, 8), ...CUR.set.slice(0, 5)].map(f), dogs: CUR.dog.length, hist: HIST.slice(0, 15) })).catch(() => {}); }
  } finally { busy = false; }
}
async function stats(uid) {
  const rows = await db.q("SELECT strat, count(*)::int AS n, sum(CASE WHEN status='won' THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN status='lost' THEN 1 ELSE 0 END)::int AS l, coalesce(sum(pnl),0) AS pnl, coalesce(sum(CASE WHEN status='open' THEN cost ELSE 0 END),0) AS openc, sum(CASE WHEN status='open' THEN 1 ELSE 0 END)::int AS nopen FROM edgetrades WHERE uid=$1 GROUP BY strat", [uid]);
  const o = {}; for (const s of ['ladder', 'set', 'dog']) { const r = rows.find(x => x.strat === s); o[s] = { n: r?.n || 0, won: r?.w || 0, lost: r?.l || 0, pnl: Number(r?.pnl || 0), open: Number(r?.openc || 0), nopen: r?.nopen || 0 }; } return o;
}
module.exports = { DEF, R, fee, ladders, ladderGaps, setGaps, dogs, flat, scan, execute, settle, tick, open, stats, enterLadder, enterSet, enterDog };
