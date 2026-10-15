// Options family (Strategy Lab): SPY options positioning turned into intraday rules on 5-minute SPY candles. Paper only.
// Data: CBOE's free delayed SPY chain (about 13,000 contracts with open interest, volume, greeks, bid/ask, last trade), read every 5 minutes during the
// session by the 24/7 runner and stored (labopt). History of option chains is not free, so the backtest replays the stored days: it starts short and grows daily.
//   Call wall / put wall = the strike above / below the price with the most call / put gamma (gamma x open interest x 100 x spot² x 1%).
//   Gamma flip = where dealers' net gamma (re-priced at other prices) changes sign. VEX = net vanna exposure (how dealer hedges move when volatility moves).
//   Flow = premium traded since the last read, called a buy when the last trade was at or above the middle of the bid/ask.
const L = require('../lab'), ICT = require('../ict'), P = require('../powell'), G = require('../gex'), db = require('../db');
const R = .04, Q = .013, phi = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI), f2 = x => Number(x).toFixed(2), M$ = x => (x < 0 ? '-$' : '$') + (Math.abs(x) >= 1e6 ? (Math.abs(x) / 1e6).toFixed(1) + 'M' : Math.round(Math.abs(x) / 1e3) + 'k');
const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'application/json' };
const SESS = [[5, 'Last 5 recorded days'], [10, 'Last 10'], [20, 'Last 20'], [60, 'Every recorded day']];

