// Quant family (Strategy Lab): daily portfolio rules. Each one turns daily closes into target weights; the shared simulator below is the backtest,
// the chart and the paper bot. Weights decided at a day's close are traded the NEXT trading day (no peeking), and every change pays 0.05% a side.
// Data: Yahoo Finance daily closes adjusted for dividends and splits (shared, stored in labpx), FRED for macro series, SEC EDGAR Form 4 for insider buys.
const L = require('../lab'), Y = require('../yahoo'), db = require('../db'), S = require('../settings'), P = require('../powell');
const COST = .0005, YRS = [[1, 'Last year'], [3, '3 years'], [5, '5 years'], [8, '8 years']];
const pct = x => (x * 100).toFixed(0) + '%', f2 = x => Number(x).toFixed(2);

/* ---------- data ---------- */
const PX = new Map(), etNow = () => P.et(Date.now() / 1000);
async function daily(sym) { // { d: ['YYYY-MM-DD'], c: [adjusted close] } of COMPLETED days (today's bar is dropped until 16:00 ET)
  const m = PX.get(sym); let v = m && Date.now() - m.at < 3 * 36e5 ? m : null;
  if (!v) { const row = await db.one('SELECT at, data FROM labpx WHERE sym=$1', [sym]).catch(() => null);
    if (row && Date.now() - Number(row.at) < 12 * 36e5) v = { at: Number(row.at), ...JSON.parse(row.data) };
    else try { const j = await Y.chart(sym, 'range=10y&interval=1d', 3 * 36e5), r = j?.chart?.result?.[0]; if (!r?.timestamp) throw new Error('no daily data for ' + sym);
      const ac = r.indicators.adjclose?.[0]?.adjclose || r.indicators.quote[0].close, d = [], c = []; r.timestamp.forEach((ts, i) => { const x = ac[i]; if (x == null || !(x > 0)) return; const dd = P.et(ts).date; if (d[d.length - 1] === dd) { c[c.length - 1] = +x.toPrecision(6); return; } d.push(dd); c.push(+x.toPrecision(6)); });
      v = { at: Date.now(), d, c }; await db.q('INSERT INTO labpx (sym, at, data) VALUES ($1,$2,$3) ON CONFLICT (sym) DO UPDATE SET at=$2, data=$3', [sym, v.at, JSON.stringify({ d, c })]).catch(() => {});
    } catch (e) { if (row) v = { at: Number(row.at), ...JSON.parse(row.data) }; else throw e; }
    PX.set(sym, v); }
  const n = etNow(); if (v.d[v.d.length - 1] === n.date && n.m < 960) return { d: v.d.slice(0, -1), c: v.c.slice(0, -1) }; return v;
}
const FR = new Map();
async function fred(id) { // Map date -> value (FRED publishes with about a day's delay; the aligner uses only values dated BEFORE each day)
  const m = FR.get(id); if (m && Date.now() - m.at < 6 * 36e5) return m.v;
  let txt = null; for (let a = 0; a < 3 && !txt; a++) { try { const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id, { headers: { 'user-agent': ['curl/8.5.0', 'Wget/1.21', 'MimicLab/1.0'][a] }, signal: AbortSignal.timeout(20e3) }); if (r.ok) txt = await r.text(); } catch (e) {} if (!txt) await new Promise(z => setTimeout(z, 1500 * (a + 1))); }
  let v = []; if (txt) { for (const ln of txt.split('\n').slice(1)) { const [d, x] = ln.trim().split(','); if (d && x && x !== '.' && Number.isFinite(+x)) v.push([d, +x]); } }
  if (v.length > 100) await db.q('INSERT INTO labpx (sym, at, data) VALUES ($1,$2,$3) ON CONFLICT (sym) DO UPDATE SET at=$2, data=$3', ['FRED:' + id, Date.now(), JSON.stringify(v)]).catch(() => {});
  else { const row = await db.one('SELECT data FROM labpx WHERE sym=$1', ['FRED:' + id]).catch(() => null); if (row) v = JSON.parse(row.data); else if (m) return m.v; else throw new Error('FRED (St. Louis Fed) is not answering right now; try again in a minute'); }
  FR.set(id, { at: Date.now(), v }); return v;
}
const alignLag = (dates, series) => { const out = new Array(dates.length).fill(null); let j = 0, last = null; for (let i = 0; i < dates.length; i++) { while (j < series.length && series[j][0] < dates[i]) last = series[j++][1]; out[i] = last; } return out; };
async function load(syms) { // aligned on SPY's trading days, forward-filled
  const all = [...new Set(['SPY', ...syms])], raw = {}; for (const s of all) { try { raw[s] = await daily(s); } catch (e) { if (s === 'SPY') throw e; } }
  const dates = raw.SPY.d, px = {}; for (const s of all) { if (!raw[s]) continue; const m = new Map(raw[s].d.map((d, i) => [d, raw[s].c[i]])), a = new Array(dates.length).fill(null); let last = null; for (let i = 0; i < dates.length; i++) { const x = m.get(dates[i]); if (x != null) last = x; a[i] = last; } px[s] = a; }
  return { dates, px, N: dates.length };
}
async function spark(syms) { // live prices, 20 at a time
  const out = {}; for (let k = 0; k < syms.length; k += 20) { const j = await Y.get('/v7/finance/spark?symbols=' + syms.slice(k, k + 20).map(encodeURIComponent).join(',') + '&range=1d&interval=5m', 3e4);
    for (const r of j?.spark?.result || []) { const m = r.response?.[0]?.meta; if (m?.regularMarketPrice > 0) out[r.symbol] = { px: m.regularMarketPrice, t: m.regularMarketTime * 1000 }; } } return out;
}

