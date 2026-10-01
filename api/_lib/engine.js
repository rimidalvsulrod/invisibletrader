// Copy-trading engine — REAL MONEY ONLY. Your Kalshi account is the source of truth:
//   cash comes from GET /portfolio/balance, holdings from GET /portfolio/positions, executions from order fill counts.
// Signals come from Polymarket (traders you follow, or the top 10 if you follow no one). A copy is placed only when the
// Kalshi market is clearly the same bet (see match.js) and the Kalshi ask is within your slippage of what the trader paid.
// Orders are immediate-or-cancel limit orders (nothing rests on the book); sells are reduce-only.
const crypto = require('crypto');
const db = require('./db'), K = require('./kalshi'), S = require('./settings'), M = require('./match');
const DEF = { pct: 5, minUsd: 1000, maxPrice: 85, slip: 3, maxUse: 100, thresh: 75 };
const cents = (d, c) => { const x = parseFloat(d); return isNaN(x) ? (c ?? 0) : Math.round(x * 100); };
const num = (d, c) => { const x = parseFloat(d); return isNaN(x) ? (c ?? 0) : x; };
const getJSON = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${u.split('?')[0]}`)));
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const DAY = 864e5;
const tkey = t => crypto.createHash('sha1').update(`${t.transactionHash}|${t.asset}|${t.size}|${t.side}`).digest('base64').slice(0, 12);
// Kalshi taker fee: round_up(0.07 × contracts × P × (1−P)) to the next cent
const fee = (n, c) => Math.ceil(0.07 * n * (c / 100) * (1 - c / 100) * 100 - 1e-9) / 100;
const orderCap = () => Number(process.env.MAX_ORDER_USD) || Infinity; // optional server-side ceiling (MAX_ORDER_USD); none by default

// polling (backup for the live stream in runner.js); the cache-buster skips Polymarket's 5-minute CDN cache
const runCtx = () => { const T = new Map(); let top; return {
  trades: a => T.get(a) ?? T.set(a, getJSON(`https://data-api.polymarket.com/trades?user=${a}&limit=25&_=${Date.now()}`).catch(() => [])).get(a),
  top: () => top ??= getJSON('https://data-api.polymarket.com/v1/leaderboard?timePeriod=ALL&orderBy=PNL&limit=10').then(r => r.map(x => x.proxyWallet)).catch(() => []) }; };

/* ---------- Kalshi account snapshot ---------- */
async function account(c) { // {cash, value, pos: Map(ticker -> {yes, no, exposure, realized, fees})}
  const [b, p] = await Promise.all([K.call(c, 'GET', '/portfolio/balance'), K.call(c, 'GET', '/portfolio/positions?limit=200&count_filter=position')]);
  if (!b.ok) throw new Error(`Kalshi balance: ${b.json?.error?.message || b.json?.message || b.status}`);
  if (!p.ok) throw new Error(`Kalshi positions: ${p.json?.error?.message || p.json?.message || p.status}`);
  const pos = new Map();
  for (const x of p.json.market_positions || []) { const n = num(x.position_fp, x.position); if (!n) continue;
    pos.set(x.ticker, { yes: n > 0 ? n : 0, no: n < 0 ? -n : 0, exposure: num(x.market_exposure_dollars, (x.market_exposure || 0) / 100), realized: num(x.realized_pnl_dollars, (x.realized_pnl || 0) / 100), fees: num(x.fees_paid_dollars, (x.fees_paid || 0) / 100) }); }
  const cash = !isNaN(parseFloat(b.json.balance_dollars)) ? parseFloat(b.json.balance_dollars) : (b.json.balance || 0) / 100;
  return { cash, value: (b.json.portfolio_value || 0) / 100, pos };
}
const held = (acct, tk, side) => { const p = acct.pos.get(tk); return p ? Math.floor(side === 'yes' ? p.yes : p.no) : 0; };

