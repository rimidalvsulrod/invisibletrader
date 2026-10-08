// Meme Radar: paper-trades new meme coins (Solana + Base) at the start of a trend. Paper only: no wallet, no real money.
// Discovery: GeckoTerminal new + trending pools every 30s. Prices for open positions: DexScreener, every 8s.
// Entry = an "ignition" pattern on a young, liquid pool: volume accelerating well past its hourly pace, many distinct
// buyers, buys outnumbering sells, price rising but not yet a blow-off, confirmed on two scans in a row, then re-priced
// fresh on a second source. Paper fills are pessimistic on purpose: price impact from the pool's size plus a DEX fee,
// both ways, and a pulled-liquidity exit sells into the crash like a real rug would.
const crypto = require('crypto'), db = require('./db'), S = require('./settings');
const CHAINS = { solana: 'solana', base: 'base' }, UA = { 'user-agent': 'Mozilla/5.0 (mimic)', accept: 'application/json' };
const DEF = { size: 'pct', pct: 5, usd: 25 }, FEE = .01, MAX_OPEN = 6, DAILY_STOP = .15;
const R = { minAge: 15, maxAge: 720, minLiq: 15e3, minFdv: 25e3, maxFdv: 8e6, maxFdvLiq: 60, buy: 6 }; // entry rules
const X = { sl: -.25, liqDrop: .6, trail1: [.3, .8], trail2: [1, .85], stale: [40 * 6e4, .05], hold: 4 * 36e5 }; // exit rules
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const num = x => { x = Number(x); return Number.isFinite(x) ? x : 0; };
const get = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(12e3) }); if (!r.ok) throw new Error(`${r.status} ${new URL(u).host}`); return r.json(); };
// price impact of a swap of $usd in a pool holding $liq (constant product: ~2*usd/liq) plus 0.5% routing slop
const slip = (usd, liq) => Math.min(.9, .005 + 2 * usd / Math.max(liq, 1));

/* ---------- the signal ---------- */
// one pool -> { ok, score, why[], fails[] }
function judge(p, now = Date.now()) {
  const a = p.attributes, tx = a.transactions || {}, vol = a.volume_usd || {}, pc = a.price_change_percentage || {};
  const m5 = tx.m5 || {}, m15 = tx.m15 || {}, h1 = tx.h1 || {};
  const age = (now - Date.parse(a.pool_created_at)) / 6e4, liq = num(a.reserve_in_usd), fdv = num(a.fdv_usd || a.market_cap_usd);
  const t15 = num(m15.buys) + num(m15.sells), ratio15 = t15 ? num(m15.buys) / t15 : 0, t5 = num(m5.buys) + num(m5.sells), ratio5 = t5 ? num(m5.buys) / t5 : 0;
  const accel = num(vol.m15) / Math.max(1, num(vol.h1) / 4), breadth = num(m15.buys) ? num(m15.buyers) / num(m15.buys) : 0, vl = liq ? num(vol.h1) / liq : 99;
  const fails = [], why = []; let score = 0;
  const need = (c, msg) => { if (!c) fails.push(msg); return c; };
  need(age >= R.minAge, `too new (${Math.round(age)}m, waits ${R.minAge}m for snipers to settle)`); need(age <= R.maxAge, `not early (${(age / 60).toFixed(0)}h old)`);
  need(liq >= R.minLiq, `liquidity $${Math.round(liq / 1e3)}k < $${R.minLiq / 1e3}k`); need(fdv >= R.minFdv && fdv <= R.maxFdv, `market cap $${fdv >= 1e6 ? (fdv / 1e6).toFixed(1) + 'M' : Math.round(fdv / 1e3) + 'k'} out of range`);
  need(!fdv || fdv / Math.max(liq, 1) <= R.maxFdvLiq, 'liquidity too thin for its market cap'); need(vl <= 40, 'volume looks wash-traded');
  need(num(m15.buyers) >= 30 && t15 >= 50, 'too few buyers'); need(num(h1.buyers) >= 80, 'too few buyers this hour');
  need(num(pc.m5) >= 0 && num(pc.m15) >= 3, 'no upward move yet'); need(num(pc.m15) <= 60 && num(pc.h1) <= 300 && num(pc.h6) <= 1500, 'already pumped');
  if (accel >= 2.5) { score += 3; why.push(`volume ${accel.toFixed(1)}× its hourly pace`); } else if (accel >= 1.5) { score += 2; why.push(`volume ${accel.toFixed(1)}× its hourly pace`); } else fails.push(`volume only ${accel.toFixed(1)}× its hourly pace`);
  if (ratio15 >= .62) { score += 2; why.push(`${Math.round(ratio15 * 100)}% of trades are buys`); } else if (ratio15 >= .56) { score += 1; why.push(`${Math.round(ratio15 * 100)}% buys`); }
  if (ratio5 >= .52) score += 1; if (breadth >= .75) { score += 1; why.push('many distinct buyers'); }
  if (num(pc.m15) >= 4 && num(pc.m15) <= 50) { score += 2; why.push(`+${num(pc.m15).toFixed(0)}% in 15m`); } if (num(pc.m5) >= .5 && num(pc.m5) <= 25) score += 1;
  if (age <= 180) { score += 1; why.push(`young (${Math.round(age)}m)`); }
  return { ok: !fails.length && score >= R.buy, score, why, fails, age, liq, fdv };
}

