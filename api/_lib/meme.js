// Meme Radar: paper-trades new meme coins (Solana + Base) at the start of a trend. Paper only: no wallet, no real money.
// Discovery: GeckoTerminal new + trending pools every 30s. Prices for open positions: DexScreener, every 8s.
// Entry = an "ignition" pattern on a young, liquid pool: volume accelerating well past its hourly pace, many distinct
// buyers, buys outnumbering sells, price rising but not yet a blow-off, confirmed on two scans in a row, then re-priced
// fresh on a second source. Paper fills are pessimistic on purpose: price impact from the pool's size plus a DEX fee,
// both ways, and a pulled-liquidity exit sells into the crash like a real rug would.
const crypto = require('crypto'), db = require('./db'), S = require('./settings');
const CHAINS = { solana: 'solana', base: 'base' }, UA = { 'user-agent': 'Mozilla/5.0 (mimic)', accept: 'application/json' };
const DEF = { size: 'pct', pct: 2, usd: 25 }, FEE = .01, MAX_OPEN = 6;
const L = { daily: .05, weekly: .10, heat: .15, smallFdv: 1e5, smallMult: .4 }; // risk limits: stop for the day at -5%, for the week at -10%; at most 15% of the account open at once; sub-$100k coins get 40% size
const R = { minAge: 15, maxAge: 720, minLiq: 15e3, minFdv: 25e3, maxFdv: 8e6, maxFdvLiq: 60, buy: 6 }; // entry rules
const X = { sl: -.25, liqDrop: .6, trail1: [.3, .8], trail2: [1, .85], stale: [40 * 6e4, .05], hold: 4 * 36e5 }; // exit rules
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const num = x => { x = Number(x); return Number.isFinite(x) ? x : 0; };
const get = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(12e3) }); if (!r.ok) throw new Error(`${r.status} ${new URL(u).host}`); return r.json(); };
// price impact of a swap of $usd in a pool holding $liq (constant product: ~2*usd/liq) plus 2% slop (landing late, bots in front: the meme-coin research puts the adverse fill at 2-5% a side on thin pools)
const slip = (usd, liq) => Math.min(.9, .02 + 2 * usd / Math.max(liq, 1));
// the loss limits and exposure cap in one place: -> reason to skip new buys, or null
const halt = (equity, day, week, openCost) => day <= -L.daily * equity ? 'down 5% today' : week <= -L.weekly * equity ? 'down 10% this week' : openCost >= L.heat * equity ? 'a 15% share of the account is already open' : null;
const sized = (want, fdv) => want * (fdv < L.smallFdv ? L.smallMult : 1);

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
  return { ok: !fails.length && score >= R.buy, score, why, fails, age, liq, fdv, f: { accel, ratio15, ratio5, breadth, vl, m5: num(pc.m5), m15: num(pc.m15), h1: num(pc.h1), b15: num(m15.buyers), b1h: num(h1.buyers) } };
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
      out.push({ f: j.f, elig: j.age >= R.minAge && j.age <= R.maxAge && j.liq >= R.minLiq && j.fdv >= R.minFdv && j.fdv <= 2e7, id, chain, pool: a.address, token: tok, sym, price: num(a.base_token_price_usd), liq: j.liq, fdv: j.fdv, age: Math.round(j.age), score: j.score, ok: j.ok, why: j.why, fails: j.fails.slice(0, 2), nfails: j.fails.length, pc: { m5: num(a.price_change_percentage?.m5), m15: num(a.price_change_percentage?.m15), h1: num(a.price_change_percentage?.h1) } });
    }
    for (const k of [...SEEN.keys()]) if (!seen.has(k)) SEEN.delete(k);
    for (const c of out) c.streak = c.ok ? (SEEN.get(c.id) || 0) + 1 : 0, SEEN.set(c.id, c.streak);
    track(out.filter(c => c.elig)).catch(e => { scanErr = scanErr || e.message; });
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


