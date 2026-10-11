// GEX Levels: options gamma exposure for SPY (an SPX proxy) turned into paper-trading signals. Log only: nothing real is ever traded.
// Data (free, delayed): SPY's full options chain from CBOE's public delayed-quotes feed (open interest + implied volatility for every contract), with a
// best-effort Yahoo Finance fallback. SPY price bars from Yahoo's chart endpoint.
//   gamma per contract = Black-Scholes gamma;  GEX = gamma x open interest x 100 x spot, summed over every expiration.
//   Calls count positive, puts negative (dealers long calls, short puts). Max GEX = the strike with the most total (call + |put|) gamma.
//   Zero-gamma flip = the spot where net gamma (recomputed at hypothetical prices) crosses zero. Net > 0: dealers long gamma (pinning). Net < 0: short gamma (amplifying).
const db = require('./db'), S = require('./settings'), P = require('./powell');
const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'application/json' };
const R = .04, Q = .013, MIN_T = 1 / (365.25 * 24); // risk-free rate, SPY dividend yield, never less than one hour to expiry
const SIG = { devMin: .001, touch: .003, devMax: .005, drift: .01 }; // pin-fade entries 0.10% to 0.30% from the wall (a touch); stop and invalidation 0.5% beyond it; magnet drift at 1% or more

/* ---------- Black-Scholes gamma ---------- */
const phi = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
function gamma(S0, K, T, sigma, r = R, q = Q) { if (!(S0 > 0 && K > 0 && T > 0 && sigma > 0)) return 0; const sq = sigma * Math.sqrt(T), d1 = (Math.log(S0 / K) + (r - q + sigma * sigma / 2) * T) / sq; return Math.exp(-q * T) * phi(d1) / (S0 * sq); }

