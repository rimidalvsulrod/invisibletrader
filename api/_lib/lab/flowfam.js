// Order-flow family (Strategy Lab): BTC-USD order flow from Coinbase's free public feed, as 1-minute bars. Paper only.
// The 24/7 runner keeps one websocket open (trades + the full level-2 order book) and stores each minute (flowmin): price, taker buy / sell volume,
// a footprint (buy and sell volume per $25 price step), the order-book imbalance near the price, and the biggest resting orders (the heat map).
// Coinbase's "side" on a trade is the MAKER's side, so a taker (aggressive) buy has side = "sell" (checked against the live book).
const L = require('../lab'), db = require('../db');
const STEP = 25, f0 = x => Math.round(x).toLocaleString('en-US'), SESS = [[1, 'Last recorded day'], [3, 'Last 3 days'], [7, 'Every recorded day (up to 7)']];
const day = t => new Date(t).toISOString().slice(0, 10), minOf = t => { const d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

/* ---------- the collector (runner) ---------- */
let ws = null, bids = new Map(), asks = new Map(), cur = null, ready = false, lastPrune = 0, retry = 0;
function connect() {
  if (typeof WebSocket === 'undefined') return console.error('flow: no WebSocket in this Node'); ready = false;
  try { ws = new WebSocket('wss://ws-feed.exchange.coinbase.com'); } catch (e) { return setTimeout(connect, 1e4); }
  ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['matches', 'level2_batch', 'heartbeat'] })); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.type === 'snapshot') { bids = new Map(m.bids.map(([p, s]) => [+p, +s])); asks = new Map(m.asks.map(([p, s]) => [+p, +s])); ready = true; }
    else if (m.type === 'l2update') for (const [sd, p, s] of m.changes) { const bk = sd === 'buy' ? bids : asks; if (+s === 0) bk.delete(+p); else bk.set(+p, +s); }
    else if (m.type === 'match') trade(+m.price, +m.size, m.side === 'sell', Date.parse(m.time)); };
  ws.onclose = () => { ready = false; setTimeout(connect, Math.min(6e4, 2e3 * 2 ** retry++)); }; ws.onerror = () => {};
}
function trade(px, sz, takerBuy, t) {
  const mt = Math.floor(t / 6e4) * 6e4; if (cur && mt > cur.t) { flush(cur).catch(e => console.error('flow flush', e.message)); cur = null; }
  if (!cur) cur = { t: mt, o: px, h: px, l: px, c: px, bv: 0, sv: 0, foot: {} };
  cur.h = Math.max(cur.h, px); cur.l = Math.min(cur.l, px); cur.c = px; if (takerBuy) cur.bv += sz; else cur.sv += sz; const k = Math.floor(px / STEP) * STEP, f = cur.foot[k] || (cur.foot[k] = [0, 0]); f[takerBuy ? 0 : 1] += sz;
}
function bookStats(mid) { // imbalance within 0.1% of the price, and the biggest resting orders within 1% (in $25 steps)
  let bd = 0, ad = 0; const B = new Map(), A = new Map(), lo = mid * .99, hi = mid * 1.01;
  for (const [p, s] of bids) { if (p < lo) continue; if (p >= mid * .999) bd += s; const k = Math.floor(p / STEP) * STEP; B.set(k, (B.get(k) || 0) + s); }
  for (const [p, s] of asks) { if (p > hi) continue; if (p <= mid * 1.001) ad += s; const k = Math.floor(p / STEP) * STEP; A.set(k, (A.get(k) || 0) + s); }
  const all = [...B.values(), ...A.values()].sort((a, b) => a - b), med = all[all.length >> 1] || 0, top = M => [...M].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, s]) => [p, +s.toFixed(3)]);
  return { imb: bd + ad ? +((bd - ad) / (bd + ad)).toFixed(3) : 0, wb: top(B), wa: top(A), med: +med.toFixed(3) };
}
async function flush(c) {
  const x = { ...c, bv: +c.bv.toFixed(4), sv: +c.sv.toFixed(4), foot: Object.fromEntries(Object.entries(c.foot).map(([k, [b, s]]) => [k, [+b.toFixed(4), +s.toFixed(4)]])), ...(ready ? bookStats(c.c) : {}) };
  await db.q('INSERT INTO flowmin (t, data) VALUES ($1,$2) ON CONFLICT (t) DO NOTHING', [c.t, JSON.stringify(x)]);
  if (Date.now() - lastPrune > 36e5) { lastPrune = Date.now(); await db.q('DELETE FROM flowmin WHERE t < $1', [Date.now() - 8 * 864e5]); }
}
function start() { if (!ws) connect(); }

