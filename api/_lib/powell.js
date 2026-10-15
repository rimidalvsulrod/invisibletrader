// Powell 10 AM strategy: NQ / ES futures, 5-minute candles, America/New_York.
// Opening range = the six 5-minute candles 9:30-9:55. The 10:00 candle is the signal candle:
//   LONG  = it wicks BELOW a level (the opening-range low, else the latest prior swing low) and closes back ABOVE it.
//   SHORT = it wicks ABOVE a level (the opening-range high, else the latest prior swing high) and closes back BELOW it.
// Entry = that candle's close. Stop = 1 tick beyond the sweep wick. Target = 2R. One signal per day at most.
// Data: Yahoo Finance's free chart endpoint (NQ=F, ES=F, 5m, extended hours). Shared by the chart tab, the backtest and the bot.
const crypto = require('crypto'), Y = require('./yahoo'), db = require('./db'), AL = require('./alpaca'), PBK = require('./paperbroker');
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; MimicPowell/1.0)', accept: 'application/json' };
const SYMS = { NQ: 'NQ=F', ES: 'ES=F', MNQ: 'MNQ=F', MES: 'MES=F' }, TICK = .25, MIN_R = .0002, MAX_R = .008, OPEN_M = 480, SIG_M = 600, LAST_M = 955;
const etp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const et = ts => { const p = etp.formatToParts(new Date(ts * 1000)), g = k => p.find(x => x.type === k).value; return { date: `${g('year')}-${g('month')}-${g('day')}`, m: (+g('hour') % 24) * 60 + +g('minute') }; };

/* ---------- data ---------- */
const CACHE = new Map();
async function candles(sym, ttl = 15e3) { // -> { days: Map(date -> [{m,o,h,l,c}]), t, delay }
  const s = SYMS[sym]; if (!s) throw Object.assign(new Error('Pick NQ, ES, MNQ or MES'), { status: 400 });
  const hit = CACHE.get(sym); if (hit && Date.now() - hit.at < ttl) return hit.v;
  const j = await Y.get(`/v8/finance/chart/${encodeURIComponent(s)}?range=60d&interval=5m&includePrePost=true`, 45e3);
  const res = j?.chart?.result?.[0]; if (!res?.timestamp) throw new Error('Yahoo Finance returned no candles'); const q = res.indicators.quote[0], days = new Map();
  res.timestamp.forEach((ts, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].some(x => x == null)) return;
    const e = et(ts); if (e.m < OPEN_M || e.m >= 960) return; (days.get(e.date) || days.set(e.date, []).get(e.date)).push({ m: e.m, o, h, l, c }); }); // 8:00 to 16:00 ET
  for (const a of days.values()) a.sort((x, y) => x.m - y.m);
  const v = { days, t: Math.max(...res.timestamp) * 1000, delay: res.meta?.exchangeDataDelayedBy || 0, price: res.meta?.regularMarketPrice };
  CACHE.set(sym, { at: Date.now(), v }); return v;
}

/* ---------- the strategy ---------- */
const swing = (pre, hi) => { let out = null; for (let i = 2; i < pre.length - 2; i++) { const x = pre[i], n = [pre[i - 2], pre[i - 1], pre[i + 1], pre[i + 2]];
  if (hi ? n.every(y => x.h > y.h) : n.every(y => x.l < y.l)) out = hi ? x.h : x.l; } return out; }; // the most recent one