/* ---------- helpers on aligned closes ---------- */
const sma = (a, i, n) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) { if (a[k] == null) return null; s += a[k]; } return s / n; };
const ret = (a, i, n) => a[i] != null && a[i - n] != null ? a[i] / a[i - n] - 1 : null;
const vol = (a, i, n) => { if (i < n) return null; const r = []; for (let k = i - n + 1; k <= i; k++) { if (a[k] == null || a[k - 1] == null) return null; r.push(Math.log(a[k] / a[k - 1])); } const m = r.reduce((x, y) => x + y, 0) / n; return Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)) * Math.sqrt(252); };
const rsi = (a, i, n) => { if (i < n + 20) return null; let g = 0, l = 0; const k0 = i - n - 20; for (let k = k0 + 1; k <= i; k++) { const d = a[k] - a[k - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (k <= k0 + n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } } return l === 0 ? 100 : 100 - 100 / (1 + g / l); };
const newMonth = (D, i) => i > 0 && D.dates[i].slice(0, 7) !== D.dates[i - 1].slice(0, 7);
const newWeek = (D, i) => { if (i === 0) return false; const a = new Date(D.dates[i] + 'T12:00Z'), b = new Date(D.dates[i - 1] + 'T12:00Z'); return a.getUTCDay() < b.getUTCDay() || a - b > 4 * 864e5; };
const when = { day: () => true, week: newWeek, month: newMonth };

/* ---------- the simulator ---------- */
function sim(s, D, cfg, i0) {
  const st = {}, curve = [], log = []; let w = {}, pend = null, eq = 1, warm = s.warm || 260; i0 = Math.max(i0, warm);
  for (let i = i0; i < D.N; i++) {
    if (i > i0) { let r = 0; const nw = {}; for (const [k, x] of Object.entries(w)) { const a = D.px[k]?.[i - 1], b = D.px[k]?.[i]; const g = a && b ? b / a - 1 : 0; r += x * g; nw[k] = x * (1 + g); } eq *= 1 + r; for (const k in nw) nw[k] /= 1 + r; w = nw; }
    if (pend) { let to = 0; for (const k of new Set([...Object.keys(w), ...Object.keys(pend.w)])) to += Math.abs((pend.w[k] || 0) - (w[k] || 0)); eq *= 1 - to * COST; if (to > .02) log.push({ i, date: D.dates[i], w: pend.w, why: pend.why, eq0: eq }); w = { ...pend.w }; pend = null; }
    if ((when[s.every] || when.month)(D, i) || i === i0) { const r = s.weights(D, i, cfg, st); if (r) pend = { w: Object.fromEntries(Object.entries(r.w).filter(([, x]) => Math.abs(x) > 1e-4)), why: r.why || '' }; }
    curve.push(eq);
  }
  return { curve, log, w, pend, st, i0 };
}
const holdTxt = w => { const e = Object.entries(w).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])); return e.length ? e.map(([k, x]) => `${k} ${x < 0 ? '-' : ''}${pct(Math.abs(x))}`).join(', ') : 'cash'; };
function summary(s, D, r, bench = 'SPY') {
  const c = r.curve, n = c.length, rets = c.slice(1).map((x, i) => x / c[i] - 1), m = rets.reduce((a, b) => a + b, 0) / (rets.length || 1), sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length - 1));
  let pk = 0, dd = 0; for (const x of c) { pk = Math.max(pk, x); dd = Math.min(dd, x / pk - 1); } const b = D.px[bench], b0 = b[r.i0], b1 = b[D.N - 1];
  const step = Math.max(1, Math.round(n / 160)), curve = []; for (let k = 0; k < n; k += step) curve.push([D.dates[r.i0 + k], +c[k].toFixed(4)]); curve.push([D.dates[D.N - 1], +c[n - 1].toFixed(4)]);
  const trades = r.log.slice(-15).map((x, j, arr) => { const nx = arr[j + 1], endEq = nx ? nx.eq0 : c[n - 1]; return { date: x.date, what: holdTxt(x.w), why: x.why, ret: endEq / x.eq0 - 1 }; }).reverse();
  return { port: true, from: D.dates[r.i0], to: D.dates[D.N - 1], ret: c[n - 1] - 1, cagr: Math.pow(c[n - 1], 252 / Math.max(1, n - 1)) - 1, sharpe: sd ? m / sd * Math.sqrt(252) : 0, maxDD: dd, bench, benchRet: b1 / b0 - 1, n: r.log.length, curve, trades, warn: s.honest || null };
}

