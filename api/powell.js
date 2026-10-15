// Powell Strategy: chart data for the tab (free Yahoo Finance 5-minute futures candles) and controls for the Powell bot.
const { handler, err } = require('./_lib/util');
const MT = require('./_lib/manual'), db = require('./_lib/db'), ICT = require('./_lib/ictbot'), ST = require('./_lib/supertrend'), P = require('./_lib/powell'), AL = require('./_lib/alpaca'), A = require('./_lib/accounts'), LAB = require('./_lib/lab');
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
// Supertrend bot (same tab family, so no extra server function): ops st-data, st-state, st-cfg, st-start, st-stop
async function stApi(uid, op, body) {
  const { row, cfg } = await ST.open(uid);
  switch (op) {
    case 'data': try { return { ...(await ST.chartData(cfg.sym, cfg)), cfg }; } catch (e) { throw err(e.status || 502, e.message); }
    case 'state': { const c = await AL.getCreds(uid).catch(() => null); let account = null, accountError = null;
      if (c) try { const a = await AL.account(c); account = { equity: +a.equity, cash: +a.cash }; } catch (e) { accountError = e.message; }
      const trades = await db.q('SELECT ts, day, root, sym, dir, qty, entry, stop, status, exitp, pnl, reason, exitts FROM sttrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]);
      return { enabled: row.enabled, cfg, connected: !!c, account, accountError, stats: await ST.stats(uid), trades, now: Date.now() }; }
    case 'bt': { const n = Math.round(clamp(body.days, 3, 60, 40)); let all; try { all = await ST.bars(cfg.sym, 3e5); } catch (e) { throw err(e.status || 502, e.message); }
      const dates = [...new Set(all.filter(x => x.m >= 570 && x.m < 960).map(x => x.date))]; return { sym: cfg.sym, cfg, backtest: ST.backtest(all, { ...cfg, sym: cfg.sym, from: dates.slice(-n)[0] }) }; }
    case 'cfg': { const c = body.cfg || {}, sym = String(c.sym || cfg.sym).toUpperCase(), next = { sym: sym === 'ES' ? 'ES' : 'NQ', risk: clamp(c.risk ?? cfg.risk, .1, 2, ST.DEF.risk), atr: Math.round(clamp(c.atr ?? cfg.atr, 5, 20, ST.DEF.atr)), mult: clamp(c.mult ?? cfg.mult, 1, 6, ST.DEF.mult), adx: (c.adx ?? cfg.adx) !== false, max: Math.round(clamp(c.max ?? cfg.max, 1, 6, ST.DEF.max)) };
      await db.q('UPDATE stbot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': if (!(await AL.getCreds(uid).catch(() => null))) throw err(400, 'Connect Alpaca first (in the Newsflash tab)'); await db.q('UPDATE stbot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE stbot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    default: throw err(400, 'unknown op');
  }
}
// Sweep Bot (ICT rules, same tab family): ops ict-data, ict-state, ict-cfg, ict-start, ict-stop
async function ictApi(uid, op, body) {
  const { cfg } = await ICT.open(uid);
  switch (op) {
    case 'data': try { return { ...(await ICT.chartData(cfg.sym, cfg)), cfg }; } catch (e) { throw err(e.status || 502, e.message); }
    case 'state': { const c = await AL.getCreds(uid).catch(() => null), row = await db.one('SELECT enabled FROM ictbot WHERE uid=$1', [uid]); let account = null, accountError = null;
      if (c) try { const a = await AL.account(c); account = { equity: +a.equity, cash: +a.cash }; } catch (e) { accountError = e.message; }
      const trades = (await db.q('SELECT id, ts, day, root, sym, dir, qty, entry, stop, tp, status, exitp, pnl, reason, exitts FROM icttrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid])).map(t => ({ ...t, ts: Number(t.ts), exitts: t.exitts != null ? Number(t.exitts) : null }));
      return { enabled: !!row?.enabled, cfg, connected: !!c, account, accountError, stats: await ICT.stats(uid), trades, now: Date.now() }; }
    case 'bt': try { return { sym: cfg.sym, cfg, backtest: await ICT.backtestRun(cfg.sym, cfg, Math.round(clamp(body.days, 3, 60, 40))) }; } catch (e) { throw err(e.status || 502, e.message); }
    case 'cfg': { const c = body.cfg || {}, next = ICT.norm({ sym: String(c.sym ?? cfg.sym).toUpperCase(), risk: clamp(c.risk ?? cfg.risk, .1, 2, ICT.DEF.risk), rr: clamp(c.rr ?? cfg.rr, 1, 4, ICT.DEF.rr), max: Math.round(clamp(c.max ?? cfg.max, 1, 4, ICT.DEF.max)), model: c.model ?? cfg.model, pd: (c.pd ?? cfg.pd) !== false, int: (c.int ?? cfg.int) !== false });
      await db.q('UPDATE ictbot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': if (!(await AL.getCreds(uid).catch(() => null))) throw err(400, 'Connect Alpaca first (in the Newsflash tab)'); await db.q('UPDATE ictbot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE ictbot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    default: throw err(400, 'unknown op');
  }
}
const main = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  if (op && op.startsWith('mt-')) { try { return await MT.api(uid, op.slice(3), body, q); } catch (e) { throw err(e.status || 502, e.message); } } // Manual Trading + the Opposite Bot
  if (op && op.startsWith('lab-')) { try { return await LAB.api(uid, op.slice(4), body, q, u); } catch (e) { throw err(e.status || 502, e.message); } } // Strategy Lab bots
  if (op && op.startsWith('st-')) return stApi(uid, op.slice(3), body);
  if (op && op.startsWith('ict-')) return ictApi(uid, op.slice(4), body);
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
      const trades = await db.q('SELECT ts, day, fut, etf, dir, kind, rpct, qty, entry, stop, tp, status, exitp, pnl, reason, exitts FROM powelltrades WHERE uid=$1 ORDER BY ts DESC LIMIT 100', [uid]);
      return { enabled: row.enabled, cfg, connected: !!c, paper: c ? c.paper : true, account, accountError, stats: await P.stats(uid), trades, today: row.lastday || null, etf: P.ETF };
    }
    case 'bt': { const n = Math.round(clamp(body.days, 3, 60, 40)); let d; try { d = await P.candles(cfg.sym); } catch (e) { throw err(e.status || 502, e.message); }
      const keys = [...d.days.keys()].sort().filter(k => d.days.get(k).length >= 20).slice(-n), rows = P.analyze(new Map(keys.map(k => [k, d.days.get(k)]))), done = rows.filter(r => r.signal && !r.signal.skip && r.signal.r != null);
      return { sym: cfg.sym, from: keys[0], to: keys[keys.length - 1], summary: P.summary(rows), trades: done.slice(-12).reverse().map(r => ({ date: r.date, dir: r.signal.dir, kind: r.signal.kind, entry: r.signal.entry, outcome: r.signal.outcome, r: r.signal.r })) }; }
    case 'cfg': { const c = body.cfg || {}, sym = String(c.sym || cfg.sym).toUpperCase(), next = { sym: P.ETF[sym] ? sym : cfg.sym, risk: clamp(c.risk ?? cfg.risk, .1, 2, P.DEF.risk), max: clamp(c.max ?? cfg.max, 5, 100, P.DEF.max), inst: (c.inst ?? cfg.inst) === 'etf' ? 'etf' : 'futures' };
      await db.q('UPDATE pbot SET cfg=$2, updated=$3 WHERE uid=$1', [uid, JSON.stringify(next), Date.now()]); return { ok: true, cfg: next }; }
    case 'start': if (!(await AL.getCreds(uid).catch(() => null))) throw err(400, 'Connect Alpaca first (in the Newsflash tab)');
      await db.q('UPDATE pbot SET enabled=true, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    case 'stop': await db.q('UPDATE pbot SET enabled=false, updated=$2 WHERE uid=$1', [uid, Date.now()]); return { ok: true };
    default: throw err(400, 'unknown op');
  }
});
module.exports = (req, res) => (req.query && req.query.op === 'mcp' ? require('./_lib/mcp').http(req, res) : main(req, res)); // /mcp (rewritten here: the app is at its 12-function limit)
