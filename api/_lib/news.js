// Newsflash: trades stock headlines through the user's Alpaca account (paper or live).
// News arrives on Alpaca's real-time Benzinga stream (REST polling as a fallback). Each headline about 1-3 stocks is
// scored with a weighted phrase list; a strong positive score buys, a strong negative one sells a position the bot holds.
// Exits are automatic: +3% take profit, -1.5% stop, 30 minutes max, everything flat 5 minutes before the close.
const crypto = require('crypto'), db = require('./db'), S = require('./settings'), AL = require('./alpaca');
const DEF = { size: 'pct', pct: 2, usd: 100 }, BUY_AT = 3, MAX_OPEN = 12, EXPOSURE = .4, PER_DAY = 3, TP = .03, SL = -.015, HOLD = 30 * 6e4, DAILY_STOP = .03, FRESH = 3 * 6e4, CLOSE_BUFFER = 6 * 6e4;
// What can still stop a qualifying headline from becoming a trade: the market is closed or the stock is halted/untradable, there is no cash, the bot's own
// losses today passed 3% of the account, 12 positions / 40% of the account are already open, or the stock was traded 3 times today. Everything else (a slow
// API, a rate limit, a failed clock look-up, two headlines at once, a dropped stream) is retried or queued, never dropped.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TRANSIENT = /fetch failed|timeout|timed out|ECONN|ETIMEDOUT|EAI_AGAIN|socket|too many requests|rate limit|Alpaca: (5\d\d|.*(unavailable|temporar|gateway|internal))/i;
async function retry(fn, tries = 3) { for (let i = 1; ; i++) { try { return await fn(); } catch (e) { if (i >= tries || !TRANSIENT.test(String(e && e.message))) throw e; await sleep(250 * i); } } }
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

/* ---------- scoring ---------- */
const PHRASES = [
  // strong positive
  [5, /\bfda (approv|clear|grant)|\breceives? fda\b|\bapproval (of|for)\b.*\b(drug|therapy|treatment)/], [5, /\bto be acquired\b|\bagrees? to be (acquired|bought)\b|\bbuyout\b|\btakeover (offer|bid)\b/],
  [4, /\b(beats?|tops|topped|exceeds?|exceeded|surpass\w*)\b(?:[^.;]|\.\d){0,30}\b(estimates?|expectations|consensus|forecasts?)\b/], [4, /\braises? (\w+ )?(guidance|outlook|forecast)\b/],
  [4, /\b(positive|successful|met (its )?primary endpoint)\b.*\b(trial|study|data)\b|\btopline results?\b.*\bpositive\b/], [3, /\bupgrade[sd]?\b/],
  [3, /\b(share )?(buyback|repurchase)\b/], [3, /\brecord (quarterly |annual )?(revenue|sales|profit|earnings)\b/], [3, /\b(wins?|awarded|secures?) .{0,40}\bcontract\b/],
  [2, /\b(partnership|collaboration|strategic agreement)\b/], [2, /\bdividend (increase|hike)|\braises? (its )?dividend\b/], [2, /\bprice target (raised|increase)|\braises? price target\b/],
  // strong negative
  [-6, /\bbankrupt|\bchapter 11\b|\bdelist/], [-5, /\b(fda )?(reject|complete response letter|crl)\b/], [-5, /\b(fail(s|ed)?|misses?) (its )?(primary )?endpoint\b|\btrial (halt|fail)/],
  [-4, /\b(miss(es|ed)?|falls? short of|below)\b(?:[^.;]|\.\d){0,30}\b(estimates?|expectations|consensus)\b/], [-4, /\b(cuts?|lowers?|slashes?|withdraws?) (\w+ )?(guidance|outlook|forecast)\b/],
  [-4, /\b(sec|doj|ftc) (probe|investigation|charges?|subpoena)|\bunder investigation\b|\bfraud\b/], [-3, /\bdowngrade[sd]?\b/],
  [-3, /\b(public|stock|share|equity) offering\b|\bdilut|\bat-the-market\b/], [-3, /\brecall(s|ed)?\b/], [-3, /\b(layoffs?|job cuts)\b/], [-2, /\bprice target (cut|lowered)|\blowers? price target\b/],
  [-2, /\blawsuit|\bsued\b|\bclass action\b/], [-3, /\b(ceo|cfo) (resigns?|steps down|departs?|fired)\b/],
];
const NOISE = /\b(shares are trading|stocks? (moving|to watch)|movers|mid-day|pre-market|after-hours|top (gainers|losers)|why .* (is|are) (trading|moving)|options activity|unusual options|earnings preview|what to expect|scheduled to report)\b/;
function score(n) {
  const t = String(n.headline || '').toLowerCase(); if (NOISE.test(t)) return { s: 0, hits: ['market recap'] };
  if (/\?\s*$/.test(t) || /^(can|will|should|is|are|does|do|could|would|why|how|what)\b/.test(t)) return { s: 0, hits: ['question, not news'] };
  let s = 0; const hits = []; for (const [w, re] of PHRASES) if (re.test(t)) { s += w; hits.push((w > 0 ? '+' : '') + w); }
  if (/\b(may|could|might|considering|exploring|reportedly|rumor)\b/.test(t)) s *= .6; // unconfirmed: weaker
  return { s: Math.round(s * 10) / 10, hits };
}

