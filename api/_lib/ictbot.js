// Sweep Bot: runs the ICT rules in ict.js on live 5-minute NQ / ES candles and paper-trades the setups in the built-in paper account (futures, micros when the
// stop is wide for your risk). The rules decide when an order is armed; the bot enters when price pulls back to the armed entry, with the rules' stop and target.
const crypto = require('crypto'), db = require('./db'), AL = require('./alpaca'), PBK = require('./paperbroker'), P = require('./powell'), E = require('./ict');
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; MimicSweep/1.0)', accept: 'application/json' }, BAR = 3e5, SYMS = { NQ: 'NQ=F', ES: 'ES=F' }, TICK = .25;
const DEF = { sym: 'NQ', risk: .5, rr: 2, max: 2, model: 'sweep', pd: true, int: true };
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const engCfg = c => ({ sym: c.sym, rr: c.rr, max: c.max, mode: c.model === 'bullet' ? 'bullet' : 'sweep', pd: !!c.pd, int: !!c.int });
const norm = c => ({ sym: c.sym === 'ES' ? 'ES' : 'NQ', risk: c.risk > 0 ? c.risk : DEF.risk, rr: c.rr > 0 ? c.rr : DEF.rr, max: c.max >= 1 ? Math.round(c.max) : DEF.max, model: c.model === 'bullet' ? 'bullet' : 'sweep', pd: c.pd === false ? false : true, int: c.int === false ? false : true });

