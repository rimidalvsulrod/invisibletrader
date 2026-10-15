// Claude connection (MCP, Streamable HTTP, stateless JSON). Lets Claude see your Trade chart and use your paper accounts and bots.
// Auth: a personal token you create in Settings (sent as "Authorization: Bearer <token>" or as ?token=). Only its hash is stored.
// Tools that move paper money are gated by the "Allow Claude to trade" switch. Paper only: nothing real is ever traded.
const crypto = require('crypto'), db = require('./db'), MT = require('./manual');
let IND = null; try { IND = require('../../public/indicators.js'); } catch (e) { /* indicator tools say so */ }
const LAB = () => require('./lab'), sha = s => crypto.createHash('sha256').update(String(s)).digest('hex'), J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const err = (s, m) => Object.assign(new Error(m), { status: s });

/* ---------- tokens and the shared view ---------- */
async function info(uid) { const r = await db.one('SELECT created, last, trade FROM apitok WHERE uid=$1', [uid]); return r ? { has: true, created: Number(r.created), last: r.last ? Number(r.last) : null, trade: r.trade } : { has: false, trade: true }; }
async function newToken(uid) { const t = 'mim_' + crypto.randomBytes(24).toString('base64url'); await db.q('INSERT INTO apitok (uid, hash, created, trade) VALUES ($1,$2,$3,true) ON CONFLICT (uid) DO UPDATE SET hash=$2, created=$3, last=null', [uid, sha(t), Date.now()]); return { token: t, ...(await info(uid)) }; }
const revoke = async uid => { await db.q('DELETE FROM apitok WHERE uid=$1', [uid]); return { ok: true }; };
const setTrade = async (uid, on) => { await db.q('UPDATE apitok SET trade=$2 WHERE uid=$1', [uid, !!on]); return { ok: true }; };
async function auth(req) { const h = String(req.headers.authorization || ''), t = /^Bearer\s+(\S+)/i.exec(h)?.[1] || req.query?.token; if (!t || !/^mim_/.test(t)) return null;
  const r = await db.one('SELECT uid, trade FROM apitok WHERE hash=$1', [sha(t)]); if (!r) return null; db.q('UPDATE apitok SET last=$2 WHERE uid=$1', [r.uid, Date.now()]).catch(() => {}); return { uid: r.uid, trade: r.trade }; }
// the page posts what it shows (and a snapshot when Claude asked for one); the reply carries Claude's commands for the chart
async function view(uid, b) {
  const now = Date.now(), row = await db.one('SELECT * FROM mtview WHERE uid=$1', [uid]); let snapts = row ? Number(row.snapts || 0) : 0, snap = row?.snap || null;
  if (b.snap && typeof b.snap === 'string' && b.snap.startsWith('data:image/') && b.snap.length < 600e3) { snap = b.snap; snapts = now; }
  const data = JSON.stringify({ ...(b.view || {}), ts: now });
  await db.q('INSERT INTO mtview (uid, ts, data, snap, snapts, reqsnap, cmds) VALUES ($1,$2,$3,$4,$5,0,$6) ON CONFLICT (uid) DO UPDATE SET ts=$2, data=$3, snap=$4, snapts=$5', [uid, now, data, snap, snapts, '[]']);
  await db.q('UPDATE mtview SET reqsnap=0 WHERE uid=$1 AND reqsnap<=snapts', [uid]);
  let cmds = []; const cur = row?.cmds; if (cur && cur !== '[]') { const c = await db.q("UPDATE mtview SET cmds='[]' WHERE uid=$1 AND cmds=$2 RETURNING uid", [uid, cur]); if (c.length) cmds = J(cur, []); }
  const rs = await db.one('SELECT reqsnap, snapts FROM mtview WHERE uid=$1', [uid]);
  return { cmds, snap: Number(rs.reqsnap) > Number(rs.snapts), want: !!(await info(uid)).has };
}
async function pushCmd(uid, c) { const row = await db.one('SELECT cmds FROM mtview WHERE uid=$1', [uid]), a = [...J(row?.cmds, []), c].slice(-40);
  await db.q('INSERT INTO mtview (uid, ts, data, cmds) VALUES ($1,$2,$3,$4) ON CONFLICT (uid) DO UPDATE SET cmds=$4', [uid, Date.now(), '{}', JSON.stringify(a)]); }

