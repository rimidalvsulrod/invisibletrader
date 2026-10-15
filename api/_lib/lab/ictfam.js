// ICT family (Strategy Lab): written, testable versions of ICT ideas on 5-minute NQ / ES candles, America/New_York. Each one is one function that
// arms orders; the shared engine in lab.js fills them conservatively. The same function is the backtest, the chart and the paper bot.
const L = require('../lab'), ICT = require('../ict'), P = require('../powell');
const TICK = .25, MIN_R = .0003, MAX_R = .004, snap = x => Math.round(x / TICK) * TICK, f2 = x => Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KZ = x => x.m >= 570 && x.m < 720, FLAT = x => x.m >= 955, rrOK = (e, s) => { const r = Math.abs(e - s) / e; return r >= MIN_R && r <= MAX_R; };
const maxH = (b, a, z) => { let m = -Infinity; for (let i = Math.max(0, a); i <= z; i++) m = Math.max(m, b[i].h); return m; }, minL = (b, a, z) => { let m = Infinity; for (let i = Math.max(0, a); i <= z; i++) m = Math.min(m, b[i].l); return m; };
const pivH = (b, j) => j >= 2 && j + 2 < b.length && b[j].h > Math.max(b[j - 2].h, b[j - 1].h, b[j + 1].h, b[j + 2].h), pivL = (b, j) => j >= 2 && j + 2 < b.length && b[j].l < Math.min(b[j - 2].l, b[j - 1].l, b[j + 1].l, b[j + 2].l);
const SESS = [[5, 'Last 5 sessions'], [10, 'Last 10 sessions'], [20, 'Last 20 sessions'], [40, 'Last 40 sessions'], [60, 'All the data (about 60)']];

