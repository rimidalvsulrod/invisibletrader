// Auto choose: ranks the bots that trade a symbol and recommends one for the market as it is now.
// Evidence only: each bot's own rules are replayed over the last 40 sessions (the same backtests the Bots pages show). Where the trades have dated sessions, half the score
// comes from the 15 past sessions that began most like the market now: a session's starting state = efficiency ratio (how straight the last 6.5 hours moved: trending or
// choppy) and volatility, both measured on the 78 five-minute candles BEFORE the session opened, so nothing later leaks in. The score is the average R per session, pulled toward
// zero by 8 sessions of "no edge", so a bot with a lucky handful of trades cannot top the list. A bot needs 8 trades in the window to be ranked. The pick is a suggestion, not a promise.
const L = require('./lab'), ICT = require('./ict'), P = require('./powell');
const WIN = 40, NEAR = 15, SHRINK = 8, MIN_TR = 8, BAR = 78, CH = { 'NQ=F': 'NQ', 'MNQ=F': 'NQ', 'ES=F': 'ES', 'MES=F': 'ES', 'BTC-USD': 'BTC' }, toWant = s => CH[s] || s;
const R2 = x => Math.round(x * 100) / 100, sgn = x => (x >= 0 ? '+' : '') + R2(x);
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) || 1; };
const pctRank = (a, v) => a.filter(x => x <= v).length / a.length;

function stateAt(b, end) { // the 78 candles that closed before index `end`
  const s = b.slice(Math.max(0, end - BAR), end); if (s.length < BAR * .8) return null; let path = 0, tr = 0;
  for (let i = 1; i < s.length; i++) { path += Math.abs(s[i].c - s[i - 1].c); tr += Math.max(s[i].h - s[i].l, Math.abs(s[i].h - s[i - 1].c), Math.abs(s[i].l - s[i - 1].c)); }
  const px = s[s.length - 1].c; return { er: path ? Math.abs(px - s[0].c) / path : 0, vol: tr / (s.length - 1) / px };
}

// what a bot did: dated trades ({ date, r }) when the rules can be replayed session by session, else totals ({ n, totalR, days })
async function record(k, want, ctx) {
  if (k.startsWith('b_') && L.REG[k.slice(2)]) { const s = L.REG[k.slice(2)]; if (s.kind !== 'bars') return null; const cfg = L.norm(s, { sym: s.syms ? want : undefined });
    if (s.group === 'ICT' && ctx.b) { const trades = []; for (const j of ctx.idx) for (const t of s.run(ctx.b, ctx.ses, j, cfg, Infinity, ctx.atr).trades) { const R = Math.abs(t.entry - t.stop); if (R > 0 && t.exit != null) trades.push({ date: ctx.ses[j].date, r: (t.exit - t.entry) * t.dir / R }); } return { trades }; }
    const bt = await s.backtest(cfg, WIN); return bt?.n != null ? { n: bt.n, totalR: bt.totalR, days: bt.days || WIN } : null; }
  if (k === 'b_powell') { const d = await P.candles(want), dates = new Set(ctx.idx.map(j => ctx.ses[j].date)); return { trades: P.analyze(d.days).filter(r => r.signal && !r.signal.skip && r.signal.r != null && (!ctx.b || dates.has(r.date))).map(r => ({ date: r.date, r: r.signal.r })) }; }
  if (k === 'b_sweep') { const bt = await require('./ictbot').backtestRun(want, require('./ictbot').DEF, WIN); return { n: bt.n, totalR: bt.totalR, days: bt.days || WIN }; }
  if (k === 'b_supertrend') { const ST = require('./supertrend'), bt = (await ST.chartData(want, { sym: want, atr: ST.DEF.atr, mult: ST.DEF.mult, adx: true, max: 3, risk: .5 })).backtest; return { n: bt.trades, totalR: bt.avgStop ? bt.totalPts / bt.avgStop : 0, days: bt.days || WIN }; }
  return null; // GEX, Swing, Newsflash, BTC Up or Down, portfolio bots: no comparable record
}