/* ---------- indicators and a plain-English read of a chart ---------- */
const toBars = c => c.bars.map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })), r4 = x => x == null || !isFinite(x) ? null : +Number(x).toPrecision(7);
const defs = k => Object.fromEntries(IND.INDS[k].p.map(([n, , d]) => [n, d]));
function ind(B, tf, k, P = {}) { if (!IND) throw err(500, 'indicator library unavailable on this server'); if (!IND.INDS[k]) throw err(400, 'unknown indicator ' + k + ' (call list_indicators)'); const C = B.map(b => b.c), p = { ...defs(k), ...P };
  return IND.INDS[k].run(B, C, p, { tf }).map(o => ({ id: o.id, v: o.v })); }
const lastOf = (outs, id) => { const o = id ? outs.find(x => x.id === id) : outs.find(x => x.v && !x.hist) || outs[0]; return o ? o.v[o.v.length - 1] : null; };
function analyze(B, tf, sym) {
  const n = B.length, last = B[n - 1], C = B.map(b => b.c), f = {}; const q = (k, id, P) => lastOf(ind(B, tf, k, P), id), say = [];
  const e9 = q('ema9', 'm'), e21 = q('ema21', 'm'), s50 = q('sma50', 'm'), s200 = q('sma200', 'm'), px = last.c;
  f.price = r4(px); f.change_5_bars_pct = n > 5 ? r4((px / C[n - 6] - 1) * 100) : null; f.change_20_bars_pct = n > 20 ? r4((px / C[n - 21] - 1) * 100) : null;
  f.moving_averages = { ema9: r4(e9), ema21: r4(e21), sma50: r4(s50), sma200: r4(s200) };
  const above = [['EMA9', e9], ['EMA21', e21], ['SMA50', s50], ['SMA200', s200]].filter(x => x[1] != null && px > x[1]).map(x => x[0]), below = [['EMA9', e9], ['EMA21', e21], ['SMA50', s50], ['SMA200', s200]].filter(x => x[1] != null && px < x[1]).map(x => x[0]);
  f.trend = e21 != null && s50 != null ? (px > e21 && e21 > s50 ? 'up' : px < e21 && e21 < s50 ? 'down' : 'mixed') : 'unknown'; say.push(`Trend ${f.trend}: price ${above.length ? 'above ' + above.join(', ') : ''}${above.length && below.length ? ' and ' : ''}${below.length ? 'below ' + below.join(', ') : ''}.`);
  const rsi = q('rsi', 'r'); f.rsi14 = r4(rsi); say.push(`RSI ${r4(rsi)}${rsi > 70 ? ' (overbought)' : rsi < 30 ? ' (oversold)' : ''}.`);
  const mo = ind(B, tf, 'macd'), m = mo.find(x => x.id == 'm').v, sg = mo.find(x => x.id == 's').v, h = mo.find(x => x.id == 'h').v; f.macd = { line: r4(m[n - 1]), signal: r4(sg[n - 1]), hist: r4(h[n - 1]) };
  const cross = [1, 2, 3].find(i => h[n - 1 - i] != null && Math.sign(h[n - 1 - i]) !== Math.sign(h[n - 1])); f.macd.state = h[n - 1] > 0 ? 'bullish' : 'bearish'; if (cross) f.macd.recent_cross = `${cross} bar(s) ago`; say.push(`MACD ${f.macd.state}${cross ? ', crossed ' + cross + ' bar(s) ago' : ''}.`);
  const st = ind(B, tf, 'stoch'); f.stochastic = { k: r4(st[0].v[n - 1]), d: r4(st[1].v[n - 1]) };
  const ad = ind(B, tf, 'adx'); f.adx = { adx: r4(ad[0].v[n - 1]), plus_di: r4(ad[1].v[n - 1]), minus_di: r4(ad[2].v[n - 1]) }; say.push(`ADX ${f.adx.adx} (${f.adx.adx > 25 ? 'trending' : 'weak trend / ranging'}).`);
  const bb = ind(B, tf, 'bb'), bu = bb.find(x => x.id == 'u').v[n - 1], bl = bb.find(x => x.id == 'l').v[n - 1]; if (bu != null) { f.bollinger = { upper: r4(bu), lower: r4(bl), percent_b: r4((px - bl) / (bu - bl)), width_pct: r4((bu - bl) / px * 100) }; say.push(`Bollinger %B ${f.bollinger.percent_b} (${px > bu ? 'above the upper band' : px < bl ? 'below the lower band' : 'inside the bands'}).`); }
  const atr = q('atr', 'a'); f.atr14 = r4(atr); f.atr_pct = r4(atr / px * 100);
  const vols = B.slice(-21, -1).map(b => b.v), va = vols.reduce((a, b) => a + b, 0) / (vols.length || 1); f.volume_vs_20_avg = va ? r4(last.v / va) : null;
  if (!/^(1d|1w|1mo)$/.test(tf)) { const vw = q('vwap', 'v'); f.vwap = r4(vw); say.push(`Price ${px > vw ? 'above' : 'below'} VWAP ${r4(vw)}.`); }
  const piv = (dir) => { const out = []; for (let i = Math.max(3, n - 160); i < n - 3; i++) { const b = B[i]; if (dir == 'h' ? B.slice(i - 3, i + 4).every(x => x.h <= b.h) : B.slice(i - 3, i + 4).every(x => x.l >= b.l)) out.push(dir == 'h' ? b.h : b.l); } return out; };
  const res = [...new Set(piv('h').filter(x => x > px).map(x => +x.toPrecision(6)))].sort((a, b) => a - b).slice(0, 3), sup = [...new Set(piv('l').filter(x => x < px).map(x => +x.toPrecision(6)))].sort((a, b) => b - a).slice(0, 3);
  f.resistance_above = res; f.support_below = sup; say.push(`Nearest resistance ${res.join(', ') || 'none found'}; support ${sup.join(', ') || 'none found'}.`);
  const hi = Math.max(...B.slice(-100).map(b => b.h)), lo = Math.min(...B.slice(-100).map(b => b.l)); f.range_last_100_bars = { high: r4(hi), low: r4(lo), position_pct: r4((px - lo) / (hi - lo) * 100) };
  const body = Math.abs(last.c - last.o), rng = last.h - last.l || 1; f.last_candle = { direction: last.c >= last.o ? 'up' : 'down', body_pct_of_range: r4(body / rng * 100), upper_wick_pct: r4((last.h - Math.max(last.o, last.c)) / rng * 100), lower_wick_pct: r4((Math.min(last.o, last.c) - last.l) / rng * 100) };
  return { symbol: sym, timeframe: tf, bars_used: n, as_of: new Date(last.t * 1000).toISOString(), facts: f, summary: say, note: 'Facts computed from the indicators; this is analysis, not advice. Futures prices from Yahoo are about 10 minutes delayed.' };
}

