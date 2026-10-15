// Manual Trading: a TradingView-style chart (TradingView's open-source Lightweight Charts) with timeframes, chart types, indicators, drawing tools
// and a paper order ticket for stocks, ETFs, futures and crypto. Plus the Opposite Bot: it takes the reverse of every fill you get.
let TR = null; // set on first visit (LS lives in app.js, loaded after this file)
const trInit = () => TR || (TR = { sym: LS.get('mt:sym', 'SPY'), tf: LS.get('mt:tf', '5m'), type: LS.get('mt:type', 'candle'), ind: LS.get('mt:ind', ['ema9', 'ema21', 'vwap', 'vol']), side: 'buy', kind: 'market', tool: null, pend: null });
let trChart = null, trMain = null, trS = {}, trData = null, trState = null, trT1 = null, trT2 = null, trLines = [], trDraw = [];
const trSheet = n => { if (n) document.body.dataset.trs = n; else delete document.body.dataset.trs; if (n == 'sym') setTimeout(() => $('#trq')?.focus(), 250); };
const trStop = () => { trSheet(null); clearInterval(trT1); clearInterval(trT2); trT1 = trT2 = null; if (trChart) { trChart.remove(); trChart = null; } removeEventListener('themechange', trTheme); };
const mtapi = async (op, body, qs = '') => { const r = await fetch('/api/powell' + (body ? '' : `?op=mt-${op}${qs}`), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'mt-' + op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j; };
const TFS = [['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['30m', '30m'], ['1h', '1H'], ['4h', '4H'], ['1d', '1D'], ['1w', '1W'], ['1mo', '1M']];
const TYPES = [['candle', 'Candles'], ['hollow', 'Hollow'], ['ha', 'Heikin Ashi'], ['bar', 'Bars'], ['line', 'Line'], ['area', 'Area']];
const WATCH = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'NQ=F', 'ES=F', 'GC=F', 'CL=F', 'BTC-USD', 'ETH-USD', 'SOL-USD'];
const IND = { // key: [label, kind ('ov' overlay | 'pane'), color]
  sma20: ['SMA 20', 'ov', '#f5a623'], sma50: ['SMA 50', 'ov', '#a78bfa'], sma200: ['SMA 200', 'ov', '#ef4444'], ema9: ['EMA 9', 'ov', '#22c55e'], ema21: ['EMA 21', 'ov', '#3b82f6'],
  vwap: ['VWAP', 'ov', '#ec4899'], bb: ['Bollinger 20, 2', 'ov', '#94a3b8'], st: ['Supertrend 10, 3', 'ov', ''], ichi: ['Ichimoku', 'ov', ''], vol: ['Volume', 'vol', ''],
  rsi: ['RSI 14', 'pane', '#a78bfa'], macd: ['MACD 12, 26, 9', 'pane', '#3b82f6'], stoch: ['Stochastic 14, 3', 'pane', '#f5a623'], atr: ['ATR 14', 'pane', '#14b8a6'], obv: ['OBV', 'pane', '#ec4899'] };
const trN = (x, d) => x == null || !isFinite(x) ? '-' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(x) >= 1000 ? 2 : Math.abs(x) >= 1 ? 2 : 4), maximumFractionDigits: d ?? (Math.abs(x) >= 1000 ? 2 : Math.abs(x) >= 1 ? 2 : 6) });
const trM = x => (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const trCss = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const TZ = () => -new Date().getTimezoneOffset() * 60; // the chart library shows UTC: shift to local time

/* ---------- indicator math (on arrays of closes / bars) ---------- */
const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
const ema = (a, n) => { const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null; for (let i = 0; i < a.length; i++) { if (a[i] == null) continue; e = e == null ? a[i] : a[i] * k + e * (1 - k); if (i >= n - 1) o[i] = e; } return o; };
const sdv = (a, n, m) => a.map((_, i) => { if (m[i] == null) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += (a[k] - m[i]) ** 2; return Math.sqrt(s / n); });
const trueRange = B => B.map((b, i) => i ? Math.max(b.h - b.l, Math.abs(b.h - B[i - 1].c), Math.abs(b.l - B[i - 1].c)) : b.h - b.l);
const rma = (a, n) => { const o = new Array(a.length).fill(null); let r = null; for (let i = 0; i < a.length; i++) { if (i < n - 1) continue; if (r == null) { let s = 0; for (let k = 0; k < n; k++) s += a[i - k]; r = s / n; } else r = (r * (n - 1) + a[i]) / n; o[i] = r; } return o; };
function rsiA(c, n = 14) { const g = c.map((x, i) => i ? Math.max(x - c[i - 1], 0) : 0), l = c.map((x, i) => i ? Math.max(c[i - 1] - x, 0) : 0), ag = rma(g, n), al = rma(l, n); return c.map((_, i) => ag[i] == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i])); }
function vwapA(B, tf) { const daily = /^(1d|1w|1mo)$/.test(tf), o = []; let pv = 0, v = 0, d = null; for (const b of B) { const k = daily ? 0 : new Date((b.t - 4 * 3600) * 1000).toISOString().slice(0, 10); if (k !== d) { pv = 0; v = 0; d = k; } const tp = (b.h + b.l + b.c) / 3, vv = b.v || 1; pv += tp * vv; v += vv; o.push(pv / v); } return o; }
function superA(B, n = 10, m = 3) { const atr = rma(trueRange(B), n), up = [], dn = [], dir = []; for (let i = 0; i < B.length; i++) { const hl = (B[i].h + B[i].l) / 2; if (atr[i] == null) { up.push(null); dn.push(null); dir.push(1); continue; }
  let u = hl + m * atr[i], d = hl - m * atr[i]; const pu = up[i - 1], pd = dn[i - 1]; if (pu != null && !(u < pu || B[i - 1].c > pu)) u = pu; if (pd != null && !(d > pd || B[i - 1].c < pd)) d = pd; let r = dir[i - 1] ?? 1; if (r === 1 && B[i].c < d) r = -1; else if (r === -1 && B[i].c > u) r = 1; up.push(u); dn.push(d); dir.push(r); }
  return B.map((_, i) => atr[i] == null ? null : { v: dir[i] === 1 ? dn[i] : up[i], d: dir[i] }); }
