// Swing Trader: buys short-term pullbacks in uptrends on the user's Alpaca account (the same connection Newsflash uses).
// Rule (tested on 2003-2026 daily data): a liquid stock/ETF closes above its 200-day average (uptrend) but its 2-day RSI is
// under 10 (sharp dip) -> buy. Sell when it closes back above its 5-day average, after 10 trading days, or at -8%.
// It decides once a day from COMPLETED daily bars (yesterday's close), 10 minutes after the open, and only ever sells shares
// it bought itself. Stocks you already hold are left alone.
const crypto = require('crypto'), db = require('./db'), S = require('./settings'), AL = require('./alpaca');
const UNIVERSE = 'SPY QQQ IWM DIA XLK XLF XLE XLV XLY XLP XLI XLU AAPL MSFT AMZN GOOGL NVDA META JPM XOM JNJ PG KO WMT HD V UNH COST CVX PEP MRK'.split(' ');
const DEF = { pct: 5, max: 5 }, R = { rsiBuy: 10, trend: 200, exitMA: 5, maxDays: 10, stop: .08, dailyStop: .03, after: 10, beforeClose: 30 * 6e4 };
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

/* ---------- indicators (same maths as the backtest) ---------- */
const smaLast = (a, n) => a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : NaN;
function rsiLast(c, n) { // Wilder RSI
  if (c.length <= n) return NaN; let au = 0, ad = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; au += Math.max(d, 0); ad += Math.max(-d, 0); } au /= n; ad /= n;
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; au = (au * (n - 1) + Math.max(d, 0)) / n; ad = (ad * (n - 1) + Math.max(-d, 0)) / n; }
  return ad === 0 ? 100 : 100 - 100 / (1 + au / ad);
}
function signal(sym, bars) { // bars: [{d, c}] completed days, oldest first
  const c = bars.map(b => b.c); if (c.length < R.trend + 1) return null;
  const px = c[c.length - 1], s200 = smaLast(c, R.trend), s5 = smaLast(c, R.exitMA), r2 = rsiLast(c, 2);
  return { sym, c: px, s200, s5, r2, up: px > s200, buy: px > s200 && r2 < R.rsiBuy, out: px > s5, asof: bars[bars.length - 1].d };
}
const ny = () => { const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()), g = k => f.find(p => p.type === k).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, min: (+g('hour') % 24) * 60 + +g('minute') }; };
const nyDay = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/* ---------- daily bars (shared by every user: market data is the same for everyone) ---------- */
let CACHE = { at: 0, day: '', sigs: [], bars: new Map() };
async function scan(c, force) {
  const today = ny().date; if (!force && CACHE.day === today && Date.now() - CACHE.at < 30 * 6e4) return CACHE.sigs;
  const raw = await AL.bars(c, UNIVERSE, new Date(Date.now() - 420 * 864e5).toISOString()), bars = new Map(), sigs = [];
  for (const sym of UNIVERSE) { const b = (raw[sym] || []).map(x => ({ d: String(x.t).slice(0, 10), c: Number(x.c) })).filter(x => x.d < today && x.c > 0); // today's bar is still forming
    bars.set(sym, b); const s = signal(sym, b); if (s) sigs.push(s); }
  CACHE = { at: Date.now(), day: today, sigs, bars }; return sigs;
}

