// Built-in paper trading. A simulated account that follows the real broker's balance: its equity is the broker's equity plus the simulated
// profit and loss. The bots use it automatically for anything the real broker cannot trade (futures, shorts the broker refuses,
// symbols it won't list). Nothing here ever sends an order to a broker.
//   Fills: stocks at the live price +/- 2 basis points; futures at the live price +/- 1 tick.
//   Brackets: entry fills now; the stop and the target are checked every few seconds (futures: against each 5-minute candle's high and low).
const crypto = require('crypto'), db = require('./db');
const FUT = { NQ: { mult: 20, tick: .25, micro: 'MNQ' }, MNQ: { mult: 2, tick: .25 }, ES: { mult: 50, tick: .25, micro: 'MES' }, MES: { mult: 5, tick: .25 } };
const isFut = s => !!FUT[s], mult = s => FUT[s]?.mult || 1, tick = s => FUT[s]?.tick || .01, SLIP = .0002;
const id = () => 'paper:' + crypto.randomBytes(6).toString('hex'), bad = (m, status = 400) => Object.assign(new Error(m), { status });
const src = { stock: async () => { throw bad('no stock price source'); }, futures: null }; // set by alpaca.js: stock(uid, sym) -> last price. futures (tests only): sym -> { px, day, cs }
const configure = o => Object.assign(src, o);

/* ---------- prices ---------- */
async function futuresLast(sym) { if (src.futures) return src.futures(sym); const P = require('./powell'), d = await P.candles(sym, 5e3), day = [...d.days.keys()].sort().pop(), cs = d.days.get(day); if (!cs?.length) throw bad('no futures price for ' + sym, 502); return { px: cs[cs.length - 1].c, day, cs }; }
const price = async (uid, sym) => isFut(sym) ? (await futuresLast(sym)).px : Number(await src.stock(uid, sym));
const fill = (sym, side, px) => isFut(sym) ? px + (side === 'buy' ? 1 : -1) * tick(sym) : px * (1 + (side === 'buy' ? 1 : -1) * SLIP);

