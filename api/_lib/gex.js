// GEX Levels: options gamma exposure for SPY (an SPX proxy) turned into paper-trading signals, traded in Mimic's built-in paper account. Nothing real is ever traded.
// Data (free, delayed): SPY's full options chain from CBOE's public delayed-quotes feed (open interest + implied volatility for every contract), with a
// best-effort Yahoo Finance fallback. SPY price bars from Yahoo's chart endpoint.
//   gamma per contract = Black-Scholes gamma;  GEX = gamma x open interest x 100 x spot, summed over every expiration.
//   Calls count positive, puts negative (dealers long calls, short puts). Max GEX = the strike with the most total (call + |put|) gamma.
//   Zero-gamma flip = the spot where net gamma (recomputed at hypothetical prices) crosses zero. Net > 0: dealers long gamma (pinning). Net < 0: short gamma (amplifying).
const db = require('./db'), S = require('./settings'), P = require('./powell'), AL = require('./alpaca'), PBK = require('./paperbroker');
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

/* ---------- storage ---------- */
const ID = () => require('crypto').randomBytes(8).toString('hex');
const row = r => ({ id: r.id, ts: Number(r.ts), day: r.day, kind: r.kind, dir: r.dir, level: r.level, entry: r.entry, stop: r.stop, target: r.target, status: r.status, exitp: r.exitp, exitts: r.exitts != null ? Number(r.exitts) : null, pnl: r.pnl, note: r.note, note0: r.note0 });
async function apply(res, now) {
  for (const s of res.create) await db.q('INSERT INTO gexsig (id, ts, day, kind, dir, level, entry, stop, target, status, note, note0) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [ID(), now.ts, now.day, s.kind, s.dir, s.level, s.entry ?? null, s.stop ?? null, s.target ?? null, s.status, s.note, s.note0]);
  for (const u of res.update) await db.q("UPDATE gexsig SET status=$2, exitp=$3, exitts=$4, pnl=$5, note=$6 WHERE id=$1 AND status='open'", [u.id, u.status, u.exitp, u.exitts, u.pnl, u.note]);
}

/* ---------- the paper account: every user with the bot on trades each pin-fade signal in Mimic's built-in paper account ----------
   Never a broker: the orders go to the paper ledger only (balance = the broker's balance plus paper profit, like the other bots). The position is kept
   under its own name (GEX:SPY) so it can never mix with SPY held anywhere else. Size comes from the risk dials: risk per trade (distance to the
   stop), a cap on the position size, a limit on trades a day, and a 3% daily loss stop. Magnet drift and stand-aside stay notes, they are not trades. */
const DEF = { risk: .5, max: 25, per: 3 }, PSYM = 'GEX:SPY', FRESH = 10 * 6e4, FLAT_M = 955, cents = x => Math.round(x * 100) / 100, J = (t, d) => { try { return t ? JSON.parse(t) : d; } catch (_) { return d; } };
async function open(uid) {
  await db.q("INSERT INTO gexbot (uid, enabled, cfg, updated) VALUES ($1, false, '{}', $2) ON CONFLICT (uid) DO NOTHING", [uid, Date.now()]);
  const r = await db.one('SELECT * FROM gexbot WHERE uid=$1', [uid]), c = J(r.cfg, {});
  return { row: r, cfg: { risk: c.risk > 0 ? c.risk : DEF.risk, max: c.max > 0 ? c.max : DEF.max, per: c.per >= 1 ? Math.round(c.per) : DEF.per } };
}
async function enter(uid, cfg, sg) { // one signal, one user. The row is claimed first (one per user and signal), so two runners can never both trade it
  const mine = ID(); await db.q("INSERT INTO gextrades (id, uid, sig, ts, day, dir, status) VALUES ($1,$2,$3,$4,$5,$6,'open') ON CONFLICT (uid, sig) DO NOTHING", [mine, uid, sg.id, Date.now(), sg.day, sg.dir]);
  if ((await db.one('SELECT id FROM gextrades WHERE uid=$1 AND sig=$2', [uid, sg.id])).id !== mine) return null; const id = mine; // the winner of the claim is the row that is there
  const skip = async why => (await db.q("UPDATE gextrades SET status='skip', reason=$2 WHERE id=$1", [id, why]), { skipped: why });
  try {
    const c = await AL.getCreds(uid).catch(() => null); if (!c) return skip('broker not connected');
    if ((await db.one("SELECT count(*)::int AS n FROM gextrades WHERE uid=$1 AND status='open' AND orderid IS NOT NULL AND id<>$2", [uid, id])).n) return skip('already in a GEX trade');
    if ((await db.one("SELECT count(*)::int AS n FROM gextrades WHERE uid=$1 AND day=$2 AND status<>'skip' AND id<>$3", [uid, sg.day, id])).n >= cfg.per) return skip(`already ${cfg.per} trade${cfg.per == 1 ? '' : 's'} today`);
    const acct = await AL.account(c), eq = Number(acct.equity), cash = Number(acct.cash); if (!(eq > 0)) return skip('no account balance');
    const lost = Number((await db.one("SELECT coalesce(sum(pnl),0) AS p FROM gextrades WHERE uid=$1 AND day=$2 AND status='closed'", [uid, sg.day])).p); if (lost <= -.03 * eq) return skip('daily loss limit (3%) reached');
    const long = sg.dir === 'long', px = await PBK.price(uid, 'SPY'); if (!(px > 0)) return skip('no SPY price');
    if (long ? !(sg.stop < px && px < sg.target) : !(sg.target < px && px < sg.stop)) return skip(`price (${cents(px)}) is already past the target or the stop`);
    if (Math.abs(px - sg.target) / px < .0005) return skip('price is already at the target'); const per = Math.abs(px - sg.stop); if (!(per >= .05)) return skip('stop too tight');
    const byRisk = Math.floor(eq * cfg.risk / 100 / per), byMax = Math.floor(eq * cfg.max / 100 / px), byCash = long ? Math.floor(cash * .95 / px) : Infinity, qty = Math.min(byRisk, byMax, byCash);
    if (!(qty >= 1)) return skip(byCash < 1 ? 'not enough cash for one share' : byMax < 1 ? `the ${cfg.max}% size cap is less than one share` : `${cfg.risk}% risk is less than one share at this stop`);
    let o; try { o = await PBK.bracket({ uid }, { symbol: PSYM, qty, side: long ? 'buy' : 'sell', tp: cents(sg.target), sl: cents(sg.stop) }); } catch (e) { return skip('the paper account refused the order: ' + String(e.message).slice(0, 100)); }
    const entry = Number(o.filled_avg_price) || px; await db.q('UPDATE gextrades SET qty=$2, entry=$3, stop=$4, tp=$5, orderid=$6 WHERE id=$1', [id, qty, entry, cents(sg.stop), cents(sg.target), o.id]); return { traded: `${sg.dir} ${qty} SPY @ ${cents(entry)}, stop ${cents(sg.stop)}, target ${cents(sg.target)}` };
  } catch (e) { await skip('error: ' + String(e.message).slice(0, 100)).catch(() => {}); throw e; }
}
async function trade() { // new (still fresh, still open) pin signals, for everyone who has the bot on, verified and connected
  const users = await db.q("SELECT g.uid FROM gexbot g JOIN users u ON u.id=g.uid WHERE g.enabled=true AND u.verified=true AND u.alpaca IS NOT NULL"); if (!users.length) return;
  const sigs = (await db.q("SELECT * FROM gexsig WHERE kind='pin' AND status='open' AND ts>$1 ORDER BY ts", [Date.now() - FRESH])).map(row);
  for (const u of users) for (const sg of sigs) { try { if (await db.one('SELECT id FROM gextrades WHERE uid=$1 AND sig=$2', [u.uid, sg.id])) continue; const { cfg } = await open(u.uid), r = await enter(u.uid, cfg, sg); if (r) console.log(new Date().toISOString(), 'gex', u.uid.slice(0, 6), JSON.stringify(r)); } catch (e) { console.error('gex trade', e.message); } }
}
async function manage() { // every minute: stops and targets the paper account filled, trades whose signal ended, the 15:55 flatten, leftovers from an earlier day
  const open = await db.q("SELECT * FROM gextrades WHERE status='open'"), now = P.et(Date.now() / 1000);
  for (const t of open) { try {
    if (!t.orderid) { if (Date.now() - Number(t.ts) > 2 * 6e4) await db.q("UPDATE gextrades SET status='skip', reason='interrupted before the order' WHERE id=$1 AND status='open' AND orderid IS NULL", [t.id]); continue; }
    const c = { uid: t.uid }, long = t.dir === 'long', done = (px, why) => db.q("UPDATE gextrades SET status='closed', exitp=$2, pnl=$3, reason=$4, exitts=$5 WHERE id=$1 AND status='open'", [t.id, px, px != null && t.entry != null ? (px - t.entry) * t.qty * (long ? 1 : -1) : null, why, Date.now()]);
    const look = async () => { try { return await PBK.orderNested(c, t.orderid); } catch (e) { if (e.status === 404) return null; throw e; } }, filled = o => (o.legs || []).find(l => l.status === 'filled');
    let o = await look(); if (!o) { await done(null, 'the paper account was reset'); continue; } let hit = filled(o); if (hit) { await done(Number(hit.filled_avg_price), hit.type === 'stop' ? 'stop' : 'target'); continue; }
    const sg = await db.one('SELECT status FROM gexsig WHERE id=$1', [t.sig]);
    const why = t.day !== now.date ? 'left over from an earlier day' : now.m >= FLAT_M ? 'flat at 15:55' : sg && sg.status !== 'open' ? (sg.status === 'invalidated' ? 'signal killed: a bar closed 0.5% beyond the strike' : `signal ended (${sg.status})`) : null; if (!why) continue;
    for (const l of o.legs || []) await PBK.cancel(c, l.id); o = await look(); hit = o && filled(o); if (hit) { await done(Number(hit.filled_avg_price), hit.type === 'stop' ? 'stop' : 'target'); continue; } // a leg filled while we were looking
    const p = await PBK.pos(t.uid, PSYM); if (!p || Math.sign(p.qty) !== (long ? 1 : -1)) { await done(null, 'closed outside the bot'); continue; }
    const f = await PBK.market(c, long ? 'sell' : 'buy', PSYM, Math.min(Math.abs(p.qty), Number(t.qty))); await done(Number(f.filled_avg_price), why); } catch (e) { console.error('gex manage', e.message); } }
}
async function tstats(uid) {
  const r = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<=0 THEN 1 ELSE 0 END)::int AS l FROM gextrades WHERE uid=$1 AND status='closed' AND pnl IS NOT NULL", [uid]);
  return { n: r.n, pnl: Number(r.pnl), won: r.w || 0, lost: r.l || 0 };
}

