// Newsflash controls for the signed-in user: connect Alpaca, on/off, trade size, trades and the live headline feed.
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), N = require('./_lib/news'), AL = require('./_lib/alpaca'), S = require('./_lib/settings'), A = require('./_lib/accounts');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  if (op === 'live') return { live: J(await S.get('newslive'), null) };
  const { row, cfg } = await N.open(uid);
  switch (op) {
    case 'state': {
      const c = await AL.getCreds(uid).catch(() => null); let account = null, accountError = null;
      if (c) try { const a = await AL.account(c); account = { equity: +a.equity, cash: +a.cash, day: +a.equity - +a.last_equity, paper: c.paper }; } catch (e) { accountError = e.message; }
      const trades = await db.q('SELECT ts, sym, headline, url, score, notional, qty, entry, exitp, status, pnl, reason FROM ntrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]);
      const st = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl),0) AS pnl, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<=0 THEN 1 ELSE 0 END)::int AS l FROM ntrades WHERE uid=$1 AND status='closed' AND pnl IS NOT NULL", [uid]);
      return { enabled: row.enabled, cfg, connected: !!c, key: c ? c.key.slice(0, 6) + '…' : null, paper: c ? c.paper : true, account, accountError, stats: { n: st.n, pnl: Number(st.pnl), won: st.w || 0, lost: st.l || 0 }, trades: trades.map(t => ({ ...t, ts: Number(t.ts) })), live: J(await S.get('newslive'), null), emailCodes: !!(await require('./_lib/mail').configured()) };
    }
    case 'keys': { // connect Alpaca: checked with Alpaca, then confirmed with the emailed code (or your password)
      const c = { key: String(body.key || '').trim(), secret: String(body.secret || '').trim(), paper: body.paper !== false };
      if (!/^[A-Z0-9]{10,40}$/i.test(c.key) || c.secret.length < 10) throw err(400, 'Paste your Alpaca API Key ID and Secret Key');
      let a; try { a = await AL.account(c); } catch (e) { throw err(400, `${e.message}. Check the keys${c.paper ? ' are PAPER keys' : ' are LIVE keys'}`); }
      if (await AL.getCreds(uid).catch(() => null)) await A.confirm(u, body, 'keys'); // first connect: just paste; replacing saved keys needs confirmation
      await AL.saveCreds(uid, c);
      A.notify(u.email, 'Alpaca connected to your Mimic account', `An Alpaca ${c.paper ? 'paper' : 'LIVE'} account (key ${c.key.slice(0, 6)}…) was connected to Newsflash.`);
      return { ok: true, equity: +a.equity, paper: c.paper };
    }
    case 'keysdel': await A.confirm(u, body, 'keys'); await AL.clearCreds(uid); await db.q('UPDATE nbot SET enabled=false WHERE uid=$1', [uid]); return { ok: true };
    case 'cfg': { const c = body.cfg || {}, next = { size: (c.size ?? cfg.size) === 'usd' ? 'usd' : 'pct', pct: clamp(c.pct ?? cfg.pct, .5, 25, N.DEF.pct), usd: clamp(c.usd ?? cfg.usd, 1, 1e6, N.DEF.usd) };
      await db.q('UPDATE nbot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': if (!(await AL.getCreds(uid).catch(() => null))) throw err(400, 'Connect Alpaca first');
      await db.q('UPDATE nbot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE nbot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    default: throw err(400, 'unknown op');
  }
});