/* ---------- the factory: data, live trading, chart, backtest for one ICT-style rule set ---------- */
function fut(def) {
  const s = { kind: 'bars', group: 'ICT', syms: ['NQ', 'ES'], bt: { opts: SESS, def: 60, unit: 'sessions' }, dataNote: 'Free Yahoo Finance 5-minute NQ and ES futures candles, all hours, about 60 days. Trades the real contracts in a simulated account (micros when the stop is wide for your risk).', ...def,
    defaults: { sym: 'NQ', risk: .5, max: 2, ...def.defaults } };
  s.run = (b, ses, k, cfg, upto = Infinity, atr = ICT.atrSeries(b)) => {
    const S = ses[k], ctx = { b, ses, k, S, atr, cfg }, st = def.setup(ctx, cfg) || null; if (!st) return { trades: [], events: [], order: null, pos: null, draw: {}, note: ctx.note || 'No setup possible today.' };
    const r = L.runBars(b, st.i0 ?? S.first, Math.min(S.last, upto - 1), { slip: TICK, win: st.win || KZ, flat: FLAT, max: cfg.max }, st.gen);
    return { ...r, draw: st.draw || {}, note: st.note || '' };
  };
  s.backtest = async (cfg, days) => {
    const b = await L.bars5(cfg.sym, 3e5), ses = ICT.sessions(b), atr = ICT.atrSeries(b), n = Math.min(ses.length, Math.max(1, Math.round(days))), out = [];
    for (let k = ses.length - n; k < ses.length; k++) for (const t of s.run(b, ses, k, cfg, Infinity, atr).trades) out.push({ ...t, date: ses[k].date });
    return { sym: cfg.sym, from: ses[ses.length - n]?.date, to: ses[ses.length - 1]?.date, days: n, ...L.stats(out, cfg.sym),
      trades: out.slice(-15).reverse().map(t => ({ date: t.date, dir: t.dir, entry: t.entry, exit: t.exit, r: (t.exit - t.entry) * t.dir / Math.abs(t.entry - t.stop), why: t.why, setup: t.why0 || t.label || '' })) };
  };
  s.view = async (cfg) => {
    const b = await L.bars5(cfg.sym, 15e3), ses = ICT.sessions(b, true), k = ses.length - 1, upto = L.closedUpto(b), r = s.run(b, ses, k, cfg, upto), today = P.et(Date.now() / 1000).date, S = ses[k];
    const days = [...new Set(b.filter(x => x.m >= 570 && x.m < 960).map(x => x.date))].slice(-2), keep = b.filter(x => days.includes(x.date) && x.m >= 0 && x.m < 960 && (x.date === S.date || x.m >= 480));
    const ev = r.events.map(e => ({ t: b[e.i].t, type: e.type, dir: e.dir, p: e.p ?? null, why: e.why || null }));
    const status = S.date !== today ? `Market closed. Last session (${S.date}): ${r.trades.length ? `${r.trades.length} trade${r.trades.length > 1 ? 's' : ''} by the rules.` : 'no trade.'}`
      : r.pos ? `In a ${r.pos.dir === 1 ? 'long' : 'short'} from ${f2(r.pos.entry)}: stop ${f2(r.pos.stop)}, target ${f2(r.pos.target)}.`
      : r.order ? `Armed: ${r.order.dir === 1 ? 'buy' : 'sell'} ${r.order.entry == null ? 'at the next open' : 'limit at ' + f2(r.order.entry)}, stop ${f2(r.order.stop)}, target ${f2(r.order.target)}. ${r.order.why || ''}` : (r.note || def.idle || 'Watching.');
    return { sym: cfg.sym, status, last: b[b.length - 1]?.c, t: b[b.length - 1]?.t, bars: keep.map(x => [x.t, x.o, x.h, x.l, x.c, x.v]), draw: r.draw, events: ev,
      trades: r.trades.map(t => ({ dir: t.dir, entry: t.entry, stop: t.stop, target: t.target, t0: t.entryT, t1: t.exitT, exit: t.exit, why: t.why })),
      pos: r.pos ? { dir: r.pos.dir, entry: r.pos.entry, stop: r.pos.stop, target: r.pos.target, t0: r.pos.entryT } : null, order: r.order ? { dir: r.order.dir, entry: r.order.entry, stop: r.order.stop, target: r.order.target, t0: r.order.armT } : null };
  };
  s.live = async (row, cfg, H) => {
    const db = require('../db'), today = P.et(Date.now() / 1000).date, b = await L.bars5(cfg.sym, 30e3), ses = ICT.sessions(b, true), k = ses.length - 1, atr = ICT.atrSeries(b);
    if (ses[k].date === today) { const r = s.run(b, ses, k, cfg, L.closedUpto(b), atr); await H.sync(row.uid, s.id, cfg, row.paper, L.liveTrades(r, cfg.sym, s.id), today, Number(row.since || 0)); }
    // a position left open from an earlier day (the runner was down at the close): finish it exactly as the rules did that day
    for (const t of await db.q("SELECT * FROM labtrades WHERE uid=$1 AND strat=$2 AND status='open' AND day<>$3", [row.uid, s.id, today])) {
      const sym = t.sym.replace(/^M(?=NQ|ES)/, ''), bb = sym === cfg.sym ? b : await L.bars5(sym, 3e5), ss = ICT.sessions(bb), kk = ss.findIndex(x => x.date === t.day); if (kk < 0) { await H.closeRow(t, Number(t.entry), 'no data for that day'); continue; }
      const T = L.liveTrades(s.run(bb, ss, kk, cfg), sym, s.id).find(x => x.key === t.key); await H.closeRow(t, T && T.exit != null ? T.exit : bb[ss[kk].last].c, T ? T.why : 'flat at the close', T?.exitT || bb[ss[kk].last].t);
    }
  };
  return s;
}

