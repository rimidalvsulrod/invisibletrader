// BTC Up or Down: trades Polymarket US's Bitcoin up/down windows (15 minutes and 1 hour).
// It does not guess where Bitcoin goes next. It looks at what has already happened inside the window: how many volatilities ahead of the start price the favourite is,
// with how much time left. The chance that it holds is not the textbook formula but a table measured on real minute-by-minute history (btccal.js) with the error of our
// price feed built in, cut to a 95% lower bound. It buys only the favourite, only when that lower bound beats the ask by 2 cents after the fee, and only when the market
// is not wildly disagreeing (a 20 point gap means our price or start is probably wrong, not that the market is). Every quote it sees near the end is recorded (btcobs) so
// the strategy can be checked against what the market really offered.
// Paper mode simulates fills at the live ask and settles on Polymarket US's own result.
const crypto = require('crypto'), db = require('./db'), P = require('./polymarket-us'), S = require('./settings'), C = require('./btccal');
const TF = { '15m': 9e5, '1h': 36e5 }, DAY = 864e5;
// The only setting is trade size: a % of the balance or a fixed $. The rest is built in: the favourite only, at least 2c of edge after fees against the calibrated lower bound,
// never above 98.5c, a lead of at least 2 volatilities (below that the favourite is near a coin flip and our feed's own error is as big as any edge), skip when the market is 20+ points away from our number or the last 5 minutes are much wilder than the last hour, and stop for the day after losing 20%.
const DEF = { size: 'pct', pct: 2, usd: 5 }, MIN_EDGE = 2, MIN_Z = 2, MAX_PRICE = .985, SANITY = .2, DAILY_STOP = .05, KELLY = .25, HEALTH = { n: 15, z: 2.5, days: 14 }, TFS = ['15m', '1h'], MIN_PRICE = .5;
let CAL = null; // the calibration table (loaded from settings by the runner every few minutes)
const fee = (n, p) => 0.0695 * n * p * (1 - p);
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const iso = t => new Date(t).toISOString();
const slugOf = (tf, start) => `cpc-btc-updown-${tf}-${iso(start).slice(0, 10)}-${iso(start).slice(11, 13)}${iso(start).slice(14, 16)}z`;
// standard normal CDF (Abramowitz-Stegun 7.1.26)
function Phi(x) { const t = 1 / (1 + .3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; }
const get = u => fetch(u, { headers: { 'user-agent': 'mimic' } }).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${u.split('/')[2]}`)));

/* ---------- Bitcoin price: average of Coinbase, Kraken, Bitstamp (the exchanges behind the CF Benchmarks index US settles on) ---------- */
// live streams (runner only): every trade/ticker from the three exchanges, re-check on each move
const PX = { cb: null, kr: null, bs: null }; let onMove = null;
function streams() {
  let WebSocket; try { WebSocket = require('ws'); } catch (_) { return; }
  const open = (k, url, sub, read) => {
    const w = new WebSocket(url); let alive = Date.now();
    w.on('open', () => w.send(JSON.stringify(sub)));
    w.on('message', d => { let m; try { m = JSON.parse(d); } catch (_) { return; } const p = read(m); if (p > 1000) { PX[k] = { p, t: Date.now() }; alive = Date.now(); if (onMove) onMove(); } });
    const again = () => { clearInterval(watch); setTimeout(() => open(k, url, sub, read), 2e3); };
    const watch = setInterval(() => { if (Date.now() - alive > 6e4) { try { w.terminate(); } catch (_) {} } }, 15e3); // quiet for a minute: reconnect
    w.on('close', again); w.on('error', () => {});
  };
  open('cb', 'wss://ws-feed.exchange.coinbase.com', { type: 'subscribe', product_ids: ['BTC-USD'], channels: ['ticker'] }, m => m.type === 'ticker' && +m.price);
  open('kr', 'wss://ws.kraken.com/v2', { method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'] } }, m => m.channel === 'ticker' && m.data && +m.data[0].last);
  open('bs', 'wss://ws.bitstamp.net', { event: 'bts:subscribe', data: { channel: 'live_trades_btcusd' } }, m => m.event === 'trade' && +m.data.price);
}
async function spot() {
  // streamed prices under 15s old (median), otherwise one REST read per exchange
  const live = Object.values(PX).filter(x => x && Date.now() - x.t < 15e3).map(x => x.p);
  const v = live.length >= 2 ? live : (await Promise.all([
    get('https://api.exchange.coinbase.com/products/BTC-USD/ticker').then(j => +j.price),
    get('https://api.kraken.com/0/public/Ticker?pair=XBTUSD').then(j => +Object.values(j.result)[0].c[0]),
    get('https://www.bitstamp.net/api/v2/ticker/btcusd/').then(j => +j.last),
  ].map(p => p.catch(() => NaN)))).filter(x => x > 1000);
  if (!v.length) throw new Error('no Bitcoin price'); v.sort((a, b) => a - b); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; // median
}
let CND = { t: 0, rows: [] };
async function candles() { // Coinbase 1-minute candles, newest first: [time, low, high, open, close, volume]
  if (Date.now() - CND.t < 20e3 && CND.rows.length) return CND.rows;
  CND = { t: Date.now(), rows: await get('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60') }; return CND.rows;
}
// price "at" time t = average over the minute before t (that's how the index's start/end values are formed)
async function priceAt(t) {
  let rows = await candles(), c = rows.find(r => r[0] * 1e3 === t - 6e4);
  if (!c && Date.now() - t < 6 * 36e5) { rows = await get(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${iso(t - 18e4)}&end=${iso(t)}`).catch(() => []); c = rows.find(r => r[0] * 1e3 === t - 6e4); }
  return c ? (c[1] + c[2] + c[3] + c[4]) / 4 : NaN;
}
// price line for the 1D and 7D chart tabs: [time, close], oldest first (cached a minute)
const RNG = { '1d': [300, 288], '7d': [3600, 168] }, RC = new Map();
async function range(k) {
  const r = RNG[k]; if (!r) throw Object.assign(new Error('Pick 1d or 7d'), { status: 400 }); const hit = RC.get(k); if (hit && Date.now() - hit.t < 6e4) return hit.v;
  const end = Date.now(), rows = await get(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${r[0]}&start=${iso(end - r[0] * 1e3 * r[1])}&end=${iso(end)}`);
  const v = rows.slice().reverse().map(c => [Math.min(c[0] * 1e3 + r[0] * 1e3, end), c[4]]); RC.set(k, { t: Date.now(), v }); return v;
}
// how the last five finished windows ended (Up if the end price is at or above the start price), oldest first; finished windows never change, so they are kept
const PAST = new Map();
async function past(tf) {
  const len = TF[tf]; if (!len) throw Object.assign(new Error('Pick 15m or 1h'), { status: 400 }); const cur = Math.floor(Date.now() / len) * len;
  const rows = await Promise.all([5, 4, 3, 2, 1].map(async i => { const s = cur - i * len, key = tf + s; let r = PAST.get(key);
    if (!r) { const [a, b] = await Promise.all([priceAt(s), priceAt(s + len)]); if (a > 0 && b > 0) { r = { start: s, up: b >= a, s0: a, s1: b }; PAST.set(key, r); if (PAST.size > 200) PAST.delete(PAST.keys().next().value); } } return r; }));
  return rows.filter(Boolean);
}
// volatility per minute from the last hour of 1-minute returns (raw; the calibration table in btccal.js accounts for the model's error)
async function sigma() {
  const r = (await candles()).slice(0, 61).map(x => x[4]), L = []; for (let i = 0; i < r.length - 1; i++) L.push(Math.log(r[i] / r[i + 1]));
  const m = L.reduce((a, b) => a + b, 0) / L.length, sd = Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / (L.length - 1));
  return Math.max(sd, 2e-4);
}

async function shock() { // how wild the last 5 minutes are compared with the last hour (the volatility estimate is stale when this is high)
  const r = (await candles()).slice(0, 61).map(x => x[4]), L = []; for (let i = 0; i < r.length - 1; i++) L.push(Math.log(r[i] / r[i + 1])); const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  return Math.max(sd(L.slice(0, 5)), 1e-9) / Math.max(sd(L), 2e-4);
}
/* ---------- live Polymarket US prices: authenticated WebSocket push (falls back to paced uncached polling) ---------- */
const WQ = new Map(); let ws = null, wsUp = false, wsNext = 0, wsBack = 1e3, wsLast = 0, wsSubs = new Set(), wsErr = '';
async function feedCreds() { // market data isn't account-specific: the admin's key (or the server's env key) opens the feed
  const a = await db.one('SELECT id FROM users WHERE admin=true AND verified=true LIMIT 1').catch(() => null);
  return (a && await S.getCreds(a.id).catch(() => null)) || (process.env.POLYMARKET_US_KEY_ID && process.env.POLYMARKET_US_SECRET_KEY ? { keyId: process.env.POLYMARKET_US_KEY_ID, secret: process.env.POLYMARKET_US_SECRET_KEY } : null);
}
function wsSub(slug) { if (wsSubs.has(slug) || !wsUp) return; wsSubs.add(slug); ws.send(JSON.stringify({ subscribe: { requestId: 'btc-' + slug, subscriptionType: 'SUBSCRIPTION_TYPE_MARKET_DATA_LITE', marketSlugs: [slug] } })); }
async function feed(slugs) {
  if (ws && wsUp && Date.now() - wsLast > 60e3) { try { ws.terminate(); } catch (_) {} } // silent for a minute: reconnect
  if (ws && ws.readyState <= 1) { slugs.forEach(wsSub); return; }
  if (Date.now() < wsNext || !process.env.MIMIC_RUNNER) return; // only the long-running runner holds a socket open
  const creds = await feedCreds(); if (!creds) { wsErr = 'no Polymarket US key to open the live feed'; wsNext = Date.now() + 60e3; return; }
  let WebSocket; try { WebSocket = require('ws'); } catch (_) { wsErr = 'ws module missing'; wsNext = Infinity; return; }
  const path = '/v1/ws/markets'; wsSubs = new Set();
  ws = new WebSocket('wss://api.polymarket.us' + path, { headers: P.headers(creds, 'GET', path) });
  ws.on('open', () => { wsUp = true; wsBack = 1e3; wsLast = Date.now(); wsErr = ''; slugs.forEach(wsSub); });
  ws.on('message', d => {
    wsLast = Date.now(); let m; try { m = JSON.parse(d); } catch (_) { return; }
    const x = m.marketDataLite || m.marketData; if (m.error) wsErr = String(m.error).slice(0, 80);
    if (x?.marketSlug) { const top = a => a && a[0] && Number(a[0].px?.value), bid = Number(x.bestBid?.value ?? top(x.bids)), ask = Number(x.bestAsk?.value ?? top(x.offers));
      WQ.set(x.marketSlug, { bid, ask, state: x.state, t: Date.now() }); if (WQ.size > 20) WQ.delete(WQ.keys().next().value); if (onMove) onMove(); }
  });
  const down = e => { wsUp = false; if (e) wsErr = String(e.message || e).slice(0, 80); wsNext = Date.now() + wsBack; wsBack = Math.min(wsBack * 2, 6e4); };
  ws.on('close', () => down()); ws.on('error', down);
  ws.on('unexpected-response', (_, res) => down(`live feed refused (${res.statusCode})`));
  const ping = setInterval(() => { if (ws.readyState === 1) ws.ping(); else clearInterval(ping); }, 2e4);
}
// best price for a window: a WebSocket quote under 30s old, else a paced uncached REST read (cached a few seconds)
const RQ = new Map();
async function quote(slug) {
  const w = WQ.get(slug); if (w && Date.now() - w.t < 3e4 && Number.isFinite(w.ask)) return { ...w, open: !w.state || w.state === 'MARKET_STATE_OPEN', src: 'live' };
  const r = RQ.get(slug); if (r && Date.now() - r.t < 3e3) return r;
  const q = { ...(await P.bbo(slug)), t: Date.now(), src: 'poll' }; RQ.set(slug, q); if (RQ.size > 20) RQ.delete(RQ.keys().next().value); return q;
}

/* ---------- one shared snapshot of every live window ---------- */
const S0 = new Map(), HIST = []; // window start price cache; recent Bitcoin prices (to price a quote at the moment it was made)
const thin = () => { const o = []; let last = -1e9; for (const x of HIST) if (x.t - last >= 900) { o.push([x.t, Math.round(x.S * 100) / 100]); last = x.t; } return o; }; // about one price a second, for the live chart
const at = t => { for (let i = HIST.length - 1; i >= 0; i--) if (HIST[i].t <= t) return HIST[i].S; return HIST[0]?.S; };
async function snapshot() {
  const now = Date.now(), [S, sig, shk] = await Promise.all([spot(), sigma(), shock().catch(() => 1)]), out = [];
  HIST.push({ t: now, S }); while (HIST.length && now - HIST[0].t > 12e4) HIST.shift();
  // the start price is a Coinbase number; scale it onto the same 3-exchange basis as the live price (exchanges differ by $10-50)
  const cb = PX.cb && now - PX.cb.t < 15e3 ? PX.cb.p : NaN, basis = cb > 0 && Math.abs(S / cb - 1) < .005 ? S / cb : 1;
  await feed(Object.entries(TF).map(([tf, len]) => slugOf(tf, Math.floor(now / len) * len))).catch(e => { wsErr = e.message; });
  for (const [tf, len] of Object.entries(TF)) {
    const start = Math.floor(now / len) * len, end = start + len, slug = slugOf(tf, start), secs = (end - now) / 1e3;
    const w = { tf, slug, start, end, secs, S, open: false };
    try {
      if (!S0.has(slug) && now - start > 15e3) { const p = await priceAt(start); if (p > 0) S0.set(slug, p); }
      if (S0.size > 50) S0.delete(S0.keys().next().value);
      w.S0cb = S0.get(slug); w.S0 = w.S0cb * basis;
      const q = await quote(slug); w.open = q.open; w.upAsk = q.ask; w.downAsk = Number.isFinite(q.bid) ? 1 - q.bid : NaN; w.src = q.src; w.qAge = Date.now() - q.t;
      if (w.S0 > 0 && secs > 0) {
        const lr = x => Math.log(x / w.S0), Sq = at(q.t) || S, fav = lr(S) >= 0 ? 'up' : 'down', favQ = lr(Sq) >= 0 ? 'up' : 'down', sg = sig * Math.sqrt(secs / 60);
        w.z = lr(S) / sg; w.fair = Math.min(.97, Math.max(.03, Phi(w.z))); // the textbook chance of Up: shown, not traded on
        // the favourite's calibrated chance. The lead counts only as far as BOTH the live price and the price when the quote was made support it (a stale quote is not an edge)
        const c = C.lookup(CAL, tf, secs, fav === favQ ? Math.min(Math.abs(lr(S)), Math.abs(lr(Sq))) : 0, sig), ask = fav === 'up' ? w.upAsk : w.downAsk;
        w.fav = fav; w.favAsk = ask; w.pLB = c ? c.lb : null; w.pCal = c ? c.p : null; w.calN = c ? c.n : 0; w.calZ = c ? c.z : null; w.calm = shk <= C.SHOCK; w.shock = shk;
        w.sane = !!c && ask >= c.lb - SANITY; w.edge = c && ask > 0 && ask < 1 ? c.lb - ask - fee(1, ask) : -1; w.upEdge = fav === 'up' ? w.edge : -1; w.downEdge = fav === 'down' ? w.edge : -1;
      }
    } catch (e) { w.err = String(e.message || e).slice(0, 80); }
    out.push(w);
  }
  return { t: now, S, sigma: sig, shock: shk, cal: CAL ? { t: CAL.t, days: CAL.days } : null, windows: out, h: thin(), feed: wsUp ? 'live' : 'poll', feedErr: wsUp ? '' : wsErr };
}


/* ---------- the calibration table (rebuilt by the runner) and the record of what the market offered ---------- */
async function loadCal() { const c = J(await S.get('btccal').catch(() => null), null); if (c && c.tables) CAL = c; return CAL; }
let calBusy = false;
async function refreshCal() { // runner: rebuild the table from 30 days of minute history, plus the backtest summaries for each lookback
  if (calBusy) return; calBusy = true;
  try { const M = await C.minutes(30), cal = C.build(M), by = {}; for (const d of [3, 7, 14, 30]) { const Md = C.cutDays(M, d); by[d] = { '15m': C.walkForward(Md, '15m'), '1h': C.walkForward(Md, '1h') }; }
    await S.set('btccal', JSON.stringify(cal)); await S.set('btcbt', JSON.stringify({ t: Date.now(), byDays: by })); CAL = cal; console.log(new Date().toISOString(), 'btc calibration rebuilt', cal.days + ' days'); }
  finally { calBusy = false; }
}
const LOGGED = new Set();
async function logObs(snap) { // every 15 seconds near the end of a window: our number and the market's price
  for (const w of snap.windows) { if (!(w.S0 > 0) || !(w.favAsk > 0 && w.favAsk < 1) || w.secs > (w.tf === '15m' ? 540 : 2100) || w.secs < 3) continue; const cp = Math.floor(w.secs / 15), key = w.slug + ':' + cp; if (LOGGED.has(key)) continue; LOGGED.add(key); if (LOGGED.size > 4000) LOGGED.delete(LOGGED.keys().next().value);
    await db.q('INSERT INTO btcobs (slug, cp, tf, ts, wend, secs, s, s0, fav, ask, plb, pcal, z) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (slug, cp) DO NOTHING', [w.slug, cp, w.tf, Date.now(), w.end, w.secs, w.S, w.S0, w.fav, w.favAsk, w.pLB ?? null, w.pCal ?? null, w.calZ ?? null]).catch(() => {}); }
}
let lastObsSettle = 0, lastClean = 0;
async function obsSettle() { // how the logged windows ended (Polymarket US's own result; the price at the end vs the start if it is gone already)
  if (Date.now() - lastObsSettle < 3e4) return; lastObsSettle = Date.now(); if (Date.now() - lastClean > 36e5) { lastClean = Date.now(); await db.q('DELETE FROM btcobs WHERE ts < $1', [Date.now() - 45 * DAY]); }
  const due = await db.q('SELECT DISTINCT slug, tf, wend FROM btcobs WHERE up IS NULL AND wend < $1 LIMIT 12', [Date.now() - 25e3]);
  for (const d of due) { const m = await P.marketRaw(d.slug).catch(() => null); let up = null; if (m && /RESOLVED/.test(m.status || '')) { const op = Array.isArray(m.outcomePrices) ? m.outcomePrices : J(m.outcomePrices, null); if (op) up = String(op[0]) === '1'; }
    if (up === null && Date.now() - Number(d.wend) > 20 * 6e4) { const [a, b] = await Promise.all([priceAt(Number(d.wend) - TF[d.tf]).catch(() => NaN), priceAt(Number(d.wend)).catch(() => NaN)]); if (a > 0 && b > 0) up = b >= a; } if (up !== null) await db.q('UPDATE btcobs SET up=$2 WHERE slug=$1', [d.slug, up]); }
}
// what the recorded quotes say: for each level of caution the bot could have used, the first moment in every window that cleared the bar, and how those trades ended
async function recorded(days) {
  const rows = await db.q('SELECT slug, tf, ts, secs, fav, ask, plb, z, up FROM btcobs WHERE ts >= $1 AND up IS NOT NULL ORDER BY slug, ts', [Date.now() - days * DAY]), by = new Map(); for (const r of rows) (by.get(r.slug) || by.set(r.slug, []).get(r.slug)).push(r);
  const won = r => (r.fav === 'up') === r.up, rules = [0, 1, 2, 3, 5].map(e => { let n = 0, w = 0, cost = 0, pnl = 0; for (const rs of by.values()) { const r = rs.find(x => x.plb != null && x.z >= MIN_Z && x.ask > 0 && x.ask <= MAX_PRICE && x.ask >= x.plb - SANITY && x.plb - x.ask - fee(1, x.ask) >= e / 100); if (!r) continue; n++; if (won(r)) w++; cost += r.ask + fee(1, r.ask); pnl += (won(r) ? 1 : 0) - r.ask - fee(1, r.ask); } return { edge: e, n, win: n ? w / n : null, cost: n ? cost / n : null, pnl, perContract: n ? pnl / n : null }; });
  const bins = [[0, 1], [1, 2], [2, 3], [3, 99]], lead = bins.map(([a, b]) => { let n = 0, w = 0, ask = 0; for (const rs of by.values()) { const r = rs.find(x => x.z != null && x.z >= a && x.z < b); if (!r) continue; n++; if (won(r)) w++; ask += r.ask; } return { from: a, to: b, n, win: n ? w / n : null, ask: n ? ask / n : null }; }).filter(x => x.n);
  return { windows: by.size, since: rows.length ? Math.min(...rows.map(r => Number(r.ts))) : null, rules, lead };
}

/* ---------- per user ---------- */
async function open(uid) {
  await db.q("INSERT INTO btcbot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM btcbot WHERE uid=$1', [uid]), c = J(row.cfg, {});
  return { row, cfg: { size: c.size === 'usd' ? 'usd' : 'pct', pct: c.pct > 0 ? c.pct : DEF.pct, usd: c.usd > 0 ? c.usd : DEF.usd } };
}
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
// the kill condition, written down in advance: does the bot win as often as it said it would? Over the last two weeks of finished trades, if it has won
// 2.5 standard deviations fewer than the sum of its own win probabilities, its model is wrong right now and it stops buying until the bad stretch ages out.
async function health(uid, mode) {
  const r = await db.one("SELECT count(*)::int AS n, sum(CASE WHEN status='won' THEN 1 ELSE 0 END)::int AS w, coalesce(sum(fair),0) AS e, coalesce(sum(fair-fair*fair),0) AS v FROM btctrades WHERE uid=$1 AND mode=$2 AND status IN ('won','lost') AND fair>0 AND ts>=$3", [uid, mode, Date.now() - HEALTH.days * 864e5]);
  const n = r.n, wins = r.w || 0, expected = Number(r.e), sd = Math.sqrt(Number(r.v));
  return { n, wins, expected, sd, tripped: n >= HEALTH.n && wins < expected - HEALTH.z * sd, days: HEALTH.days };
}
// fractional Kelly: the most worth staking on a $1-if-right contract, from the 95% lower-bound win chance and the all-in price (a quarter of full Kelly, never above the size dial)
const kellyCap = (bal, pLB, allIn) => bal * KELLY * Math.max(0, (pLB - allIn) / (1 - allIn));
async function decide(row, snap) {
  const uid = row.uid, c = J(row.cfg, {}), cfg = { size: c.size === 'usd' ? 'usd' : 'pct', pct: c.pct > 0 ? c.pct : DEF.pct, usd: c.usd > 0 ? c.usd : DEF.usd };
  // cheap part first: is any window tradeable right now? (no database work on the vast majority of checks)
  const ready = w => TFS.includes(w.tf) && w.open && w.pLB != null && w.calZ >= MIN_Z && w.calm && w.sane && w.secs >= 12 && w.qAge <= 5e3 && w.edge * 100 >= MIN_EDGE && w.favAsk > 0 && w.favAsk <= MAX_PRICE, cands = snap.windows.filter(ready);
  if (!cands.length) return;
  const live = row.mode === 'live', creds = live ? await S.getCreds(uid).catch(() => null) : null;
  if (live && (!creds || process.env.TRADING_DISABLED)) return;
  const today = await db.one('SELECT coalesce(sum(pnl),0) AS p FROM btctrades WHERE uid=$1 AND mode=$2 AND status<>$3 AND ts>=$4', [uid, row.mode, 'open', dayStart()]);
  const openCost = await db.one("SELECT coalesce(sum(price*qty+fee),0) AS c FROM btctrades WHERE uid=$1 AND mode=$2 AND status='open'", [uid, row.mode]);
  // balance this trade is sized from: the paper balance, or your Polymarket US cash
  const bal = live ? await P.balance(creds).then(r => r.ok ? require('./engine').cash(r.json) : NaN).catch(() => NaN) : row.paper;
  if (!(bal > 0)) return;
  if (Number(today.p) - Number(openCost.c) <= -DAILY_STOP * (bal + Number(openCost.c) - Number(today.p))) return; // lost 5% today: done until tomorrow
  if ((await health(uid, row.mode)).tripped) return; // winning far less often than it claimed: stand down
  const spend = cfg.size === 'usd' ? cfg.usd : bal * cfg.pct / 100;
  for (const w of cands) {
    if (!ready(w)) continue; if (await db.one('SELECT id FROM btctrades WHERE uid=$1 AND slug=$2 AND mode=$3', [uid, w.slug, row.mode])) continue; // one trade per window
    const side = w.fav, edge = w.edge, price = w.favAsk;
    const allIn = price + fee(1, price); let qty = Math.floor(Math.min(spend, kellyCap(bal, w.pLB, allIn)) / allIn); if (qty < 1) qty = 1; // a small balance still buys one contract
    if (qty * (price + fee(1, price)) > bal) continue;
    let fillQ = qty, fillP = price;
    if (live) {
      const r = await P.order(creds, { slug: w.slug, side: side === 'up' ? 'yes' : 'no', quantity: qty, slippageBips: 100 });
      if (!r.ok) continue; const f = require('./engine').fills(r, side === 'up' ? 'yes' : 'no', price); // real execution prices
      if (!(f.n > 0)) continue; fillQ = f.n; fillP = f.cost / f.n;
    } else {
      const need = qty * price + fee(qty, price); if (row.paper < need) { qty = Math.floor(row.paper / (price + fee(1, price))); if (qty < 1) continue; fillQ = qty; }
      await db.q('UPDATE btcbot SET paper=paper-$2 WHERE uid=$1', [uid, fillQ * price + fee(fillQ, price)]); row.paper -= fillQ * price + fee(fillQ, price);
    }
    await db.q('INSERT INTO btctrades (id, uid, ts, slug, tf, side, price, qty, fee, fair, edge, s0, s, secs, mode, wend) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
      [crypto.randomBytes(8).toString('hex'), uid, Date.now(), w.slug, w.tf, side, fillP, fillQ, fee(fillQ, fillP), w.pCal, edge, w.S0cb, w.S, w.secs, row.mode, w.end]);
  }
}
// settle finished windows: Polymarket US's own result; if it's gone already, the price at the window's end vs its start
async function settle() {
  const due = await db.q("SELECT * FROM btctrades WHERE status='open' AND wend < $1 ORDER BY wend LIMIT 50", [Date.now() - 5e3]); const res = new Map();
  for (const t of due) {
    if (!res.has(t.slug)) {
      const m = await P.marketRaw(t.slug); let up = null;
      if (m && /RESOLVED/.test(m.status || '')) { const op = Array.isArray(m.outcomePrices) ? m.outcomePrices : J(m.outcomePrices, null); if (op) up = String(op[0]) === '1'; }
      if (up === null && Date.now() - t.wend > 20 * 6e4) { const e = await priceAt(Number(t.wend)).catch(() => NaN); if (e > 0 && t.s0 > 0) up = e >= t.s0; }
      res.set(t.slug, up);
    }
    const up = res.get(t.slug); if (up === null) continue;
    const won = (t.side === 'up') === up, pay = won ? t.qty : 0, pnl = pay - t.qty * t.price - t.fee;
    const done = await db.q("UPDATE btctrades SET status=$2, pnl=$3 WHERE id=$1 AND status='open' RETURNING id", [t.id, won ? 'won' : 'lost', pnl]);
    if (done.length && t.mode === 'paper' && pay) await db.q('UPDATE btcbot SET paper=paper+$2 WHERE uid=$1', [t.uid, pay]); // only the process that settled it pays
  }
}
async function reconcile() {
  for (const b of await db.q('SELECT uid, paper, paperstart FROM btcbot')) {
    const r = await db.one("SELECT coalesce(sum(CASE WHEN status='open' THEN -(price*qty+fee) ELSE pnl END),0) AS d FROM btctrades WHERE uid=$1 AND mode='paper'", [b.uid]);
    const want = Number(b.paperstart) + Number(r.d); if (Math.abs(want - Number(b.paper)) > .005) await db.q('UPDATE btcbot SET paper=$2 WHERE uid=$1', [b.uid, want]);
  }
}
// one check for everyone. In the runner it fires on every Bitcoin or Polymarket US price move (at most 4x a second),
// plus a 1-second heartbeat; a check still running is skipped, never doubled.
let busy = false, lastPub = 0, lastSettle = 0, lastCal = 0, users = { t: 0, rows: [] };
async function tick(given) {
  if (busy) return null; busy = true;
  try {
    if (Date.now() - lastCal > 3 * 6e4) { lastCal = Date.now(); await loadCal().catch(() => {}); }
    const snap = given || await snapshot(); logObs(snap).catch(() => {});
    if (given || Date.now() - lastPub > 1e3) { lastPub = Date.now(); S.set('btclive', JSON.stringify(snap)).catch(() => {}); }
    if (given || Date.now() - users.t > 5e3) users = { t: Date.now(), rows: await db.q("SELECT b.* FROM btcbot b JOIN users u ON u.id=b.uid WHERE b.enabled=true AND u.verified=true") };
    for (const r of users.rows) await decide(r, snap).catch(e => console.error('btc', r.uid, e.message));
    if (given || Date.now() - lastSettle > 5e3) { lastSettle = Date.now(); await settle(); await reconcile(); await obsSettle().catch(e => console.error('btc obs', e.message)); }
    return snap;
  } finally { busy = false; }
}
let nextAt = 0, timer = null;
function start() { // runner: open the price streams and re-check on every move
  streams(); loadCal().then(() => { if (!CAL || Date.now() - CAL.t > 8 * 36e5) return refreshCal(); }).catch(e => console.error('btc calibration', e.message)); setInterval(() => refreshCal().catch(e => console.error('btc calibration', e.message)), 6 * 36e5);
  onMove = () => { if (timer) return; const wait = Math.max(0, nextAt - Date.now()); timer = setTimeout(() => { timer = null; nextAt = Date.now() + 250; tick().catch(() => {}); }, wait); };
}
async function stats(uid, mode) {
  const r = await db.one("SELECT count(*)::int AS n, sum(CASE WHEN status='won' THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN status='lost' THEN 1 ELSE 0 END)::int AS l, coalesce(sum(pnl),0) AS pnl, coalesce(sum(CASE WHEN status='open' THEN price*qty+fee ELSE 0 END),0) AS openc FROM btctrades WHERE uid=$1 AND mode=$2", [uid, mode]);
  return { trades: r.n, won: r.w || 0, lost: r.l || 0, pnl: Number(r.pnl), open: Number(r.openc) };
}
module.exports = { health, kellyCap, KELLY, HEALTH, range, past, recorded, refreshCal, loadCal, logObs, obsSettle, MAX_PRICE, SANITY, MIN_Z, MIN_PRICE, reconcile, DEF, TF, MIN_EDGE, DAILY_STOP, tick, start, snapshot, settle, open, stats, fee, Phi, slugOf };