/* ---------- the tools ---------- */
const S = (props, req = []) => ({ type: 'object', properties: props, required: req, additionalProperties: false });
const sym = { type: 'string', description: 'Symbol: AAPL, SPY, BTC (or BTC-USD), NQ (or NQ=F), GC=F ...' }, tf = { type: 'string', enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo'], description: 'Timeframe' };
const text = (o, pretty) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, pretty ? 1 : 0) }] });
const TOOLS = [
  { n: 'get_chart_view', d: 'What the user is looking at right now on the Trade page: symbol, timeframe, chart style, indicators on the chart (with settings), drawings, last price, plus a plain-English analysis of that chart. Use this first when the user says "my chart" or "this chart".', s: S({}),
    f: async u => { const r = await db.one('SELECT data, ts FROM mtview WHERE uid=$1', [u.uid]), v = J(r?.data, null); if (!v?.sym) return text('The Trade page has not reported a chart yet. Ask the user to open the Trade tab (it reports every few seconds while open).');
      const c = await MT.candles(v.sym, v.tf), B = toBars(c), out = { view: { ...v, age_seconds: Math.round((Date.now() - Number(r.ts)) / 1000) }, analysis: analyze(B, v.tf, v.sym) };
      const act = (v.ind || []).filter(k => IND?.INDS[k]); out.indicator_values = Object.fromEntries(act.map(k => [k, Object.fromEntries(ind(B, v.tf, k, v.prm?.[k]).filter(o => o.v).map(o => [o.id, r4(o.v[o.v.length - 1])]))])); return text(out, 1); } },
  { n: 'get_chart_screenshot', d: 'A picture of the chart exactly as the user sees it (candles, indicators, lines). Asks the open Trade page for a fresh snapshot (needs the Trade tab open).', s: S({}),
    f: async u => { const t0 = Date.now(); await db.q('INSERT INTO mtview (uid, ts, data, reqsnap) VALUES ($1,$2,$3,$4) ON CONFLICT (uid) DO UPDATE SET reqsnap=$4', [u.uid, t0, '{}', t0]); let r;
      for (let i = 0; i < 14; i++) { await new Promise(z => setTimeout(z, 700)); r = await db.one('SELECT snap, snapts FROM mtview WHERE uid=$1', [u.uid]); if (r?.snap && Number(r.snapts) >= t0) break; }
      if (!r?.snap) return { ...text('No snapshot yet. Ask the user to open the Trade tab, then try again.'), isError: true };
      const age = Math.round((Date.now() - Number(r.snapts)) / 1000), m = /^data:(image\/\w+);base64,(.*)$/.exec(r.snap); if (!m) return { ...text('Bad snapshot'), isError: true };
      return { content: [{ type: 'image', data: m[2], mimeType: m[1] }, { type: 'text', text: age > 20 ? `Snapshot is ${age}s old (the Trade tab was not open to refresh it).` : 'Fresh snapshot of the Trade chart.' }] }; } },
  { n: 'get_candles', d: 'OHLCV candles for any symbol and timeframe (newest last).', s: S({ symbol: sym, timeframe: tf, limit: { type: 'integer', minimum: 5, maximum: 500, description: 'Bars to return (default 100)' } }, ['symbol']),
    f: async (u, a) => { const c = await MT.candles(a.symbol, a.timeframe || '5m'), n = Math.min(500, Math.max(5, a.limit || 100)); return text({ symbol: c.sym, name: c.name, exchange: c.ex, timeframe: c.tf, price: c.price, delayed: c.delayed, columns: ['time_utc', 'open', 'high', 'low', 'close', 'volume'], bars: c.bars.slice(-n).map(x => [new Date(x[0] * 1000).toISOString().slice(0, 16) + 'Z', ...x.slice(1).map(r4)]) }); } },
  { n: 'analyze_chart', d: 'Plain-English technical read of any symbol and timeframe: trend, RSI, MACD, ADX, Bollinger, VWAP, ATR, volume, support and resistance.', s: S({ symbol: sym, timeframe: tf }, ['symbol']),
    f: async (u, a) => { const c = await MT.candles(a.symbol, a.timeframe || '15m'); return text(analyze(toBars(c), c.tf, c.sym), 1); } },
  { n: 'get_indicators', d: 'Compute specific indicators on any symbol and timeframe (latest value and the last few values). Keys come from list_indicators.', s: S({ symbol: sym, timeframe: tf, indicators: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, params: { type: 'object', description: 'e.g. {"n": 21}' } }, required: ['key'] } }, bars: { type: 'integer', minimum: 1, maximum: 50, description: 'How many latest values per series (default 5)' } }, ['symbol', 'indicators']),
    f: async (u, a) => { const c = await MT.candles(a.symbol, a.timeframe || '15m'), B = toBars(c), k = Math.min(50, a.bars || 5); return text({ symbol: c.sym, timeframe: c.tf, results: Object.fromEntries((a.indicators || []).slice(0, 12).map(i => [i.key, Object.fromEntries(ind(B, c.tf, i.key, i.params).map(o => [o.id, o.v.slice(-k).map(r4)]))])) }); } },
  { n: 'list_indicators', d: 'All 39 indicators the chart supports with their parameters.', s: S({}),
    f: async () => text(IND ? Object.entries(IND.INDS).map(([k, d]) => ({ key: k, name: d.n, group: d.g, description: d.d, params: d.p.map(([n, l, v, mn, mx]) => ({ name: n, label: l, default: v, min: mn, max: mx })), where: d.pane ? 'own pane' : d.vol ? 'bottom' : 'on price' })) : 'unavailable') },
  { n: 'get_quote', d: 'Latest price for a symbol.', s: S({ symbol: sym }, ['symbol']), f: async (u, a) => text({ symbol: MT.norm(a.symbol), price: await MT.quote(a.symbol), at: new Date().toISOString() }) },
  { n: 'search_symbols', d: 'Find a symbol by company or asset name.', s: S({ query: { type: 'string' } }, ['query']), f: async (u, a) => text((await MT.api(u.uid, 'search', {}, { q: a.query })).results) },
  { n: 'get_account', d: 'The user\'s paper accounts: Manual Trading (you) and the Opposite Bot, with equity, cash, positions, open orders and recent fills.', s: S({}), f: async u => text(await MT.api(u.uid, 'state', {}, {}), 1) },
  { n: 'place_order', w: 1, d: 'Place a PAPER order on the user\'s Manual Trading account. market fills now; limit and stop rest until touched. Optional stop_loss and take_profit make a bracket. The Opposite Bot (if on) takes the reverse side.', s: S({ symbol: sym, side: { type: 'string', enum: ['buy', 'sell'] }, quantity: { type: 'number', description: 'Shares / contracts (whole) or coins (crypto)' }, type: { type: 'string', enum: ['market', 'limit', 'stop'] }, price: { type: 'number', description: 'For limit / stop' }, stop_loss: { type: 'number' }, take_profit: { type: 'number' } }, ['symbol', 'side', 'quantity']),
    f: async (u, a) => text(await MT.api(u.uid, 'order', { sym: a.symbol, side: a.side, qty: a.quantity, kind: a.type || 'market', px: a.price, sl: a.stop_loss, tp: a.take_profit }, {})) },
  { n: 'cancel_order', w: 1, d: 'Cancel a resting order by id (ids are in get_account).', s: S({ id: { type: 'string' } }, ['id']), f: async (u, a) => text(await MT.api(u.uid, 'cancel', { id: a.id }, {})) },
  { n: 'close_position', w: 1, d: 'Close the user\'s whole position in a symbol at market.', s: S({ symbol: sym }, ['symbol']), f: async (u, a) => text(await MT.api(u.uid, 'close', { sym: a.symbol }, {})) },
  { n: 'end_trading_day', w: 1, d: 'Cancel every order and close every position (yours and the Opposite Bot\'s) at market.', s: S({}), f: async u => text(await MT.api(u.uid, 'endday', {}, {})) },
  { n: 'set_opposite_bot', w: 1, d: 'Turn the Opposite Bot (it takes the reverse of every manual trade) on or off.', s: S({ on: { type: 'boolean' } }, ['on']), f: async (u, a) => text(await MT.api(u.uid, 'opp', { on: a.on }, {})) },
  { n: 'set_chart', d: 'Change what the user\'s Trade chart shows: symbol, timeframe, chart style, candle colours.', s: S({ symbol: sym, timeframe: tf, chart_type: { type: 'string', enum: ['candle', 'sharp', 'hollow', 'ha', 'bar', 'line', 'smooth', 'base'] }, colors: { type: 'string', enum: ['gr', 'bw', 'mono'], description: 'gr green/red, bw blue/gray, mono black/white' } }),
    f: async (u, a) => { await pushCmd(u.uid, { k: 'set', sym: a.symbol && MT.norm(a.symbol), tf: a.timeframe, type: a.chart_type, cs: a.colors }); return text('Sent to the chart (it applies within ~3 seconds while the Trade tab is open).'); } },
  { n: 'set_indicators', d: 'Add or remove indicators on the user\'s Trade chart (keys from list_indicators; params optional).', s: S({ add: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, params: { type: 'object' } }, required: ['key'] } }, remove: { type: 'array', items: { type: 'string' } }, clear: { type: 'boolean' } }),
    f: async (u, a) => { for (const i of a.add || []) if (!IND?.INDS[i.key]) throw err(400, 'unknown indicator ' + i.key); await pushCmd(u.uid, { k: 'ind', add: a.add || [], remove: a.remove || [], clear: !!a.clear }); return text('Sent to the chart.'); } },
  { n: 'draw_on_chart', d: 'Draw on the user\'s chart: a horizontal line at a price, a trend line between two (time, price) points, or clear the drawings for a symbol.', s: S({ kind: { type: 'string', enum: ['hline', 'trend', 'clear'] }, symbol: sym, price: { type: 'number' }, from: { type: 'object', properties: { time: { type: 'string', description: 'ISO time or unix seconds' }, price: { type: 'number' } } }, to: { type: 'object', properties: { time: { type: 'string' }, price: { type: 'number' } } } }, ['kind']),
    f: async (u, a) => { const ts = x => { const n = Number(x); return n > 1e9 ? n : Math.floor(Date.parse(x) / 1000); }; const c = { k: a.kind, sym: a.symbol && MT.norm(a.symbol) };
      if (a.kind == 'hline') c.p = a.price; if (a.kind == 'trend') Object.assign(c, { t1: ts(a.from?.time), p1: a.from?.price, t2: ts(a.to?.time), p2: a.to?.price }); await pushCmd(u.uid, c); return text('Sent to the chart.'); } },
  { n: 'list_bots', d: 'Every bot in the app (old and Strategy Lab): paper balance, profit or loss, win rate, running or not.', s: S({}), f: async u => text((await LAB().api(u.uid, 'dash', {}, {})).bots.map(b => ({ id: b.route, name: b.name, group: b.group, running: b.enabled, balance: b.balance != null ? Math.round(b.balance * 100) / 100 : null, profit: Math.round(b.pnl * 100) / 100, trades: b.n, win_rate_pct: b.n ? Math.round(b.won / b.n * 100) : null, open_trades: b.open }))) },
  { n: 'get_bot', d: 'Details of a Strategy Lab bot (ids like fvg, fib, stdv, qt, liq, amt, putwall, callwall, flip, vex, oflow, quant, top, proven, pairs, macro, wallst, lv2, foot, cvd, heat): rules, settings, status, account and recent trades.', s: S({ id: { type: 'string' } }, ['id']),
    f: async (u, a) => { const s = await LAB().api(u.uid, 'state', {}, { id: a.id }); return text({ name: s.meta.name, group: s.meta.group, about: s.meta.blurb, rules: s.meta.how, settings: s.cfg, running: s.enabled, status: s.view?.status, account: s.account, recent_trades: s.trades.slice(0, 15).map(t => ({ when: new Date(t.ts).toISOString(), sym: t.sym, dir: t.dir, qty: t.qty, entry: t.entry, exit: t.exitp, pnl: t.pnl, status: t.status, why: t.why })), honest_note: s.meta.honest }, 1); } },
  { n: 'set_bot_running', w: 1, d: 'Start or stop a Strategy Lab bot (paper account).', s: S({ id: { type: 'string' }, on: { type: 'boolean' } }, ['id', 'on']), f: async (u, a) => text(await LAB().api(u.uid, a.on ? 'start' : 'stop', { id: a.id }, { id: a.id })) },
  { n: 'run_backtest', d: 'Backtest a Strategy Lab bot with its current settings over N days / sessions / years (see the bot\'s own choices).', s: S({ id: { type: 'string' }, days: { type: 'number' } }, ['id']), f: async (u, a) => { const r = await LAB().api(u.uid, 'bt', { id: a.id, days: a.days }, { id: a.id }); delete r.curve; return text(r, 1); } },
];
const byName = Object.fromEntries(TOOLS.map(t => [t.n, t]));