/* ---------- data for the bots ---------- */
const MC = new Map();
async function minutes(d) { // one UTC day of 1-minute bars
  const today = day(Date.now()), h = MC.get(d); if (h && (d !== today || Date.now() - h.at < 2e4)) return h.v; const t0 = Date.parse(d + 'T00:00:00Z');
  const v = (await db.q('SELECT data FROM flowmin WHERE t >= $1 AND t < $2 ORDER BY t', [t0, t0 + 864e5])).map(r => { const x = JSON.parse(r.data); return { ...x, v: x.bv + x.sv, date: d, m: minOf(x.t) }; });
  MC.set(d, { at: Date.now(), v }); if (MC.size > 12) MC.delete(MC.keys().next().value); return v; }
const recDays = async () => { const r = await db.one('SELECT min(t) AS a, max(t) AS b FROM flowmin'); if (!r?.a) return []; const out = []; for (let t = Date.parse(day(Number(r.a)) + 'T00:00:00Z'); t <= Number(r.b); t += 864e5) out.push(day(t)); return out; };

/* ---------- the factory ---------- */
function flow(def) {
  const s = { kind: 'bars', group: 'Order flow', syms: ['BTC'], bt: { opts: SESS, def: 7, unit: 'days' }, dataNote: 'Coinbase BTC-USD public feed (trades and the full order book), recorded minute by minute by the server around the clock. Trades BTC in a simulated account (0.06% fee + 0.02% slippage a side). The backtest replays only what the server has recorded (up to 7 days).', ...def, defaults: { sym: 'BTC', risk: .5, max: 4, ...def.defaults } };
  s.run = (b, cfg, upto = Infinity) => { if (b.length < 40) return { trades: [], events: [], order: null, pos: null, draw: {}, note: 'Collecting order-flow data (needs about 40 minutes).' }; const ctx = { b, cfg, cvd: [] }; let c = 0; for (const x of b) ctx.cvd.push(c += x.bv - x.sv);
    return L.runBars(b, 30, Math.min(b.length - 1, upto - 1), { slip: 0, win: () => true, flat: () => false, max: cfg.max }, i => def.gen(ctx, i)); };
  const fill = r => r; // costs (0.06% fee + 0.02% slippage a side) are charged by the ledger and the backtest stats
  s.backtest = async (cfg, n) => { const ds = (await recDays()).slice(-n), out = []; for (const d of ds) for (const t of fill(s.run(await minutes(d), cfg)).trades) out.push({ ...t, date: d });
    return { sym: 'BTC', from: ds[0], to: ds[ds.length - 1], days: ds.length, ...L.stats(out, 'BTC'), trades: out.slice(-15).reverse().map(t => ({ date: t.date, dir: t.dir, entry: t.entry, exit: t.exit, r: (t.exit - t.entry) * t.dir / Math.abs(t.entry - t.stop), why: t.why })) }; };
  s.view = async cfg => {
    const d = day(Date.now()), b = await minutes(d), r = s.run(b, cfg, b.length), keep = b.slice(-180), off = b.length - keep.length, last = b[b.length - 1];
    if (!last) return { sym: 'BTC', status: 'No order-flow data yet: the server starts recording as soon as it runs (one bar a minute).', bars: [], t: Date.now() };
    const draw = { levels: [], zones: [], lines: [] }; if (def.draw) def.draw(keep, draw, { cvd: (() => { let c = 0; return b.map(x => c += x.bv - x.sv).slice(off); })() });
    const status = r.pos ? `In a ${r.pos.dir === 1 ? 'long' : 'short'} from ${f0(r.pos.entry)}: stop ${f0(r.pos.stop)}, target ${f0(r.pos.target)}.` : r.order ? `Armed: ${r.order.dir === 1 ? 'buy' : 'sell'} at the next minute. ${r.order.why || ''}` : (r.note || def.idle);
    return { sym: 'BTC', status: (Date.now() - last.t > 5 * 6e4 ? 'The feed is behind (last bar ' + new Date(last.t).toISOString().slice(11, 16) + ' UTC). ' : '') + status, last: last.c, t: last.t, bars: keep.map(x => [x.t, x.o, x.h, x.l, x.c, +x.v.toFixed(3)]), draw,
      panes: def.pane ? [def.pane(keep, b, off)] : [], events: r.events.filter(e => e.i >= off).map(e => ({ t: b[e.i].t, type: e.type, dir: e.dir, p: e.p ?? null, why: e.why || null })),
      pos: r.pos ? { dir: r.pos.dir, entry: r.pos.entry, stop: r.pos.stop, target: r.pos.target, t0: r.pos.entryT } : null, order: r.order ? { dir: r.order.dir, entry: r.order.entry, stop: r.order.stop, target: r.order.target, t0: r.order.armT } : null };
  };
  s.live = async (row, cfg, H) => {
    const d = day(Date.now()), b = await minutes(d); // stored minutes are finished minutes
    await H.sync(row.uid, s.id, cfg, row.paper, L.liveTrades(fill(s.run(b, cfg)), 'BTC', s.id), d, Number(row.since || 0));
    for (const t of await db.q("SELECT * FROM labtrades WHERE uid=$1 AND strat=$2 AND status='open' AND day<>$3", [row.uid, s.id, d])) { const bb = await minutes(t.day), T = L.liveTrades(fill(s.run(bb, cfg)), 'BTC', s.id).find(x => x.key === t.key);
      if (T && T.exit != null) await H.closeRow(t, T.exit, T.why, T.exitT); else if (bb.length) { const x = b[0] || bb[bb.length - 1]; await H.closeRow(t, x.o, 'carried over midnight UTC: closed at the next day\'s open', x.t); } } // one UTC day per run
  };
  return s;
}
const RISK = [{ k: 'rr', label: 'Reward to risk', min: 1, max: 4, step: .5, unit: '× reward to risk' }, { k: 'stp', label: 'Stop', min: .1, max: 1, step: .05, unit: '% from the entry' }];
const mk = (b, i, dir, stop, rr, why) => { const e = b[i].c, R = Math.abs(e - stop); if (!(R > 0) || R / e < .001) return null; return { dir, entry: null, stop: +stop.toFixed(2), target: +(e + dir * rr * R).toFixed(2), hold: 60, why }; };
const ema = (b, i, n) => { let e = b[Math.max(0, i - 4 * n)].c; const k = 2 / (n + 1); for (let j = Math.max(0, i - 4 * n); j <= i; j++) e = b[j].c * k + e * (1 - k); return e; };

