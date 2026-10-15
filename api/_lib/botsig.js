// Bots as chart indicators: every bot's own rules, turned into marks (entries, exits, armed orders), price levels and lines for the Trade chart.
// Each bot keeps its own instrument and data; when the chart shows another symbol the reply says which symbols the bot works on.
const L = require('./lab'), db = require('./db');
const ms = t => (t < 1e12 ? t * 1000 : t);
const CH = { NQ: 'NQ=F', ES: 'ES=F', MNQ: 'NQ=F', MES: 'ES=F', BTC: 'BTC-USD', SPY: 'SPY' }, toChart = s => CH[s] || s;
const fromChart = s => ({ 'NQ=F': 'NQ', 'MNQ=F': 'NQ', 'ES=F': 'ES', 'MES=F': 'ES', 'BTC-USD': 'BTC' }[s] || s);
const OLD = { // bots outside the Strategy Lab that trade a price chart
  b_powell: { name: 'Powell Strategy', syms: ['NQ', 'ES'], d: 'Opening-range sweep and reversal on NQ / ES (the Powell Strategy bot)' },
  b_supertrend: { name: 'Supertrend Bot', syms: ['NQ', 'ES'], d: 'Supertrend flips with the ADX trend filter (the Supertrend bot)' },
  b_sweep: { name: 'Sweep Bot', syms: ['NQ', 'ES'], d: 'Liquidity sweep of the key levels, then the reversal (the Sweep bot)' },
  b_gex: { name: 'GEX Levels', syms: ['SPY'], d: 'Gamma flip, call wall and put wall from the SPY options chain (the GEX bot)' },
  b_swing: { name: 'Swing Trader', syms: null, d: 'Dip buys in an uptrend: above the 200-day average and RSI-2 oversold; exit above the 5-day average' },
  b_news: { name: 'Newsflash', syms: null, d: 'Your Newsflash bot\'s trades on this symbol (buys on strong headlines)' },
  b_btc: { name: 'BTC Up or Down', syms: ['BTC'], d: 'Your BTC Up or Down bot\'s bets (up / down) on the bitcoin chart' } };
function list() {
  const lab = Object.values(L.REG).map(s => ({ k: 'b_' + s.id, name: s.name, group: s.group, syms: s.syms ? s.syms.map(toChart) : null, d: s.blurb || '' }));
  return [...lab, ...Object.entries(OLD).map(([k, v]) => ({ k, name: v.name, group: 'Bots', syms: v.syms ? v.syms.map(toChart) : null, d: v.d }))]; }
const out = (o) => ({ marks: [], levels: [], lines: [], zones: [], status: '', ...o });
function fromView(v, extra = []) { // a Strategy Lab view -> marks and levels
  const marks = [...extra];
  for (const e of v.events || []) if (e.type === 'fill' || e.type === 'exit' || e.type === 'arm') marks.push({ t: ms(e.t), type: e.type == 'fill' ? 'entry' : e.type, dir: e.dir, p: e.p, why: e.why || '' });
  const levels = [], d = v.draw || {};
  for (const l of d.levels || []) if (l && (l.p ?? l.y) != null) levels.push({ p: l.p ?? l.y, name: l.name || l.label || '', color: l.color || null });
  const zones = (d.zones || []).map(z => ({ y0: z.y0, y1: z.y1, name: z.name || '' }));
  for (const [k, x] of [['pos', v.pos], ['order', v.order]]) if (x) { const w = k == 'pos' ? 'open' : 'armed';
    if (x.entry != null) levels.push({ p: x.entry, name: `${w} ${x.dir === 1 || x.dir === 'long' ? 'long' : 'short'}`, color: '#2962ff' }); if (x.stop != null) levels.push({ p: x.stop, name: 'stop', color: '#f23645' }); if (x.target != null) levels.push({ p: x.target, name: 'target', color: '#089981' }); }
  return out({ marks, levels, zones, status: v.status || '' }); }