/* ---------- news feed ---------- */
const SEEN = new Set(), FEED = []; let ws = null, wsUp = false, wsErr = '', wsNext = 0, lastPoll = 0, onNews = null;
async function feedCreds() { // news is the same for everyone: any connected key can carry the stream (the admin's first)
  const r = await db.q("SELECT id FROM users WHERE alpaca IS NOT NULL AND verified=true ORDER BY admin DESC LIMIT 1").catch(() => []);
  return r[0] ? AL.getAlpacaCreds(r[0].id).catch(() => null) : null;
}
function ingest(n) {
  const id = String(n.id); if (SEEN.has(id)) return; SEEN.add(id); if (SEEN.size > 5000) SEEN.delete(SEEN.values().next().value);
  const syms = (n.symbols || []).filter(x => /^[A-Z.]{1,6}$/.test(x)), sc = score(n), item = { id, t: Date.parse(n.created_at) || Date.now(), seen: Date.now(), headline: unent(n.headline), url: n.url, syms, score: sc.s, hits: sc.hits };
  FEED.unshift(item); if (FEED.length > 40) FEED.pop(); if (onNews) onNews(item);
}
async function stream() {
  if (ws && ws.readyState <= 1) return; if (Date.now() < wsNext) return;
  const c = await feedCreds(); if (!c) { wsErr = 'connect an Alpaca account to start the news feed'; wsNext = Date.now() + 3e4; return; }
  let WebSocket; try { WebSocket = require('ws'); } catch (_) { return; }
  ws = new WebSocket('wss://stream.data.alpaca.markets/v1beta1/news', { headers: AL.hdr(c) });
  ws.on('message', d => { let a; try { a = JSON.parse(d); } catch (_) { return; } for (const m of [].concat(a)) {
    if (m.T === 'success' && m.msg === 'authenticated') { wsUp = true; wsErr = ''; lastPoll = 0; /* catch up on anything that landed while it was down */ ws.send(JSON.stringify({ action: 'subscribe', news: ['*'] })); }
    else if (m.T === 'error') { wsErr = `Alpaca news: ${m.msg || m.code}`; }
    else if (m.T === 'n') ingest(m); } });
  const down = e => { wsUp = false; if (e) wsErr = String(e.message || e).slice(0, 80); wsNext = Date.now() + 5e3; };
  ws.on('close', () => down()); ws.on('error', down);
  ws.on('unexpected-response', (_, res) => down(`Alpaca news stream refused (${res.statusCode})`));
}
function unent(t) { return String(t || '').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d)).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
async function poll() { // newest headlines every 5s while the stream is down; every 15s as a safety net while it is up (a stream that goes quiet without closing would otherwise lose headlines)
  if (Date.now() - lastPoll < (wsUp ? 15e3 : 5e3)) return; lastPoll = Date.now();
  const c = await feedCreds(); if (!c) return;
  const j = await AL.news(c).catch(e => { wsErr = e.message; return null; }); if (!j?.news) return;
  for (const n of j.news.slice().reverse()) ingest(n);
}

