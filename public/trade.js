// Manual Trading: a TradingView-style chart (TradingView's open-source Lightweight Charts) with timeframes, chart types, indicators, drawing tools
// and a paper order ticket for stocks, ETFs, futures and crypto. Plus the Opposite Bot: it takes the reverse of every fill you get.
let TR = null; // set on first visit (LS lives in app.js, loaded after this file)
const trInit = () => TR || (TR = { sym: LS.get('mt:sym', 'SPY'), tf: LS.get('mt:tf', '5m'), type: LS.get('mt:type3', 'candle').replace('sharp', 'candle'), cs: LS.get('mt:cs', 'gr'), prm: LS.get('mt:prm', {}), ind: LS.get('mt:ind2', ['bb', 'vp', 'vol']), side: 'buy', kind: 'market', tool: null, pend: null });
let trChart = null, trMain = null, trS = {}, trData = null, trState = null, trT1 = null, trT2 = null, trT3 = null, trLines = [], trDraw = [], trWant = false, trNeedSnap = false;
const trSheet = n => { if (n) document.body.dataset.trs = n; else delete document.body.dataset.trs; if (n == 'sym') setTimeout(() => $('#trq')?.focus(), 250); };
const trStop = () => { trTickStop(); trSheet(null); $('#trpick')?.remove(); clearInterval(trT1); clearInterval(trT2); clearInterval(trT3); trT1 = trT2 = trT3 = null; trWant = false; if (trChart) { try { trChart.remove(); } catch (e) {} trChart = null; } trS = {}; trData = null; trDraw = []; trLines = []; trOut = {}; trLastPx = null; trMain = null; trState = null; removeEventListener('themechange', trTheme); trMiniKill(); clearInterval(trWLT); clearInterval(trClk); trWLT = trClk = null; trRO?.disconnect(); trRO = null; document.body.classList.remove('term'); };
const mtapi = async (op, body, qs = '') => { const r = await fetch('/api/powell' + (body ? '' : `?op=mt-${op}${qs}`), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'mt-' + op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j; };
const TFS = [['1s', '1s'], ['5s', '5s'], ['15s', '15s'], ['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['30m', '30m'], ['1h', '1H'], ['4h', '4H'], ['1d', '1D'], ['1w', '1W'], ['1mo', '1M']];
const TYPES = [['candle', 'Candles'], ['smooth', 'Area'], ['hollow', 'Hollow candles'], ['ha', 'Heikin Ashi'], ['bar', 'Bars'], ['line', 'Line'], ['base', 'Baseline']];
const RANGES = [['1D', '1m', 1], ['5D', '5m', 5], ['1M', '30m', 31], ['3M', '1h', 92], ['6M', '1d', 183], ['YTD', '1d', 'ytd'], ['1Y', '1d', 365], ['5Y', '1w', 1826], ['All', '1mo', 0]];
const trPhone = () => matchMedia('(max-width: 760px)').matches, trLayN = () => trPhone() ? 1 : LS.get('mt:lay2', 4), trSideP = () => LS.get('mt:side', 'wl');
let trMini = [], trFit = true, trRO = null, trWLT = null, trClk = null;
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
  const IC = (d, w = 18) => `<svg width=${w} height=${w} viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.6 stroke-linecap=round stroke-linejoin=round>${d}</svg>`;
  app.innerHTML = `<div class=trwrap>
   <div class=trtop><div class=trhead><div class=trsym><div class=trsearch>${IC('<circle cx=11 cy=11 r=6.5 /><path d="M20 20l-4.2-4.2"/>', 15)}<input class=inp id=trq value="${esc(TR.sym)}" autocomplete=off spellcheck=false aria-label="Symbol"><div id=trres class=trres hidden></div></div>
     <div class=trnm><div class=trname id=trname>&nbsp;</div><div class=trpxrow><b class="num trpx" id=trpx>-</b><span class=num id=trchg></span><span class="pill n" id=trdel hidden>delayed</span></div></div></div>
     <div class=trwatch>${WATCH.map(s => `<button class="chip ${s == TR.sym ? 'on' : ''}" data-s="${s}">${s.replace('-USD', '').replace('=F', '')}</button>`).join('')}</div></div>
    <div class=trbar><div class=seg id=trtf>${TFS.map(([k, l]) => `<button data-v=${k} class="${TR.tf == k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class=trtools><select class="inp trsel" id=trtype aria-label="Chart type">${TYPES.map(([k, l]) => `<option value=${k} ${TR.type == k ? 'selected' : ''}>${l}</option>`).join('')}</select><select class="inp trsel" id=trcs aria-label="Candle colours">${[['gr', 'Green / Red'], ['bw', 'Blue / Gray'], ['mono', 'Black / White']].map(([k, l]) => `<option value=${k} ${TR.cs == k ? 'selected' : ''}>${l}</option>`).join('')}</select>
       <button class="btn sm" id=trindb>${IC('<path d="M3 17l5-6 4 4 8-9"/><path d="M15 6h5v5"/>', 16)} Indicators <span class="pill n" id=trindn>${TR.ind.length}</span></button>
       <span class=trlay id=trlay>${[[1, '<rect x=4 y=4 width=16 height=16 rx=1.5 />'], [2, '<rect x=4 y=4 width=16 height=16 rx=1.5 /><path d="M12 4v16"/>'], [4, '<rect x=4 y=4 width=16 height=16 rx=1.5 /><path d="M12 4v16M4 12h16"/>']].map(([n, d]) => `<button data-n=${n} title="${n} chart${n > 1 ? 's' : ''}" class="${trLayN() == n ? 'on' : ''}">${IC(d, 17)}</button>`).join('')}</span>
       <button class="btn sm ${TR.tool == 'h' ? 'on' : ''}" id=trh title="Horizontal line: click the chart">― Line</button><button class="btn sm ${TR.tool == 't' ? 'on' : ''}" id=trt title="Trend line: click two points">╱ Trend</button><button class="btn sm" id=trclr title="Remove the drawings on this symbol">${ic('x', 13)}</button><button class="btn sm" id=trfit title="Fit everything">Fit</button>
       <button class="btn sm trthm" id=trshot title="Save a picture of the chart">${IC('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx=12 cy=13 r=3.5 />', 16)}</button><button class="btn sm" id=trfs title="Full screen">${IC('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 16)}</button><button class="btn sm" id=trthm title="Light or dark">${IC('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 16)}</button></div></div></div>
   <div class=trlt>${[['cur', 'Crosshair', '<path d="M12 3v18M3 12h18"/>'], ['trh', 'Horizontal line', '<path d="M3 12h18"/><circle cx=12 cy=12 r=1.6 />'], ['trt', 'Trend line', '<path d="M4 19L20 5"/><circle cx=4 cy=19 r=1.6 /><circle cx=20 cy=5 r=1.6 />'], ['trindb', 'Indicators', '<path d="M3 17l5-6 4 4 8-9"/>'], ['trfit', 'Fit everything', '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'], ['trclr', 'Remove drawings', '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>']].map(([k, t, d]) => `<button data-p=${k} title="${t}" aria-label="${t}">${IC(d, 19)}</button>`).join('')}</div>
   <div class=trgrid><div class="card trchartcard"><div class=trpanes id=trpanes>
     <div class="trchart on" id=trc><div class=trmov><div class=trmtop><b id=trmsym></b><span class=trmexch id=trmex></span></div><div class=trmpx><span class=num id=trmpx></span> <span class=num id=trmchg></span></div><div class=trqbs><button class="trqb sell" data-side=sell><b class=num id=trqsp>-</b>SELL</button><button class="trqb buy" data-side=buy><b class=num id=trqbp>-</b>BUY</button></div></div><div class=trlegend id=trleg></div><div class=trbub id=trbub hidden></div></div></div></div>
    <div class=trside><div class=trptabs id=trptabs>${[['wl', 'Watchlist'], ['tk', 'Order'], ['acct', 'Account']].map(([k, l]) => `<button data-v=${k} class="${trSideP() == k ? 'on' : ''}">${l}</button>`).join('')}</div><div class=trwl id=trwl></div><div class="card pad trticket" id=trtk></div><div class="card pad" id=tracct></div><div class="card pad" id=tropp></div></div></div>
   <div class=trrange>${RANGES.map(([k]) => `<button data-r=${k}>${k}</button>`).join('')}<span class=trmsp></span><span class=num id=trclock></span><button data-sc=2 title="Percent scale">%</button><button data-sc=1 title="Log scale">log</button><button data-sc=a title="Auto-fit the price scale" class=on>auto</button><span class=trpaper>Paper trading</span></div>
   <div class="card trtabs"><div class=trdockh><div class=seg id=trtab>${[['pos', 'Positions'], ['ord', 'Orders'], ['fills', 'History']].map(([k, l], i) => `<button data-v=${k} class="${i ? '' : 'on'}">${l}</button>`).join('')}</div><div class=trsum id=trsum></div><button class="btn danger sm" id=trend>${ic('x', 13)} End trading day</button></div><div id=trtbl></div></div></div>
   <div class=trscrim id=trscrim></div><div class=trmbar><button class=trmsy id=trmS aria-label="Change symbol"><b id=trmsy></b></button><button class=trmtfb id=trmT aria-label="Change timeframe"><span id=trmtf></span></button><span class=trmsp></span><button id=trmD aria-label="Drawing tools"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><path d="M13.5 6.5l3 3"/></svg></button><button id=trmI aria-label="Timeframe and indicators"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx=16 cy=7 r=2 /><circle cx=10 cy=17 r=2 /></svg></button><button id=trmA aria-label="Account and positions"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=3 y=6 width=18 height=13 rx=3 /><path d="M16 12.5h2M3 9h18"/></svg></button></div>`;
  if (trPhone()) { $('.trwrap').prepend($('.trbar')); $('.trwrap').prepend($('.trhead')); $('.trside').append($('.trtabs')); } /* sheets must sit outside the chart card (its stacking context put them under the dimming layer) */ // phones: positions live in the account sheet
  else document.body.classList.add('term');
  await trLib(); trBuild(); trWire(); trTicket(); trTermStart(); await trLoad(true); trStateLoad();
  trT1 = setInterval(() => { if (!$('#trc')) return trStop(); trLoad(false); }, 15e3); trTick();
  trT2 = setInterval(() => { if (!$('#trc')) return trStop(); trStateLoad(); }, 4e3);
  addEventListener('themechange', trTheme);
  mtapi('mcpinfo').then(r => { trWant = !!r.has; if (trWant) { trSync(); trT3 = setInterval(trSync, 3000); } }).catch(() => {}); // Claude connection: report the view, apply Claude's commands
}
function trLib() { return window.LightweightCharts ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/vendor/lwc.js'; s.onload = ok; s.onerror = () => no(new Error('chart library failed to load')); document.head.append(s); }); }
function trOpts() { const dark = document.documentElement.dataset.theme == 'dark', fg = dark ? '#8b8f9a' : '#5d606b', grid = dark ? 'rgba(255,255,255,.045)' : 'rgba(42,46,57,.06)', ln = dark ? '#1e2128' : '#e0e3eb', lab = dark ? '#2a2e39' : '#131722';
  return { layout: { background: { type: 'solid', color: 'transparent' }, textColor: fg, fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif', fontSize: 11 }, grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderVisible: true, borderColor: ln, scaleMargins: { top: .1, bottom: .08 } }, timeScale: { borderVisible: true, borderColor: ln, timeVisible: true, secondsVisible: SECT[TR?.tf] > 0, rightOffset: 10, barSpacing: 7 },
    crosshair: { mode: 0, vertLine: { color: dark ? '#6a6d78' : '#9598a1', width: 1, style: 3, labelBackgroundColor: lab }, horzLine: { color: dark ? '#6a6d78' : '#9598a1', width: 1, style: 3, labelBackgroundColor: lab } },
    handleScale: { axisPressedMouseMove: true }, localization: { priceFormatter: p => trN(p) } }; }
const trCol = () => { const dark = document.documentElement.dataset.theme == 'dark'; return TR.cs == 'mono' ? { up: '#ffffff', dn: dark ? '#000000' : '#131722', edge: dark ? '#d1d4dc' : '#131722' } : TR.cs == 'bw' ? { up: '#2962ff', dn: dark ? '#b2b5be' : '#9598a1' } : { up: '#089981', dn: '#f23645' }; };
function trTheme() { if (trChart) { trChart.applyOptions(trOpts()); trPaint(true); } trMini.forEach(m => { m.chart.applyOptions({ ...trOpts(), layout: { ...trOpts().layout, attributionLogo: false } }); trMiniPaint(m); }); }
function trBuild() {
  const el = $('#trc'); trChart = LightweightCharts.createChart(el, { ...trOpts(), autoSize: true });
  trChart.subscribeCrosshairMove(p => { trLegend(p); trBubble(p); }); trChart.subscribeClick(p => trClick(p));
  const off = () => { trFit = false; }; el.addEventListener('wheel', off, { passive: true }); el.addEventListener('mousedown', off); el.addEventListener('touchstart', off, { passive: true });
  trChart.timeScale().subscribeVisibleLogicalRangeChange(() => trVP());
  trRO = new ResizeObserver(() => { if (trFit && trData) trView(); }); trRO.observe(el); // keep the newest bars filling the chart when the panel resizes (no empty right side)
}
function trWire() {
  const q = $('#trq'), res = $('#trres'); let t = null;
  q.onfocus = () => q.select(); q.onkeydown = e => { if (e.key == 'Enter') { const f = res.querySelector('button'); trSet(f && !res.hidden ? f.dataset.s : q.value); res.hidden = true; q.blur(); } if (e.key == 'Escape') { res.hidden = true; q.blur(); } };
  q.oninput = () => { clearTimeout(t); const v = q.value.trim(); if (!v) { res.hidden = true; return; } t = setTimeout(async () => { try { const r = await mtapi('search', null, '&q=' + encodeURIComponent(v)); res.innerHTML = r.results.map(x => `<button data-s="${esc(x.sym)}"><b>${esc(x.sym)}</b><span>${esc(x.name)}</span><i>${esc(x.type.toLowerCase())} · ${esc(x.ex)}</i></button>`).join('') || '<div class=mut style="padding:12px">No matches</div>'; res.hidden = false; res.querySelectorAll('button').forEach(b => b.onmousedown = () => { trSet(b.dataset.s); res.hidden = true; }); } catch (e) {} }, 250); };
  q.onblur = () => setTimeout(() => { res.hidden = true; if (!q.value.trim()) q.value = TR.sym; }, 150);
  $$('.trwatch .chip').forEach(b => b.onclick = () => trSet(b.dataset.s));
  $('#trscrim').onclick = () => trSheet(null); $('#trmS').onclick = () => trSheet('sym'); $('#trmT').onclick = () => trSheet('tf'); $('#trmD').onclick = () => trSheet('tf'); $('#trmI').onclick = () => { trSheet(null); trPick(); }; $('#trmA').onclick = () => { trSheet('acct'); trStateLoad(); };
  $$('.trqb').forEach(b => b.onclick = () => { TR.side = b.dataset.side; trTicket(); if (trPhone()) trSheet('tk'); else trSideSet('tk'); });
  $$('#trtf button').forEach(b => b.onclick = () => { trSheet(null); TR.tf = b.dataset.v; TR.rng = null; trFit = true; trRngUi(); LS.set('mt:tf', TR.tf); $$('#trtf button').forEach(x => x.classList.toggle('on', x === b)); trLoad(true); });
  $('#trcs').onchange = e => { TR.cs = e.target.value; LS.set('mt:cs', TR.cs); trPaint(true); };
  $('#trtype').onchange = e => { TR.type = e.target.value; LS.set('mt:type3', TR.type); trPaint(true); };
  $('#trindb').onclick = () => { trSheet(null); trPick(); };
  $('#trh').onclick = () => { trSheet(null); TR.tool = TR.tool == 'h' ? null : 'h'; TR.pend = null; $('#trh').classList.toggle('on', TR.tool == 'h'); $('#trt').classList.remove('on'); };
  $('#trt').onclick = () => { trSheet(null); TR.tool = TR.tool == 't' ? null : 't'; TR.pend = null; $('#trt').classList.toggle('on', TR.tool == 't'); $('#trh').classList.remove('on'); };
  $('#trclr').onclick = () => { LS.set('mt:draw:' + TR.sym, []); trPaint(true); toast('Drawings removed'); };
  $('#trfit').onclick = () => { trFit = true; TR.rng = null; trRngUi(); trView(); };
  $$('.trlt button').forEach(b => b.onclick = () => { const k = b.dataset.p; if (k == 'cur') { TR.tool = null; TR.pend = null; $('#trh').classList.remove('on'); $('#trt').classList.remove('on'); trLegend(); trLtUi(); return; } $('#' + k).click(); trLtUi(); });
  $$('#trlay button').forEach(b => b.onclick = () => { LS.set('mt:lay2', +b.dataset.n); $$('#trlay button').forEach(x => x.classList.toggle('on', x === b)); trPanes(); });
  $$('#trptabs button').forEach(b => b.onclick = () => trSideSet(b.dataset.v));
  $$('.trrange button').forEach(b => b.onclick = () => { const r = RANGES.find(x => x[0] == b.dataset.r); TR.tf = r[1]; TR.rng = r[2]; LS.set('mt:tf', TR.tf); trFit = false; trUiSync(); trRngUi(b.dataset.r); trLoad(true); });
  $('#trthm').onclick = () => $('#ttheme')?.click();
  $('#trshot').onclick = () => { const u = trShot(); if (!u) return; const a = document.createElement('a'); a.href = u; a.download = `${trData?.sym || 'chart'}-${TR.tf}.jpg`; a.click(); };
  $('#trfs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {});
  $$('.trrange [data-sc]').forEach(b => b.onclick = () => { const k = b.dataset.sc, ps = trS.main?.priceScale(); if (!ps) return; if (k == 'a') { ps.applyOptions({ autoScale: true }); b.classList.add('on'); return; } const on = !b.classList.contains('on'); $$('.trrange [data-sc]').forEach(x => x.dataset.sc != 'a' && x.classList.remove('on')); b.classList.toggle('on', on); ps.applyOptions({ mode: on ? +k : 0 }); trVP(); });
  $$('#trtab button').forEach(b => b.onclick = () => { $$('#trtab button').forEach(x => x.classList.toggle('on', x === b)); trTable(); });
  $('#trend').onclick = async () => { if (!confirm('End the trading day? This cancels every open order and closes every position, yours and the Opposite Bot\'s, at the market.')) return; try { const r = await mtapi('endday', {}); toast(r.closed.length ? `Closed ${r.closed.length} position${r.closed.length > 1 ? 's' : ''}` : 'Nothing was open'); trStateLoad(); } catch (e) { toast(esc(e.message)); } };
}
function trSet(s) { s = String(s || '').trim().toUpperCase(); if (!s) return; trSheet(null); setTimeout(trTick, 50); TR.sym = s; LS.set('mt:sym', s); trFit = true; trWLUi(); $('#trq').value = s; $$('.trwatch .chip').forEach(b => b.classList.toggle('on', b.dataset.s == s)); trData = null; trLoad(true); trTicket(); }
async function trLoadSec(fresh) {
  const sym = TR.sym, tf = TR.tf, n = SECT[tf]; let d; try { d = await mtapi('candles', null, `&sym=${encodeURIComponent(sym)}&tf=1m`); } catch (e) { if (fresh) { $('#trname').textContent = e.message; toast(esc(e.message)); } return; }
  if (sym !== TR.sym || tf !== TR.tf || !$('#trc')) return; TR.sym = d.sym; $('#trq').value = d.sym; let B = [];
  if (/-USD$/.test(d.sym)) try { const r = await mtapi('trades', null, '&sym=' + encodeURIComponent(d.sym)); B = trAggTrades(r.trades || [], n); } catch (e) {}
  const px = trLastPx && trData?.sym === d.sym ? trLastPx : d.price; if (!B.length) { const t = Math.floor(Date.now() / 1000 / n) * n + TZ(); B = [{ t, o: px, h: px, l: px, c: px, v: 0 }]; }
  trData = { ...d, tf, B, sec: true }; const last = B[B.length - 1]; $('#trname').textContent = `${d.name} · ${d.ex}`; $('#trpx').textContent = trN(last.c); const ch = d.prev ? (last.c / d.prev - 1) * 100 : null; $('#trchg').innerHTML = ch == null ? '' : `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${trN(last.c - d.prev)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</span>`; $('#trdel').hidden = !d.delayed;
  const short = d.sym.replace('-USD', '').replace('=F', ''); $('#trmsym').textContent = short; $('#trmex').textContent = d.delayed ? 'delayed' : ''; $('#trmpx').textContent = trN(last.c); $('#trmchg').innerHTML = $('#trchg').innerHTML; $('#trqsp').textContent = trN(last.c); $('#trqbp').textContent = trN(last.c); $('#trmsy').textContent = short; $('#trmtf').textContent = tf;
  trPaint(true); trTicketPrice(); }
function trAggTrades(tr, sec) { const m = new Map(); for (const [t, p, v] of tr) { const k = Math.floor(t / 1000 / sec) * sec, b = m.get(k); if (!b) m.set(k, { t: k + TZ(), o: p, h: p, l: p, c: p, v }); else { b.h = Math.max(b.h, p); b.l = Math.min(b.l, p); b.c = p; b.v += v; } } return [...m.values()].sort((a, b) => a.t - b.t); }
async function trLoad(fresh) {
  if (SECT[TR.tf]) { if (fresh || !trData?.sec) return trLoadSec(fresh); return; } // second charts keep building from the live stream
  const sym = TR.sym, tf = TR.tf; let d; try { d = await mtapi('candles', null, `&sym=${encodeURIComponent(sym)}&tf=${tf}`); } catch (e) { if (fresh) { $('#trname').textContent = e.message; toast(esc(e.message)); } return; }
  if (sym !== TR.sym || tf !== TR.tf || !$('#trc')) return; const was = trData, sameSet = was && was.sym === d.sym && was.tf === tf && !fresh; TR.sym = d.sym; $('#trq').value = d.sym;
  trData = { ...d, B: d.bars.map(x => ({ t: x[0] + TZ(), o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })) };
  const last = trData.B[trData.B.length - 1]; if (last && d.price && /m$|h$/.test(tf) && /-USD$/.test(d.sym)) { last.c = d.price; last.h = Math.max(last.h, d.price); last.l = Math.min(last.l, d.price); }
  $('#trname').textContent = `${d.name} · ${d.ex}`; $('#trpx').textContent = trN(last?.c); const ch = d.prev ? (last.c / d.prev - 1) * 100 : null; $('#trchg').innerHTML = ch == null ? '' : `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${trN(last.c - d.prev)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</span>`; $('#trdel').hidden = !d.delayed; const short = d.sym.replace('-USD', '').replace('=F', ''), pxs = trN(last?.c); $('#trmsym').textContent = short; $('#trmex').textContent = d.delayed ? 'delayed' : ''; $('#trmpx').textContent = pxs; $('#trmchg').innerHTML = $('#trchg').innerHTML; $('#trqsp').textContent = pxs; $('#trqbp').textContent = pxs; $('#trmsy').textContent = short; $('#trmtf').textContent = TFS.find(x => x[0] == TR.tf)?.[1] || TR.tf;
  trPaint(!sameSet); trTicketPrice();
}
function trBars() { const B = trData.B; if (TR.type != 'ha') return B; const o = []; B.forEach((b, i) => { const c = (b.o + b.h + b.l + b.c) / 4, op = i ? (o[i - 1].o + o[i - 1].c) / 2 : (b.o + b.c) / 2; o.push({ t: b.t, o: op, c, h: Math.max(b.h, op, c), l: Math.min(b.l, op, c), v: b.v }); }); return o; }
function trView() { // what part of the history is on screen: a picked range (1D, 5D ...) or the newest bars filling the width
  if (!trChart || !trData) return; const B = trData.B, n = B.length, ts = trChart.timeScale(); if (!n) return;
  if (TR.rng != null) { const last = B[n - 1].t, r = TR.rng, from = r === 0 ? B[0].t : r == 'ytd' ? Date.UTC(new Date().getFullYear(), 0, 1) / 1000 : last - r * 86400; let i = B.findIndex(b => b.t >= from); if (i < 0) i = 0; ts.setVisibleLogicalRange({ from: i - .5, to: n + 3 }); return; }
  const w = $('#trc')?.clientWidth || 800, vis = Math.max(40, Math.min(trPhone() ? 70 : 220, Math.round(w / 8))); if (n > vis || trData.sec) ts.setVisibleLogicalRange({ from: n - vis, to: n + Math.max(3, Math.round(vis * .04)) }); else ts.fitContent(); }
function trPaint(rebuild) {
  if (!trChart || !trData) return; const B = trBars(), dark = document.documentElement.dataset.theme == 'dark', mono = TR.cs == 'mono', { up, dn, edge = null } = trCol(), ac = trCss('--accent'), acr = trCss('--accent-rgb'), C = B.map(b => b.c), T = B.map(b => b.t), pal = indPalette();
  if (rebuild) { for (const s of Object.values(trS)) try { trChart.removeSeries(s); } catch (e) {} trS = {}; trLines = []; }
  const col = c => c === 'up' ? up : c === 'down' ? dn : typeof c === 'number' ? pal[c] : c || pal[8];
  const ser = a => a.map((v, i) => v == null || !isFinite(v) ? { time: T[i] } : { time: T[i], value: v });
  // the price
  if (!trS.main) { const k = TR.type, base = { priceLineColor: ac, priceLineStyle: 2 };
    trS.main = k == 'smooth' ? trChart.addAreaSeries({ ...base, lineColor: ac, lineWidth: 2.5, lineType: 2, topColor: `rgba(${acr},.22)`, bottomColor: `rgba(${acr},0)`, crosshairMarkerRadius: 6, crosshairMarkerBorderColor: trCss('--panel'), crosshairMarkerBorderWidth: 3, crosshairMarkerBackgroundColor: ac })
      : k == 'line' ? trChart.addLineSeries({ ...base, color: ac, lineWidth: 2, crosshairMarkerRadius: 5, crosshairMarkerBorderColor: trCss('--panel'), crosshairMarkerBackgroundColor: ac })
      : k == 'base' ? trChart.addBaselineSeries({ ...base, baseValue: { type: 'price', price: trData.prev || C[0] }, topLineColor: up, topFillColor1: up + '40', topFillColor2: up + '05', bottomLineColor: dn, bottomFillColor1: dn + '05', bottomFillColor2: dn + '40', lineWidth: 2 })
      : k == 'bar' ? trChart.addBarSeries({ ...base, upColor: mono ? (dark ? '#ffffff' : '#121214') : up, downColor: mono ? (dark ? '#8e8e93' : '#8a8a94') : dn, thinBars: false })
      : trChart.addCandlestickSeries({ ...base, upColor: k == 'hollow' ? 'rgba(0,0,0,0)' : up, downColor: dn, borderUpColor: edge || up, borderDownColor: edge || dn, wickUpColor: edge || up, wickDownColor: edge || dn }); }
  trS.main.setData(/smooth|line|base/.test(TR.type) ? B.map(b => ({ time: b.t, value: b.c })) : B.map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })));
  trMain = trS.main;
  // indicators: overlays on the price, oscillators in panes stacked from the bottom
  const act = TR.ind.filter(k => IND[k] && k != 'vp'), panes = act.filter(k => IND[k].pane), PH = panes.length > 2 ? .15 : .18, mainBottom = panes.length * PH, hasVol = act.includes('vol');
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
  trOrderLines(); if (rebuild) trView(); trVP(); trLegend(); if ($('#trindn')) $('#trindn').textContent = act.length;
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
  el.innerHTML = `<div class=trpbg></div><div class=trpbox><div class="row sb"><h2>Indicators</h2><button class="btn ic sm" id=trpclose aria-label=Close>${ic('x', 14)}</button></div>
    <input class=inp id=trpq placeholder="Search ${Object.keys(IND).length} indicators" value="${esc(q)}" autocomplete=off>
    <div class="seg chips trpg">${['All', ...INDGROUPS].map(g => `<button data-g="${g}" class="${g == grp ? 'on' : ''}">${g}</button>`).join('')}</div>
    ${on.length && !q && grp == 'All' ? `<div class=trph>On the chart · ${on.length}</div><div class=trpon>${on.map(k => `<div class=trpo><div class=trpoh><span class=trpdot style="background:${trDot(k)}"></span><b>${esc(trIndName(k))}</b><button class=trprm data-k=${k} aria-label="Remove">${ic('x', 12)}</button></div>${IND[k].p.length ? `<div class=trpp>${IND[k].p.map(([n, l, d, mn, mx, st]) => `<label><span>${l}</span><input class=inp type=number inputmode=decimal data-k=${k} data-n=${n} min=${mn} max=${mx} step=${st} value=${trPrm(k)[n]}></label>`).join('')}</div>` : ''}</div>`).join('')}</div>` : ''}
    <div class=trph>${grp == 'All' && !q ? 'All indicators' : items.length + ' found'}</div><div class=trplist>${items.map(([k, d]) => `<button class="trpi ${TR.ind.includes(k) ? 'on' : ''}" data-k=${k}><span class=trpdot style="background:${trDot(k)}"></span><span class=trpt><b>${esc(d.n)}</b><span>${esc(d.d)}</span></span><span class=trpg2>${d.pane ? 'own pane' : d.vol ? 'bottom' : 'on price'}</span><span class="trsw sm ${TR.ind.includes(k) ? 'on' : ''}"><i></i></span></button>`).join('') || '<div class=empty style="padding:20px">Nothing matches.</div>'}</div></div>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); }, save = () => { LS.set('mt:ind2', TR.ind); LS.set('mt:prm', TR.prm); trPaint(true); };
  el.querySelector('.trpbg').onclick = close; $('#trpclose').onclick = close;
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
  const uc = b.c >= b.o ? 'up' : 'down'; el.innerHTML = `<div><b class=trln>${esc(trPhone() ? trData.sym : trData.name || trData.sym)}</b> · ${TFS.find(x => x[0] == TR.tf)?.[1]} · ${esc(trData.ex || '')} <span class=trohlc>O<b class=${uc}>${trN(b.o)}</b>H<b class=${uc}>${trN(b.h)}</b>L<b class=${uc}>${trN(b.l)}</b>C<b class=${uc}>${trN(b.c)}</b><b class=${chg >= 0 ? 'up' : 'down'}>${chg >= 0 ? '+' : ''}${trN(b.c - (i ? B[i - 1].c : b.o))} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</b></span></div><div class=trlv>${vals.join('')}${vals.length > 4 ? `<span class=trmore>+${vals.length - 4} more</span>` : ''}</div>${TR.tool ? `<div class=trhint>${TR.tool == 'h' ? 'Click the chart to place a line' : TR.pend ? 'Click the second point' : 'Click the first point of the trend line'}</div>` : ''}`; trLtUi(); }
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
  const sm = $('#trsum'); if (sm) sm.innerHTML = `<span>Equity <b class=num>${trM(me.equity)}</b></span><span>Open P&L <b class="num ${me.upnl >= 0 ? 'up' : 'down'}">${trM(me.upnl)}</b></span><span>Total <b class="num ${pm >= 0 ? 'up' : 'down'}">${pm >= 0 ? '+' : ''}${trM(pm)}</b></span><span>Opposite Bot <b class="num ${po >= 0 ? 'up' : 'down'}">${op.enabled ? (po >= 0 ? '+' : '') + trM(po) : 'off'}</b></span>`;
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
const SECT = { '1s': 1, '5s': 5, '15s': 15 }; // second charts are built live from the price stream
const TFSEC = { '1s': 1, '5s': 5, '15s': 15, '1m': 60, '2m': 120, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400 };
function trTickStop() { clearInterval(trQT); trQT = null; if (trWS) { trWS.onclose = null; try { trWS.close(); } catch (e) {} trWS = null; } }
function trTick() {
  trTickStop(); const sym = TR.sym;
  if (/-USD$/.test(sym) && 'WebSocket' in window) { try { trWS = new WebSocket('wss://ws-feed.exchange.coinbase.com'); trWS.onopen = () => trWS.send(JSON.stringify({ type: 'subscribe', product_ids: [sym], channels: ['ticker'] }));
    let at = 0; trWS.onmessage = e => { const m = JSON.parse(e.data); if (m.type != 'ticker' || m.product_id != TR.sym || !trS.main) return; const px = +m.price; if (!trUpd(px, +m.last_size || 0)) return; const n = Date.now(); if (n - at > (trData.sec ? 120 : 250)) { at = n; trRender(px); } }; // every trade counts for the bar; at most ~8 redraws a second
    trWS.onclose = () => { trWS = null; if ($('#trc') && TR.sym == sym) setTimeout(() => TR.sym == sym && trTick(), 3000); }; } catch (e) {} }
  trQT = setInterval(async () => { if (!$('#trc')) return trTickStop(); if (trWS && trWS.readyState === 1) return; if (document.hidden) return;
    try { const r = await mtapi('quote', null, '&sym=' + encodeURIComponent(sym)); if (r.sym === trData?.sym) trLive(r.px, 0); } catch (e) {} }, 1000);
}
function trUpd(px, vol = 0) { // add one price to the data (a new bar when the time has moved on)
  if (!trData || !(px > 0)) return false; const B = trData.B, last = B[B.length - 1]; if (!last) return false; const sec = TFSEC[TR.tf], now = Math.floor(Date.now() / 1000) + TZ();
  if (sec && now >= last.t + sec) { const t = last.t + Math.floor((now - last.t) / sec) * sec; B.push({ t, o: last.c, h: Math.max(last.c, px), l: Math.min(last.c, px), c: px, v: vol }); if (trData.sec && B.length > 1500) B.shift(); }
  else { last.c = px; last.h = Math.max(last.h, px); last.l = Math.min(last.l, px); last.v = (last.v || 0) + vol; } return true; }
function trLive(px, vol) { if (trS.main && trUpd(px, vol)) trRender(px); }
function trRender(px) {
  if (!trData || !trS.main) return; const B = trData.B;
  const b = trBars()[B.length - 1], line = /smooth|line|base/.test(TR.type); try { trS.main.update(line ? { time: b.t, value: b.c } : { time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }); } catch (e) {}
  if (px !== trLastPx) { const el = $('#trpx'), dir = trLastPx == null ? 0 : px > trLastPx ? 1 : -1; trLastPx = px; const t = trN(px); if (el) { el.textContent = t; el.classList.remove('tkup', 'tkdn'); void el.offsetWidth; if (dir) el.classList.add(dir > 0 ? 'tkup' : 'tkdn'); }
    if ($('#trmpx')) $('#trmpx').textContent = t; if ($('#trqsp')) { $('#trqsp').textContent = t; $('#trqbp').textContent = t; }
    const ch = trData.prev ? (px / trData.prev - 1) * 100 : null; if (ch != null) { const h = `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${trN(px - trData.prev)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</span>`; $('#trchg').innerHTML = h; if ($('#trmchg')) $('#trmchg').innerHTML = h; } }
  if (Date.now() - trPaintAt > 5000) { trPaintAt = Date.now(); trPaint(false); } else trLegend(); // indicators follow every 5 s
  if (TR.kind == 'market') trEst();
}

/* ---------- Claude connection: report what the page shows, send a snapshot when Claude asks, apply Claude's chart commands ---------- */
function trShot() { try { const c = trChart.takeScreenshot(), W = Math.min(c.width, 1000), k = W / c.width, H = Math.round(c.height * k) + 40, t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d');
    g.fillStyle = document.documentElement.dataset.theme == 'dark' ? '#111113' : '#ffffff'; g.fillRect(0, 0, W, H); g.fillStyle = document.documentElement.dataset.theme == 'dark' ? '#f2f2f3' : '#121214'; g.font = '600 18px sans-serif';
    g.fillText(`${trData.sym}  ${TFS.find(x => x[0] == TR.tf)?.[1]}  ${trN(trLastPx ?? trData.B[trData.B.length - 1].c)}   ${TR.ind.filter(k => IND[k]).map(trIndName).join(' · ')}`.slice(0, 120), 12, 26); g.drawImage(c, 0, 40, W, H - 40); return t.toDataURL('image/jpeg', .8); } catch (e) { return null; } }
async function trSync() {
  if (!trWant || !trData || !$('#trc') || document.hidden) return; const B = trData.B, snap = trNeedSnap ? trShot() : null;
  try { const r = await mtapi('view', { view: { sym: trData.sym, tf: TR.tf, type: TR.type, cs: TR.cs, ind: TR.ind, prm: TR.prm, draw: LS.get('mt:draw:' + trData.sym, []), price: trLastPx ?? B[B.length - 1]?.c, bars: B.length, theme: document.documentElement.dataset.theme }, snap });
    trNeedSnap = !!r.snap; if (!r.want) { trWant = false; clearInterval(trT3); } if (r.cmds?.length) trApply(r.cmds); } catch (e) {} }
function trUiSync() { trRngUi(); $$('#trtf button').forEach(b => b.classList.toggle('on', b.dataset.v == TR.tf)); if ($('#trtype')) $('#trtype').value = TR.type; if ($('#trcs')) $('#trcs').value = TR.cs; $('#trindn') && ($('#trindn').textContent = TR.ind.filter(k => IND[k]).length); }
function trApply(cmds) {
  let repaint = false, reload = false, sym = null; const save = () => { LS.set('mt:ind2', TR.ind); LS.set('mt:prm', TR.prm); }, dk = s => 'mt:draw:' + (s || TR.sym);
  for (const c of cmds) {
    if (c.k == 'set') { if (c.type == 'sharp') c.type = 'candle'; if (c.type && TYPES.some(x => x[0] == c.type)) { TR.type = c.type; LS.set('mt:type3', c.type); repaint = true; } if (c.cs && ['gr', 'bw', 'mono'].includes(c.cs)) { TR.cs = c.cs; LS.set('mt:cs', c.cs); repaint = true; } if (c.tf && TFS.some(x => x[0] == c.tf)) { TR.tf = c.tf; LS.set('mt:tf', c.tf); reload = true; } if (c.sym) sym = c.sym; }
    if (c.k == 'ind') { if (c.clear) TR.ind = []; for (const k of c.remove || []) TR.ind = TR.ind.filter(x => x != k); for (const a of c.add || []) if (IND[a.key]) { if (!TR.ind.includes(a.key)) TR.ind.push(a.key); if (a.params) TR.prm[a.key] = { ...(TR.prm[a.key] || {}), ...a.params }; } save(); repaint = true; }
    if (c.k == 'hline' && c.p > 0) { const d = LS.get(dk(c.sym), []); d.push({ k: 'h', p: c.p }); LS.set(dk(c.sym), d); repaint = true; }
    if (c.k == 'trend' && c.t2 > c.t1) { const d = LS.get(dk(c.sym), []); d.push({ k: 't', t1: c.t1 + TZ(), p1: c.p1, t2: c.t2 + TZ(), p2: c.p2 }); LS.set(dk(c.sym), d); repaint = true; }
    if (c.k == 'clear') { LS.set(dk(c.sym), []); repaint = true; } }
  trUiSync(); if (sym) { trSet(sym); toast('Claude changed your chart'); return; } if (reload) { trLoad(true); toast('Claude changed your chart'); } else if (repaint) { trPaint(true); toast('Claude changed your chart'); } }

/* ---------- terminal extras (desktop): side panel tabs, range buttons, watchlist, clock, extra chart panes ---------- */
function trSideSet(k) { LS.set('mt:side', k); const sd = $('.trside'); if (sd) sd.dataset.p = k; $$('#trptabs button').forEach(b => b.classList.toggle('on', b.dataset.v == k)); if (k == 'wl') trWLLoad(); }
function trRngUi(k) { $$('.trrange button').forEach(b => b.classList.toggle('on', b.dataset.r == k)); }
function trLtUi() { $$('.trlt button').forEach(b => b.classList.toggle('on', b.dataset.p == 'cur' ? !TR.tool : b.dataset.p == 'trh' ? TR.tool == 'h' : b.dataset.p == 'trt' ? TR.tool == 't' : false)); }
const trWL = () => LS.get('mt:wl', WATCH);
let trWLQ = {};
function trWLUi() { const el = $('#trwl'); if (!el) return; const L = trWL();
  el.innerHTML = `<div class=trwlh><span>Symbol</span><span class=r>Last</span><span class=r>Chg%</span></div><div class=trwlb>${L.map(s => { const q = trWLQ[s] || {}, ch = q.px && q.prev ? (q.px / q.prev - 1) * 100 : null; return `<div class="trwlr ${s == TR.sym || s == trData?.sym ? 'on' : ''}" data-s="${esc(s)}"><b>${esc(s.replace('-USD', '').replace('=F', ''))}<i>${/-USD$/.test(s) ? 'crypto' : /=F$/.test(s) ? 'futures' : ''}</i></b><span class="r num">${trN(q.px)}</span><span class="r num ${ch == null ? '' : ch >= 0 ? 'up' : 'down'}">${ch == null ? '-' : (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'}</span><button class=trwlx data-x="${esc(s)}" aria-label="Remove ${esc(s)}">${ic('x', 11)}</button></div>`; }).join('')}</div><form class=trwla id=trwla><input class=inp id=trwli placeholder="Add symbol (e.g. AMD, ETH, NQ)" autocomplete=off spellcheck=false></form>`;
  el.querySelectorAll('.trwlr').forEach(r => r.onclick = e => { if (!e.target.closest('.trwlx')) trSet(r.dataset.s); });
  el.querySelectorAll('.trwlx').forEach(b => b.onclick = () => { LS.set('mt:wl', trWL().filter(x => x != b.dataset.x)); trWLUi(); });
  $('#trwla').onsubmit = e => { e.preventDefault(); let v = $('#trwli').value.trim().toUpperCase(); if (!v) return; if (/^(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|LTC|LINK)$/.test(v)) v += '-USD'; if (/^(NQ|ES|YM|RTY|GC|SI|CL|NG)$/.test(v)) v += '=F'; if (!trWL().includes(v)) LS.set('mt:wl', [...trWL(), v]); trWLUi(); trWLLoad(); setTimeout(() => $('#trwli')?.focus(), 0); }; }
async function trWLLoad() { if (!$('#trwl') || trPhone() || document.hidden) return; try { const r = await mtapi('quotes', null, '&syms=' + encodeURIComponent(trWL().join(','))); for (const q of r.quotes) trWLQ[q.sym] = q; } catch (e) {} if (!$('#trwli') || document.activeElement !== $('#trwli')) trWLUi(); }
const trMiniCfg = () => LS.get('mt:mini2', [{ sym: 'AAPL', tf: '1h', type: 'candle', ind: ['bb', 'ema9'] }, { sym: 'NFLX', tf: '1d', type: 'candle', ind: ['ribbon'] }, { sym: 'BTC-USD', tf: '1h', type: 'line', ind: ['ema21', 'sma50'] }]);
function trMiniKill() { for (const m of trMini) { clearInterval(m.t); try { m.chart.remove(); } catch (e) {} } trMini = []; $$('.trmini').forEach(x => x.remove()); }
function trPanes() { // 1, 2 or 4 charts: the first is the full chart, the others are compact ones you can click to bring into the main chart
  trMiniKill(); const host = $('#trpanes'); if (!host || !window.LightweightCharts) return; const n = trLayN(); host.dataset.n = n; const cfg = trMiniCfg();
  for (let i = 0; i < n - 1; i++) { const el = document.createElement('div'); el.className = 'trmini'; el.innerHTML = '<div class=trmleg></div>'; host.append(el);
    const m = { i, sym: cfg[i].sym, tf: cfg[i].tf, el, chart: LightweightCharts.createChart(el, { ...trOpts(), autoSize: true, layout: { ...trOpts().layout, attributionLogo: false } }), B: null }; m.type = cfg[i].type || 'candle'; m.ind = cfg[i].ind || []; m.is = []; m.s = m.type == 'line' ? m.chart.addLineSeries({ color: '#2962ff', lineWidth: 2, priceLineStyle: 2, crosshairMarkerRadius: 4 }) : m.chart.addCandlestickSeries({ priceLineStyle: 2 });
    m.v = m.chart.addHistogramSeries({ priceScaleId: 'v', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }); m.v.priceScale().applyOptions({ scaleMargins: { top: .84, bottom: 0 } });
    m.chart.subscribeCrosshairMove(p => trMiniLeg(m, p)); m.chart.subscribeClick(() => trMiniSwap(m)); m.el.querySelector('.trmleg').onclick = () => trMiniSwap(m);
    trMini.push(m); trMiniLoad(m); m.t = setInterval(() => $('#trc') ? trMiniLoad(m) : clearInterval(m.t), 15e3); } }
async function trMiniLoad(m) { try { const d = await mtapi('candles', null, `&sym=${encodeURIComponent(m.sym)}&tf=${m.tf}`); if (!trMini.includes(m)) return; m.d = d; const first = !m.B; m.B = d.bars.map(x => ({ t: x[0] + TZ(), o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })); trMiniPaint(m); if (first) { const n = m.B.length, vis = Math.min(n, Math.round(m.el.clientWidth / 7)); m.chart.timeScale().setVisibleLogicalRange({ from: n - vis, to: n + 3 }); } } catch (e) { m.el.querySelector('.trmleg').textContent = m.sym + ': ' + e.message; } }
function trMiniPaint(m) { if (!m.B) return; const { up, dn, edge } = trCol(), pal = indPalette(), C = m.B.map(b => b.c), T = m.B.map(b => b.t);
  if (m.type == 'line') m.s.setData(m.B.map(b => ({ time: b.t, value: b.c }))); else { m.s.applyOptions({ upColor: up, downColor: dn, borderUpColor: edge || up, borderDownColor: edge || dn, wickUpColor: edge || up, wickDownColor: edge || dn }); m.s.setData(m.B.map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }))); }
  for (const x of m.is) try { m.chart.removeSeries(x); } catch (e) {} m.is = [];
  for (const k of m.ind) { const D = IND[k]; if (!D || D.pane || D.vol) continue; const P = {}; for (const [n, , d] of D.p) P[n] = d;
    for (const o of D.run(m.B, C, P, { tf: m.tf })) { if (o.hist) continue; const sr = m.chart.addLineSeries({ color: typeof o.c === 'number' ? pal[o.c] : o.c || pal[8], lineWidth: o.w || 1.5, lineStyle: o.dash || 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); sr.setData(o.v.map((v, i) => v == null || !isFinite(v) ? { time: T[i] } : { time: T[i], value: v })); m.is.push(sr); } } m.v.setData(m.B.map((b, i) => ({ time: b.t, value: b.v || 0, color: (b.c >= b.o ? up : dn) + '55' }))); trMiniLeg(m); }
function trMiniLeg(m, p) { const el = m.el.querySelector('.trmleg'); if (!m.B || !el) return; let b = m.B[m.B.length - 1]; if (p && p.time != null) b = m.B.find(x => x.t === p.time) || b; const ch = m.d?.prev ? (m.B[m.B.length - 1].c / m.d.prev - 1) * 100 : null;
  el.innerHTML = `<b>${esc(m.d?.name || m.sym)}</b> · ${TFS.find(x => x[0] == m.tf)?.[1] || m.tf} · ${esc(m.d?.ex || '')} <span class=trmo>O<b>${trN(b.o)}</b> H<b>${trN(b.h)}</b> L<b>${trN(b.l)}</b> C<b>${trN(b.c)}</b></span> ${ch == null ? '' : `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>`}`; }
function trMiniSwap(m) { if (!trData) return; const ms = m.sym, mt = m.tf; m.sym = trData.sym; m.tf = SECT[TR.tf] ? '1m' : TR.tf; m.B = null; LS.set('mt:mini2', Object.assign(trMiniCfg(), { [m.i]: { sym: m.sym, tf: m.tf, type: m.type, ind: m.ind } }));
  trMiniLoad(m); TR.tf = mt; TR.rng = null; LS.set('mt:tf', mt); trUiSync(); trSet(ms); }
function trTermStart() { if (trPhone()) return; trSideSet(trSideP()); trWLUi(); trWLLoad(); trWLT = setInterval(trWLLoad, 5e3); trPanes(); trLtUi();
  const ck = () => { const el = $('#trclock'); if (!el) return; const d = new Date(); el.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' ' + (Intl.DateTimeFormat().resolvedOptions().timeZone || '').split('/').pop().replace('_', ' '); }; ck(); trClk = setInterval(ck, 1000); }

function trVP() { // volume profile over the visible bars, drawn on a canvas laid over the chart
  const host = $('#trc'); if (!host) return; let cv = host.querySelector('canvas.trvp'); const on = TR.ind.includes('vp') && trData && trS.main && !/smooth|line|base/.test(TR.type);
  if (!on) { cv?.remove(); return; } if (!cv) { cv = document.createElement('canvas'); cv.className = 'trvp'; host.append(cv); }
  const r = trChart.timeScale().getVisibleLogicalRange(), B = trData.B; if (!r) return; const a = Math.max(0, Math.floor(r.from)), z = Math.min(B.length - 1, Math.ceil(r.to)); if (z <= a) return;
  const sw = trChart.priceScale('right').width(), W = host.clientWidth - sw, H = host.clientHeight - 28, dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  let lo = Infinity, hi = -Infinity; for (let i = a; i <= z; i++) { lo = Math.min(lo, B[i].l); hi = Math.max(hi, B[i].h); } if (!(hi > lo)) return;
  const n = trPrm('vp').rows || 28, st = (hi - lo) / n, U = new Array(n).fill(0), D = new Array(n).fill(0);
  for (let i = a; i <= z; i++) { const b = B[i], v = b.v || 1, k0 = Math.max(0, Math.floor((b.l - lo) / st)), k1 = Math.min(n - 1, Math.floor((b.h - lo) / st)), each = v / (k1 - k0 + 1); for (let k = k0; k <= k1; k++) (b.c >= b.o ? U : D)[k] += each; }
  const mx = Math.max(...U.map((u, k) => u + D[k])), poc = U.map((u, k) => u + D[k]).indexOf(mx), g = cv.getContext('2d'); g.scale(dpr, dpr); const maxW = W * .28;
  for (let k = 0; k < n; k++) { const y1 = trS.main.priceToCoordinate(lo + k * st), y2 = trS.main.priceToCoordinate(lo + (k + 1) * st); if (y1 == null || y2 == null) continue; const h = Math.max(1, Math.abs(y1 - y2) - 1), y = Math.min(y1, y2), wu = U[k] / mx * maxW, wd = D[k] / mx * maxW;
    g.fillStyle = k == poc ? 'rgba(41,98,255,.75)' : 'rgba(41,98,255,.38)'; g.fillRect(W - wu - wd, y, wu, h); g.fillStyle = k == poc ? 'rgba(255,152,0,.8)' : 'rgba(255,152,0,.42)'; g.fillRect(W - wd, y, wd, h); }
  const yp = trS.main.priceToCoordinate(lo + (poc + .5) * st); if (yp != null) { g.strokeStyle = 'rgba(255,82,82,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yp); g.lineTo(W, yp); g.stroke(); } }