/* ---------- the collector (runner): one snapshot every 5 minutes, 9:25 to 16:05 ET on weekdays ---------- */
let prevVol = null, prevDay = null, lastSnap = 0;
async function snapshot() {
  const r = await fetch('https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json', { headers: UA, signal: AbortSignal.timeout(45e3) }); if (!r.ok) throw new Error('CBOE: ' + r.status);
  const j = (await r.json()).data, spot = Number(j.current_price), now = Date.now(), day = P.et(now / 1000).date, opts = [], byK = new Map(), vol = new Map(); let vex = 0, bull = 0, bear = 0;
  for (const o of j.options || []) { const m = /^[A-Z]{1,5}\d?(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(o.option); if (!m) continue; const exp = `20${m[1]}-${m[2]}-${m[3]}`, call = m[4] === 'C', K = parseInt(m[5], 10) / 1000, oi = +o.open_interest || 0, iv = +o.iv || 0, T = Math.max((G.etToEpoch(exp) - now) / (365.25 * 864e5), 1 / 8766);
    opts.push({ exp, call, K, oi, iv }); vol.set(o.option, +o.volume || 0);
    if (oi > 0 && Math.abs(K / spot - 1) < .07) { const g = (+o.gamma || 0) * oi * 100 * spot * spot * .01, e = byK.get(K) || { K, c: 0, p: 0 }; if (call) e.c += g; else e.p += g; byK.set(K, e); }
    if (oi > 0 && iv > .01 && iv < 3 && T < 1) { const sq = iv * Math.sqrt(T), d1 = (Math.log(spot / K) + (R - Q + iv * iv / 2) * T) / sq, d2 = d1 - sq, vanna = -Math.exp(-Q * T) * phi(d1) * d2 / iv; vex += (call ? 1 : -1) * vanna * oi * 100 * spot * .01; }
    if (prevVol && prevDay === day) { const dv = (+o.volume || 0) - (prevVol.get(o.option) || 0), px = +o.last_trade_price || 0; if (dv > 0 && px > 0) { const prem = dv * px * 100, mid = ((+o.bid || 0) + (+o.ask || 0)) / 2, buy = px >= mid; if (call === buy) bull += prem; else bear += prem; } } }
  const flow = prevVol && prevDay === day; prevVol = vol; prevDay = day; const ks = [...byK.values()], cw = ks.filter(e => e.K >= spot).sort((a, b) => b.c - a.c)[0], pw = ks.filter(e => e.K <= spot).sort((a, b) => b.p - a.p)[0], gx = G.compute({ spot, options: opts, asof: now, source: 'CBOE' }, now);
  return { t: now, day, spot, net: Math.round(gx.net), flip: gx.flip ? +gx.flip.toFixed(2) : null, cw: cw?.K ?? null, pw: pw?.K ?? null, vex: Math.round(vex), bull: flow ? Math.round(bull) : null, bear: flow ? Math.round(bear) : null };
}
async function background() {
  const e = P.et(Date.now() / 1000), dow = new Date(e.date + 'T12:00Z').getUTCDay(); if (dow === 0 || dow === 6 || e.m < 565 || e.m > 965 || Date.now() - lastSnap < 295e3) return; lastSnap = Date.now();
  const s = await snapshot(); await db.q('INSERT INTO labopt (ts, day, data) VALUES ($1,$2,$3) ON CONFLICT (ts) DO NOTHING', [s.t, s.day, JSON.stringify(s)]);
}
const SN = new Map(); // day -> snapshots (cached for closed days)
async function snaps(day) { const today = P.et(Date.now() / 1000).date, h = SN.get(day); if (h && (day !== today || Date.now() - h.at < 6e4)) return h.v;
  const v = (await db.q('SELECT data FROM labopt WHERE day=$1 ORDER BY ts', [day])).map(r => JSON.parse(r.data)); SN.set(day, { at: Date.now(), v }); if (SN.size > 80) SN.delete(SN.keys().next().value); return v; }
const days = async () => (await db.q('SELECT DISTINCT day FROM labopt ORDER BY day')).map(r => r.day);

/* ---------- the factory ---------- */
const KZ = x => x.m >= 600 && x.m < 900, FLAT = x => x.m >= 955;
function opt(def) {
  const s = { kind: 'bars', group: 'Options', syms: ['SPY'], bt: { opts: SESS, def: 60, unit: 'days' }, dataNote: 'CBOE delayed SPY options chain (free, about 15 minutes late), read every 5 minutes by the server; Yahoo Finance 5-minute SPY candles. Trades SPY shares in a simulated account. The backtest replays only the days the server has recorded.', ...def, defaults: { sym: 'SPY', risk: .5, max: 2, ...def.defaults } };
  s.run = (b, ses, k, cfg, sn, upto = Infinity, ext = {}) => {
    const S = ses[k], at = i => { let x = null; for (const z of sn) { if (z.t <= b[i].t + 3e5) x = z; else break; } return x; }, ctx = { b, S, at, sn, cfg, ext, draw: { levels: [], marks: [] } };
    if (!sn.length) return { trades: [], events: [], order: null, pos: null, draw: {}, note: 'No options data recorded for this day yet (the server reads the chain every 5 minutes from 9:25 ET).' };
    const r = L.runBars(b, S.first, Math.min(S.last, upto - 1), { slip: .01, win: def.win || KZ, flat: FLAT, max: cfg.max }, i => def.gen(ctx, i)); return { ...r, draw: ctx.draw, note: ctx.note || '' };
  };
  s.extra = def.extra || (async () => ({}));
  s.backtest = async (cfg, n) => { const b = await L.bars5('SPY', 3e5), ses = ICT.sessions(b), have = new Set(await days()), use = ses.map((x, k) => [x, k]).filter(([x]) => have.has(x.date)).slice(-n), out = [], ext = await s.extra(cfg);
    for (const [x, k] of use) for (const t of s.run(b, ses, k, cfg, await snaps(x.date), Infinity, ext).trades) out.push({ ...t, date: x.date });
    return { sym: 'SPY', from: use[0]?.[0].date, to: use[use.length - 1]?.[0].date, days: use.length, ...L.stats(out, 'SPY'), trades: out.slice(-15).reverse().map(t => ({ date: t.date, dir: t.dir, entry: t.entry, exit: t.exit, r: (t.exit - t.entry) * t.dir / Math.abs(t.entry - t.stop), why: t.why })) }; };
  s.view = async cfg => {
    const b = await L.bars5('SPY', 15e3), ses = ICT.sessions(b, true), k = ses.length - 1, S = ses[k], sn = await snaps(S.date), ext = await s.extra(cfg), r = s.run(b, ses, k, cfg, sn, L.closedUpto(b), ext), today = P.et(Date.now() / 1000).date, z = sn[sn.length - 1];
    const keep = b.filter(x => x.date === S.date && x.m >= 570 && x.m < 960), t0 = keep[0]?.t;
    if (z) { const lv = r.draw.levels; if (z.cw) lv.push({ y: z.cw, name: 'call wall', color: 'var(--down)', t0 }); if (z.pw) lv.push({ y: z.pw, name: 'put wall', color: 'var(--up)', t0 }); if (z.flip) lv.push({ y: z.flip, name: 'gamma flip', color: '#f5a623', t0 }); }
    const status = (z ? `Net gamma ${z.net >= 0 ? 'positive (dealers dampen moves)' : 'negative (dealers amplify moves)'}; call wall ${z.cw ?? '-'}, put wall ${z.pw ?? '-'}, flip ${z.flip ?? '-'}. ` : '') +
      (S.date !== today ? `Market closed. Last session ${S.date}: ${r.trades.length} trade${r.trades.length === 1 ? '' : 's'}.` : r.pos ? `In a ${r.pos.dir === 1 ? 'long' : 'short'} from ${f2(r.pos.entry)}, stop ${f2(r.pos.stop)}${r.pos.target ? ', target ' + f2(r.pos.target) : ''}.` : r.order ? `Armed: ${r.order.dir === 1 ? 'buy' : 'sell'} at the next open. ${r.order.why || ''}` : r.note || def.idle || 'Watching.');
    const panes = def.pane ? [def.pane(keep, sn, ext)].filter(Boolean) : [];
    return { sym: 'SPY', status, last: b[b.length - 1]?.c, t: b[b.length - 1]?.t, bars: keep.map(x => [x.t, x.o, x.h, x.l, x.c, x.v]), draw: r.draw, panes, events: r.events.map(e => ({ t: b[e.i].t, type: e.type, dir: e.dir, p: e.p ?? null, why: e.why || null })),
      pos: r.pos ? { dir: r.pos.dir, entry: r.pos.entry, stop: r.pos.stop, target: r.pos.target, t0: r.pos.entryT } : null, order: r.order ? { dir: r.order.dir, entry: r.order.entry, stop: r.order.stop, target: r.order.target, t0: r.order.armT } : null };
  };
  s.live = async (row, cfg, H) => {
    const today = P.et(Date.now() / 1000).date, b = await L.bars5('SPY', 30e3), ses = ICT.sessions(b, true), k = ses.length - 1, ext = await s.extra(cfg);
    if (ses[k].date === today) { const r = s.run(b, ses, k, cfg, await snaps(today), L.closedUpto(b), ext); await H.sync(row.uid, s.id, cfg, row.paper, L.liveTrades(r, 'SPY', s.id), today, Number(row.since || 0)); }
    for (const t of await db.q("SELECT * FROM labtrades WHERE uid=$1 AND strat=$2 AND status='open' AND day<>$3", [row.uid, s.id, today])) { const ss = ICT.sessions(b), kk = ss.findIndex(x => x.date === t.day);
      if (kk < 0) { await H.closeRow(t, Number(t.entry), 'no data for that day'); continue; } const T = L.liveTrades(s.run(b, ss, kk, cfg, await snaps(t.day), Infinity, ext), 'SPY', s.id).find(x => x.key === t.key);
      await H.closeRow(t, T && T.exit != null ? T.exit : b[ss[kk].last].c, T ? T.why : 'flat at the close', T?.exitT || b[ss[kk].last].t); }
  };
  return s;
}
const RISK = [{ k: 'rr', label: 'Reward to risk', min: 1, max: 4, step: .5, unit: '× reward to risk' }, { k: 'stp', label: 'Stop', min: .1, max: 1, step: .05, unit: '% beyond the level' }];
const mkt = (b, i, dir, stop, rr, why, hold) => { const e = b[i].c, R = Math.abs(e - stop); if (!(R > 0)) return null; return { dir, entry: null, stop: +stop.toFixed(2), target: rr ? +(e + dir * rr * R).toFixed(2) : null, hold, why }; };

/* ---------- 1. Put wall bounce ---------- */
const putwall = opt({ id: 'putwall', name: 'Put Wall', icon: 'lock', blurb: 'Buys SPY when it tags the put wall (the strike with the most put gamma, where dealer hedging tends to support price) and bounces.',
  how: ['Put wall: the strike at or below the price with the most put gamma, from the latest chain read.', 'Signal (10:00 to 15:00 ET): a 5-minute candle trades within 0.15% of the wall, closes above it and closes green.', 'Optional: only while net gamma is positive (dealers dampen moves).', 'Entry at the next open. Stop: the set % below the wall. Target: reward-to-risk multiple. Flat by 15:55.'],
  defaults: { rr: 2, stp: .25, reg: 'on' }, params: RISK, choices: { reg: ['on', 'off'] }, choiceLabels: { reg: 'Only in positive gamma' }, idle: 'Waiting for SPY to tag the put wall and bounce.',
  gen({ b, at, cfg }, i) { const z = at(i), x = b[i]; if (!z?.pw || (cfg.reg === 'on' && z.net < 0)) return null; if (x.l <= z.pw * 1.0015 && x.c > z.pw && x.c > x.o && x.c < z.pw * 1.004) return mkt(b, i, 1, z.pw * (1 - cfg.stp / 100), cfg.rr, `Bounced off the put wall ${z.pw}`); return null; } });
/* ---------- 2. Call wall rejection ---------- */
const callwall = opt({ id: 'callwall', name: 'Call Wall', icon: 'unlock', blurb: 'Sells SPY when it tags the call wall (the strike with the most call gamma, where dealer hedging tends to cap price) and gets rejected.',
  how: ['Call wall: the strike at or above the price with the most call gamma, from the latest chain read.', 'Signal (10:00 to 15:00 ET): a 5-minute candle trades within 0.15% of the wall, closes below it and closes red.', 'Optional: only while net gamma is positive.', 'Entry at the next open (short). Stop: the set % above the wall. Target: reward-to-risk multiple. Flat by 15:55.'],
  defaults: { rr: 2, stp: .25, reg: 'on' }, params: RISK, choices: { reg: ['on', 'off'] }, choiceLabels: { reg: 'Only in positive gamma' }, idle: 'Waiting for SPY to tag the call wall and get rejected.',
  gen({ b, at, cfg }, i) { const z = at(i), x = b[i]; if (!z?.cw || (cfg.reg === 'on' && z.net < 0)) return null; if (x.h >= z.cw * .9985 && x.c < z.cw && x.c < x.o && x.c > z.cw * .996) return mkt(b, i, -1, z.cw * (1 + cfg.stp / 100), cfg.rr, `Rejected at the call wall ${z.cw}`); return null; } });
/* ---------- 3. Gamma flip cross ---------- */
const flip = opt({ id: 'flip', name: 'Gamma Flip', icon: 'arrow', blurb: 'Trades SPY crossing the gamma flip: below it dealers amplify moves (go with the break down), above it they dampen (go with the reclaim).',
  how: ['Gamma flip: the price where dealers\' net gamma changes sign, re-priced from the latest chain read.', 'Short: a 5-minute close below the flip after a close above it. Long: the reverse.', 'Entries 10:00 to 15:00 ET. Stop: the set % on the other side of the flip. Target: reward-to-risk multiple. Flat by 15:55.'],
  defaults: { rr: 2, stp: .15 }, params: RISK, idle: 'Waiting for a close across the gamma flip.',
  gen({ b, at, cfg }, i) { const z = at(i), z0 = at(i - 1); if (!z?.flip || !z0?.flip) return null; const up = b[i - 1].c <= z0.flip && b[i].c > z.flip, dn = b[i - 1].c >= z0.flip && b[i].c < z.flip;
    if (up) return mkt(b, i, 1, z.flip * (1 - cfg.stp / 100), cfg.rr, `Closed back above the gamma flip ${z.flip}`); if (dn) return mkt(b, i, -1, z.flip * (1 + cfg.stp / 100), cfg.rr, `Broke below the gamma flip ${z.flip}`); return null; } });
/* ---------- 4. VEX (vanna) ---------- */
const vexb = opt({ id: 'vex', name: 'VEX Bot', icon: 'spark', blurb: 'Vanna exposure: when volatility (VIX) drops and dealers\' vanna is positive their hedging buys stock, and the reverse. One trade a day, decided at 10:30 ET.',
  how: ['VEX: net vanna exposure of the SPY chain (how much stock dealers buy or sell when implied volatility moves 1 point).', 'At 10:30 ET: VIX down at least the set % since 9:30 and VEX positive → buy. VIX up at least the set % and VEX negative → sell short.', 'Stop: 0.4% (or the set stop ×2). Held to 15:55 (no target).'],
  defaults: { v: 3, stp: .2, max: 1 }, params: [{ k: 'v', label: 'VIX move', min: 1, max: 8, step: .5, unit: '% since 9:30' }, RISK[1]], idle: 'Decides at 10:30 ET from the VIX move and the vanna sign.',
  win: x => x.m >= 625 && x.m < 640, extra: async () => ({ vix: await L.bars5('VIX', 6e4).catch(() => []) }),
  gen({ b, at, cfg, ext }, i) { if (b[i].m !== 625) return null; const z = at(i), v = ext.vix || [], d = b[i].date, o = v.find(x => x.date === d && x.m === 570), n = v.filter(x => x.date === d && x.m <= 625).pop(); if (!z || !o || !n) return null; const ch = (n.c / o.o - 1) * 100;
    if (ch <= -cfg.v && z.vex > 0) return mkt(b, i, 1, b[i].c * (1 - 2 * cfg.stp / 100), 0, `VIX ${ch.toFixed(1)}% since the open and vanna positive (${M$(z.vex)})`); if (ch >= cfg.v && z.vex < 0) return mkt(b, i, -1, b[i].c * (1 + 2 * cfg.stp / 100), 0, `VIX +${ch.toFixed(1)}% and vanna negative (${M$(z.vex)})`); return null; },
  pane: (keep, sn) => sn.length ? { name: 'Vanna exposure (VEX)', short: 'VEX', vals: keep.map(x => { let y = null; for (const z of sn) if (z.t <= x.t + 3e5) y = z.vex; return y; }), color: '#a78bfa', h: 60, fmt: M$ } : null });
/* ---------- 5. Options flow ---------- */
const flowN = (sn, t, mins) => { let bu = 0, be = 0; for (const z of sn) if (z.t <= t + 3e5 && z.t > t + 3e5 - mins * 6e4 && z.bull != null) { bu += z.bull; be += z.bear; } return { bu, be, net: bu - be, r: bu + be ? (bu - be) / (bu + be) : 0 }; };
const oflow = opt({ id: 'oflow', name: 'Options Flow', icon: 'wave', blurb: 'Follows the money in SPY options: when bullish premium (calls bought, puts sold) clearly outweighs bearish premium over the last 30 minutes and price agrees, it joins in.',
  how: ['Every 5 minutes: premium traded since the last read, a buy when the trade was at or above the bid/ask middle. Bullish = calls bought + puts sold; bearish = puts bought + calls sold.', 'Signal (10:00 to 15:00 ET): over the last 30 minutes, (bull - bear) / (bull + bear) above the set imbalance and price above the session VWAP → buy; the mirror → sell short.', 'Stop: the set %. Target: reward-to-risk multiple, at most 1 hour in the trade. Flat by 15:55.'],
  defaults: { imb: .2, rr: 2, stp: .3 }, params: [{ k: 'imb', label: 'Flow imbalance', min: .05, max: .6, step: .05, unit: 'of the premium traded' }, ...RISK], idle: 'Waiting for one-sided options premium that price agrees with.',
  gen({ b, S, sn, cfg }, i) { const f = flowN(sn, b[i].t, 30); if (f.bu + f.be < 5e6) return null; let pv = 0, vv = 0; for (let k = S.first; k <= i; k++) { const tp = (b[k].h + b[k].l + b[k].c) / 3; pv += tp * (b[k].v || 1); vv += b[k].v || 1; } const vw = pv / vv, c = b[i].c;
    if (f.r >= cfg.imb && c > vw) return mkt(b, i, 1, c * (1 - cfg.stp / 100), cfg.rr, `Bullish flow ${M$(f.net)} net (${(f.r * 100).toFixed(0)}%) and above VWAP`, 12); if (f.r <= -cfg.imb && c < vw) return mkt(b, i, -1, c * (1 + cfg.stp / 100), cfg.rr, `Bearish flow ${M$(f.net)} net (${(f.r * 100).toFixed(0)}%) and below VWAP`, 12); return null; },
  pane: (keep, sn) => sn.some(z => z.bull != null) ? { name: 'Net options premium, last 30 min (bullish − bearish)', short: 'Flow', type: 'bars', vals: keep.map(x => flowN(sn, x.t, 30).net), colors: keep.map(x => flowN(sn, x.t, 30).net >= 0 ? 'rgba(48,209,88,.7)' : 'rgba(255,69,58,.7)'), h: 70, fmt: M$ } : null });

module.exports = { STRATS: [putwall, callwall, flip, vexb, oflow], background, _t: { snapshot, snaps, flowN } };
