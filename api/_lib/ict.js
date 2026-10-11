// Sweep & Gap (ICT) strategy engine for NQ / ES, 5-minute candles, America/New_York. One rule set, used by the backtest, the chart and the bot.
//  1. Liquidity: the Asian range (20:00-24:00), the London range (02:00-05:00) and the previous session's high and low (9:30-16:00). A level that price has
//     already traded through before the New York open is spent. The rest are the resting stops the day is drawn to.
//  2. Time: only the New York AM killzone (sweeps and entries between 9:30 and 11:30 ET).
//  3. Sweep: a 5-minute bar trades through an unspent level (a low for a long setup, a high for a short).
//  4. Shift: within 12 bars, a displacement bar (body at least 0.8 x ATR(14)) closes beyond the high (low) of the five bars before the sweep AND leaves a fair
//     value gap (its low is above the high of the bar two before, mirrored for shorts).
//  5. Entry: limit at the gap's midpoint (consequent encroachment), valid for 12 bars. Dropped if a bar closes through the gap, or price reaches the target first.
//  6. Stop: just past the sweep extreme. Target: a multiple of the risk. Flat by 15:55. One position at a time, at most `max` trades a day.
//  7. Optional filters: only buy in the discount half of the last three sessions' range and sell in the premium half.
// Fills are conservative: a bar that touches both the stop and the target counts as the stop; on the entry bar only the stop can hit; the stop slips one tick.
const TICK = .25, ATR_N = 14, KZ = [570, 720], FLAT_M = 955, MIN_R = .0003, MAX_R = .004, BUF = .0001;
const DEF = { sym: 'NQ', risk: .5, max: 2, rr: 2, pd: true, disp: .5, int: true, arm: 18, mss: 18, mode: 'sweep', bw: [600, 660] };
const snap = x => Math.round(x / TICK) * TICK;
const prevCal = d => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

function atrSeries(b) { const a = new Array(b.length).fill(NaN); let sum = 0; for (let i = 0; i < b.length; i++) { const pc = i ? b[i - 1].c : b[i].o, tr = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - pc), Math.abs(b[i].l - pc)); sum += tr; if (i >= ATR_N) sum -= Math.max(b[i - ATR_N].h - b[i - ATR_N].l, Math.abs(b[i - ATR_N].h - (i - ATR_N ? b[i - ATR_N - 1].c : b[i - ATR_N].o)), Math.abs(b[i - ATR_N].l - (i - ATR_N ? b[i - ATR_N - 1].c : b[i - ATR_N].o))); if (i >= ATR_N - 1) a[i] = sum / ATR_N; } return a; }

// group the candles by ET date: Map(date -> { first, last } indices) for dates that have a real New York session
function sessions(b, keepLast) { const m = new Map(); b.forEach((x, i) => { if (x.m >= 570 && x.m < 960) { const s = m.get(x.date); if (s) s.last = i; else m.set(x.date, { first: i, last: i }); } }); return [...m.entries()].filter(([d, s], j, arr) => s.last - s.first >= 60 || (keepLast && j === arr.length - 1)).map(([date, s]) => ({ date, ...s })); } // keepLast: today's session counts while it is still being traded

