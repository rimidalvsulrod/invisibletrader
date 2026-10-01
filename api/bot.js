// Owner-only bot control + state for the Auto Trader page.
const { handler, err, needOwner } = require('./_lib/util');
const db = require('./_lib/db'), E = require('./_lib/engine'), K = require('./_lib/kalshi');
const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
module.exports = handler(async (req, body, q) => {
  needOwner(req); const op = q.op || body.op;
  if (op === 'state') {
    const s = await E.open(), live = E.liveStatus(s.cfg), logs = await db.q('SELECT entry FROM botlog ORDER BY ts DESC LIMIT 80');
    const follows = await db.q('SELECT wallet, name FROM follows');
    let bal = null, balErr = null; if (s.paper) bal = s.cfg.pbal + s.pnl; else { const b = await K.balance(); b.ok ? bal = b.balance : balErr = b.error; }
    return { enabled: s.row.enabled, cfg: s.cfg, paper: s.paper, why: s.why, live, env: K.creds().env, configured: K.configured(), maxOrderUsd: Number(process.env.MAX_ORDER_USD) || 25,
      balance: bal, balErr, pos: s.pos, pnl: s.pnl, last: s.st.last || null, watching: s.st.watching || 0, follows, log: logs.map(l => E.J(l.entry, {})) };
  }
  if (op === 'cfg') {
    const c = body.cfg || {}, D = E.DEF, cur = (await E.open()).cfg;
    const cfg = { ...cur, paper: c.paper !== undefined ? !!c.paper : cur.paper, liveAck: c.liveAck !== undefined ? !!c.liveAck : cur.liveAck,
      pct: clamp(c.pct ?? cur.pct, 0.5, 50, D.pct), minUsd: clamp(c.minUsd ?? cur.minUsd, 0, 1e7, D.minUsd), maxPrice: clamp(c.maxPrice ?? cur.maxPrice, 1, 99, D.maxPrice),
      slip: clamp(c.slip ?? cur.slip, 0, 20, D.slip), maxUse: clamp(c.maxUse ?? cur.maxUse, 1, 100, D.maxUse), thresh: clamp(c.thresh ?? cur.thresh, 50, 100, D.thresh), pbal: clamp(c.pbal ?? cur.pbal, 10, 1e7, D.pbal) };
    await db.q("UPDATE bot SET cfg=$1 WHERE id='me'", [JSON.stringify(cfg)]); return { ok: true, cfg };
  }
  if (op === 'start') { const s = await E.open(); s.st = { ...s.st, since: Math.floor(Date.now() / 1000) - 30, seen: [], errs: 0 };
    await db.q("UPDATE bot SET enabled=true, state=$1, lock_until=NULL WHERE id='me'", [JSON.stringify(s.st)]); return E.run(); }
  if (op === 'stop') { await db.q("UPDATE bot SET enabled=false WHERE id='me'"); return { ok: true }; }
  if (op === 'runnow') return E.run();
  if (op === 'sell') { await E.manualSell(body.id === 'all' ? 'all' : String(body.id || '')); return { ok: true }; }
  if (op === 'reset') { await db.q("UPDATE bot SET positions='[]', pnl=0 WHERE id='me'"); await db.q('DELETE FROM botlog'); return { ok: true }; }
  if (op === 'clearlog') { await db.q('DELETE FROM botlog'); return { ok: true }; }
  if (op === 'follows') {
    const list = Array.isArray(body.list) ? body.list.filter(f => /^0x[0-9a-fA-F]{40}$/.test(f.wallet)).slice(0, 100) : null; if (!list) throw err(400, 'list required');
    await db.q('DELETE FROM follows'); for (const f of list) await db.q('INSERT INTO follows (wallet, name) VALUES ($1,$2) ON CONFLICT (wallet) DO NOTHING', [f.wallet.toLowerCase(), String(f.name || '').slice(0, 60)]);
    return { ok: true, n: list.length };
  }
  if (op === 'test') { if (!K.configured()) throw err(400, 'Kalshi keys are not set on the server'); const b = await K.balance(); if (!b.ok) throw err(400, `Kalshi said: ${b.error}`); return { ok: true, env: K.creds().env, balance: b.balance }; }
  throw err(400, 'unknown op');
});