/* ---------- the factory ---------- */
function port(def) {
  const s = { kind: 'port', group: 'Quant', bt: { opts: YRS, def: 5, unit: 'years' }, every: 'month', dataNote: 'Free Yahoo Finance daily closes (adjusted for dividends and splits). Weights decided at a close are traded the next trading day; every change pays 0.05% a side.', ...def, defaults: { ...def.defaults } };
  s.universe = def.universe || (async () => def.syms); s.syms = null; // the universe is data, not a market to pick
  s.data = async cfg => { const D = await load(await s.universe(cfg)); if (def.extra) await def.extra(D, cfg); return D; };
  s.backtest = async (cfg, years) => { const D = await s.data(cfg), r = sim(s, D, cfg, D.N - Math.round(years * 252)); const out = summary(s, D, r, def.bench); if (r.i0 > D.N - years * 252 + 5) out.note = `data from ${out.from}`; return out; };
  s.target = async cfg => { const D = await s.data(cfg), r = sim(s, D, cfg, D.N - 300); return { D, r, w: r.pend ? r.pend.w : r.w, why: r.pend ? r.pend.why : (r.log[r.log.length - 1]?.why || ''), since: r.log[r.log.length - 1]?.date || null }; };
  s.view = async (cfg, ctx = {}) => {
    const { D, r, w, why, since } = await s.target(cfg), openRows = ctx.uid ? await db.q("SELECT sym FROM labtrades WHERE uid=$1 AND strat=$2 AND status='open'", [ctx.uid, s.id]) : [];
    const syms = [...new Set([...Object.keys(w), ...openRows.map(x => x.sym)])], live = syms.length ? await spark(syms).catch(() => ({})) : {}, marks = Object.fromEntries(Object.entries(live).map(([k, v]) => [k, v.px]));
    const c = r.curve.slice(-252), d0 = D.N - c.length;
    return { status: (def.status ? def.status(r.st, w, cfg) + ' ' : '') + `Target: ${holdTxt(w)}${since ? ` (last change ${since})` : ''}. ${def.everyTxt || 'Checked on the first trading day of each month.'}`,
      line: c.map((v, k) => [Date.parse(D.dates[d0 + k] + 'T20:00:00Z'), +(v / c[0] * 100).toFixed(2)]), holdTitle: 'Target holdings', holdings: Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, x]) => ({ sym: k, w: x, px: marks[k] || D.px[k]?.[D.N - 1], why })), marks, t: Date.now() };
  };
  s.live = async (row, cfg, H, force) => { // on trading days 9:45 to 15:59 ET: bring the paper holdings to the target (once a day, and right after the bot is switched on)
    const n = etNow(), dow = new Date(n.date + 'T12:00Z').getUTCDay(); if (!force && (dow === 0 || dow === 6 || n.m < 585 || n.m >= 959)) return;
    const k = row.uid + s.id, done = DONE.get(k); if (done && done.date === n.date && done.since === Number(row.since || 0)) return;
    const { w, why } = await s.target(cfg), rows = await db.q("SELECT * FROM labtrades WHERE uid=$1 AND strat=$2 AND status='open'", [row.uid, s.id]);
    const live = await spark([...new Set([...Object.keys(w), ...rows.map(x => x.sym)])]); if (!live.SPY && !Object.keys(live).length) return; // no prices: try again next tick
    const fresh = Object.values(live).some(v => Date.now() - v.t < 30 * 6e4); if (!fresh && !force) return; // the market is closed today (holiday)
    const acct = await H.account(row.uid, s.id, row.paper); let eq = acct.equity; for (const r of rows) if (live[r.sym]) eq += L.pnlOf(r.sym, r.dir, Number(r.qty), Number(r.entry), live[r.sym].px);
    const keep = new Set();
    for (const r of rows) { const p = live[r.sym]?.px; if (!p) { keep.add(r.sym); continue; } const tw = w[r.sym] || 0, sg = r.dir === 'long' ? 1 : -1, cur = Number(r.qty) * p * sg, want = tw * eq;
      if (tw && Math.sign(tw) === sg && Math.abs(want - cur) <= .25 * Math.abs(want)) keep.add(r.sym); else await H.closeRow(r, p, 'rebalance'); }
    for (const [sym, x] of Object.entries(w)) { if (keep.has(sym)) continue; const p = live[sym]?.px; if (!p) continue; const qty = Math.floor(Math.abs(x) * eq / p * 1e4) / 1e4; if (!(qty > 0)) continue;
      await db.q("INSERT INTO labtrades (id, uid, strat, key, ts, day, sym, dir, qty, entry, stop, tp, status, why) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,null,'open',$11) ON CONFLICT (uid, strat, key) DO NOTHING",
        [L.ID(), row.uid, s.id, `${s.id}:${sym}:${Date.now()}`, Date.now(), n.date, sym, x > 0 ? 'long' : 'short', qty, p, `${pct(Math.abs(x))} of the account. ${why}`.slice(0, 400)]); }
    DONE.set(k, { date: n.date, since: Number(row.since || 0) });
  };
  return s;
}
const DONE = new Map();

