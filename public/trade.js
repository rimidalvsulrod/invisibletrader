// Manual Trading: a TradingView-style chart (TradingView's open-source Lightweight Charts) with timeframes, chart types, indicators, drawing tools
// and a paper order ticket for stocks, ETFs, futures and crypto. Plus the Opposite Bot: it takes the reverse of every fill you get.
let TR = null; // set on first visit (LS lives in app.js, loaded after this file)
const trInit = () => TR || (TR = { sym: LS.get('mt:sym', 'SPY'), tf: LS.get('mt:tf', '5m'), type: LS.get('mt:type3', 'candle'), cs: LS.get('mt:cs', 'gr'), prm: LS.get('mt:prm', {}), ind: LS.get('mt:ind', ['ema9', 'ema21', 'vwap', 'vol']), side: 'buy', kind: 'market', tool: null, pend: null });
let trChart = null, trMain = null, trS = {}, trData = null, trState = null, trT1 = null, trT2 = null, trLines = [], trDraw = [];
const trSheet = n => { if (n) document.body.dataset.trs = n; else delete document.body.dataset.trs; if (n == 'sym') setTimeout(() => $('#trq')?.focus(), 250); };
const trStop = () => { trTickStop(); trSheet(null); $('#trpick')?.remove(); clearInterval(trT1); clearInterval(trT2); trT1 = trT2 = null; if (trChart) { try { trChart.remove(); } catch (e) {} trChart = null; } trS = {}; trData = null; trDraw = []; trLines = []; trOut = {}; trLastPx = null; trMain = null; trState = null; removeEventListener('themechange', trTheme); };
const mtapi = async (op, body, qs = '') => { const r = await fetch('/api/powell' + (body ? '' : `?op=mt-${op}${qs}`), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'mt-' + op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j; };
const TFS = [['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['30m', '30m'], ['1h', '1H'], ['4h', '4H'], ['1d', '1D'], ['1w', '1W'], ['1mo', '1M']];
const TYPES = [['candle', 'Rounded candles'], ['sharp', 'Sharp candles'], ['smooth', 'Smooth'], ['hollow', 'Hollow candles'], ['ha', 'Heikin Ashi'], ['bar', 'Bars'], ['line', 'Line'], ['base', 'Baseline']];
const WATCH = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'NQ=F', 'ES=F', 'GC=F', 'CL=F', 'BTC-USD', 'ETH-USD', 'SOL-USD'];
const IND = INDS; // public/indicators.js
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
      <div class=trtools><select class="inp trsel" id=trtype>${TYPES.map(([k, l]) => `<option value=${k} ${TR.type == k ? 'selected' : ''}>${l}</option>`).join('')}</select><select class="inp trsel" id=trcs aria-label="Candle colours">${[['gr', 'Green / Red'], ['bw', 'Blue / Gray'], ['mono', 'Black / White']].map(([k, l]) => `<option value=${k} ${TR.cs == k ? 'selected' : ''}>${l}</option>`).join('')}</select>
       <button class="btn sm" id=trindb>${ic('flask', 14)} Indicators <span class="pill n" id=trindn>${TR.ind.length}</span></button>
       <button class="btn sm ${TR.tool == 'h' ? 'on' : ''}" id=trh title="Horizontal line: click the chart">― Line</button><button class="btn sm ${TR.tool == 't' ? 'on' : ''}" id=trt title="Trend line: click two points">╱ Trend</button><button class="btn sm" id=trclr title="Remove the drawings on this symbol">${ic('x', 13)}</button><button class="btn sm" id=trfit title="Fit everything">Fit</button></div></div>
     <div class=trchart id=trc><div class=trmov><div class=trmtop><b id=trmsym></b><span class=trmexch id=trmex></span></div><div class=trmpx><span class=num id=trmpx></span> <span class=num id=trmchg></span></div><div class=trqbs><button class="trqb sell" data-side=sell><b class=num id=trqsp>-</b>SELL</button><button class="trqb buy" data-side=buy><b class=num id=trqbp>-</b>BUY</button></div></div><div class=trlegend id=trleg></div><div class=trbub id=trbub hidden></div></div></div>
    <div class=trside><div class="card pad trticket" id=trtk></div><div class="card pad" id=tracct></div><div class="card pad" id=tropp></div></div></div>
   <div class="card trtabs"><div class="row sb wrapf" style="padding:16px 20px 0;gap:10px"><div class=seg id=trtab>${[['pos', 'Positions'], ['ord', 'Orders'], ['fills', 'History']].map(([k, l], i) => `<button data-v=${k} class="${i ? '' : 'on'}">${l}</button>`).join('')}</div><button class="btn danger" id=trend>${ic('x', 14)} End trading day</button></div><div id=trtbl style="padding:6px 0 8px"></div></div></div>
   <div class=trscrim id=trscrim></div><div class=trmbar><button class=trmsy id=trmS><b id=trmsy></b><span id=trmtf></span></button><span class=trmsp></span><button id=trmD aria-label="Drawing tools"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><path d="M13.5 6.5l3 3"/></svg></button><button id=trmI aria-label="Timeframe and indicators"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx=16 cy=7 r=2 /><circle cx=10 cy=17 r=2 /></svg></button><button id=trmA aria-label="Account and positions"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=3 y=6 width=18 height=13 rx=3 /><path d="M16 12.5h2M3 9h18"/></svg></button></div>`;
  if (matchMedia('(max-width: 760px)').matches) $('.trside').append($('.trtabs')); // phones: positions live in the account sheet
  await trLib(); trBuild(); trWire(); trTicket(); await trLoad(true); trStateLoad();
  trT1 = setInterval(() => { if (!$('#trc')) return trStop(); trLoad(false); }, 15e3); trTick();
  trT2 = setInterval(() => { if (!$('#trc')) return trStop(); trStateLoad(); }, 4e3);
  addEventListener('themechange', trTheme);
}
function trLib() { return window.LightweightCharts ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/vendor/lwc.js'; s.onload = ok; s.onerror = () => no(new Error('chart library failed to load')); document.head.append(s); }); }
function trOpts() { const dark = document.documentElement.dataset.theme == 'dark', fg = trCss('--mut'), grid = trCss('--grid'), ac = trCss('--accent');
  return { layout: { background: { type: 'solid', color: 'transparent' }, textColor: fg, fontFamily: 'Poppins, -apple-system, sans-serif', fontSize: 11 }, grid: { vertLines: { visible: false }, horzLines: { color: grid, style: 1 } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: .12, bottom: .08 } }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 7 },
    crosshair: { mode: 0, vertLine: { color: ac, width: 1, style: 2, labelBackgroundColor: dark ? '#1c1c1e' : '#121214' }, horzLine: { visible: false, labelVisible: true, labelBackgroundColor: dark ? '#1c1c1e' : '#121214' } },
    handleScale: { axisPressedMouseMove: true }, localization: { priceFormatter: p => trN(p) } }; }
function trTheme() { if (trChart) { trChart.applyOptions(trOpts()); trPaint(true); } }
function trBuild() {
  const el = $('#trc'); trChart = LightweightCharts.createChart(el, { ...trOpts(), autoSize: true });
  trChart.subscribeCrosshairMove(p => { trLegend(p); trBubble(p); }); trChart.subscribeClick(p => trClick(p));
}
function trWire() {
  const q = $('#trq'), res = $('#trres'); let t = null;
  q.onfocus = () => q.select(); q.onkeydown = e => { if (e.key == 'Enter') { const f = res.querySelector('button'); trSet(f && !res.hidden ? f.dataset.s : q.value); res.hidden = true; q.blur(); } if (e.key == 'Escape') { res.hidden = true; q.blur(); } };
  q.oninput = () => { clearTimeout(t); const v = q.value.trim(); if (!v) { res.hidden = true; return; } t = setTimeout(async () => { try { const r = await mtapi('search', null, '&q=' + encodeURIComponent(v)); res.innerHTML = r.results.map(x => `<button data-s="${esc(x.sym)}"><b>${esc(x.sym)}</b><span>${esc(x.name)}</span><i>${esc(x.type.toLowerCase())} · ${esc(x.ex)}</i></button>`).join('') || '<div class=mut style="padding:12px">No matches</div>'; res.hidden = false; res.querySelectorAll('button').forEach(b => b.onmousedown = () => { trSet(b.dataset.s); res.hidden = true; }); } catch (e) {} }, 250); };
  q.onblur = () => setTimeout(() => { res.hidden = true; if (!q.value.trim()) q.value = TR.sym; }, 150);
  $$('.trwatch .chip').forEach(b => b.onclick = () => trSet(b.dataset.s));
  $('#trscrim').onclick = () => trSheet(null); $('#trmS').onclick = () => trSheet('sym'); $('#trmD').onclick = () => trSheet('tf'); $('#trmI').onclick = () => { trSheet(null); trPick(); }; $('#trmA').onclick = () => { trSheet('acct'); trStateLoad(); };
  $$('.trqb').forEach(b => b.onclick = () => { TR.side = b.dataset.side; trTicket(); trSheet('tk'); });
  $$('#trtf button').forEach(b => b.onclick = () => { trSheet(null); TR.tf = b.dataset.v; LS.set('mt:tf', TR.tf); $$('#trtf button').forEach(x => x.classList.toggle('on', x === b)); trLoad(true); });
  $('#trcs').onchange = e => { TR.cs = e.target.value; LS.set('mt:cs', TR.cs); trPaint(true); };
  $('#trtype').onchange = e => { TR.type = e.target.value; LS.set('mt:type3', TR.type); trPaint(true); };
  $('#trindb').onclick = () => { trSheet(null); trPick(); };
  $('#trh').onclick = () => { trSheet(null); TR.tool = TR.tool == 'h' ? null : 'h'; TR.pend = null; $('#trh').classList.toggle('on', TR.tool == 'h'); $('#trt').classList.remove('on'); };
  $('#trt').onclick = () => { trSheet(null); TR.tool = TR.tool == 't' ? null : 't'; TR.pend = null; $('#trt').classList.toggle('on', TR.tool == 't'); $('#trh').classList.remove('on'); };
  $('#trclr').onclick = () => { LS.set('mt:draw:' + TR.sym, []); trPaint(true); toast('Drawings removed'); };
  $('#trfit').onclick = () => trChart?.timeScale().fitContent();
  $$('#trtab button').forEach(b => b.onclick = () => { $$('#trtab button').forEach(x => x.classList.toggle('on', x === b)); trTable(); });
  $('#trend').onclick = async () => { if (!confirm('End the trading day? This cancels every open order and closes every position, yours and the Opposite Bot\'s, at the market.')) return; try { const r = await mtapi('endday', {}); toast(r.closed.length ? `Closed ${r.closed.length} position${r.closed.length > 1 ? 's' : ''}` : 'Nothing was open'); trStateLoad(); } catch (e) { toast(esc(e.message)); } };
}
function trSet(s) { s = String(s || '').trim().toUpperCase(); if (!s) return; trSheet(null); setTimeout(trTick, 50); TR.sym = s; LS.set('mt:sym', s); $('#trq').value = s; $$('.trwatch .chip').forEach(b => b.classList.toggle('on', b.dataset.s == s)); trData = null; trLoad(true); trTicket(); }
async function trLoad(fresh) {
  const sym = TR.sym, tf = TR.tf; let d; try { d = await mtapi('candles', null, `&sym=${encodeURIComponent(sym)}&tf=${tf}`); } catch (e) { if (fresh) { $('#trname').textContent = e.message; toast(esc(e.message)); } return; }
  if (sym !== TR.sym || tf !== TR.tf || !$('#trc')) return; const was = trData, sameSet = was && was.sym === d.sym && was.tf === tf && !fresh; TR.sym = d.sym; $('#trq').value = d.sym;
  trData = { ...d, B: d.bars.map(x => ({ t: x[0] + TZ(), o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })) };
  const last = trData.B[trData.B.length - 1]; if (last && d.price && /m$|h$/.test(tf)) { last.c = d.price; last.h = Math.max(last.h, d.price); last.l = Math.min(last.l, d.price); }
  $('#trname').textContent = `${d.name} · ${d.ex}`; $('#trpx').textContent = trN(last?.c); const ch = d.prev ? (last.c / d.prev - 1) * 100 : null; $('#trchg').innerHTML = ch == null ? '' : `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${trN(last.c - d.prev)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</span>`; $('#trdel').hidden = !d.delayed; const short = d.sym.replace('-USD', '').replace('=F', ''), pxs = trN(last?.c); $('#trmsym').textContent = short; $('#trmex').textContent = d.delayed ? 'delayed' : ''; $('#trmpx').textContent = pxs; $('#trmchg').innerHTML = $('#trchg').innerHTML; $('#trqsp').textContent = pxs; $('#trqbp').textContent = pxs; $('#trmsy').textContent = short; $('#trmtf').textContent = TFS.find(x => x[0] == TR.tf)?.[1] || TR.tf;
  trPaint(!sameSet); trTicketPrice();
}
/* rounded, friendlier candles: a custom series that draws pill-shaped bodies and round-capped wicks */
const RC = (() => { let D = null, O = null; const rr = (c, x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  return { priceValueBuilder: p => [p.high, p.low, p.close], isWhitespace: d => d.close === undefined,
    renderer: () => ({ draw: (target, conv) => { if (!D) return; target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const bw = Math.max(1, Math.min(22, Math.floor(D.barSpacing * .78))) * hr, wk = Math.max(1, Math.round(1.6 * hr)), from = D.visibleRange?.from ?? 0, to = D.visibleRange?.to ?? D.bars.length - 1;
      for (let i = from; i <= to; i++) { const b = D.bars[i]; if (!b) continue; const d = b.originalData, up = d.close >= d.open, x = Math.round(b.x * hr), yh = conv(d.high), yl = conv(d.low), yo = conv(d.open), yc = conv(d.close); if ([yh, yl, yo, yc].some(v => v == null)) continue;
        const fill = up ? O.upColor : O.downColor, line = up ? O.borderUpColor : O.borderDownColor, wick = up ? O.wickUpColor : O.wickDownColor, top = Math.round(Math.min(yo, yc) * vr), bot = Math.round(Math.max(yo, yc) * vr), h = Math.max(bw > 4 ? bw * .55 : 2, bot - top), by = bw > 4 && bot - top < h ? top - (h - (bot - top)) / 2 : top;
        c.strokeStyle = wick; c.lineWidth = wk; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, Math.round(yh * vr)); c.lineTo(x, Math.round(yl * vr)); c.stroke();
        if (bw < 4) { c.fillStyle = line || fill; c.fillRect(Math.round(x - bw / 2), by, Math.max(2, bw), h); continue; }
        rr(c, x - bw / 2, by, bw, h, Math.min(bw * .42, 7 * hr)); c.fillStyle = fill; c.fill(); if (line && line !== fill) { c.strokeStyle = line; c.lineWidth = Math.max(1, Math.round(1.4 * hr)); c.stroke(); } } }); } }),
    update: (data, opts) => { D = data; O = opts; },
    defaultOptions: () => ({ upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a', borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350' }) }; })();
function trBars() { const B = trData.B; if (TR.type != 'ha') return B; const o = []; B.forEach((b, i) => { const c = (b.o + b.h + b.l + b.c) / 4, op = i ? (o[i - 1].o + o[i - 1].c) / 2 : (b.o + b.c) / 2; o.push({ t: b.t, o: op, c, h: Math.max(b.h, op, c), l: Math.min(b.l, op, c), v: b.v }); }); return o; }
function trPaint(rebuild) {
  if (!trChart || !trData) return; const B = trBars(), dark = document.documentElement.dataset.theme == 'dark', bw = TR.cs == 'bw', mono = TR.cs == 'mono', up = mono ? (dark ? '#ffffff' : '#ffffff') : bw ? '#1f5bff' : trCss('--up'), dn = mono ? (dark ? '#000000' : '#121214') : bw ? (dark ? '#d4d4d8' : '#a1a1aa') : trCss('--down'), edge = mono ? (dark ? '#d4d4d8' : '#121214') : null, ac = trCss('--accent'), acr = trCss('--accent-rgb'), C = B.map(b => b.c), T = B.map(b => b.t), pal = indPalette();
  if (rebuild) { for (const s of Object.values(trS)) try { trChart.removeSeries(s); } catch (e) {} trS = {}; trLines = []; }
  const col = c => c === 'up' ? up : c === 'down' ? dn : typeof c === 'number' ? pal[c] : c || pal[8];
  const ser = a => a.map((v, i) => v == null || !isFinite(v) ? { time: T[i] } : { time: T[i], value: v });
  // the price
  if (!trS.main) { const k = TR.type, base = { priceLineColor: ac, priceLineStyle: 2 };
    trS.main = k == 'smooth' ? trChart.addAreaSeries({ ...base, lineColor: ac, lineWidth: 2.5, lineType: 2, topColor: `rgba(${acr},.22)`, bottomColor: `rgba(${acr},0)`, crosshairMarkerRadius: 6, crosshairMarkerBorderColor: trCss('--panel'), crosshairMarkerBorderWidth: 3, crosshairMarkerBackgroundColor: ac })
      : k == 'line' ? trChart.addLineSeries({ ...base, color: ac, lineWidth: 2, crosshairMarkerRadius: 5, crosshairMarkerBorderColor: trCss('--panel'), crosshairMarkerBackgroundColor: ac })
      : k == 'base' ? trChart.addBaselineSeries({ ...base, baseValue: { type: 'price', price: trData.prev || C[0] }, topLineColor: up, topFillColor1: up + '40', topFillColor2: up + '05', bottomLineColor: dn, bottomFillColor1: dn + '05', bottomFillColor2: dn + '40', lineWidth: 2 })
      : k == 'bar' ? trChart.addBarSeries({ ...base, upColor: mono ? (dark ? '#ffffff' : '#121214') : up, downColor: mono ? (dark ? '#8e8e93' : '#8a8a94') : dn, thinBars: false })
      : k != 'sharp' && trChart.addCustomSeries ? trChart.addCustomSeries(RC, { ...base, upColor: k == 'hollow' ? 'rgba(0,0,0,0)' : up, downColor: dn, borderUpColor: edge || up, borderDownColor: edge || dn, wickUpColor: edge || up, wickDownColor: edge || dn })
      : trChart.addCandlestickSeries({ ...base, upColor: k == 'hollow' ? 'rgba(0,0,0,0)' : up, downColor: dn, borderUpColor: edge || up, borderDownColor: edge || dn, wickUpColor: edge || up + 'cc', wickDownColor: edge || dn + 'cc' }); }
  trS.main.setData(/smooth|line|base/.test(TR.type) ? B.map(b => ({ time: b.t, value: b.c })) : B.map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })));
  trMain = trS.main;
  // indicators: overlays on the price, oscillators in panes stacked from the bottom
  const act = TR.ind.filter(k => IND[k]), panes = act.filter(k => IND[k].pane), PH = panes.length > 2 ? .15 : .18, mainBottom = panes.length * PH, hasVol = act.includes('vol');
  trS.main.priceScale().applyOptions({ scaleMargins: { top: .1, bottom: Math.min(.72, mainBottom + (hasVol ? .13 : .06)) } }); trOut = {};
  for (const k of act) { const D = IND[k], P = trPrm(k), outs = D.run(B, C, P, { tf: TR.tf }), pi = panes.indexOf(k), scale = D.vol ? 'vol' : pi >= 0 ? 'p_' + k : 'right', top = pi >= 0 ? 1 - PH * (pi + 1) + .03 : D.vol ? 1 - mainBottom - .12 : null, bottom = pi >= 0 ? PH * pi + .015 : D.vol ? mainBottom + .005 : null; trOut[k] = outs;
    const firstLine = outs.find(x => !x.hist);
    for (const o of outs) { const id = k + ':' + o.id; let s = trS[id];
      if (!s) { s = trS[id] = o.hist ? trChart.addHistogramSeries({ priceScaleId: scale, priceLineVisible: false, lastValueVisible: false, priceFormat: D.vol ? { type: 'volume' } : undefined })
        : trChart.addLineSeries({ priceScaleId: scale, color: col(o.c), lineWidth: o.w || 1.5, lineStyle: o.dash || 0, lineVisible: !o.dots, pointMarkersVisible: !!o.dots, pointMarkersRadius: 1.6, priceLineVisible: false, lastValueVisible: pi >= 0 && o === firstLine, crosshairMarkerVisible: false });
        if (o.lv) for (const y of o.lv) s.createPriceLine({ price: y, color: pal[8] + '99', lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); }
      if (top != null) s.priceScale().applyOptions({ scaleMargins: { top, bottom } });
      s.setData(o.hist ? o.v.map((v, i) => v == null || !isFinite(v) ? { time: T[i] } : { time: T[i], value: v, color: (mono && o.cs ? (o.cs[i] == 'up' ? (dark ? '#ffffff' : '#121214') : '#8e8e93') : col(o.cs?.[i] || o.c)) + (D.vol ? '55' : 'aa') }) : ser(o.v)); } }
  // drawings
  for (const d of trDraw) try { trChart.removeSeries(d); } catch (e) {} trDraw = []; for (const pl of trLines) try { trS.main.removePriceLine(pl); } catch (e) {} trLines = [];
  for (const d of LS.get('mt:draw:' + TR.sym, [])) { if (d.k == 'h') trLines.push(trS.main.createPriceLine({ price: d.p, color: ac, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' }));
    if (d.k == 't' && d.t2 > d.t1) { const s = trChart.addLineSeries({ color: ac, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData([{ time: d.t1, value: d.p1 }, { time: d.t2, value: d.p2 }]); trDraw.push(s); } }
  trOrderLines(); if (rebuild) { const n = B.length; const vis = matchMedia('(max-width:760px)').matches ? 52 : 90; if (n > vis + 20) trChart.timeScale().setVisibleLogicalRange({ from: n - vis, to: n + 5 }); else trChart.timeScale().fitContent(); } trLegend(); if ($('#trindn')) $('#trindn').textContent = act.length;
}
let trOut = {};
const trPrm = k => { const P = {}; for (const [n, , d] of IND[k].p) P[n] = TR.prm[k]?.[n] ?? d; return P; };
const trIndName = k => { const D = IND[k], P = trPrm(k); if (!D.p.length) return D.n; if (/ \d+$/.test(D.n)) return D.n.replace(/\d+$/, P.n); return `${D.n} ${D.p.map(([n]) => P[n]).join(', ')}`; };
const DOT = { sma20: 1, sma50: 6, sma200: 7, ema9: 2, ema21: 4, wma: 6, hma: 4, dema: 7, tema: 6, vwma: 3, lsma: 5, ribbon: 1, vwap: 6, bb: 8, kc: 5, dc: 4, env: 7, st: 'up', psar: 6, ichi: 1, piv: 8, vol: 8, rsi: 4, srsi: 1, macd: 1, stoch: 2, cci: 6, willr: 7, roc: 3, ao: 'up', trix: 5, adx: 1, aroon: 'up', obv: 7, mfi: 3, cmf: 'up', atr: 5, stdev: 8, bbw: 6 };
const trDot = k => { const c = DOT[k]; return c === 'up' ? trCss('--up') : indPalette()[c ?? 8]; };
function trBubble(p) { // the pill price bubble that follows the crosshair (like the reference shots)
  const el = $('#trbub'); if (!el || !trS.main) return; if (!p || !p.point || p.time == null) { el.hidden = true; return; } const d = p.seriesData?.get(trS.main), v = d ? (d.value ?? d.close) : null; if (v == null) { el.hidden = true; return; }
  const y = trS.main.priceToCoordinate(v); if (y == null) { el.hidden = true; return; } el.textContent = trN(v); el.hidden = false; const w = el.offsetWidth, W = $('#trc').clientWidth - 70;
  el.style.left = Math.max(4, Math.min(W - w, p.point.x - w / 2)) + 'px'; el.style.top = Math.max(4, y - 42) + 'px'; }
/* the indicator picker: search, groups, switch on / off, settings for the ones on the chart */
function trPick(q = '', grp = 'All') {
  let el = $('#trpick'); if (!el) { el = document.createElement('div'); el.id = 'trpick'; el.className = 'trpickwrap'; document.body.append(el); }
  const items = Object.entries(IND).filter(([k, d]) => (grp == 'All' || d.g == grp) && (!q || (d.n + ' ' + d.d + ' ' + d.g).toLowerCase().includes(q.toLowerCase()))), on = TR.ind.filter(k => IND[k]);
  el.innerHTML = `<div class=trpbg></div><div class=trpbox><div class="row sb"><h2>Indicators</h2><button class="btn ic sm" id=trpx aria-label=Close>${ic('x', 14)}</button></div>
    <input class=inp id=trpq placeholder="Search ${Object.keys(IND).length} indicators" value="${esc(q)}" autocomplete=off>
    <div class="seg chips trpg">${['All', ...INDGROUPS].map(g => `<button data-g="${g}" class="${g == grp ? 'on' : ''}">${g}</button>`).join('')}</div>
    ${on.length && !q && grp == 'All' ? `<div class=trph>On the chart · ${on.length}</div><div class=trpon>${on.map(k => `<div class=trpo><div class=trpoh><span class=trpdot style="background:${trDot(k)}"></span><b>${esc(trIndName(k))}</b><button class=trprm data-k=${k} aria-label="Remove">${ic('x', 12)}</button></div>${IND[k].p.length ? `<div class=trpp>${IND[k].p.map(([n, l, d, mn, mx, st]) => `<label><span>${l}</span><input class=inp type=number inputmode=decimal data-k=${k} data-n=${n} min=${mn} max=${mx} step=${st} value=${trPrm(k)[n]}></label>`).join('')}</div>` : ''}</div>`).join('')}</div>` : ''}
    <div class=trph>${grp == 'All' && !q ? 'All indicators' : items.length + ' found'}</div><div class=trplist>${items.map(([k, d]) => `<button class="trpi ${TR.ind.includes(k) ? 'on' : ''}" data-k=${k}><span class=trpdot style="background:${trDot(k)}"></span><span class=trpt><b>${esc(d.n)}</b><span>${esc(d.d)}</span></span><span class=trpg2>${d.pane ? 'own pane' : d.vol ? 'bottom' : 'on price'}</span><span class="trsw sm ${TR.ind.includes(k) ? 'on' : ''}"><i></i></span></button>`).join('') || '<div class=empty style="padding:20px">Nothing matches.</div>'}</div></div>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); }, save = () => { LS.set('mt:ind', TR.ind); LS.set('mt:prm', TR.prm); trPaint(true); };
  el.querySelector('.trpbg').onclick = close; $('#trpx').onclick = close;
  const qi = $('#trpq'); qi.oninput = () => { const pos = qi.selectionStart; trPick(qi.value, grp); const n = $('#trpq'); n.focus(); n.setSelectionRange(pos, pos); };
  el.querySelectorAll('.trpg button').forEach(b => b.onclick = () => trPick(q, b.dataset.g));
  el.querySelectorAll('.trpi').forEach(b => b.onclick = () => { const k = b.dataset.k; TR.ind = TR.ind.includes(k) ? TR.ind.filter(x => x != k) : [...TR.ind, k]; save(); trPick(q, grp); });
  el.querySelectorAll('.trprm').forEach(b => b.onclick = () => { TR.ind = TR.ind.filter(x => x != b.dataset.k); save(); trPick(q, grp); });
  el.querySelectorAll('.trpp input').forEach(i => i.onchange = () => { const k = i.dataset.k, v = Math.min(+i.max, Math.max(+i.min, +i.value)); if (!isFinite(v)) return; TR.prm[k] = { ...(TR.prm[k] || {}), [i.dataset.n]: v }; save(); trPick(q, grp); });
}
function trOrderLines() { // your position and resting orders, drawn on the chart
  if (!trS.main || !trState) return; for (const pl of trS.main._ol || []) try { trS.main.removePriceLine(pl); } catch (e) {} const out = [];
  const p = trState.me.positions.find(x => x.sym == trData?.sym); if (p) out.push(trS.main.createPriceLine({ price: p.avg, color: p.qty > 0 ? trCss('--up') : trCss('--down'), lineWidth: 2, lineStyle: 0, title: `${p.qty > 0 ? 'Long' : 'Short'} ${trN(Math.abs(p.qty), p.mult === 1 && /-USD/.test(p.sym) ? undefined : 0)}  ${trM(p.upnl)}` }));
  for (const o of trState.orders.filter(x => x.sym == trData?.sym)) out.push(trS.main.createPriceLine({ price: o.px, color: o.side == 'buy' ? trCss('--up') : trCss('--down'), lineWidth: 1, lineStyle: 2, title: `${o.grp ? (o.kind == 'stop' ? 'SL' : 'TP') : o.kind} ${o.side} ${trN(o.qty, 0)}` }));
  trS.main._ol = out; }
