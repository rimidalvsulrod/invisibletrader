// Strategy Lab: one framework for many paper bots. Each strategy (api/_lib/lab/*.js) is a set of written rules that turns market data into trades.
// The same function drives the backtest, the chart and the bot: the bot's paper account simply records the trades the rules make, as they happen,
// so what it does is exactly what the backtest measures. Paper only: every bot has its own simulated account. No broker, no real orders.
//   kind 'bars': intraday rules on candles (NQ / ES futures, SPY, BTC). One position at a time, conservative fills (see runBars).
//   kind 'port': daily portfolio rules (target weights, rebalanced on schedule).
const crypto = require('crypto'), Y = require('./yahoo'), db = require('./db'), S = require('./settings'), P = require('./powell'), PBK = require('./paperbroker');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
const ID = () => crypto.randomBytes(8).toString('hex'), DAY_LOSS = .03, START = 25000;
const UNIT = { // how a position in each instrument is sized and charged
  NQ: { mult: 20, fee: 2.25, tick: .25, micro: 'MNQ' }, MNQ: { mult: 2, fee: .62, tick: .25 }, ES: { mult: 50, fee: 2.25, tick: .25, micro: 'MES' }, MES: { mult: 5, fee: .62, tick: .25 },
  stock: { mult: 1, fee: 0, tick: .01, slip: .0002, lev: 2 }, crypto: { mult: 1, fee: 0, tick: .01, slip: .0002, feePct: .0006, lev: 2 } };
const unitOf = sym => UNIT[sym] || (/^(BTC|ETH)/.test(sym) ? UNIT.crypto : UNIT.stock);

/* ---------- the shared order engine (used by every 'bars' strategy) ----------
   Walks closed candles b[i0..i1] holding at most one order or position. gen(i) is asked on each closed candle while flat, inside the entry window, and
   may arm an order: { dir: 1|-1, entry: price (limit) | null (market: fills at the next candle's open), stop, target, expire (candles), through (candle -> true
   cancels a limit), hold (max candles in the trade), why, level }. Fills are conservative: a candle that touches both the stop and the target counts as the stop,
   only the stop can hit on the entry candle, a stop or a market order slips one tick, a gap through the stop fills at the open, and a limit that is never
   touched is never filled. o: { slip, win(x,i), flat(x,i) -> close at this candle, max: trades per run }. */
function runBars(b, i0, i1, o, gen) {
  const trades = [], events = []; let order = null, pos = null, n = 0;
  const close = (i, px, why) => { Object.assign(pos, { xi: i, exitT: b[i].t, exit: px, why }); trades.push(pos); events.push({ i, type: 'exit', dir: pos.dir, p: px, why }); pos = null; };
  for (let i = i0; i <= i1; i++) {
    const x = b[i];
    if (pos) { const st = pos.dir === 1 ? x.l <= pos.stop : x.h >= pos.stop, tg = pos.target != null && (pos.dir === 1 ? x.h >= pos.target : x.l <= pos.target);
      if (st) close(i, pos.dir === 1 ? Math.min(x.o, pos.stop) - o.slip : Math.max(x.o, pos.stop) + o.slip, 'stop');
      else if (tg && i > pos.fi) close(i, pos.target, 'target');
      else if (o.flat(x, i)) close(i, x.c, 'flat at the close');
      else if (pos.hold && i - pos.fi >= pos.hold) close(i, x.c, 'time limit'); }
    if (order && !pos) {
      if (order.entry == null) { pos = { ...order, entry: x.o + order.dir * o.slip, fi: i, entryT: x.t }; order = null; n++; events.push({ i, type: 'fill', dir: pos.dir, p: pos.entry });
        if (pos.dir === 1 ? x.l <= pos.stop : x.h >= pos.stop) close(i, pos.dir === 1 ? Math.min(x.o, pos.stop) - o.slip : Math.max(x.o, pos.stop) + o.slip, 'stop'); }
      else { const touch = order.dir === 1 ? x.l <= order.entry : x.h >= order.entry, ran = !touch && order.target != null && (order.dir === 1 ? x.h >= order.target : x.l <= order.target);
        if (touch && o.win(x, i)) { pos = { ...order, fi: i, entryT: x.t }; order = null; n++; events.push({ i, type: 'fill', dir: pos.dir, p: pos.entry });
          if (pos.dir === 1 ? x.l <= pos.stop : x.h >= pos.stop) close(i, pos.stop - pos.dir * o.slip, 'stop'); }
        else if (ran || (order.through && order.through(x)) || i >= order.expire || !o.win(x, i)) { events.push({ i, type: 'cancel', dir: order.dir, why: ran ? 'price ran to the target without a pullback' : order.through && order.through(x) ? 'closed through the zone' : 'expired' }); order = null; } } }
    if (!pos && !order && n < (o.max ?? Infinity) && o.win(x, i) && !o.flat(x, i)) { const g = gen(i); if (g) { order = { ...g, mi: i, armT: x.t, expire: i + (g.expire ?? 12) }; events.push({ i, type: 'arm', dir: g.dir, p: g.entry ?? x.c, why: g.why }); } }
  }
  return { trades, events, order, pos };
}