function analyzeDay(date, cs) {
  const sig = cs.find(x => x.m === SIG_M), orc = cs.filter(x => x.m >= 570 && x.m < SIG_M), pre = cs.filter(x => x.m < SIG_M);
  if (!sig || orc.length < 5) return { date, levels: null, signal: null };
  const levels = { orl: Math.min(...orc.map(x => x.l)), orh: Math.max(...orc.map(x => x.h)), swl: swing(pre, false), swh: swing(pre, true) };
  const lo = [['Opening range low', levels.orl], ['Prior swing low', levels.swl]].find(([, v]) => v != null && sig.l < v && sig.c > v);
  const hi = [['Opening range high', levels.orh], ['Prior swing high', levels.swh]].find(([, v]) => v != null && sig.h > v && sig.c < v);
  if (!!lo === !!hi) return { date, levels, signal: null, note: lo && hi ? 'swept both sides: no trade' : '' }; // none, or ambiguous
  const long = !!lo, [kind, level] = lo || hi, entry = sig.c, stop = long ? sig.l - TICK : sig.h + TICK, R = Math.abs(entry - stop), tp = long ? entry + 2 * R : entry - 2 * R;
  const sg = { dir: long ? 'long' : 'short', m: SIG_M, kind, level, entry, stop, tp, R, rpct: R / entry };
  if (!(sg.rpct >= MIN_R && sg.rpct <= MAX_R)) sg.skip = sg.rpct < MIN_R ? 'stop too tight' : 'stop too wide';
  // walk forward: stop first if one candle touches both (conservative); everything is closed at 15:55
  const after = cs.filter(x => x.m > SIG_M && x.m <= LAST_M); sg.outcome = 'open'; sg.exitM = null; sg.exit = null; sg.r = null;
  for (const x of after) { const hs = long ? x.l <= stop : x.h >= stop, ht = long ? x.h >= tp : x.l <= tp;
    if (hs) { sg.outcome = 'stop'; sg.exitM = x.m; sg.exit = stop; break; } if (ht) { sg.outcome = 'target'; sg.exitM = x.m; sg.exit = tp; break; } }
  if (sg.outcome === 'open' && after.length && after[after.length - 1].m >= LAST_M) { const x = after[after.length - 1]; sg.outcome = 'time'; sg.exitM = x.m; sg.exit = x.c; }
  if (sg.exit != null) sg.r = (long ? sg.exit - entry : entry - sg.exit) / R;
  else if (after.length) sg.last = after[after.length - 1].c;
  return { date, levels, signal: sg };
}
const analyze = days => [...days.keys()].sort().map(d => analyzeDay(d, days.get(d)));
function summary(rows) { // backtest across every day that had a tradable signal
  const s = rows.filter(r => r.signal && !r.signal.skip && r.signal.r != null), n = s.length, rs = s.map(r => r.signal.r), tot = rs.reduce((a, b) => a + b, 0);
  const cnt = k => s.filter(r => r.signal.outcome === k).length; let peak = 0, run = 0, dd = 0; for (const r of rs) { run += r; peak = Math.max(peak, run); dd = Math.min(dd, run - peak); }
  return { days: rows.filter(r => r.levels).length, signals: rows.filter(r => r.signal && !r.signal.skip).length, closed: n, longs: s.filter(r => r.signal.dir === 'long').length, shorts: s.filter(r => r.signal.dir === 'short').length,
    target: cnt('target'), stop: cnt('stop'), time: cnt('time'), won: rs.filter(x => x > 0).length, avgR: n ? tot / n : 0, totalR: tot, maxDD: dd };
}

/* ---------- the bot: one trade a day through the user's Alpaca account ----------
   Alpaca does not offer futures, so the signal comes from NQ / ES and the trade is placed in the matching ETF (NQ -> QQQ,
   ES -> SPY) with the SAME percentage stop and 2R target, as a bracket order (entry + stop + target). Anything still open
   at 15:55 ET is closed. Whole shares only (brackets cannot be fractional). It never trades an ETF the account already holds. */