/* ---------- 1. Fair value gap ---------- */
const fvg = fut({ id: 'fvg', name: 'FVG Bot', icon: 'star',
  blurb: 'Trades fair value gaps: a strong candle that leaves a three-candle gap and breaks structure, then a limit order at the middle of the gap for the pullback.',
  how: ['Only in the New York killzone (9:30 to 12:00 ET).', 'Signal: a displacement candle (body at least the set share of ATR) that closes beyond the high (low) of the five candles before it AND leaves a gap between candle 1 and candle 3.',
    'Entry: limit at the gap\'s middle (consequent encroachment), valid 12 candles; cancelled if a candle closes through the gap or price reaches the target first.', 'Stop: one tick past the gap\'s first candle. Target: reward-to-risk multiple. Flat by 15:55.', 'Optional: buy only in the discount half of the last three sessions\' range, sell only in the premium half.'],
  defaults: { rr: 2, disp: .7, pd: 'on' }, params: [{ k: 'rr', label: 'Reward to risk', min: 1, max: 4, step: .5, unit: '× reward to risk' }, { k: 'disp', label: 'Displacement', min: .3, max: 1.5, step: .1, unit: '× ATR candle body' }], choices: { pd: ['on', 'off'] },
  idle: 'Waiting for a displacement candle that leaves a gap and breaks structure in the killzone.',
  setup({ b, ses, k, S, atr }, cfg) {
    const eq = cfg.pd === 'on' ? ICT.equilibrium(b, ses, k) : NaN, zones = [];
    return { draw: { zones, levels: Number.isFinite(eq) ? [{ y: eq, name: 'equilibrium', color: 'var(--mut)', t0: b[S.first].t }] : [] }, gen(i) {
      if (i < 6) return null; const x = b[i], a = atr[i - 1];
      for (const dir of [1, -1]) {
        const gap = dir === 1 ? x.l > b[i - 2].h : x.h < b[i - 2].l; if (!gap || (x.c - x.o) * dir < cfg.disp * a) continue;
        if (dir === 1 ? x.c <= maxH(b, i - 5, i - 1) : x.c >= minL(b, i - 5, i - 1)) continue; // must break structure
        const lo = dir === 1 ? b[i - 2].h : x.h, hi = dir === 1 ? x.l : b[i - 2].l, ce = snap((lo + hi) / 2), stop = snap(dir === 1 ? Math.min(b[i - 2].l, b[i - 1].l) - TICK : Math.max(b[i - 2].h, b[i - 1].h) + TICK);
        if (!rrOK(ce, stop)) continue; if (Number.isFinite(eq) && (dir === 1 ? ce > eq : ce < eq)) continue; const R = Math.abs(ce - stop);
        zones.push({ y0: lo, y1: hi, t0: b[i - 2].t, color: dir === 1 ? 'rgba(48,209,88,.16)' : 'rgba(255,69,58,.16)', name: dir === 1 ? 'bullish gap' : 'bearish gap' });
        return { dir, entry: ce, stop, target: snap(ce + dir * cfg.rr * R), expire: 12, through: y => dir === 1 ? y.c < lo : y.c > hi, why: `${dir === 1 ? 'Bullish' : 'Bearish'} gap ${f2(lo)} to ${f2(hi)} after a displacement candle that broke structure` };
      }
      return null; } };
  } });

/* ---------- 2. Fibonacci optimal trade entry ---------- */
const fib = fut({ id: 'fib', name: 'Fibonacci OTE', icon: 'spark',
  blurb: 'Waits for an impulse leg that breaks structure, then buys (sells) the pullback into the optimal trade entry zone: 70.5% of the leg, between the 62% and 79% retracements.',
  how: ['Impulse leg: from a 5-minute swing low to a swing high (or the reverse) at least the set multiple of ATR, whose end takes out the highest high of the 24 candles before it started.', 'Entry: limit at the 70.5% retracement of the leg, valid 24 candles, entries 9:30 to 12:00 ET. Cancelled if price closes beyond the 88.6% level.',
    'Stop: one tick past the start of the leg (100%). Target: the leg\'s end plus an extension (the -0.27 / -0.62 levels).', 'Flat by 15:55.'],
  defaults: { leg: 3, ext: .62 }, params: [{ k: 'leg', label: 'Leg size', min: 2, max: 8, step: .5, unit: '× ATR minimum leg' }, { k: 'ext', label: 'Target extension', min: 0, max: 1.27, step: .05, unit: 'extension beyond the leg' }],
  idle: 'Waiting for an impulse leg that breaks structure, then for the pullback into 62% to 79%.',
  setup({ b, S, atr }, cfg) {
    const levels = [];
    return { i0: Math.max(S.first - 60, 0), win: x => x.date === S.date && KZ(x), draw: { levels }, gen(i) {
      const j = i - 2; if (j < 30 || b[i].date !== S.date) return null;
      for (const dir of [1, -1]) {
        if (dir === 1 ? !pivH(b, j) : !pivL(b, j)) continue; const end = dir === 1 ? b[j].h : b[j].l; let l = -1;
        for (let q = j - 2; q > j - 40 && q >= 2; q--) if (dir === 1 ? pivL(b, q) : pivH(b, q)) { l = q; break; } if (l < 0) continue;
        const start = dir === 1 ? b[l].l : b[l].h, leg = Math.abs(end - start); if (leg < cfg.leg * atr[j]) continue;
        if (dir === 1 ? (minL(b, l, j) < start || end <= maxH(b, l - 24, l - 1)) : (maxH(b, l, j) > start || end >= minL(b, l - 24, l - 1))) continue; // a clean leg that broke structure
        const entry = snap(end - dir * .705 * leg), stop = snap(start - dir * TICK); if (!rrOK(entry, stop)) continue;
        if (dir === 1 ? minL(b, j + 1, i) <= entry : maxH(b, j + 1, i) >= entry) continue; // already traded into the zone before the leg was confirmed
        const lvl = p => end - dir * p * leg; for (const [p, nm] of [[.5, '50%'], [.618, '61.8%'], [.705, '70.5% entry'], [.786, '78.6%']]) levels.push({ y: lvl(p), name: nm, color: p === .705 ? '#ff9f0a' : 'rgba(255,159,10,.55)', t0: b[l].t, dash: p === .705 ? '' : '3 3' });
        return { dir, entry, stop, target: snap(end + dir * cfg.ext * leg), expire: 24, through: y => dir === 1 ? y.c < lvl(.886) : y.c > lvl(.886), why: `${dir === 1 ? 'Up' : 'Down'} leg ${f2(start)} to ${f2(end)} (${(leg / atr[j]).toFixed(1)}× ATR): ${dir === 1 ? 'buying' : 'selling'} the 70.5% pullback` };
      }
      return null; } };
  } });