/* ---------- 1. Quant RSI-2 (short-term mean reversion in an uptrend) ---------- */
const quant = port({ id: 'quant', name: 'Quant RSI-2', icon: 'flask', every: 'day', syms: ['SPY', 'QQQ', 'IWM'], everyTxt: 'Checked every day at the close.',
  blurb: 'A classic, published quant rule: in a long-term uptrend, buy the index after a sharp 2-day dip (RSI-2 very low) and sell as soon as it bounces above its 5-day average.',
  how: ['Uptrend filter: the close is above its 200-day average.', 'Buy: the 2-day RSI closes below the entry level (default 10).', 'Sell: the close is back above the 5-day average, or after 10 trading days.', 'In cash otherwise. Trades the next day.'],
  defaults: { sym: 'SPY', lvl: 10 }, params: [{ k: 'lvl', label: 'RSI-2 entry level', min: 2, max: 30, step: 1, unit: 'buy when RSI-2 is below', int: true }], choices: { sym: ['SPY', 'QQQ', 'IWM'] }, choiceLabels: { sym: 'Market' },
  weights(D, i, cfg, st) { const a = D.px[cfg.sym]; if (!a?.[i]) return null; const up = a[i] > sma(a, i, 200), r2 = rsi(a, i, 2);
    if (st.in) { st.days = (st.days || 0) + 1; if (a[i] > sma(a, i, 5) || st.days >= 10) { st.in = false; return { w: {}, why: st.days >= 10 ? 'time limit' : 'bounced above the 5-day average' }; } return null; }
    if (up && r2 != null && r2 < cfg.lvl) { st.in = true; st.days = 0; return { w: { [cfg.sym]: 1 }, why: `RSI-2 ${r2.toFixed(1)} in an uptrend` }; } return null; },
  status: (st, w, cfg) => st.in ? `In ${cfg.sym} for ${st.days} day${st.days === 1 ? '' : 's'}.` : `Waiting for a 2-day dip in ${cfg.sym}.` });

