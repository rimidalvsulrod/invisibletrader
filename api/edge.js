// Edge Lab controls for the signed-in user. Paper trading only.
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), E = require('./_lib/edge'), S = require('./_lib/settings'), A = require('./_lib/accounts');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  if (op === 'live') return { live: J(await S.get('edgelive'), null), now: Date.now() };
  const { row, cfg } = await E.open(uid);
  switch (op) {
    case 'state': {
      const [trades, st, live] = await Promise.all([db.q('SELECT * FROM edgetrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]), E.stats(uid), S.get('edgelive')]);
      return { enabled: row.enabled, cfg, paper: { balance: row.paper, start: row.paperstart }, stats: st, live: J(live, null), now: Date.now(),
        trades: trades.map(t => ({ ...t, legs: J(t.legs, []), ts: Number(t.ts), gs: Number(t.gs), settledts: t.settledts == null ? null : Number(t.settledts) })) };
    }
    case 'cfg': { const c = body.cfg || {}; const next = { ladder: clamp(c.ladder ?? cfg.ladder, .5, 25, E.DEF.ladder), set: clamp(c.set ?? cfg.set, .5, 25, E.DEF.set), dog: clamp(c.dog ?? cfg.dog, .1, 5, E.DEF.dog) };
      await db.q('UPDATE edgebot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': await db.q('UPDATE edgebot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE edgebot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'reset': { const amt = clamp(body.amount, 10, 1e7, 1000);
      await db.q('DELETE FROM edgetrades WHERE uid=$1', [uid]); await db.q('UPDATE edgebot SET paper=$2, paperstart=$2, updated=$3 WHERE uid=$1', [uid, amt, Date.now()]); return { ok: true }; }
    default: throw err(400, 'unknown op');
  }
});