/* ---------- session ---------- */
async function open() {
  const row = await db.one("SELECT * FROM bot WHERE id='me'"), cfg = { ...DEF, ...J(row.cfg, {}) };
  const creds = await S.getCreds().catch(() => null);
  return { row, cfg, creds, st: J(row.state, {}), copies: J(row.positions, []).filter(p => !p.paper) /* drop leftovers from the old practice mode */, logs: [], orders: 0, disable: false };
}
const log = (s, e) => s.logs.push({ t: Date.now(), ...e });
const bad = (s, e, r) => { s.st.errs = (s.st.errs || 0) + 1; log(s, { ...e, st: 'error', note: r.json?.error?.message || r.json?.error || r.json?.message || `Kalshi error ${r.status}` });
  if (s.st.errs >= 3) { s.disable = true; log(s, { trader: 'bot', title: 'Bot paused after 3 Kalshi errors in a row — check the Activity log', st: 'error' }); } };

// keep the bot's copies in line with what Kalshi says you actually hold
function reconcile(s, acct) {
  for (const cp of [...s.copies]) {
    const h = held(acct, cp.tk, cp.side);
    if (h <= 0) { s.copies = s.copies.filter(x => x.id !== cp.id); log(s, { trader: cp.trader, title: cp.title, tk: cp.tk, side: cp.side, act: 'sell', st: 'closed', note: 'no longer held on Kalshi (settled or sold outside the bot)' }); }
    else if (h < cp.count) { cp.cost = cp.cost * h / cp.count; cp.count = h; }
  }
}

