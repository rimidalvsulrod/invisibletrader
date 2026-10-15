// Your own bots: a no-code strategy (indicator conditions for the entry and the exit, a stop and a target), a backtest on real candles,
// and a 24/7 PAPER bot the runner trades with exactly the same rules. Indicators come from the shared library (public/indicators.js).
const crypto = require('crypto'), db = require('./db'), { INDS } = require('../../public/indicators.js');
const START = 10000, SLIP = .0003, TFSEC = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
const err = (s, m) => Object.assign(new Error(m), { status: s });
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const OPS = ['gt', 'lt', 'xa', 'xb'];
// an operand: "price:c" (o h l c v), "num:30", "ind:rsi" or "ind:bb.u" (indicator key, optional output id), optionally "ind:ema9@n=12" to change a parameter
function series(B, spec, cache) {
  if (cache.has(spec)) return cache.get(spec); let v;
  const [k, rest = ''] = spec.split(':');
  if (k === 'num') v = B.map(() => +rest);
  else if (k === 'price') { const f = 'ohlcv'.includes(rest) && rest ? rest : 'c'; v = B.map(b => b[f]); }
  else if (k === 'ind') { const [main, prm = ''] = rest.split('@'), [key, out] = main.split('.'), D = INDS[key]; if (!D || D.bot || key === 'vp') throw err(400, 'unknown indicator ' + key);
    const P = {}; for (const [n, , d] of D.p) P[n] = d; for (const kv of prm.split(',').filter(Boolean)) { const [n, x] = kv.split('='); if (n in P && isFinite(+x)) P[n] = +x; }
    const outs = D.run(B, B.map(b => b.c), P, { tf: '5m' }), o = (out && outs.find(x => x.id === out)) || outs.find(x => !x.hist) || outs[0];
    v = o ? o.v.map(x => (x && typeof x === 'object' ? x.v : x)) : B.map(() => null);
    if (key === 'st' && !out) { const u = outs.find(x => x.id === 'u').v, dn = outs.find(x => x.id === 'd').v; v = u.map((x, i) => x ?? dn[i]); } } // Supertrend as one line (it flips sides)
  else throw err(400, 'bad operand ' + spec);
  cache.set(spec, v); return v;
}
const test = (c, i, cache, B) => { const a = series(B, c.a, cache), b = series(B, c.b, cache), x = a[i], y = b[i], px = a[i - 1], py = b[i - 1]; if (x == null || y == null || !isFinite(x) || !isFinite(y)) return false;
  if (c.op === 'gt') return x > y; if (c.op === 'lt') return x < y; if (px == null || py == null) return false; if (c.op === 'xa') return px <= py && x > y; if (c.op === 'xb') return px >= py && x < y; return false; };