/* ---------- data: 5-minute candles with volume (free Yahoo Finance, all hours), America/New_York ---------- */
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; MimicLab/1.0)', accept: 'application/json' }, YSYM = { NQ: 'NQ=F', ES: 'ES=F', SPY: 'SPY', VIX: '^VIX' }, BC = new Map();
async function bars5(sym, ttl = 10e3, range = '60d') {
  const ys = YSYM[sym]; if (!ys) throw Object.assign(new Error('unknown symbol ' + sym), { status: 400 }); const key = sym + range, hit = BC.get(key); if (hit && Date.now() - hit.at < ttl) return hit.v;
  const j = await Y.get(`/v8/finance/chart/${encodeURIComponent(ys)}?range=${range}&interval=5m&includePrePost=true`, 45e3);
  const res = j?.chart?.result?.[0]; if (!res?.timestamp) throw new Error('Yahoo Finance returned no candles'); const q = res.indicators.quote[0], out = [];
  res.timestamp.forEach((ts, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].some(x => x == null)) return; const e = P.et(ts); out.push({ t: ts * 1000, date: e.date, m: e.m, o, h, l, c, v: q.volume[i] || 0 }); });
  BC.set(key, { at: Date.now(), v: out }); if (BC.size > 8) BC.delete(BC.keys().next().value); return out;
}
const closedUpto = (b, now = Date.now(), len = 3e5) => { const k = b.findIndex(x => x.t + len + 2e4 > now); return k < 0 ? b.length : k; }; // candles that have finished (20s settle)

/* ---------- registry ---------- */
const FAM = [], REG = {}; // filled at the end of this file (the strategy files require this one)
const strat = id => { const s = REG[id]; if (!s) throw Object.assign(new Error('unknown strategy'), { status: 400 }); return s; };
const COMMON = { bars: [{ k: 'risk', label: 'Risk per trade', min: .1, max: 2, step: .1, unit: '% risked per trade' }, { k: 'max', label: 'Trades a day', min: 1, max: 6, step: 1, unit: 'max trades a day', int: true }], port: [] };
const params = s => [...(COMMON[s.kind] || []), ...(s.params || [])];
function norm(s, c = {}) { const d = { risk: .5, max: 2, ...s.defaults }, out = {};
  for (const p of params(s)) { const v = clamp(c[p.k], p.min, p.max, d[p.k]); out[p.k] = p.int ? Math.round(v) : v; }
  if (s.syms) out.sym = s.syms.includes(c.sym) ? c.sym : d.sym || s.syms[0]; for (const [k, v] of Object.entries(s.choices || {})) out[k] = v.includes(c[k]) ? c[k] : d[k]; return out; }