// the liquidity levels for one trading date: [{ name, side: 'sell'|'buy', p, t0 }]  ('sell' = sell-side liquidity = a low, swept for longs)
function levelsFor(b, ses, k) {
  const S = ses[k], D = S.date, open = b[S.first].t, out = [], pd = k > 0 ? ses[k - 1] : null, pc = prevCal(D);
  const asia = [], lon = []; for (let i = S.first - 1; i >= 0 && b[i].t > open - 20 * 36e5; i--) { const x = b[i]; if (x.date === pc && x.m >= 1200) asia.push(x); else if (x.date === D && x.m >= 120 && x.m < 300) lon.push(x); }
  const add = (name, arr, t0) => { if (arr.length < 6) return; const hi = Math.max(...arr.map(x => x.h)), lo = Math.min(...arr.map(x => x.l)); out.push({ name: name + ' low', side: 'sell', p: lo, t0 }, { name: name + ' high', side: 'buy', p: hi, t0 }); };
  add('Asia', asia, Math.max(...asia.map(x => x.t)) + 3e5); add('London', lon, Math.max(...lon.map(x => x.t)) + 3e5);
  const prem = []; for (let i = S.first - 1; i >= 0 && b[i].date === D && b[i].m >= 300; i--) prem.push(b[i]); add('Premarket', prem, Math.max(...prem.map(x => x.t), 0) + 3e5);
  if (pd) { const r = b.slice(pd.first, pd.last + 1).filter(x => x.m >= 570 && x.m < 960); out.push({ name: 'Previous low', side: 'sell', p: Math.min(...r.map(x => x.l)), t0: b[pd.last].t + 3e5 }, { name: 'Previous high', side: 'buy', p: Math.max(...r.map(x => x.h)), t0: b[pd.last].t + 3e5 }); }
  // spent before the open: price already traded through it
  const pre = b.slice(Math.max(0, S.first - 400), S.first); return out.filter(L => !pre.some(x => x.t >= L.t0 && (L.side === 'sell' ? x.l < L.p : x.h > L.p)));
}
// the premium / discount line: the middle of the last three completed sessions' range
function equilibrium(b, ses, k) { if (k < 1) return NaN; const r = []; for (let j = Math.max(0, k - 3); j < k; j++) for (let i = ses[j].first; i <= ses[j].last; i++) if (b[i].m >= 570 && b[i].m < 960) r.push(b[i]); if (r.length < 100) return NaN; return (Math.max(...r.map(x => x.h)) + Math.min(...r.map(x => x.l))) / 2; }