function trLegend(p) {
  const el = $('#trleg'); if (!el || !trData) return; const B = trBars(); let i = B.length - 1; if (p && p.time != null) { const k = B.findIndex(b => b.t === p.time); if (k >= 0) i = k; } const b = B[i]; if (!b) return;
  const chg = i ? (b.c / B[i - 1].c - 1) * 100 : 0, vals = [];
  for (const k of TR.ind) { if (!IND[k]) continue; const o = (trOut[k] || []).find(x => !x.hist) || trOut[k]?.[0], v = o?.v?.[i]; vals.push(`<span style="color:${trDot(k)}">${esc(trIndName(k))}${v != null && isFinite(v) ? ' <b>' + trN(v) + '</b>' : ''}</span>`); }
  el.innerHTML = `<div><b>${esc(trData.sym)}</b> · ${TFS.find(x => x[0] == TR.tf)?.[1]} &nbsp;O <b>${trN(b.o)}</b> H <b>${trN(b.h)}</b> L <b>${trN(b.l)}</b> C <b>${trN(b.c)}</b> <span class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span></div><div class=trlv>${vals.join('')}${vals.length > 4 ? `<span class=trmore>+${vals.length - 4} more</span>` : ''}</div>${TR.tool ? `<div class=trhint>${TR.tool == 'h' ? 'Click the chart to place a line' : TR.pend ? 'Click the second point' : 'Click the first point of the trend line'}</div>` : ''}`; }
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

