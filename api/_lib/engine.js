// Server-side copy-trading engine. Signals come from Polymarket (the traders you follow, or the top 10);
// orders go to Kalshi. A trade only happens when the Kalshi market is clearly the same question:
//  - most of the Polymarket question's words appear in the Kalshi market, all numbers/dates match exactly,
//  - direction words (above/below/before/after/not…) are identical on both sides,
//  - both markets resolve within 3 days of each other,
//  - the Kalshi price is within your slippage of the price the Polymarket trader paid.
const crypto = require('crypto');
const db = require('./db'), K = require('./kalshi'), S = require('./settings');
const DEF = { paper: true, pct: 5, minUsd: 1000, maxPrice: 85, slip: 3, maxUse: 50, thresh: 75, pbal: 1000, liveAck: false, maxOrder: 25 };
const STOP = new Set('will the a an of in on at to be by for and or is are with from vs than this that win wins won'.split(' '));
const DIR = new Set('above below over under more less fewer higher lower before after not least most exceed exceeds'.split(' '));
const tok = s => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(w => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
const dirs = ws => [...new Set(ws.filter(w => DIR.has(w)))].sort().join(',');
const centsOf = (d, c) => { const x = parseFloat(d); return isNaN(x) ? (c ?? 0) : Math.round(x * 100); };
const getJSON = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${u.split('?')[0]}`)));
const maxOrderUsd = cfg => Math.min(cfg.maxOrder || 25, Number(process.env.MAX_ORDER_USD) || Infinity); // env var, if set, is a hard ceiling
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const DAY = 864e5, MKC = {}, PMC = new Map();

async function kalshiMarkets(env) {
  const c = MKC[env]; if (c && Date.now() - c.t < 6e5) return c.data;
  const data = (await K.openMarkets(env)).map(m => {
    const text = `${m.title} ${m.yes_sub_title || ''}`, ws = tok(text);
    return { t: m.ticker, title: m.title, sub: m.yes_sub_title, ya: centsOf(m.yes_ask_dollars, m.yes_ask), na: centsOf(m.no_ask_dollars, m.no_ask), tk: new Set(ws), dir: dirs(ws),
      ends: [m.close_time, m.expected_expiration_time].map(x => Date.parse(x)).filter(x => !isNaN(x)) };
  }).filter(m => m.t && m.tk.size);
  if (data.length) MKC[env] = { t: Date.now(), data }; return data;
}
async function pmEnd(conditionId) { // Polymarket market end date (ms) — cached
  if (PMC.has(conditionId)) return PMC.get(conditionId);
  const d = await getJSON(`https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`).then(r => Date.parse(r?.[0]?.endDate)).catch(() => NaN);
  PMC.set(conditionId, d); if (PMC.size > 5000) PMC.clear(); return d;
}
function match(title, mk, th, end) { // best Kalshi market for a Polymarket question, or {reason}
  const ws = [...new Set(tok(title))]; if (ws.length < 3) return { reason: 'question too short to match safely' };
  const nums = ws.filter(w => /\d/.test(w)), d = dirs(ws); let best = null, near = null;
  for (const m of mk) {
    let h = 0; for (const w of ws) if (m.tk.has(w)) h++; const s = h / ws.length;
    if (s < th || !nums.every(n => m.tk.has(n)) || h / m.tk.size < .25) continue;
    if (m.dir !== d) { near ??= 'wording differs (above/below/before/after/not)'; continue; }
    if (!isNaN(end) && m.ends.length && !m.ends.some(x => Math.abs(x - end) <= 3 * DAY)) { near ??= 'resolves on a different date'; continue; }
    if (isNaN(end) || !m.ends.length) { near ??= 'could not confirm resolution date'; continue; }
    if (!best || s > best.s) best = { m, s };
  }
  return best || { reason: near || 'not on Kalshi' };
}
const runCtx = () => { const T = new Map(); let top; return {
  trades: a => T.get(a) ?? T.set(a, getJSON(`https://data-api.polymarket.com/trades?user=${a}&limit=15`).catch(() => [])).get(a),
  top: () => top ??= getJSON('https://data-api.polymarket.com/v1/leaderboard?timePeriod=ALL&orderBy=PNL&limit=10').then(r => r.map(x => x.proxyWallet)).catch(() => []) }; };

