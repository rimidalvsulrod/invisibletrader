// Newsflash: trades stock headlines through the user's Alpaca account (paper or live).
// News arrives on Alpaca's real-time Benzinga stream (REST polling as a fallback). Each headline about 1-3 stocks is
// scored with a weighted phrase list; a strong positive score buys, a strong negative one sells a position the bot holds.
// Exits are automatic: +3% take profit, -1.5% stop, 30 minutes max, everything flat 5 minutes before the close.
const crypto = require('crypto'), db = require('./db'), S = require('./settings'), AL = require('./alpaca');
const DEF = { size: 'pct', pct: 2, usd: 100 }, BUY_AT = 3, MAX_OPEN = 5, TP = .03, SL = -.015, HOLD = 30 * 6e4, DAILY_STOP = .03, FRESH = 90e3;
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

/* ---------- scoring ---------- */
const PHRASES = [
  // strong positive
  [5, /\bfda (approv|clear|grant)|\breceives? fda\b|\bapproval (of|for)\b.*\b(drug|therapy|treatment)/], [5, /\bto be acquired\b|\bagrees? to be (acquired|bought)\b|\bbuyout\b|\btakeover (offer|bid)\b/],
  [4, /\b(beats?|tops?|exceeds?|surpass\w*)\b(?:[^.;]|\.\d){0,30}\b(estimates?|expectations|consensus|forecasts?)\b/], [4, /\braises? (\w+ )?(guidance|outlook|forecast)\b/],
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
  let s = 0; const hits = []; for (const [w, re] of PHRASES) if (re.test(t)) { s += w; hits.push((w > 0 ? '+' : '') + w); }
  if (/\b(may|could|might|considering|exploring|reportedly|rumor)\b/.test(t)) s *= .6; // unconfirmed: weaker
  return { s: Math.round(s * 10) / 10, hits };
}