// run one session through the rules. `b` = candles oldest first, `k` = index into ses, `upto` = how many candles are complete (live) or Infinity (backtest)
// returns { levels (unspent at the open), events (for the chart), trades (finished, as the rules would have traded them), pending: { cand, order, pos } }
function runDay(b, ses, k, cfg = {}, atr, upto = Infinity) {
  const c = { ...DEF, ...cfg }, S = ses[k], D = S.date, levels = levelsFor(b, ses, k), eq = c.pd ? equilibrium(b, ses, k) : NaN, ev = { levels, events: [], trades: [], eq }, end = Math.min(S.last, upto - 1);
  let live = levels.slice(), cand = null, order = null, pos = null, count = 0;
  const close = (p, i, exit, why) => { p.exit = exit; p.why = why; p.xi = i; p.pts = (exit - p.entry) * p.dir; ev.trades.push(p); };
  for (let i = S.first; i <= end; i++) {
    const x = b[i], inKZ = x.m >= KZ[0] && x.m < KZ[1];
    // --- the open position: the stop first (a bar that touches both counts as the stop); the target only after the entry bar; flat at 15:55
    if (pos) {
      const st = pos.dir === 1 ? x.l <= pos.stop : x.h >= pos.stop, tg = pos.dir === 1 ? x.h >= pos.target : x.l <= pos.target;
      if (st) close(pos, i, pos.stop - pos.dir * TICK, 'stop'); else if (tg && i > pos.fi) close(pos, i, pos.target, 'target'); else if (x.m >= FLAT_M) close(pos, i, x.c, 'flat 15:55'); if (pos.xi != null) pos = null;
    }
    // --- a waiting limit order
    if (order && !pos) {
      const touch = order.dir === 1 ? x.l <= order.entry : x.h >= order.entry, ran = !touch && (order.dir === 1 ? x.h >= order.target : x.l <= order.target), through = order.dir === 1 ? x.c < order.zoneLo : x.c > order.zoneHi;
      if (touch && inKZ) { pos = { ...order, fi: i, xi: null }; order = null; count++; ev.events.push({ i, type: 'fill', dir: pos.dir, p: pos.entry }); if (pos.dir === 1 ? x.l <= pos.stop : x.h >= pos.stop) { close(pos, i, pos.stop - pos.dir * TICK, 'stop'); pos = null; } } // on the entry bar only the stop can hit
      else if (ran || through || i >= order.expire || !inKZ) { ev.events.push({ i, type: 'cancel', dir: order.dir, why: ran ? 'price ran to the target without a pullback' : through ? 'closed through the gap' : 'expired' }); order = null; }
    }
    // --- levels price has now traded through are spent; fresh 5-minute pivots inside the killzone become internal liquidity once two bars confirm them
    const hit = live.filter(L => L.side === 'sell' ? x.l < L.p : x.h > L.p); if (hit.length) live = live.filter(L => !hit.includes(L));
    if (c.int && inKZ && i - S.first >= 4) { const p = b[i - 2]; if (p.m >= 570) { if (p.l < Math.min(b[i - 4].l, b[i - 3].l, b[i - 1].l, x.l)) live.push({ name: 'Swing low', side: 'sell', p: p.l, t0: x.t }); if (p.h > Math.max(b[i - 4].h, b[i - 3].h, b[i - 1].h, x.h)) live.push({ name: 'Swing high', side: 'buy', p: p.h, t0: x.t }); } }
    if (!inKZ || pos || order || count >= c.max) { cand = null; continue; } // setups are only looked for in the killzone, while flat
    const arm = (o, why) => { const rr = o.R / o.entry; if (rr < MIN_R || rr > MAX_R) { ev.events.push({ i, type: 'skip', dir: o.dir, why: rr < MIN_R ? 'stop too tight' : 'stop too wide' }); return; }
      const pdOK = !(c.pd && Number.isFinite(eq)) || (o.dir === 1 ? o.entry <= eq : o.entry >= eq); if (!pdOK) { ev.events.push({ i, type: 'skip', dir: o.dir, why: o.dir === 1 ? 'not in the discount half of the range' : 'not in the premium half of the range' }); return; }
      order = { ...o, mi: i, expire: i + c.arm }; ev.events.push({ i, type: 'arm', dir: o.dir, p: o.entry }); };
    if (c.mode === 'bullet') { // Silver Bullet: displacement + gap toward the nearest unspent liquidity, entered on the pullback to the gap's middle
      if (x.m >= c.bw[0] && x.m < c.bw[1] && i >= 2) {
        const a = atr[i - 1], up = x.c > x.o, gUp = up && x.l > b[i - 2].h, gDn = !up && x.h < b[i - 2].l;
        if (Math.abs(x.c - x.o) >= c.disp * a && (gUp || gDn)) { const dir = gUp ? 1 : -1, lo = gUp ? b[i - 2].h : x.h, hi = gUp ? x.l : b[i - 2].l, ce = snap((lo + hi) / 2), ext = dir === 1 ? Math.min(b[i - 2].l, b[i - 1].l) : Math.max(b[i - 2].h, b[i - 1].h), stop = snap(dir === 1 ? ext - ext * BUF : ext + ext * BUF), R = Math.abs(ce - stop);
          const draw = live.filter(L => dir === 1 ? L.side === 'buy' && L.p >= ce + c.rr * R : L.side === 'sell' && L.p <= ce - c.rr * R).sort((p, q) => dir === 1 ? p.p - q.p : q.p - p.p)[0];
          if (!draw) ev.events.push({ i, type: 'skip', dir, why: `no liquidity ${c.rr}R away to aim at` }); else arm({ dir, entry: ce, stop, target: snap(draw.p), R, zoneLo: lo, zoneHi: hi, ext, level: draw.name, si: i }); } }
      continue; }
    // --- Sweep & Shift: a sweep of an unspent level, then a displacement bar with a gap that closes beyond the leg into the extreme
    if (cand) {
      if (cand.dir === 1 ? x.l < cand.ext : x.h > cand.ext) { cand.ext = cand.dir === 1 ? x.l : x.h; cand.e = i; } // a lower low (higher high) extends the sweep
      if (i - cand.s > c.mss) { ev.events.push({ i, type: 'noshift', dir: cand.dir }); cand = null; }
      else if (i > cand.e) {
        const w = b.slice(cand.e - 4, cand.e + 1), ref = cand.dir === 1 ? Math.max(...w.map(y => y.h)) : Math.min(...w.map(y => y.l)), a = atr[i - 1];
        const ok = (x.c - x.o) * cand.dir >= c.disp * a && (cand.dir === 1 ? x.c > ref : x.c < ref), gap = cand.dir === 1 ? x.l > b[i - 2].h : x.h < b[i - 2].l;
        if (ok && gap && i - 2 >= cand.e - 1) { const lo = cand.dir === 1 ? b[i - 2].h : x.h, hi = cand.dir === 1 ? x.l : b[i - 2].l, ce = snap((lo + hi) / 2), stop = snap(cand.ext + (cand.dir === 1 ? -1 : 1) * cand.ext * BUF), R = Math.abs(ce - stop);
          arm({ dir: cand.dir, entry: ce, stop, target: snap(ce + cand.dir * R * c.rr), R, zoneLo: lo, zoneHi: hi, ext: cand.ext, level: cand.level, si: cand.s }); cand = null; continue; }
      }
    }
    if (!cand && hit.length) { const sell = hit[0].side === 'sell'; cand = { dir: sell ? 1 : -1, s: i, e: i, ext: sell ? x.l : x.h, level: hit.map(L => L.name).join(' + ') }; ev.events.push({ i, type: 'sweep', dir: cand.dir, p: cand.ext, level: cand.level }); }
  }
  if (pos && upto === Infinity) { close(pos, end, b[end].c, 'end of data'); pos = null; }
  ev.pending = { cand, order, pos, live }; return ev;
}