/* ---------- the runner tick ---------- */
let busy = false, nextRun = 0;
async function collect() { // once a minute during the NY session, only while someone has the GEX bot switched on: levels, signals; true when signals were checked
  const on = await db.one('SELECT count(*)::int AS n FROM gexbot WHERE enabled=true'); if (!on.n) return false; const e = P.et(Date.now() / 1000); if (e.m < 570 || e.m > 965) return false;
  const bars = await spyBars(); if (!bars.some(b => b.date === e.date)) return false; const live = bars.filter(b => b.date === e.date).pop()?.c, snap = await snapshot(0, live), open = (await db.q('SELECT * FROM gexsig WHERE day=$1 OR status=$2', [e.date, 'open'])).map(row), res = detect(snap, bars, open, e.date); await apply(res, { ts: Date.now(), day: e.date });
  if (res.create.length || res.update.length) console.log(new Date().toISOString(), 'gex', JSON.stringify({ new: res.create.map(s => s.kind), done: res.update.map(u => u.status) })); return true;
}
async function tick() { // runner
  if (busy || Date.now() < nextRun) return; busy = true; nextRun = Date.now() + 60e3;
  try { try { if (await collect()) await trade(); } catch (err) { console.error('gex', err.message); } try { await manage(); } catch (err) { console.error('gex manage', err.message); } } finally { busy = false; }
}
async function log(limit = 120) { return (await db.q('SELECT * FROM gexsig ORDER BY ts DESC LIMIT $1', [limit])).map(row); }
async function stats() {
  const a = await db.q("SELECT kind, status, pnl FROM gexsig WHERE status IN ('win','loss','invalidated')"), pick = k => a.filter(x => x.kind === k), fmt = rows => { const w = rows.filter(x => x.status === 'win').length, n = rows.length, sum = rows.reduce((t, x) => t + (x.pnl || 0), 0); return { n, won: w, lost: n - w, pnl: sum, avg: n ? sum / n : 0 }; };
  return { pin: fmt(pick('pin')), drift: fmt(pick('drift')) };
}
module.exports = { etLocal, gamma, compute, chain, snapshot, spyBars, detect, tick, log, stats, apply, row, etToEpoch, SIG, DEF, PSYM, open, enter, trade, manage, tstats, collect };