async function buy(s, t, acct, usd) {
  const c = s.cfg, base = { trader: t.name || t.pseudonym || t.proxyWallet.slice(0, 8), title: t.title, outcome: t.outcome, pm: Math.round(t.price * 100), usd, act: 'buy' };
  const b = await M.resolve(s.creds.env, t, c.thresh / 100).catch(e => ({ reason: `couldn't check Kalshi (${String(e.message || e).slice(0, 60)})` }));
  if (!b.m) return log(s, { ...base, st: 'skip', note: b.reason });
  const o = b.side, ask = o === 'yes' ? b.m.ya : b.m.na, e = { ...base, tk: b.m.t, kt: b.m.title + (b.m.sub ? ' — ' + b.m.sub : ''), side: o, ask, asset: t.asset };
  if (!ask || ask < 1 || ask > 99) return log(s, { ...e, st: 'skip', note: 'no Kalshi price right now' });
  if (ask > c.maxPrice) return log(s, { ...e, st: 'skip', note: `Kalshi price ${ask}¢ is above your max ${c.maxPrice}¢` });
  if (ask > e.pm + c.slip) return log(s, { ...e, st: 'skip', note: `Kalshi ${ask}¢ vs the trader's ${e.pm}¢ — more than ${c.slip}¢ worse` });
  if (ask < e.pm - 15) return log(s, { ...e, st: 'skip', note: `Kalshi ${ask}¢ vs the trader's ${e.pm}¢ — prices too far apart to be the same bet` });
  if (s.copies.some(p => p.tk === e.tk) || held(acct, e.tk, 'yes') + held(acct, e.tk, 'no') > 0) return log(s, { ...e, st: 'skip', note: 'you already hold this market' });
  // size: % of your Kalshi cash, fee included, never more than the cash you have
  const budget = Math.min(acct.cash * c.pct / 100, orderCap(), acct.cash - 0.01);
  let n = Math.floor(budget * 100 / ask); while (n > 0 && n * ask / 100 + fee(n, ask) > budget) n--;
  if (n < 1) return log(s, { ...e, st: 'skip', note: `${c.pct}% of your $${acct.cash.toFixed(2)} cash is less than 1 contract at ${ask}¢` });
  const exposure = s.copies.reduce((a, p) => a + p.cost, 0); if (exposure + n * ask / 100 > (acct.cash + exposure) * c.maxUse / 100) return log(s, { ...e, st: 'skip', note: `would put more than ${c.maxUse}% of your money in copied trades` });
  if (s.orders >= 5) return log(s, { ...e, st: 'skip', note: 'max 5 orders per check' }); s.orders++;
  const r = await K.placeOrder(s.creds, { ticker: e.tk, side: o, action: 'buy', count: n, priceCents: ask, ref: `it-b-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` });
  if (!r.ok) return bad(s, e, r); s.st.errs = 0;
  const f = Math.floor(num(r.json.fill_count_fp, num(r.json.fill_count, 0)));
  if (f < 1) return log(s, { ...e, count: n, st: 'skip', note: `order for ${n} at ${ask}¢ didn't fill — price moved` });
  const spent = f * ask / 100 + fee(f, ask); acct.cash -= spent;
  s.copies.push({ id: crypto.randomBytes(5).toString('hex'), tk: e.tk, side: o, count: f, ask, cost: f * ask / 100, asset: t.asset, trader: e.trader, title: e.title, kt: e.kt, t: Date.now() });
  log(s, { ...e, count: f, st: 'bought', note: `${f} contract${f > 1 ? 's' : ''} at up to ${ask}¢ · ≈$${spent.toFixed(2)} incl. fees${f < n ? ` (${n - f} didn't fill)` : ''}` });
}
// sell n contracts of ticker/side at the best bid (reduce-only, immediate-or-cancel; limit 5¢ under the bid so it fills)
async function sellTk(s, tk, side, n, meta, why) {
  const e = { trader: meta.trader || 'you', title: meta.title || tk, tk, kt: meta.kt, side, count: n, act: 'sell', outcome: side };
  const m = await K.market(s.creds.env, tk).catch(() => null);
  if (!m) return log(s, { ...e, st: 'error', note: `${why}: couldn't load the market from Kalshi` }), 0;
  if (m.status && !['active', 'open'].includes(m.status)) return log(s, { ...e, st: 'skip', note: `market is ${m.status} — Kalshi pays it out automatically` }), 0;
  const bid = cents(side === 'yes' ? m.yes_bid_dollars : m.no_bid_dollars, side === 'yes' ? m.yes_bid : m.no_bid);
  if (bid < 1) return log(s, { ...e, st: 'skip', note: `${why}: nobody is bidding right now — will retry` }), -1;
  const r = await K.placeOrder(s.creds, { ticker: tk, side, action: 'sell', count: n, priceCents: Math.max(1, bid - 5), ref: `it-s-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` });
  if (!r.ok) return bad(s, e, r), 0;
  const f = Math.floor(num(r.json.fill_count_fp, num(r.json.fill_count, 0)));
  if (f < 1) return log(s, { ...e, st: 'skip', note: `${why}: sell didn't fill — will retry` }), -1;
  log(s, { ...e, count: f, ask: bid, st: 'sold', note: `${why} · ${f} at about ${bid}¢${f < n ? ` (${n - f} left)` : ''}` }); return f;
}
async function sellCopy(s, cp, acct, why) {
  const n = Math.min(cp.count, held(acct, cp.tk, cp.side)); if (n < 1) { s.copies = s.copies.filter(x => x.id !== cp.id); return; }
  const f = await sellTk(s, cp.tk, cp.side, n, cp, why);
  if (f === -1) { s.st.retry = [...new Set([...(s.st.retry || []), cp.id])]; return; }
  if (f > 0) { const p = acct.pos.get(cp.tk); if (p) p[cp.side] -= f; cp.cost = cp.cost * (cp.count - f) / cp.count; cp.count -= f; if (cp.count < 1) s.copies = s.copies.filter(x => x.id !== cp.id); }
}
async function save(s, enabled) {
  await db.q("UPDATE bot SET enabled=$1, state=$2, positions=$3, lock_until=NULL, updated=$4 WHERE id='me'", [enabled ?? (s.row.enabled && !s.disable), JSON.stringify(s.st), JSON.stringify(s.copies), Date.now()]);
  for (const l of s.logs) await db.q('INSERT INTO botlog (id, ts, entry) VALUES ($1,$2,$3)', [crypto.randomBytes(8).toString('hex'), l.t, JSON.stringify(l)]);
  if (s.logs.length) await db.q('DELETE FROM botlog WHERE ts<$1', [Date.now() - 14 * DAY]);
}
async function run(ctx = runCtx(), minGap = 0) {
  if (minGap) { const r = await db.one("SELECT state FROM bot WHERE id='me'"); if (Date.now() - (J(r?.state, {}).last || 0) < minGap) return { ran: false, why: 'ran recently' }; }
  const got = await db.one("UPDATE bot SET lock_until=$1 WHERE id='me' AND enabled=true AND (lock_until IS NULL OR lock_until<$2) RETURNING id", [Date.now() + 55e3, Date.now()]);
  if (!got) return { ran: false };
  const s = await open();
  try {
    if (!s.creds) { s.disable = true; log(s, { trader: 'bot', title: 'Bot paused — connect your Kalshi account first', st: 'error' }); await save(s); return { ran: true, error: 'no key' }; }
    if (process.env.TRADING_DISABLED) { s.disable = true; log(s, { trader: 'bot', title: 'Bot paused — TRADING_DISABLED is set on the server', st: 'error' }); await save(s); return { ran: true }; }
    let addrs = (await db.q('SELECT wallet FROM follows')).map(r => r.wallet); if (!addrs.length) addrs = await ctx.top(); addrs = addrs.slice(0, 15);
    // remember trades from the last 10 minutes only (older ones are ignored), so the state stays small
    const now = Math.floor(Date.now() / 1000); if (!s.st.seen2) { s.st.since = now - 60; delete s.st.seen; s.st.seen2 = []; }
    s.st.since = Math.max(s.st.since ?? now - 60, now - 600); const seen = new Map(s.st.seen2 || []), acc = s.st.acc || {};
    const trades = (await Promise.all(addrs.map(a => ctx.trades(a)))).flat().filter(t => t && t.timestamp >= s.st.since && !seen.has(tkey(t))).sort((a, b) => a.timestamp - b.timestamp);
    // checks run every ~10s; only touch Kalshi when there is something to do, or once a minute to stay in sync
    if (!trades.length && !(s.st.retry || []).length && Date.now() - (s.st.synced || 0) < 60e3) { s.st.last = Date.now(); s.st.watching = addrs.length; await save(s); return { ran: true, trades: 0 }; }
    const acct = await account(s.creds); reconcile(s, acct); s.st.synced = Date.now();
    for (const id of s.st.retry || []) { s.st.retry = s.st.retry.filter(x => x !== id); const cp = s.copies.find(x => x.id === id); if (cp) await sellCopy(s, cp, acct, 'retrying sell'); }
    for (const t of trades) { if (s.disable) break; seen.set(tkey(t), t.timestamp);
      if (t.side === 'SELL') { for (const cp of s.copies.filter(p => p.asset === t.asset)) await sellCopy(s, cp, acct, `${cp.trader} sold`); }
      else if (t.side === 'BUY') { // one order often arrives as several fills: add up a trader's buys of the same outcome over 10 minutes
        const a = acc[`${t.proxyWallet}|${t.asset}`.toLowerCase()] ??= { usd: 0 }; a.usd += t.size * t.price; a.t = t.timestamp;
        if (!a.fired && a.usd >= s.cfg.minUsd) { a.fired = 1; await buy(s, t, acct, a.usd); } } }
    s.st.seen2 = [...seen].filter(x => x[1] >= s.st.since); s.st.acc = Object.fromEntries(Object.entries(acc).filter(x => x[1].t >= now - 600));
    s.st.last = Date.now(); s.st.watching = addrs.length; await save(s); return { ran: true, trades: trades.length, logs: s.logs.length };
  } catch (e) { s.st.last = Date.now(); log(s, { trader: 'bot', title: 'Check failed: ' + String(e.message || e).slice(0, 140), st: 'error' }); await save(s).catch(() => {}); return { ran: true, error: String(e.message || e) }; }
}
// manual sells from the app: one ticker (any position you hold) or everything the bot copied
async function manualSell(target) {
  const s = await open(); if (!s.creds) throw new Error('Connect your Kalshi account first');
  const acct = await account(s.creds); reconcile(s, acct);
  if (target === 'all') { for (const cp of [...s.copies]) await sellCopy(s, cp, acct, 'sold everything'); }
  else { const tk = String(target); for (const side of ['yes', 'no']) { const n = held(acct, tk, side); if (n < 1) continue;
      const cp = s.copies.find(x => x.tk === tk && x.side === side); const f = await sellTk(s, tk, side, n, cp || {}, 'sold by you');
      if (cp && f > 0) { cp.count -= f; if (cp.count < 1) s.copies = s.copies.filter(x => x !== cp); } } }
  await save(s, s.row.enabled && !s.disable);
}
module.exports = { DEF, run, manualSell, open, account, fee, J, orderCap };