/* ---------- candles (free Yahoo Finance, 5 minutes, all hours) ---------- */
const CACHE = new Map();
async function bars(sym, range = '10d', ttl = 10e3) {
  if (!SYMS[sym]) throw Object.assign(new Error('Pick NQ or ES'), { status: 400 }); const key = sym + range, hit = CACHE.get(key); if (hit && Date.now() - hit.at < ttl) return hit.v;
  let j; for (let i = 0; i < 3; i++) { const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMS[sym])}?range=${range}&interval=5m&includePrePost=true`, { headers: UA, signal: AbortSignal.timeout(25e3) });
    if (r.ok) { j = await r.json(); break; } if (i === 2 || (r.status < 500 && r.status !== 429)) throw new Error(`Yahoo Finance: ${r.status}`); await new Promise(z => setTimeout(z, 600 * (i + 1))); }
  const res = j?.chart?.result?.[0]; if (!res?.timestamp) throw new Error('Yahoo Finance returned no candles'); const q = res.indicators.quote[0], out = [];
  res.timestamp.forEach((ts, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].some(x => x == null)) return; const e = P.et(ts); out.push({ t: ts * 1000, date: e.date, m: e.m, o, h, l, c }); });
  CACHE.set(key, { at: Date.now(), v: out }); if (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value); return out;
}

/* ---------- the rules, applied to now ---------- */
function analyze(b, cfg, now = Date.now()) { // today's (or the latest) session through the rules, using only candles that have closed (20s settle time)
  const ses = E.sessions(b, true), k = ses.length - 1; if (k < 0) return null; const firstOpen = b.findIndex(x => x.t + BAR + 2e4 > now), upto = firstOpen < 0 ? b.length : firstOpen;
  return { ses, k, upto, part: firstOpen >= 0 ? b[firstOpen] : null, ev: E.runDay(b, ses, k, engCfg(cfg), E.atrSeries(b), upto) };
}
function describe(A, cfg, now = Date.now()) { // one line for the tab: what the rules are doing right now
  if (!A) return { phase: 'none', text: 'No session data yet.' }; const e = P.et(now / 1000), S = A.ses[A.k], p = A.ev.pending, side = d => d === 1 ? 'buy' : 'sell', f = x => Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (S.date !== e.date) return { phase: 'closed', text: `Market closed. ${A.ev.trades.length ? `Last session (${S.date}): ${A.ev.trades.length} trade${A.ev.trades.length > 1 ? 's' : ''} by the rules.` : `Last session (${S.date}): no setup.`}` };
  if (p.pos) return { phase: 'in', text: `In a ${p.pos.dir === 1 ? 'long' : 'short'} from ${f(p.pos.entry)}: stop ${f(p.pos.stop)}, target ${f(p.pos.target)}.` };
  if (p.order) return { phase: 'armed', text: `Armed: ${side(p.order.dir)} limit at ${f(p.order.entry)} (middle of the gap), stop ${f(p.order.stop)}, target ${f(p.order.target)}. Waits for price to pull back to it.` };
  if (e.m < E.KZ[0]) return { phase: 'wait', text: `Waiting for the New York killzone (9:30 to 12:00 ET). ${A.ev.levels.length} unspent liquidity level${A.ev.levels.length === 1 ? '' : 's'} on the board.` };
  if (e.m >= E.KZ[1]) return { phase: 'done', text: `Killzone is over. ${A.ev.trades.length ? `${A.ev.trades.length} trade${A.ev.trades.length > 1 ? 's' : ''} today.` : 'No setup today.'}` };
  if (p.cand) return { phase: 'sweep', text: `${p.cand.level} was swept at ${f(p.cand.ext)}. Waiting for the shift: a strong candle with a gap that closes back through the move.` };
  return { phase: 'watch', text: `Watching ${p.live.length} unspent liquidity level${p.live.length === 1 ? '' : 's'} for a sweep.` };
}

/* ---------- chart + backtest for the tab ---------- */
const CD = new Map();
async function chartData(sym, cfg) { // cached for 15s per setting (the backtest part is the heavy bit)
  const key = JSON.stringify([sym, cfg]), hit = CD.get(key); if (hit && Date.now() - hit.at < 15e3) return hit.v; const v = await chartBuild(sym, cfg); CD.set(key, { at: Date.now(), v }); if (CD.size > 12) CD.delete(CD.keys().next().value); return v;
}
async function chartBuild(sym, cfg) {
  const all = await bars(sym, '60d', 3e5), A = analyze(all, { ...cfg, sym }), days = [...new Set(all.filter(x => x.m >= 570 && x.m < 960).map(x => x.date))].slice(-2);
  const keep = all.filter(x => days.includes(x.date) && x.m >= 480 && x.m < 960), t = i => all[i].t, ev = A?.ev, p = ev?.pending;
  const bt = E.backtest(all, { ...engCfg(cfg), sym });
  return { sym, t: all[all.length - 1]?.t, last: all[all.length - 1]?.c, bars: keep.map(x => [x.t, x.o, x.h, x.l, x.c]), day: A?.ses[A.k].date, status: describe(A, cfg),
    levels: (ev?.levels || []).map(L => ({ name: L.name, side: L.side, p: L.p })), eq: Number.isFinite(ev?.eq) ? ev.eq : null,
    events: (ev?.events || []).map(e => ({ t: t(e.i), type: e.type, dir: e.dir, p: e.p ?? null, why: e.why || null, level: e.level || null })),
    order: p?.order ? { dir: p.order.dir, entry: p.order.entry, stop: p.order.stop, target: p.order.target, lo: p.order.zoneLo, hi: p.order.zoneHi, t: t(p.order.mi) } : null,
    pos: p?.pos ? { dir: p.pos.dir, entry: p.pos.entry, stop: p.pos.stop, target: p.pos.target, t: t(p.pos.fi) } : null,
    backtest: { n: bt.n, win: bt.win, avgR: bt.avgR, totalR: bt.totalR, net: bt.net, pf: Number.isFinite(bt.pf) ? bt.pf : null, maxDD: bt.maxDD, avgRisk: bt.avgRisk, long: bt.long, short: bt.short, days: bt.days, from: bt.from, to: bt.to, micro: sym === 'ES' ? 'MES' : 'MNQ',
      trades: bt.trades.slice(-12).reverse().map(x => ({ date: x.date, dir: x.dir, entry: x.entry, exit: x.exit, r: x.r, net: x.net, why: x.why, level: x.level })) } };
}

/* ---------- the bot ---------- */
async function open(uid) {
  await db.q("INSERT INTO ictbot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM ictbot WHERE uid=$1', [uid]); return { row, cfg: norm(J(row.cfg, {})) };
}
const ID = () => crypto.randomBytes(8).toString('hex'), F = PBK.FUT, snap = x => Math.round(x / TICK) * TICK, fee = sym => F[sym]?.fee || 0;
const pnlOf = (t, px) => (px - t.entry) * (t.dir === 'long' ? 1 : -1) * t.qty * PBK.mult(t.sym) - 2 * fee(t.sym) * t.qty;
async function enter(uid, cfg, order, key, day) { // one armed order, one user. The row is claimed first (one per user and order), so two runners never both trade it
  const mine = ID(), dir = order.dir === 1 ? 'long' : 'short'; await db.q("INSERT INTO icttrades (id, uid, key, ts, day, root, dir, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'open') ON CONFLICT (uid, key) DO NOTHING", [mine, uid, key, Date.now(), day, cfg.sym, dir]);
  if ((await db.one('SELECT id FROM icttrades WHERE uid=$1 AND key=$2', [uid, key])).id !== mine) return null;
  const skip = async why => (await db.q("UPDATE icttrades SET status='skip', reason=$2 WHERE id=$1", [mine, why]), { skipped: why });
  try {
    const c = await AL.getCreds(uid).catch(() => null); if (!c) return skip('broker not connected');
    if ((await db.one("SELECT count(*)::int AS n FROM icttrades WHERE uid=$1 AND status='open' AND orderid IS NOT NULL AND id<>$2", [uid, mine])).n) return skip('already in a Sweep Bot trade');
    if ((await db.one("SELECT count(*)::int AS n FROM icttrades WHERE uid=$1 AND day=$2 AND status<>'skip' AND id<>$3", [uid, day, mine])).n >= cfg.max) return skip(`already ${cfg.max} trade${cfg.max == 1 ? '' : 's'} today`);
    const acct = await AL.account(c), eq = Number(acct.equity); if (!(eq > 0)) return skip('no account balance');
    const lost = Number((await db.one("SELECT coalesce(sum(pnl),0) AS p FROM icttrades WHERE uid=$1 AND day=$2 AND status='closed'", [uid, day])).p); if (lost <= -.03 * eq) return skip('daily loss limit (3%) reached');
    const long = order.dir === 1, px = await PBK.price(uid, cfg.sym), R = Math.abs(order.entry - order.stop); if (!(px > 0)) return skip('no futures price');
    if (long ? !(order.stop < px && px < order.target) : !(order.target < px && px < order.stop)) return skip(`price (${px}) is already past the stop or the target`);
    if (Math.abs(px - order.entry) > .5 * R) return skip(`price (${px}) slipped too far from the entry (${order.entry})`);
    const root = cfg.sym, micro = F[root].micro, dist = Math.abs(px - order.stop), risk = eq * cfg.risk / 100; let sym = root, qty = Math.min(10, Math.floor(risk / (dist * F[root].mult))); if (qty < 1) { sym = micro; qty = Math.min(50, Math.floor(risk / (dist * F[micro].mult))); }
    if (!(qty >= 1)) return skip(`stop is ${dist.toFixed(0)} points away: one micro contract risks $${(dist * F[micro].mult).toFixed(0)}, over your $${risk.toFixed(0)} limit`);
    if ((await AL.positions(c)).find(p => [root, micro].includes(p.symbol))) return skip(`already in ${root}`);
    let o; try { o = await AL.bracket(c, { symbol: sym, qty, side: long ? 'buy' : 'sell', tp: snap(order.target), sl: snap(order.stop) }); } catch (e) { return skip('the paper account refused the order: ' + String(e.message).slice(0, 100)); }
    const entry = Number(o.filled_avg_price) || px; await db.q('UPDATE icttrades SET sym=$2, qty=$3, entry=$4, stop=$5, tp=$6, orderid=$7 WHERE id=$1', [mine, sym, qty, entry, snap(order.stop), snap(order.target), o.id]); return { traded: `${dir} ${qty} ${sym} @ ${entry}, stop ${snap(order.stop)}, target ${snap(order.target)}` };
  } catch (e) { await skip('error: ' + String(e.message).slice(0, 100)).catch(() => {}); throw e; }
}
async function step(uid) { // one user, once every 10s: is there an armed order that price has just pulled back to?
  const { cfg } = await open(uid), b = await bars(cfg.sym).catch(() => null); if (!b) return null; const A = analyze(b, cfg), now = P.et(Date.now() / 1000); if (!A || A.ses[A.k].date !== now.date) return null;
  const order = A.ev.pending.order; if (!order) return null; const part = A.part; if (!part || part.m < E.KZ[0] || part.m >= E.KZ[1]) return null;
  if (!(order.dir === 1 ? part.l <= order.entry : part.h >= order.entry)) return null; // not pulled back yet
  const key = `${now.date}:${order.dir}:${b[order.mi].t}`; if (await db.one('SELECT id FROM icttrades WHERE uid=$1 AND key=$2', [uid, key])) return null;
  return enter(uid, cfg, order, key, now.date);
}
async function closeTrade(t, why) { // cancel the legs, close only the bot's contracts at the market
  const c = await AL.getCreds(t.uid).catch(() => null); if (!c) return; const legs = String(t.orderid || '').split('|'), long = t.dir === 'long';
  const done = (px, r) => db.q("UPDATE icttrades SET status='closed', exitp=$2, pnl=$3, reason=$4, exitts=$5 WHERE id=$1 AND status='open'", [t.id, px, px != null ? pnlOf(t, px) : null, r, Date.now()]);
  for (const id of legs.slice(1)) if (id) await AL.cancel(c, id).catch(() => {});
  const pos = (await AL.positions(c)).find(p => p.symbol === t.sym); if (!pos || Math.sign(Number(pos.qty)) !== (long ? 1 : -1)) return done(null, 'closed outside the bot');
  const q = Math.min(Number(t.qty), Math.abs(Number(pos.qty))), f = long ? await AL.sell(c, t.sym, q) : await AL.buyQty(c, t.sym, q); return done(Number(f.filled_avg_price), why);
}
async function manage() { // every 15s: stop / target hit by the paper account, the 15:55 flatten, leftovers from an earlier day
  const open = await db.q("SELECT * FROM icttrades WHERE status='open'"), now = P.et(Date.now() / 1000);
  for (const t of open) { try {
    if (!t.orderid) { if (Date.now() - Number(t.ts) > 2 * 6e4) await db.q("UPDATE icttrades SET status='skip', reason='interrupted before the order' WHERE id=$1 AND status='open' AND orderid IS NULL", [t.id]); continue; }
    const c = await AL.getCreds(t.uid).catch(() => null); if (!c) continue; let o; try { o = await AL.orderNested(c, t.orderid); } catch (e) { if (e.status === 404) { await db.q("UPDATE icttrades SET status='closed', reason='the paper account was reset', exitts=$2 WHERE id=$1 AND status='open'", [t.id, Date.now()]); continue; } throw e; }
    const hit = (o.legs || []).find(l => l.status === 'filled'); if (hit) { const px = Number(hit.filled_avg_price); await db.q("UPDATE icttrades SET status='closed', exitp=$2, pnl=$3, reason=$4, exitts=$5 WHERE id=$1 AND status='open'", [t.id, px, pnlOf(t, px), hit.type === 'stop' ? 'stop' : 'target', Date.now()]); continue; }
    if (now.m >= 955 || t.day !== now.date) await closeTrade(t, t.day !== now.date ? 'left over from an earlier day' : 'flat at 15:55'); } catch (e) { console.error('sweep manage', t.sym, e.message); } }
}
let busy = false, nextRun = 0, lastManage = 0;
async function tick() { // runner: every 10s
  if (busy || Date.now() < nextRun) return; busy = true; nextRun = Date.now() + 10e3;
  try {
    if (Date.now() - lastManage > 15e3) { lastManage = Date.now(); await manage(); }
    const now = P.et(Date.now() / 1000); if (now.m < E.KZ[0] || now.m >= E.KZ[1]) return;
    const users = await db.q("SELECT g.uid FROM ictbot g JOIN users u ON u.id=g.uid WHERE g.enabled=true AND u.verified=true AND u.alpaca IS NOT NULL");
    for (const u of users) { try { const r = await step(u.uid); if (r) console.log(new Date().toISOString(), 'sweep', u.uid.slice(0, 6), JSON.stringify(r)); } catch (e) { console.error('sweep', e.message); } }
  } finally { busy = false; }
}
async function stats(uid) {
  const r = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<=0 THEN 1 ELSE 0 END)::int AS l FROM icttrades WHERE uid=$1 AND status='closed' AND pnl IS NOT NULL", [uid]);
  return { n: r.n, pnl: Number(r.pnl), won: r.w || 0, lost: r.l || 0 };
}
module.exports = { DEF, norm, engCfg, bars, analyze, describe, chartData, open, enter, step, manage, closeTrade, tick, stats, pnlOf };