/* ---------- live price: every second (crypto streams from Coinbase, everything else polls the server each second) ---------- */
let trWS = null, trQT = null, trLastPx = null, trPaintAt = 0;
const TFSEC = { '1m': 60, '2m': 120, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400 };
function trTickStop() { clearInterval(trQT); trQT = null; if (trWS) { trWS.onclose = null; try { trWS.close(); } catch (e) {} trWS = null; } }
function trTick() {
  trTickStop(); const sym = TR.sym;
  if (/-USD$/.test(sym) && 'WebSocket' in window) { try { trWS = new WebSocket('wss://ws-feed.exchange.coinbase.com'); trWS.onopen = () => trWS.send(JSON.stringify({ type: 'subscribe', product_ids: [sym], channels: ['ticker'] }));
    let pend = null, at = 0; trWS.onmessage = e => { const m = JSON.parse(e.data); if (m.type != 'ticker' || m.product_id != TR.sym) return; pend = +m.price; const n = Date.now(); if (n - at > 250) { at = n; trLive(pend); } }; // a few frames a second at most
    trWS.onclose = () => { trWS = null; if ($('#trc') && TR.sym == sym) setTimeout(() => TR.sym == sym && trTick(), 3000); }; } catch (e) {} }
  trQT = setInterval(async () => { if (!$('#trc')) return trTickStop(); if (trWS && trWS.readyState === 1) return; if (document.hidden) return;
    try { const r = await mtapi('quote', null, '&sym=' + encodeURIComponent(sym)); if (r.sym === trData?.sym) trLive(r.px); } catch (e) {} }, 1000);
}
function trLive(px) {
  if (!trData || !trS.main || !(px > 0)) return; const B = trData.B, last = B[B.length - 1]; if (!last) return; const sec = TFSEC[TR.tf], now = Math.floor(Date.now() / 1000) + TZ();
  if (sec && now >= last.t + sec) { const t = last.t + Math.floor((now - last.t) / sec) * sec; B.push({ t, o: last.c, h: Math.max(last.c, px), l: Math.min(last.c, px), c: px, v: 0 }); }
  else { last.c = px; last.h = Math.max(last.h, px); last.l = Math.min(last.l, px); }
  const b = trBars()[B.length - 1], line = /smooth|line|base/.test(TR.type); try { trS.main.update(line ? { time: b.t, value: b.c } : { time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }); } catch (e) {}
  if (px !== trLastPx) { const el = $('#trpx'), dir = trLastPx == null ? 0 : px > trLastPx ? 1 : -1; trLastPx = px; const t = trN(px); if (el) { el.textContent = t; el.classList.remove('tkup', 'tkdn'); void el.offsetWidth; if (dir) el.classList.add(dir > 0 ? 'tkup' : 'tkdn'); }
    if ($('#trmpx')) $('#trmpx').textContent = t; if ($('#trqsp')) { $('#trqsp').textContent = t; $('#trqbp').textContent = t; }
    const ch = trData.prev ? (px / trData.prev - 1) * 100 : null; if (ch != null) { const h = `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${trN(px - trData.prev)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</span>`; $('#trchg').innerHTML = h; if ($('#trmchg')) $('#trmchg').innerHTML = h; } }
  if (Date.now() - trPaintAt > 5000) { trPaintAt = Date.now(); trPaint(false); } else trLegend(); // indicators follow every 5 s
  if (TR.kind == 'market') trEst();
}