/* ---------- 1. LV2 imbalance ---------- */
const lv2 = flow({ id: 'lv2', name: 'LV2 Imbalance', icon: 'search', blurb: 'Reads the level-2 order book: when resting bids near the price heavily outweigh the asks for three minutes in a row and price is above its short trend, it buys (and the mirror).',
  how: ['Imbalance = (bid size − ask size) / (bid size + ask size), counting orders within 0.1% of the price, read at the end of each minute.', 'Buy: imbalance above the threshold for 3 minutes in a row and the close above its 15-minute average. Sell short: the mirror.', 'Entry at the next minute\'s open. Stop: the set %. Target: reward-to-risk multiple. At most 1 hour in the trade.'],
  defaults: { th: .4, rr: 1.5, stp: .25 }, params: [{ k: 'th', label: 'Imbalance threshold', min: .1, max: .9, step: .05, unit: 'of the near-price book' }, ...RISK], idle: 'Waiting for a one-sided order book that price agrees with.',
  gen({ b, cfg }, i) { const z = [b[i], b[i - 1], b[i - 2]].map(x => x.imb); if (z.some(v => v == null)) return null; const e = ema(b, i, 15), c = b[i].c;
    if (z.every(v => v >= cfg.th) && c > e) return mk(b, i, 1, c * (1 - cfg.stp / 100), cfg.rr, `Bids outweigh asks ${(z[0] * 100).toFixed(0)}% for 3 minutes`); if (z.every(v => v <= -cfg.th) && c < e) return mk(b, i, -1, c * (1 + cfg.stp / 100), cfg.rr, `Asks outweigh bids ${(-z[0] * 100).toFixed(0)}% for 3 minutes`); return null; },
  pane: keep => ({ name: 'Order-book imbalance (bids − asks, within 0.1%)', short: 'Book', vals: keep.map(x => x.imb ?? null), color: '#4c9aff', h: 60, min: -1, max: 1, fmt: v => v.toFixed(2) }) });