/* ---------- accounts and the ledger ---------- */
async function open(uid, id) {
  const s = strat(id); await db.q("INSERT INTO labbot (uid, strat, cfg, paper, updated) VALUES ($1,$2,'{}',$3,$4) ON CONFLICT (uid, strat) DO NOTHING", [uid, id, START, Date.now()]);
  const row = await db.one('SELECT * FROM labbot WHERE uid=$1 AND strat=$2', [uid, id]); return { s, row, cfg: norm(s, J(row.cfg, {})) };
}
async function account(uid, id, start) { // realized equity: start + every closed trade (open trades are marked by the tab from the live price)
  const r = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<=0 THEN 1 ELSE 0 END)::int AS l FROM labtrades WHERE uid=$1 AND strat=$2 AND status='closed'", [uid, id]);
  return { start: Number(start), pnl: Number(r.pnl), equity: Number(start) + Number(r.pnl), n: r.n, won: r.w || 0, lost: r.l || 0 };
}
const pnlOf = (sym, dir, qty, entry, exit) => { const u = unitOf(sym), d = dir === 'long' ? 1 : -1;
  if (UNIT[sym]) return (exit - entry) * d * qty * u.mult - 2 * u.fee * qty; // futures: points x multiplier, commissions both ways
  const gross = (exit - entry) * d * qty, cost = (u.slip + (u.feePct || 0)) * qty * (entry + exit); return gross - cost; }; // stocks / crypto: slippage (+ exchange fee) both ways
function size(sym, eq, risk, entry, stop) { // dollars at risk / the stop distance; futures switch to micros when a mini would risk too much
  const dist = Math.abs(entry - stop), R$ = eq * risk / 100; if (!(dist > 0)) return null;
  if (UNIT[sym] && UNIT[sym].micro) { let q = Math.floor(R$ / (dist * UNIT[sym].mult)); if (q >= 1) return { sym, qty: Math.min(10, q) }; const m = UNIT[sym].micro; q = Math.floor(R$ / (dist * UNIT[m].mult)); return q >= 1 ? { sym: m, qty: Math.min(50, q) } : { why: `the stop is ${dist.toFixed(2)} points away: one ${m} risks $${(dist * UNIT[m].mult).toFixed(0)}, over the $${R$.toFixed(0)} limit` }; }
  const u = unitOf(sym), cap = eq * u.lev / entry; let q = Math.min(R$ / dist, cap); q = u === UNIT.crypto ? Math.floor(q * 1e4) / 1e4 : Math.floor(q); return q > 0 ? { sym, qty: q } : { why: 'the account is too small for one unit' };
}
// record the rules' trades for one user: new entries open (sized by the risk dial), finished ones close. Every trade the rules make is taken (the paper fill is the
// rule's own price), except when a written limit says no: trades a day, the 3% daily loss limit, or a stop too wide for the account. Those are recorded with the reason.
async function sync(uid, id, cfg, start, trades, day, since) {
  const rows = await db.q('SELECT * FROM labtrades WHERE uid=$1 AND strat=$2 AND day=$3', [uid, id, day]), by = new Map(rows.map(r => [r.key, r])), out = [];
  for (const T of trades) {
    if (T.entryT < since) continue; // the bot was off when the rules took this one
    const key = T.key, r = by.get(key), dir = T.dir === 1 ? 'long' : 'short';
    if (!r) {
      const taken = rows.filter(x => x.status !== 'skip').length + out.filter(x => x.status !== 'skip').length, acct = await account(uid, id, start), lost = Number((await db.one("SELECT coalesce(sum(pnl),0) AS p FROM labtrades WHERE uid=$1 AND strat=$2 AND day=$3 AND status='closed'", [uid, id, day])).p);
      let why = null, z = null; if (taken >= cfg.max) why = `already ${cfg.max} trade${cfg.max == 1 ? '' : 's'} today`; else if (lost <= -DAY_LOSS * acct.equity) why = 'daily loss limit (3%) reached'; else { z = size(T.sym, acct.equity, cfg.risk, T.entry, T.stop); if (!z || z.why) why = z?.why || 'no size'; }
      const row = { id: ID(), uid, strat: id, key, ts: T.entryT, day, sym: z && !why ? z.sym : T.sym, dir, qty: z && !why ? z.qty : null, entry: T.entry, stop: T.stop, tp: T.target ?? null, status: why ? 'skip' : 'open', reason: why, why: T.why || null };
      const ins = await db.q('INSERT INTO labtrades (id, uid, strat, key, ts, day, sym, dir, qty, entry, stop, tp, status, reason, why) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (uid, strat, key) DO NOTHING RETURNING id',
        [row.id, uid, id, key, row.ts, day, row.sym, dir, row.qty, row.entry, row.stop, row.tp, row.status, row.reason, row.why]);
      const mine = await db.one('SELECT * FROM labtrades WHERE uid=$1 AND strat=$2 AND key=$3', [uid, id, key]); if (!ins.length || mine.id !== row.id) continue; // another process recorded it first
      out.push(mine); if (row.status === 'open' && T.exitT != null) await closeRow(mine, T.exit, T.why, T.exitT);
    } else if (r.status === 'open' && T.exitT != null) await closeRow(r, T.exit, T.why, T.exitT);
  }
  return out;
}
async function closeRow(r, px, why, t = Date.now()) {
  const pnl = pnlOf(r.sym, r.dir, Number(r.qty), Number(r.entry), px);
  await db.q("UPDATE labtrades SET status='closed', exitp=$2, pnl=$3, reason=$4, exitts=$5 WHERE id=$1 AND status='open'", [r.id, px, pnl, why, t]);
}