/* ---------- the options chain ---------- */
const etLocal = str => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(str || ''); if (!m) return Date.now(); const [y, mo, d, h, mi, se] = m.slice(1).map(Number); for (const off of [4, 5]) { const ts = Date.UTC(y, mo - 1, d, h + off, mi, se); const e = P.et(ts / 1000); if (e.m === h * 60 + mi) return ts; } return Date.UTC(y, mo - 1, d, h + 4, mi, se); };
const etToEpoch = date => { const [y, m, d] = date.split('-').map(Number); for (const off of [4, 5]) { const ts = Date.UTC(y, m - 1, d, 16 + off); if (P.et(ts / 1000).m === 960) return ts; } return Date.UTC(y, m - 1, d, 20); };
async function fromCboe(sym) {
  const r = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${sym}.json`, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(45e3) }); if (!r.ok) throw new Error('CBOE: ' + r.status);
  const j = (await r.json()).data, out = []; for (const o of j.options || []) { const m = /^[A-Z]{1,5}\d?(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(o.option); if (!m) continue; out.push({ exp: `20${m[1]}-${m[2]}-${m[3]}`, call: m[4] === 'C', K: parseInt(m[5], 10) / 1000, oi: Number(o.open_interest) || 0, iv: Number(o.iv) || 0 }); }
  return { source: 'CBOE delayed quotes', spot: Number(j.current_price), asof: etLocal(j.last_trade_time), options: out };
}
async function fromYahoo(sym) { // what yfinance does: a cookie, a crumb, then one request per expiration
  const jar = await fetch('https://fc.yahoo.com', { headers: UA, redirect: 'manual' }), ck = (jar.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; '); if (!ck) throw new Error('Yahoo: no cookie');
  const h = { ...UA, cookie: ck }, crumb = await (await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: h })).text(); if (!crumb || /too many|invalid/i.test(crumb)) throw new Error('Yahoo: ' + crumb.slice(0, 40));
  const first = (await (await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${sym}?crumb=${encodeURIComponent(crumb)}`, { headers: h })).json()).optionChain.result[0], spot = Number(first.quote.regularMarketPrice), out = [];
  const take = (res) => { for (const c of res.options[0]?.calls || []) out.push({ exp: new Date(c.expiration * 1000).toISOString().slice(0, 10), call: true, K: c.strike, oi: c.openInterest || 0, iv: c.impliedVolatility || 0 });
    for (const c of res.options[0]?.puts || []) out.push({ exp: new Date(c.expiration * 1000).toISOString().slice(0, 10), call: false, K: c.strike, oi: c.openInterest || 0, iv: c.impliedVolatility || 0 }); };
  take(first); for (const e of first.expirationDates.slice(1, 30)) { const r = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${sym}?date=${e}&crumb=${encodeURIComponent(crumb)}`, { headers: h }); if (r.ok) take((await r.json()).optionChain.result[0]); }
  return { source: 'Yahoo Finance (yfinance data)', spot, asof: Date.now(), options: out };
}
async function chain(sym = 'SPY') { try { return await fromCboe(sym); } catch (e) { try { return await fromYahoo(sym); } catch (e2) { throw new Error(`options chain unavailable (${e.message}; ${e2.message})`); } } }

/* ---------- GEX levels ---------- */
function compute(ch, now = Date.now()) {
  const spot = ch.spot, opts = ch.options.filter(o => o.oi > 0 && o.iv > .01 && o.iv < 3 && o.K > 0).map(o => ({ ...o, T: Math.max((etToEpoch(o.exp) - now) / (365.25 * 864e5), MIN_T) })).filter(o => o.T < 2);
  const byK = new Map(); let callT = 0, putT = 0;
  for (const o of opts) { const g = gamma(spot, o.K, o.T, o.iv) * o.oi * 100 * spot, e = byK.get(o.K) || { K: o.K, call: 0, put: 0 }; if (o.call) { e.call += g; callT += g; } else { e.put -= g; putT -= g; } byK.set(o.K, e); }
  const all = [...byK.values()].map(e => ({ ...e, net: e.call + e.put, gross: e.call - e.put })).sort((a, b) => a.K - b.K), top = all.reduce((m, e) => e.gross > (m?.gross || 0) ? e : m, null);
  // zero-gamma flip: re-price every contract at hypothetical spots (same volatilities) and find where the net crosses zero, nearest to the real spot
  const netAt = s => { let n = 0; for (const o of opts) n += (o.call ? 1 : -1) * gamma(s, o.K, o.T, o.iv) * o.oi * 100 * s; return n; };
  let flip = null, prev = null; const steps = []; for (let k = -12; k <= 12; k += .25) steps.push(spot * (1 + k / 100));
  const vals = steps.map(s => [s, netAt(s)]); for (let i = 1; i < vals.length; i++) { const [s0, n0] = vals[i - 1], [s1, n1] = vals[i]; if (n0 === 0 || (n0 < 0) !== (n1 < 0)) { const x = s0 + (s1 - s0) * (0 - n0) / (n1 - n0); if (flip == null || Math.abs(x - spot) < Math.abs(flip - spot)) flip = x; } }
  const net = callT + putT;
  return { t: now, asof: ch.asof, source: ch.source, spot, expirations: new Set(opts.map(o => o.exp)).size, contracts: opts.length, callGex: callT, putGex: putT, net, regime: net >= 0 ? 'long' : 'short',
    maxK: top?.K ?? null, maxGex: top?.gross ?? 0, flip, strikes: all.filter(e => Math.abs(e.K / spot - 1) <= .06).map(e => ({ K: e.K, call: Math.round(e.call), put: Math.round(e.put) })), curve: vals.filter((_, i) => i % 2 === 0).map(([s, n]) => [Math.round(s * 100) / 100, Math.round(n)]) };
}
let CH = { at: 0, v: null }; // the options chain barely changes intraday (open interest is set overnight): refetch every 5 minutes, re-price against the live SPY price every minute
const liveChain = async () => { if (!CH.v || Date.now() - CH.at > 5 * 6e4) CH = { at: Date.now(), v: await chain('SPY') }; return CH.v; };
async function snapshot(ttl = 5 * 6e4, spot) { // ttl: how old a stored snapshot may be (the runner passes 0 and a live spot; page loads accept 5 minutes)
  const cached = JSON.parse(await S.get('gexsnap').catch(() => null) || 'null'); if (ttl && cached && Date.now() - cached.t < ttl) return cached;
  const ch = await liveChain(), snap = compute({ ...ch, spot: spot > 0 ? spot : ch.spot }); await S.set('gexsnap', JSON.stringify(snap)).catch(() => {}); return snap;
}

/* ---------- SPY bars (5 minute) ---------- */
let BARS = { at: 0, v: null };
async function spyBars() {
  if (BARS.v && Date.now() - BARS.at < 20e3) return BARS.v; let j; for (let i = 0; i < 3; i++) { const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=5m&includePrePost=false', { headers: UA, signal: AbortSignal.timeout(20e3) });
    if (r.ok) { j = await r.json(); break; } if (i === 2 || (r.status < 500 && r.status !== 429)) throw new Error('Yahoo Finance: ' + r.status); await new Promise(z => setTimeout(z, 700 * (i + 1))); }
  const res = j?.chart?.result?.[0]; if (!res?.timestamp) throw new Error('no SPY bars'); const q = res.indicators.quote[0], out = [];
  res.timestamp.forEach((ts, i) => { if ([q.open[i], q.high[i], q.low[i], q.close[i]].some(x => x == null)) return; const e = P.et(ts); out.push({ t: ts * 1000, date: e.date, m: e.m, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }); });
  BARS = { at: Date.now(), v: out }; return out;
}

/* ---------- signals (paper, log only) ---------- */
// Pin fade: in a long-gamma (pinning) regime, price 0.10% to 0.30% away from the max-GEX strike (a touch) is faded back to the strike.
//   Entry = price now, target = the strike, stop = 0.5% beyond the strike on the side price is on. A bar CLOSING 0.5% or more beyond the strike kills it.
// Magnet drift: price 1% or more from the max-GEX strike in a long-gamma regime -> a bias note (drifts toward the magnet). Scored at the close.
// Stand aside: net gamma negative -> "no trade, amplification regime" (logged once a day).
function detect(snap, bars, open, today) { // -> { create: [...], update: [{id, ...}] } given the bars (oldest first), today's signals plus any still open
  const out = { create: [], update: [] }, K = snap.maxK, rth = bars.filter(b => b.m >= 570 && b.m < 960), dayOf = d => rth.filter(b => b.date === d), day = dayOf(today); if (K == null) return out;
  const pct = (s, x) => ((s.dir === 'short' ? s.entry - x : x - s.entry) / s.entry) * 100;
  // 1) resolve open signals bar by bar from the bar AFTER entry (stop first if one bar touches both); signals from an earlier day close at that day's last bar
  for (const s of open.filter(x => x.status === 'open' && (x.kind === 'pin' || x.kind === 'drift'))) { const db_ = dayOf(s.day), lastB = db_[db_.length - 1]; if (!lastB) continue; const finished = s.day < today || lastB.m >= 955; let res = null;
    if (s.kind === 'pin') { const short = s.dir === 'short';
      for (const b of db_.filter(x => x.t > s.ts)) { const beyond = short ? b.c >= s.level * (1 + SIG.devMax) : b.c <= s.level * (1 - SIG.devMax), hitStop = short ? b.h >= s.stop : b.l <= s.stop, hitTgt = short ? b.l <= s.target : b.h >= s.target;
        if (beyond) { res = { status: 'invalidated', exitp: s.stop, exitts: b.t, note: 'a bar closed 0.5% beyond the strike: signal killed' }; break; } if (hitStop) { res = { status: 'loss', exitp: s.stop, exitts: b.t, note: 'stop hit (0.5% beyond the strike)' }; break; } if (hitTgt) { res = { status: 'win', exitp: s.target, exitts: b.t, note: 'target reached: back at the strike' }; break; } }
      if (!res && finished) res = { status: pct(s, lastB.c) > 0 ? 'win' : 'loss', exitp: lastB.c, exitts: lastB.t, note: 'closed at the 16:00 close' };
      if (res) out.update.push({ id: s.id, ...res, pnl: pct(s, res.exitp) }); }
    else if (finished) { const closer = Math.abs(lastB.c - s.level) < Math.abs(s.entry - s.level); out.update.push({ id: s.id, status: closer ? 'win' : 'loss', exitp: lastB.c, exitts: lastB.t, note: closer ? 'drifted toward the magnet' : 'did not drift toward the magnet', pnl: (Math.abs(s.entry - s.level) - Math.abs(lastB.c - s.level)) / s.entry * 100 }); } }
  if (!day.length) return out; const last = day[day.length - 1], p = last.c, dev = (p - K) / K, sess = last.m < 930;
  // 3) new signals (each kind at most once a day per strike / regime)
  const has = (kind, key) => open.some(x => x.kind === kind && x.day === today && x.note0 === key);
  if (snap.regime === 'short') { if (!has('aside', 'short')) out.create.push({ kind: 'aside', dir: null, level: K, status: 'note', note: 'No trade: net gamma is negative, dealers amplify moves (amplification regime)', note0: 'short' }); return out; }
  if (sess && Math.abs(dev) >= SIG.devMin && Math.abs(dev) <= SIG.touch && !has('pin', String(K))) { const short = dev > 0; out.create.push({ kind: 'pin', dir: short ? 'short' : 'long', level: K, entry: p, target: K, stop: K * (short ? 1 + SIG.devMax : 1 - SIG.devMax), status: 'open', note: `price ${(dev * 100).toFixed(2)}% from the ${K} wall: fade back to it`, note0: String(K) }); }
  if (sess && Math.abs(dev) >= SIG.drift && !has('drift', String(K))) out.create.push({ kind: 'drift', dir: dev < 0 ? 'up' : 'down', level: K, entry: p, status: 'open', note: `price ${(Math.abs(dev) * 100).toFixed(1)}% ${dev < 0 ? 'below' : 'above'} the ${K} magnet in a pinning regime: bias drifts ${dev < 0 ? 'up' : 'down'} toward it`, note0: String(K) });
  return out;
}

/* ---------- storage + the runner tick ---------- */
const ID = () => require('crypto').randomBytes(8).toString('hex');
const row = r => ({ id: r.id, ts: Number(r.ts), day: r.day, kind: r.kind, dir: r.dir, level: r.level, entry: r.entry, stop: r.stop, target: r.target, status: r.status, exitp: r.exitp, exitts: r.exitts != null ? Number(r.exitts) : null, pnl: r.pnl, note: r.note, note0: r.note0 });
async function apply(res, now) {
  for (const s of res.create) await db.q('INSERT INTO gexsig (id, ts, day, kind, dir, level, entry, stop, target, status, note, note0) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [ID(), now.ts, now.day, s.kind, s.dir, s.level, s.entry ?? null, s.stop ?? null, s.target ?? null, s.status, s.note, s.note0]);
  for (const u of res.update) await db.q("UPDATE gexsig SET status=$2, exitp=$3, exitts=$4, pnl=$5, note=$6 WHERE id=$1 AND status='open'", [u.id, u.status, u.exitp, u.exitts, u.pnl, u.note]);
}
let busy = false, nextRun = 0;
async function tick() { // runner: once a minute during the NY session, only while someone has the GEX bot switched on
  if (busy || Date.now() < nextRun) return; busy = true; nextRun = Date.now() + 60e3;
  try { const on = await db.one('SELECT count(*)::int AS n FROM gexbot WHERE enabled=true'); if (!on.n) return; const e = P.et(Date.now() / 1000); if (e.m < 570 || e.m > 965) return;
    const bars = await spyBars(); if (!bars.some(b => b.date === e.date)) return; const live = bars.filter(b => b.date === e.date).pop()?.c, snap = await snapshot(0, live), open = (await db.q('SELECT * FROM gexsig WHERE day=$1 OR status=$2', [e.date, 'open'])).map(row), res = detect(snap, bars, open, e.date); await apply(res, { ts: Date.now(), day: e.date });
    if (res.create.length || res.update.length) console.log(new Date().toISOString(), 'gex', JSON.stringify({ new: res.create.map(s => s.kind), done: res.update.map(u => u.status) })); }
  catch (err) { console.error('gex', err.message); } finally { busy = false; }
}
async function log(limit = 120) { return (await db.q('SELECT * FROM gexsig ORDER BY ts DESC LIMIT $1', [limit])).map(row); }
async function stats() {
  const a = await db.q("SELECT kind, status, pnl FROM gexsig WHERE status IN ('win','loss','invalidated')"), pick = k => a.filter(x => x.kind === k), fmt = rows => { const w = rows.filter(x => x.status === 'win').length, n = rows.length, sum = rows.reduce((t, x) => t + (x.pnl || 0), 0); return { n, won: w, lost: n - w, pnl: sum, avg: n ? sum / n : 0 }; };
  return { pin: fmt(pick('pin')), drift: fmt(pick('drift')) };
}
module.exports = { etLocal, gamma, compute, chain, snapshot, spyBars, detect, tick, log, stats, apply, row, etToEpoch, SIG };
