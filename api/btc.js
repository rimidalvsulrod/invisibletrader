// BTC Up or Down bot controls for the signed-in user. Paper by default; live trades their own Polymarket US account.
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), B = require('./_lib/btc'), C = require('./_lib/btccal'), S = require('./_lib/settings'), A = require('./_lib/accounts');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;

module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  if (op === 'live') return { live: J(await S.get('btclive'), null), now: Date.now() };
  if (op === 'chart') { try { return { range: q.range, pts: await B.range(q.range) }; } catch (e) { throw err(e.status || 502, e.message); } } // 1D / 7D price line for the chart
  if (op === 'curve') return { pts: (await db.q('SELECT ts, secs, ask, plb, pcal, z, fav FROM btcobs WHERE slug=$1 ORDER BY ts LIMIT 200', [String(q.slug || '')])).map(r => ({ t: Math.round(Number(r.ts) / 1000), secs: Number(r.secs), ask: Number(r.ask), lb: r.plb == null ? null : Number(r.plb), p: r.pcal == null ? null : Number(r.pcal), z: r.z == null ? null : Number(r.z), fav: r.fav })) }; // what our model and the market said, window by window
  if (op === 'past') { try { return { tf: q.tf, past: await B.past(q.tf) }; } catch (e) { throw err(e.status || 502, e.message); } } // how the last five windows ended
  if (op === 'bt') { // backtest: does the favourite hold as often as the table says (on days it never saw), plus what the recorded Polymarket US quotes would have paid
    const days = [3, 7, 14, 30].includes(Number(body.days)) ? Number(body.days) : 14, st = J(await S.get('btcbt'), null); let wf = st?.byDays?.[days] || null;
    if (!wf) { if (days > 14) throw err(503, 'The 24/7 runner has not finished its history study yet. Try again in a few minutes, or pick 14 days or less.'); try { const M = await C.minutes(days); wf = { '15m': C.walkForward(M, '15m'), '1h': C.walkForward(M, '1h') }; } catch (e) { throw err(502, e.message); } }
    return { days, t: st?.t || Date.now(), wf, recorded: await B.recorded(days), rules: { minEdge: B.MIN_EDGE, minZ: B.MIN_Z, maxPrice: B.MAX_PRICE, sanity: B.SANITY } };
  }
  const { row, cfg } = await B.open(uid);
  switch (op) {
    case 'state': {
      const [trades, paper, live, creds] = await Promise.all([
        db.q('SELECT ts, slug, tf, side, price, qty, fee, fair, edge, s0, s, secs, mode, status, pnl FROM btctrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]),
        B.stats(uid, 'paper'), B.stats(uid, 'live'), S.getCreds(uid).catch(() => null)]);
      return { enabled: row.enabled, mode: row.mode, cfg, paper: { balance: row.paper, start: row.paperstart, ...paper }, live, keys: !!creds, trades: trades.map(t => ({ ...t, ts: Number(t.ts) })), btclive: J(await S.get('btclive'), null), health: await B.health(uid, row.mode), limits: { daily: B.DAILY_STOP, kelly: B.KELLY }, rules: { minEdge: B.MIN_EDGE, minZ: B.MIN_Z, maxPrice: B.MAX_PRICE, sanity: B.SANITY }, now: Date.now() };
    }
    case 'cfg': { // trade size: % of balance or fixed $
      const c = body.cfg || {}, next = { size: (c.size ?? cfg.size) === 'usd' ? 'usd' : 'pct', pct: clamp(c.pct ?? cfg.pct, .5, 50, B.DEF.pct), usd: clamp(c.usd ?? cfg.usd, 1, 10000, B.DEF.usd) };
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
