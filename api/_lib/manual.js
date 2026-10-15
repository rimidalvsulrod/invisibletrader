// Manual Trading: a paper brokerage for clicking your own trades (stocks, ETFs, futures, crypto) on a TradingView-style chart,
// plus the Opposite Bot: its own paper account that takes the exact reverse of every fill you get (you buy, it sells; you sell, it buys).
// Prices: Yahoo Finance (stocks, futures - CME data on Yahoo is about 10 minutes late) and Coinbase (crypto, live). Paper only: nothing real is ever traded.
//   Accounts 'me' and 'opp', $100,000 each to start. Positions are signed quantities with an average price. Market orders fill at the live price plus
//   one tick of slippage; limit and stop orders fill when a 1-minute candle after the order touches the price (limit at its price; stop at its price or a
//   worse open). A market order can carry a stop-loss and a take-profit: they become a one-cancels-the-other pair.
const crypto = require('crypto'), db = require('./db'), Y = require('./yahoo');
const START = 100000, ID = () => crypto.randomBytes(8).toString('hex'), err = (s, m) => Object.assign(new Error(m), { status: s });
const FUT = { 'NQ=F': [20, 2.25, .25], 'MNQ=F': [2, .62, .25], 'ES=F': [50, 2.25, .25], 'MES=F': [5, .62, .25], 'YM=F': [5, 2.25, 1], 'MYM=F': [.5, .62, 1], 'RTY=F': [50, 2.25, .1], 'M2K=F': [5, .62, .1],
  'CL=F': [1000, 2.25, .01], 'MCL=F': [100, .62, .01], 'GC=F': [100, 2.25, .1], 'MGC=F': [10, .62, .1], 'SI=F': [5000, 2.25, .005], 'NG=F': [10000, 2.25, .001], 'ZB=F': [1000, 2.25, .03125], '6E=F': [125000, 2.25, .00005] };
const isCrypto = s => /-USD$/.test(s), spec = s => FUT[s] ? { mult: FUT[s][0], fee: FUT[s][1], tick: FUT[s][2], kind: 'future' } : isCrypto(s) ? { mult: 1, fee: 0, feePct: .001, tick: .01, kind: 'crypto' } : { mult: 1, fee: 0, tick: .01, kind: 'stock' };
const norm = s => { s = String(s || '').trim().toUpperCase().replace(/\s+/g, ''); if (/^(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|LINK|LTC|DOT|PEPE|SHIB)$/.test(s)) s += '-USD'; if (/^(NQ|ES|YM|RTY|CL|GC|SI|NG|MNQ|MES|MYM|M2K|MCL|MGC|ZB|6E)$/.test(s)) s += '=F'; if (!/^[A-Z0-9^.=\-]{1,15}$/.test(s)) throw err(400, 'bad symbol'); return s; };