/* ---------- backtest ---------- */
const MICRO = { NQ: { mult: 2, fee: .62 }, ES: { mult: 5, fee: .62 } };
function backtest(b, cfg = {}) {
  const c = { ...DEF, ...cfg }, ses = sessions(b), atr = atrSeries(b), m = MICRO[c.sym] || MICRO.NQ, trades = [], days = [];
  for (let k = 0; k < ses.length; k++) { const ev = runDay(b, ses, k, c, atr); days.push({ date: ses[k].date, n: ev.trades.length }); for (const t of ev.trades) trades.push({ ...t, date: ses[k].date, riskPts: t.R, r: t.pts / t.R, net: t.pts * m.mult - 2 * m.fee }); }
  const sum = a => a.reduce((x, y) => x + y, 0), n = trades.length, w = trades.filter(t => t.pts > 0).length; let peak = 0, run = 0, dd = 0; for (const t of trades) { run += t.r; peak = Math.max(peak, run); dd = Math.min(dd, run - peak); }
  const gw = sum(trades.filter(t => t.net > 0).map(t => t.net)), gl = -sum(trades.filter(t => t.net < 0).map(t => t.net));
  return { trades, n, win: n ? w / n : 0, avgR: n ? sum(trades.map(t => t.r)) / n : 0, totalR: sum(trades.map(t => t.r)), net: sum(trades.map(t => t.net)), pf: gl ? gw / gl : gw ? Infinity : 0, maxDD: dd, avgRisk: n ? sum(trades.map(t => t.riskPts)) / n : 0, days: ses.length, from: ses[0]?.date, to: ses[ses.length - 1]?.date,
    long: trades.filter(t => t.dir === 1).length, short: trades.filter(t => t.dir === -1).length, byWhy: Object.fromEntries(['target', 'stop', 'flat 15:55'].map(k => [k, trades.filter(t => t.why === k).length])) };
}
module.exports = { DEF, TICK, KZ, FLAT_M, snap, atrSeries, sessions, levelsFor, equilibrium, runDay, backtest, MICRO };