/* ---------- 3. Standard deviation projections (opening-range manipulation) ---------- */
const stdv = fut({ id: 'stdv', name: 'STDV Bot', icon: 'wave',
  blurb: 'ICT standard deviation projections. After the opening range (9:30 to 10:00), price runs one side (the manipulation) and fails back inside; the bot fades it and targets a standard-deviation projection of the manipulation leg.',
  how: ['Opening range: the six 5-minute candles 9:30 to 9:55.', 'Manipulation: after 10:00 a candle trades beyond the range high (low). The leg runs from the lowest low (highest high) of the six candles before it to the extreme.',
    'Trigger: within 18 candles, a candle closes back inside the range AND below (above) the open of the last up (down) candle: a change in state of delivery. Entry at the next open.',
    'Stop: one tick past the manipulation extreme. Target: the leg projected beyond its start by the set number of standard deviations (-1, -2, -2.5 ...).', 'Entries 10:00 to 12:00 ET, flat by 15:55.'],
  defaults: { sd: 2, max: 1 }, params: [{ k: 'sd', label: 'Projection', min: 1, max: 4, step: .5, unit: 'standard deviations' }],
  idle: 'Waiting for a run beyond the opening range that fails back inside.',
  setup({ b, S }, cfg) {
    if (S.last - S.first < 7) return null; const orH = maxH(b, S.first, S.first + 5), orL = minL(b, S.first, S.first + 5), levels = [{ y: orH, name: 'OR high', color: 'rgba(150,150,230,.9)', t0: b[S.first].t }, { y: orL, name: 'OR low', color: 'rgba(150,150,230,.9)', t0: b[S.first].t }]; let sw = null;
    return { i0: S.first + 6, win: x => x.m >= 600 && x.m < 720, draw: { levels }, gen(i) {
      const x = b[i];
      if (!sw) { if (x.h > orH) sw = { dir: -1, ext: x.h, s: i }; else if (x.l < orL) sw = { dir: 1, ext: x.l, s: i }; return null; }
      if (sw.dir === -1 ? x.h > sw.ext : x.l < sw.ext) sw.ext = sw.dir === -1 ? x.h : x.l; if (i - sw.s > 18) { sw = null; return null; }
      const back = sw.dir === -1 ? x.c < orH : x.c > orL; let ref = null; for (let q = i - 1; q >= sw.s - 3; q--) if (sw.dir === -1 ? b[q].c > b[q].o : b[q].c < b[q].o) { ref = b[q].o; break; }
      if (!back || ref == null || (sw.dir === -1 ? x.c >= ref : x.c <= ref)) return null;
      const origin = sw.dir === -1 ? minL(b, sw.s - 6, sw.s - 1) : maxH(b, sw.s - 6, sw.s - 1), leg = Math.abs(sw.ext - origin), stop = snap(sw.ext + (sw.dir === -1 ? TICK : -TICK)), target = snap(origin + sw.dir * cfg.sd * leg), d = sw.dir;
      if (!(leg > 0) || !rrOK(x.c, stop) || (d === -1 ? target >= x.c : target <= x.c)) { sw = null; return null; }
      for (const k of [1, 2, 2.5, 4]) levels.push({ y: origin + d * k * leg, name: `-${k} SD`, color: k === cfg.sd ? 'var(--up)' : 'rgba(127,127,127,.7)', t0: b[sw.s].t, dash: '4 4' }); sw = null;
      return { dir: d, entry: null, stop, target, why: `Ran the opening-range ${d === -1 ? 'high' : 'low'} to ${f2(stop - (d === -1 ? TICK : -TICK))} and failed back inside; leg ${f2(leg)} pts, target -${cfg.sd} SD` };
    } };
  } });