/* ---------- market data ---------- */
const TF = { '1m': ['1m', '5d'], '2m': ['2m', '5d'], '5m': ['5m', '30d'], '15m': ['15m', '60d'], '30m': ['30m', '60d'], '1h': ['60m', '730d'], '4h': ['60m', '730d', 4], '1d': ['1d', '10y'], '1w': ['1wk', '20y'], '1mo': ['1mo', 'max'] };
async function candles(sym, tf = '5m') {
  sym = norm(sym); if (isCrypto(sym) && CBG[tf]) try { return await cbCandles(sym, tf); } catch (e) {} /* crypto: Coinbase's own candles (live, exact) */ const [iv, range, agg] = TF[tf] || TF['5m'], ttl = /m$/.test(iv) && iv !== '1mo' ? 8e3 : 6e4;
  const j = await Y.get(`/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${iv}&includePrePost=true`, ttl), r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw err(404, 'no data for ' + sym); const q = r.indicators.quote[0]; let out = [];
  r.timestamp.forEach((t, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].some(x => x == null)) return; const z = out[out.length - 1]; if (z && t <= z[0]) { if (t === z[0]) { z[2] = Math.max(z[2], h); z[3] = Math.min(z[3], l); z[4] = c; } return; } out.push([t, o, h, l, c, q.volume[i] || 0]); }); // strictly ascending for the chart
  if (agg) { const g = []; for (const x of out) { const k = Math.floor(x[0] / (agg * 3600)) * agg * 3600, y = g[g.length - 1]; if (y && y[0] === k) { y[2] = Math.max(y[2], x[2]); y[3] = Math.min(y[3], x[3]); y[4] = x[4]; y[5] += x[5]; } else g.push([k, x[1], x[2], x[3], x[4], x[5]]); } out = g; }
  if (/m$/.test(iv) && iv !== '1mo' && out.length > 20) { // bad ticks: a wick far outside its neighbours (Yahoo's pre/post-market prints) is cut back to the body
    const rs = out.map(x => x[2] - x[3]).sort((a, b) => a - b), mr = Math.max(rs[rs.length >> 1] || 0, (out[out.length - 1][4] || 0) * .0008); // never 0 (flat minutes would snap every bar)
    for (let i = 0; i < out.length; i++) { const x = out[i], nb = out.slice(Math.max(0, i - 6), i + 7).filter(y => y !== x).map(y => y[4]).sort((p, q) => p - q), med = nb[nb.length >> 1], top = Math.max(x[1], x[4]), bot = Math.min(x[1], x[4]);
      if (Math.abs(top - med) > 12 * mr || Math.abs(bot - med) > 12 * mr) { x[1] = x[4] = med; x[2] = Math.max(x[2] - 0, med); x[3] = Math.min(x[3], med); } // a whole bar far off: snap it
      if (x[2] - Math.max(x[1], x[4], med) > 12 * mr) x[2] = Math.max(x[1], x[4]); if (Math.min(x[1], x[4], med) - x[3] > 12 * mr) x[3] = Math.min(x[1], x[4]); } }
  const m = r.meta || {}; return { sym, tf, name: m.longName || m.shortName || sym, cur: m.currency || 'USD', ex: m.fullExchangeName || m.exchangeName || '', bars: out.slice(-3000), price: m.regularMarketPrice ?? out[out.length - 1]?.[4], prev: dayPrev(out, m, tf), spec: spec(sym), delayed: !!FUT[sym] };
}
const CBG = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 }, CB = new Map();
async function cbCandles(sym, tf) { // up to 900 bars from Coinbase Exchange (300 per request)
  const g = CBG[tf], k = sym + tf, h = CB.get(k); if (h && Date.now() - h.at < 8e3) return h.v; let end = Math.floor(Date.now() / 1000), all = [];
  for (let page = 0; page < 3; page++) { const start = end - g * 300, r = await fetch(`https://api.exchange.coinbase.com/products/${sym}/candles?granularity=${g}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10e3) });
    if (!r.ok) { if (!all.length) throw new Error('Coinbase ' + r.status); break; } const a = await r.json(); if (!Array.isArray(a) || !a.length) break; all = all.concat(a); end = start; }
  const m = new Map(); for (const [t, l, hi, o, c, v] of all) m.set(t, [t, o, hi, l, c, v]); const bars = [...m.values()].sort((a, b) => a[0] - b[0]); if (bars.length < 20) throw new Error('few candles');
  const px = await quote(sym).catch(() => bars[bars.length - 1][4]), d = bars.filter(b => b[0] <= Date.now() / 1000 - 86400).pop();
  const v = { sym, tf, name: sym.replace('-USD', '') + ' / US Dollar', cur: 'USD', ex: 'Coinbase', bars, price: px, prev: d ? d[4] : bars[0][1], spec: spec(sym), delayed: false };
  CB.set(k, { at: Date.now(), v }); if (CB.size > 40) CB.delete(CB.keys().next().value); return v; }
const QC = new Map();
function dayPrev(out, m, tf) { // yesterday's close, for the day change (chartPreviousClose is the close before the whole range, not yesterday)
  const off0 = m.gmtoffset || 0; if (out.length && m.regularMarketTime && m.regularMarketPrice && Math.floor((out[out.length - 1][0] + off0) / 86400) > Math.floor((m.regularMarketTime + off0) / 86400)) return m.regularMarketPrice; // pre-market: change vs yesterday's close
  if (m.previousClose) return m.previousClose; if (!out.length) return m.chartPreviousClose ?? null; if (!/m$|h$/.test(tf)) return out.length > 1 ? out[out.length - 2][4] : m.chartPreviousClose ?? null;
  const off = m.gmtoffset || 0, day = t => Math.floor((t + off) / 86400), d = day(out[out.length - 1][0]); for (let i = out.length - 1; i >= 0; i--) if (day(out[i][0]) < d) return out[i][4]; return m.chartPreviousClose ?? null; }
async function quote(sym) { // live price
  sym = norm(sym); const h = QC.get(sym); if (h && Date.now() - h.at < 900) return h.px; let px = null;
  if (isCrypto(sym)) try { const r = await fetch(`https://api.exchange.coinbase.com/products/${sym}/ticker`, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8e3) }); if (r.ok) px = +(await r.json()).price || null; } catch (e) {}
  if (px == null) { const j = await Y.get(`/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1m&includePrePost=true`, 900, true), r = j?.chart?.result?.[0], m = r?.meta || {}; px = m.regularMarketPrice ?? null; // the newest trade, pre- and after-hours included
    const T = r?.timestamp || [], C = r?.indicators?.quote?.[0]?.close || []; for (let i = T.length - 1; i >= 0; i--) if (C[i] != null) { if (T[i] > (m.regularMarketTime || 0)) px = C[i]; break; } }
  if (!(px > 0)) throw err(502, 'no live price for ' + sym); QC.set(sym, { at: Date.now(), px }); return px;
}
async function search(q) { const j = await Y.get('/v1/finance/search?q=' + encodeURIComponent(String(q).slice(0, 40)) + '&quotesCount=10&newsCount=0', 6e4);
  return (j?.quotes || []).filter(x => x.symbol && ['EQUITY', 'ETF', 'FUTURE', 'CRYPTOCURRENCY', 'INDEX', 'MUTUALFUND'].includes(x.quoteType)).map(x => ({ sym: x.symbol, name: x.shortname || x.longname || x.symbol, type: x.quoteType, ex: x.exchDisp || '' })); }

/* ---------- ledger ---------- */
async function acct(uid, a) { await db.q('INSERT INTO mtacct (uid, acct, cash, start, enabled, updated) VALUES ($1,$2,$3,$3,$4,$5) ON CONFLICT (uid, acct) DO NOTHING', [uid, a, START, a === 'me', Date.now()]); return db.one('SELECT * FROM mtacct WHERE uid=$1 AND acct=$2', [uid, a]); }
// one fill: updates the position (average price on adds, realized P&L on reductions), charges fees, records it. side 'buy' | 'sell'.
async function fill(uid, a, sym, side, qty, px, why, mirror = true) {
  const s = spec(sym), d = side === 'buy' ? 1 : -1, p = await db.one('SELECT * FROM mtpos WHERE uid=$1 AND acct=$2 AND sym=$3', [uid, a, sym]), q0 = p ? Number(p.qty) : 0, avg0 = p ? Number(p.avg) : 0;
  const fee = s.kind === 'future' ? s.fee * qty : s.feePct ? s.feePct * qty * px : 0; let realized = 0, q1 = q0 + d * qty, avg1 = avg0;
  if (q0 === 0 || Math.sign(q0) === d) avg1 = (avg0 * Math.abs(q0) + px * qty) / Math.abs(q1); // adding
  else { const closed = Math.min(qty, Math.abs(q0)); realized = (px - avg0) * Math.sign(q0) * closed * s.mult; if (Math.abs(q1) < 1e-9) { q1 = 0; avg1 = 0; } else if (Math.sign(q1) !== Math.sign(q0)) avg1 = px; } // reducing / flipping
  q1 = Math.round(q1 * 1e8) / 1e8;
  if (q1 === 0) await db.q('DELETE FROM mtpos WHERE uid=$1 AND acct=$2 AND sym=$3', [uid, a, sym]);
  else await db.q('INSERT INTO mtpos (uid, acct, sym, qty, avg) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (uid, acct, sym) DO UPDATE SET qty=$4, avg=$5', [uid, a, sym, q1, avg1]);
  await db.q('UPDATE mtacct SET cash=cash+$3, updated=$4 WHERE uid=$1 AND acct=$2', [uid, a, realized - fee, Date.now()]);
  await db.q('INSERT INTO mtfill (id, uid, acct, ts, sym, side, qty, px, pnl, fee, why) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [ID(), uid, a, Date.now(), sym, side, qty, px, realized, fee, why || null]);
  if (a === 'me' && mirror) { const o = await acct(uid, 'opp'); if (o.enabled) { const od = -d, s2 = spec(sym), opx = s2.kind === 'crypto' ? px * (1 + od * .0004) : px + od * 2 * s2.tick; await fill(uid, 'opp', sym, od === 1 ? 'buy' : 'sell', qty, opx, 'opposite of your ' + side, false); } } // the Opposite Bot
  return { realized, fee };
}
const slip = (sym, px, d) => { const s = spec(sym); return s.kind === 'crypto' ? px * (1 + d * .0002) : px + d * s.tick; };
async function equity(uid, a) { // cash + open P&L at live prices
  const A = await acct(uid, a), pos = await db.q('SELECT * FROM mtpos WHERE uid=$1 AND acct=$2', [uid, a]); let upnl = 0, gross = 0; const out = [];
  for (const p of pos) { let px = null; try { px = await quote(p.sym); } catch (e) {} const s = spec(p.sym), q = Number(p.qty), u = px != null ? (px - Number(p.avg)) * q * s.mult : 0; upnl += u; gross += Math.abs(q) * (px || Number(p.avg)) * s.mult * (s.kind === 'future' ? .1 : 1);
    out.push({ sym: p.sym, qty: q, avg: Number(p.avg), px, upnl: u, mult: s.mult }); }
  return { acct: a, start: Number(A.start), cash: Number(A.cash), upnl, equity: Number(A.cash) + upnl, gross, enabled: A.enabled, positions: out };
}

/* ---------- orders ---------- */
async function place(uid, b) {
  const sym = norm(b.sym), side = b.side === 'sell' ? 'sell' : 'buy', kind = ['market', 'limit', 'stop'].includes(b.kind) ? b.kind : 'market', s = spec(sym), d = side === 'buy' ? 1 : -1;
  let qty = Number(b.qty); qty = s.kind === 'crypto' ? Math.floor(qty * 1e6) / 1e6 : Math.floor(qty); if (!(qty > 0)) throw err(400, 'Enter a quantity' + (s.kind === 'crypto' ? '' : ' (whole shares / contracts)'));
  const px = await quote(sym), e = await equity(uid, 'me'), add = qty * px * s.mult * (s.kind === 'future' ? .1 : 1); if (e.gross + add > 4 * Math.max(e.equity, 0)) throw err(400, 'Not enough buying power (4× the account, futures at 10% margin)');
  const sl = Number(b.sl) > 0 ? Number(b.sl) : null, tp = Number(b.tp) > 0 ? Number(b.tp) : null;
  if (sl && (d === 1 ? sl >= px : sl <= px)) throw err(400, `The stop-loss must be ${d === 1 ? 'below' : 'above'} the price`); if (tp && (d === 1 ? tp <= px : tp >= px)) throw err(400, `The take-profit must be ${d === 1 ? 'above' : 'below'} the price`);
  if (kind === 'market') { const f = slip(sym, px, d); await fill(uid, 'me', sym, side, qty, f, 'market order'); await brackets(uid, sym, side, qty, sl, tp); return { ok: true, filled: f }; }
  const lp = Number(b.px); if (!(lp > 0)) throw err(400, 'Enter the order price');
  await db.q("INSERT INTO mtord (id, uid, ts, sym, side, qty, kind, px, sl, tp, status, grp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',null)", [ID(), uid, Date.now(), sym, side, qty, kind, lp, sl, tp]); return { ok: true };
}
async function brackets(uid, sym, side, qty, sl, tp) { if (!sl && !tp) return; const g = ID(), x = side === 'buy' ? 'sell' : 'buy';
  if (sl) await db.q("INSERT INTO mtord (id, uid, ts, sym, side, qty, kind, px, status, grp) VALUES ($1,$2,$3,$4,$5,$6,'stop',$7,'open',$8)", [ID(), uid, Date.now(), sym, x, qty, sl, g]);
  if (tp) await db.q("INSERT INTO mtord (id, uid, ts, sym, side, qty, kind, px, status, grp) VALUES ($1,$2,$3,$4,$5,$6,'limit',$7,'open',$8)", [ID(), uid, Date.now(), sym, x, qty, tp, g]); }
async function check(uid) { // fill resting orders whose price was touched by a 1-minute candle after they were placed
  const open = await db.q("SELECT * FROM mtord WHERE uid=$1 AND status='open' ORDER BY ts", [uid]); if (!open.length) return 0; let n = 0; const bySym = {};
  for (const o of open) { if (!bySym[o.sym]) { try { bySym[o.sym] = (await candles(o.sym, '1m')).bars; } catch (e) { bySym[o.sym] = []; } }
    const still = await db.one('SELECT status FROM mtord WHERE id=$1', [o.id]); if (still?.status !== 'open') continue; // its OCO partner filled first
    const b = bySym[o.sym].filter(x => x[0] * 1000 >= Math.floor(Number(o.ts) / 6e4) * 6e4 + 6e4), px = Number(o.px), buy = o.side === 'buy'; let f = null;
    for (const x of b) { const [, op, h, l] = x; if (o.kind === 'limit' && (buy ? l <= px : h >= px)) { f = buy ? Math.min(px, op) : Math.max(px, op); break; } if (o.kind === 'stop' && (buy ? h >= px : l <= px)) { f = slip(o.sym, buy ? Math.max(px, op) : Math.min(px, op), buy ? 1 : -1); break; } }
    if (f == null) continue; const claim = await db.q("UPDATE mtord SET status='filled', fpx=$2, fts=$3 WHERE id=$1 AND status='open' RETURNING id", [o.id, f, Date.now()]); if (!claim.length) continue;
    await fill(uid, 'me', o.sym, o.side, Number(o.qty), f, `${o.kind} order${o.grp ? (o.kind === 'stop' ? ' (stop-loss)' : ' (take-profit)') : ''}`); n++;
    if (o.grp) await db.q("UPDATE mtord SET status='cancelled' WHERE grp=$1 AND status='open'", [o.grp]); else await brackets(uid, o.sym, o.side, Number(o.qty), o.sl ? Number(o.sl) : null, o.tp ? Number(o.tp) : null); }
  return n;
}
async function endDay(uid) { // cancel everything, flatten you and the Opposite Bot at market
  await db.q("UPDATE mtord SET status='cancelled' WHERE uid=$1 AND status='open'", [uid]); const out = [];
  for (const a of ['me', 'opp']) for (const p of await db.q('SELECT * FROM mtpos WHERE uid=$1 AND acct=$2', [uid, a])) { const q = Number(p.qty), d = q > 0 ? -1 : 1; let px; try { px = slip(p.sym, await quote(p.sym), d); } catch (e) { px = Number(p.avg); }
    await fill(uid, a, p.sym, d === 1 ? 'buy' : 'sell', Math.abs(q), px, 'end of trading day', false); out.push(`${a}:${p.sym}`); }
  return { ok: true, closed: out };
}
async function closePos(uid, sym) { sym = norm(sym); const p = await db.one("SELECT * FROM mtpos WHERE uid=$1 AND acct='me' AND sym=$2", [uid, sym]); if (!p) throw err(400, 'no position'); const q = Number(p.qty), d = q > 0 ? -1 : 1;
  await db.q("UPDATE mtord SET status='cancelled' WHERE uid=$1 AND sym=$2 AND status='open' AND grp IS NOT NULL", [uid, sym]); await fill(uid, 'me', sym, d === 1 ? 'buy' : 'sell', Math.abs(q), slip(sym, await quote(sym), d), 'closed by you'); return { ok: true }; }
async function stats(uid, a) { const r = await db.one("SELECT count(*)::int AS n, coalesce(sum(pnl-fee),0) AS net, sum(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int AS w, sum(CASE WHEN pnl<>0 THEN 1 ELSE 0 END)::int AS c FROM mtfill WHERE uid=$1 AND acct=$2", [uid, a]); return { fills: r.n, net: Number(r.net), won: r.w || 0, closed: r.c || 0 }; }
async function state(uid) {
  await check(uid).catch(() => {}); const [me, opp] = [await equity(uid, 'me'), await equity(uid, 'opp')];
  const orders = await db.q("SELECT id, ts, sym, side, qty, kind, px, sl, tp, grp FROM mtord WHERE uid=$1 AND status='open' ORDER BY ts DESC", [uid]);
  const fills = await db.q('SELECT acct, ts, sym, side, qty, px, pnl, fee, why FROM mtfill WHERE uid=$1 ORDER BY ts DESC LIMIT 80', [uid]);
  return { me: { ...me, ...(await stats(uid, 'me')) }, opp: { ...opp, ...(await stats(uid, 'opp')) }, orders: orders.map(o => ({ ...o, ts: Number(o.ts) })), fills: fills.map(f => ({ ...f, ts: Number(f.ts) })), now: Date.now() };
}
async function api(uid, op, b, q) {
  switch (op) {
    case 'candles': return candles(q.sym || b.sym, q.tf || b.tf);
    case 'mcpinfo': return require('./mcp').info(uid);
    case 'mcpnew': return require('./mcp').newToken(uid);
    case 'mcprevoke': return require('./mcp').revoke(uid);
    case 'mcptrade': return require('./mcp').setTrade(uid, b.on);
    case 'view': return require('./mcp').view(uid, b); // the Trade page reports its view; the reply carries Claude's commands
    case 'quotes': { const L = [...new Set(String(q.syms || b.syms || '').split(',').map(norm).filter(Boolean))].slice(0, 20); if (!L.length) return { quotes: [] }; // the watchlist
      const j = await Y.get(`/v7/finance/spark?symbols=${encodeURIComponent(L.join(','))}&range=1d&interval=5m`, 4e3, true); const R = j?.spark?.result || [];
      return { quotes: L.map(s => { const m = R.find(x => x.symbol === s)?.response?.[0]?.meta || {}; return { sym: s, px: m.regularMarketPrice ?? null, prev: m.chartPreviousClose ?? m.previousClose ?? null }; }) }; }
    case 'botlist': return { bots: require('./botsig').list() };
    case 'botsig': return require('./botsig').sig(uid, String(q.k || b.k || ''), norm(q.sym || b.sym));
    case 'quote': return { sym: norm(q.sym || b.sym), px: await quote(q.sym || b.sym), t: Date.now() }; // the 1-second ticker
    case 'trades': { const s = norm(q.sym || b.sym); if (!isCrypto(s)) return { trades: [] }; // the latest trades, to seed 1-second charts
      const r = await fetch(`https://api.exchange.coinbase.com/products/${s}/trades?limit=1000`, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8e3) }); if (!r.ok) throw err(502, 'Coinbase ' + r.status);
      return { trades: (await r.json()).map(x => [Date.parse(x.time), +x.price, +x.size]).reverse() }; }
    case 'search': return { results: await search(q.q || b.q || '') };
    case 'state': return state(uid);
    case 'order': await acct(uid, 'me'); return place(uid, b);
    case 'cancel': await db.q("UPDATE mtord SET status='cancelled' WHERE uid=$1 AND id=$2 AND status='open'", [uid, String(b.id)]); return { ok: true };
    case 'close': return closePos(uid, b.sym);
    case 'endday': return endDay(uid);
    case 'opp': await acct(uid, 'opp'); await db.q("UPDATE mtacct SET enabled=$2 WHERE uid=$1 AND acct='opp'", [uid, !!b.on]); return { ok: true };
    case 'reset': { const a = b.acct === 'opp' ? 'opp' : 'me'; await acct(uid, a); await db.q('DELETE FROM mtpos WHERE uid=$1 AND acct=$2', [uid, a]); await db.q('DELETE FROM mtfill WHERE uid=$1 AND acct=$2', [uid, a]); if (a === 'me') await db.q("UPDATE mtord SET status='cancelled' WHERE uid=$1 AND status='open'", [uid]);
      await db.q('UPDATE mtacct SET cash=start WHERE uid=$1 AND acct=$2', [uid, a]); return { ok: true }; }
    default: throw err(400, 'unknown op');
  }
}
let busy = false, last = 0;
async function tick() { if (busy || Date.now() - last < 2e4) return; busy = true; last = Date.now(); // runner: fill resting orders even while nobody has the page open
  try { for (const r of await db.q("SELECT DISTINCT uid FROM mtord WHERE status='open'")) await check(r.uid).catch(e => console.error('manual', e.message)); } finally { busy = false; } }
module.exports = { api, tick, candles, quote, spec, norm, fill, equity, check, endDay, START };
