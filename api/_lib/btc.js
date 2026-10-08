// BTC Up or Down: trades Polymarket US's Bitcoin up/down windows (15 minutes and 1 hour).
// It does not guess where Bitcoin goes next. It prices what has already happened inside the window:
//   chance of Up = Phi( ln(price now / price at window start) / (volatility * sqrt(time left)) )
// and buys a side only when the market sells it for clearly less than that chance (after the taker fee).
// Paper mode simulates fills at the live ask and settles on Polymarket US's own result.
const crypto = require('crypto'), db = require('./db'), P = require('./polymarket-us'), S = require('./settings');
const TF = { '15m': 9e5, '1h': 36e5 }, DAY = 864e5;
// The only setting is trade size: a % of the balance or a fixed $. The rest is built in:
// minimum edge 5c after fees, both windows, and it stops for the day after losing 20% of the account.
const DEF = { size: 'pct', pct: 2, usd: 5 }, MIN_EDGE = 5, DAILY_STOP = .2, TFS = ['15m', '1h'];
const fee = (n, p) => 0.0695 * n * p * (1 - p);
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const iso = t => new Date(t).toISOString();
const slugOf = (tf, start) => `cpc-btc-updown-${tf}-${iso(start).slice(0, 10)}-${iso(start).slice(11, 13)}${iso(start).slice(14, 16)}z`;
// standard normal CDF (Abramowitz-Stegun 7.1.26)
function Phi(x) { const t = 1 / (1 + .3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; }
const get = u => fetch(u, { headers: { 'user-agent': 'mimic' } }).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${u.split('/')[2]}`)));

/* ---------- Bitcoin price: average of Coinbase, Kraken, Bitstamp (the exchanges behind the CF Benchmarks index US settles on) ---------- */
async function spot() {
  const v = (await Promise.all([
    get('https://api.exchange.coinbase.com/products/BTC-USD/ticker').then(j => +j.price),
    get('https://api.kraken.com/0/public/Ticker?pair=XBTUSD').then(j => +Object.values(j.result)[0].c[0]),
    get('https://www.bitstamp.net/api/v2/ticker/btcusd/').then(j => +j.last),
  ].map(p => p.catch(() => NaN)))).filter(x => x > 1000);
  if (!v.length) throw new Error('no Bitcoin price'); v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; // median
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
// volatility per minute from the last hour of 1-minute returns, padded 25% for model error
async function sigma() {
  const r = (await candles()).slice(0, 61).map(x => x[4]), L = []; for (let i = 0; i < r.length - 1; i++) L.push(Math.log(r[i] / r[i + 1]));
  const m = L.reduce((a, b) => a + b, 0) / L.length, sd = Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / (L.length - 1));
  return Math.max(sd, 2e-4) * 1.25;
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
      WQ.set(x.marketSlug, { bid, ask, state: x.state, t: Date.now() }); if (WQ.size > 20) WQ.delete(WQ.keys().next().value); }
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
const S0 = new Map(); // window start price cache
async function snapshot() {
  const now = Date.now(), [S, sig] = await Promise.all([spot(), sigma()]), out = [];
  await feed(Object.entries(TF).map(([tf, len]) => slugOf(tf, Math.floor(now / len) * len))).catch(e => { wsErr = e.message; });
  for (const [tf, len] of Object.entries(TF)) {
    const start = Math.floor(now / len) * len, end = start + len, slug = slugOf(tf, start), secs = (end - now) / 1e3;
    const w = { tf, slug, start, end, secs, S, open: false };
    try {
      if (!S0.has(slug) && now - start > 15e3) { const p = await priceAt(start); if (p > 0) S0.set(slug, p); }
      if (S0.size > 50) S0.delete(S0.keys().next().value);
      w.S0 = S0.get(slug);
      const q = await quote(slug); w.open = q.open; w.upAsk = q.ask; w.downAsk = Number.isFinite(q.bid) ? 1 - q.bid : NaN; w.src = q.src; w.qAge = Date.now() - q.t;
      if (w.S0 > 0 && secs > 0) {
        const z = Math.log(S / w.S0) / (sig * Math.sqrt(secs / 60));
        w.fair = Math.min(.97, Math.max(.03, Phi(z))); // never fully trust the model
        const net = (pr, ch) => pr > 0 && pr < 1 ? ch - pr - fee(1, pr) : -1;
        w.upEdge = net(w.upAsk, w.fair); w.downEdge = net(w.downAsk, 1 - w.fair);
      }
    } catch (e) { w.err = String(e.message || e).slice(0, 80); }
    out.push(w);
  }
  return { t: now, S, sigma: sig, windows: out, feed: wsUp ? 'live' : 'poll', feedErr: wsUp ? '' : wsErr };
}

/* ---------- per user ---------- */
async function open(uid) {
  await db.q("INSERT INTO btcbot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM btcbot WHERE uid=$1', [uid]), c = J(row.cfg, {});
  return { row, cfg: { size: c.size === 'usd' ? 'usd' : 'pct', pct: c.pct > 0 ? c.pct : DEF.pct, usd: c.usd > 0 ? c.usd : DEF.usd } };
}
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
async function decide(uid, snap) {
  const { row, cfg } = await open(uid); if (!row.enabled) return;
  const live = row.mode === 'live', creds = live ? await S.getCreds(uid).catch(() => null) : null;
  if (live && (!creds || process.env.TRADING_DISABLED)) return;
  const today = await db.one('SELECT coalesce(sum(pnl),0) AS p FROM btctrades WHERE uid=$1 AND mode=$2 AND status<>$3 AND ts>=$4', [uid, row.mode, 'open', dayStart()]);
  const openCost = await db.one("SELECT coalesce(sum(price*qty+fee),0) AS c FROM btctrades WHERE uid=$1 AND mode=$2 AND status='open'", [uid, row.mode]);
  // balance this trade is sized from: the paper balance, or your Polymarket US cash
  const bal = live ? await P.balance(creds).then(r => r.ok ? require('./engine').cash(r.json) : NaN).catch(() => NaN) : row.paper;
  if (!(bal > 0)) return;
  if (Number(today.p) - Number(openCost.c) <= -DAILY_STOP * (bal + Number(openCost.c) - Number(today.p))) return; // lost 20% today: done until tomorrow
  const spend = cfg.size === 'usd' ? cfg.usd : bal * cfg.pct / 100;
  for (const w of snap.windows) {
    if (!TFS.includes(w.tf) || !w.open || !(w.fair > 0)) continue;
    const len = TF[w.tf]; if (w.secs > len / 1e3 * .6 || w.secs < 20) continue; // only once the window has played out a while
    if (await db.one('SELECT id FROM btctrades WHERE uid=$1 AND slug=$2 AND mode=$3', [uid, w.slug, row.mode])) continue; // one trade per window
    if (!(w.qAge <= 5e3)) continue; // never trade against a market price more than 5s old
    const side = w.upEdge >= w.downEdge ? 'up' : 'down', edge = Math.max(w.upEdge, w.downEdge), price = side === 'up' ? w.upAsk : w.downAsk;
    if (!(edge * 100 >= MIN_EDGE) || !(price >= .03 && price <= .95)) continue;
    let qty = Math.floor(spend / (price + fee(1, price))); if (qty < 1) qty = 1; // a small balance still buys one contract
    if (qty * (price + fee(1, price)) > bal) continue;
    let fillQ = qty, fillP = price;
    if (live) {
      const r = await P.order(creds, { slug: w.slug, side: side === 'up' ? 'yes' : 'no', quantity: qty, slippageBips: 100 });
      if (!r.ok) continue; let n = 0, c = 0;
      for (const x of r.json?.executions || []) if (/PARTIAL_FILL|EXECUTION_TYPE_FILL$/.test(String(x.type)) && Number(x.lastShares) > 0) { n += +x.lastShares; c += +x.lastShares * price; }
      if (!n) continue; fillQ = n; fillP = c / n;
    } else {
      const need = qty * price + fee(qty, price); if (row.paper < need) { qty = Math.floor(row.paper / (price + fee(1, price))); if (qty < 1) continue; fillQ = qty; }
      await db.q('UPDATE btcbot SET paper=paper-$2 WHERE uid=$1', [uid, fillQ * price + fee(fillQ, price)]); row.paper -= fillQ * price + fee(fillQ, price);
    }
    await db.q('INSERT INTO btctrades (id, uid, ts, slug, tf, side, price, qty, fee, fair, edge, s0, s, secs, mode, wend) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
      [crypto.randomBytes(8).toString('hex'), uid, Date.now(), w.slug, w.tf, side, fillP, fillQ, fee(fillQ, fillP), side === 'up' ? w.fair : 1 - w.fair, edge, w.S0, w.S, w.secs, row.mode, w.end]);
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
    await db.q('UPDATE btctrades SET status=$2, pnl=$3 WHERE id=$1', [t.id, won ? 'won' : 'lost', pnl]);
    if (t.mode === 'paper' && pay) await db.q('UPDATE btcbot SET paper=paper+$2 WHERE uid=$1', [t.uid, pay]);
  }
}
// one tick for everyone (runner calls this every few seconds)
let busy = false;
async function tick(given) {
  if (busy) return null; busy = true;
  try {
    const snap = given || await snapshot();
    await S.set('btclive', JSON.stringify(snap));
    for (const r of await db.q("SELECT b.uid FROM btcbot b JOIN users u ON u.id=b.uid WHERE b.enabled=true AND u.verified=true")) await decide(r.uid, snap).catch(e => console.error('btc', r.uid, e.message));
    await settle(); return snap;
  } finally { busy = false; }
}
async function stats(uid, mode) {
  const r = await db.one("SELECT count(*)::int AS n, sum(CASE WHEN status='won' THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN status='lost' THEN 1 ELSE 0 END)::int AS l, coalesce(sum(pnl),0) AS pnl, coalesce(sum(CASE WHEN status='open' THEN price*qty+fee ELSE 0 END),0) AS openc FROM btctrades WHERE uid=$1 AND mode=$2", [uid, mode]);
  return { trades: r.n, won: r.w || 0, lost: r.l || 0, pnl: Number(r.pnl), open: Number(r.openc) };
}
module.exports = { DEF, TF, MIN_EDGE, DAILY_STOP, tick, snapshot, settle, open, stats, fee, Phi, slugOf };