const ETF = { NQ: 'QQQ', MNQ: 'QQQ', ES: 'SPY', MES: 'SPY' }, DEF = { sym: 'NQ', risk: .5, max: 25, inst: 'futures' }, WINDOW = [606, 630], FLAT_M = 955; // act 10:06-10:30 ET, flatten 15:55
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
async function open(uid) {
  await db.q("INSERT INTO pbot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM pbot WHERE uid=$1', [uid]), c = J(row.cfg, {});
  return { row, cfg: { sym: ETF[c.sym] ? c.sym : DEF.sym, risk: c.risk > 0 ? c.risk : DEF.risk, max: c.max > 0 ? c.max : DEF.max, inst: c.inst === 'etf' ? 'etf' : 'futures' } };
}
const rec = (uid, x) => db.q('INSERT INTO powelltrades (id, uid, ts, day, fut, etf, dir, kind, rpct, qty, entry, stop, tp, orderid, status, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
  [crypto.randomBytes(8).toString('hex'), uid, Date.now(), x.day, x.fut, x.etf, x.dir, x.kind, x.rpct, x.qty || null, x.entry || null, x.stop || null, x.tp || null, x.orderid || null, x.status || 'open', x.reason || null]);
const wait = async (c, o) => { let f = o; for (let i = 0; i < 8 && f.status !== 'filled'; i++) { await new Promise(z => setTimeout(z, 500)); f = await AL.order(c, o.id).catch(() => f); } return f; };
const cents = x => Math.round(x * 100) / 100;

// NQ / ES futures in the built-in paper account: real contract sizes ($20 / $50 a point, micros $2 / $5), the signal's own stop and 2R target.
// The paper account rides on the real broker's balance, so position size follows it.
async function futuresTrade(uid, c, cfg, sg, base) {
  const long = sg.dir === 'long', F = PBK.FUT, skip = async why => (await rec(uid, { ...base, status: 'skip', reason: why }), { skipped: why });
  const acct = await AL.account(c), eq = Number(acct.equity), lastEq = Number(acct.last_equity); if (!(eq > 0)) return skip('no account balance'); if (lastEq > 0 && (eq - lastEq) / lastEq <= -.03) return skip('daily loss limit (3%) reached');
  const root = cfg.sym, micro = F[root].micro, risk = eq * cfg.risk / 100; let sym = root, qty = Math.min(10, Math.floor(risk / (sg.R * F[root].mult)));
  if (qty < 1) { sym = micro; qty = Math.min(50, Math.floor(risk / (sg.R * F[micro].mult))); } if (!(qty >= 1)) return skip('risk too small for one micro contract');
  if ((await AL.positions(c)).find(p => [root, micro].includes(p.symbol))) return skip(`already in ${root}`);
  const px = await AL.last(c, sym); if (!(px > 0) || Math.abs(px - sg.entry) > .5 * sg.R) return skip('price ran away from the signal');
  const snap = x => Math.round(x / .25) * .25; let o; try { o = await AL.bracket(c, { symbol: sym, qty, side: long ? 'buy' : 'sell', tp: snap(sg.tp), sl: snap(sg.stop) }); } catch (e) { return skip('the paper account refused the order: ' + String(e.message).slice(0, 100)); }
  const entry = Number(o.filled_avg_price) || px; await rec(uid, { ...base, etf: sym, qty, entry, stop: sg.stop, tp: sg.tp, orderid: o.id }); return { traded: `${sg.dir} ${qty} ${sym} @ ${entry} (built-in paper)` };
}
// the decision for one user (called once the 10:00 candle has closed); returns what happened
async function decide(uid, c, cfg, day) {
  const d = await candles(cfg.sym, 5e3), cs = d.days.get(day.date); if (!cs) return { wait: 'no candles yet' };
  const g = analyzeDay(day.date, cs); if (!g.levels) return { wait: 'waiting for the 10:00 candle' };
  const sg = g.signal; if (!sg) return { none: g.note || 'no sweep today' };
  const base = { day: day.date, fut: cfg.sym, etf: ETF[cfg.sym], dir: sg.dir, kind: sg.kind, rpct: sg.rpct };
  if (sg.skip) return await rec(uid, { ...base, status: 'skip', reason: sg.skip }), { skipped: sg.skip };
  if (cfg.inst !== 'etf') return futuresTrade(uid, c, cfg, sg, base); // the real contracts, in the built-in paper account
  const long = sg.dir === 'long', etf = base.etf, acct = await AL.account(c), eq = Number(acct.equity), cash = Number(acct.cash), lastEq = Number(acct.last_equity);
  const skip = async why => (await rec(uid, { ...base, status: 'skip', reason: why }), { skipped: why });
  if (lastEq > 0 && (eq - lastEq) / lastEq <= -.03) return skip('daily loss limit (3%) reached');
  if ((await AL.positions(c).catch(() => [])).find?.(p => p.symbol === etf)) return skip(`the account already holds ${etf}`);
  const a = await AL.asset(c, etf).catch(() => null); if (!a?.tradable || (!long && !a.shortable)) return skip(`${etf} cannot be ${long ? 'bought' : 'sold short'} on this account`);
  const px = await AL.last(c, etf); if (!(px > 0)) return skip('no price for ' + etf);
  const stop = cents(long ? px * (1 - sg.rpct) : px * (1 + sg.rpct)), tp = cents(long ? px * (1 + 2 * sg.rpct) : px * (1 - 2 * sg.rpct)), perShare = Math.abs(px - stop);
  let qty = Math.floor(Math.min(eq * cfg.risk / 100 / perShare, eq * cfg.max / 100 / px)); if (long) qty = Math.min(qty, Math.floor(cash * .95 / px));
  if (!(qty >= 1) || !(perShare >= .05)) return skip(qty >= 1 ? 'stop too tight for this ETF' : 'not enough cash for one share at this risk');
  let o; try { o = await AL.bracket(c, { symbol: etf, qty, side: long ? 'buy' : 'sell', tp, sl: stop }); } catch (e) { return skip('the broker refused the order: ' + String(e.message).slice(0, 110)); } // recorded, and the day is used (no retry loop)
  const f = await wait(c, o).catch(() => o), entry = Number(f.filled_avg_price) || px;
  await rec(uid, { ...base, qty, entry, stop, tp, orderid: o.id }); return { traded: `${sg.dir} ${qty} ${etf} @ ${entry}` };
}

// every 15s: bracket legs that filled, unfilled orders, and the 15:55 flatten
async function manage() {
  const open = await db.q("SELECT * FROM powelltrades WHERE status='open' ORDER BY uid"), byU = new Map(); open.forEach(t => (byU.get(t.uid) || byU.set(t.uid, []).get(t.uid)).push(t));
  const now = et(Date.now() / 1000);
  for (const [uid, ts] of byU) {
    const c = await AL.getCreds(uid).catch(() => null); if (!c) continue;
    for (const t of ts) { try {
      const o = await AL.orderNested(c, t.orderid), long = t.dir === 'long', sign = long ? 1 : -1;
      const done = (px, why) => db.q("UPDATE powelltrades SET status='closed', exitp=$2, pnl=$3, reason=$4, exitts=$5 WHERE id=$1 AND status='open'", [t.id, px, t.entry && px ? (px - t.entry) * t.qty * sign * PBK.mult(t.etf) - 2 * (PBK.FUT[t.etf]?.fee || 0) * t.qty : null, why, Date.now()]);
      if (['canceled', 'rejected', 'expired'].includes(o.status) && !Number(o.filled_qty)) { await done(null, 'order was not filled'); continue; }
      if (!t.entry && Number(o.filled_avg_price)) { t.entry = Number(o.filled_avg_price); await db.q('UPDATE powelltrades SET entry=$2 WHERE id=$1', [t.id, t.entry]); }
      const hit = (o.legs || []).find(l => l.status === 'filled'); if (hit) { await done(Number(hit.filled_avg_price), hit.type === 'stop' || hit.type === 'stop_limit' ? 'stop' : 'target'); continue; }
      if (now.m >= FLAT_M && o.status === 'filled') { // 15:55: cancel the legs, then close only the bot's shares
        for (const l of o.legs || []) if (!['filled', 'canceled', 'expired', 'rejected'].includes(l.status)) await AL.cancel(c, l.id).catch(() => {});
        const pos = (await AL.positions(c)).find?.(p => p.symbol === t.etf); if (!pos) { await done(null, 'closed outside the bot'); continue; }
        const q = Math.min(Number(t.qty), Math.abs(Number(pos.qty))), f = await wait(c, long ? await AL.sell(c, t.etf, q) : await AL.buyQty(c, t.etf, q));
        if (f.status === 'filled') await done(Number(f.filled_avg_price), 'time exit 15:55'); } } catch (e) { console.error('powell manage', t.etf, e.message); } }
  }
}

let busy = false, nextRun = 0, lastManage = 0; const RUNNING = new Set(), RETRY = new Map();
async function tick() { // runner: cheap, every 10s
  if (busy || Date.now() < nextRun) return; busy = true; nextRun = Date.now() + 10e3;
  try {
    const now = et(Date.now() / 1000), users = await db.q("SELECT p.* FROM pbot p JOIN users u ON u.id=p.uid WHERE p.enabled=true AND u.verified=true AND u.alpaca IS NOT NULL");
    if (users.length && Date.now() - lastManage > 15e3) { lastManage = Date.now(); await manage(); }
    if (now.m < WINDOW[0] || now.m > WINDOW[1]) return;
    for (const r of users) {
      if (r.lastday === now.date || RUNNING.has(r.uid) || Date.now() < (RETRY.get(r.uid) || 0)) continue;
      const c = await AL.getCreds(r.uid).catch(() => null); if (!c) continue; const clk = await AL.clock(c).catch(() => null); if (!clk?.is_open) continue;
      const claim = await db.q('UPDATE pbot SET lastday=$2 WHERE uid=$1 AND (lastday IS NULL OR lastday<>$2) RETURNING uid', [r.uid, now.date]); if (!claim.length) continue; // one trade a day, even with two runners
      RUNNING.add(r.uid);
      try { const { cfg } = await open(r.uid), res = await decide(r.uid, c, cfg, now);
        if (res.wait) await db.q('UPDATE pbot SET lastday=NULL WHERE uid=$1 AND lastday=$2', [r.uid, now.date]); // candle not ready: look again in 10s
        else console.log(new Date().toISOString(), 'powell', r.uid.slice(0, 6), JSON.stringify(res)); }
      catch (e) { console.error('powell run', e.message); await db.q('UPDATE pbot SET lastday=NULL WHERE uid=$1 AND lastday=$2', [r.uid, now.date]); RETRY.set(r.uid, Date.now() + 60e3); }
      finally { RUNNING.delete(r.uid); }
    }
  } finally { busy = false; }
}
async function stats(uid) {
  const st = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<=0 THEN 1 ELSE 0 END)::int AS l FROM powelltrades WHERE uid=$1 AND status='closed' AND pnl IS NOT NULL", [uid]);
  return { n: st.n, pnl: Number(st.pnl), won: st.w || 0, lost: st.l || 0 };
}
module.exports = { SYMS, TICK, MIN_R, MAX_R, SIG_M, LAST_M, ETF, DEF, et, candles, analyzeDay, analyze, summary, decide, manage, tick, open, stats };