const all = (L, i, cache, B) => L.length > 0 && L.every(c => test(c, i, cache, B));
function norm(c) { // validate a strategy from the page
  const cond = L => (Array.isArray(L) ? L : []).slice(0, 8).map(x => ({ a: String(x.a || ''), op: OPS.includes(x.op) ? x.op : 'gt', b: String(x.b || '') })).filter(x => /^(price|num|ind):/.test(x.a) && /^(price|num|ind):/.test(x.b));
  const n = (v, lo, hi, d) => Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : d;
  const s = { name: String(c.name || 'My bot').slice(0, 40), sym: String(c.sym || 'SPY').toUpperCase().slice(0, 16), tf: TFSEC[c.tf] ? c.tf : '15m', side: ['long', 'short'].includes(c.side) ? c.side : 'long',
    entry: cond(c.entry), exit: cond(c.exit), stop: n(c.stop, 0, 50, 2), target: n(c.target, 0, 200, 4), risk: n(c.risk, .1, 100, 10), ext: !!c.ext };
  if (!s.entry.length) throw err(400, 'Add at least one entry condition'); return s;
}
// one run of the rules over candles: the same loop is the backtest and the live bot
function run(B, s, upto = B.length) {
  const cache = new Map(), d = s.side === 'short' ? -1 : 1, trades = []; let pos = null, pend = null, eq = START, peak = START, dd = 0; const curve = [];
  for (let i = 1; i < upto; i++) { const b = B[i];
    if (pend && !pos) { const e = b.o * (1 + d * SLIP), qty = (eq * s.risk / 100) / e; pos = { dir: d, entry: e, qty, t: b.t, i, stop: s.stop ? e * (1 - d * s.stop / 100) : null, tp: s.target ? e * (1 + d * s.target / 100) : null, why: pend }; pend = null; }
    if (pos) { let x = null, why = '';
      if (pos.stop != null && (d === 1 ? b.l <= pos.stop : b.h >= pos.stop)) { x = d === 1 ? Math.min(b.o, pos.stop) : Math.max(b.o, pos.stop); why = 'stop'; }
      else if (pos.tp != null && (d === 1 ? b.h >= pos.tp : b.l <= pos.tp) && i > pos.i) { x = pos.tp; why = 'target'; }
      else if (s.exit.length && pos.xit) { x = b.o; why = 'exit rule'; }
      if (x != null) { const px = x * (1 - d * SLIP), pnl = (px - pos.entry) * d * pos.qty; eq += pnl; trades.push({ ...pos, exit: px, exitT: b.t, pnl, why }); pos = null; }
      else if (s.exit.length && all(s.exit, i, cache, B)) pos.xit = true; }
    if (!pos && !pend && i < upto - 1 && all(s.entry, i, cache, B)) pend = s.entry.map(c => `${c.a} ${c.op} ${c.b}`).join(' and ');
    if (!pos && !pend && i === upto - 1 && all(s.entry, i, cache, B)) pend = 'signal';
    peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); if (i % Math.max(1, Math.floor(upto / 300)) === 0) curve.push([b.t, eq]); }
  return { trades, pos, pend, eq, dd, curve };
}
function stats(r) { const t = r.trades, w = t.filter(x => x.pnl > 0), gw = w.reduce((a, x) => a + x.pnl, 0), gl = -t.filter(x => x.pnl < 0).reduce((a, x) => a + x.pnl, 0);
  return { n: t.length, win: t.length ? w.length / t.length : 0, net: r.eq - START, netPct: (r.eq / START - 1) * 100, pf: gl ? gw / gl : gw ? null : 0, maxDD: r.dd * 100, avg: t.length ? (r.eq - START) / t.length : 0 }; }
async function bars(s) { const MT = require('./manual'), d = await MT.candles(s.sym, s.tf, s.ext); return { d, B: d.bars.map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })) }; }
async function backtest(cfg) { const s = norm(cfg), { d, B } = await bars(s); if (B.length < 60) throw err(400, 'Not enough candles for ' + s.sym);
  const r = run(B, s); return { sym: d.sym, name: d.name, tf: s.tf, from: B[0].t, to: B[B.length - 1].t, bars: B.length, ...stats(r), curve: r.curve, trades: r.trades.slice(-200).map(t => ({ dir: t.dir, entry: t.entry, exit: t.exit, t0: t.t, t1: t.exitT, pnl: t.pnl, why: t.why })),
    note: 'Backtest on ' + B.length + ' candles with ' + (SLIP * 100).toFixed(2) + '% slippage each way. Past results do not promise future ones.' }; }
// ---------- saved bots ----------
const row2 = r => ({ id: r.id, cfg: J(r.cfg, {}), enabled: r.enabled, paper: Number(r.paper), state: J(r.state, {}), created: Number(r.created) });
async function list(uid) { const L = (await db.q('SELECT * FROM ubot WHERE uid=$1 ORDER BY created', [uid])).map(row2);
  for (const b of L) { const s = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w FROM ubtrades WHERE uid=$1 AND bot=$2 AND status='closed'", [uid, b.id]);
    Object.assign(b, { n: s.n, won: s.w || 0, pnl: Number(s.pnl), balance: b.paper + Number(s.pnl) }); } return L; }
async function save(uid, body) { const s = norm(body.cfg || {}), id = body.id ? String(body.id) : crypto.randomBytes(6).toString('hex'), now = Date.now();
  const ex = await db.one('SELECT id FROM ubot WHERE uid=$1 AND id=$2', [uid, id]);
  if (ex) await db.q('UPDATE ubot SET cfg=$3, updated=$4 WHERE uid=$1 AND id=$2', [uid, id, JSON.stringify(s), now]);
  else { const n = (await db.one('SELECT count(*)::int AS n FROM ubot WHERE uid=$1', [uid])).n; if (n >= 20) throw err(400, 'Up to 20 bots each'); await db.q('INSERT INTO ubot (id, uid, cfg, enabled, paper, state, created, updated) VALUES ($1,$2,$3,false,$4,$5,$6,$6)', [id, uid, JSON.stringify(s), START, '{}', now]); }
  return { ok: true, id }; }