/* ---------- news feed ---------- */
const SEEN = new Set(), FEED = []; let ws = null, wsUp = false, wsErr = '', wsNext = 0, lastPoll = 0, onNews = null;
async function feedCreds() { // news is the same for everyone: any connected key can carry the stream (the admin's first)
  const r = await db.q("SELECT id FROM users WHERE alpaca IS NOT NULL AND verified=true ORDER BY admin DESC LIMIT 1").catch(() => []);
  return r[0] ? AL.getCreds(r[0].id).catch(() => null) : null;
}
function ingest(n) {
  const id = String(n.id); if (SEEN.has(id)) return; SEEN.add(id); if (SEEN.size > 5000) SEEN.delete(SEEN.values().next().value);
  const syms = (n.symbols || []).filter(x => /^[A-Z.]{1,6}$/.test(x)), sc = score(n), item = { id, t: Date.parse(n.created_at) || Date.now(), seen: Date.now(), headline: n.headline, url: n.url, syms, score: sc.s, hits: sc.hits };
  FEED.unshift(item); if (FEED.length > 40) FEED.pop(); if (onNews) onNews(item);
}
async function stream() {
  if (ws && ws.readyState <= 1) return; if (Date.now() < wsNext) return;
  const c = await feedCreds(); if (!c) { wsErr = 'connect an Alpaca account to start the news feed'; wsNext = Date.now() + 3e4; return; }
  let WebSocket; try { WebSocket = require('ws'); } catch (_) { return; }
  ws = new WebSocket('wss://stream.data.alpaca.markets/v1beta1/news', { headers: AL.hdr(c) });
  ws.on('message', d => { let a; try { a = JSON.parse(d); } catch (_) { return; } for (const m of [].concat(a)) {
    if (m.T === 'success' && m.msg === 'authenticated') { wsUp = true; wsErr = ''; ws.send(JSON.stringify({ action: 'subscribe', news: ['*'] })); }
    else if (m.T === 'error') { wsErr = `Alpaca news: ${m.msg || m.code}`; }
    else if (m.T === 'n') ingest(m); } });
  const down = e => { wsUp = false; if (e) wsErr = String(e.message || e).slice(0, 80); wsNext = Date.now() + 5e3; };
  ws.on('close', () => down()); ws.on('error', down);
  ws.on('unexpected-response', (_, res) => down(`Alpaca news stream refused (${res.statusCode})`));
}
async function poll() { // fallback when the stream isn't up: newest headlines every 5s
  if (wsUp || Date.now() - lastPoll < 5e3) return; lastPoll = Date.now();
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
const CLOCK = new Map(); // per key: market clock, cached 60s
async function marketOpen(c) { const k = c.key, x = CLOCK.get(k); if (x && Date.now() - x.t < 6e4) return x.v; const v = await AL.clock(c).catch(() => null); CLOCK.set(k, { t: Date.now(), v }); return v; }
const rec = (uid, n, sym, extra) => db.q('INSERT INTO ntrades (id, uid, ts, sym, headline, url, score, status, reason, newsid, notional, qty, entry) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
  [crypto.randomBytes(8).toString('hex'), uid, Date.now(), sym, n.headline, n.url, n.score, extra.status, extra.reason || null, n.id, extra.notional || null, extra.qty || null, extra.entry || null]);

async function act(uid, n) {
  const { row, cfg } = await open(uid); if (!row.enabled) return; const c = await AL.getCreds(uid); if (!c) return;
  if (Date.now() - n.t > FRESH) return; // old news: the move already happened
  if (!n.syms.length || n.syms.length > 3) return; // market-wide or roundup stories aren't about one company
  if (Math.abs(n.score) < BUY_AT) return;
  const clk = await marketOpen(c); if (!clk?.is_open) return rec(uid, n, n.syms[0], { status: 'skip', reason: 'market closed' });
  if (Date.parse(clk.next_close) - Date.now() < 15 * 6e4) return rec(uid, n, n.syms[0], { status: 'skip', reason: 'too close to the market close' });
  if (n.score <= -BUY_AT) { // bad news: get out of anything the bot holds in these stocks
    for (const t of await db.q("SELECT * FROM ntrades WHERE uid=$1 AND status='open' AND sym = ANY($2)", [uid, n.syms])) await exit(uid, c, t, 'negative headline');
    return;
  }
  const acct = await AL.account(c), eq = Number(acct.equity), cash = Number(acct.cash), lastEq = Number(acct.last_equity);
  if (lastEq > 0 && (eq - lastEq) / lastEq <= -DAILY_STOP) return rec(uid, n, n.syms[0], { status: 'skip', reason: 'daily loss limit (3%) reached' });
  const openN = (await db.one("SELECT count(*)::int AS n FROM ntrades WHERE uid=$1 AND status='open'", [uid])).n;
  for (const sym of n.syms.slice(0, 1)) { // the first tagged company is the subject
    if (openN >= MAX_OPEN) return rec(uid, n, sym, { status: 'skip', reason: `already ${MAX_OPEN} positions open` });
    if (await db.one("SELECT id FROM ntrades WHERE uid=$1 AND sym=$2 AND ts>=$3 AND status IN ('open','closed')", [uid, sym, dayStart()])) return rec(uid, n, sym, { status: 'skip', reason: 'already traded this stock today' });
    const notional = Math.min(cfg.size === 'usd' ? cfg.usd : eq * cfg.pct / 100, cash * .95);
    if (notional < 1) return rec(uid, n, sym, { status: 'skip', reason: 'not enough cash' });
    try {
      const a = await AL.asset(c, sym); if (!a.tradable || !a.fractionable) return rec(uid, n, sym, { status: 'skip', reason: 'not tradable as a fractional order' });
      const o = await AL.buy(c, sym, notional); let f = o; for (let i = 0; i < 6 && f.status !== 'filled'; i++) { await new Promise(z => setTimeout(z, 500)); f = await AL.order(c, o.id).catch(() => f); }
      await rec(uid, n, sym, { status: 'open', notional, qty: Number(f.filled_qty) || null, entry: Number(f.filled_avg_price) || null });
    } catch (e) { await rec(uid, n, sym, { status: 'skip', reason: String(e.message).slice(0, 120) }); }
  }
}
async function exit(uid, c, t, why) {
  const p0 = (await AL.positions(c).catch(() => [])).find?.(x => x.symbol === t.sym); // price + fill details just before selling
  if (p0) { t.lastp = Number(p0.current_price); if (!t.entry) { t.entry = Number(p0.avg_entry_price); t.qty = Number(p0.qty); } }
  try { await AL.close(c, t.sym); } catch (e) { if (!/position/i.test(e.message)) throw e; } // already flat is fine
  const p = await AL.positions(c).catch(() => []); if (p.find?.(x => x.symbol === t.sym)) return; // still closing; next check finishes it
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
  try { await stream().catch(e => { wsErr = e.message; }); await poll().catch(() => {}); await manage();
    await S.set('newslive', JSON.stringify({ t: Date.now(), feed: wsUp ? 'stream' : 'poll', err: wsUp ? '' : wsErr, news: FEED.slice(0, 25) }));
  } finally { busy = false; }
}
function start() { // react to each headline the moment it lands
  onNews = async n => { if (Math.abs(n.score) < BUY_AT) return;
    for (const r of await db.q("SELECT n.uid FROM nbot n JOIN users u ON u.id=n.uid WHERE n.enabled=true AND u.verified=true AND u.alpaca IS NOT NULL").catch(() => [])) await act(r.uid, n).catch(e => console.error('news', r.uid, e.message)); };
}
module.exports = { DEF, BUY_AT, score, ingest, act, manage, tick, start, open, FEED };