function liveStatus(cfg, c) { // can we place real orders right now?
  const env = c?.env || 'demo';
  if (!c) return { ok: false, env, why: 'add your Kalshi API key first' };
  if (process.env.TRADING_DISABLED) return { ok: false, env, why: 'TRADING_DISABLED is set on the server' };
  if (env === 'prod' && process.env.KALSHI_ALLOW_LIVE === 'no') return { ok: false, env, why: 'KALSHI_ALLOW_LIVE=no on the server' };
  if (env === 'prod' && !cfg.liveAck) return { ok: false, env, why: 'tick "I understand this uses real money"' };
  return { ok: true, env };
}
async function open() {
  const row = await db.one("SELECT * FROM bot WHERE id='me'"), cfg = { ...DEF, ...J(row.cfg, {}) }, creds = await S.getCreds().catch(() => null), live = liveStatus(cfg, creds);
  const s = { row, cfg, creds, st: J(row.state, {}), pos: J(row.positions, []), pnl: row.pnl || 0, logs: [], orders: 0, disable: false };
  s.paper = cfg.paper || !live.ok; s.env = s.paper ? 'prod' : live.env; s.why = !cfg.paper && !live.ok ? `Practice mode used: ${live.why}` : '';
  return s;
}
const log = (s, e) => s.logs.push({ t: Date.now(), ...e });
async function balanceOf(s) { if (s.paper) return s.cfg.pbal + s.pnl; const b = await K.balance(s.creds); return b.ok ? b.balance : null; }
function addPos(s, e, n) { s.pos.push({ id: crypto.randomBytes(5).toString('hex'), tk: e.tk, side: e.side, count: n, ask: e.ask, cost: n * e.ask / 100, asset: e.asset, trader: e.trader, title: e.title, kt: e.kt, paper: s.paper, t: Date.now() });
  log(s, { ...e, count: n, st: 'bought', note: s.paper ? 'practice' : `${s.env === 'prod' ? 'real money' : 'demo'} · filled ${n}` }); }
const bad = (s, e, r) => { s.st.errs = (s.st.errs || 0) + 1; log(s, { ...e, st: 'error', note: r.json?.error?.message || r.json?.error || r.json?.message || JSON.stringify(r.json).slice(0, 120) });
  if (s.st.errs >= 3) { s.disable = true; log(s, { trader: 'bot', title: 'Bot stopped after 3 errors in a row', st: 'error' }); } };