async function trades(uid, id) { return (await db.q('SELECT * FROM ubtrades WHERE uid=$1 AND bot=$2 ORDER BY ts DESC LIMIT 100', [uid, id])).map(t => ({ ...t, ts: Number(t.ts), exitts: t.exitts == null ? null : Number(t.exitts) })); }
async function api(uid, op, b, q) {
  switch (op) {
    case 'list': return { bots: await list(uid) };
    case 'bt': return backtest(b.cfg || {});
    case 'save': return save(uid, b);
    case 'del': await db.q('DELETE FROM ubot WHERE uid=$1 AND id=$2', [uid, String(b.id)]); await db.q('DELETE FROM ubtrades WHERE uid=$1 AND bot=$2', [uid, String(b.id)]); return { ok: true };
    case 'on': await db.q('UPDATE ubot SET enabled=$3, updated=$4 WHERE uid=$1 AND id=$2', [uid, String(b.id), !!b.on, Date.now()]); return { ok: true };
    case 'trades': return { trades: await trades(uid, String(q.id || b.id)) };
    default: throw err(400, 'unknown op');
  }
}
// ---------- the runner: every 30 seconds, each bot that is on reads its closed candles and trades on paper ----------
let busy = false, last = 0;
async function tick() { if (busy || Date.now() - last < 3e4) return; busy = true; last = Date.now();
  try { const MT = require('./manual');
    for (const r of await db.q('SELECT * FROM ubot WHERE enabled=true')) { try { const b = row2(r), s = b.cfg, st = b.state || {}, { B } = await bars(s), sec = TFSEC[s.tf], now = Date.now() / 1000;
      const upto = B.findIndex(x => x.t + sec > now); const n = upto < 0 ? B.length : upto; if (n < 60) continue; const lastT = B[n - 1].t; if (st.lastT === lastT) continue; // act once per finished candle
      const cache = new Map(), d = s.side === 'short' ? -1 : 1, px = await MT.quote(s.sym), open = await db.one("SELECT * FROM ubtrades WHERE uid=$1 AND bot=$2 AND status='open'", [r.uid, b.id]);
      if (open) { const e = Number(open.entry), q = Number(open.qty), stop = open.stop == null ? null : Number(open.stop), tp = open.tp == null ? null : Number(open.tp), hi = B[n - 1].h, lo = B[n - 1].l;
        let x = null, why = ''; if (stop != null && (d === 1 ? lo <= stop || px <= stop : hi >= stop || px >= stop)) { x = stop; why = 'stop'; } else if (tp != null && (d === 1 ? hi >= tp || px >= tp : lo <= tp || px <= tp)) { x = tp; why = 'target'; } else if (s.exit.length && all(s.exit, n - 1, cache, B)) { x = px; why = 'exit rule'; }
        if (x != null) { const xp = x * (1 - d * SLIP), pnl = (xp - e) * d * q; await db.q("UPDATE ubtrades SET status='closed', exitp=$3, pnl=$4, reason=$5, exitts=$6 WHERE uid=$1 AND id=$2", [r.uid, open.id, xp, pnl, why, Date.now()]); } }
      else if (all(s.entry, n - 1, cache, B)) { const bal = b.paper + Number((await db.one("SELECT coalesce(sum(pnl),0) AS p FROM ubtrades WHERE uid=$1 AND bot=$2 AND status='closed'", [r.uid, b.id])).p), e = px * (1 + d * SLIP), qty = (bal * s.risk / 100) / e;
        await db.q("INSERT INTO ubtrades (id, uid, bot, ts, sym, dir, qty, entry, stop, tp, status, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11)", [crypto.randomBytes(8).toString('hex'), r.uid, b.id, Date.now(), s.sym, d === 1 ? 'long' : 'short', qty, e, s.stop ? e * (1 - d * s.stop / 100) : null, s.target ? e * (1 + d * s.target / 100) : null, 'entry rule']); }
      await db.q('UPDATE ubot SET state=$3 WHERE uid=$1 AND id=$2', [r.uid, b.id, JSON.stringify({ ...st, lastT, at: Date.now(), px })]); } catch (e) { console.error('userbot', r.id, e.message); } } }
  finally { busy = false; } }
module.exports = { api, tick, run, norm, backtest, list, START };