/* ---------- safety check (free, no keys): Solana tokens on RugCheck, Base tokens on GoPlus ---------- */
const SAFE = new Map(); // token -> { t, v }
async function safety(chain, token) { // -> { ok, why: [red flags], checked }  (a token that cannot be checked is not traded)
  const hit = SAFE.get(token); if (hit && Date.now() - hit.t < (hit.v.checked ? 30 * 6e4 : 3 * 6e4)) return hit.v; let v;
  try {
    if (chain === 'solana') { const j = await get(`https://api.rugcheck.xyz/v1/tokens/${token}/report`), bad = (j.risks || []).filter(r => r.level === 'danger').map(r => r.name);
      if (j.rugged) bad.push('flagged as rugged'); if (j.mintAuthority) bad.push('mint authority not revoked'); if (j.freezeAuthority) bad.push('freeze authority not revoked'); if (num(j.transferFee?.pct) > 10) bad.push('transfer fee over 10%');
      const dev = (j.topHolders || []).find(h => j.creator && h.owner === j.creator); if (dev && num(dev.pct) > 10) bad.push(`dev still holds ${Math.round(num(dev.pct))}%`);
      v = { ok: !bad.length, why: [...new Set(bad)], checked: true, score: num(j.score_normalised) }; }
    else { const j = await get(`https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${token.toLowerCase()}`), d = j.result && j.result[token.toLowerCase()]; if (!d || d.is_honeypot === undefined) throw new Error('no GoPlus report'); // no verdict = not safe
      const bad = []; if (d.is_honeypot === '1') bad.push('honeypot'); if (d.cannot_sell_all === '1') bad.push('cannot sell all'); if (d.hidden_owner === '1') bad.push('hidden owner'); if (d.owner_change_balance === '1') bad.push('owner can change balances'); if (d.selfdestruct === '1') bad.push('can self-destruct'); if (num(d.sell_tax) > .1 || num(d.buy_tax) > .1) bad.push('tax over 10%');
      if (d.is_mintable === '1') bad.push('owner can mint more'); if (d.transfer_pausable === '1') bad.push('transfers can be paused'); if (d.is_blacklisted === '1') bad.push('has a blacklist'); if (d.is_whitelisted === '1') bad.push('has a whitelist'); if (d.can_take_back_ownership === '1') bad.push('ownership can be taken back'); if (d.is_open_source === '0') bad.push('code not published');
      v = { ok: !bad.length, why: bad, checked: true }; }
  } catch (e) { v = { ok: false, why: ['could not be checked: ' + String(e.message).slice(0, 60)], checked: false }; }
  SAFE.set(token, { t: Date.now(), v }); if (SAFE.size > 500) SAFE.delete(SAFE.keys().next().value); return v;
}

/* ---------- shadow record: every pool the scanner finds that meets the basic bar is logged, then followed for 4 hours on 1-minute candles with the bot's own exit rules ----------
   That is how the rules get tested without waiting for the few real trades: dozens of signals a day, each scored with the same costs. */