/* ---------- per user ---------- */
async function open(uid) {
  await db.q("INSERT INTO sbot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM sbot WHERE uid=$1', [uid]), c = J(row.cfg, {});
  return { row, cfg: { pct: c.pct > 0 ? c.pct : DEF.pct, max: c.max > 0 ? Math.round(c.max) : DEF.max } };
}
const rec = (uid, sym, extra) => db.q('INSERT INTO swingtrades (id, uid, ts, sym, why, notional, qty, entry, stop, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
  [crypto.randomBytes(8).toString('hex'), uid, Date.now(), sym, extra.why, extra.notional, extra.qty, extra.entry, extra.stop, 'open']);
const wait = async (c, o) => { let f = o; for (let i = 0; i < 8 && f.status !== 'filled'; i++) { await new Promise(z => setTimeout(z, 500)); f = await AL.order(c, o.id).catch(() => f); } return f; };

const SELLING = new Map();
async function sellOwn(uid, c, t, why) { // sell only what this bot bought
  if (Date.now() - (SELLING.get(t.id) || 0) < 6e4) return; SELLING.set(t.id, Date.now());
  const pos = (await AL.positions(c)).find?.(x => x.symbol === t.sym);
  if (!pos) { await db.q("UPDATE swingtrades SET status='closed', reason='closed outside the bot', exitts=$2 WHERE id=$1 AND status='open'", [t.id, Date.now()]); SELLING.delete(t.id); return; }
  const qty = Math.min(Number(t.qty), Number(pos.qty)), f = await wait(c, await AL.sell(c, t.sym, qty));
  if (f.status !== 'filled') return; // still working: the lock above stops a second sell for a minute
  const px = Number(f.filled_avg_price) || Number(pos.current_price), pnl = t.entry ? (px - t.entry) * qty : null;
  await db.q("UPDATE swingtrades SET status='closed', exitp=$2, pnl=$3, reason=$4, exitts=$5 WHERE id=$1 AND status='open'", [t.id, px, pnl, why, Date.now()]); SELLING.delete(t.id);
}
const heldDays = (t, bars) => Math.max(0, (bars || []).filter(b => b.d >= nyDay(Number(t.ts))).length - 1); // completed trading days since the entry day

// the once-a-day decision: exits first, then new entries
async function runDay(uid, c, cfg) {
  const sigs = await scan(c), by = new Map(sigs.map(s => [s.sym, s])), out = { sold: 0, bought: 0 };
  const acct = await AL.account(c), eq = Number(acct.equity); let cash = Number(acct.cash);
  for (const t of await db.q("SELECT * FROM swingtrades WHERE uid=$1 AND status='open'", [uid])) {
    const s = by.get(t.sym), days = heldDays(t, CACHE.bars.get(t.sym));
    const why = s && s.out ? `closed above its ${R.exitMA}-day average` : days >= R.maxDays ? `held ${R.maxDays} trading days` : null;
    if (why) { await sellOwn(uid, c, t, why).catch(e => console.error('swing sell', t.sym, e.message)); out.sold++; }
  }
  const lastEq = Number(acct.last_equity); if (lastEq > 0 && (eq - lastEq) / lastEq <= -R.dailyStop) return { ...out, note: 'daily loss limit reached: no new buys today' };
  let openN = (await db.one("SELECT count(*)::int AS n FROM swingtrades WHERE uid=$1 AND status='open'", [uid])).n;
  const held = new Set((await AL.positions(c).catch(() => [])).map?.(x => x.symbol) || []);
  for (const s of sigs.filter(x => x.buy).sort((a, b) => a.r2 - b.r2)) {
    if (openN >= cfg.max) break; if (held.has(s.sym)) continue; // never touch shares you already own
    const notional = Math.min(eq * cfg.pct / 100, cash * .95); if (notional < 1) break;
    try {
      const a = await AL.asset(c, s.sym); if (!a.tradable) continue; let o, px = s.c;
      if (a.fractionable) o = await AL.buy(c, s.sym, notional);
      else { px = await AL.last(c, s.sym) || s.c; const q = Math.max(1, Math.floor(notional / px)); if (q * px > cash * .95) continue; o = await AL.buyQty(c, s.sym, q); }
      const f = await wait(c, o), entry = Number(f.filled_avg_price) || px, qty = Number(f.filled_qty) || notional / entry;
      if (f.status !== 'filled' && !(qty > 0)) continue;
      await rec(uid, s.sym, { why: `closed ${s.c.toFixed(2)} above its 200-day average ${s.s200.toFixed(2)} but 2-day RSI only ${s.r2.toFixed(1)}`, notional: qty * entry, qty, entry, stop: entry * (1 - R.stop) });
      openN++; out.bought++; cash -= qty * entry; held.add(s.sym);
    } catch (e) { console.error('swing buy', s.sym, e.message); }
  }
  return out;
}

// every 20s: the -8% stop and positions closed outside the bot
async function manage() {
  const open = await db.q("SELECT * FROM swingtrades WHERE status='open' ORDER BY uid"), byU = new Map(); open.forEach(t => (byU.get(t.uid) || byU.set(t.uid, []).get(t.uid)).push(t));
  for (const [uid, ts] of byU) {
    const c = await AL.getCreds(uid).catch(() => null); if (!c) continue; const pos = await AL.positions(c).catch(() => null); if (!Array.isArray(pos)) continue;
    for (const t of ts) { const p = pos.find(x => x.symbol === t.sym);
      if (!p) { await db.q("UPDATE swingtrades SET status='closed', reason='closed outside the bot', exitts=$2 WHERE id=$1 AND status='open'", [t.id, Date.now()]); continue; }
      if (t.stop && Number(p.current_price) <= Number(t.stop)) await sellOwn(uid, c, t, `stop loss -${R.stop * 100}%`).catch(e => console.error('swing stop', t.sym, e.message)); }
  }
}

let busy = false, nextRun = 0, lastManage = 0, lastPub = 0; const RUNNING = new Set(), RETRY = new Map();
async function tick() { // runner: cheap, checks every 15s
  if (busy || Date.now() < nextRun) return; busy = true; nextRun = Date.now() + 15e3;
  try {
    const users = await db.q("SELECT s.* FROM sbot s JOIN users u ON u.id=s.uid WHERE s.enabled=true AND u.verified=true AND u.alpaca IS NOT NULL");
    if (users.length && Date.now() - lastManage > 20e3) { lastManage = Date.now(); await manage(); }
    const now = ny(); let clk = null;
    for (const r of users) {
      if (r.lastday === now.date || RUNNING.has(r.uid) || Date.now() < (RETRY.get(r.uid) || 0)) continue;
      const c = await AL.getCreds(r.uid).catch(() => null); if (!c) continue; clk = await AL.clock(c).catch(() => null);
      if (!clk?.is_open || now.min < 9 * 60 + 30 + R.after || Date.parse(clk.next_close) - Date.now() < R.beforeClose) continue; // 10 min after the open, not near the close
      const claim = await db.q('UPDATE sbot SET lastday=$2 WHERE uid=$1 AND (lastday IS NULL OR lastday<>$2) RETURNING uid', [r.uid, now.date]); if (!claim.length) continue; // one run per day, even with two runners
      RUNNING.add(r.uid);
      try { const { cfg } = await open(r.uid); const res = await runDay(r.uid, c, cfg); console.log(new Date().toISOString(), 'swing', r.uid.slice(0, 6), JSON.stringify(res)); }
      catch (e) { console.error('swing run', e.message); await db.q('UPDATE sbot SET lastday=NULL WHERE uid=$1 AND lastday=$2', [r.uid, now.date]); RETRY.set(r.uid, Date.now() + 5 * 6e4); } // nothing was decided: try again in 5 minutes
      finally { RUNNING.delete(r.uid); }
    }
    if (Date.now() - lastPub > 30 * 6e4 || (users.length && !CACHE.sigs.length && Date.now() - lastPub > 6e4)) { // keep the watchlist fresh for the tab
      const who = await db.q("SELECT id FROM users WHERE alpaca IS NOT NULL AND verified=true ORDER BY admin DESC LIMIT 1"), c = who[0] ? await AL.getCreds(who[0].id).catch(() => null) : null;
      if (c) { lastPub = Date.now(); await scan(c, true).catch(e => console.error('swing bars', e.message)); await publish(); } }
  } finally { busy = false; }
}
async function publish() {
  const up = CACHE.sigs.filter(s => s.up).sort((a, b) => a.r2 - b.r2);
  await S.set('swinglive', JSON.stringify({ t: Date.now(), asof: CACHE.sigs[0]?.asof || null, n: CACHE.sigs.length, uptrend: up.length, buys: up.filter(s => s.buy).length,
    watch: up.slice(0, 12).map(s => ({ sym: s.sym, c: s.c, r2: Math.round(s.r2 * 10) / 10, buy: s.buy, out: s.out })) }));
}
async function stats(uid) {
  const st = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<=0 THEN 1 ELSE 0 END)::int AS l FROM swingtrades WHERE uid=$1 AND status='closed' AND pnl IS NOT NULL", [uid]);
  return { n: st.n, pnl: Number(st.pnl), won: st.w || 0, lost: st.l || 0 };
}
module.exports = { DEF, R, UNIVERSE, signal, smaLast, rsiLast, scan, runDay, manage, tick, open, stats, publish, heldDays };
