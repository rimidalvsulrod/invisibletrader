// Powell Strategy: chart data for the tab (free Yahoo Finance 5-minute futures candles) and controls for the Powell bot.
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), P = require('./_lib/powell'), AL = require('./_lib/alpaca'), A = require('./_lib/accounts');
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  if (op === 'data') {
    const sym = String(q.sym || 'NQ').toUpperCase(); if (!P.SYMS[sym]) throw err(400, 'Pick NQ, ES, MNQ or MES');
    let d; try { d = await P.candles(sym); } catch (e) { throw err(e.status || 502, e.message); }
    const rows = P.analyze(d.days), full = rows.filter(r => d.days.get(r.date).length >= 20), shown = full.slice(-10);
    return { sym, t: d.t, delay: d.delay, price: d.price, summary: P.summary(rows), etf: P.ETF[sym],
      days: shown.map(r => ({ date: r.date, note: r.note || '', levels: r.levels, signal: r.signal, cs: d.days.get(r.date).map(x => [x.m, x.o, x.h, x.l, x.c]) })) };
  }
  const { row, cfg } = await P.open(uid);
  switch (op) {
    case 'state': {
      const c = await AL.getCreds(uid).catch(() => null); let account = null, accountError = null;
      if (c) try { const a = await AL.account(c); account = { equity: +a.equity, cash: +a.cash, day: +a.equity - +a.last_equity, paper: c.paper }; } catch (e) { accountError = e.message; }
      const trades = await db.q('SELECT ts, day, fut, etf, dir, kind, rpct, qty, entry, stop, tp, status, exitp, pnl, reason FROM powelltrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]);
      return { enabled: row.enabled, cfg, connected: !!c, paper: c ? c.paper : true, account, accountError, stats: await P.stats(uid), trades, today: row.lastday || null, etf: P.ETF };
    }
    case 'cfg': { const c = body.cfg || {}, sym = String(c.sym || cfg.sym).toUpperCase(), next = { sym: P.ETF[sym] ? sym : cfg.sym, risk: clamp(c.risk ?? cfg.risk, .1, 2, P.DEF.risk), max: clamp(c.max ?? cfg.max, 5, 100, P.DEF.max), inst: (c.inst ?? cfg.inst) === 'etf' ? 'etf' : 'futures' };
      await db.q('UPDATE pbot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': if (!(await AL.getCreds(uid).catch(() => null))) throw err(400, 'Connect Alpaca first (in the Newsflash tab)');
      await db.q('UPDATE pbot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE pbot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    default: throw err(400, 'unknown op');
  }
});