/* ---------- 4. Quarterly Theory (true open) ---------- */
const qt = fut({ id: 'qt', name: 'Quarterly Theory', icon: 'book',
  blurb: 'ICT Quarterly Theory on the daily cycle: Asia (18:00-00:00) accumulates, London (00:00-06:00) manipulates away from the true day open, New York (06:00-12:00) distributes the other way through it.',
  how: ['True day open: the open of the 00:00 ET candle.', 'Bias: if the London quarter ran further above the true open than below it, by at least the set share of price, the day is expected to distribute DOWN (and the reverse).',
    'Trigger, 9:30 to 11:00 ET: a candle that trades through the true open and closes back on the bias side of it (a rejection). Entry at the next open.', 'Stop: one tick past the extreme of the last six candles. Target: reward-to-risk multiple. One trade a day, flat by 15:55.'],
  defaults: { rr: 2, thr: .15, max: 1 }, params: [{ k: 'rr', label: 'Reward to risk', min: 1, max: 4, step: .5, unit: '× reward to risk' }, { k: 'thr', label: 'London run', min: .05, max: .6, step: .05, unit: '% of price minimum' }],
  setup(ctx, cfg) {
    const { b, S } = ctx; let j0 = -1; for (let i = S.first; i >= 0 && b[i].date === S.date; i--) if (b[i].m === 0) { j0 = i; break; }
    if (j0 < 0) { ctx.note = 'No midnight candle for this date (no true open).'; return null; }
    const TO = b[j0].o, q2 = b.slice(j0).filter(x => x.date === S.date && x.m < 360), hi2 = Math.max(...q2.map(x => x.h)), lo2 = Math.min(...q2.map(x => x.l)), up = hi2 - TO, dn = TO - lo2, thr = cfg.thr / 100 * TO;
    const bias = Math.max(up, dn) < thr ? 0 : up > dn ? -1 : 1, t = m => { const q = b.findIndex((x, k) => k >= j0 && x.date === S.date && x.m >= m); return q >= 0 ? b[q].t : null; };
    const draw = { levels: [{ y: TO, name: 'true open', color: '#ff9f0a', t0: b[j0].t, dash: '' }], zones: [{ y0: lo2, y1: hi2, t0: b[j0].t, t1: t(360), color: 'rgba(150,150,230,.10)', name: 'London quarter' }], vlines: [[0, 'Q2 London'], [360, 'Q3 New York'], [720, 'Q4']].map(([m, n]) => ({ t: t(m), name: n })).filter(v => v.t) };
    const note = bias === 0 ? `No bias today: London ran only ${(Math.max(up, dn) / TO * 100).toFixed(2)}% from the true open (needs ${cfg.thr}%).` : `Bias ${bias === 1 ? 'LONG' : 'SHORT'}: London ran ${(Math.max(up, dn) / TO * 100).toFixed(2)}% ${bias === 1 ? 'below' : 'above'} the true open ${f2(TO)}. Waiting for a rejection of it between 9:30 and 11:00.`;
    if (!bias) return { draw, note, gen: () => null };
    return { draw, note, win: x => x.m >= 570 && x.m < 660, gen(i) {
      const x = b[i]; if (bias === -1 ? !(x.h >= TO && x.c < TO) : !(x.l <= TO && x.c > TO)) return null;
      const stop = snap(bias === -1 ? maxH(b, i - 5, i) + TICK : minL(b, i - 5, i) - TICK); if (!rrOK(x.c, stop)) return null; const R = Math.abs(x.c - stop);
      return { dir: bias, entry: null, stop, target: snap(x.c + bias * cfg.rr * R), why: `Rejected the true open ${f2(TO)} in the New York quarter (London ran ${bias === -1 ? 'above' : 'below'} it)` };
    } };
  } });