/* ---------- 2. Top Picks (risk-adjusted momentum among large caps) ---------- */
const BIG = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'BRK-B', 'JPM', 'V', 'MA', 'UNH', 'XOM', 'LLY', 'AVGO', 'HD', 'PG', 'COST', 'JNJ', 'WMT', 'KO', 'PEP', 'MRK', 'ABBV', 'CVX', 'BAC', 'ORCL', 'ADBE', 'CRM', 'NFLX', 'AMD', 'TMO', 'MCD', 'CSCO', 'ACN', 'LIN', 'INTU', 'TXN', 'QCOM', 'IBM', 'CAT'];
const top = port({ id: 'top', name: 'Top Picks', icon: 'trophy', syms: BIG,
  blurb: 'Each month buys the large-cap stocks with the strongest steady trend: 12-month momentum (skipping the last month) divided by volatility, only stocks above their 200-day average.',
  how: ['Universe: 40 of the largest US stocks.', 'Score: return from 12 months ago to 1 month ago, divided by the last 3 months\' volatility.', 'Only stocks above their 200-day average qualify. Buy the top N, equal weight.', 'Market filter (optional): when SPY is below its 200-day average, hold half in cash.', 'Rebalanced on the first trading day of each month.'],
  defaults: { n: 8, mkt: 'on' }, params: [{ k: 'n', label: 'Stocks held', min: 3, max: 15, step: 1, unit: 'stocks', int: true }], choices: { mkt: ['on', 'off'] }, choiceLabels: { mkt: 'Market filter (half cash when SPY is in a downtrend)' },
  honest: 'Survivorship bias: the 40 stocks are today\'s giants, picked with hindsight, so the backtest looks better than real life would have. Treat the result as an upper bound.',
  weights(D, i, cfg) { const sc = []; for (const s of BIG) { const a = D.px[s]; if (!a?.[i] || !a[i - 252]) continue; const m = ret(a, i - 21, 231), v = vol(a, i, 63); if (m == null || !v || a[i] < sma(a, i, 200)) continue; sc.push([s, m / v]); }
    sc.sort((x, y) => y[1] - x[1]); const pick = sc.slice(0, cfg.n), half = cfg.mkt === 'on' && D.px.SPY[i] < sma(D.px.SPY, i, 200); if (!pick.length) return { w: {}, why: 'nothing qualifies' };
    const x = (half ? .5 : 1) / pick.length; return { w: Object.fromEntries(pick.map(([s]) => [s, x])), why: `top ${pick.length} by risk-adjusted momentum${half ? ' (SPY in a downtrend: half in cash)' : ''}` }; } });