/* ---------- 2. Footprint (stacked imbalances) ---------- */
const foot = flow({ id: 'foot', name: 'Footprint', icon: 'paper', blurb: 'Footprint chart reading: a minute where aggressive buyers beat sellers by 3 to 1 on three or more price steps in a row (a stacked imbalance) marks real demand; it buys the next minute (and the mirror).',
  how: ['Footprint: each minute\'s taker buy and sell volume in $25 price steps.', 'Stacked buy imbalance: 3 or more neighbouring steps where buy volume is at least the set ratio × sell volume, with the candle closing in its upper half. Sell: the mirror.', 'Entry at the next minute\'s open. Stop: one step past the stack. Target: reward-to-risk multiple. At most 1 hour.'],
  defaults: { ratio: 3, rr: 2 }, params: [{ k: 'ratio', label: 'Imbalance ratio', min: 2, max: 6, step: .5, unit: 'buy ÷ sell volume' }, RISK[0]], idle: 'Waiting for a stacked footprint imbalance.',
  gen({ b, cfg }, i) { const x = b[i], ks = Object.keys(x.foot || {}).map(Number).sort((a, c) => a - c); if (ks.length < 3) return null; const up = (x.c - x.l) / ((x.h - x.l) || 1);
    for (const dir of [1, -1]) { let run = [], best = []; for (const k of ks) { const [bv, sv] = x.foot[k], ok = dir === 1 ? bv >= cfg.ratio * Math.max(sv, 1e-4) && bv > .05 : sv >= cfg.ratio * Math.max(bv, 1e-4) && sv > .05; if (ok && (!run.length || k - run[run.length - 1] === STEP)) run.push(k); else run = ok ? [k] : []; if (run.length > best.length) best = run.slice(); }
      if (best.length >= 3 && (dir === 1 ? up > .5 : up < .5)) return mk(b, i, dir, dir === 1 ? best[0] - STEP : best[best.length - 1] + 2 * STEP, cfg.rr, `${best.length} stacked ${dir === 1 ? 'buy' : 'sell'} imbalances ${f0(best[0])} to ${f0(best[best.length - 1] + STEP)}`); }
    return null; },
  pane: keep => ({ name: 'Delta (taker buys − sells, BTC)', short: 'Delta', type: 'bars', vals: keep.map(x => x.bv - x.sv), colors: keep.map(x => x.bv >= x.sv ? 'rgba(48,209,88,.7)' : 'rgba(255,69,58,.7)'), h: 60 }) });