/* ---------- 5. Liquidity raid (equal highs / lows) ---------- */
const liq = fut({ id: 'liq', name: 'Liquidity Raid', icon: 'scales',
  blurb: 'Equal highs and equal lows are where stops pile up. When price raids one and immediately fails back (a turtle soup), the bot trades the reversal.',
  how: ['Pools: two 5-minute swing highs (lows) within the set tolerance of each other in the last six hours, never traded through since the second one formed.', 'Trigger, 9:30 to 12:00 ET: a candle trades through the pool by at least one tick and CLOSES back on the other side. Entry at the next open.',
    'A candle that closes beyond the pool instead spends it (a real breakout, no trade).', 'Stop: one tick past the raid candle\'s extreme. Target: reward-to-risk multiple. Flat by 15:55.'],
  defaults: { rr: 2, tol: .03 }, params: [{ k: 'rr', label: 'Reward to risk', min: 1, max: 4, step: .5, unit: '× reward to risk' }, { k: 'tol', label: 'Equal within', min: .01, max: .1, step: .01, unit: '% of price' }],
  idle: 'Watching equal highs and lows for a raid that fails.',
  setup({ b, S }, cfg) {
    const pools = [], levels = [], seen = new Set();
    const scan = (upto) => { // pivots confirmed by candle `upto`, from six hours before the open on
      for (let j = Math.max(2, S.first - 72); j <= upto - 2; j++) { if (seen.has(j)) continue; seen.add(j);
        for (const [is, side] of [[pivH, 'high'], [pivL, 'low']]) { if (!is(b, j)) continue; const p = side === 'high' ? b[j].h : b[j].l, tol = Math.max(2 * TICK, cfg.tol / 100 * p);
          for (const q of pools.filter(x => x.side === side && !x.pair && Math.abs(x.p - p) <= tol)) { const lvl = side === 'high' ? Math.max(q.p, p) : Math.min(q.p, p);
            if (side === 'high' ? maxH(b, q.j + 1, j - 1) > lvl : minL(b, q.j + 1, j - 1) < lvl) continue; const pool = { side, p: lvl, j, t: b[j].t, pair: true, used: false }; pools.push(pool); levels.push({ y: lvl, name: side === 'high' ? 'equal highs' : 'equal lows', color: side === 'high' ? 'var(--down)' : 'var(--up)', t0: b[q.j].t, dash: '2 3' }); break; }
          pools.push({ side, p, j, pair: false }); } } };
    return { i0: S.first, draw: { levels }, gen(i) {
      scan(i); const x = b[i];
      for (const P of pools.filter(p => p.pair && !p.used && p.j < i)) {
        if (P.side === 'high' ? x.h > P.p : x.l < P.p) { P.used = true; const dir = P.side === 'high' ? -1 : 1;
          if (dir === -1 ? !(x.h >= P.p + TICK && x.c < P.p) : !(x.l <= P.p - TICK && x.c > P.p)) continue; // closed beyond it: a real breakout, the pool is spent
          const stop = snap(dir === -1 ? x.h + TICK : x.l - TICK); if (!rrOK(x.c, stop)) continue; const R = Math.abs(x.c - stop);
          return { dir, entry: null, stop, target: snap(x.c + dir * cfg.rr * R), why: `Raided the equal ${P.side}s at ${f2(P.p)} and closed back ${dir === -1 ? 'below' : 'above'}` }; } }
      return null; } };
  } });