/* ---------- 3. Proven Trend (time-series momentum across asset classes) ---------- */
const ASSETS = ['SPY', 'EFA', 'EEM', 'IEF', 'TLT', 'GLD', 'DBC', 'VNQ'];
const proven = port({ id: 'proven', name: 'Proven Trend', icon: 'star', syms: [...ASSETS, 'SHY'],
  blurb: 'Trend following across stocks, bonds, gold, commodities and real estate: the most-studied "it keeps working" rule in finance research (time-series momentum, Faber 2007, Moskowitz et al. 2012).',
  how: ['Eight asset-class ETFs: US, foreign and emerging stocks, 7-10 and 20+ year Treasuries, gold, commodities, real estate.', 'Each gets an equal slot. A slot is invested only while its ETF is above its moving average (default 10 months ≈ 210 days); otherwise that slot sits in short-term Treasuries (SHY).', 'Optional: only the 4 strongest by 6-month return (momentum mode).', 'Checked on the first trading day of each month.'],
  defaults: { ma: 210, mode: 'trend' }, params: [{ k: 'ma', label: 'Moving average', min: 100, max: 250, step: 10, unit: 'trading days', int: true }], choices: { mode: ['trend', 'momentum'] }, choiceLabels: { mode: 'Mode' },
  weights(D, i, cfg) { let list = ASSETS.filter(s => D.px[s]?.[i]); if (cfg.mode === 'momentum') list = list.map(s => [s, ret(D.px[s], i, 126) ?? -9]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
    const w = {}, x = 1 / list.length; let off = 0; for (const s of list) { if (D.px[s][i] > sma(D.px[s], i, cfg.ma)) w[s] = x; else off += x; } if (off) w.SHY = off; return { w, why: `${list.length - Math.round(off / x)} of ${list.length} assets in an uptrend` }; } });

/* ---------- 4. Stat-Arb Pairs ---------- */
const PAIRS = [['KO', 'PEP'], ['V', 'MA'], ['XOM', 'CVX'], ['HD', 'LOW'], ['JPM', 'BAC'], ['WMT', 'COST'], ['GOOGL', 'META'], ['UPS', 'FDX']];
const pairs = port({ id: 'pairs', name: 'Stat-Arb Pairs', icon: 'scales', every: 'day', syms: PAIRS.flat(), everyTxt: 'Checked every day at the close.',
  blurb: 'Market-neutral statistical arbitrage: pairs of look-alike companies drift apart and come back. When the price ratio is stretched, short the rich one and buy the cheap one.',
  how: ['Eight classic pairs (KO/PEP, V/MA, XOM/CVX, HD/LOW, JPM/BAC, WMT/COST, GOOGL/META, UPS/FDX).', 'Spread: the log price ratio. Z-score over the last 60 days.', 'Open when |z| is above the entry (default 2): short the expensive leg, buy the cheap one, equal dollars.', 'Close when |z| falls below 0.5, or rises above 4 (stop), or after 20 days.', 'Each pair gets 1/8 of the account per leg.'],
  defaults: { z: 2, lb: 60 }, params: [{ k: 'z', label: 'Entry z-score', min: 1.5, max: 3, step: .25, unit: 'standard deviations' }, { k: 'lb', label: 'Lookback', min: 20, max: 120, step: 10, unit: 'days', int: true }],
  honest: 'Pairs that worked in the past can stop working for good (a business changes). Profits per trade are small, so costs matter.',
  weights(D, i, cfg, st) { st.p ||= {}; const w = {}, notes = []; let changed = !st.init; st.init = true; const x = 1 / PAIRS.length;
    for (const [a, b] of PAIRS) { const A = D.px[a], B = D.px[b]; if (!A?.[i] || !B?.[i] || i < cfg.lb) continue; const sp = []; for (let k = i - cfg.lb + 1; k <= i; k++) if (A[k] && B[k]) sp.push(Math.log(A[k] / B[k])); if (sp.length < cfg.lb * .9) continue;
      const m = sp.reduce((p, q) => p + q, 0) / sp.length, sd = Math.sqrt(sp.reduce((p, q) => p + (q - m) ** 2, 0) / (sp.length - 1)), z = sd ? (sp[sp.length - 1] - m) / sd : 0, key = a + '/' + b, cur = st.p[key];
      if (cur) { cur.d++; if (Math.abs(z) < .5 || Math.abs(z) > 4 || cur.d >= 20) { delete st.p[key]; changed = true; notes.push(`${key} closed (z ${z.toFixed(1)})`); } }
      else if (Math.abs(z) > cfg.z) { st.p[key] = { s: z > 0 ? -1 : 1, d: 0 }; changed = true; notes.push(`${key} opened (z ${z.toFixed(1)})`); }
      const p = st.p[key]; if (p) { w[a] = (w[a] || 0) + p.s * x; w[b] = (w[b] || 0) - p.s * x; } }
    return changed ? { w, why: notes.join('; ') || 'pairs updated' } : null; },
  status: st => `${Object.keys(st.p || {}).length} pair${Object.keys(st.p || {}).length === 1 ? '' : 's'} open${Object.keys(st.p || {}).length ? ': ' + Object.entries(st.p).map(([k, v]) => `${v.s > 0 ? 'long' : 'short'} ${k}`).join(', ') : ''}.` });

/* ---------- 5. Macro Regime ---------- */
const macro = port({ id: 'macro', name: 'Macro Regime', icon: 'coin', every: 'week', syms: ['SPY', 'TLT', 'GLD', 'SHY', '^VIX'], everyTxt: 'Checked on the first trading day of each week.',
  blurb: 'Reads the economy\'s risk signals (credit spreads, the yield curve, volatility and the stock trend) and moves between stocks, bonds, gold and cash.',
  how: ['Four signals, one point each when they say "risk on": SPY above its 200-day average; high-yield credit spreads (FRED BAMLH0A0HYM2) below their 6-month average; VIX below 22; the 10y-2y yield curve (FRED T10Y2Y) rising over 3 months or above 0.5.',
    '4 points: 100% SPY. 3: 70% SPY, 15% TLT, 15% GLD. 2: 40% SPY, 30% TLT, 30% GLD. 0-1: 50% SHY, 25% TLT, 25% GLD.', 'FRED values are used only from the day after their date. Checked weekly.'],
  dataNote: 'FRED (St. Louis Fed) credit spreads and yield curve, Yahoo Finance daily ETF closes and VIX. Weights trade the next day; 0.05% a side.',
  async extra(D) { const [hy, yc] = await Promise.all([fred('BAMLH0A0HYM2'), fred('T10Y2Y')]); D.hy = alignLag(D.dates, hy); D.yc = alignLag(D.dates, yc); },
  weights(D, i) { const spy = D.px.SPY, sig = []; sig.push(spy[i] > sma(spy, i, 200)); const hy = D.hy[i], hyA = sma(D.hy, i, 126); sig.push(hy != null && hyA != null && hy < hyA);
    sig.push(D.px['^VIX']?.[i] != null && D.px['^VIX'][i] < 22); const yc = D.yc[i], yc0 = D.yc[i - 63]; sig.push(yc != null && (yc > .5 || (yc0 != null && yc > yc0)));
    const n = sig.filter(Boolean).length, W = [{ SHY: .5, TLT: .25, GLD: .25 }, { SHY: .5, TLT: .25, GLD: .25 }, { SPY: .4, TLT: .3, GLD: .3 }, { SPY: .7, TLT: .15, GLD: .15 }, { SPY: 1 }][n];
    return { w: W, why: `${n}/4 risk-on (trend ${sig[0] ? 'up' : 'down'}, credit ${sig[1] ? 'calm' : 'stressed'}, VIX ${sig[2] ? 'low' : 'high'}, curve ${sig[3] ? 'healthy' : 'weak'})` }; } });

/* ---------- 6. Wall Street (insider cluster buying, SEC Form 4) ---------- */
const SEC_UA = { 'user-agent': 'MimicLab research bot admin@invisibletrader.vercel.app', accept: '*/*' };
let INS = null; const insiders = async () => INS || (INS = JSON.parse(await S.get('lab:insiders').catch(() => null) || 'null') || { buys: [], days: {}, acc: [] });
function clusters(buys, cfg) { // -> [{ sym, date (the day the cluster became public), owners, value }]
  const by = new Map(); for (const b of buys) { if (!by.has(b.sym)) by.set(b.sym, []); by.get(b.sym).push(b); } const out = [];
  for (const [sym, arr] of by) { arr.sort((a, b) => a.filed.localeCompare(b.filed)); let lastSig = null;
    for (const b of arr) { const from = new Date(Date.parse(b.filed) - 14 * 864e5).toISOString().slice(0, 10), win = arr.filter(x => x.filed >= from && x.filed <= b.filed), owners = new Set(win.map(x => x.owner)), value = win.reduce((a, x) => a + x.value, 0);
      if (owners.size >= cfg.min && value >= cfg.val * 1e3 && (!lastSig || Date.parse(b.filed) - Date.parse(lastSig) > 45 * 864e5)) { out.push({ sym, date: b.filed, owners: owners.size, value }); lastSig = b.filed; } } }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const wallst = port({ id: 'wallst', name: 'Wall Street', icon: 'book', every: 'day', warm: 5, everyTxt: 'Checked every day at the close.',
  blurb: 'Follows the people who know the company best: when two or more insiders (CEOs, CFOs, directors) buy their own stock with their own money within two weeks, the bot buys too.',
  how: ['Source: every Form 4 filed with the SEC (open-market purchases, code P, at least $10k each).', 'Signal: at least N different insiders buying a total of at least the set dollar value within 14 days. Price at least $5.', 'Buy the next trading day, 10% of the account each (at most 10 at once), hold for the set number of trading days.'],
  defaults: { min: 2, val: 250, hold: 30 }, params: [{ k: 'min', label: 'Insiders buying', min: 1, max: 4, step: 1, unit: 'different insiders', int: true }, { k: 'val', label: 'Total bought', min: 50, max: 2000, step: 50, unit: 'thousand dollars', int: true }, { k: 'hold', label: 'Hold', min: 5, max: 60, step: 5, unit: 'trading days', int: true }],
  dataNote: 'SEC EDGAR Form 4 filings (free), read by the server around the clock and back-filled for the last few weeks. Prices from Yahoo Finance.',
  honest: 'Insider buying has a long record in research, but this bot\'s own history only starts when the server began reading filings, so the backtest is short at first and grows every day.',
  async universe(cfg) { const c = clusters((await insiders()).buys, cfg); return [...new Set(c.map(x => x.sym))].slice(-60); },
  async extra(D, cfg) { D.sig = clusters((await insiders()).buys, cfg); },
  weights(D, i, cfg, st) { st.h ||= {}; const d = D.dates[i]; let ch = false;
    for (const [s, h] of Object.entries(st.h)) { h.d++; if (h.d >= cfg.hold || !D.px[s]?.[i]) { delete st.h[s]; ch = true; } }
    for (const g of D.sig || []) if (g.date <= d && g.date > (D.dates[i - 1] || '') && !st.h[g.sym] && Object.keys(st.h).length < 10 && D.px[g.sym]?.[i] >= 5) { st.h[g.sym] = { d: 0, why: `${g.owners} insiders bought $${Math.round(g.value / 1e3)}k` }; ch = true; }
    return ch ? { w: Object.fromEntries(Object.keys(st.h).map(s => [s, .1])), why: Object.entries(st.h).map(([s, h]) => `${s}: ${h.why}`).join('; ') } : null; },
  status: st => `${Object.keys(st.h || {}).length} insider pick${Object.keys(st.h || {}).length === 1 ? '' : 's'} held.` });

// the SEC reader (runner only): today's filings from the live feed, plus a slow back-fill of the last 25 trading days from EDGAR's daily index
const Q = [], QD = new Set(); let qBuilt = 0, lastAtom = 0;
const getText = async u => { const r = await fetch(u, { headers: SEC_UA, signal: AbortSignal.timeout(20e3) }); if (!r.ok) throw Object.assign(new Error('SEC ' + r.status), { status: r.status }); return r.text(); };
function parse4(x, filed) { // the purchases in one Form 4
  const v = (blk, tag) => (new RegExp(`<${tag}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${tag}>`).exec(blk) || [])[1];
  const sym = (v(x, 'issuerTradingSymbol') || '').toUpperCase().replace(/[^A-Z.\-]/g, '').replace('.', '-'), owner = v(x, 'rptOwnerName') || '?', title = v(x, 'officerTitle') || (/<isDirector>\s*(1|true)/i.test(x) ? 'Director' : ''), out = [];
  if (!sym || sym.length > 6) return out;
  for (const m of x.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g)) { const b = m[1]; if (v(b, 'transactionCode') !== 'P' || v(b, 'transactionAcquiredDisposedCode') !== 'A') continue;
    const sh = +v(b, 'transactionShares'), px = +v(b, 'transactionPricePerShare'); if (!(sh > 0 && px > 0) || sh * px < 1e4) continue; out.push({ sym, owner, title, date: (v(b, 'transactionDate') || filed).slice(0, 10), filed, value: Math.round(sh * px), px }); }
  return out;
}
async function background() {
  const I = await insiders(), now = Date.now(); let dirty = false;
  if (Q.length < 300 && now - qBuilt > 6e4) { qBuilt = now; // queue ONE daily-index day not yet read per call (last 25 trading days, newest first)
    for (let k = 1, got = 0, fetched = 0; k < 45 && got < 25 && !fetched; k++) { const d = new Date(now - k * 864e5), dow = d.getUTCDay(); if (dow === 0 || dow === 6) continue; got++; const ds = d.toISOString().slice(0, 10); if (I.days[ds] || QD.has(ds)) continue;
      fetched = 1; try { const idx = await getText(`https://www.sec.gov/Archives/edgar/daily-index/${ds.slice(0, 4)}/QTR${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}/form.${ds.replace(/-/g, '')}.idx`);
        const files = idx.split('\n').filter(l => /^4\s/.test(l)).map(l => l.trim().split(/\s{2,}/).pop()).filter(Boolean); for (const f of files) Q.push({ f, filed: ds, day: ds }); Q.push({ end: ds }); QD.add(ds); }
      catch (e) { if (e.status === 404 || e.status === 403) I.days[ds] = 'none', dirty = true; } }
  }
  if (now - lastAtom > 10 * 6e4) { lastAtom = now; try { const a = await getText('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include&count=100&output=atom'), seen = new Set(I.acc);
    for (const m of a.matchAll(/<link rel="alternate" type="text\/html" href="([^"]+)-index\.htm"\/>[\s\S]*?<updated>(\d{4}-\d{2}-\d{2})/g)) { const acc = m[1].split('/').pop(); if (seen.has(acc)) continue; seen.add(acc); Q.unshift({ f: m[1].replace('https://www.sec.gov/Archives/', '') + '.txt', filed: m[2], acc }); } } catch (e) {} }
  const t0 = Date.now(); let n = 0;
  while (Q.length && n < 25 && Date.now() - t0 < 7e3) { const j = Q.shift(); if (j.end) { I.days[j.end] = 'done'; QD.delete(j.end); dirty = true; continue; } n++;
    const acc = j.acc || j.f.split('/').pop().replace('.txt', ''); if (I.acc.includes(acc)) continue;
    try { const x = await getText('https://www.sec.gov/Archives/' + j.f); for (const b of parse4(x, j.filed)) { I.buys.push({ ...b, acc }); dirty = true; } I.acc.push(acc); if (I.acc.length > 3000) I.acc = I.acc.slice(-3000); } catch (e) { if (e.status === 429) { Q.unshift(j); break; } }
    await new Promise(z => setTimeout(z, 150)); }
  if (dirty || n) { const cut = new Date(now - 120 * 864e5).toISOString().slice(0, 10); I.buys = I.buys.filter(b => b.filed >= cut); for (const d of Object.keys(I.days)) if (d < cut) delete I.days[d]; await S.set('lab:insiders', JSON.stringify(I)); }
}
async function warm() { for (const s of [top, proven, pairs, macro]) try { await s.data(s.defaults); } catch (e) {} } // fill the shared price store so pages load fast
let lastWarm = 0;
module.exports = { STRATS: [quant, top, proven, pairs, macro, wallst], async background() { await background().catch(e => console.error('lab sec', e.message)); if (Date.now() - lastWarm > 6 * 36e5) { lastWarm = Date.now(); await warm(); } }, _t: { daily, load, sim, clusters, parse4, rsi, sma, insiders } };