/* ---------- JSON-RPC over HTTP ---------- */
const VERS = ['2025-06-18', '2025-03-26', '2024-11-05'];
async function rpc(m, u) {
  const id = m.id; if (m.id === undefined) return null; const ok = result => ({ jsonrpc: '2.0', id, result }), bad = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  switch (m.method) {
    case 'initialize': return ok({ protocolVersion: VERS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mimic', title: 'Mimic trading', version: '1.0.0' }, instructions: 'Mimic is a paper-trading app. Use get_chart_view / get_chart_screenshot to see what the user is looking at, analyze_chart or get_indicators for technical reads, set_chart / set_indicators / draw_on_chart to change their chart, get_account / place_order for the paper accounts, and list_bots / get_bot / run_backtest for the strategy bots. Everything is simulated money. Give analysis, not guarantees.' });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS.map(t => ({ name: t.n, description: t.d + (t.w ? ' (moves paper money: needs "Allow Claude to trade")' : ''), inputSchema: t.s, annotations: { readOnlyHint: !t.w && !/^(set_|draw_)/.test(t.n), destructiveHint: !!t.w && /end_|close_|cancel_/.test(t.n), openWorldHint: false } })) });
    case 'tools/call': { const t = byName[m.params?.name]; if (!t) return bad(-32602, 'Unknown tool ' + m.params?.name);
      if (t.w && !u.trade) return ok({ content: [{ type: 'text', text: 'Trading is switched off for this connection. The user can switch on "Allow Claude to trade" in Mimic > Settings.' }], isError: true });
      try { return ok(await t.f(u, m.params.arguments || {})); } catch (e) { return ok({ content: [{ type: 'text', text: String(e.message || e).slice(0, 600) }], isError: true }); } }
    case 'resources/list': return ok({ resources: [] }); case 'prompts/list': return ok({ prompts: [] });
    default: return bad(-32601, 'Method not found: ' + m.method);
  }
}
async function http(req, res) {
  res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', 'authorization, content-type, mcp-session-id, mcp-protocol-version, accept'); res.setHeader('access-control-allow-methods', 'POST, GET, DELETE, OPTIONS'); res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end(); if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return res.status(405).json({ error: 'Use POST (MCP Streamable HTTP, JSON responses)' }); }
  const u = await auth(req).catch(() => null); if (!u) { res.setHeader('www-authenticate', 'Bearer realm="mimic"'); return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing or invalid token. Create one in Mimic > Settings > Claude.' } }); }
  const b = req.body; if (!b || typeof b !== 'object') return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  const out = (await Promise.all((Array.isArray(b) ? b : [b]).map(m => rpc(m, u)))).filter(Boolean); if (!out.length) return res.status(202).end();
  return res.status(200).json(Array.isArray(b) ? out : out[0]);
}
module.exports = { http, info, newToken, revoke, setTrade, view, pushCmd, rpc, auth, analyze, TOOLS };