/* ---------- running a 'bars' strategy ---------- */
// ctx for one strategy at one moment: { b (candles), upto (closed candles), day, extra (strategy data) }. s.day(ctx, cfg) -> { trades, order, pos, draw, status }
async function ctxFor(s, sym, opts = {}) { const x = await s.data(sym, opts); return x; }
function liveTrades(res, sym, id) { // finished trades + the open one, with stable keys
  const all = [...res.trades, ...(res.pos ? [res.pos] : [])]; return all.map(T => ({ ...T, sym, key: `${id}:${sym}:${T.entryT}:${T.dir}` })); }
function stats(trades, sym) { // backtest summary in R and in dollars per contract (micro futures, 100 shares, or 1 BTC)
  const u = unitOf(UNIT[sym]?.micro || sym), unit = UNIT[sym]?.micro ? 1 : /^(BTC|ETH)/.test(sym) ? 1 : 100, rs = [], nets = [];
  for (const t of trades) { const R = Math.abs(t.entry - t.stop); if (!(R > 0) || t.exit == null) continue; const pts = (t.exit - t.entry) * t.dir; rs.push(pts / R); nets.push(pnlOf(UNIT[sym]?.micro || sym, t.dir === 1 ? 'long' : 'short', unit, t.entry, t.exit)); }
  const sum = a => a.reduce((x, y) => x + y, 0), n = rs.length; let pk = 0, run = 0, dd = 0; for (const r of rs) { run += r; pk = Math.max(pk, run); dd = Math.min(dd, run - pk); }
  const gw = sum(nets.filter(x => x > 0)), gl = -sum(nets.filter(x => x < 0)), srt = rs.slice().sort((a, b) => b - a), cut = n >= 30 ? 5 : 1, rest = srt.slice(cut);
  return { n, win: n ? rs.filter(r => r > 0).length / n : 0, avgR: n ? sum(rs) / n : 0, totalR: sum(rs), net: sum(nets), pf: gl ? gw / gl : gw ? null : 0, maxDD: dd, unit: UNIT[sym]?.micro ? '1 ' + UNIT[sym].micro : /^(BTC|ETH)/.test(sym) ? '1 ' + sym.slice(0, 3) : '100 shares', exBest: rest.length ? sum(rest) / rest.length : null, cut };
}

