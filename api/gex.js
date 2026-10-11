// GEX Levels tab: the latest gamma-exposure levels for SPY, the signal log, the paper account (balance, risk dials, trades) and the on/off switch (runner).
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), G = require('./_lib/gex'), AL = require('./_lib/alpaca'), A = require('./_lib/accounts');
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op, { row, cfg } = await G.open(uid);
  switch (op) {
    case 'state': {
      let snap = null, snapError = null, bars = []; try { snap = await G.snapshot(); } catch (e) { snapError = e.message; }
      try { const all = (await G.spyBars()).filter(b => b.m >= 570 && b.m < 960), days = [...new Set(all.map(b => b.date))].slice(-2); bars = all.filter(b => days.includes(b.date)).map(b => [b.t, b.o, b.h, b.l, b.c]); } catch (e) { snapError = snapError || e.message; }
      const c = await AL.getCreds(uid).catch(() => null); let account = null, accountError = null; if (c) try { const a = await AL.account(c); account = { equity: +a.equity, cash: +a.cash }; } catch (e) { accountError = e.message; }
      const trades = (await db.q('SELECT id, sig, ts, day, dir, qty, entry, stop, tp, status, exitp, pnl, reason, exitts FROM gextrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid])).map(t => ({ ...t, ts: Number(t.ts), exitts: t.exitts != null ? Number(t.exitts) : null }));
      return { snap, snapError, bars, log: await G.log(), stats: await G.stats(), enabled: !!row.enabled, cfg, connected: !!c, account, accountError, trades, tstats: await G.tstats(uid), sig: G.SIG, now: Date.now() };
    }
    case 'cfg': { const c = body.cfg || {}, next = { risk: clamp(c.risk ?? cfg.risk, .1, 2, G.DEF.risk), max: clamp(c.max ?? cfg.max, 5, 100, G.DEF.max), per: Math.round(clamp(c.per ?? cfg.per, 1, 6, G.DEF.per)) };
      await db.q('UPDATE gexbot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': if (!(await AL.getCreds(uid).catch(() => null))) throw err(400, 'Connect Alpaca first (in the Newsflash tab)'); await db.q('UPDATE gexbot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE gexbot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    default: throw err(400, 'unknown op');
  }
});