/* ---------- 3. Order flow (CVD divergence) ---------- */
const cvd = flow({ id: 'cvd', name: 'Order Flow CVD', icon: 'wave', blurb: 'Cumulative volume delta divergence: price makes a new 30-minute low but aggressive selling does not (CVD holds a higher low): sellers are being absorbed, so it buys (and the mirror at highs).',
  how: ['CVD: the running total of taker buys minus taker sells since 00:00 UTC.', 'Buy: the minute makes a new 30-minute low, CVD stays above its 30-minute low, and the minute closes green. Sell short: the mirror at a new high.', 'Entry at the next minute\'s open. Stop: just past the new extreme (at least the set %). Target: reward-to-risk multiple. At most 1 hour.'],
  defaults: { rr: 2, stp: .15 }, params: RISK, idle: 'Waiting for price and CVD to disagree at a 30-minute extreme.',
  gen({ b, cfg, cvd: C }, i) { const x = b[i]; let pl = Infinity, ph = -Infinity, cl = Infinity, ch = -Infinity; for (let k = i - 30; k < i; k++) { pl = Math.min(pl, b[k].l); ph = Math.max(ph, b[k].h); cl = Math.min(cl, C[k]); ch = Math.max(ch, C[k]); }
    if (x.l < pl && C[i] > cl && x.c > x.o) return mk(b, i, 1, Math.min(x.l * .9998, x.c * (1 - cfg.stp / 100)), cfg.rr, `New 30-minute low ${f0(x.l)} without new selling (CVD higher low)`);
    if (x.h > ph && C[i] < ch && x.c < x.o) return mk(b, i, -1, Math.max(x.h * 1.0002, x.c * (1 + cfg.stp / 100)), cfg.rr, `New 30-minute high ${f0(x.h)} without new buying (CVD lower high)`); return null; },
  pane: (keep, b, off) => { let c = 0; const all = b.map(x => c += x.bv - x.sv); return { name: 'Cumulative volume delta (BTC, since 00:00 UTC)', short: 'CVD', vals: all.slice(off), color: '#f5a623', h: 70 }; } });
/* ---------- 4. Heat map (persistent walls) ---------- */
const wallAt = (b, i, side, k, mins) => { const cand = (b[i][side] || []).filter(([, s]) => s >= k * (b[i].med || Infinity)); for (const [p] of cand) { let ok = true; for (let j = i - mins + 1; j < i && ok; j++) ok = (b[j][side] || []).some(([q, s]) => Math.abs(q - p) <= STEP && s >= k * (b[j].med || Infinity)); if (ok) return p; } return null; };
const heat = flow({ id: 'heat', name: 'Heat Map', icon: 'sun', blurb: 'Liquidity heat map: big resting orders that stay in the book for 10+ minutes act as walls. When price tests a bid wall and holds, it buys; when it tests an ask wall and fails, it sells.',
  how: ['Every minute: resting order size per $25 step within 1% of the price. A wall is a step at least the set multiple × the median step size.', 'A wall counts once it has been there at least 10 minutes in a row.', 'Buy: the minute trades within 0.05% of a bid wall and closes above it. Sell short: the mirror at an ask wall.', 'Stop: 0.15% past the wall. Target: reward-to-risk multiple. At most 1 hour.'],
  defaults: { k: 5, rr: 2 }, params: [{ k: 'k', label: 'Wall size', min: 3, max: 15, step: 1, unit: '× the median level size', int: true }, RISK[0]], idle: 'Watching for price to test a persistent wall.',
  gen({ b, cfg }, i) { if (i < 10) return null; const x = b[i], bw = wallAt(b, i, 'wb', cfg.k, 10), aw = wallAt(b, i, 'wa', cfg.k, 10);
    if (bw != null && x.l <= (bw + STEP) * 1.0005 && x.c > bw + STEP) return mk(b, i, 1, bw * .9985, cfg.rr, `Held the bid wall at ${f0(bw)}`); if (aw != null && x.h >= aw * .9995 && x.c < aw) return mk(b, i, -1, (aw + STEP) * 1.0015, cfg.rr, `Rejected at the ask wall ${f0(aw)}`); return null; },
  draw(keep, draw) { let mx = 0; for (const x of keep) for (const [, s] of [...(x.wb || []), ...(x.wa || [])]) mx = Math.max(mx, s); if (!mx) return;
    keep.forEach((x, i) => { for (const [p, s] of x.wb || []) draw.zones.push({ y0: p, y1: p + STEP, t0: x.t, t1: x.t, color: `rgba(48,209,88,${(.08 + .6 * s / mx).toFixed(2)})` }); for (const [p, s] of x.wa || []) draw.zones.push({ y0: p, y1: p + STEP, t0: x.t, t1: x.t, color: `rgba(255,69,58,${(.08 + .6 * s / mx).toFixed(2)})` }); });
    draw.legend = [['rgba(48,209,88,.6)', 'resting bids', 'box'], ['rgba(255,69,58,.6)', 'resting asks', 'box']]; } });

module.exports = { STRATS: [lv2, foot, cvd, heat], start, _t: { trade, flush, bookStats, minutes } };
