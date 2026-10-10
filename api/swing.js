// Swing Trader controls for the signed-in user. It trades through the Alpaca account already connected in Newsflash.
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), W = require('./_lib/swing'), AL = require('./_lib/alpaca'), S = require('./_lib/settings'), A = require('./_lib/accounts');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  if (op === 'live') return { live: J(await S.get('swinglive'), null) };
  const { row, cfg } = await W.open(uid);
  switch (op) {
    case 'state': {
      const c = await AL.getCreds(uid).catch(() => null); let account = null, accountError = null, pos = [];
      if (c) try { const a = await AL.account(c); account = { equity: +a.equity, cash: +a.cash, day: +a.equity - +a.last_equity, paper: c.paper }; pos = await AL.positions(c).catch(() => []); } catch (e) { accountError = e.message; }
      const px = new Map((Array.isArray(pos) ? pos : []).map(p => [p.symbol, Number(p.current_price)]));
      const trades = (await db.q('SELECT ts, sym, why, notional, qty, entry, stop, status, exitp, pnl, reason FROM swingtrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]))
        .map(t => ({ ...t, last: t.status === 'open' ? px.get(t.sym) ?? null : null }));
      return { enabled: row.enabled, cfg, connected: !!c, paper: c ? c.paper : true, account, accountError, stats: await W.stats(uid), trades, rules: { rsi: W.R.rsiBuy, trend: W.R.trend, exitMA: W.R.exitMA, maxDays: W.R.maxDays, stop: W.R.stop * 100, universe: W.UNIVERSE.length }, live: J(await S.get('swinglive'), null) };
    }
    case 'cfg': { const c = body.cfg || {}, next = { pct: clamp(c.pct ?? cfg.pct, 1, 20, W.DEF.pct), max: Math.round(clamp(c.max ?? cfg.max, 1, 10, W.DEF.max)) };
      await db.q('UPDATE sbot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': if (!(await AL.getCreds(uid).catch(() => null))) throw err(400, 'Connect Alpaca first (in the Newsflash tab)');
      await db.q('UPDATE sbot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE sbot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    default: throw err(400, 'unknown op');
  }
});
