// Supertrend copy-trading bot: copies the Supertrend indicator's colour flips on 15-minute NQ / ES candles, in the built-in paper account.
// It decides on a 15-MINUTE TIMER: only when a bar closes (20 seconds after, to let the data settle), never mid-bar.
//   Long when the line flips green, short when it flips red. The line is the trailing stop (the stop moves with it every bar).
//   NY session only (entries 9:30 to 15:30 ET, flat by 15:55), optional chop filter (skip flips when ADX < 20), a daily trade limit,
//   and position size set by the distance to the stop (the line can be 50 to 150 points away on NQ).
const crypto = require('crypto'), db = require('./db'), AL = require('./alpaca'), PBK = require('./paperbroker'), P = require('./powell');
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; MimicSupertrend/1.0)', accept: 'application/json' }, BAR = 15 * 6e4, TICK = .25;
const DEF = { sym: 'NQ', risk: .5, atr: 10, mult: 3, adx: true, max: 3 }, ADX_MIN = 20, J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

/* ---------- 15-minute candles (free Yahoo Finance), all hours, so the indicator warms up on real history ---------- */
const CACHE = new Map();
async function bars(sym, ttl = 10e3) {
  if (!P.SYMS[sym]) throw Object.assign(new Error('Pick NQ or ES'), { status: 400 }); const hit = CACHE.get(sym); if (hit && Date.now() - hit.at < ttl) return hit.v;
  let j; for (let i = 0; i < 3; i++) { const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(P.SYMS[sym])}?range=60d&interval=15m&includePrePost=true`, { headers: UA, signal: AbortSignal.timeout(20e3) });
    if (r.ok) { j = await r.json(); break; } if (i === 2 || (r.status < 500 && r.status !== 429)) throw new Error(`Yahoo Finance: ${r.status}`); await new Promise(z => setTimeout(z, 600 * (i + 1))); }
  const res = j?.chart?.result?.[0]; if (!res?.timestamp) throw new Error('Yahoo Finance returned no candles'); const q = res.indicators.quote[0], out = [];
  res.timestamp.forEach((ts, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].some(x => x == null)) return; const e = P.et(ts); out.push({ t: ts * 1000, date: e.date, m: e.m, o, h, l, c }); });
  CACHE.set(sym, { at: Date.now(), v: out }); return out;
}
const completed = (b, now = Date.now()) => b.filter(x => x.t + BAR + 2e4 <= now); // a bar counts once it has closed (+20s to settle)

/* ---------- the indicator (TradingView's ta.supertrend) and ADX ---------- */
function supertrend(b, n = 10, mult = 3) {
  const N = b.length, st = new Array(N).fill(NaN), d = new Array(N).fill(0), atr = new Array(N).fill(NaN), fu = new Array(N).fill(NaN), fl = new Array(N).fill(NaN);
  if (N <= n) return { st, d, atr }; const tr = b.map((x, i) => { const pc = i ? b[i - 1].c : x.c; return Math.max(x.h - x.l, Math.abs(x.h - pc), Math.abs(x.l - pc)); });
  atr[n - 1] = tr.slice(0, n).reduce((a, c) => a + c, 0) / n; for (let i = n; i < N; i++) atr[i] = (atr[i - 1] * (n - 1) + tr[i]) / n;
  for (let i = n - 1; i < N; i++) { const hl2 = (b[i].h + b[i].l) / 2, up = hl2 + mult * atr[i], lo = hl2 - mult * atr[i];
    if (i === n - 1 || isNaN(fu[i - 1])) { fu[i] = up; fl[i] = lo; d[i] = 1; st[i] = lo; continue; }
    fu[i] = (up < fu[i - 1] || b[i - 1].c > fu[i - 1]) ? up : fu[i - 1]; fl[i] = (lo > fl[i - 1] || b[i - 1].c < fl[i - 1]) ? lo : fl[i - 1];
    d[i] = st[i - 1] === fu[i - 1] ? (b[i].c > fu[i] ? 1 : -1) : (b[i].c < fl[i] ? -1 : 1); st[i] = d[i] === 1 ? fl[i] : fu[i]; }
  return { st, d, atr };
}
function adx(b, n = 14) {
  const N = b.length, out = new Array(N).fill(NaN); if (N < 3 * n) return out; const pdm = new Array(N).fill(0), ndm = new Array(N).fill(0), tr = new Array(N).fill(0);
  for (let i = 1; i < N; i++) { const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l; pdm[i] = up > dn && up > 0 ? up : 0; ndm[i] = dn > up && dn > 0 ? dn : 0; tr[i] = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); }
  const rma = x => { const o = new Array(N).fill(NaN); o[n] = x.slice(1, n + 1).reduce((a, c) => a + c, 0); for (let i = n + 1; i < N; i++) o[i] = o[i - 1] - o[i - 1] / n + x[i]; return o; };
  const a = rma(tr), p = rma(pdm), q = rma(ndm), dx = a.map((_, i) => { const pd = 100 * p[i] / a[i], nd = 100 * q[i] / a[i]; return 100 * Math.abs(pd - nd) / (pd + nd); }), s = 2 * n;
  out[s] = dx.slice(n, s + 1).reduce((x, y) => x + y, 0) / (s - n + 1); for (let i = s + 1; i < N; i++) out[i] = (out[i - 1] * (n - 1) + dx[i]) / n; return out;
}

/* ---------- backtest: the same rules the bot follows, on the last 60 days ---------- */
function backtest(b, o = {}) {
  const n = o.atr || DEF.atr, mult = o.mult || DEF.mult, adxOn = o.adx !== false, maxTr = o.max || DEF.max, micro = o.sym === 'ES' ? 'MES' : 'MNQ', pv = PBK.mult(micro), fee = PBK.FUT[micro].fee || 0;
  const { st, d } = supertrend(b, n, mult), ax = adx(b); let pos = null; const trades = [], cnt = {};
  const close = (px, why, i) => { const pts = (px - pos.e) * pos.s; trades.push({ date: pos.date, dir: pos.s, entry: pos.e, exit: px, stop0: Math.abs(pos.e - pos.stop0), pts, net: pts * pv - 2 * fee, why }); pos = null; };
  for (let i = n + 1; i < b.length - 1; i++) { const x = b[i], nx = b[i + 1];
    if (pos) { const hit = pos.s === 1 ? x.l <= pos.stop : x.h >= pos.stop; if (hit) close(pos.stop - pos.s * TICK, 'stop', i); }
    if (pos && (x.m >= 945 || x.date !== pos.date)) close(x.c - pos.s * TICK, 'flat 15:55', i);
    const flip = d[i] !== d[i - 1];
    if (pos && flip && d[i] !== pos.s) close(nx.o - pos.s * TICK, 'flip', i);
    if (pos) pos.stop = st[i];
    if (!pos && flip && nx.m >= 570 && nx.m < 930 && (!adxOn || ax[i] >= ADX_MIN) && (cnt[x.date] || 0) < maxTr) { const s = d[i]; pos = { s, e: nx.o + s * TICK, stop: st[i], stop0: st[i], date: x.date }; cnt[x.date] = (cnt[x.date] || 0) + 1; } }
  if (pos) close(b[b.length - 1].c, 'end', 0);
  const net = trades.map(t => t.net), pts = trades.map(t => t.pts), sum = a => a.reduce((x, y) => x + y, 0);
  return { trades: trades.length, win: trades.length ? net.filter(x => x > 0).length / trades.length : 0, avgPts: trades.length ? sum(pts) / trades.length : 0, totalPts: sum(pts), totalUsd: sum(net), worst: trades.length ? Math.min(...net) : 0,
    avgStop: trades.length ? sum(trades.map(t => t.stop0)) / trades.length : 0, micro, days: new Set(b.map(x => x.date)).size, from: b[0]?.date, to: b[b.length - 1]?.date };
}

/* ---------- chart data for the tab ---------- */
async function chartData(sym, cfg) {
  const all = await bars(sym), { st, d } = supertrend(all, cfg.atr, cfg.mult), ax = adx(all), days = [...new Set(all.map(x => x.date))].slice(-4); // the most recent sessions
  const keep = all.map((x, i) => ({ x, i })).filter(({ x }) => days.includes(x.date) && x.m >= 480 && x.m < 960);
  return { sym, t: all[all.length - 1]?.t, bars: keep.map(({ x, i }) => [x.t, x.o, x.h, x.l, x.c, isNaN(st[i]) ? null : st[i], d[i], isNaN(ax[i]) ? null : Math.round(ax[i] * 10) / 10]), last: all[all.length - 1]?.c, backtest: backtest(all, { ...cfg, sym }) };
}

/* ---------- the bot ---------- */
async function open(uid) {
  await db.q("INSERT INTO stbot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM stbot WHERE uid=$1', [uid]), c = J(row.cfg, {});
  return { row, cfg: { sym: c.sym === 'ES' ? 'ES' : 'NQ', risk: c.risk > 0 ? c.risk : DEF.risk, atr: c.atr >= 3 ? Math.round(c.atr) : DEF.atr, mult: c.mult > 0 ? c.mult : DEF.mult, adx: c.adx === false ? false : true, max: c.max >= 1 ? Math.round(c.max) : DEF.max } };
}
const rec = (uid, x) => db.q('INSERT INTO sttrades (id, uid, ts, day, root, sym, dir, qty, entry, stop, orderid, status, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
  [crypto.randomBytes(8).toString('hex'), uid, Date.now(), x.day, x.root, x.sym, x.dir, x.qty || null, x.entry || null, x.stop || null, x.orderid || null, x.status || 'open', x.reason || null]);
const snap = x => Math.round(x / TICK) * TICK, fee = sym => PBK.FUT[sym]?.fee || 0;
const pnlOf = (t, px) => (px - t.entry) * (t.dir === 'long' ? 1 : -1) * t.qty * PBK.mult(t.sym) - 2 * fee(t.sym) * t.qty;
async function closeTrade(uid, c, t, why) { // cancel the stop, close only the bot's contracts at the market
  const stopId = String(t.orderid || '').split('|')[2]; if (stopId) await AL.cancel(c, stopId).catch(() => {});
  const pos = (await AL.positions(c)).find(p => p.symbol === t.sym), done = (px, r) => db.q("UPDATE sttrades SET status='closed', exitp=$2, pnl=$3, reason=$4, exitts=$5 WHERE id=$1 AND status='open'", [t.id, px, px != null ? pnlOf(t, px) : null, r, Date.now()]);
  if (!pos) return done(null, 'closed outside the bot'); const q = Math.min(Number(t.qty), Math.abs(Number(pos.qty))), f = t.dir === 'long' ? await AL.sell(c, t.sym, q) : await AL.buyQty(c, t.sym, q); return done(Number(f.filled_avg_price), why);
}
// one finished 15-minute bar for one user: trail the stop, exit on a flip against the position, enter on a flip when the filters allow it
async function onBar(uid, c, cfg, b, i, ind, ax, now) {
  const flip = ind.d[i] !== ind.d[i - 1], dir = ind.d[i] === 1 ? 'long' : 'short', line = ind.st[i], px = b[i].c, day = now.date;
  const open = await db.one("SELECT * FROM sttrades WHERE uid=$1 AND status='open' ORDER BY ts DESC LIMIT 1", [uid]);
  if (open) { if (flip && open.dir !== dir) await closeTrade(uid, c, open, 'Supertrend flipped'); else { const id = String(open.orderid).split('|')[2]; if (id && !isNaN(line)) { await AL.paper.moveStop(c.uid, id, snap(line)); await db.q('UPDATE sttrades SET stop=$2 WHERE id=$1', [open.id, snap(line)]); } return { trailed: snap(line) }; } }
  if (!flip) return { none: 'no flip' };
  const base = { day, root: cfg.sym, dir }, skip = async why => (await rec(uid, { ...base, sym: cfg.sym, status: 'skip', reason: why }), { skipped: why });
  if (now.m < 570 || now.m > 930) return skip('outside the NY session (entries 9:30 to 15:30 ET)');
  if (cfg.adx && !(ax[i] >= ADX_MIN)) return skip(`choppy market (ADX ${isNaN(ax[i]) ? '?' : ax[i].toFixed(0)} is under ${ADX_MIN})`);
  const today = (await db.one("SELECT count(*)::int AS n FROM sttrades WHERE uid=$1 AND day=$2 AND status<>'skip'", [uid, day])).n; if (today >= cfg.max) return skip(`already ${cfg.max} trades today`);
  const acct = await AL.account(c), eq = Number(acct.equity), lastEq = Number(acct.last_equity); if (!(eq > 0)) return skip('no account balance'); if (lastEq > 0 && (eq - lastEq) / lastEq <= -.03) return skip('daily loss limit (3%) reached');
  const F = PBK.FUT, root = cfg.sym, micro = F[root].micro, dist = Math.abs(px - line), risk = eq * cfg.risk / 100; if (!(dist > 0) || dist / px > .02) return skip('stop line too far away');
  let sym = root, qty = Math.min(10, Math.floor(risk / (dist * F[root].mult))); if (qty < 1) { sym = micro; qty = Math.min(50, Math.floor(risk / (dist * F[micro].mult))); }
  if (!(qty >= 1)) return skip(`stop is ${dist.toFixed(0)} points away: one micro contract risks $${(dist * F[micro].mult).toFixed(0)}, over your $${risk.toFixed(0)} limit`);
  if ((await AL.positions(c)).find(p => [root, micro].includes(p.symbol))) return skip(`already in ${root}`);
  let o; try { o = await AL.bracket(c, { symbol: sym, qty, side: dir === 'long' ? 'buy' : 'sell', tp: null, sl: snap(line) }); } catch (e) { return skip('the paper account refused the order: ' + String(e.message).slice(0, 100)); }
  await rec(uid, { ...base, sym, qty, entry: Number(o.filled_avg_price) || px, stop: snap(line), orderid: o.id }); return { traded: `${dir} ${qty} ${sym} @ ${o.filled_avg_price}, stop ${snap(line)}` };
}
// every 15s: stop hit (by the paper account), the 15:55 flatten, and positions left over from an earlier day
async function manage() {
  const open = await db.q("SELECT * FROM sttrades WHERE status='open' ORDER BY uid"), now = P.et(Date.now() / 1000);
  for (const t of open) { try { const c = await AL.getCreds(t.uid).catch(() => null); if (!c) continue;
    const o = await AL.orderNested(c, t.orderid), hit = (o.legs || []).find(l => l.status === 'filled'); if (hit) { const px = Number(hit.filled_avg_price); await db.q("UPDATE sttrades SET status='closed', exitp=$2, pnl=$3, reason='stop (the Supertrend line)', exitts=$4 WHERE id=$1 AND status='open'", [t.id, px, pnlOf(t, px), Date.now()]); continue; }
    if (now.m >= 955 || t.day !== now.date) await closeTrade(t.uid, c, t, t.day !== now.date ? 'left over from an earlier day' : 'flat at 15:55'); } catch (e) { console.error('supertrend manage', t.sym, e.message); } }
}
let busy = false, nextRun = 0, lastManage = 0; const RUNNING = new Set();
async function tick() { // runner: cheap, every 10s; real work only when a 15-minute bar has just closed
  if (busy || Date.now() < nextRun) return; busy = true; nextRun = Date.now() + 10e3;
  try {
    const users = await db.q("SELECT s.* FROM stbot s JOIN users u ON u.id=s.uid WHERE s.enabled=true AND u.verified=true AND u.alpaca IS NOT NULL"); if (!users.length) return;
    if (Date.now() - lastManage > 15e3) { lastManage = Date.now(); await manage(); }
    const now = P.et(Date.now() / 1000); if (now.m < 570 || now.m > 955) return;
    for (const r of users) { if (RUNNING.has(r.uid)) continue; const { cfg } = await open(r.uid), all = await bars(cfg.sym).catch(() => null); if (!all) continue; const done = completed(all), i = done.length - 1; if (i < 40) continue;
      const bar = done[i], age = Date.now() - (bar.t + BAR); if (age > 4 * 6e4 || bar.date !== now.date) continue; // only a bar that just closed, on today's session
      const claim = await db.q('UPDATE stbot SET lastbar=$2 WHERE uid=$1 AND (lastbar IS NULL OR lastbar<$2) RETURNING uid', [r.uid, bar.t]); if (!claim.length) continue; RUNNING.add(r.uid);
      try { const c = await AL.getCreds(r.uid).catch(() => null); if (!c) continue; const ind = supertrend(done, cfg.atr, cfg.mult), ax = adx(done), res = await onBar(r.uid, c, cfg, done, i, ind, ax, now);
        console.log(new Date().toISOString(), 'supertrend', r.uid.slice(0, 6), bar.date, P.et(bar.t / 1000).m, JSON.stringify(res)); }
      catch (e) { console.error('supertrend run', e.message); await db.q('UPDATE stbot SET lastbar=NULL WHERE uid=$1 AND lastbar=$2', [r.uid, bar.t]); } finally { RUNNING.delete(r.uid); } }
  } finally { busy = false; }
}
async function stats(uid) {
  const s = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<=0 THEN 1 ELSE 0 END)::int AS l FROM sttrades WHERE uid=$1 AND status='closed' AND pnl IS NOT NULL", [uid]);
  return { n: s.n, pnl: Number(s.pnl), won: s.w || 0, lost: s.l || 0 };
}
module.exports = { DEF, ADX_MIN, bars, completed, supertrend, adx, backtest, chartData, open, onBar, manage, tick, stats, closeTrade, pnlOf };