const CACHE = new Map();
async function auto(chartSym) {
  const hit = CACHE.get(chartSym); if (hit && Date.now() - hit.at < 6e4) return hit.v;
  const want = toWant(chartSym), list = require('./botsig').list().filter(x => !x.syms || x.syms.some(y => toWant(y) === want));
  let b = null, ses = null, idx = [], atr = null, now = null, hist = []; // market state needs candles we have (NQ / ES / SPY); other symbols are ranked on their records alone
  try { b = await L.bars5(want, 3e5); ses = ICT.sessions(b); atr = ICT.atrSeries(b); idx = ses.map((_, j) => j).slice(-WIN);
    hist = idx.map(j => ({ j, st: stateAt(b, ses[j].first) })).filter(h => h.st); now = stateAt(b, L.closedUpto(b)); } catch (e) { b = null; }
  const ctx = { b, ses, idx, atr }, ers = hist.map(h => h.st.er), vols = hist.map(h => Math.log(h.st.vol)), sE = ers.length ? sd(ers) : 1, sV = vols.length ? sd(vols) : 1;
  const near = new Set(now ? hist.map(h => ({ j: h.j, d: ((h.st.er - now.er) / sE) ** 2 + ((Math.log(h.st.vol) - Math.log(now.vol)) / sV) ** 2 })).sort((a, c) => a.d - c.d).slice(0, NEAR).map(h => h.j) : []); // the 15 sessions that began most like now
  const days = b ? idx.length : WIN, rows = (await Promise.all(list.map(async x => { let rec = null; try { rec = await record(x.k, want, ctx); } catch (e) { rec = null; }
    if (!rec) return { k: x.k, name: x.name, scored: false, why: 'no backtest record to compare' };
    if (rec.trades) { const T = rec.trades, n = T.length, tot = T.reduce((a, t) => a + t.r, 0), wins = T.filter(t => t.r > 0).length, per = new Map(); for (const t of T) per.set(t.date, (per.get(t.date) || 0) + t.r);
      const all = idx.map(j => per.get(ctx.ses[j].date) || 0), overall = all.reduce((a, c) => a + c, 0) / (all.length + SHRINK), tailored = near.size >= 10;
      const sim = [...near].map(j => per.get(ctx.ses[j].date) || 0), simR = sim.reduce((a, c) => a + c, 0), simScore = simR / (sim.length + SHRINK), score = tailored ? (overall + simScore) / 2 : overall; // half the full record, half the sessions like now
      return { k: x.k, name: x.name, scored: true, ok: n >= MIN_TR, n, win: n ? wins / n : 0, totalR: tot, score, tailored, similar: near.size, simR: tailored ? simR : null, days,
        why: n < MIN_TR ? `only ${n} trade${n == 1 ? '' : 's'} in ${days} sessions, too few to judge` : `${n} trades, ${Math.round(wins / n * 100)}% winners, ${sgn(tot)}R in ${days} sessions${tailored ? `; ${sgn(simR)}R in the ${near.size} sessions that began most like now` : ''}` }; }
    const n = rec.n || 0, score = rec.totalR / ((rec.days || WIN) + SHRINK);
    return { k: x.k, name: x.name, scored: true, ok: n >= MIN_TR, n, totalR: rec.totalR, score, tailored: false, days: rec.days || WIN,
      why: n < MIN_TR ? `only ${n} trade${n == 1 ? '' : 's'} in ${rec.days || WIN} sessions, too few to judge` : `${n} trades, ${sgn(rec.totalR)}R in ${rec.days || WIN} sessions (overall record; not tailored to today)` }; }))).sort((a, c) => (c.ok ? c.score : -1e9) - (a.ok ? a.score : -1e9));
  const ranked = rows.filter(r => r.scored), best = ranked.find(r => r.ok) || null;
  const trend = now ? (pctRank(ers, now.er) >= .67 ? 'trending' : pctRank(ers, now.er) <= .33 ? 'choppy' : 'mixed') : null, vol = now ? (pctRank(vols, Math.log(now.vol)) >= .67 ? 'high' : pctRank(vols, Math.log(now.vol)) <= .33 ? 'low' : 'normal') : null;
  const e = P.et(Date.now() / 1000), dow = new Date().getUTCDay(), open = dow > 0 && dow < 6 && e.m >= 570 && e.m < 960;
  const state = now ? { er: R2(now.er), trend, vol, text: `${trend} (efficiency ${R2(now.er)}), ${vol} volatility versus the last ${hist.length} sessions` } : null;
  const v = { sym: want, state, open, days, pick: best ? best.k : null, weak: !!best && best.score <= 0, ranked, skipped: rows.filter(r => !r.scored).map(r => r.name),
    note: !best ? `No bot has enough trades on ${want} in the last ${WIN} sessions to judge (each needs ${MIN_TR}).` : best.score <= 0 ? `No bot shows a positive record on ${want} in this kind of market. ${best.name} is the least bad, so staying out is also a fair choice.` : `${best.name}: ${best.why}.` };
  CACHE.set(chartSym, { at: Date.now(), v }); return v;
}
module.exports = { auto };