/* ---------- per user ---------- */
async function open(uid) {
  await db.q("INSERT INTO nbot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM nbot WHERE uid=$1', [uid]), c = J(row.cfg, {});
  return { row, cfg: { size: c.size === 'usd' ? 'usd' : 'pct', pct: c.pct > 0 ? c.pct : DEF.pct, usd: c.usd > 0 ? c.usd : DEF.usd } };
}
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
const CLOCK = new Map(); // per key: the market clock, cached 60s but never across an open or a close
// regular hours from the calendar (Mon-Fri 9:30-16:00 New York), used only when Alpaca's clock cannot be read: a failed look-up is not "market closed"
function schedule(now = Date.now()) {
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(now)).map(x => [x.type, x.value]));
  const mins = (+f.hour % 24) * 60 + +f.minute, wk = !/Sat|Sun/.test(f.weekday), open = wk && mins >= 570 && mins < 960;
  return { is_open: open, next_close: new Date(now + ((960 - mins) * 60 - +f.second) * 1e3).toISOString(), next_open: null, fallback: true };
}
async function marketOpen(c) {
  const k = c.key, x = CLOCK.get(k), now = Date.now(); if (x && now - x.t < 6e4 && Date.parse(x.v.is_open ? x.v.next_close : x.v.next_open) - now > 5e3) return x.v;
  try { const v = await retry(() => AL.clock(c)); if (v && typeof v.is_open === 'boolean') { CLOCK.set(k, { t: now, v }); return v; } } catch (_) {}
  return schedule(now);
}
const rec = (uid, n, sym, extra) => db.q('INSERT INTO ntrades (id, uid, ts, sym, headline, url, score, status, reason, newsid, notional, qty, entry) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
  [crypto.randomBytes(8).toString('hex'), uid, Date.now(), sym, n.headline, n.url, n.score, extra.status, extra.reason || null, n.id, extra.notional || null, extra.qty || null, extra.entry || null]);
const skip = (uid, n, sym, reason) => rec(uid, n, sym, { status: 'skip', reason });