/* ---------- discovery ---------- */
const SEEN = new Map(); // pool -> consecutive scans it passed (a signal must hold on two scans in a row)
let radar = [], lastScan = 0, scanErr = '', scanning = false;
async function scan() {
  if (scanning || Date.now() - lastScan < 3e4) return []; scanning = true; lastScan = Date.now();
  try {
    const seen = new Map(), errs = [];
    await Promise.all(Object.entries(CHAINS).flatMap(([chain, net]) => ['new_pools', 'trending_pools'].map(async k => {
      try { for (const p of (await get(`https://api.geckoterminal.com/api/v2/networks/${net}/${k}?page=1`)).data || []) if (!seen.has(p.id)) seen.set(p.id, { chain, p }); } catch (e) { errs.push(`${chain} ${k}: ${e.message}`); }
    })));
    scanErr = errs[0] || '';
    const now = Date.now(), out = [];
    for (const [id, { chain, p }] of seen) {
      const j = judge(p, now), a = p.attributes, tok = (p.relationships?.base_token?.data?.id || '').replace(/^[a-z0-9-]+_/i, '');
      if (!tok) continue; const sym = String(a.name || '').split(' / ')[0].slice(0, 20) || '?';
      out.push({ id, chain, pool: a.address, token: tok, sym, price: num(a.base_token_price_usd), liq: j.liq, fdv: j.fdv, age: Math.round(j.age), score: j.score, ok: j.ok, why: j.why, fails: j.fails.slice(0, 2), nfails: j.fails.length, pc: { m5: num(a.price_change_percentage?.m5), m15: num(a.price_change_percentage?.m15), h1: num(a.price_change_percentage?.h1) } });
    }
    for (const k of [...SEEN.keys()]) if (!seen.has(k)) SEEN.delete(k);
    for (const c of out) c.streak = c.ok ? (SEEN.get(c.id) || 0) + 1 : 0, SEEN.set(c.id, c.streak);
    radar = out.filter(c => c.liq >= 5e3).sort((a, b) => (b.ok - a.ok) || (a.nfails - b.nfails) || b.score - a.score).slice(0, 30); // closest to a signal first
    return out.filter(c => c.streak >= 2);
  } finally { scanning = false; }
}
// fresh price + liquidity from a second source (DexScreener), up to 30 pools per call
async function quotes(pools) { // pools: [{chain, pool}] -> Map(pool -> {price, liq})
  const out = new Map(), by = {}; for (const x of pools) (by[x.chain] ||= new Set()).add(x.pool);
  await Promise.all(Object.entries(by).map(async ([chain, set]) => { const list = [...set];
    for (let i = 0; i < list.length; i += 30) { try {
      const j = await get(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${list.slice(i, i + 30).join(',')}`);
      for (const p of j.pairs || []) if (num(p.priceUsd) > 0) out.set(p.pairAddress.toLowerCase(), { price: num(p.priceUsd), liq: num(p.liquidity?.usd), m5: num(p.priceChange?.m5) });
    } catch (e) { scanErr = e.message; } } }));
  return out;
}

/* ---------- per user ---------- */
async function open(uid) {
  await db.q("INSERT INTO membot (uid, cfg, updated) VALUES ($1, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const row = await db.one('SELECT * FROM membot WHERE uid=$1', [uid]), c = J(row.cfg, {});
  return { row, cfg: { size: c.size === 'usd' ? 'usd' : 'pct', pct: c.pct > 0 ? c.pct : DEF.pct, usd: c.usd > 0 ? c.usd : DEF.usd } };
}
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
async function enter(row, cands) {
  const uid = row.uid, c = J(row.cfg, {}), cfg = { size: c.size === 'usd' ? 'usd' : 'pct', pct: c.pct > 0 ? c.pct : DEF.pct, usd: c.usd > 0 ? c.usd : DEF.usd };
  const open = await db.q("SELECT cost FROM memetrades WHERE uid=$1 AND status='open'", [uid]); if (open.length >= MAX_OPEN) return;
  const day = await db.one("SELECT coalesce(sum(pnl),0) AS p FROM memetrades WHERE uid=$1 AND status<>'open' AND exitts>=$2", [uid, dayStart()]);
  const openCost = open.reduce((n, t) => n + num(t.cost), 0), equity = row.paper + openCost;
  if (num(day.p) <= -DAILY_STOP * equity) return; // down 15% today: done until tomorrow
  const fresh = await quotes(cands.map(x => ({ chain: x.chain, pool: x.pool }))); let n = 0;
  for (const x of cands.sort((a, b) => b.score - a.score)) {
    if (n >= 2 || open.length + n >= MAX_OPEN) break;
    if (await db.one('SELECT id FROM memetrades WHERE uid=$1 AND token=$2 AND ts>$3', [uid, x.token, Date.now() - 24 * 36e5])) continue; // one trade per token per day
    const q = fresh.get(x.pool.toLowerCase()); if (!q || !(q.liq >= R.minLiq)) continue;
    if (Math.abs(q.price / x.price - 1) > .06 || q.m5 < -1) continue; // the two sources must agree, and it can't be turning over right now
    const spend = Math.min(cfg.size === 'usd' ? cfg.usd : equity * cfg.pct / 100, row.paper * .98, q.liq * .01); // never more than 1% of the pool
    if (!(spend >= 1)) continue;
    const fill = q.price * (1 + slip(spend, q.liq)), qty = spend * (1 - FEE) / fill;
    const done = await db.q('UPDATE membot SET paper=paper-$2 WHERE uid=$1 AND paper>=$2 RETURNING paper', [uid, spend]); if (!done.length) continue; row.paper = num(done[0].paper);
    await db.q('INSERT INTO memetrades (id, uid, ts, chain, pool, token, sym, entry, qty, cost, liq, fdv, score, why, status, peak, last, lastts, slipin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
      [crypto.randomBytes(8).toString('hex'), uid, Date.now(), x.chain, x.pool, x.token, x.sym, fill, qty, spend, q.liq, x.fdv, x.score, x.why.join(' · '), 'open', q.price, q.price, Date.now(), fill / q.price - 1]); n++;
  }
}
async function close(t, price, liq, why) { // sell into the pool at the current price, after price impact + fee
  const fill = price * (1 - slip(num(t.qty) * price, liq || num(t.liq))), proceeds = num(t.qty) * fill * (1 - FEE), pnl = proceeds - num(t.cost);
  const done = await db.q("UPDATE memetrades SET status=$2, exitp=$3, proceeds=$4, pnl=$5, reason=$6, exitts=$7 WHERE id=$1 AND status='open' RETURNING id", [t.id, pnl > 0 ? 'won' : 'lost', fill, proceeds, pnl, why, Date.now()]);
  if (done.length) await db.q('UPDATE membot SET paper=paper+$2 WHERE uid=$1', [t.uid, proceeds]);
}
const MISS = new Map();
async function manage() { // every open position, every user: update price/peak, apply exits
  const open = await db.q("SELECT * FROM memetrades WHERE status='open'"); if (!open.length) return;
  const q = await quotes(open.map(t => ({ chain: t.chain, pool: t.pool }))), now = Date.now();
  for (const t of open) {
    const k = q.get(t.pool.toLowerCase());
    if (!k) { const m = (MISS.get(t.id) || 0) + 1; MISS.set(t.id, m); if (m >= 6) await close(t, num(t.last) * .1, num(t.liq) * .05, 'pool vanished (likely rug)'); continue; } MISS.delete(t.id);
    const p = k.price, peak = Math.max(num(t.peak), p), ch = p / num(t.entry) - 1, up = peak / num(t.entry) - 1, held = now - Number(t.ts);
    await db.q('UPDATE memetrades SET last=$2, lastts=$3, peak=$4, lastliq=$5 WHERE id=$1', [t.id, p, now, peak, k.liq]);
    const why = ch <= X.sl ? `stop ${Math.round(X.sl * 100)}%` : k.liq && k.liq < num(t.liq) * X.liqDrop ? 'liquidity pulled' :
      up >= X.trail2[0] && p <= peak * X.trail2[1] ? `trailing stop (peak +${Math.round(up * 100)}%)` : up >= X.trail1[0] && p <= peak * X.trail1[1] ? `trailing stop (peak +${Math.round(up * 100)}%)` :
      held > X.stale[0] && ch < X.stale[1] ? 'no follow-through' : held > X.hold ? 'held 4 hours' : null;
    if (why) await close(t, p, k.liq, why);
  }
}

/* ---------- loop ---------- */
let busy = false, lastManage = 0, lastPub = 0, users = { t: 0, rows: [] };
async function tick() { // runner: every second; scans every 30s, manages positions every 8s
  if (busy) return; busy = true;
  try {
    let hit = []; try { hit = await scan(); } catch (e) { scanErr = e.message; }
    if (Date.now() - lastManage > 8e3) { lastManage = Date.now(); await manage().catch(e => { scanErr = e.message; }); }
    if (hit.length) { users = { t: Date.now(), rows: await db.q('SELECT b.* FROM membot b JOIN users u ON u.id=b.uid WHERE b.enabled=true AND u.verified=true') };
      for (const r of users.rows) await enter(r, hit.slice()).catch(e => console.error('meme', r.uid, e.message)); }
    if (radar.length && Date.now() - lastPub > 5e3) { lastPub = Date.now(); await S.set('memelive', JSON.stringify({ t: Date.now(), scanned: lastScan, err: scanErr, radar })).catch(() => {}); }
  } finally { busy = false; }
}
async function stats(uid) {
  const r = await db.one("SELECT count(*)::int AS n, sum(CASE WHEN status='won' THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN status='lost' THEN 1 ELSE 0 END)::int AS l, coalesce(sum(pnl),0) AS pnl, coalesce(sum(CASE WHEN status='open' THEN cost ELSE 0 END),0) AS openc FROM memetrades WHERE uid=$1", [uid]);
  return { trades: r.n, won: r.w || 0, lost: r.l || 0, pnl: num(r.pnl), open: num(r.openc) };
}
module.exports = { DEF, FEE, R, X, judge, slip, scan, quotes, enter, manage, close, tick, open, stats };