/* ---------- 6. Auction market theory (the 80% rule) ---------- */
const amt = fut({ id: 'amt', name: 'AMT Value Area', icon: 'flask',
  blurb: 'Auction Market Theory: yesterday\'s volume profile sets value (the point of control and the 70% value area). When the market opens outside value and then accepts back inside, it tends to rotate to the other side of value (the 80% rule).',
  how: ['Profile: the previous session (9:30 to 16:00), each 5-minute candle\'s volume spread evenly across its range in price bins of about 0.04%. Point of control = the busiest bin; value area = the 70% of volume around it.',
    'Open outside value: today\'s 9:30 open above the value-area high (or below the low).', 'Acceptance: two 5-minute closes in a row back inside value between 9:30 and 12:00. Entry at the next open.',
    'Target: the far side of value. Stop: one tick past today\'s extreme so far. Skipped if the target is less than one risk away. One trade a day, flat by 15:55.'],
  defaults: { max: 1 }, params: [],
  setup(ctx, cfg) {
    const { b, ses, k, S } = ctx; if (k < 1) { ctx.note = 'Needs the previous session.'; return null; } const pv = ses[k - 1], bars = b.slice(pv.first, pv.last + 1).filter(x => x.m >= 570 && x.m < 960), vol = bars.reduce((a, x) => a + x.v, 0);
    if (bars.length < 40 || !(vol > 0)) { ctx.note = 'The previous session has no volume data.'; return null; }
    const bin = Math.max(TICK, snap(bars[bars.length - 1].c * .0004)), lo = Math.floor(Math.min(...bars.map(x => x.l)) / bin) * bin, n = Math.ceil((Math.max(...bars.map(x => x.h)) - lo) / bin) + 1, h = new Array(n).fill(0);
    for (const x of bars) { const a = Math.floor((x.l - lo) / bin), z = Math.floor((x.h - lo) / bin), w = x.v / (z - a + 1); for (let q = a; q <= z; q++) h[q] += w; }
    let poc = h.indexOf(Math.max(...h)), A = poc, Z = poc, acc = h[poc]; while (acc < .7 * vol && (A > 0 || Z < n - 1)) { const up = Z < n - 1 ? h[Z + 1] : -1, dn = A > 0 ? h[A - 1] : -1; if (up >= dn) acc += h[++Z]; else acc += h[--A]; }
    const POC = lo + (poc + .5) * bin, VAH = lo + (Z + 1) * bin, VAL = lo + A * bin, open = b[S.first].o, side = open > VAH ? -1 : open < VAL ? 1 : 0;
    const draw = { levels: [{ y: VAH, name: 'value high', color: '#64b5ff', t0: b[pv.first].t }, { y: VAL, name: 'value low', color: '#64b5ff', t0: b[pv.first].t }, { y: POC, name: 'point of control', color: '#ff9f0a', t0: b[pv.first].t, dash: '' }],
      zones: [{ y0: VAL, y1: VAH, t0: b[pv.first].t, color: 'rgba(100,181,255,.08)', name: 'value area' }], profile: { lo, bin, h: h.map(v => Math.round(v)) } };
    if (!side) return { draw, note: `Opened inside yesterday's value (${f2(VAL)} to ${f2(VAH)}): a balanced open, no 80% setup today.`, gen: () => null };
    return { draw, note: `Opened ${side === -1 ? 'above' : 'below'} value at ${f2(open)}. Waiting for two closes back inside (${side === -1 ? 'below ' + f2(VAH) : 'above ' + f2(VAL)}).`, gen(i) {
      if (i < S.first + 1) return null; const x = b[i], p = b[i - 1], inside = y => side === -1 ? y.c < VAH && y.c > VAL : y.c > VAL && y.c < VAH; if (!inside(x) || !inside(p) || p.m < 570) return null;
      const stop = snap(side === -1 ? maxH(b, S.first, i) + TICK : minL(b, S.first, i) - TICK), target = snap(side === -1 ? VAL : VAH), R = Math.abs(x.c - stop);
      if (!rrOK(x.c, stop) || Math.abs(target - x.c) < R) return null;
      return { dir: side, entry: null, stop, target, why: `Opened ${side === -1 ? 'above' : 'below'} value and closed back inside twice: rotation to the other side of value (${f2(target)})` };
    } };
  } });

module.exports = { STRATS: [fvg, fib, stdv, qt, liq, amt], fut };