/* ---------- the tab's state, chart and backtest ---------- */
async function state(uid, id) {
  const { s, row, cfg } = await open(uid, id), acct = await account(uid, id, row.paper);
  const trades = (await db.q('SELECT id, ts, day, sym, dir, qty, entry, stop, tp, status, exitp, pnl, reason, why, exitts FROM labtrades WHERE uid=$1 AND strat=$2 ORDER BY ts DESC LIMIT 100', [uid, id])).map(t => ({ ...t, ts: Number(t.ts), exitts: t.exitts == null ? null : Number(t.exitts) }));
  let view = null, viewError = null; try { view = await s.view(cfg, { uid }); } catch (e) { viewError = e.message; }
  const marks = { ...(view?.sym && view.last != null ? { [view.sym]: view.last } : {}), ...(view?.marks || {}) }; // open trades marked at the live price
  for (const t of trades) if (t.status === 'open' && t.qty != null) { const px = marks[t.sym] ?? marks[t.sym.replace(/^M(?=NQ|ES)/, '')]; if (px != null) t.upnl = pnlOf(t.sym, t.dir, Number(t.qty), Number(t.entry), px); }
  return { id, meta: meta(s), cfg, enabled: row.enabled, account: acct, trades, view, viewError, now: Date.now() };
}
const meta = s => ({ id: s.id, name: s.name, group: s.group, kind: s.kind, blurb: s.blurb, how: s.how, data: s.dataNote, params: params(s), syms: s.syms || null, choices: s.choices || null, choiceLabels: s.choiceLabels || null, bt: s.bt || null, honest: s.honest || null });
/* ---------- the all-bots dashboard ---------- */
const OLD = [ // [route, name, group, bot table, trades table, has its own paper balance]
  ['btc', 'BTC Up or Down', 'Crypto', 'btcbot', 'btctrades', 1], ['meme', 'Meme Radar', 'Crypto', 'membot', 'memetrades', 1], ['edge', 'Edge Lab', 'Prediction markets', 'edgebot', 'edgetrades', 1],
  ['news', 'Newsflash', 'Stocks', 'nbot', 'ntrades'], ['swing', 'Swing Trader', 'Stocks', 'sbot', 'swingtrades'], ['powell', 'Powell Strategy', 'Futures', 'pbot', 'powelltrades'],
  ['supertrend', 'Supertrend Bot', 'Futures', 'stbot', 'sttrades'], ['gex', 'GEX Levels', 'Options', 'gexbot', 'gextrades'], ['sweep', 'Sweep Bot', 'ICT', 'ictbot', 'icttrades']];