async function sig(uid, k, chartSym) {
  const want = fromChart(chartSym);
  if (k.startsWith('b_') && L.REG[k.slice(2)]) { const s = L.REG[k.slice(2)], syms = s.syms;
    if (s.kind === 'port') { const v = await s.view(L.norm(s, {}), { uid }), h = (v.holdings || []).find(x => x.sym === chartSym || x.sym === want);
      return out({ status: h ? `${s.name} holds ${chartSym}: ${(h.w * 100).toFixed(1)}% of the book. ${h.why || ''}` : `${s.name} does not hold ${chartSym} now. Holds ${(v.holdings || []).slice(0, 6).map(x => x.sym).join(', ') || 'nothing'}.`, held: !!h, levels: h && h.px ? [{ p: h.px, name: 'bot entry', color: '#2962ff' }] : [] }); }
    if (syms && !syms.includes(want)) return out({ off: syms.map(toChart), status: `${s.name} trades ${syms.map(toChart).join(' / ')}. Open that symbol to see its signals.` });
    const cfg = L.norm(s, { sym: syms ? want : undefined }), v = await s.view(cfg, { uid }), extra = [];
    if (s.run && s.group === 'ICT') try { const ICT = require('./ict'), b = await L.bars5(cfg.sym, 3e5), ses = ICT.sessions(b), atr = ICT.atrSeries(b); // the last 10 sessions of trades, not just today
      for (let i = Math.max(0, ses.length - 11); i < ses.length - 1; i++) for (const T of s.run(b, ses, i, cfg, Infinity, atr).trades) { extra.push({ t: ms(T.entryT), type: 'entry', dir: T.dir, p: T.entry, why: T.why0 || T.label || '' }); if (T.exitT) extra.push({ t: ms(T.exitT), type: 'exit', dir: T.dir, p: T.exit, why: T.why || '' }); } } catch (e) {}
    return fromView(v, extra); }
  const o = OLD[k]; if (!o) throw Object.assign(new Error('unknown bot'), { status: 400 });
  if (o.syms && !o.syms.includes(want)) return out({ off: o.syms.map(toChart), status: `${o.name} trades ${o.syms.map(toChart).join(' / ')}. Open that symbol to see its signals.` });
  if (k === 'b_powell') { const P = require('./powell'), G = require('./gex'), d = await P.candles(want), rows = P.analyze(d.days).slice(-10), marks = [], levels = [];
    const at = (date, m) => G.etToEpoch(date) - (960 - m) * 6e4;
    for (const r of rows) { const g = r.signal; if (!g || g.skip) continue; const dir = g.dir == 'long' ? 1 : -1; marks.push({ t: at(r.date, g.m), type: 'entry', dir, p: g.entry, why: `${g.kind} sweep` }); if (g.exitM != null) marks.push({ t: at(r.date, g.exitM), type: 'exit', dir, p: g.exit, why: g.outcome }); }
    const last = rows[rows.length - 1]; if (last?.levels) for (const [n, nm] of [['orh', 'opening range high'], ['orl', 'opening range low'], ['swh', 'swing high'], ['swl', 'swing low']]) if (last.levels[n] != null) levels.push({ p: last.levels[n], name: nm, color: '#ff9800' });
    return out({ marks, levels, status: last?.signal ? `Last signal ${last.date}: ${last.signal.dir} at ${last.signal.entry}` : 'No signal in the latest session.' }); }
  if (k === 'b_supertrend') { const ST = require('./supertrend'), d = await ST.chartData(want, { sym: want, atr: ST.DEF.atr, mult: ST.DEF.mult, adx: true, max: 3, risk: .5 }), marks = [], line = [];
    let pd = null; for (const r of d.bars) { const t = ms(r[0]); if (r[5] != null) line.push([t, r[5], r[6]]); if (pd != null && r[6] != null && r[6] !== pd) marks.push({ t, type: 'entry', dir: r[6] > 0 ? 1 : -1, p: r[4], why: `flip ${r[6] > 0 ? 'up' : 'down'}${r[7] != null ? ', ADX ' + r[7] : ''}` }); if (r[6] != null) pd = r[6]; }
    return out({ marks, lines: [{ id: 'st', pts: line, color2: true }], status: 'Supertrend with the ADX filter (signals need ADX above the minimum).' }); }
  if (k === 'b_sweep') { const I = require('./ictbot'), d = await I.chartData(want, { ...I.DEF, sym: want });
    return fromView({ status: d.status?.text || d.status || '', events: d.events, draw: { levels: (d.levels || []).map(l => ({ p: l.p, name: l.name, color: l.side === 'high' || l.side === 'buy' ? '#f23645' : '#089981' })) }, pos: d.pos, order: d.order }); }
  if (k === 'b_gex') { const G = require('./gex'), s = await G.snapshot(), st = s.strikes || [], cw = st.reduce((m, x) => x.call > (m?.call || 0) ? x : m, null), pw = st.reduce((m, x) => x.put < (m?.put || 0) ? x : m, null), levels = [];
    if (s.flip) levels.push({ p: s.flip, name: 'gamma flip', color: '#ff9800' }); if (cw) levels.push({ p: cw.K, name: 'call wall', color: '#089981' }); if (pw) levels.push({ p: pw.K, name: 'put wall', color: '#f23645' }); if (s.maxK) levels.push({ p: s.maxK, name: 'max gamma', color: '#b04dff' });
    return out({ levels, status: `Dealers are ${s.regime} gamma (net ${(s.net / 1e9).toFixed(2)}B per 1%).` }); }
  if (k === 'b_swing') { if (!/^[A-Z][A-Z.\-]{0,5}$/.test(chartSym)) return out({ status: 'Swing Trader works on US stocks and ETFs.', off: ['SPY', 'AAPL'] }); const W = require('./swing'), d = await W.chart(uid, chartSym), T = d.bars.map(b => Date.parse(b.d + 'T20:00:00Z'));
    const marks = d.buys.map(i => ({ t: T[i], type: 'entry', dir: 1, p: d.bars[i].c, why: 'dip in an uptrend' })), lines = [{ id: 's200', pts: d.s200.map((v, i) => [T[i], v]), color: '#ff9800' }, { id: 's5', pts: d.s5.map((v, i) => [T[i], v]), color: '#2962ff' }];
    return out({ marks, lines, daily: true, status: `Rules: buy above the 200-day average when RSI-2 < ${d.rules.rsi}; sell above the 5-day average.` }); }
  if (k === 'b_news') { const r = await db.q('SELECT ts, entry, exitp, exitts, headline FROM ntrades WHERE uid=$1 AND sym=$2 ORDER BY ts DESC LIMIT 40', [uid, chartSym]), marks = [];
    for (const t of r) { marks.push({ t: Number(t.ts), type: 'entry', dir: 1, p: t.entry, why: t.headline || '' }); if (t.exitts) marks.push({ t: Number(t.exitts), type: 'exit', dir: 1, p: t.exitp, why: '' }); }
    return out({ marks, status: r.length ? `${r.length} Newsflash trade${r.length > 1 ? 's' : ''} on ${chartSym}.` : `Newsflash has not traded ${chartSym}.` }); }
  if (k === 'b_btc') { const r = await db.q('SELECT ts, side, price, status, pnl FROM btctrades WHERE uid=$1 ORDER BY ts DESC LIMIT 60', [uid]);
    return out({ marks: r.map(t => ({ t: Number(t.ts), type: 'entry', dir: t.side === 'up' ? 1 : -1, p: null, why: `${t.side} at ${Math.round(t.price * 100)}¢${t.pnl != null ? ', ' + (t.pnl >= 0 ? 'won' : 'lost') : ''}` })), status: r.length ? `${r.length} recent BTC Up or Down bets.` : 'No BTC Up or Down bets yet.' }); }
}
module.exports = { list, sig };