const TRACKED = new Map(); let trackDay = '', trackN = 0; const STAKE = 50, DAILYCAP = 500;
async function track(list) {
  const today = new Date().toISOString().slice(0, 10); if (trackDay !== today) { trackDay = today; trackN = 0; } if (TRACKED.size > 3000) for (const [k, t] of TRACKED) if (Date.now() - t > 12 * 36e5) TRACKED.delete(k);
  for (const c of list) { if (trackN >= DAILYCAP || TRACKED.has(c.pool) || !(c.price > 0)) continue; TRACKED.set(c.pool, Date.now()); if (await db.one('SELECT id FROM memesig WHERE pool=$1 AND ts>$2', [c.pool, Date.now() - 12 * 36e5])) continue; trackN++;
    const sf = c.ok ? await safety(c.chain, c.token) : null;
    await db.q('INSERT INTO memesig (id, ts, chain, pool, token, sym, price, liq, fdv, age, score, ok, nfail, f, safe) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [crypto.randomBytes(8).toString('hex'), Date.now(), c.chain, c.pool, c.token, c.sym, c.price, c.liq, c.fdv, c.age, c.score, !!c.ok, c.nfails, JSON.stringify(c.f || {}), sf ? JSON.stringify({ ok: sf.ok, why: sf.why, checked: sf.checked }) : null]); }
}
// one logged signal against its next 4 hours of 1-minute candles (newest first: [time, o, h, l, c, v]); same exits as the bot, same costs, a $50 position.
// ladder > 0 tests "take the initial out": half is sold when the price is up by that much (the stake comes back), the rest rides the same exits.
function run(sig, c, entryT, ladder) {
  const liq = num(sig.liq), fill = num(sig.price) * (1 + slip(STAKE, liq)); let qty = STAKE * (1 - FEE) / fill, banked = 0, taken = !ladder, peak = fill, last = fill, mdd = 0, out = null;
  const exit = (px, why, t) => { const f = px * (1 - slip(qty * px, liq)), proceeds = banked + qty * f * (1 - FEE); return { ret: proceeds / STAKE - 1, why, held: Math.round((t - entryT) / 60), peak: peak / fill - 1, mdd, n: c.length }; };
  for (const [t, o, h, l, cl] of c) { if (t <= entryT) { last = cl; continue; } const held = (t - entryT) * 1000; peak = Math.max(peak, h); mdd = Math.min(mdd, l / fill - 1);
    if (l <= last * .2) { out = exit(last * .1, 'pool vanished (likely rug)', t); break; }
    const stop = fill * (1 + X.sl); if (l <= stop) { out = exit(Math.min(o, stop), `stop ${Math.round(X.sl * 100)}%`, t); break; }
    if (!taken && h >= fill * (1 + ladder)) { const px = Math.max(o, fill * (1 + ladder)), half = qty / 2; banked += half * px * (1 - slip(half * px, liq)) * (1 - FEE); qty -= half; taken = true; }
    const up = peak / fill - 1; if (up >= X.trail2[0] && l <= peak * X.trail2[1]) { out = exit(Math.min(o, peak * X.trail2[1]), 'trailing stop', t); break; } if (up >= X.trail1[0] && l <= peak * X.trail1[1]) { out = exit(Math.min(o, peak * X.trail1[1]), 'trailing stop', t); break; }
    if (held > X.stale[0] && cl / fill - 1 < X.stale[1]) { out = exit(cl, 'no follow-through', t); break; } if (held > X.hold) { out = exit(cl, 'held 4 hours', t); break; } last = cl; }
  return out || exit(last, 'end of data', c[c.length - 1][0]);
}
function simulate(sig, rows) {
  const entryT = Number(sig.ts) / 1000, c = rows.filter(r => r[0] >= entryT - 30).sort((a, b) => a[0] - b[0]); if (c.length < 5) return { err: 'no candles' };
  const out = run(sig, c, entryT, 0), at = m => { const r = c.find(x => x[0] >= entryT + m * 60); return r ? r[4] / num(sig.price) - 1 : null; };
  out.fwd = { m15: at(15), h1: at(60), h4: at(240) }; out.alt = { l2: run(sig, c, entryT, 1).ret, l3: run(sig, c, entryT, 2).ret }; return out; // alt: the same signal if half were sold at 2x / 3x
}
let evBusy = false, lastEv = 0;
async function evalSignals() { // runner: one matured signal every 5 seconds, politely (the free API allows about 30 requests a minute and the scanner uses 8)
  if (evBusy || Date.now() - lastEv < 5e3) return; evBusy = true; lastEv = Date.now();
  try { const due = await db.q('SELECT * FROM memesig WHERE ev IS NULL AND ts < $1 ORDER BY ts LIMIT 1', [Date.now() - (4 * 60 + 3) * 6e4]); if (!due.length) return; const sig = due[0], tries = num(sig.tries);
    let res; try { const j = await get(`https://api.geckoterminal.com/api/v2/networks/${CHAINS[sig.chain]}/pools/${sig.pool}/ohlcv/minute?aggregate=1&limit=300&currency=usd&before_timestamp=${Math.floor(Number(sig.ts) / 1000) + 4 * 3600 + 120}`); res = simulate(sig, j.data?.attributes?.ohlcv_list || []); }
    catch (e) { if (/429|5\d\d/.test(e.message) && tries < 6) { await db.q('UPDATE memesig SET tries=$2 WHERE id=$1', [sig.id, tries + 1]); return; } res = { err: String(e.message).slice(0, 60) }; }
    await db.q('UPDATE memesig SET ev=$2, evts=$3 WHERE id=$1', [sig.id, JSON.stringify(res), Date.now()]);
  } finally { evBusy = false; }
}
// the backtest: every logged signal in the period that has been followed to the end, grouped by what the bot would have done with it
const agg = rows => { const r = rows.map(x => x.ev.ret), n = r.length, w = r.filter(x => x > 0).length, sum = r.reduce((a, b) => a + b, 0), gw = r.filter(x => x > 0).reduce((a, b) => a + b, 0), gl = -r.filter(x => x < 0).reduce((a, b) => a + b, 0), sorted = r.slice().sort((a, b) => a - b);
  const cut = n >= 30 ? 5 : 1, rest = sorted.slice(0, Math.max(0, n - cut)); // the checks from the backtesting rules: drop the best few signals and see what is left
  return { n, win: n ? w / n : null, avg: n ? sum / n : null, median: n ? sorted[Math.floor(n / 2)] : null, best: n ? sorted[n - 1] : null, worst: n ? sorted[0] : null, pf: gl ? gw / gl : null, rugs: rows.filter(x => /vanished/.test(x.ev.why)).length, cut, exBest: rest.length ? rest.reduce((a, b) => a + b, 0) / rest.length : null }; };
// the kill conditions, written down in advance: enough signals, positive after costs, still positive without the best few, a profit factor above 1.2
const verdict = g => !g.n ? { ok: null, text: 'No signals met the rules yet.' } : g.n < 100 ? { ok: null, text: `Only ${g.n} signal${g.n == 1 ? '' : 's'}. Meme results are so uneven that fewer than 100 prove nothing either way.` }
  : g.avg <= 0 ? { ok: false, text: 'Loses money after costs. Do not put real money behind it.' } : g.exBest <= 0 ? { ok: false, text: `The profit comes from its ${g.cut} best signal${g.cut == 1 ? '' : 's'}: without them it loses. That is luck, not a method.` }
  : g.pf != null && g.pf < 1.2 ? { ok: false, text: `Profit factor ${g.pf.toFixed(2)} is too thin to survive real-world fills.` } : { ok: true, text: 'Passes these checks, which is still not proof: this is one stretch of market and the same signals picked the rules.' };
async function backtest(days, uid) {
  const cut = Date.now() - days * 864e5, all = await db.q('SELECT ts, ok, nfail, f, safe, ev FROM memesig WHERE ts >= $1', [cut]), pending = all.filter(r => !r.ev).length;
  const rows = all.filter(r => r.ev).map(r => ({ ts: Number(r.ts), ok: r.ok, nfail: num(r.nfail), f: J(r.f, {}), safe: J(r.safe, null), ev: J(r.ev, {}) })).filter(r => r.ev.ret != null);
  const g = (name, note, f) => ({ name, note, ...agg(rows.filter(f)) }); const A = rows;
  const groups = [g('Everything the scanner found', 'every pool that met the basic bar (age, liquidity, market cap)', () => true), g("The bot's rules", 'what the bot would have bought', r => r.ok), g("The bot's rules, plus the safety check", 'with no red flags on RugCheck / GoPlus', r => r.ok && r.safe && r.safe.ok), g('Near misses', 'failed exactly one rule', r => !r.ok && r.nfail === 1)];
  for (const x of groups) x.verdict = verdict(x);
  // exit test: the same signals if half were sold at 2x or 3x so the stake comes back ("take the initial out"), against selling everything on the bot's rules
  const lad = rows.filter(r => r.ok && r.ev.alt && r.ev.alt.l2 != null), swap = k => lad.map(r => ({ ...r, ev: { ...r.ev, ret: r.ev.alt[k] } }));
  if (lad.length >= 5) groups.push({ name: 'Exit test: same signals, sell everything on the bot\'s rules', note: 'for comparison with the next two rows', ...agg(lad) }, { name: 'Exit test: half sold at 2x', note: 'the stake comes back, the rest rides', ...agg(swap('l2')) }, { name: 'Exit test: half sold at 3x', note: 'the stake comes back at three times', ...agg(swap('l3')) });
  const V = [['Volume 3x its hourly pace or more', r => r.f.accel >= 3], ['75% or more of trades are buys', r => r.f.ratio15 >= .75], ['Distinct buyers 80%+ of buys', r => r.f.breadth >= .8], ['Up 3-30% in 15 minutes', r => r.f.m15 >= 3 && r.f.m15 <= 30], ['Under 2 hours old', r => r.f.age <= 120], ['Over 3 hours old', r => r.f.age >= 180], ['Liquidity $50k or more', r => r.f.liq >= 5e4], ['Market cap under $500k', r => r.f.fdv < 5e5], ['Weekday daytime in the US (13:00-21:00 UTC)', r => { const d = new Date(r.ts); return d.getUTCDay() % 6 > 0 && d.getUTCHours() >= 13 && d.getUTCHours() < 21; }], ['Nights and weekends', r => { const d = new Date(r.ts); return d.getUTCDay() % 6 === 0 || d.getUTCHours() < 13 || d.getUTCHours() >= 21; }]].map(([name, f]) => ({ name, ...agg(A.filter(f)) })).filter(x => x.n >= 10);
  const mine = uid ? await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN status='won' THEN 1 ELSE 0 END)::int AS w FROM memetrades WHERE uid=$1 AND status<>'open' AND ts>=$2", [uid, cut]) : null;
  return { days, logged: all.length, evaluated: rows.length, pending, groups, variants: V, mine: mine ? { n: mine.n, pnl: num(mine.pnl), won: mine.w || 0 } : null };
}

/* ---------- chart data: 1-minute (or 5-minute) candles of one pool, cached 15s ---------- */
const CH = new Map();
async function chart(chain, pool, agg) {
  if (!CHAINS[chain] || !/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(String(pool))) throw Object.assign(new Error('bad pool'), { status: 400 });
  const a = Number(agg) === 5 ? 5 : 1, k = chain + pool + a, hit = CH.get(k); if (hit && Date.now() - hit.t < 15e3) return hit.v;
  const j = await get(`https://api.geckoterminal.com/api/v2/networks/${CHAINS[chain]}/pools/${pool}/ohlcv/minute?aggregate=${a}&limit=300&currency=usd`);
  const v = { agg: a, candles: (j.data?.attributes?.ohlcv_list || []).map(r => r.slice(0, 6).map(Number)).sort((x, y) => x[0] - y[0]) };
  CH.set(k, { t: Date.now(), v }); if (CH.size > 200) CH.delete(CH.keys().next().value); return v;
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
  const [day, week] = await Promise.all([dayStart(), Date.now() - 7 * 864e5].map(t => db.one("SELECT coalesce(sum(pnl),0) AS p FROM memetrades WHERE uid=$1 AND status<>'open' AND exitts>=$2", [uid, t])));
  let openCost = open.reduce((n, t) => n + num(t.cost), 0); const equity = row.paper + openCost;
  if (halt(equity, num(day.p), num(week.p), openCost)) return; // loss limits and the cap on how much is open at once (a rough week means rest, not revenge)
  const fresh = await quotes(cands.map(x => ({ chain: x.chain, pool: x.pool }))); let n = 0;
  for (const x of cands.sort((a, b) => b.score - a.score)) {
    if (n >= 2 || open.length + n >= MAX_OPEN) break;
    if (await db.one('SELECT id FROM memetrades WHERE uid=$1 AND token=$2 AND ts>$3', [uid, x.token, Date.now() - 24 * 36e5])) continue; // one trade per token per day
    const q = fresh.get(x.pool.toLowerCase()); if (!q || !(q.liq >= R.minLiq)) continue;
    const sf = await safety(x.chain, x.token); if (!sf.ok) continue; // a token with red flags (or one that cannot be checked) is never bought
    if (Math.abs(q.price / x.price - 1) > .06 || q.m5 < -1) continue; // the two sources must agree, and it can't be turning over right now
    const spend = Math.min(sized(cfg.size === 'usd' ? cfg.usd : equity * cfg.pct / 100, x.fdv), row.paper * .98, q.liq * .01, L.heat * equity - openCost); // smaller for tiny coins, never more than 1% of the pool, never past the cap on what is open
    if (!(spend >= 1)) continue;
    const fill = q.price * (1 + slip(spend, q.liq)), qty = spend * (1 - FEE) / fill;
    const done = await db.q('UPDATE membot SET paper=paper-$2 WHERE uid=$1 AND paper>=$2 RETURNING paper', [uid, spend]); if (!done.length) continue; row.paper = num(done[0].paper); openCost += spend;
    await db.q('INSERT INTO memetrades (id, uid, ts, chain, pool, token, sym, entry, qty, cost, liq, fdv, score, why, status, peak, last, lastts, slipin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
      [crypto.randomBytes(8).toString('hex'), uid, Date.now(), x.chain, x.pool, x.token, x.sym, fill, qty, spend, q.liq, x.fdv, x.score, x.why.join(' · ') + ' · no red flags on the safety check', 'open', q.price, q.price, Date.now(), fill / q.price - 1]); n++;
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
    evalSignals().catch(e => { scanErr = scanErr || e.message; });
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
module.exports = { chart, L, halt, sized, verdict, agg, run, safety, track, simulate, evalSignals, backtest, STAKE, DEF, FEE, R, X, judge, slip, scan, quotes, enter, manage, close, tick, open, stats };