const CLOSED = "pnl IS NOT NULL AND status NOT IN ('open','skip','cancelled','note')";
async function tstats(table, uid, extra = '', args = []) {
  const r = await db.one(`SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w FROM ${table} WHERE uid=$1 ${extra} AND ${CLOSED}`, [uid, ...args]);
  const o = await db.one(`SELECT count(*)::int AS n FROM ${table} WHERE uid=$1 ${extra} AND status='open'`, [uid, ...args]);
  const last = (await db.q(`SELECT pnl FROM ${table} WHERE uid=$1 ${extra} AND ${CLOSED} ORDER BY ts DESC LIMIT 40`, [uid, ...args])).map(x => Number(x.pnl)).reverse();
  return { n: r.n, pnl: Number(r.pnl), won: r.w || 0, open: o.n, curve: last.reduce((a, x) => (a.push((a[a.length - 1] || 0) + x), a), []) };
}
async function dash(uid) {
  const bots = [];
  for (const [route, name, group, bt, tt, own] of OLD) { try {
    const row = await db.one(`SELECT * FROM ${bt} WHERE uid=$1`, [uid]).catch(() => null), st = await tstats(tt, uid), start = own && row ? Number(row.paperstart) : null;
    bots.push({ route, name, group, enabled: !!row?.enabled, start, balance: start != null ? start + st.pnl : null, ...st }); } catch (e) {} }
  const rows = new Map((await db.q('SELECT * FROM labbot WHERE uid=$1', [uid])).map(r => [r.strat, r]));
  for (const s of Object.values(REG)) { const r = rows.get(s.id), st = await tstats('labtrades', uid, 'AND strat=$2', [s.id]), start = r ? Number(r.paper) : START;
    bots.push({ route: 'lab/' + s.id, name: s.name, group: s.group, enabled: !!r?.enabled, start, balance: start + st.pnl, ...st }); }
  try { const MT = require('./manual'); for (const [a, name, route] of [['me', 'Manual Trading (you)', 'trade'], ['opp', 'Opposite Bot', 'trade']]) { const r = await db.one('SELECT * FROM mtacct WHERE uid=$1 AND acct=$2', [uid, a]); if (!r) continue;
    const st = await db.one("SELECT count(*)::int AS n, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<>0 THEN 1 ELSE 0 END)::int AS c FROM mtfill WHERE uid=$1 AND acct=$2", [uid, a]), e = await MT.equity(uid, a);
    const last = (await db.q('SELECT pnl, fee FROM mtfill WHERE uid=$1 AND acct=$2 ORDER BY ts DESC LIMIT 40', [uid, a])).map(x => Number(x.pnl) - Number(x.fee)).reverse();
    bots.unshift({ route, name, group: a === 'me' ? 'Manual' : 'Bot', enabled: a === 'me' ? st.n > 0 : r.enabled, start: e.start, balance: e.equity, pnl: e.equity - e.start, n: st.c || 0, won: st.w || 0, open: e.positions.length, curve: last.reduce((x, y) => (x.push((x[x.length - 1] || 0) + y), x), []) }); } } catch (e) {}
  return { bots, now: Date.now() };
}
async function prefs(uid, body, user, op) {
  if (op === 'prefs') { if (body.answers) { await S.set('prefs:' + uid, JSON.stringify({ ...body.answers, t: Date.now() })); return { ok: true }; } return { answers: J(await S.get('prefs:' + uid), null) }; }
  if (!user?.admin) throw Object.assign(new Error('admins only'), { status: 403 }); // what everyone answered, counted
  const all = (await db.q("SELECT v FROM settings WHERE k LIKE 'prefs:%'")).map(r => J(r.v, {})), count = {};
  for (const a of all) for (const [k, v] of Object.entries(a)) if (k !== 't') for (const x of [].concat(v)) { count[k] ||= {}; count[k][x] = (count[k][x] || 0) + 1; }
  return { n: all.length, count };
}
async function api(uid, op, body, q, user) {
  if (op === 'dash') return dash(uid); if (op === 'prefs' || op === 'prefsum') return prefs(uid, body, user, op);
  const id = String(q.id || body.id || ''), s = strat(id);
  switch (op) {
    case 'state': return state(uid, id);
    case 'bt': { const { cfg } = await open(uid, id); if (!s.backtest) throw Object.assign(new Error('no backtest for this strategy'), { status: 400 }); return s.backtest(cfg, clamp(body.days, 1, 3650, s.bt?.def || 40)); }
    case 'cfg': { const { row, cfg } = await open(uid, id), next = norm(s, { ...cfg, ...(body.cfg || {}) }); await db.q('UPDATE labbot SET cfg=$3, updated=$4 WHERE uid=$1 AND strat=$2', [uid, id, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': await open(uid, id); await db.q('UPDATE labbot SET enabled=true, since=$3, updated=$3 WHERE uid=$1 AND strat=$2', [uid, id, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE labbot SET enabled=false, updated=$3 WHERE uid=$1 AND strat=$2', [uid, id, Date.now()]); return { ok: true };
    case 'reset': { const amt = clamp(body.amount, 100, 1e7, START); await open(uid, id); await db.q('DELETE FROM labtrades WHERE uid=$1 AND strat=$2', [uid, id]); await db.q('UPDATE labbot SET paper=$3, updated=$4, since=$4 WHERE uid=$1 AND strat=$2', [uid, id, amt, Date.now()]); return { ok: true }; }
    case 'list': return { strats: Object.values(REG).map(meta) };
    default: throw Object.assign(new Error('unknown op'), { status: 400 });
  }
}

/* ---------- the runner: every 10 seconds ---------- */
let busy = false, last = 0;
async function tick() {
  if (busy || Date.now() - last < 1e4) return; busy = true; last = Date.now();
  try {
    const rows = await db.q("SELECT b.* FROM labbot b JOIN users u ON u.id=b.uid WHERE b.enabled=true AND u.verified=true");
    for (const r of rows) { const s = REG[r.strat]; if (!s || !s.live) continue; try { await s.live(r, norm(s, J(r.cfg, {})), { sync, closeRow, account, open }); } catch (e) { console.error('lab', r.strat, r.uid.slice(0, 6), e.message); } }
    for (const f of FAM) if (f.background) await f.background().catch(e => console.error('lab bg', e.message));
  } finally { busy = false; }
}
function start() { for (const f of FAM) if (f.start) f.start(); }
module.exports = { REG, UNIT, unitOf, runBars, bars5, closedUpto, liveTrades, stats, sync, closeRow, account, open, api, tick, start, norm, pnlOf, size, J, clamp, ID, START };
for (const f of ['ictfam', 'optfam', 'quantfam', 'flowfam']) { let m; try { m = require('./lab/' + f); } catch (e) { if (e.code === 'MODULE_NOT_FOUND' && String(e.message).includes('/lab/' + f)) continue; throw e; } FAM.push(m); for (const s of m.STRATS) REG[s.id] = s; }
