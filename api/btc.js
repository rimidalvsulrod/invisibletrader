// BTC Up or Down bot controls for the signed-in user. Paper by default; live trades their own Polymarket US account.
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), B = require('./_lib/btc'), S = require('./_lib/settings'), A = require('./_lib/accounts');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;

module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  if (op === 'live') return { live: J(await S.get('btclive'), null), now: Date.now() };
  const { row, cfg } = await B.open(uid);
  switch (op) {
    case 'state': {
      const [trades, paper, live, creds] = await Promise.all([
        db.q('SELECT ts, slug, tf, side, price, qty, fee, fair, edge, s0, s, secs, mode, status, pnl FROM btctrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]),
        B.stats(uid, 'paper'), B.stats(uid, 'live'), S.getCreds(uid).catch(() => null)]);
      return { enabled: row.enabled, mode: row.mode, cfg, paper: { balance: row.paper, start: row.paperstart, ...paper }, live, keys: !!creds, trades: trades.map(t => ({ ...t, ts: Number(t.ts) })), btclive: J(await S.get('btclive'), null), now: Date.now() };
    }
    case 'cfg': {
      const c = body.cfg || {}, tfs = Array.isArray(c.tfs) ? c.tfs.filter(x => B.TF[x]) : cfg.tfs;
      const next = { usd: clamp(c.usd ?? cfg.usd, 1, 10000, B.DEF.usd), minEdge: clamp(c.minEdge ?? cfg.minEdge, 1, 50, B.DEF.minEdge), maxLoss: clamp(c.maxLoss ?? cfg.maxLoss, 1, 1e6, B.DEF.maxLoss), tfs: tfs.length ? tfs : cfg.tfs };
      await db.q('UPDATE btcbot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next };
    }
    case 'start': if (row.mode === 'live' && !(await S.getCreds(uid).catch(() => null))) throw err(400, 'Connect Polymarket US on the Auto page first, or use paper mode');
      await db.q('UPDATE btcbot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE btcbot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'mode': {
      const mode = body.mode === 'live' ? 'live' : 'paper';
      if (mode === 'live') { if (!(await S.getCreds(uid).catch(() => null))) throw err(400, 'Connect Polymarket US on the Auto page first'); if (process.env.TRADING_DISABLED) throw err(400, 'Trading is disabled on the server'); }
      await db.q('UPDATE btcbot SET mode=$2, enabled=false, updated=$3 WHERE uid=$1', [uid, mode, Date.now()]); return { ok: true, mode };
    }
    case 'reset': { // new paper account: fresh balance, paper history cleared
      const amt = clamp(body.amount, 10, 1e6, 100);
      await db.q("DELETE FROM btctrades WHERE uid=$1 AND mode='paper'", [uid]); await db.q('UPDATE btcbot SET paper=$2, paperstart=$2, updated=$3 WHERE uid=$1', [uid, amt, Date.now()]); return { ok: true };
    }
    default: throw err(400, 'unknown op');
  }
});
