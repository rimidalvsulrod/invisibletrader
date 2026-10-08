// Meme Radar controls for the signed-in user. Paper trading only.
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), M = require('./_lib/meme'), S = require('./_lib/settings'), A = require('./_lib/accounts');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;

module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  if (op === 'live') return { live: J(await S.get('memelive'), null), now: Date.now() };
  const { row, cfg } = await M.open(uid);
  switch (op) {
    case 'state': {
      const [trades, st, live] = await Promise.all([db.q('SELECT * FROM memetrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]), M.stats(uid), S.get('memelive')]);
      return { enabled: row.enabled, cfg, paper: { balance: row.paper, start: row.paperstart, ...st }, live: J(live, null), now: Date.now(), rules: { R: M.R, X: M.X },
        trades: trades.map(t => ({ ...t, value: t.status === 'open' ? Number(t.qty) * Number(t.last) * (1 - M.slip(Number(t.qty) * Number(t.last), Number(t.lastliq) || Number(t.liq))) * (1 - M.FEE) : null, ts: Number(t.ts), exitts: t.exitts == null ? null : Number(t.exitts), lastts: Number(t.lastts) })) };
    }
    case 'cfg': {
      const c = body.cfg || {}, next = { size: (c.size ?? cfg.size) === 'usd' ? 'usd' : 'pct', pct: clamp(c.pct ?? cfg.pct, .5, 25, M.DEF.pct), usd: clamp(c.usd ?? cfg.usd, 1, 10000, M.DEF.usd) };
      await db.q('UPDATE membot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next };
    }
    case 'start': await db.q('UPDATE membot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE membot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'reset': {
      const amt = clamp(body.amount, 10, 1e7, 1000);
      await db.q('DELETE FROM memetrades WHERE uid=$1', [uid]); await db.q('UPDATE membot SET paper=$2, paperstart=$2, updated=$3 WHERE uid=$1', [uid, amt, Date.now()]); return { ok: true };
    }
    default: throw err(400, 'unknown op');
  }
});