async function buy(s, t, mk) {
  const c = s.cfg, base = { trader: t.name || t.pseudonym || t.proxyWallet.slice(0, 8), title: t.title, outcome: t.outcome, pm: Math.round(t.price * 100), usd: t.size * t.price, act: 'buy' };
  const o = String(t.outcome).toLowerCase(); if (o !== 'yes' && o !== 'no') return log(s, { ...base, st: 'skip', note: 'not a Yes/No market' });
  const b = match(t.title, mk, c.thresh / 100, await pmEnd(t.conditionId)); if (!b.m) return log(s, { ...base, st: 'skip', note: b.reason });
  const ask = o === 'yes' ? b.m.ya : b.m.na, e = { ...base, tk: b.m.t, kt: b.m.title + (b.m.sub ? ' — ' + b.m.sub : ''), side: o, ask, asset: t.asset, score: Math.round(b.s * 100) };
  if (!ask || ask < 1 || ask > 99) return log(s, { ...e, st: 'skip', note: 'no Kalshi price' });
  if (ask > c.maxPrice) return log(s, { ...e, st: 'skip', note: `price ${ask}¢ above your max ${c.maxPrice}¢` });
  if (Math.abs(ask - e.pm) > Math.max(c.slip, 10) || ask > e.pm + c.slip) return log(s, { ...e, st: 'skip', note: `Kalshi ${ask}¢ vs Polymarket ${e.pm}¢ — prices don't line up` });
  if (s.pos.some(p => p.tk === e.tk)) return log(s, { ...e, st: 'skip', note: 'already holding this market' });
  const bal = await balanceOf(s); if (!(bal > 0)) return log(s, { ...e, st: 'skip', note: 'could not read balance' });
  let n = Math.floor(Math.min(bal * c.pct / 100, bal * 0.97) * 100 / ask); // keep ~3% for Kalshi fees if (!s.paper) n = Math.min(n, Math.floor(maxOrderUsd(c) * 100 / ask));
  if (n < 1) return log(s, { ...e, st: 'skip', note: `${c.pct}% of balance is less than 1 contract` });
  const inUse = s.pos.reduce((a, p) => a + p.cost, 0); if (inUse + n * ask / 100 > bal * Math.max(c.maxUse, c.pct) / 100) return log(s, { ...e, st: 'skip', note: `would put more than ${c.maxUse}% of balance in trades` });
  if (s.paper) return addPos(s, e, n);
  if (s.orders >= 5) return log(s, { ...e, st: 'skip', note: 'max 5 orders per run' }); s.orders++;
  const r = await K.placeOrder(s.creds, { ticker: e.tk, side: o, action: 'buy', count: n, priceCents: ask, ref: `b-${Date.now()}-${e.tk}` });
  if (!r.ok) return bad(s, e, r); s.st.errs = 0; const f = Math.floor(parseFloat(r.json.fill_count || 0));
  return f > 0 ? addPos(s, e, f) : log(s, { ...e, st: 'skip', note: 'order did not fill (price moved)' });
}
async function sell(s, p, why) {
  const env = p.paper ? 'prod' : (s.creds?.env || 'demo'), e = { trader: p.trader, title: p.title, tk: p.tk, kt: p.kt, side: p.side, count: p.count, act: 'sell', outcome: p.side };
  const m = await K.market(env, p.tk).catch(() => null), bid = m ? centsOf(p.side === 'yes' ? m.yes_bid_dollars : m.no_bid_dollars, p.side === 'yes' ? m.yes_bid : m.no_bid) : 0;
  if (!m) return log(s, { ...e, st: 'skip', note: `${why}: could not load market` });
  if (m.status && !['active', 'open'].includes(m.status)) { s.pos = s.pos.filter(x => x.id !== p.id); return log(s, { ...e, st: 'sold', note: `market ${m.status} — Kalshi settles it automatically` }); }
  if (bid < 1) return log(s, { ...e, st: 'skip', note: `${why}: no buyers right now, will retry` });
  e.ask = bid;
  const done = (n, price) => { const proceeds = n * price / 100, part = p.cost * n / p.count; s.pos = s.pos.filter(x => x.id !== p.id); if (n < p.count) s.pos.push({ ...p, count: p.count - n, cost: p.cost - part }); s.pnl += proceeds - part;
    log(s, { ...e, count: n, st: 'sold', note: `${why} · ${proceeds - part >= 0 ? '+' : '-'}$${Math.abs(proceeds - part).toFixed(2)}` }); };
  if (p.paper) return done(p.count, bid);
  if (!s.creds) return log(s, { ...e, st: 'error', note: 'cannot sell: Kalshi key missing' });
  const r = await K.placeOrder(s.creds, { ticker: p.tk, side: p.side, action: 'sell', count: p.count, priceCents: Math.max(1, bid - 5), ref: `s-${Date.now()}-${p.tk}` });
  if (!r.ok) return bad(s, e, r); const f = Math.floor(parseFloat(r.json.fill_count || 0));
  if (f > 0) return done(f, bid); s.st.retry = [...new Set([...(s.st.retry || []), p.id])]; return log(s, { ...e, st: 'skip', note: `${why}: sell did not fill, will retry` });
}
async function save(s, enabled) {
  await db.q("UPDATE bot SET enabled=$1, state=$2, positions=$3, pnl=$4, lock_until=NULL, updated=$5 WHERE id='me'", [enabled ?? (s.row.enabled && !s.disable), JSON.stringify(s.st), JSON.stringify(s.pos), s.pnl, Date.now()]);
  for (const l of s.logs) await db.q('INSERT INTO botlog (id, ts, entry) VALUES ($1,$2,$3)', [crypto.randomBytes(8).toString('hex'), l.t, JSON.stringify(l)]);
  if (s.logs.length) await db.q('DELETE FROM botlog WHERE ts<$1', [Date.now() - 14 * DAY]);
}
async function run(ctx = runCtx(), minGap = 0) {
  if (minGap) { const r = await db.one("SELECT state FROM bot WHERE id='me'"); if (Date.now() - (J(r?.state, {}).last || 0) < minGap) return { ran: false, why: 'ran recently' }; }
  const got = await db.one("UPDATE bot SET lock_until=$1 WHERE id='me' AND enabled=true AND (lock_until IS NULL OR lock_until<$2) RETURNING id", [Date.now() + 55e3, Date.now()]);
  if (!got) return { ran: false };
  const s = await open();
  try {
    if (s.why && s.st.warned !== s.why) { log(s, { trader: 'bot', title: s.why, st: 'error' }); s.st.warned = s.why; } else if (!s.why) delete s.st.warned;
    let addrs = (await db.q('SELECT wallet FROM follows')).map(r => r.wallet); if (!addrs.length) addrs = await ctx.top(); addrs = addrs.slice(0, 15);
    s.st.since ??= Math.floor(Date.now() / 1000) - 30; const seen = new Set(s.st.seen || []);
    for (const id of s.st.retry || []) { const p = s.pos.find(x => x.id === id); s.st.retry = (s.st.retry || []).filter(x => x !== id); if (p) await sell(s, p, 'retrying sell'); }
    const trades = (await Promise.all(addrs.map(a => ctx.trades(a)))).flat().filter(t => t && t.timestamp >= s.st.since && !seen.has(t.transactionHash + t.asset + t.size + t.side)).sort((a, b) => a.timestamp - b.timestamp);
    let mk = null;
    for (const t of trades) { if (s.disable) break; seen.add(t.transactionHash + t.asset + t.size + t.side);
      if (t.side === 'SELL') { for (const p of s.pos.filter(p => p.asset === t.asset)) await sell(s, p, `${p.trader} sold`); }
      else if (t.side === 'BUY' && t.size * t.price >= s.cfg.minUsd) { mk ??= await kalshiMarkets(s.env); if (mk.length) await buy(s, t, mk); } }
    s.st.seen = [...seen].slice(-800); s.st.last = Date.now(); s.st.watching = addrs.length; await save(s); return { ran: true, trades: trades.length, logs: s.logs.length };
  } catch (e) { s.st.last = Date.now(); log(s, { trader: 'bot', title: 'Run failed: ' + String(e.message || e).slice(0, 120), st: 'error' }); await save(s).catch(() => {}); return { ran: true, error: String(e.message || e) }; }
}
async function manualSell(id) { const s = await open(); for (const p of s.pos.filter(p => id === 'all' || p.id === id)) await sell(s, p, id === 'all' ? 'sold everything' : 'sold by you'); await save(s, s.row.enabled && !s.disable); }
module.exports = { DEF, run, manualSell, open, liveStatus, J, match, tok, dirs };