// one stock's headlines are handled one after another per user (a second headline waits for the first instead of being dropped); different users run side by side
const QUEUE = new Map();
function act(uid, n) {
  const k = uid + '|' + (n.syms[0] || ''), next = (QUEUE.get(k) || Promise.resolve()).catch(() => {}).then(() => act1(uid, n)); QUEUE.set(k, next);
  next.catch(() => {}).then(() => { if (QUEUE.get(k) === next) QUEUE.delete(k); }); return next;
}
// place the buy; if the network or Alpaca hiccups, look the order up by its id before sending it again so it can never be bought twice
async function placeBuy(c, sym, notional, qty, cid) {
  const send = () => qty ? AL.buyQty(c, sym, qty, cid) : AL.buy(c, sym, notional, cid);
  for (let i = 1; ; i++) { try { return await send(); } catch (e) {
    if (c.broker !== 'webull') { if (/client_order_id/i.test(e.message)) { const ex = await AL.byCid(c, cid).catch(() => null); if (ex && ex.id) return ex; } }
    if (i >= 3 || !TRANSIENT.test(String(e.message))) throw e; await sleep(300 * i);
    if (c.broker !== 'webull') { const ex = await AL.byCid(c, cid).catch(() => null); if (ex && ex.id) return ex; } } }
}
async function act1(uid, n) {
  const { row, cfg } = await open(uid); if (!row.enabled) return; const c = await AL.getCreds(uid); if (!c) return;
  if (!n.syms.length || Math.abs(n.score) < BUY_AT) return; // untagged stories and weak headlines aren't trades
  if (Date.now() - n.t > FRESH) return; // old news (a catch-up after an outage): the move already happened
  const sym = n.syms[0]; // the first tagged company is the subject
  if (n.syms.length > 3) return skip(uid, n, sym, `about ${n.syms.length} companies, not one`);
  if (await db.one('SELECT id FROM ntrades WHERE uid=$1 AND newsid=$2 AND sym=$3', [uid, String(n.id), sym])) return; // this headline was already handled (two runners overlapping): never twice
  const clk = await marketOpen(c); if (!clk.is_open) return skip(uid, n, sym, 'market closed');
  if (n.score <= -BUY_AT) { // bad news: get out of anything the bot holds in these stocks
    for (const t of await db.q("SELECT * FROM ntrades WHERE uid=$1 AND status='open' AND sym = ANY($2)", [uid, n.syms])) await exit(uid, c, t, 'negative headline').catch(e => console.error('news exit', t.sym, e.message));
    return;
  }
  try {
    if (Date.parse(clk.next_close) - Date.now() < CLOSE_BUFFER) return await skip(uid, n, sym, 'too close to the market close');
    const acct = await retry(() => AL.account(c)), eq = Number(acct.equity), cash = Number(acct.cash);
    const lost = await db.one("SELECT coalesce(sum(pnl),0) AS p FROM ntrades WHERE uid=$1 AND status='closed' AND exitts>=$2", [uid, dayStart()]); // the bot's own results, not the rest of your account
    if (eq > 0 && Number(lost.p) <= -DAILY_STOP * eq) return await skip(uid, n, sym, 'daily loss limit: the bot is down 3% of the account today');
    const open = await db.q("SELECT sym, notional FROM ntrades WHERE uid=$1 AND status='open'", [uid]), used = open.reduce((a, t) => a + (Number(t.notional) || 0), 0);
    if (open.length >= MAX_OPEN) return await skip(uid, n, sym, `already ${MAX_OPEN} positions open`);
    if (open.some(t => t.sym === sym)) return await skip(uid, n, sym, 'already holding it');
    if ((await db.one("SELECT count(*)::int AS n FROM ntrades WHERE uid=$1 AND sym=$2 AND ts>=$3 AND status IN ('open','closed')", [uid, sym, dayStart()])).n >= PER_DAY) return await skip(uid, n, sym, `already traded this stock ${PER_DAY} times today`);
    const room = EXPOSURE * eq - used, notional = Math.min(cfg.size === 'usd' ? cfg.usd : eq * cfg.pct / 100, cash * .95, room);
    if (notional < 1) return await skip(uid, n, sym, room < 1 ? `${Math.round(EXPOSURE * 100)}% of the account is already in open trades` : 'not enough cash');
    const a = await retry(() => AL.asset(c, sym)); if (!a.tradable) return await skip(uid, n, sym, 'not tradable on Alpaca');
    const cid = `nf-${String(n.id).slice(0, 40)}-${sym}`; let o, qty = 0;
    if (!a.fractionable) { // no fractional shares for this stock: buy whole shares worth about the same
      const px = await retry(() => AL.last(c, sym)); qty = px > 0 ? Math.max(1, Math.floor(notional / px)) : 0;
      if (!qty || qty * px > cash * .95) return await skip(uid, n, sym, `one share ($${px?.toFixed?.(2)}) costs more than the cash available`); }
    o = await placeBuy(c, sym, notional, qty, cid); let f = o; for (let i = 0; i < 6 && f.status !== 'filled'; i++) { await sleep(500); f = await AL.order(c, o.id).catch(() => f); }
    await rec(uid, n, sym, { status: 'open', notional, qty: Number(f.filled_qty) || null, entry: Number(f.filled_avg_price) || null });
  } catch (e) { await skip(uid, n, sym, String(e.message).slice(0, 120)); } // the reason is always on record
}
const SELLING = new Map();
async function exit(uid, c, t, why) {
  const p0 = (await AL.positions(c).catch(() => [])).find?.(x => x.symbol === t.sym); // price + fill details just before selling
  if (p0) { t.lastp = Number(p0.current_price); if (!t.entry) { t.entry = Number(p0.avg_entry_price); t.qty = Number(p0.qty); } }
  if (!p0) { await db.q("UPDATE ntrades SET status='closed', reason=coalesce(reason,'closed outside the bot'), exitts=$2 WHERE id=$1", [t.id, Date.now()]); return; }
  const mine = Number(t.qty) > 0 ? Number(t.qty) : 0, held = Number(p0.qty);
  if (mine && held > mine + 1e-6) { // you also own shares of this stock: sell only the bot's
    if (Date.now() - (SELLING.get(t.id) || 0) < 6e4) return; SELLING.set(t.id, Date.now()); // a sell is already on its way
    const o = await AL.sell(c, t.sym, mine); let f = o; for (let i = 0; i < 6 && f.status !== 'filled'; i++) { await new Promise(z => setTimeout(z, 500)); f = await AL.order(c, o.id).catch(() => f); }
    if (f.status !== 'filled') return; SELLING.delete(t.id); t.lastp = Number(f.filled_avg_price) || t.lastp;
  } else {
    try { await AL.close(c, t.sym); } catch (e) { if (!/position/i.test(e.message)) throw e; } // already flat is fine
    const p = await AL.positions(c).catch(() => []); if (p.find?.(x => x.symbol === t.sym)) return; // still closing; next check finishes it
  }
  const last = t.lastp || t.entry, pnl = t.entry && t.qty ? (last - t.entry) * t.qty : null;
  await db.q("UPDATE ntrades SET status='closed', exitp=$2, pnl=$3, reason=$4, exitts=$5 WHERE id=$1", [t.id, last, pnl, why, Date.now()]);
}
// exits for every open trade: take profit, stop, time, and the close
async function manage() {
  const open = await db.q("SELECT * FROM ntrades WHERE status='open' ORDER BY uid"); const byU = new Map(); open.forEach(t => (byU.get(t.uid) || byU.set(t.uid, []).get(t.uid)).push(t));
  for (const [uid, ts] of byU) {
    const c = await AL.getCreds(uid).catch(() => null); if (!c) continue;
    const pos = await AL.positions(c).catch(() => null); if (!Array.isArray(pos)) continue; const clk = await marketOpen(c);
    for (const t of ts) {
      const p = pos.find(x => x.symbol === t.sym);
      if (!p) { await db.q("UPDATE ntrades SET status='closed', reason=coalesce(reason,'closed outside the bot'), exitts=$2 WHERE id=$1", [t.id, Date.now()]); continue; }
      if (!t.entry) { t.entry = Number(p.avg_entry_price); t.qty = Number(p.qty); await db.q('UPDATE ntrades SET entry=$2, qty=$3 WHERE id=$1', [t.id, t.entry, t.qty]); }
      t.lastp = Number(p.current_price); const ch = t.lastp / t.entry - 1;
      const why = ch >= TP ? 'take profit +3%' : ch <= SL ? 'stop loss -1.5%' : Date.now() - Number(t.ts) > HOLD ? 'held 30 minutes' : clk?.next_close && Date.parse(clk.next_close) - Date.now() < 5 * 6e4 ? 'market closing' : null;
      if (why) await exit(uid, c, t, why).catch(e => console.error('news exit', t.sym, e.message));
    }
  }
}
let busy = false;
async function tick() { // runner: every few seconds
  if (busy) return; busy = true;
  try { await stream().catch(e => { wsErr = e.message; }); await poll().catch(() => {}); await manage().catch(e => console.error('news manage', e.message));
    await S.set('newslive', JSON.stringify({ t: Date.now(), feed: wsUp ? 'stream' : 'poll', err: wsUp ? '' : wsErr, news: FEED.slice(0, 25) }));
  } finally { busy = false; }
}
function start() { // react to each headline the moment it lands
  onNews = async n => { if (Math.abs(n.score) < BUY_AT) return;
    await Promise.all((await db.q("SELECT n.uid FROM nbot n JOIN users u ON u.id=n.uid WHERE n.enabled=true AND u.verified=true AND u.alpaca IS NOT NULL").catch(() => [])).map(r => act(r.uid, n).catch(e => console.error('news', r.uid, e.message)))); }; // everyone at once: nobody waits behind another account's order
}
module.exports = { schedule, retry, TRANSIENT, QUEUE, DEF, BUY_AT, MAX_OPEN, EXPOSURE, PER_DAY, FRESH, score, ingest, act, manage, tick, start, open, FEED };