/* ---------- ledger ---------- */
async function bumpCash(uid, dCash, dReal) { await db.q('INSERT INTO pcash (uid, delta, realized, updated) VALUES ($1,0,0,$2) ON CONFLICT (uid) DO NOTHING', [uid, Date.now()]); await db.q('UPDATE pcash SET delta=delta+$2, realized=realized+$3, updated=$4 WHERE uid=$1', [uid, dCash, dReal, Date.now()]); }
async function apply(uid, sym, side, qty, px) { // one fill moves the position and the cash; returns the profit it realised
  const m = mult(sym), dq = side === 'buy' ? qty : -qty, p = await db.one('SELECT * FROM ppos WHERE uid=$1 AND sym=$2', [uid, sym]); let q = p ? Number(p.qty) : 0, avg = p ? Number(p.avg) : 0, real = 0;
  if (q === 0 || Math.sign(q) === Math.sign(dq)) { avg = (Math.abs(q) * avg + qty * px) / (Math.abs(q) + qty); q += dq; }
  else { const closing = Math.min(Math.abs(q), qty); real = closing * (px - avg) * Math.sign(q) * m; q += dq; if (Math.abs(q) < 1e-9) q = 0; else if (Math.sign(q) === Math.sign(dq)) avg = px; } // reduced, closed or flipped
  await bumpCash(uid, isFut(sym) ? real : -dq * px * m + 0, real); // futures only move cash when profit is realised; stocks move the notional
  if (q === 0) await db.q('DELETE FROM ppos WHERE uid=$1 AND sym=$2', [uid, sym]); else await db.q('INSERT INTO ppos (uid, sym, qty, avg) VALUES ($1,$2,$3,$4) ON CONFLICT (uid, sym) DO UPDATE SET qty=$3, avg=$4', [uid, sym, q, avg]);
  return real;
}
const rec = (o) => db.q('INSERT INTO pord (id, uid, grp, ts, sym, side, qty, kind, px, fpx, status, fts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [o.id, o.uid, o.grp || null, Date.now(), o.sym, o.side, o.qty, o.kind, o.px ?? null, o.fpx ?? null, o.status, o.status === 'filled' ? Date.now() : null]);

async function market(c, side, sym, qty, grp) {
  qty = Number(qty); if (!(qty > 0)) throw bad('paper: quantity must be positive'); if (isFut(sym)) qty = Math.floor(qty); if (isFut(sym) && qty < 1) throw bad('paper: whole contracts only');
  const px = await price(c.uid, sym); if (!(px > 0)) throw bad('paper: no price for ' + sym, 502);
  const f = fill(sym, side, px), oid = id();
  await apply(c.uid, sym, side, qty, f); await rec({ id: oid, uid: c.uid, grp: grp || oid, sym, side, qty, kind: 'market', fpx: f, status: 'filled' });
  return { id: oid, status: 'filled', filled_qty: String(qty), filled_avg_price: String(f) };
}
async function bracket(c, o) { // entry now + take-profit + stop, linked
  const side = o.side, out = side === 'buy' ? 'sell' : 'buy', m = await market(c, side, o.symbol, o.qty), tp = id(), sl = id();
  await rec({ id: tp, uid: c.uid, grp: m.id, sym: o.symbol, side: out, qty: Number(o.qty), kind: 'tp', px: o.tp, status: 'open' }); await rec({ id: sl, uid: c.uid, grp: m.id, sym: o.symbol, side: out, qty: Number(o.qty), kind: 'sl', px: o.sl, status: 'open' });
  return { ...m, id: [m.id, tp, sl].join('|') };
}
const row = oid => db.one('SELECT * FROM pord WHERE id=$1', [oid]);
const view = r => ({ id: r.id, status: r.status === 'open' ? 'new' : r.status, filled_qty: r.status === 'filled' ? String(r.qty) : '0', filled_avg_price: r.fpx != null ? String(r.fpx) : '' });
const order = async (c, oid) => { const r = await row(String(oid).split('|')[0]); if (!r) throw bad('paper order not found', 404); return view(r); };
async function orderNested(c, oid) { const [m, tp, sl] = String(oid).split('|'), top = await order(c, m); if (!tp) return top;
  const [a, b] = await Promise.all([row(tp), row(sl)]); return { ...top, id: oid, legs: [{ id: tp, type: 'limit', status: view(a).status, filled_avg_price: view(a).filled_avg_price }, { id: sl, type: 'stop', status: view(b).status, filled_avg_price: view(b).filled_avg_price }] }; }
const cancel = async (c, oid) => { await db.q("UPDATE pord SET status='canceled' WHERE id=$1 AND status='open'", [String(oid).split('|')[0]]); return {}; };

/* ---------- account view ---------- */
const pos = async (uid, sym) => { const p = await db.one('SELECT * FROM ppos WHERE uid=$1 AND sym=$2', [uid, sym]); return p ? { qty: Number(p.qty), avg: Number(p.avg) } : null; };
async function positions(uid) { const rows = await db.q('SELECT * FROM ppos WHERE uid=$1', [uid]), out = [];
  for (const p of rows) { let px = Number(p.avg); try { px = await price(uid, p.sym); } catch (_) {} out.push({ symbol: p.sym, qty: String(p.qty), current_price: String(px), avg_entry_price: String(p.avg), paper: true }); } return out; }
async function overlay(uid) { // what the paper account adds to the broker's balance
  const c = await db.one('SELECT * FROM pcash WHERE uid=$1', [uid]), delta = c ? Number(c.delta) : 0; let value = 0, open = 0;
  for (const p of await positions(uid)) { const q = Number(p.qty), px = Number(p.current_price), avg = Number(p.avg_entry_price); value += isFut(p.symbol) ? q * (px - avg) * mult(p.symbol) : q * px; open++; }
  return { delta, value, total: delta + value, realized: c ? Number(c.realized) : 0, open };
}
const reset = async uid => { for (const t of ['ppos', 'pord', 'pcash']) await db.q(`DELETE FROM ${t} WHERE uid=$1`, [uid]); };

/* ---------- stops and targets (runner, every few seconds) ---------- */
async function settle() {
  const legs = await db.q("SELECT * FROM pord WHERE status='open' AND kind IN ('tp','sl') ORDER BY uid, ts"); if (!legs.length) return 0; let n = 0; const cache = new Map();
  for (const l of legs) { try {
    const cur = await row(l.id); if (!cur || cur.status !== 'open') continue; // a sibling may have just filled
    const master = await row(l.grp), sell = l.side === 'sell', long = sell; // closing sell = a long position
    let hit = null, ref;
    if (isFut(l.sym)) { const k = l.sym; if (!cache.has(k)) cache.set(k, await futuresLast(k)); const { day, cs } = cache.get(k), P = require('./powell'), e = P.et(master.fts / 1000), after = cs.filter(x => day === e.date ? x.m > e.m : true); // candles after the entry candle
      const hi = Math.max(...after.map(x => x.h), -Infinity), lo = Math.min(...after.map(x => x.l), Infinity); ref = cs[cs.length - 1].c;
      const stopHit = l.kind === 'sl' && (long ? lo <= l.px : hi >= l.px), tpHit = l.kind === 'tp' && (long ? hi >= l.px : lo <= l.px); if (stopHit || tpHit) hit = l.px;
      // if one candle touched both, the stop wins (same rule as the backtest)
      if (tpHit) { const sib = await db.one("SELECT * FROM pord WHERE grp=$1 AND kind='sl' AND status='open'", [l.grp]); if (sib && (long ? lo <= sib.px : hi >= sib.px)) hit = null; } }
    else { ref = await price(l.uid, l.sym); const stop = l.kind === 'sl'; if (stop ? (long ? ref <= l.px : ref >= l.px) : (long ? ref >= l.px : ref <= l.px)) hit = stop ? (long ? Math.min(l.px, ref) : Math.max(l.px, ref)) : l.px; }
    if (hit == null) continue;
    const p = await pos(l.uid, l.sym); const q = p ? Math.min(Math.abs(p.qty), l.qty) : 0;
    if (q > 0) await apply(l.uid, l.sym, l.side, q, hit);
    await db.q("UPDATE pord SET status='filled', fpx=$2, fts=$3 WHERE id=$1 AND status='open'", [l.id, hit, Date.now()]);
    await db.q("UPDATE pord SET status='canceled' WHERE grp=$1 AND id<>$2 AND status='open'", [l.grp, l.id]); n++;
  } catch (e) { console.error('paper settle', l.sym, e.message); } }
  return n;
}
module.exports = { FUT, isFut, mult, tick, configure, price, market, bracket, order, orderNested, cancel, positions, pos, overlay, reset, settle, futuresLast };