function stochA(B, n = 14, s = 3) { const k = B.map((b, i) => { if (i < n - 1) return null; let h = -Infinity, l = Infinity; for (let j = i - n + 1; j <= i; j++) { h = Math.max(h, B[j].h); l = Math.min(l, B[j].l); } return h === l ? 50 : (b.c - l) / (h - l) * 100; }); const ks = k.map((x, i) => { if (i < n + s - 2) return null; let t = 0; for (let j = i - s + 1; j <= i; j++) t += k[j]; return t / s; }); const d = ks.map((x, i) => { if (i < n + 2 * s - 3) return null; let t = 0; for (let j = i - s + 1; j <= i; j++) t += ks[j]; return t / s; }); return { k: ks, d }; }
const midHL = (B, i, n) => { if (i < n - 1) return null; let h = -Infinity, l = Infinity; for (let j = i - n + 1; j <= i; j++) { h = Math.max(h, B[j].h); l = Math.min(l, B[j].l); } return (h + l) / 2; };

/* ---------- page ---------- */
async function tradePage() {
  trInit(); trStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', tradePage); await signedIn(me.user); }
  document.body.classList.add('wide');
  app.innerHTML = `<div class=trwrap>
   <div class=trhead><div class=trsym><div class=trsearch><input class=inp id=trq value="${esc(TR.sym)}" autocomplete=off spellcheck=false aria-label="Symbol"><div id=trres class=trres hidden></div></div>
     <div><div class=trname id=trname>&nbsp;</div><div class=row style="gap:10px;align-items:baseline"><b class="num trpx" id=trpx>-</b><span class=num id=trchg></span><span class="pill n" id=trdel hidden>delayed ~10 min</span></div></div></div>
     <div class=trwatch>${WATCH.map(s => `<button class="chip ${s == TR.sym ? 'on' : ''}" data-s="${s}">${s.replace('-USD', '').replace('=F', '')}</button>`).join('')}</div></div>
   <div class=trgrid><div class="card trchartcard">
     <div class=trbar><div class=seg id=trtf>${TFS.map(([k, l]) => `<button data-v=${k} class="${TR.tf == k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class=trtools><select class="inp trsel" id=trtype>${TYPES.map(([k, l]) => `<option value=${k} ${TR.type == k ? 'selected' : ''}>${l}</option>`).join('')}</select>
       <div class=trdd><button class="btn sm" id=trindb>${ic('flask', 14)} Indicators <span class="pill n" id=trindn>${TR.ind.length}</span></button><div class=trmenu id=trind hidden>${Object.entries(IND).map(([k, [l]]) => `<label><input type=checkbox value=${k} ${TR.ind.includes(k) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
       <button class="btn sm ${TR.tool == 'h' ? 'on' : ''}" id=trh title="Horizontal line: click the chart">― Line</button><button class="btn sm ${TR.tool == 't' ? 'on' : ''}" id=trt title="Trend line: click two points">╱ Trend</button><button class="btn sm" id=trclr title="Remove the drawings on this symbol">${ic('x', 13)}</button><button class="btn sm" id=trfit title="Fit everything">Fit</button></div></div>
     <div class=trchart id=trc><div class=trmov><div class=trmtop><b id=trmsym></b><span class=trmexch id=trmex></span></div><div class=trmpx><span class=num id=trmpx></span> <span class=num id=trmchg></span></div><div class=trqbs><button class="trqb sell" data-side=sell><b class=num id=trqsp>-</b>SELL</button><button class="trqb buy" data-side=buy><b class=num id=trqbp>-</b>BUY</button></div></div><div class=trlegend id=trleg></div></div></div>
    <div class=trside><div class="card pad trticket" id=trtk></div><div class="card pad" id=tracct></div><div class="card pad" id=tropp></div></div></div>
   <div class="card trtabs"><div class="row sb wrapf" style="padding:16px 20px 0;gap:10px"><div class=seg id=trtab>${[['pos', 'Positions'], ['ord', 'Orders'], ['fills', 'History']].map(([k, l], i) => `<button data-v=${k} class="${i ? '' : 'on'}">${l}</button>`).join('')}</div><button class="btn danger" id=trend>${ic('x', 14)} End trading day</button></div><div id=trtbl style="padding:6px 0 8px"></div></div></div>
   <div class=trscrim id=trscrim></div><div class=trmbar><button class=trmsy id=trmS><b id=trmsy></b><span id=trmtf></span></button><span class=trmsp></span><button id=trmD aria-label="Drawing tools"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><path d="M13.5 6.5l3 3"/></svg></button><button id=trmI aria-label="Timeframe and indicators"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx=16 cy=7 r=2 /><circle cx=10 cy=17 r=2 /></svg></button><button id=trmA aria-label="Account and positions"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=3 y=6 width=18 height=13 rx=3 /><path d="M16 12.5h2M3 9h18"/></svg></button></div>`;
  if (matchMedia('(max-width: 760px)').matches) $('.trside').append($('.trtabs')); // phones: positions live in the account sheet
  await trLib(); trBuild(); trWire(); trTicket(); await trLoad(true); trStateLoad();
  trT1 = setInterval(() => { if (!$('#trc')) return trStop(); trLoad(false); }, /^(1d|1w|1mo)$/.test(TR.tf) ? 3e4 : 5e3);
  trT2 = setInterval(() => { if (!$('#trc')) return trStop(); trStateLoad(); }, 4e3);
  addEventListener('themechange', trTheme);
}
function trLib() { return window.LightweightCharts ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/vendor/lwc.js'; s.onload = ok; s.onerror = () => no(new Error('chart library failed to load')); document.head.append(s); }); }
function trOpts() { const dark = document.documentElement.dataset.theme == 'dark', fg = trCss('--mut'), grid = trCss('--grid');
  return { layout: { background: { type: 'solid', color: 'transparent' }, textColor: fg, fontFamily: 'Poppins, -apple-system, sans-serif', fontSize: 11 }, grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6 }, crosshair: { mode: 0, vertLine: { color: dark ? '#555' : '#b5b5bd', labelBackgroundColor: dark ? '#222' : '#121214' }, horzLine: { color: dark ? '#555' : '#b5b5bd', labelBackgroundColor: dark ? '#222' : '#121214' } },
    localization: { priceFormatter: p => trN(p) } }; }
function trTheme() { if (trChart) { trChart.applyOptions(trOpts()); trPaint(); } }
function trBuild() {
  const el = $('#trc'); trChart = LightweightCharts.createChart(el, { ...trOpts(), autoSize: true });
  trChart.subscribeCrosshairMove(p => trLegend(p)); trChart.subscribeClick(p => trClick(p));
}
function trWire() {
  const q = $('#trq'), res = $('#trres'); let t = null;
  q.onfocus = () => q.select(); q.onkeydown = e => { if (e.key == 'Enter') { const f = res.querySelector('button'); trSet(f && !res.hidden ? f.dataset.s : q.value); res.hidden = true; q.blur(); } if (e.key == 'Escape') { res.hidden = true; q.blur(); } };
  q.oninput = () => { clearTimeout(t); const v = q.value.trim(); if (!v) { res.hidden = true; return; } t = setTimeout(async () => { try { const r = await mtapi('search', null, '&q=' + encodeURIComponent(v)); res.innerHTML = r.results.map(x => `<button data-s="${esc(x.sym)}"><b>${esc(x.sym)}</b><span>${esc(x.name)}</span><i>${esc(x.type.toLowerCase())} · ${esc(x.ex)}</i></button>`).join('') || '<div class=mut style="padding:12px">No matches</div>'; res.hidden = false; res.querySelectorAll('button').forEach(b => b.onmousedown = () => { trSet(b.dataset.s); res.hidden = true; }); } catch (e) {} }, 250); };
  q.onblur = () => setTimeout(() => { res.hidden = true; if (!q.value.trim()) q.value = TR.sym; }, 150);
  $$('.trwatch .chip').forEach(b => b.onclick = () => trSet(b.dataset.s));
  $('#trscrim').onclick = () => trSheet(null); $('#trmS').onclick = () => trSheet('sym'); $('#trmD').onclick = () => trSheet('tf'); $('#trmI').onclick = () => trSheet('tf'); $('#trmA').onclick = () => { trSheet('acct'); trStateLoad(); };
  $$('.trqb').forEach(b => b.onclick = () => { TR.side = b.dataset.side; trTicket(); trSheet('tk'); });
  $$('#trtf button').forEach(b => b.onclick = () => { trSheet(null); TR.tf = b.dataset.v; LS.set('mt:tf', TR.tf); $$('#trtf button').forEach(x => x.classList.toggle('on', x === b)); clearInterval(trT1); trT1 = setInterval(() => { if (!$('#trc')) return trStop(); trLoad(false); }, /^(1d|1w|1mo)$/.test(TR.tf) ? 3e4 : 5e3); trLoad(true); });
  $('#trtype').onchange = e => { TR.type = e.target.value; LS.set('mt:type', TR.type); trPaint(true); };
  $('#trindb').onclick = e => { e.stopPropagation(); $('#trind').hidden = !$('#trind').hidden; }; document.addEventListener('click', e => { const m = $('#trind'); if (m && !m.contains(e.target)) m.hidden = true; });
  $$('#trind input').forEach(c => c.onchange = () => { TR.ind = $$('#trind input:checked').map(x => x.value); LS.set('mt:ind', TR.ind); $('#trindn').textContent = TR.ind.length; trPaint(true); });
  $('#trh').onclick = () => { trSheet(null); TR.tool = TR.tool == 'h' ? null : 'h'; TR.pend = null; $('#trh').classList.toggle('on', TR.tool == 'h'); $('#trt').classList.remove('on'); };
  $('#trt').onclick = () => { trSheet(null); TR.tool = TR.tool == 't' ? null : 't'; TR.pend = null; $('#trt').classList.toggle('on', TR.tool == 't'); $('#trh').classList.remove('on'); };
  $('#trclr').onclick = () => { LS.set('mt:draw:' + TR.sym, []); trPaint(true); toast('Drawings removed'); };
  $('#trfit').onclick = () => trChart?.timeScale().fitContent();
  $$('#trtab button').forEach(b => b.onclick = () => { $$('#trtab button').forEach(x => x.classList.toggle('on', x === b)); trTable(); });
  $('#trend').onclick = async () => { if (!confirm('End the trading day? This cancels every open order and closes every position, yours and the Opposite Bot\'s, at the market.')) return; try { const r = await mtapi('endday', {}); toast(r.closed.length ? `Closed ${r.closed.length} position${r.closed.length > 1 ? 's' : ''}` : 'Nothing was open'); trStateLoad(); } catch (e) { toast(esc(e.message)); } };
}
function trSet(s) { s = String(s || '').trim().toUpperCase(); if (!s) return; trSheet(null); TR.sym = s; LS.set('mt:sym', s); $('#trq').value = s; $$('.trwatch .chip').forEach(b => b.classList.toggle('on', b.dataset.s == s)); trData = null; trLoad(true); trTicket(); }
async function trLoad(fresh) {
  const sym = TR.sym, tf = TR.tf; let d; try { d = await mtapi('candles', null, `&sym=${encodeURIComponent(sym)}&tf=${tf}`); } catch (e) { if (fresh) { $('#trname').textContent = e.message; toast(esc(e.message)); } return; }
  if (sym !== TR.sym || tf !== TR.tf || !$('#trc')) return; const was = trData, sameSet = was && was.sym === d.sym && was.tf === tf && !fresh; TR.sym = d.sym; $('#trq').value = d.sym;
  trData = { ...d, B: d.bars.map(x => ({ t: x[0] + TZ(), o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })) };
  const last = trData.B[trData.B.length - 1]; if (last && d.price && /m$|h$/.test(tf)) { last.c = d.price; last.h = Math.max(last.h, d.price); last.l = Math.min(last.l, d.price); }
  $('#trname').textContent = `${d.name} · ${d.ex}`; $('#trpx').textContent = trN(last?.c); const ch = d.prev ? (last.c / d.prev - 1) * 100 : null; $('#trchg').innerHTML = ch == null ? '' : `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${trN(last.c - d.prev)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</span>`; $('#trdel').hidden = !d.delayed; const short = d.sym.replace('-USD', '').replace('=F', ''), pxs = trN(last?.c); $('#trmsym').textContent = short; $('#trmex').textContent = d.delayed ? 'delayed' : ''; $('#trmpx').textContent = pxs; $('#trmchg').innerHTML = $('#trchg').innerHTML; $('#trqsp').textContent = pxs; $('#trqbp').textContent = pxs; $('#trmsy').textContent = short; $('#trmtf').textContent = TFS.find(x => x[0] == TR.tf)?.[1] || TR.tf;
  trPaint(!sameSet); trTicketPrice();
}
function trBars() { const B = trData.B; if (TR.type != 'ha') return B; const o = []; B.forEach((b, i) => { const c = (b.o + b.h + b.l + b.c) / 4, op = i ? (o[i - 1].o + o[i - 1].c) / 2 : (b.o + b.c) / 2; o.push({ t: b.t, o: op, c, h: Math.max(b.h, op, c), l: Math.min(b.l, op, c), v: b.v }); }); return o; }
function trPaint(rebuild) {
  if (!trChart || !trData) return; const B = trBars(), up = trCss('--up'), dn = trCss('--down'), C = B.map(b => b.c), T = B.map(b => b.t);
  if (rebuild) { for (const s of Object.values(trS)) trChart.removeSeries(s); trS = {}; trLines = []; }
  const L = (key, opt) => trS[key] || (trS[key] = trChart.addLineSeries({ lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...opt }));
  const ser = (a) => a.map((v, i) => v == null || !isFinite(v) ? { time: T[i] } : { time: T[i], value: v });
  // main series
  if (!trS.main) { const k = TR.type; trS.main = k == 'bar' ? trChart.addBarSeries({ upColor: up, downColor: dn, thinBars: false }) : k == 'line' ? trChart.addLineSeries({ color: trCss('--text'), lineWidth: 2 }) : k == 'area' ? trChart.addAreaSeries({ lineColor: trCss('--accent'), topColor: `rgba(${trCss('--accent-rgb')},.25)`, bottomColor: `rgba(${trCss('--accent-rgb')},0)`, lineWidth: 2 })
    : trChart.addCandlestickSeries({ upColor: k == 'hollow' ? 'rgba(0,0,0,0)' : up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn }); }
  trS.main.setData(/line|area/.test(TR.type) ? B.map(b => ({ time: b.t, value: b.c })) : B.map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })));
  trMain = trS.main;
  const panes = TR.ind.filter(k => IND[k]?.[1] == 'pane'), P = .17, mainBottom = panes.length * P + (TR.ind.includes('vol') ? .02 : .02);
  trS.main.priceScale().applyOptions({ scaleMargins: { top: .06, bottom: Math.min(.7, mainBottom + (TR.ind.includes('vol') ? .1 : .04)) } });
  const has = k => TR.ind.includes(k);
  if (has('vol')) { if (!trS.vol) trS.vol = trChart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }); trS.vol.priceScale().applyOptions({ scaleMargins: { top: 1 - mainBottom - .1, bottom: mainBottom } });
    trS.vol.setData(B.map(b => ({ time: b.t, value: b.v, color: b.c >= b.o ? up + '55' : dn + '55' }))); }
  for (const [k, n] of [['sma20', 20], ['sma50', 50], ['sma200', 200]]) if (has(k)) L(k, { color: IND[k][2] }).setData(ser(sma(C, n)));
  for (const [k, n] of [['ema9', 9], ['ema21', 21]]) if (has(k)) L(k, { color: IND[k][2] }).setData(ser(ema(C, n)));
  if (has('vwap')) L('vwap', { color: IND.vwap[2], lineWidth: 2 }).setData(ser(vwapA(B, TR.tf)));
  if (has('bb')) { const m = sma(C, 20), sd = sdv(C, 20, m); L('bbm', { color: IND.bb[2], lineStyle: 2 }).setData(ser(m)); L('bbu', { color: IND.bb[2] }).setData(ser(m.map((v, i) => v == null ? null : v + 2 * sd[i]))); L('bbl', { color: IND.bb[2] }).setData(ser(m.map((v, i) => v == null ? null : v - 2 * sd[i]))); }
  if (has('st')) { const s = superA(B); L('stu', { color: up, lineWidth: 2 }).setData(ser(s.map(x => x && x.d === 1 ? x.v : null))); L('std', { color: dn, lineWidth: 2 }).setData(ser(s.map(x => x && x.d === -1 ? x.v : null))); }
  if (has('ichi')) { const tk = B.map((_, i) => midHL(B, i, 9)), kj = B.map((_, i) => midHL(B, i, 26)), sa = B.map((_, i) => i >= 26 && tk[i - 26] != null && kj[i - 26] != null ? (tk[i - 26] + kj[i - 26]) / 2 : null), sb = B.map((_, i) => i >= 26 ? midHL(B, i - 26, 52) : null);
    L('ik', { color: '#3b82f6' }).setData(ser(tk)); L('ij', { color: '#ef4444' }).setData(ser(kj)); L('isa', { color: '#22c55e88' }).setData(ser(sa)); L('isb', { color: '#ef444488' }).setData(ser(sb)); }
  // oscillator panes, stacked from the bottom
  panes.forEach((k, i) => { const top = 1 - P * (i + 1) + .025, bottom = P * i + .01, ps = { priceScaleId: 'p_' + k }, mk = (key, opt) => { const s = L(key, { ...ps, ...opt }); s.priceScale().applyOptions({ scaleMargins: { top, bottom } }); return s; };
    if (k == 'rsi') { const s = mk('rsi', { color: IND.rsi[2], lastValueVisible: true }); s.setData(ser(rsiA(C))); if (!s._lv) { s.createPriceLine({ price: 70, color: '#ef444488', lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); s.createPriceLine({ price: 30, color: '#22c55e88', lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); s._lv = 1; } }
    if (k == 'macd') { const f = ema(C, 12), sl = ema(C, 26), m = f.map((v, i) => v == null || sl[i] == null ? null : v - sl[i]), sg = ema(m.map(x => x ?? 0), 9).map((v, i) => m[i] == null ? null : v);
      if (!trS.mh) { trS.mh = trChart.addHistogramSeries({ ...ps, priceLineVisible: false, lastValueVisible: false }); trS.mh.priceScale().applyOptions({ scaleMargins: { top, bottom } }); } trS.mh.setData(m.map((v, i) => v == null || sg[i] == null ? { time: T[i] } : { time: T[i], value: v - sg[i], color: v - sg[i] >= 0 ? up + '99' : dn + '99' }));
      mk('macd', { color: '#3b82f6', lastValueVisible: true }).setData(ser(m)); mk('macds', { color: '#f5a623' }).setData(ser(sg)); }
    if (k == 'stoch') { const s = stochA(B); mk('stk', { color: '#f5a623', lastValueVisible: true }).setData(ser(s.k)); mk('std2', { color: '#3b82f6' }).setData(ser(s.d)); }
    if (k == 'atr') mk('atr', { color: IND.atr[2], lastValueVisible: true }).setData(ser(rma(trueRange(B), 14)));
    if (k == 'obv') { let o = 0; mk('obv', { color: IND.obv[2], lastValueVisible: true }).setData(ser(B.map((b, j) => (o += j ? Math.sign(b.c - B[j - 1].c) * b.v : 0)))); } });
  // drawings
  for (const d of trDraw) try { trChart.removeSeries(d); } catch (e) {} trDraw = []; for (const pl of trLines) try { trS.main.removePriceLine(pl); } catch (e) {} trLines = [];
  for (const d of LS.get('mt:draw:' + TR.sym, [])) { if (d.k == 'h') trLines.push(trS.main.createPriceLine({ price: d.p, color: trCss('--accent'), lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' }));
    if (d.k == 't' && d.t2 > d.t1) { const s = trChart.addLineSeries({ color: trCss('--accent'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData([{ time: d.t1, value: d.p1 }, { time: d.t2, value: d.p2 }]); trDraw.push(s); } }
  trOrderLines(); if (rebuild) trChart.timeScale().fitContent(); trLegend();
}
function trOrderLines() { // your position and resting orders, drawn on the chart
  if (!trS.main || !trState) return; for (const pl of trS.main._ol || []) try { trS.main.removePriceLine(pl); } catch (e) {} const out = [];
  const p = trState.me.positions.find(x => x.sym == trData?.sym); if (p) out.push(trS.main.createPriceLine({ price: p.avg, color: p.qty > 0 ? trCss('--up') : trCss('--down'), lineWidth: 2, lineStyle: 0, title: `${p.qty > 0 ? 'Long' : 'Short'} ${trN(Math.abs(p.qty), p.mult === 1 && /-USD/.test(p.sym) ? undefined : 0)}  ${trM(p.upnl)}` }));
  for (const o of trState.orders.filter(x => x.sym == trData?.sym)) out.push(trS.main.createPriceLine({ price: o.px, color: o.side == 'buy' ? trCss('--up') : trCss('--down'), lineWidth: 1, lineStyle: 2, title: `${o.grp ? (o.kind == 'stop' ? 'SL' : 'TP') : o.kind} ${o.side} ${trN(o.qty, 0)}` }));
  trS.main._ol = out; }
function trLegend(p) {
  const el = $('#trleg'); if (!el || !trData) return; const B = trBars(); let i = B.length - 1; if (p && p.time != null) { const k = B.findIndex(b => b.t === p.time); if (k >= 0) i = k; } const b = B[i]; if (!b) return;
  const chg = i ? (b.c / B[i - 1].c - 1) * 100 : 0, vals = [];
  for (const k of TR.ind) { if (k == 'vol') { vals.push(`<span>Vol ${trN(b.v, 0)}</span>`); continue; } const s = trS[k == 'st' ? null : k == 'bb' ? 'bbm' : k == 'macd' ? 'macd' : k == 'stoch' ? 'stk' : k == 'ichi' ? 'ik' : k]; const d = s && p?.seriesData?.get(s); vals.push(`<span style="color:${IND[k][2] || 'var(--mut)'}">${IND[k][0]}${d?.value != null ? ' ' + trN(d.value) : ''}</span>`); }
  el.innerHTML = `<div><b>${esc(trData.sym)}</b> · ${TFS.find(x => x[0] == TR.tf)?.[1]} &nbsp;O <b>${trN(b.o)}</b> H <b>${trN(b.h)}</b> L <b>${trN(b.l)}</b> C <b>${trN(b.c)}</b> <span class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span></div><div class=trlv>${vals.join('')}</div>${TR.tool ? `<div class=trhint>${TR.tool == 'h' ? 'Click the chart to place a line' : TR.pend ? 'Click the second point' : 'Click the first point of the trend line'}</div>` : ''}`; }
function trClick(p) {
  if (!p || !p.point || !trS.main) return; const price = trS.main.coordinateToPrice(p.point.y); if (price == null) return;
  if (TR.tool == 'h') { const d = LS.get('mt:draw:' + TR.sym, []); d.push({ k: 'h', p: price }); LS.set('mt:draw:' + TR.sym, d); TR.tool = null; $('#trh').classList.remove('on'); trPaint(false); return; }
  if (TR.tool == 't' && p.time != null) { if (!TR.pend) { TR.pend = { t: p.time, p: price }; trLegend(); return; } const a = TR.pend, b = { t: p.time, p: price }, [x, y] = a.t <= b.t ? [a, b] : [b, a]; const d = LS.get('mt:draw:' + TR.sym, []); d.push({ k: 't', t1: x.t, p1: x.p, t2: y.t, p2: y.p }); LS.set('mt:draw:' + TR.sym, d); TR.tool = null; TR.pend = null; $('#trt').classList.remove('on'); trPaint(false); return; }
  if (TR.kind != 'market') { const f = $('#trpxin'); if (f) { f.value = +price.toPrecision(7); trEst(); } } // limit / stop: click the chart to set the price
}

/* ---------- order ticket, account, the Opposite Bot ---------- */
const trCrypto = () => /-USD$/.test(TR.sym), trFut = () => /=F$/.test(TR.sym);
function trTicket() {
  const el = $('#trtk'); if (!el) return; const q = LS.get('mt:qty:' + (trCrypto() ? 'c' : trFut() ? 'f' : 's'), trCrypto() ? .01 : 1), quick = trCrypto() ? [.001, .01, .1, 1] : trFut() ? [1, 2, 5, 10] : [1, 10, 50, 100];
  el.innerHTML = `<div class=trsides><button class="trbs buy ${TR.side == 'buy' ? 'on' : ''}" data-v=buy>Buy</button><button class="trbs sell ${TR.side == 'sell' ? 'on' : ''}" data-v=sell>Sell</button></div>
   <div class=seg id=trkind style="margin-top:14px;width:100%">${[['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop']].map(([k, l]) => `<button data-v=${k} class="${TR.kind == k ? 'on' : ''}" style="flex:1">${l}</button>`).join('')}</div>
   <label class=trf>Quantity <span class=mut>${trCrypto() ? 'coins' : trFut() ? 'contracts' : 'shares'}</span><input class=inp id=trqty type=number min=0 step=${trCrypto() ? 'any' : 1} value=${q}></label>
   <div class=trquick>${quick.map(x => `<button class="btn sm" data-q=${x}>${x}</button>`).join('')}</div>
   <label class=trf ${TR.kind == 'market' ? 'hidden' : ''}>${TR.kind == 'limit' ? 'Limit' : 'Stop'} price <span class=mut>or click the chart</span><input class=inp id=trpxin type=number step=any></label>
   <div class=g2x><label class=trf>Stop-loss <span class=mut>optional</span><input class=inp id=trsl type=number step=any placeholder="-"></label><label class=trf>Take-profit <span class=mut>optional</span><input class=inp id=trtp type=number step=any placeholder="-"></label></div>
   <div class=trest id=trest></div><button class="btn trgo ${TR.side}" id=trgo>${TR.side == 'buy' ? 'Buy' : 'Sell'} ${esc(TR.sym)}</button><div class=mut style="font-size:11.5px;margin-top:8px;text-align:center">Paper money. Nothing real is traded.</div>`;
  $$('.trbs').forEach(b => b.onclick = () => { TR.side = b.dataset.v; trTicket(); }); $$('#trkind button').forEach(b => b.onclick = () => { TR.kind = b.dataset.v; trTicket(); trTicketPrice(); });
  $$('.trquick button').forEach(b => b.onclick = () => { $('#trqty').value = b.dataset.q; trEst(); }); ['#trqty', '#trpxin', '#trsl', '#trtp'].forEach(s => $(s) && ($(s).oninput = trEst));
  $('#trgo').onclick = async () => { const go = $('#trgo'), qty = +$('#trqty').value; LS.set('mt:qty:' + (trCrypto() ? 'c' : trFut() ? 'f' : 's'), qty); go.disabled = true;
    try { const r = await mtapi('order', { sym: TR.sym, side: TR.side, kind: TR.kind, qty, px: +($('#trpxin')?.value || 0), sl: +$('#trsl').value || null, tp: +$('#trtp').value || null }); toast(r.filled ? `${TR.side == 'buy' ? 'Bought' : 'Sold'} ${qty} ${esc(TR.sym)} at ${trN(r.filled)}` : `${TR.kind} order placed`); $('#trsl').value = ''; $('#trtp').value = ''; trSheet(null); trStateLoad(); }
    catch (e) { toast(esc(e.message)); } finally { go.disabled = false; } };
  trTicketPrice(); }
function trTicketPrice() { const f = $('#trpxin'); if (f && !f.value && trData) f.value = +trData.B[trData.B.length - 1].c.toPrecision(7); trEst(); }
function trEst() { const el = $('#trest'); if (!el || !trData) return; const qty = +$('#trqty')?.value || 0, px = TR.kind == 'market' ? trData.B[trData.B.length - 1].c : +$('#trpxin')?.value || 0, m = trData.spec?.mult || 1, sl = +$('#trsl')?.value, tp = +$('#trtp')?.value, d = TR.side == 'buy' ? 1 : -1;
  el.innerHTML = `<div class="row sb"><span class=mut>${trFut() ? 'Contract value' : 'Cost'}</span><b class=num>${trM(qty * px * m)}</b></div>${sl ? `<div class="row sb"><span class=mut>Risk to stop</span><b class="num down">${trM(Math.abs(px - sl) * qty * m)}</b></div>` : ''}${tp ? `<div class="row sb"><span class=mut>Reward to target</span><b class="num up">${trM(Math.abs(tp - px) * qty * m)}</b></div>` : ''}${sl && tp ? `<div class="row sb"><span class=mut>Reward : risk</span><b class=num>${(Math.abs(tp - px) / Math.abs(px - sl)).toFixed(2)}</b></div>` : ''}`; }
async function trStateLoad() { try { trState = await mtapi('state'); } catch (e) { return; } if (!$('#tracct')) return; trAcct(); trTable(); trOrderLines(); }
function trAcct() { const me = trState.me, op = trState.opp, pm = me.equity - me.start, po = op.equity - op.start;
  $('#tracct').innerHTML = `<div class="row sb"><h2>Your account</h2><button class="btn sm" id=trrst>Reset</button></div><div class="num trbig">${trM(me.equity)}</div><div class="num ${pm >= 0 ? 'up' : 'down'}" style="font-weight:500">${pm >= 0 ? '+' : ''}${trM(pm)} (${(pm / me.start * 100).toFixed(2)}%)</div>
   <div class=trkv><div><span>Cash</span><b class=num>${trM(me.cash)}</b></div><div><span>Open P&L</span><b class="num ${me.upnl >= 0 ? 'up' : 'down'}">${trM(me.upnl)}</b></div><div><span>Closed trades</span><b class=num>${me.closed}</b></div><div><span>Won</span><b class=num>${me.closed ? Math.round(me.won / me.closed * 100) + '%' : '-'}</b></div></div>`;
  $('#tropp').innerHTML = `<div class="row sb"><div><h2>Opposite Bot</h2><div class=mut style="font-size:12.5px">Takes the reverse of every trade you make.</div></div><button class="trsw ${op.enabled ? 'on' : ''}" id=trop role=switch aria-checked=${op.enabled} aria-label="Opposite Bot on or off"><i></i></button></div>
   <div class="num trbig" style="margin-top:12px">${trM(op.equity)}</div><div class="num ${po >= 0 ? 'up' : 'down'}" style="font-weight:500">${po >= 0 ? '+' : ''}${trM(po)} (${(po / op.start * 100).toFixed(2)}%)</div>
   <div class=trvs><div><span>You</span><i style="--w:${Math.max(4, 50 + Math.max(-48, Math.min(48, (pm - po) / (Math.abs(pm) + Math.abs(po) || 1) * 48)))}%"></i><span>Opposite</span></div><b>${pm === po ? 'Even' : pm > po ? 'You are ahead' : 'The Opposite Bot is ahead'} by ${trM(Math.abs(pm - po))}</b></div>
   <div class=mut style="font-size:12px;margin-top:10px">${op.enabled ? 'On: you buy, it sells the same amount; you sell, it buys. It closes everything when you press End trading day.' : 'Off. Switch it on and it mirrors your next trades.'}</div>`;
  $('#trop').onclick = async () => { try { await mtapi('opp', { on: !op.enabled }); trStateLoad(); toast(op.enabled ? 'Opposite Bot off' : 'Opposite Bot on: it will take the other side of your trades'); } catch (e) { toast(esc(e.message)); } };
  $('#trrst').onclick = async () => { if (!confirm('Reset your paper account to $100,000? Positions, orders and history are cleared.')) return; await mtapi('reset', { acct: 'me' }); await mtapi('reset', { acct: 'opp' }); trStateLoad(); toast('Accounts reset'); }; }
function trTable() { const el = $('#trtbl'); if (!el || !trState) return; const tab = $('#trtab .on')?.dataset.v || 'pos', S = trState;
  const sym = s => `<button class=trlink data-s="${esc(s)}">${esc(s)}</button>`;
  if (tab == 'pos') { const rows = [...S.me.positions.map(p => ({ ...p, a: 'You' })), ...S.opp.positions.map(p => ({ ...p, a: 'Opposite Bot' }))];
    el.innerHTML = rows.length ? `<div style="overflow-x:auto"><table class=tbl><thead><tr><th>Symbol</th><th>Account</th><th class=r>Qty</th><th class=r>Avg price</th><th class=r>Last</th><th class=r>P&L</th><th></th></tr></thead><tbody>${rows.map(p => `<tr><td>${sym(p.sym)}</td><td class=mut>${p.a}</td><td class="r num ${p.qty > 0 ? 'up' : 'down'}">${p.qty > 0 ? '+' : ''}${trN(p.qty, Number.isInteger(p.qty) ? 0 : undefined)}</td><td class="r num">${trN(p.avg)}</td><td class="r num">${trN(p.px)}</td><td class="r num ${p.upnl >= 0 ? 'up' : 'down'}">${trM(p.upnl)}</td><td class=r>${p.a == 'You' ? `<button class="btn sm" data-close="${esc(p.sym)}">Close</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class=empty style="padding:24px 0">No open positions.</div>'; }
  if (tab == 'ord') el.innerHTML = S.orders.length ? `<div style="overflow-x:auto"><table class=tbl><thead><tr><th>Symbol</th><th>Order</th><th class=r>Qty</th><th class=r>Price</th><th>Placed</th><th></th></tr></thead><tbody>${S.orders.map(o => `<tr><td>${sym(o.sym)}</td><td><span class="pill ${o.side == 'buy' ? 'up' : 'down'}">${o.side}</span> ${o.grp ? (o.kind == 'stop' ? 'stop-loss' : 'take-profit') : o.kind}</td><td class="r num">${trN(o.qty, Number.isInteger(o.qty) ? 0 : undefined)}</td><td class="r num">${trN(o.px)}</td><td class=mut>${new Date(o.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td class=r><button class="btn sm" data-cancel="${o.id}">Cancel</button></td></tr>`).join('')}</tbody></table></div>` : '<div class=empty style="padding:24px 0">No open orders.</div>';
  if (tab == 'fills') el.innerHTML = S.fills.length ? `<div style="overflow-x:auto"><table class=tbl><thead><tr><th>Time</th><th>Account</th><th>Trade</th><th class=r>Price</th><th class=r>Realized</th></tr></thead><tbody>${S.fills.map(f => `<tr><td class=mut style="white-space:nowrap">${new Date(f.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td class=mut>${f.acct == 'me' ? 'You' : 'Opposite Bot'}</td><td><span class="pill ${f.side == 'buy' ? 'up' : 'down'}">${f.side}</span> ${trN(f.qty, Number.isInteger(f.qty) ? 0 : undefined)} ${sym(f.sym)}<div class=mut style="font-size:12px">${esc(f.why || '')}</div></td><td class="r num">${trN(f.px)}</td><td class="r num ${f.pnl - f.fee >= 0 ? 'up' : 'down'}">${f.pnl ? trM(f.pnl - f.fee) : f.fee ? trM(-f.fee) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class=empty style="padding:24px 0">No trades yet.</div>';
  el.querySelectorAll('[data-close]').forEach(b => b.onclick = async () => { b.disabled = true; try { await mtapi('close', { sym: b.dataset.close }); toast('Position closed'); trStateLoad(); } catch (e) { toast(esc(e.message)); b.disabled = false; } });
  el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { await mtapi('cancel', { id: b.dataset.cancel }); trStateLoad(); });
  el.querySelectorAll('.trlink').forEach(b => b.onclick = () => trSet(b.dataset.s)); }
