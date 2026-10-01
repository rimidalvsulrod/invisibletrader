// Copy-trading engine — REAL MONEY ONLY. Your Kalshi account is the source of truth:
//   cash comes from GET /portfolio/balance, holdings from GET /portfolio/positions, executions from order fill counts.
// Signals come from Polymarket (traders you follow, or the top 10 if you follow no one). A copy is placed only when the
// Kalshi market is clearly the same question:
//   most words of the Polymarket question appear in the Kalshi market, every number/date matches,
//   direction words (above/below/before/after/not…) are identical, both resolve within 3 days of each other,
//   and the Kalshi ask is within your slippage of what the trader paid.
// Orders are immediate-or-cancel limit orders (nothing rests on the book); sells are reduce-only.
const crypto = require('crypto');
const db = require('./db'), K = require('./kalshi'), S = require('./settings');
const DEF = { pct: 5, maxOrder: 25, minUsd: 1000, maxPrice: 85, slip: 3, maxUse: 100, thresh: 75 };
const STOP = new Set('will the a an of in on at to be by for and or is are with from vs than this that win wins won'.split(' '));
const DIR = new Set('above below over under more less fewer higher lower before after not least most exceed exceeds'.split(' '));
const tok = s => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(w => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
const dirs = ws => [...new Set(ws.filter(w => DIR.has(w)))].sort().join(',');
const cents = (d, c) => { const x = parseFloat(d); return isNaN(x) ? (c ?? 0) : Math.round(x * 100); };
const num = (d, c) => { const x = parseFloat(d); return isNaN(x) ? (c ?? 0) : x; };
const getJSON = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${u.split('?')[0]}`)));
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const DAY = 864e5, MKC = {}, PMC = new Map();
// Kalshi taker fee: round_up(0.07 × contracts × P × (1−P)) to the next cent
const fee = (n, c) => Math.ceil(0.07 * n * (c / 100) * (1 - c / 100) * 100 - 1e-9) / 100;
const orderCap = cfg => Math.min(cfg.maxOrder || 25, Number(process.env.MAX_ORDER_USD) || Infinity); // env var, if set, is a hard ceiling

async function kalshiMarkets(env) {
  const c = MKC[env]; if (c && Date.now() - c.t < 3e5) return c.data;
  const data = (await K.openMarkets(env)).map(m => { const ws = tok(`${m.title} ${m.yes_sub_title || ''}`);
    return { t: m.ticker, title: m.title, sub: m.yes_sub_title, ya: cents(m.yes_ask_dollars, m.yes_ask), na: cents(m.no_ask_dollars, m.no_ask), tk: new Set(ws), dir: dirs(ws),
      ends: [m.close_time, m.expected_expiration_time].map(x => Date.parse(x)).filter(x => !isNaN(x)) }; }).filter(m => m.t && m.tk.size);
  if (data.length) MKC[env] = { t: Date.now(), data }; return data;
}
async function pmEnd(conditionId) {
  if (PMC.has(conditionId)) return PMC.get(conditionId);
  const d = await getJSON(`https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`).then(r => Date.parse(r?.[0]?.endDate)).catch(() => NaN);
  PMC.set(conditionId, d); if (PMC.size > 5000) PMC.clear(); return d;
}
function match(title, mk, th, end) {
  const ws = [...new Set(tok(title))]; if (ws.length < 3) return { reason: 'question too short to match safely' };
  const nums = ws.filter(w => /\d/.test(w)), d = dirs(ws); let best = null, near = null;
  for (const m of mk) {
    let h = 0; for (const w of ws) if (m.tk.has(w)) h++; const s = h / ws.length;
    if (s < th || !nums.every(n => m.tk.has(n)) || h / m.tk.size < .25) continue;
    if (m.dir !== d) { near ??= 'wording differs (above/below/before/after/not)'; continue; }
    if (isNaN(end) || !m.ends.length) { near ??= 'could not confirm the resolution date'; continue; }
    if (!m.ends.some(x => Math.abs(x - end) <= 3 * DAY)) { near ??= 'resolves on a different date'; continue; }
    if (!best || s > best.s) best = { m, s };
  }
  return best || { reason: near || 'not on Kalshi' };
}
const runCtx = () => { const T = new Map(); let top; return {
  trades: a => T.get(a) ?? T.set(a, getJSON(`https://data-api.polymarket.com/trades?user=${a}&limit=15`).catch(() => [])).get(a),
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

async function buy(s, t, mk, acct) {
  const c = s.cfg, base = { trader: t.name || t.pseudonym || t.proxyWallet.slice(0, 8), title: t.title, outcome: t.outcome, pm: Math.round(t.price * 100), usd: t.size * t.price, act: 'buy' };
  const o = String(t.outcome).toLowerCase(); if (o !== 'yes' && o !== 'no') return log(s, { ...base, st: 'skip', note: 'not a Yes/No market' });
  const b = match(t.title, mk, c.thresh / 100, await pmEnd(t.conditionId)); if (!b.m) return log(s, { ...base, st: 'skip', note: b.reason });
  const ask = o === 'yes' ? b.m.ya : b.m.na, e = { ...base, tk: b.m.t, kt: b.m.title + (b.m.sub ? ' — ' + b.m.sub : ''), side: o, ask, asset: t.asset };
  if (!ask || ask < 1 || ask > 99) return log(s, { ...e, st: 'skip', note: 'no Kalshi price right now' });
  if (ask > c.maxPrice) return log(s, { ...e, st: 'skip', note: `Kalshi price ${ask}¢ is above your max ${c.maxPrice}¢` });
  if (ask > e.pm + c.slip) return log(s, { ...e, st: 'skip', note: `Kalshi ${ask}¢ vs the trader's ${e.pm}¢ — more than ${c.slip}¢ worse` });
  if (s.copies.some(p => p.tk === e.tk) || held(acct, e.tk, 'yes') + held(acct, e.tk, 'no') > 0) return log(s, { ...e, st: 'skip', note: 'you already hold this market' });
  // size: % of your Kalshi cash, capped by max-per-order, fee included, never more than the cash you have
  const budget = Math.min(acct.cash * c.pct / 100, orderCap(c), acct.cash - 0.01);
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
    const acct = await account(s.creds); reconcile(s, acct);
    let addrs = (await db.q('SELECT wallet FROM follows')).map(r => r.wallet); if (!addrs.length) addrs = await ctx.top(); addrs = addrs.slice(0, 15);
    s.st.since ??= Math.floor(Date.now() / 1000) - 30; const seen = new Set(s.st.seen || []);
    for (const id of s.st.retry || []) { s.st.retry = s.st.retry.filter(x => x !== id); const cp = s.copies.find(x => x.id === id); if (cp) await sellCopy(s, cp, acct, 'retrying sell'); }
    const trades = (await Promise.all(addrs.map(a => ctx.trades(a)))).flat().filter(t => t && t.timestamp >= s.st.since && !seen.has(t.transactionHash + t.asset + t.size + t.side)).sort((a, b) => a.timestamp - b.timestamp);
    let mk = null;
    for (const t of trades) { if (s.disable) break; seen.add(t.transactionHash + t.asset + t.size + t.side);
      if (t.side === 'SELL') { for (const cp of s.copies.filter(p => p.asset === t.asset)) await sellCopy(s, cp, acct, `${cp.trader} sold`); }
      else if (t.side === 'BUY' && t.size * t.price >= s.cfg.minUsd) { mk ??= await kalshiMarkets(s.creds.env); if (mk.length) await buy(s, t, mk, acct); } }
    s.st.seen = [...seen].slice(-800); s.st.last = Date.now(); s.st.watching = addrs.length; await save(s); return { ran: true, trades: trades.length, logs: s.logs.length };
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
module.exports = { DEF, run, manualSell, open, account, fee, J, match, tok, dirs, orderCap };
