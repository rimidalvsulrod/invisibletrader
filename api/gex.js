// GEX Levels tab: the latest gamma-exposure levels for SPY, the paper-signal log, and the on/off switch for the collector (runner).
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), G = require('./_lib/gex'), A = require('./_lib/accounts');
module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  switch (op) {
    case 'state': {
      let snap = null, snapError = null, bars = []; try { snap = await G.snapshot(); } catch (e) { snapError = e.message; }
      try { const all = (await G.spyBars()).filter(b => b.m >= 570 && b.m < 960), days = [...new Set(all.map(b => b.date))].slice(-2); bars = all.filter(b => days.includes(b.date)).map(b => [b.t, b.o, b.h, b.l, b.c]); } catch (_) {}
      const on = await db.one('SELECT enabled FROM gexbot WHERE uid=$1', [uid]);
      return { snap, snapError, bars, log: await G.log(), stats: await G.stats(), enabled: !!on?.enabled, sig: G.SIG, now: Date.now() };
    }
    case 'start': case 'stop': await db.q('INSERT INTO gexbot (uid, enabled, updated) VALUES ($1,$2,$3) ON CONFLICT (uid) DO UPDATE SET enabled=$2, updated=$3', [uid, op === 'start', Date.now()]); return { ok: true };
    default: throw err(400, 'unknown op');
  }
});
