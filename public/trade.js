// Manual Trading: a TradingView-style chart (TradingView's open-source Lightweight Charts) with timeframes, chart types, indicators, drawing tools
// and a paper order ticket for stocks, ETFs, futures and crypto. Plus the Opposite Bot: it takes the reverse of every fill you get.
let TR = null; // set on first visit (LS lives in app.js, loaded after this file)
const trInit = () => TR || (TR = { sym: LS.get('mt:sym', 'SPY'), tf: LS.get('mt:tf', '5m'), type: LS.get('mt:type3', 'candle').replace('sharp', 'candle'), cs: LS.get('mt:cs', 'gr'), prm: LS.get('mt:prm', {}), ind: LS.get('mt:ind2', ['bb', 'vp', 'vol']), side: 'buy', kind: 'market', tool: null, pend: null, ext: LS.get('mt:ext', false) });
let trChart = null, trMain = null, trS = {}, trData = null, trState = null, trT1 = null, trT2 = null, trT3 = null, trLines = [], trDraw = [], trWant = false, trNeedSnap = false;
const trSheet = n => { if (n) document.body.dataset.trs = n; else delete document.body.dataset.trs; if (n == 'sym') setTimeout(() => $('#trq')?.focus(), 250); };
const trStop = () => { rpKill(); trTickStop(); trSheet(null); $('#trpick')?.remove(); clearInterval(trT1); clearInterval(trT2); clearInterval(trT3); trT1 = trT2 = trT3 = null; trWant = false; if (trChart) { try { trChart.remove(); } catch (e) {} trChart = null; } trS = {}; trData = null; trDraw = []; trBotS = []; trBotPL = []; trCusS = []; trLines = []; trOut = {}; trLastPx = null; trMain = null; trState = null; removeEventListener('themechange', trTheme); document.querySelector('body > #trtk')?.remove(); trMiniKill(); clearInterval(trWLT); clearInterval(trClk); trWLT = trClk = null; trRO?.disconnect(); trRO = null; document.body.classList.remove('term', 'twall'); delete document.body.dataset.tt; document.getElementById('twall')?.remove(); };
const mtapi = async (op, body, qs = '') => { const r = await fetch('/api/powell' + (body ? '' : `?op=mt-${op}${qs}`), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'mt-' + op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j; };
const TFS = [['1s', '1s'], ['5s', '5s'], ['15s', '15s'], ['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['30m', '30m'], ['1h', '1H'], ['4h', '4H'], ['1d', '1D'], ['1w', '1W'], ['1mo', '1M']];
const TYPES = [['candle', 'Candles'], ['smooth', 'Area'], ['hollow', 'Hollow candles'], ['ha', 'Heikin Ashi'], ['bar', 'Bars'], ['line', 'Line'], ['base', 'Baseline']];
const RANGES = [['1D', '1m', 1], ['5D', '5m', 5], ['1M', '30m', 31], ['3M', '1h', 92], ['6M', '1d', 183], ['YTD', '1d', 'ytd'], ['1Y', '1d', 365], ['5Y', '1w', 1826], ['All', '1mo', 0]];
const trPhone = () => matchMedia('(max-width: 760px)').matches, trLayN = () => trPhone() ? 1 : LS.get('mt:lay2', 4), trSideP = () => LS.get('mt:side', 'wl') == 'acct' ? 'acct' : 'wl';
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
   <div class=trtabbar id=trtabbar></div>
   <div class=trtop><div class=trhead><div class=trsym><div class=trsearch>${IC('<circle cx=11 cy=11 r=6.5 /><path d="M20 20l-4.2-4.2"/>', 15)}<input class=inp id=trq value="${esc(TR.sym)}" autocomplete=off spellcheck=false aria-label="Symbol"><div id=trres class=trres hidden></div></div>
     <div class=trnm><div class=trname id=trname>&nbsp;</div><div class=trpxrow><b class="num trpx" id=trpx>-</b><span class=num id=trchg></span><span class="pill n" id=trdel hidden>delayed</span></div></div></div>
     <div class=trwatch>${WATCH.map(s => `<button class="chip ${s == TR.sym ? 'on' : ''}" data-s="${s}">${s.replace('-USD', '').replace('=F', '')}</button>`).join('')}</div></div>
    <div class=trbar><div class=seg id=trtf>${TFS.map(([k, l]) => `<button data-v=${k} class="${TR.tf == k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class=trtools><select class="inp trsel" id=trtype aria-label="Chart type">${TYPES.map(([k, l]) => `<option value=${k} ${TR.type == k ? 'selected' : ''}>${l}</option>`).join('')}</select><select class="inp trsel" id=trcs aria-label="Candle colours">${[['gr', 'Green / Red'], ['bw', 'Blue / Gray'], ['mono', 'Black / White']].map(([k, l]) => `<option value=${k} ${TR.cs == k ? 'selected' : ''}>${l}</option>`).join('')}</select>
       <button class="btn sm" id=trindb>${IC('<path d="M3 17l5-6 4 4 8-9"/><path d="M15 6h5v5"/>', 16)} Indicators <span class="pill n" id=trindn>${TR.ind.length}</span></button><button class="btn sm trrthb" id=trrthb title="Regular trading hours only, or extended hours">${TR.ext ? 'ETH' : 'RTH'}</button><button class="btn sm" id=trrpb title="Replay: go back to any point and trade the market as it plays forward">${IC('<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/><path d="M10 9l5 3-5 3z"/>', 16)} Replay</button><button class="btn sm troppb" id=troppb title="The Opposite Bot takes the reverse of every trade you make">Opposite <i class=trdot></i></button><button class="btn sm trtradeb" id=trtradeb title="Open the order window">Trade</button><button class="btn sm trautob" id=trautob title="Auto: detect the market type and pick the best indicators">Auto</button>
       <span class=trlay id=trlay>${[[1, '<rect x=4 y=4 width=16 height=16 rx=1.5 />'], [2, '<rect x=4 y=4 width=16 height=16 rx=1.5 /><path d="M12 4v16"/>'], [4, '<rect x=4 y=4 width=16 height=16 rx=1.5 /><path d="M12 4v16M4 12h16"/>']].map(([n, d]) => `<button data-n=${n} title="${n} chart${n > 1 ? 's' : ''}" class="${trLayN() == n ? 'on' : ''}">${IC(d, 17)}</button>`).join('')}<button data-n=link title="Same symbol on every chart (each keeps its own timeframe and indicators)" class="${trLink() ? 'on' : ''}">${IC('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 17)}</button></span>
       <button class="btn sm" id=trh title="Horizontal line: click the chart">― Line</button><button class="btn sm" id=trt title="Trend line: click two points">╱ Trend</button><button class="btn sm" id=trclr title="Remove the drawings on this symbol">${ic('x', 13)}</button><button class="btn sm" id=trfit title="Fit everything">Fit</button>
       <button class="btn sm trthm" id=trwallb title="Terminal wallpaper: your own picture or video">${IC('<rect x=3 y=4 width=18 height=16 rx=2 /><circle cx=9 cy=10 r=2 /><path d="M21 16l-5-5-9 9"/>', 16)}</button><input type=file id=trwallf accept="image/*,video/mp4,video/webm,video/quicktime" hidden><button class="btn sm" id=trshot title="Save a picture of the chart">${IC('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx=12 cy=13 r=3.5 />', 16)}</button><button class="btn sm" id=trfs title="Full screen">${IC('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 16)}</button><button class="btn sm" id=trthm title="Light or dark">${IC('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 16)}</button></div></div></div>
   <div class=trlt>${[['cur', 'Cursor', '<path d="M5 3l14 7-6 2-2 6z"/>'], ['trend', 'Trend line', '<path d="M4 19L20 5"/><circle cx=4 cy=19 r=1.6 /><circle cx=20 cy=5 r=1.6 />'], ['ray', 'Ray', '<path d="M4 18L21 6"/><circle cx=4 cy=18 r=1.6 /><circle cx=12 cy=12.4 r=1.6 />'], ['hline', 'Horizontal line', '<path d="M3 12h18"/><circle cx=12 cy=12 r=1.6 />'], ['vline', 'Vertical line', '<path d="M12 3v18"/><circle cx=12 cy=12 r=1.6 />'], ['rect', 'Rectangle', '<rect x=4 y=6 width=16 height=12 rx=1 />'], ['fib', 'Fibonacci retracement', '<path d="M3 5h18M3 9.5h18M3 14h18M3 19h18"/><path d="M5 19L19 5" stroke-dasharray="2 2"/>'], ['long', 'Long position', '<rect x=4 y=4 width=16 height=8 fill="#089981" fill-opacity=.35 stroke="#089981"/><rect x=4 y=12 width=16 height=8 fill="#f23645" fill-opacity=.35 stroke="#f23645"/>'], ['short', 'Short position', '<rect x=4 y=4 width=16 height=8 fill="#f23645" fill-opacity=.35 stroke="#f23645"/><rect x=4 y=12 width=16 height=8 fill="#089981" fill-opacity=.35 stroke="#089981"/>'], ['trindb', 'Indicators', '<path d="M3 17l5-6 4 4 8-9"/>'], ['trfit', 'Fit everything', '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'], ['del', 'Delete the selected drawing', '<path d="M7 7l10 10M17 7L7 17"/>'], ['trclr', 'Remove all drawings', '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>']].map(([k, t, d]) => `<button data-p=${k} title="${t}" aria-label="${t}">${IC(d, 19)}</button>`).join('')}</div>
   <div class=trgrid><div class="card trchartcard"><div class=trpanes id=trpanes>
     <div class="trchart on" id=trc><div class=trmov><div class=trmtop><b id=trmsym></b><span class=trmexch id=trmex></span></div><div class=trmpx><span class=num id=trmpx></span> <span class=num id=trmchg></span></div><div class=trqbs><button class="trqb sell" data-side=sell><b class=num id=trqsp>-</b>SELL</button><button class="trqb buy" data-side=buy><b class=num id=trqbp>-</b>BUY</button></div></div><div class=trlegend id=trleg></div><div class=trbub id=trbub hidden></div></div></div></div>
    <div class=trside><div class=trptabs id=trptabs>${[['wl', 'Watchlist'], ['acct', 'Account']].map(([k, l]) => `<button data-v=${k} class="${trSideP() == k ? 'on' : ''}">${l}</button>`).join('')}</div><div class=trwl id=trwl></div><div class="card pad trticket" id=trtk></div><div class="card pad" id=tracct></div><div class="card pad" id=tropp></div></div></div>
   <div class=trrange>${RANGES.map(([k]) => `<button data-r=${k}>${k}</button>`).join('')}<span class=trmsp></span><span class=num id=trclock></span><button data-x=1 title="Regular trading hours only (like TradingView) or extended hours with pre- and after-market" class="${TR.ext ? 'on' : ''}">${TR.ext ? 'ETH' : 'RTH'}</button><button data-sc=2 title="Percent scale">%</button><button data-sc=1 title="Log scale">log</button><button data-sc=a title="Auto-fit the price scale" class=on>auto</button><span class=trpaper>Paper trading</span></div>
   <div class="card trtabs"><div class=trdockh><div class=seg id=trtab>${[['pos', 'Positions'], ['ord', 'Orders'], ['fills', 'History']].map(([k, l], i) => `<button data-v=${k} class="${i ? '' : 'on'}">${l}</button>`).join('')}</div><div class=trsum id=trsum></div><button class="btn danger sm" id=trend>${ic('x', 13)} End trading day</button></div><div id=trtbl></div></div></div>
   <div class=trscrim id=trscrim></div><div class=trmbar><button class=trmsy id=trmS aria-label="Change symbol"><b id=trmsy></b></button><button class=trmtfb id=trmT aria-label="Change timeframe"><span id=trmtf></span></button><span class=trmsp></span><button id=trmD aria-label="Drawing tools"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><path d="M13.5 6.5l3 3"/></svg></button><button id=trmI aria-label="Timeframe and indicators"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx=16 cy=7 r=2 /><circle cx=10 cy=17 r=2 /></svg></button><button id=trmA aria-label="Account and positions"><svg width=22 height=22 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 stroke-linecap=round stroke-linejoin=round><rect x=3 y=6 width=18 height=13 rx=3 /><path d="M16 12.5h2M3 9h18"/></svg></button></div>`;
  if (trPhone()) { $('.trwrap').prepend($('.trbar')); $('.trwrap').prepend($('.trhead')); $('.trside').append($('.trtabs')); } /* sheets must sit outside the chart card (its stacking context put them under the dimming layer) */ // phones: positions live in the account sheet
  else { document.body.classList.add('term'); document.body.dataset.tt = trTT(); const tk = $('#trtk'); tk.className = 'trwin'; document.body.append(tk); }
  trCustomReg(); await trBotReg(); await trLib(); trBuild(); trWire(); trTicket(); trTermStart(); await trLoad(true); trStateLoad();
  trT1 = setInterval(() => { if (!$('#trc')) return trStop(); trLoad(false); }, 15e3); trTick(); if (window.__replay) { window.__replay = false; setTimeout(rpPickStart, 300); } if (window.__larp && typeof larpGo == 'function') setTimeout(larpGo, 400);
  trT2 = setInterval(() => { if (!$('#trc')) return trStop(); trStateLoad(); }, 4e3);
  addEventListener('themechange', trTheme);
  mtapi('mcpinfo').then(r => { trWant = !!r.has; if (trWant) { trSync(); trT3 = setInterval(trSync, 3000); } }).catch(() => {}); // Claude connection: report the view, apply Claude's commands
}
function trLib() { return window.MimicCharts ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/chart.js?v=7'; s.onload = ok; s.onerror = () => no(new Error('chart engine failed to load')); document.head.append(s); }); }
function trOpts() { const dark = trDark(), tv = dark && trTT() == 'tv' && document.body.classList.contains('term'), fg = tv ? '#7d89b0' : dark ? '#8b8f9a' : '#5d606b', grid = tv ? 'rgba(90,120,230,.09)' : dark ? 'rgba(255,255,255,.045)' : 'rgba(42,46,57,.06)', ln = tv ? '#1c2650' : dark ? '#1e2128' : '#e0e3eb', lab = tv ? '#22327a' : dark ? '#2a2e39' : '#131722';
  return { layout: { background: { type: 'solid', color: 'transparent' }, textColor: fg, fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif', fontSize: 11 }, grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderVisible: true, borderColor: ln, scaleMargins: { top: .1, bottom: .08 } }, timeScale: { borderVisible: true, borderColor: ln, timeVisible: true, secondsVisible: SECT[TR?.tf] > 0, rightOffset: 10, barSpacing: 7 },
    crosshair: { mode: 0, vertLine: { color: dark ? '#6a6d78' : '#9598a1', width: 1, style: 3, labelBackgroundColor: lab }, horzLine: { color: dark ? '#6a6d78' : '#9598a1', width: 1, style: 3, labelBackgroundColor: lab } },
    handleScale: { axisPressedMouseMove: true }, localization: { priceFormatter: p => trN(p) }, glow: dark, drawColor: '#2962ff' }; }
const trTT = () => LS.get('mt:theme', 'tv'), trDark = () => trPhone() || !document.body.classList.contains('term') ? document.documentElement.dataset.theme == 'dark' : trTT() != 'light';
const TTN = { tv: 'TradingView dark', oled: 'OLED black', light: 'Light' };
function trTheme2(k) { LS.set('mt:theme', k); document.body.dataset.tt = k; trTheme(); }
const trCol = () => { const dark = trDark(); return TR.cs == 'mono' ? { up: '#ffffff', dn: dark ? '#000000' : '#131722', edge: dark ? '#d1d4dc' : '#131722' } : TR.cs == 'bw' ? { up: '#2962ff', dn: dark ? '#b2b5be' : '#9598a1' } : (trTT() == 'tv' && document.body.classList.contains('term') ? { up: '#26a69a', dn: '#ef5350' } : { up: '#089981', dn: '#f23645' }); };
function trTheme() { if (trChart) { trChart.applyOptions(trOpts()); trPaint(true); } trMini.forEach(m => { m.chart.applyOptions({ ...trOpts(), layout: { ...trOpts().layout, attributionLogo: false } }); trMiniPaint(m); }); }
function trBuild() {
  const el = $('#trc'); trChart = MimicCharts.createChart(el, { ...trOpts(), autoSize: true });
  trChart.subscribeCrosshairMove(p => { trLegend(p); trBubble(p); }); trChart.subscribeClick(p => trClick(p));
  trChart.subscribePosition(trPosAct);
  trChart.subscribeDrawings(l => { if (l && trData) LS.set('mt:draw:' + trData.sym, l); trLtUi(); trLegend(); });
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
  $('#trscrim').onclick = () => trSheet(null); $('#trmS').onclick = () => trSheet('sym'); $('#trmT').onclick = () => trSheet('tf'); $('#trmD').onclick = () => trSheet('tf'); $('#trmI').onclick = () => { trSheet(null); trPick('', 'All', null); }; $('#trmA').onclick = () => { trSheet('acct'); trStateLoad(); };
  $$('.trqb').forEach(b => b.onclick = () => trOrderWin(b.dataset.side));
  $$('#trtf button').forEach(b => b.onclick = () => { trSheet(null); TR.tf = b.dataset.v; TR.rng = null; trFit = true; trRngUi(); trTabSet({ tf: TR.tf }); LS.set('mt:tf', TR.tf); $$('#trtf button').forEach(x => x.classList.toggle('on', x === b)); trLoad(true); });
  $('#trcs').onchange = e => { TR.cs = e.target.value; LS.set('mt:cs', TR.cs); trPaint(true); };
  $('#trtype').onchange = e => { TR.type = e.target.value; LS.set('mt:type3', TR.type); trPaint(true); };
  $('#trindb').onclick = () => { trSheet(null); trPick('', 'All', null); }; $('#trautob').onclick = () => { trSheet(null); trAuto(); }; $('#trtradeb').onclick = () => trOrderWin(TR.side); $('#trrpb').onclick = () => TR.rp || TR.rpPick ? rpExit() : rpPickStart(); $('#troppb').onclick = trOppToggle; $('#trrthb').onclick = () => $('.trrange [data-x]').click();
  $('#trh').onclick = () => trTool('hline');
  $('#trt').onclick = () => trTool('trend');
  $('#trclr').onclick = () => { LS.set('mt:draw:' + TR.sym, []); trChart?.setDrawings([]); toast('Drawings removed'); };
  $('#trfit').onclick = () => { trFit = true; TR.rng = null; trRngUi(); trView(); };
  $$('.trlt button').forEach(b => b.onclick = () => { const k = b.dataset.p; if (k == 'cur') trTool(null); else if (k == 'del') { if (!trChart?.deleteSelected()) toast('Click a drawing first, then delete it (or press Delete)'); } else if (k == 'trclr' || k == 'trfit' || k == 'trindb') $('#' + k).click(); else trTool(k); });
  $$('#trlay button').forEach(b => b.onclick = () => { if (b.dataset.n == 'link') { LS.set('mt:link', !trLink()); b.classList.toggle('on', trLink()); if (trLayN() == 1) { LS.set('mt:lay2', 4); $$('#trlay button').forEach(x => x.dataset.n != 'link' && x.classList.toggle('on', x.dataset.n == '4')); } trPanes(); toast(trLink() ? 'Every chart now shows ' + (trData?.sym || TR.sym) : 'Charts unlinked'); return; } LS.set('mt:lay2', +b.dataset.n); $$('#trlay button').forEach(x => x.dataset.n != 'link' && x.classList.toggle('on', x === b)); trPanes(); });
  $$('#trptabs button').forEach(b => b.onclick = () => trSideSet(b.dataset.v));
  $$('.trrange button').forEach(b => b.onclick = () => { const r = RANGES.find(x => x[0] == b.dataset.r); TR.tf = r[1]; TR.rng = r[2]; LS.set('mt:tf', TR.tf); trTabSet({ tf: TR.tf }); trFit = false; trUiSync(); trRngUi(b.dataset.r); trLoad(true); });
  $('#trthm').onclick = () => { const o = ['tv', 'oled', 'light'], k = o[(o.indexOf(trTT()) + 1) % 3]; trTheme2(k); toast('Terminal theme: ' + TTN[k]); };
  $('#trwallb').onclick = () => { if (LS.get('mt:wall', false) && confirm('Remove the terminal wallpaper? (Cancel to pick a new one)')) { LS.set('mt:wall', false); trWall(); return; } $('#trwallf').click(); };
  $('#trwallf').onchange = async e => { const f = e.target.files[0]; if (!f) return; const vid = /^video/.test(f.type); if (f.size > (vid ? 80 : 30) * 1048576) { toast(`Too big (max ${vid ? 80 : 30} MB)`); return; } try { await idbPut('twall', f); LS.set('mt:wall', { mime: f.type, at: Date.now() }); trWall(); toast('Terminal wallpaper set'); } catch (err) { toast('Could not save that file here'); } };
  $('#trshot').onclick = () => { const u = trShot(); if (!u) return; const a = document.createElement('a'); a.href = u; a.download = `${trData?.sym || 'chart'}-${TR.tf}.jpg`; a.click(); };
  $('#trfs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {});
  $('.trrange [data-x]').onclick = e => { TR.ext = !TR.ext; LS.set('mt:ext', TR.ext); e.target.textContent = TR.ext ? 'ETH' : 'RTH'; e.target.classList.toggle('on', TR.ext); $('#trrthb').textContent = TR.ext ? 'ETH' : 'RTH'; toast(TR.ext ? 'Extended hours: pre- and after-market included' : 'Regular trading hours only'); trData = null; trLoad(true); trMini.forEach(m => { m.B = null; trMiniLoad(m); }); };
  $$('.trrange [data-sc]').forEach(b => b.onclick = () => { const k = b.dataset.sc, ps = trS.main?.priceScale(); if (!ps) return; if (k == 'a') { ps.applyOptions({ autoScale: true }); b.classList.add('on'); return; } const on = !b.classList.contains('on'); $$('.trrange [data-sc]').forEach(x => x.dataset.sc != 'a' && x.classList.remove('on')); b.classList.toggle('on', on); ps.applyOptions({ mode: on ? +k : 0 }); trVP(); });
  $$('#trtab button').forEach(b => b.onclick = () => { $$('#trtab button').forEach(x => x.classList.toggle('on', x === b)); trTable(); });
  $('#trend').onclick = async () => { if (!confirm('End the trading day? This cancels every open order and closes every position, yours and the Opposite Bot\'s, at the market.')) return; try { const r = await mtapi('endday', {}); toast(r.closed.length ? `Closed ${r.closed.length} position${r.closed.length > 1 ? 's' : ''}` : 'Nothing was open'); trStateLoad(); } catch (e) { toast(esc(e.message)); } };
}
function trSet(s) { s = String(s || '').trim().toUpperCase(); if (!s) return; trSheet(null); setTimeout(trTick, 50); TR.sym = s; LS.set('mt:sym', s); trFit = true; trWLUi(); trTabSet({ sym: s }); if (trLink()) trMini.forEach(m => { m.B = null; trMiniLoad(m); }); $('#trq').value = s; $$('.trwatch .chip').forEach(b => b.classList.toggle('on', b.dataset.s == s)); trData = null; trLoad(true); trTicket(); }
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
  if (TR.rp) return; // replay owns the chart
  if (SECT[TR.tf]) { if (fresh || !trData?.sec) return trLoadSec(fresh); return; } // second charts keep building from the live stream
  const sym = TR.sym, tf = TR.tf; let d; try { d = await mtapi('candles', null, `&sym=${encodeURIComponent(sym)}&tf=${tf}&ext=${TR.ext ? 1 : 0}`); } catch (e) { if (fresh) { $('#trname').textContent = e.message; toast(esc(e.message)); } return; }
  if (sym !== TR.sym || tf !== TR.tf || !$('#trc')) return; const was = trData, sameSet = was && was.sym === d.sym && was.tf === tf && !fresh; TR.sym = d.sym; $('#trq').value = d.sym;
  trData = { ...d, B: d.bars.map(x => ({ t: x[0] + TZ(), o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })) };
  const last = trData.B[trData.B.length - 1]; if (last && d.price && /m$|h$/.test(tf) && /-USD$/.test(d.sym)) { last.c = d.price; last.h = Math.max(last.h, d.price); last.l = Math.min(last.l, d.price); }
  $('#trname').textContent = `${d.name} · ${d.ex}`; $('#trpx').textContent = trN(last?.c); const ch = d.prev ? (last.c / d.prev - 1) * 100 : null; $('#trchg').innerHTML = ch == null ? '' : `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${trN(last.c - d.prev)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</span>`; $('#trdel').hidden = !d.delayed; const short = d.sym.replace('-USD', '').replace('=F', ''), pxs = trN(last?.c); $('#trmsym').textContent = short; $('#trmex').textContent = d.delayed ? 'delayed' : ''; $('#trmpx').textContent = pxs; $('#trmchg').innerHTML = $('#trchg').innerHTML; $('#trqsp').textContent = pxs; $('#trqbp').textContent = pxs; $('#trmsy').textContent = short; $('#trmtf').textContent = TFS.find(x => x[0] == TR.tf)?.[1] || TR.tf;
  trPaint(!sameSet); trTicketPrice();
}
function trBars() { const B = trData.B; if (TR.type != 'ha') return B; const o = []; B.forEach((b, i) => { const c = (b.o + b.h + b.l + b.c) / 4, op = i ? (o[i - 1].o + o[i - 1].c) / 2 : (b.o + b.c) / 2; o.push({ t: b.t, o: op, c, h: Math.max(b.h, op, c), l: Math.min(b.l, op, c), v: b.v }); }); return o; }
function trSecOpts() { trChart?.applyOptions({ minRange: SECT[TR.tf] ? .0025 : 0, timeScale: { secondsVisible: !!SECT[TR.tf] } }); }
function trView() { // what part of the history is on screen: a picked range (1D, 5D ...) or the newest bars filling the width
  if (!trChart || !trData) return; const B = trData.B, n = B.length, ts = trChart.timeScale(); if (!n) return; trChart.priceScale('right').applyOptions({ autoScale: true }); $('.trrange [data-sc=a]')?.classList.add('on');
  if (TR.rng != null) { const last = B[n - 1].t, r = TR.rng, from = r === 0 ? B[0].t : r == 'ytd' ? Date.UTC(new Date().getFullYear(), 0, 1) / 1000 : last - r * 86400; let i = B.findIndex(b => b.t >= from); if (i < 0) i = 0; ts.setVisibleLogicalRange({ from: i - .5, to: n + 3 }); return; }
  const w = $('#trc')?.clientWidth || 800, vis = Math.max(40, Math.min(trPhone() ? 70 : 220, Math.round(w / 8))); if (n > vis || trData.sec) ts.setVisibleLogicalRange({ from: n - vis, to: n + Math.max(3, Math.round(vis * .04)) }); else ts.fitContent(); }
function trPaint(rebuild) {
  if (!trChart || !trData) return; const B = trBars(), dark = trDark(), mono = TR.cs == 'mono', { up, dn, edge = null } = trCol(), ac = trCss('--accent'), acr = trCss('--accent-rgb'), C = B.map(b => b.c), T = B.map(b => b.t), pal = indPalette();
  if (rebuild) trSecOpts();
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
  const act = TR.ind.filter(k => IND[k] && k != 'vp' && !IND[k].bot && !IND[k].custom), panes = act.filter(k => IND[k].pane), cpn = TR.ind.filter(k => IND[k]?.custom && IND[k].pane).length, PH = trPH = panes.length + cpn > 2 ? .15 : .18, mainBottom = (panes.length + cpn) * PH, hasVol = act.includes('vol');
  trS.main.priceScale().applyOptions({ scaleMargins: { top: .1, bottom: Math.min(.72, mainBottom + (hasVol ? .13 : .06)) } }); trOut = {};
  for (const k of act) { const D = IND[k], P = trPrm(k), outs = D.run(B, C, P, { tf: TR.tf }), pi = panes.indexOf(k), scale = D.vol ? 'vol' : pi >= 0 ? 'p_' + k : 'right', top = pi >= 0 ? 1 - PH * (pi + 1) + .03 : D.vol ? 1 - mainBottom - .12 : null, bottom = pi >= 0 ? PH * pi + .015 : D.vol ? mainBottom + .005 : null; trOut[k] = outs;
    const firstLine = outs.find(x => !x.hist);
    if (!trS[k + ':fill'] && (k == 'st' || outs.some(o => o.fill))) trS[k + ':fill'] = trChart.addFillSeries({ priceScaleId: scale }); // TradingView-style shading (Supertrend to the candle bodies, between the Bollinger bands)
    if (trS[k + ':fill']) { const F = trS[k + ':fill'], mid = i => (B[i].o + B[i].c) / 2;
      if (k == 'st') { const u = outs.find(o => o.id == 'u').v, d = outs.find(o => o.id == 'd').v; F.setData(T.map((t, i) => u[i] != null ? { time: t, a: u[i], b: mid(i), color: 'rgba(38,166,154,.13)' } : d[i] != null ? { time: t, a: d[i], b: mid(i), color: 'rgba(239,83,80,.13)' } : { time: t })); }
      else { const o1 = outs.find(o => o.fill), o2 = outs.find(o => o.id == o1.fill); F.setData(T.map((t, i) => ({ time: t, a: o1.v[i], b: o2?.v[i], color: col(o1.c) + '18' }))); } }
    for (const o of outs) { const id = k + ':' + o.id; let s = trS[id];
      if (!s) { s = trS[id] = o.hist ? trChart.addHistogramSeries({ priceScaleId: scale, priceLineVisible: false, lastValueVisible: false, priceFormat: D.vol ? { type: 'volume' } : undefined })
        : trChart.addLineSeries({ priceScaleId: scale, color: col(o.c), lineWidth: o.w || 1.5, lineStyle: o.dash || 0, lineVisible: !o.dots, pointMarkersVisible: !!o.dots, pointMarkersRadius: 1.6, priceLineVisible: false, lastValueVisible: pi >= 0 && o === firstLine, crosshairMarkerVisible: false });
        if (o.lv) for (const y of o.lv) s.createPriceLine({ price: y, color: pal[8] + '99', lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); }
      if (top != null) s.priceScale().applyOptions({ scaleMargins: { top, bottom } });
      s.setData(o.hist ? o.v.map((v, i) => v == null || !isFinite(v) ? { time: T[i] } : { time: T[i], value: v, color: (mono && o.cs ? (o.cs[i] == 'up' ? (dark ? '#ffffff' : '#121214') : '#8e8e93') : col(o.cs?.[i] || o.c)) + (D.vol ? '55' : 'aa') }) : ser(o.v)); } }
  // drawings
  if (rebuild) trChart.setDrawings(trDrawGet(TR.sym));
  trOrderLines(); if (rebuild) trView(); trVP(); trBots(rebuild); trCustomRun(rebuild); trLegend(); if ($('#trindn')) $('#trindn').textContent = act.length;
}
let trOut = {};
const trPrm = k => { const P = {}; for (const [n, , d] of IND[k].p) P[n] = TR.prm[k]?.[n] ?? d; return P; };
const trIndName = k => { const D = IND[k], P = trPrm(k); if (!D.p.length) return D.n; if (/ \d+$/.test(D.n)) return D.n.replace(/\d+$/, P.n); return `${D.n} ${D.p.map(([n]) => P[n]).join(', ')}`; };
const DOT = { sma20: 1, sma50: 6, sma200: 7, ema9: 2, ema21: 4, wma: 6, hma: 4, dema: 7, tema: 6, vwma: 3, lsma: 5, ribbon: 1, vwap: 6, bb: 8, kc: 5, dc: 4, env: 7, st: 'up', psar: 6, ichi: 1, piv: 8, vol: 8, rsi: 4, srsi: 1, macd: 1, stoch: 2, cci: 6, willr: 7, roc: 3, ao: 'up', trix: 5, adx: 1, aroon: 'up', obv: 7, mfi: 3, cmf: 'up', atr: 5, stdev: 8, bbw: 6 };
const trDot = k => { if (IND[k]?.bot || IND[k]?.custom) return IND[k].col; const c = DOT[k]; return c === 'up' ? trCss('--up') : indPalette()[c ?? 8]; };
function trBubble(p) { // the pill price bubble that follows the crosshair (like the reference shots)
  const el = $('#trbub'); if (!el || !trS.main) return; if (!p || !p.point || p.time == null) { el.hidden = true; return; } const d = p.seriesData?.get(trS.main), v = d ? (d.value ?? d.close) : null; if (v == null) { el.hidden = true; return; }
  const y = trS.main.priceToCoordinate(v); if (y == null) { el.hidden = true; return; } el.textContent = trN(v); el.hidden = false; const w = el.offsetWidth, W = $('#trc').clientWidth - 70;
  el.style.left = Math.max(4, Math.min(W - w, p.point.x - w / 2)) + 'px'; el.style.top = Math.max(4, y - 42) + 'px'; }
/* the indicator picker: search, groups, switch on / off, settings for the ones on the chart */
let trPickM = null; // null = the main chart, a number = that extra chart
function trPick(q = '', grp = 'All', mi = trPickM) { trPickM = mi; const tgt = mi == null ? null : trMini[mi], cur = tgt ? tgt.ind : TR.ind;
  let el = $('#trpick'); if (!el) { el = document.createElement('div'); el.id = 'trpick'; el.className = 'trpickwrap'; document.body.append(el); }
  const items = Object.entries(IND).filter(([k, d]) => (!tgt || (!d.bot && k != 'vp')) && (grp == 'All' || d.g == grp) && (!q || (d.n + ' ' + d.d + ' ' + d.g).toLowerCase().includes(q.toLowerCase()))), on = tgt ? [] : TR.ind.filter(k => IND[k]);
  el.innerHTML = `<div class=trpbg></div><div class=trpbox><div class="row sb"><h2>Indicators${tgt ? ` · ${esc(trLink() ? (trData?.sym || TR.sym) : tgt.sym)} ${TFS.find(x => x[0] == tgt.tf)?.[1] || tgt.tf}` : ''}</h2><button class="btn ic sm" id=trpclose aria-label=Close>${ic('x', 14)}</button></div>
    <input class=inp id=trpq placeholder="Search ${Object.keys(IND).length} indicators" value="${esc(q)}" autocomplete=off>
    <div class="seg chips trpg">${['All', ...INDGROUPS.filter(g => !tgt || g != 'Bots')].map(g => `<button data-g="${g}" class="${g == grp ? 'on' : ''}">${g}</button>`).join('')}</div>
    ${on.length && !q && grp == 'All' ? `<div class=trph>On the chart · ${on.length}</div><div class=trpon>${on.map(k => `<div class=trpo><div class=trpoh><span class=trpdot style="background:${trDot(k)}"></span><b>${esc(trIndName(k))}</b><button class=trprm data-k=${k} aria-label="Remove">${ic('x', 12)}</button></div>${IND[k].p.length ? `<div class=trpp>${IND[k].p.map(([n, l, d, mn, mx, st]) => `<label><span>${l}</span><input class=inp type=number inputmode=decimal data-k=${k} data-n=${n} min=${mn} max=${mx} step=${st} value=${trPrm(k)[n]}></label>`).join('')}</div>` : ''}</div>`).join('')}</div>` : ''}
    ${grp == 'Custom' && !tgt ? `<div class=trcimp><button class="btn sm pri" id=trcimp>Import indicator file…</button><button class="btn sm" id=trcpaste>Paste code…</button><button class="btn sm" id=trctpl>Download template</button><input type=file id=trcfile accept=".js,.txt" hidden><div class=mut>Your own indicator as a small JavaScript file. It runs sandboxed in a background worker: it only sees the candles, nothing else.</div></div>` : ''}<div class=trph>${grp == 'All' && !q ? 'All indicators' : items.length + ' found'}</div><div class=trplist>${items.map(([k, d]) => `<button class="trpi ${cur.includes(k) ? 'on' : ''}" data-k=${k}><span class=trpdot style="background:${trDot(k)}"></span><span class=trpt><b>${esc(d.n)}</b><span>${esc(d.d)}</span></span>${d.custom ? `<span class=trcdel data-del=${k} title="Delete this indicator">${ic('x', 11)}</span>` : ''}<span class=trpg2>${d.custom ? 'yours' : d.bot ? 'bot signals' : d.pane ? 'own pane' : d.vol ? 'bottom' : 'on price'}</span><span class="trsw sm ${cur.includes(k) ? 'on' : ''}"><i></i></span></button>`).join('') || '<div class=empty style="padding:20px">Nothing matches.</div>'}</div></div>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); trPickM = null; }, save = () => { if (tgt) { trMiniSave(); trMiniPaint(tgt); return; } LS.set('mt:ind2', TR.ind); LS.set('mt:prm', TR.prm); trPaint(true); };
  el.querySelector('.trpbg').onclick = close; $('#trpclose').onclick = close;
  const qi = $('#trpq'); qi.oninput = () => { const pos = qi.selectionStart; trPick(qi.value, grp); const n = $('#trpq'); n.focus(); n.setSelectionRange(pos, pos); };
  el.querySelectorAll('.trpg button').forEach(b => b.onclick = () => trPick(q, b.dataset.g));
  if ($('#trcimp')) { $('#trcimp').onclick = () => $('#trcfile').click(); $('#trcfile').onchange = async e => { const f = e.target.files[0]; if (f) { trCustomAdd(await f.text(), f.name); trPick(q, 'Custom'); } };
    $('#trcpaste').onclick = () => { const c = prompt('Paste your indicator code (see the template for the format):'); if (c) { trCustomAdd(c, 'pasted'); trPick(q, 'Custom'); } };
    $('#trctpl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([CUSTOM_TPL], { type: 'text/javascript' })); a.download = 'my-indicator.js'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }; }
  el.querySelectorAll('.trcdel').forEach(b => b.onclick = e => { e.stopPropagation(); if (!confirm('Delete this indicator?')) return; const k = b.dataset.del; LS.set('mt:custom', LS.get('mt:custom', []).filter(x => 'c_' + x.id != k)); delete IND[k]; TR.ind = TR.ind.filter(x => x != k); LS.set('mt:ind2', TR.ind); trPaint(true); trPick(q, grp); });
  el.querySelectorAll('.trpi').forEach(b => b.onclick = e => { if (e.target.closest('.trcdel')) return; const k = b.dataset.k, nx = cur.includes(k) ? cur.filter(x => x != k) : [...cur, k]; if (tgt) tgt.ind = nx; else TR.ind = nx; save(); trPick(q, grp); });
  el.querySelectorAll('.trprm').forEach(b => b.onclick = () => { TR.ind = TR.ind.filter(x => x != b.dataset.k); save(); trPick(q, grp); });
  el.querySelectorAll('.trpp input').forEach(i => i.onchange = () => { const k = i.dataset.k, v = Math.min(+i.max, Math.max(+i.min, +i.value)); if (!isFinite(v)) return; TR.prm[k] = { ...(TR.prm[k] || {}), [i.dataset.n]: v }; save(); trPick(q, grp); });
}
function trOrderLines() { // your position and resting orders, drawn on the chart
  if (!trS.main || (!trState && !TR.rp)) return; for (const pl of trS.main._ol || []) try { trS.main.removePriceLine(pl); } catch (e) {} const out = [];
  if (TR.rp) { rpLines(out); trS.main._ol = out; trPosSync(); return; }
  for (const o of trState.orders.filter(x => x.sym == trData?.sym)) out.push(trS.main.createPriceLine({ price: o.px, color: o.side == 'buy' ? trCss('--up') : trCss('--down'), lineWidth: 1, lineStyle: 2, title: `${o.grp ? (o.kind == 'stop' ? 'SL' : 'TP') : o.kind} ${o.side} ${trN(o.qty, 0)}` }));
  trS.main._ol = out; trPosSync(); }
function trLegend(p) {
  const el = $('#trleg'); if (!el || !trData) return; const B = trBars(); let i = B.length - 1; if (p && p.time != null) { const k = B.findIndex(b => b.t === p.time); if (k >= 0) i = k; } const b = B[i]; if (!b) return;
  const chg = i ? (b.c / B[i - 1].c - 1) * 100 : 0, vals = [];
  for (const k of TR.ind) { if (!IND[k]) continue; if (IND[k].bot) { const r = trBotR[k + '|' + trData.sym]?.r; vals.push(`<span style="color:${trDot(k)}">${esc(IND[k].n)}${r ? ': <b>' + esc(String(r.status || '').slice(0, 90)) + '</b>' : ' …'}</span>`); continue; } const o = (trOut[k] || []).find(x => !x.hist) || trOut[k]?.[0], v = o?.v?.[i]; vals.push(`<span style="color:${trDot(k)}">${esc(trIndName(k))}${v != null && isFinite(v) ? ' <b>' + trN(v) + '</b>' : ''}</span>`); }
  const uc = b.c >= b.o ? 'up' : 'down'; el.innerHTML = `<div><b class=trln>${esc(trPhone() ? trData.sym : trData.name || trData.sym)}</b> · ${TFS.find(x => x[0] == TR.tf)?.[1]} · ${esc(trData.ex || '')} <span class=trohlc>O<b class=${uc}>${trN(b.o)}</b>H<b class=${uc}>${trN(b.h)}</b>L<b class=${uc}>${trN(b.l)}</b>C<b class=${uc}>${trN(b.c)}</b><b class=${chg >= 0 ? 'up' : 'down'}>${chg >= 0 ? '+' : ''}${trN(b.c - (i ? B[i - 1].c : b.o))} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</b></span></div><div class=trlv>${vals.join('')}${vals.length > 4 ? `<span class=trmore>+${vals.length - 4} more</span>` : ''}</div>${trChart?.getTool() ? `<div class=trhint>${/hline|vline/.test(trChart.getTool()) ? 'Click the chart to place it' : 'Click (or press and drag) the first point, then the second. Esc cancels.'}</div>` : ''}`; trLtUi(); }
function trClick(p) {
  if (TR.rpPick && p?.time != null) { rpBegin(p.time); return; }
  if (!p || !p.point || !trS.main) return; const price = trS.main.coordinateToPrice(p.point.y); if (price == null) return;
  if (trChart.getTool()) return;
  if (TR.kind != 'market') { const f = $('#trpxin'); if (f) { f.value = +price.toPrecision(7); trEst(); } } // limit / stop: click the chart to set the price
}

/* ---------- order ticket, account, the Opposite Bot ---------- */
const trCrypto = () => /-USD$/.test(TR.sym), trFut = () => /=F$/.test(TR.sym);
const trTickSz = () => trFut() ? (trData?.spec?.tick || .25) : trCrypto() ? .01 : .01;
function trTicket() { // the order window: TradingView-style (floating on desktop, a sheet on phones)
  const el = $('#trtk'); if (!el) return; const qk = 'mt:qty:' + (trCrypto() ? 'c' : trFut() ? 'f' : 's'), q = LS.get(qk, trCrypto() ? .01 : 1), unit = trCrypto() ? 'coins' : trFut() ? 'contracts' : 'shares', px = trData ? trData.B[trData.B.length - 1].c : null, buy = TR.side == 'buy';
  const sw = (id, on) => `<button class="trsw sm2 ${on ? 'on' : ''}" id=${id} role=switch aria-checked=${on}><i></i></button>`, tpOn = LS.get('mt:tpon', false), slOn = LS.get('mt:slon', false);
  el.innerHTML = `<div class=twh id=twh><b>${esc(TR.sym)}</b><span class=twn>${esc(trData?.name || '')}</span><button class=twx id=twx aria-label="Close">${ic('x', 15)}</button></div>
   <div class=twrow2><span class=twl>Account</span><select class=twacct id=twacct>${trAcctOpts()}</select></div>
   <div class=twsides><button class="tws sell ${buy ? '' : 'on'}" data-v=sell><span>Sell</span><b class=num id=twsp>${trN(px)}</b></button><i class=twspr title="Paper fills include a small simulated slippage">${trN(trTickSz(), trTickSz() < 1 ? 2 : 0)}</i><button class="tws buy ${buy ? 'on' : ''}" data-v=buy><span>Buy</span><b class=num id=twbp>${trN(px)}</b></button></div>
   <div class=twkinds id=trkind>${[['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop']].map(([k, l]) => `<button data-v=${k} class="${TR.kind == k ? 'on' : ''}">${l}</button>`).join('')}<i style="--k:${['market', 'limit', 'stop'].indexOf(TR.kind)}"></i></div>
   <div class=twrow ${TR.kind == 'market' ? 'hidden' : ''}><span class=twl>${TR.kind == 'limit' ? 'Limit' : 'Stop'} price <i>or click the chart</i></span><div class=twin><input id=trpxin type=number step=any inputmode=decimal></div></div>
   <div class=twrow><span class=twl>Quantity</span><div class=twin><input id=trqty type=number min=0 step=${trCrypto() ? 'any' : 1} inputmode=decimal value=${q}><span>${unit}</span></div><div class=twq>${(trCrypto() ? [.001, .01, .1, 1] : trFut() ? [1, 2, 5, 10] : [1, 10, 50, 100]).map(x => `<button data-q=${x}>${x}</button>`).join('')}</div></div>
   <div class=twrow><span class=twl>Tick value</span><b class=num>${trN(trTickSz() * (trData?.spec?.mult || 1), 2)} USD</b></div>
   <div class=twsec>Exits</div>
   <div class=twex><span class=twl>Take profit price</span>${sw('twtpon', tpOn)}</div><div class="twin ${tpOn ? '' : 'off'}"><input id=trtp type=number step=any inputmode=decimal ${tpOn ? '' : 'disabled'}><span id=twtpt></span></div>
   <div class=twex><span class=twl>Stop loss price</span>${sw('twslon', slOn)}</div><div class="twin ${slOn ? '' : 'off'}"><input id=trsl type=number step=any inputmode=decimal ${slOn ? '' : 'disabled'}><span id=twslt></span></div>
   <div class=trest id=trest></div>
   <button class="twgo ${TR.side}" id=trgo><b>${buy ? 'Buy' : 'Sell'}</b><span id=twgol></span></button><div class=twfoot>Paper money. Nothing real is traded.</div>`;
  const tick = trTickSz(), last = () => trData ? trData.B[trData.B.length - 1].c : 0, d = () => buy ? 1 : -1, round = v => +(Math.round(v / tick) * tick).toFixed(tick < 1 ? 4 : 2);
  const setEx = (id, on) => { const inp = $('#' + (id == 'twtpon' ? 'trtp' : 'trsl')); inp.disabled = !on; inp.parentElement.classList.toggle('off', !on); if (on && !inp.value) { const base = TR.kind == 'market' ? last() : +$('#trpxin')?.value || last(); inp.value = round(id == 'twtpon' ? base * (1 + d() * .01) : base * (1 - d() * .005)); } if (!on) inp.value = ''; trEst(); };
  $$('#trtk .tws').forEach(b => b.onclick = () => { TR.side = b.dataset.v; trTicket(); }); $$('#trkind button').forEach(b => b.onclick = () => { TR.kind = b.dataset.v; trTicket(); trTicketPrice(); });
  $$('.twq button').forEach(b => b.onclick = () => { $('#trqty').value = b.dataset.q; trEst(); }); ['#trqty', '#trpxin', '#trsl', '#trtp'].forEach(s2 => $(s2) && ($(s2).oninput = trEst));
  for (const id of ['twtpon', 'twslon']) $('#' + id).onclick = e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); LS.set(id == 'twtpon' ? 'mt:tpon' : 'mt:slon', on); setEx(id, on); };
  if (tpOn) setEx('twtpon', true); if (slOn) setEx('twslon', true);
  $('#twx').onclick = () => trOrderWin(false);
  $('#twacct').onchange = e => { if (e.target.value == '__add') { location.hash = '#/brokers'; return; } LS.set('mt:route', e.target.value); trTicket(); };
  $('#trgo').onclick = async () => { const go = $('#trgo'), qty = +$('#trqty').value; LS.set(qk, qty); if (TR.rp) { rpOrder({ side: TR.side, kind: TR.kind, qty, px: +($('#trpxin')?.value || 0), sl: +$('#trsl').value || null, tp: +$('#trtp').value || null }); trOrderWin(false); return; }
    const rt = trRoute(); if (rt) { trBrokerOrder(rt, qty); return; } go.disabled = true;
    try { const r = await mtapi('order', { sym: TR.sym, side: TR.side, kind: TR.kind, qty, px: +($('#trpxin')?.value || 0), sl: +$('#trsl').value || null, tp: +$('#trtp').value || null }); toast(r.filled ? `${TR.side == 'buy' ? 'Bought' : 'Sold'} ${qty} ${esc(TR.sym)} at ${trN(r.filled)}` : `${TR.kind} order placed`); trSheet(null); trStateLoad(); }
    catch (e) { toast(esc(e.message)); } finally { go.disabled = false; } };
  trTicketPrice(); }
function trOrderWin(side) { // open (with a side) or close the floating order window
  const el = $('#trtk'); if (!el) return; if (side === false) { if (trPhone()) trSheet(null); el.classList.remove('open'); return; }
  if (side) TR.side = side; trTicket(); if (trPhone()) { trSheet('tk'); return; }
  el.classList.add('open'); const pos = LS.get('mt:twpos', null), W = el.offsetWidth, H = el.offsetHeight; let x = pos?.x ?? (innerWidth - W) / 2, y = pos?.y ?? Math.max(60, (innerHeight - H) / 2);
  x = Math.max(8, Math.min(innerWidth - W - 8, x)); y = Math.max(8, Math.min(innerHeight - 60, y)); el.style.left = x + 'px'; el.style.top = y + 'px';
  const h = $('#twh'); h.onpointerdown = e => { if (e.target.closest('button')) return; h.setPointerCapture(e.pointerId); const ox = e.clientX - el.offsetLeft, oy = e.clientY - el.offsetTop; // the window follows the pointer from where you grabbed it
    h.onpointermove = ev => { el.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - ox)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy)) + 'px'; };
    h.onpointerup = () => { h.onpointermove = null; LS.set('mt:twpos', { x: el.offsetLeft, y: el.offsetTop }); }; }; }
function trTicketPrice() { const f = $('#trpxin'); if (f && !f.value && trData) f.value = +trData.B[trData.B.length - 1].c.toPrecision(7); trEst(); }
function trEst() { const el = $('#trest'); if (!el || !trData) return; { const lp = trData.B[trData.B.length - 1].c, t = trN(lp); if ($('#twsp')) { $('#twsp').textContent = t; $('#twbp').textContent = t; } const q2 = +$('#trqty')?.value || 0, gl = $('#twgol'); if (gl) gl.textContent = `${q2} ${TR.sym.replace('-USD', '').replace('=F', '')} ${TR.kind.toUpperCase()}${TR.kind != 'market' && $('#trpxin')?.value ? ' @ ' + trN(+$('#trpxin').value) : ''}`;
    for (const [inp, out] of [['#trtp', '#twtpt'], ['#trsl', '#twslt']]) { const v = +$(inp)?.value, o2 = $(out); if (o2) o2.textContent = v ? Math.round(Math.abs(v - (TR.kind == 'market' ? lp : +$('#trpxin')?.value || lp)) / trTickSz()) + ' ticks' : ''; } } const qty = +$('#trqty')?.value || 0, px = TR.kind == 'market' ? trData.B[trData.B.length - 1].c : +$('#trpxin')?.value || 0, m = trData.spec?.mult || 1, sl = +$('#trsl')?.value, tp = +$('#trtp')?.value, d = TR.side == 'buy' ? 1 : -1;
  el.innerHTML = `<div class="row sb"><span class=mut>${trFut() ? 'Contract value' : 'Cost'}</span><b class=num>${trM(qty * px * m)}</b></div>${sl ? `<div class="row sb"><span class=mut>Risk to stop</span><b class="num down">${trM(Math.abs(px - sl) * qty * m)}</b></div>` : ''}${tp ? `<div class="row sb"><span class=mut>Reward to target</span><b class="num up">${trM(Math.abs(tp - px) * qty * m)}</b></div>` : ''}${sl && tp ? `<div class="row sb"><span class=mut>Reward : risk</span><b class=num>${(Math.abs(tp - px) / Math.abs(px - sl)).toFixed(2)}</b></div>` : ''}`; }
async function trStateLoad() { try { trState = await mtapi('state'); } catch (e) { return; } if (!$('#tracct')) return; trAcct(); trTable(); trOrderLines(); }
function trAcct() { const st = trSt(); if (!st) return; const me = st.me, op = st.opp, pm = me.equity - me.start, po = op.equity - op.start;
  $('#tracct').innerHTML = `<div class="row sb"><h2>Your account</h2><button class="btn sm" id=trrst>Balance</button></div><div class="num trbig">${trM(me.equity)}</div><div class="num ${pm >= 0 ? 'up' : 'down'}" style="font-weight:500">${pm >= 0 ? '+' : ''}${trM(pm)} (${(pm / me.start * 100).toFixed(2)}%)</div>
   <div class=trkv><div><span>Cash</span><b class=num>${trM(me.cash)}</b></div><div><span>Open P&L</span><b class="num ${me.upnl >= 0 ? 'up' : 'down'}">${trM(me.upnl)}</b></div><div><span>Closed trades</span><b class=num>${me.closed}</b></div><div><span>Won</span><b class=num>${me.closed ? Math.round(me.won / me.closed * 100) + '%' : '-'}</b></div></div>`;
  $('#tropp').innerHTML = `<div class="row sb"><div><h2>Opposite Bot</h2><div class=mut style="font-size:12.5px">Takes the reverse of every trade you make.</div></div><button class="trsw ${op.enabled ? 'on' : ''}" id=trop role=switch aria-checked=${op.enabled} aria-label="Opposite Bot on or off"><i></i></button></div>
   <div class="num trbig" style="margin-top:12px">${trM(op.equity)}</div><div class="num ${po >= 0 ? 'up' : 'down'}" style="font-weight:500">${po >= 0 ? '+' : ''}${trM(po)} (${(po / op.start * 100).toFixed(2)}%)</div>
   <div class=trvs><div><span>You</span><i style="--w:${Math.max(4, 50 + Math.max(-48, Math.min(48, (pm - po) / (Math.abs(pm) + Math.abs(po) || 1) * 48)))}%"></i><span>Opposite</span></div><b>${pm === po ? 'Even' : pm > po ? 'You are ahead' : 'The Opposite Bot is ahead'} by ${trM(Math.abs(pm - po))}</b></div>
   <div class=mut style="font-size:12px;margin-top:10px">${op.enabled ? 'On: you buy, it sells the same amount; you sell, it buys. It closes everything when you press End trading day.' : 'Off. Switch it on and it mirrors your next trades.'}</div>`;
  const sm = $('#trsum'); if (sm) sm.innerHTML = `<span>Equity <b class=num>${trM(me.equity)}</b></span><span>Open P&L <b class="num ${me.upnl >= 0 ? 'up' : 'down'}">${trM(me.upnl)}</b></span><span>Total <b class="num ${pm >= 0 ? 'up' : 'down'}">${pm >= 0 ? '+' : ''}${trM(pm)}</b></span><span>Opposite Bot <b class="num ${po >= 0 ? 'up' : 'down'}">${op.enabled ? (po >= 0 ? '+' : '') + trM(po) : 'off'}</b></span>`;
  trOppUi(TR.rp ? RP?.opp : op.enabled);
  $('#trop').onclick = async () => { try { await mtapi('opp', { on: !op.enabled }); trStateLoad(); toast(op.enabled ? 'Opposite Bot off' : 'Opposite Bot on: it will take the other side of your trades'); } catch (e) { toast(esc(e.message)); } };
  $('#trrst').onclick = trBalMgr; }
function trTable() { const el = $('#trtbl'), S = trSt(); if (!el || !S) return; const tab = $('#trtab .on')?.dataset.v || 'pos';
  const sym = s => `<button class=trlink data-s="${esc(s)}">${esc(s)}</button>`;
  if (tab == 'pos') { const rows = [...S.me.positions.map(p => ({ ...p, a: 'You' })), ...S.opp.positions.map(p => ({ ...p, a: 'Opposite Bot' }))];
    el.innerHTML = rows.length ? `<div style="overflow-x:auto"><table class=tbl><thead><tr><th>Symbol</th><th>Account</th><th class=r>Qty</th><th class=r>Avg price</th><th class=r>Last</th><th class=r>P&L</th><th></th></tr></thead><tbody>${rows.map(p => `<tr><td>${sym(p.sym)}</td><td class=mut>${p.a}</td><td class="r num ${p.qty > 0 ? 'up' : 'down'}">${p.qty > 0 ? '+' : ''}${trN(p.qty, Number.isInteger(p.qty) ? 0 : undefined)}</td><td class="r num">${trN(p.avg)}</td><td class="r num">${trN(p.px)}</td><td class="r num ${p.upnl >= 0 ? 'up' : 'down'}">${trM(p.upnl)}</td><td class=r>${p.a == 'You' ? `<button class="btn sm" data-close="${esc(p.sym)}">Close</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class=empty style="padding:24px 0">No open positions.</div>'; }
  if (tab == 'ord') el.innerHTML = S.orders.length ? `<div style="overflow-x:auto"><table class=tbl><thead><tr><th>Symbol</th><th>Order</th><th class=r>Qty</th><th class=r>Price</th><th>Placed</th><th></th></tr></thead><tbody>${S.orders.map(o => `<tr><td>${sym(o.sym)}</td><td><span class="pill ${o.side == 'buy' ? 'up' : 'down'}">${o.side}</span> ${o.grp ? (o.kind == 'stop' ? 'stop-loss' : 'take-profit') : o.kind}</td><td class="r num">${trN(o.qty, Number.isInteger(o.qty) ? 0 : undefined)}</td><td class="r num">${trN(o.px)}</td><td class=mut>${new Date(o.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td class=r><button class="btn sm" data-cancel="${o.id}">Cancel</button></td></tr>`).join('')}</tbody></table></div>` : '<div class=empty style="padding:24px 0">No open orders.</div>';
  if (tab == 'fills') el.innerHTML = S.fills.length ? `<div style="overflow-x:auto"><table class=tbl><thead><tr><th>Time</th><th>Account</th><th>Trade</th><th class=r>Price</th><th class=r>Realized</th></tr></thead><tbody>${S.fills.map(f => `<tr><td class=mut style="white-space:nowrap">${new Date(f.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td class=mut>${f.acct == 'me' ? 'You' : 'Opposite Bot'}</td><td><span class="pill ${f.side == 'buy' ? 'up' : 'down'}">${f.side}</span> ${trN(f.qty, Number.isInteger(f.qty) ? 0 : undefined)} ${sym(f.sym)}<div class=mut style="font-size:12px">${esc(f.why || '')}</div></td><td class="r num">${trN(f.px)}</td><td class="r num ${f.pnl - f.fee >= 0 ? 'up' : 'down'}">${f.pnl ? trM(f.pnl - f.fee) : f.fee ? trM(-f.fee) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class=empty style="padding:24px 0">No trades yet.</div>';
  el.querySelectorAll('[data-close]').forEach(b => b.onclick = async () => { if (TR.rp && RP) { rpClose(); return; } b.disabled = true; try { await mtapi('close', { sym: b.dataset.close }); toast('Position closed'); trStateLoad(); } catch (e) { toast(esc(e.message)); b.disabled = false; } });
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
    let at = 0; trWS.onmessage = e => { const m = JSON.parse(e.data); if (m.type != 'ticker' || m.product_id != TR.sym || !trS.main || TR.rp) return; const px = +m.price; if (!trUpd(px, +m.last_size || 0)) return; const n = Date.now(); if (n - at > (trData.sec ? 120 : 250)) { at = n; trRender(px); } }; // every trade counts for the bar; at most ~8 redraws a second
    trWS.onclose = () => { trWS = null; if ($('#trc') && TR.sym == sym) setTimeout(() => TR.sym == sym && trTick(), 3000); }; } catch (e) {} }
  trQT = setInterval(async () => { if (!$('#trc')) return trTickStop(); if (trWS && trWS.readyState === 1) return; if (document.hidden) return;
    if (TR.rp) return; try { const r = await mtapi('quote', null, '&sym=' + encodeURIComponent(sym)); if (r.sym === trData?.sym && !TR.rp) trLive(r.px, 0); } catch (e) {} }, 1000);
}
function trUpd(px, vol = 0) { // add one price to the data (a new bar when the time has moved on)
  if (!trData || !(px > 0)) return false; const B = trData.B, last = B[B.length - 1]; if (!last) return false; const sec = TFSEC[TR.tf], now = Math.floor(Date.now() / 1000) + TZ();
  if (sec && now >= last.t + sec) { const t = last.t + Math.floor((now - last.t) / sec) * sec; B.push({ t, o: last.c, h: Math.max(last.c, px), l: Math.min(last.c, px), c: px, v: vol }); if (trData.sec && B.length > 1500) B.shift(); }
  else { last.c = px; last.h = Math.max(last.h, px); last.l = Math.min(last.l, px); last.v = (last.v || 0) + vol; } return true; }
function trLive(px, vol) { if (trS.main && trUpd(px, vol)) trRender(px); }
function trRender(px) {
  if (!trData || !trS.main) return; const B = trData.B; trPosSync();
  const b = trBars()[B.length - 1], line = /smooth|line|base/.test(TR.type); try { trS.main.update(line ? { time: b.t, value: b.c } : { time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }); } catch (e) {}
  if (px !== trLastPx) { const el = $('#trpx'), dir = trLastPx == null ? 0 : px > trLastPx ? 1 : -1; trLastPx = px; const t = trN(px); if (el) { el.textContent = t; el.classList.remove('tkup', 'tkdn'); void el.offsetWidth; if (dir) el.classList.add(dir > 0 ? 'tkup' : 'tkdn'); }
    if ($('#trmpx')) $('#trmpx').textContent = t; if ($('#trqsp')) { $('#trqsp').textContent = t; $('#trqbp').textContent = t; }
    const ch = trData.prev ? (px / trData.prev - 1) * 100 : null; if (ch != null) { const h = `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${trN(px - trData.prev)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</span>`; $('#trchg').innerHTML = h; if ($('#trmchg')) $('#trmchg').innerHTML = h; } }
  if (Date.now() - trPaintAt > 5000) { trPaintAt = Date.now(); trPaint(false); } else trLegend(); // indicators follow every 5 s
  if (TR.kind == 'market') trEst();
}

/* ---------- Claude connection: report what the page shows, send a snapshot when Claude asks, apply Claude's chart commands ---------- */
function trShot() { try { const c = trChart.takeScreenshot(), W = Math.min(c.width, 1000), k = W / c.width, H = Math.round(c.height * k) + 40, t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d');
    g.fillStyle = trDark() ? '#111113' : '#ffffff'; g.fillRect(0, 0, W, H); g.fillStyle = trDark() ? '#f2f2f3' : '#121214'; g.font = '600 18px sans-serif';
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
    if (c.k == 'hline' && c.p > 0) { const d = LS.get(dk(c.sym), []); d.push({ id: 'c' + Date.now(), k: 'hline', t1: 0, p1: c.p }); LS.set(dk(c.sym), d); repaint = true; }
    if (c.k == 'trend' && c.t2 > c.t1) { const d = LS.get(dk(c.sym), []); d.push({ id: 'c' + Date.now(), k: 'trend', t1: c.t1 + TZ(), p1: c.p1, t2: c.t2 + TZ(), p2: c.p2 }); LS.set(dk(c.sym), d); repaint = true; }
    if (c.k == 'clear') { LS.set(dk(c.sym), []); repaint = true; } }
  trUiSync(); if (sym) { trSet(sym); toast('Claude changed your chart'); return; } if (reload) { trLoad(true); toast('Claude changed your chart'); } else if (repaint) { trPaint(true); toast('Claude changed your chart'); } }

/* ---------- terminal extras (desktop): side panel tabs, range buttons, watchlist, clock, extra chart panes ---------- */
function trSideSet(k) { LS.set('mt:side', k); const sd = $('.trside'); if (sd) sd.dataset.p = k; $$('#trptabs button').forEach(b => b.classList.toggle('on', b.dataset.v == k)); if (k == 'wl') trWLLoad(); }
function trRngUi(k) { $$('.trrange button[data-r]').forEach(b => b.classList.toggle('on', b.dataset.r == k)); }
function trLtUi() { const t = trChart?.getTool() || null; $$('.trlt button').forEach(b => b.classList.toggle('on', b.dataset.p == 'cur' ? !t : b.dataset.p == t)); $('#trh')?.classList.toggle('on', t == 'hline'); $('#trt')?.classList.toggle('on', t == 'trend'); }
function trTool(k) { trSheet(null); if (!trChart) return; trChart.setTool(trChart.getTool() == k ? null : k); trLtUi(); trLegend(); }
const trDrawGet = sym => LS.get('mt:draw:' + sym, []).map((d, i) => d.k == 'h' ? { id: 'h' + i, k: 'hline', t1: 0, p1: d.p } : d.k == 't' ? { id: 't' + i, k: 'trend', t1: d.t1, p1: d.p1, t2: d.t2, p2: d.p2 } : d);
const trWL = () => LS.get('mt:wl', WATCH);
let trWLQ = {};
function trWLUi() { const el = $('#trwl'); if (!el) return; const L = trWL();
  el.innerHTML = `<div class=trwlh><span>Symbol</span><span class=r>Last</span><span class=r>Chg%</span></div><div class=trwlb>${L.map(s => { const q = trWLQ[s] || {}, ch = q.px && q.prev ? (q.px / q.prev - 1) * 100 : null; return `<div class="trwlr ${s == TR.sym || s == trData?.sym ? 'on' : ''}" data-s="${esc(s)}"><b>${esc(s.replace('-USD', '').replace('=F', ''))}<i>${/-USD$/.test(s) ? 'crypto' : /=F$/.test(s) ? 'futures' : ''}</i></b><span class="r num">${trN(q.px)}</span><span class="r num ${ch == null ? '' : ch >= 0 ? 'up' : 'down'}">${ch == null ? '-' : (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'}</span><button class=trwlx data-x="${esc(s)}" aria-label="Remove ${esc(s)}">${ic('x', 11)}</button></div>`; }).join('')}</div><form class=trwla id=trwla><input class=inp id=trwli placeholder="Add symbol (e.g. AMD, ETH, NQ)" autocomplete=off spellcheck=false></form>`;
  el.querySelectorAll('.trwlr').forEach(r => r.onclick = e => { if (!e.target.closest('.trwlx')) trSet(r.dataset.s); });
  el.querySelectorAll('.trwlx').forEach(b => b.onclick = () => { LS.set('mt:wl', trWL().filter(x => x != b.dataset.x)); trWLUi(); });
  $('#trwla').onsubmit = e => { e.preventDefault(); let v = $('#trwli').value.trim().toUpperCase(); if (!v) return; if (/^(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|LTC|LINK)$/.test(v)) v += '-USD'; if (/^(NQ|ES|YM|RTY|GC|SI|CL|NG)$/.test(v)) v += '=F'; if (!trWL().includes(v)) LS.set('mt:wl', [...trWL(), v]); trWLUi(); trWLLoad(); setTimeout(() => $('#trwli')?.focus(), 0); }; }
async function trWLLoad() { if (!$('#trwl') || trPhone() || document.hidden) return; try { const r = await mtapi('quotes', null, '&syms=' + encodeURIComponent([...new Set([...trWL(), ...trTabs().map(t => t.sym)])].join(','))); for (const q of r.quotes) trWLQ[q.sym] = q; trTabsUi(); } catch (e) {} if (!$('#trwli') || document.activeElement !== $('#trwli')) trWLUi(); }
const trMiniCfg = () => LS.get('mt:mini2', [{ sym: 'AAPL', tf: '1h', type: 'candle', ind: ['bb', 'ema9'] }, { sym: 'NFLX', tf: '1d', type: 'candle', ind: ['ribbon'] }, { sym: 'BTC-USD', tf: '1h', type: 'line', ind: ['ema21', 'sma50'] }]);
function trMiniKill() { for (const m of trMini) { clearInterval(m.t); try { m.chart.remove(); } catch (e) {} } trMini = []; $$('.trmini').forEach(x => x.remove()); }
const trLink = () => LS.get('mt:link', false); // every chart shows the main symbol (each keeps its own timeframe and indicators)
const PBTN = (k, t, d) => `<button data-a=${k} title="${t}" aria-label="${t}"><svg width=15 height=15 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.8 stroke-linecap=round stroke-linejoin=round>${d}</svg></button>`;
const PB_AUTO = `<button data-a=auto class=trauto title="Auto: detect the market type and pick the best indicators">Auto</button>`, PB_IND = PBTN('ind', 'Indicators on this chart', '<path d="M3 17l5-6 4 4 8-9"/>'), PB_TF = (tf) => `<select data-a=tf title="Timeframe of this chart">${TFS.filter(x => !SECT[x[0]]).map(([k, l]) => `<option value=${k} ${k == tf ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
  PB_TYPE = t => `<select data-a=type title="Chart style">${[['candle', 'Candles'], ['line', 'Line']].map(([k, l]) => `<option value=${k} ${k == t ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
  PB_MAX = PBTN('max', 'Maximize this chart (double-click the chart works too)', '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>');
function trMiniSave() { LS.set('mt:mini2', trMini.length ? Object.assign(trMiniCfg(), Object.fromEntries(trMini.map(m => [m.i, { sym: m.sym, tf: m.tf, type: m.type, ind: m.ind }]))) : trMiniCfg()); }
function trFocus(k) { const host = $('#trpanes'); if (!host) return; if (k == null || host.dataset.focus == String(k)) delete host.dataset.focus; else host.dataset.focus = k; $$('.trpbtns [data-a=max]').forEach(b => b.classList.toggle('on', host.dataset.focus != null)); }
function trPanes() { // 1, 2 or 4 charts: the first is the full chart, the others are compact ones with their own timeframe, style and indicators
  trMiniKill(); const host = $('#trpanes'); if (!host || !window.MimicCharts) return; $('#trc').dataset.i = 0; const n = trLayN(); host.dataset.n = n; delete host.dataset.focus; host.classList.toggle('linked', trLink()); const cfg = trMiniCfg();
  let mb = $('#trc .trpbtns'); if (!mb) { mb = document.createElement('div'); mb.className = 'trpbtns'; $('#trc').append(mb); } mb.innerHTML = PB_AUTO + PB_IND + PB_MAX; mb.querySelector('[data-a=max]').onclick = () => trFocus(0); mb.querySelector('[data-a=ind]').onclick = () => { trSheet(null); trPick('', 'All', null); }; mb.querySelector('[data-a=auto]').onclick = () => trAuto(); $('#trc').ondblclick = e => { if (!trChart?.getTool() && !e.target.closest('button,select')) trFocus(0); };
  for (let i = 0; i < n - 1; i++) { const c = cfg[i] || { sym: 'SPY', tf: '1h', type: 'candle', ind: [] }, el = document.createElement('div'); el.className = 'trmini'; el.dataset.i = i + 1; host.append(el);
    const m = { i, sym: c.sym, tf: c.tf, type: c.type || 'candle', ind: c.ind || [], el, chart: MimicCharts.createChart(el, trOpts()), B: null, is: [] };
    el.insertAdjacentHTML('beforeend', `<div class=trmleg></div><div class=trpbtns>${PB_TF(m.tf)}${PB_TYPE(m.type)}${PB_AUTO}${PB_IND}${PB_MAX}</div>`);
    m.s = m.type == 'line' ? m.chart.addLineSeries({ color: '#2962ff', lineWidth: 2, priceLineStyle: 2 }) : m.chart.addCandlestickSeries({ priceLineStyle: 2 });
    m.v = m.chart.addHistogramSeries({ priceScaleId: 'v', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }); m.v.priceScale().applyOptions({ scaleMargins: { top: .84, bottom: 0 } });
    m.chart.subscribeCrosshairMove(p => trMiniLeg(m, p)); m.el.querySelector('.trmleg').onclick = () => trMiniSwap(m);
    el.ondblclick = e => { if (!e.target.closest('button,select')) trFocus(i + 1); };
    el.querySelector('[data-a=max]').onclick = () => trFocus(i + 1); el.querySelector('[data-a=ind]').onclick = () => { trSheet(null); trPick('', 'All', i); }; el.querySelector('[data-a=auto]').onclick = () => trAuto(m);
    el.querySelector('[data-a=tf]').onchange = e => { m.tf = e.target.value; m.B = null; trMiniSave(); trMiniLoad(m); };
    el.querySelector('[data-a=type]').onchange = e => { m.type = e.target.value; trMiniSave(); trPanes(); };
    trMini.push(m); trMiniLoad(m); m.t = setInterval(() => $('#trc') ? trMiniLoad(m) : clearInterval(m.t), 15e3); } }
const trMiniSym = m => trLink() ? TR.sym : m.sym;
async function trMiniLoad(m) { const sym = trMiniSym(m), tf = m.tf; try { const d = await mtapi('candles', null, `&sym=${encodeURIComponent(sym)}&tf=${tf}&ext=${TR.ext ? 1 : 0}`); if (!trMini.includes(m) || sym !== trMiniSym(m) || tf !== m.tf) return; m.d = d; const first = !m.B; if (m.lk !== sym + tf) { m.lk = sym + tf; m.chart.priceScale('right').applyOptions({ autoScale: true }); } m.B = d.bars.map(x => ({ t: x[0] + TZ(), o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })); trMiniPaint(m); if (first) { const n = m.B.length, vis = Math.min(n, Math.round(m.el.clientWidth / 7)); m.chart.timeScale().setVisibleLogicalRange({ from: n - vis, to: n + 3 }); } } catch (e) { m.el.querySelector('.trmleg').textContent = sym + ': ' + e.message; } }
function trMiniPaint(m) { if (!m.B) return; const { up, dn, edge } = trCol(), pal = indPalette(), C = m.B.map(b => b.c), T = m.B.map(b => b.t);
  if (m.type == 'line') m.s.setData(m.B.map(b => ({ time: b.t, value: b.c }))); else { m.s.applyOptions({ upColor: up, downColor: dn, borderUpColor: edge || up, borderDownColor: edge || dn, wickUpColor: edge || up, wickDownColor: edge || dn }); m.s.setData(m.B.map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }))); }
  m.v.setData(m.B.map(b => ({ time: b.t, value: b.v || 0, color: (b.c >= b.o ? up : dn) + '55' })));
  for (const x of m.is) try { m.chart.removeSeries(x); } catch (e) {} m.is = [];
  const act = m.ind.filter(k => IND[k] && !IND[k].bot && k != 'vp' && k != 'vol'), panes = act.filter(k => IND[k].pane), PH = panes.length > 1 ? .16 : .2, bottom = panes.length * PH;
  m.s.priceScale().applyOptions({ scaleMargins: { top: .1, bottom: Math.min(.7, bottom + .14) } }); m.v.priceScale().applyOptions({ scaleMargins: { top: 1 - bottom - .13, bottom: bottom + .005 } });
  for (const k of act) { const D = IND[k], P = {}, pi = panes.indexOf(k); for (const [n, , d] of D.p) P[n] = d;
    for (const o of D.run(m.B, C, P, { tf: m.tf })) { const scale = pi >= 0 ? 'p_' + k : 'right', sr = o.hist ? m.chart.addHistogramSeries({ priceScaleId: scale, priceLineVisible: false, lastValueVisible: false }) : m.chart.addLineSeries({ priceScaleId: scale, color: typeof o.c === 'number' ? pal[o.c] : o.c || pal[8], lineWidth: o.w || 1.5, lineStyle: o.dash || 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      if (pi >= 0) sr.priceScale().applyOptions({ scaleMargins: { top: 1 - PH * (pi + 1) + .03, bottom: PH * pi + .015 } });
      sr.setData(o.hist ? o.v.map((v, i2) => v == null || !isFinite(v) ? { time: T[i2] } : { time: T[i2], value: v, color: (typeof o.cs?.[i2] === 'string' && /up|down/.test(o.cs[i2]) ? (o.cs[i2] == 'up' ? up : dn) : pal[8]) + 'aa' }) : o.v.map((v, i2) => v == null || !isFinite(v) ? { time: T[i2] } : { time: T[i2], value: v })); m.is.push(sr); } }
  trMiniLeg(m); }
function trMiniLeg(m, p) { const el = m.el.querySelector('.trmleg'); if (!m.B || !el) return; let b = m.B[m.B.length - 1]; if (p && p.time != null) b = m.B.find(x => x.t === p.time) || b; const ch = m.d?.prev ? (m.B[m.B.length - 1].c / m.d.prev - 1) * 100 : null, uc = b.c >= b.o ? 'up' : 'down';
  el.innerHTML = `<b>${esc(m.d?.name || trMiniSym(m))}</b> · ${TFS.find(x => x[0] == m.tf)?.[1] || m.tf} · ${esc(m.d?.ex || '')} <span class=trmo>O<b class=${uc}>${trN(b.o)}</b> H<b class=${uc}>${trN(b.h)}</b> L<b class=${uc}>${trN(b.l)}</b> C<b class=${uc}>${trN(b.c)}</b></span> ${ch == null ? '' : `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>`}${m.ind.length ? `<div class=trmind>${m.ind.filter(k => IND[k]).map(k => `<span style="color:${trDot(k)}">${esc(trIndName(k))}</span>`).join('')}</div>` : ''}`; }
function trMiniSwap(m) { if (!trData || trLink()) return; const ms = m.sym, mt = m.tf; m.sym = trData.sym; m.tf = SECT[TR.tf] ? '1m' : TR.tf; m.B = null; trMiniSave();
  trMiniLoad(m); TR.tf = mt; TR.rng = null; LS.set('mt:tf', mt); trUiSync(); trSet(ms); }
function trTermStart() { trBrkLoad(); if (trPhone()) return; trTabsUi(); trWall(); trSideSet(trSideP()); trWLUi(); trWLLoad(); trWLT = setInterval(trWLLoad, 5e3); trPanes(); trLtUi();
  const ck = () => { const el = $('#trclock'); if (!el) return; const d = new Date(); el.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' ' + (Intl.DateTimeFormat().resolvedOptions().timeZone || '').split('/').pop().replace('_', ' '); }; ck(); trClk = setInterval(ck, 1000); }

function trVP() { // volume profile over the visible bars, drawn on a canvas laid over the chart
  const host = $('#trc'); if (!host) return; let cv = host.querySelector('canvas.trvp'); const on = TR.ind.includes('vp') && trData && trS.main && !/smooth|line|base/.test(TR.type);
  if (!on) { cv?.remove(); return; } if (!cv) { cv = document.createElement('canvas'); cv.className = 'trvp'; host.append(cv); }
  const r = trChart.timeScale().getVisibleLogicalRange(), B = trData.B; if (!r) return; const a = Math.max(0, Math.floor(r.from)), z = Math.min(B.length - 1, Math.ceil(r.to)); if (z <= a) return;
  const sw = trChart.priceScale('right').width(), W = host.clientWidth - sw, H = host.clientHeight - 28, dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  let lo = Infinity, hi = -Infinity; for (let i = a; i <= z; i++) { lo = Math.min(lo, B[i].l); hi = Math.max(hi, B[i].h); } if (!(hi > lo)) return;
  const n = trPrm('vp').rows || 28, st = (hi - lo) / n, U = new Array(n).fill(0), D = new Array(n).fill(0);
  for (let i = a; i <= z; i++) { const b = B[i], v = b.v || 1, k0 = Math.max(0, Math.floor((b.l - lo) / st)), k1 = Math.min(n - 1, Math.floor((b.h - lo) / st)), each = v / (k1 - k0 + 1); for (let k = k0; k <= k1; k++) (b.c >= b.o ? U : D)[k] += each; }
  const mx = Math.max(...U.map((u, k) => u + D[k])), poc = U.map((u, k) => u + D[k]).indexOf(mx), g = cv.getContext('2d'); g.scale(dpr, dpr); const maxW = W * .2;
  for (let k = 0; k < n; k++) { const y1 = trS.main.priceToCoordinate(lo + k * st), y2 = trS.main.priceToCoordinate(lo + (k + 1) * st); if (y1 == null || y2 == null) continue; const h = Math.max(1, Math.abs(y1 - y2) - 1), y = Math.min(y1, y2), wu = U[k] / mx * maxW, wd = D[k] / mx * maxW;
    g.fillStyle = k == poc ? 'rgba(41,98,255,.75)' : 'rgba(41,98,255,.38)'; g.fillRect(W - wu - wd, y, wu, h); g.fillStyle = k == poc ? 'rgba(255,152,0,.8)' : 'rgba(255,152,0,.42)'; g.fillRect(W - wd, y, wd, h); }
  const yp = trS.main.priceToCoordinate(lo + (poc + .5) * st); if (yp != null) { g.strokeStyle = 'rgba(255,82,82,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yp); g.lineTo(W, yp); g.stroke(); } }

/* ---------- every bot as an indicator: its own rules drawn on the chart (entries, exits, armed orders, levels) ---------- */
let trBotR = {}, trBotS = [], trBotPL = [], trBotOK = false;
const BOTCOL = ['#ff9800', '#00bcd4', '#e040fb', '#ffeb3b', '#ff5252', '#69f0ae', '#448aff', '#ff6e40'];
async function trBotReg() { if (trBotOK) return; try { const r = await mtapi('botlist'); r.bots.forEach((b, i) => { IND[b.k] = { n: b.name, g: 'Bots', d: (b.d ? b.d + ' ' : '') + (b.syms ? `Works on ${b.syms.join(', ')}.` : 'Works on any symbol.'), p: [], bot: 1, syms: b.syms, col: BOTCOL[i % BOTCOL.length], run: () => [] }; });
  if (!INDGROUPS.includes('Bots')) INDGROUPS.push('Bots'); trBotOK = true; } catch (e) {} }
async function trBots(rebuild) {
  const ks = TR.ind.filter(k => IND[k]?.bot), sym = trData?.sym; if (!trS.main || !sym) return;
  await Promise.all(ks.map(async k => { const id = k + '|' + sym, c = trBotR[id]; if (c && (Date.now() - c.at < 3e4 || c.busy)) return; trBotR[id] = { ...(c || {}), busy: true, at: Date.now() };
    try { trBotR[id] = { r: await mtapi('botsig', null, `&k=${k}&sym=${encodeURIComponent(sym)}`), at: Date.now() }; } catch (e) { trBotR[id] = { r: { status: e.message, marks: [], levels: [], lines: [] }, at: Date.now() }; } }));
  if (!trS.main || trData?.sym !== sym) return; trBotDraw(ks, sym); trLegend(); }
function trBotDraw(ks, sym) {
  for (const x of trBotS) try { trChart.removeSeries(x); } catch (e) {} trBotS = []; for (const pl of trBotPL) try { trS.main.removePriceLine(pl); } catch (e) {} trBotPL = [];
  const B = trData.B, n = B.length, sec = TFSEC[TR.tf] || 86400 * (TR.tf == '1w' ? 7 : TR.tf == '1mo' ? 31 : 1);
  const snap = t => { const ts = Math.floor(t / 1000) + TZ(); if (!n || ts < B[0].t || ts > B[n - 1].t + sec) return null; let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (B[m].t <= ts) lo = m; else hi = m - 1; } return B[lo].t; };
  const mk = [], cc = c => c && /^var\(/.test(c) ? trCss(c.slice(4, -1)) || null : c;
  for (const k of ks) { const r = trBotR[k + '|' + sym]?.r; if (!r) continue; const col = IND[k].col, ab = IND[k].n.replace(/ (Bot|Strategy|Levels|Trader)$/, '');
    for (const m of r.marks || []) { const t = snap(m.t); if (t == null) continue; const up = m.dir === 1 || m.dir === 'long';
      mk.push(m.type == 'entry' ? { time: t, position: up ? 'belowBar' : 'aboveBar', shape: up ? 'arrowUp' : 'arrowDown', color: up ? '#089981' : '#f23645', text: `${ab} ${up ? 'Buy' : 'Sell'}` }
        : m.type == 'exit' ? { time: t, position: up ? 'aboveBar' : 'belowBar', shape: 'circle', color: col, text: 'Exit' } : { time: t, position: up ? 'belowBar' : 'aboveBar', shape: 'square', color: col, size: .6 }); }
    for (const l of r.levels || []) if (l.p > 0) trBotPL.push(trS.main.createPriceLine({ price: l.p, color: cc(l.color) || col, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `${ab}: ${l.name}` }));
    for (const z of r.zones || []) for (const p of [z.y0, z.y1]) if (p > 0) trBotPL.push(trS.main.createPriceLine({ price: p, color: col + '99', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: z.name }));
    for (const L of r.lines || []) { const pts = new Map(); for (const [t0, v, d] of L.pts) { const t = snap(t0); if (t != null && v != null && isFinite(v)) pts.set(t, { time: t, value: v, ...(L.color2 ? { color: d > 0 ? '#089981' : '#f23645' } : {}) }); }
      if (pts.size < 2) continue; const sr = trChart.addLineSeries({ color: cc(L.color) || col, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); sr.setData([...pts.values()].sort((a, b) => a.time - b.time)); trBotS.push(sr); } }
  const seen = new Set(); trS.main.setMarkers(mk.sort((a, b) => a.time - b.time).filter(m => { const key = m.time + m.text; if (seen.has(key)) return false; seen.add(key); return true; })); }

/* ---------- symbol tabs (desktop terminal): each tab keeps its own symbol and timeframe ---------- */
const trTabs = () => { const t = LS.get('mt:tabs', null); return Array.isArray(t) && t.length ? t : [{ sym: TR.sym, tf: TR.tf }]; }, trTabI = () => Math.min(LS.get('mt:tabi', 0), trTabs().length - 1);
function trTabSet(patch) { if (trPhone()) return; const t = trTabs(), i = trTabI(); t[i] = { ...t[i], ...patch }; LS.set('mt:tabs', t); trTabsUi(); }
function trTabGo(i) { const t = trTabs(); if (!t[i]) return; LS.set('mt:tabi', i); TR.tf = t[i].tf || TR.tf; TR.rng = null; LS.set('mt:tf', TR.tf); trUiSync(); trSet(t[i].sym); trTabsUi(); }
function trTabsUi() { const el = $('#trtabbar'); if (!el) return; const t = trTabs(), a = trTabI(), q = trWLQ;
  el.innerHTML = t.map((x, i) => { const w = q[x.sym], ch = w?.px && w?.prev ? (w.px / w.prev - 1) * 100 : null; return `<div class="trtab ${i == a ? 'on' : ''}" data-i=${i}><b>${esc(x.sym.replace('-USD', '').replace('=F', ''))}</b><span>${TFS.find(f => f[0] == x.tf)?.[1] || x.tf}</span>${ch == null ? '' : `<i class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</i>`}${t.length > 1 ? `<button class=trtabx data-x=${i} aria-label="Close tab">${ic('x', 11)}</button>` : ''}</div>`; }).join('') + `<button class=trtabadd id=trtabadd title="New tab" aria-label="New tab">+</button>`;
  el.querySelectorAll('.trtab').forEach(b => b.onclick = e => { if (e.target.closest('.trtabx')) return; const i = +b.dataset.i; if (i != trTabI()) trTabGo(i); });
  el.querySelectorAll('.trtabx').forEach(b => b.onclick = () => { const t2 = trTabs(), i = +b.dataset.x, a2 = trTabI(); t2.splice(i, 1); LS.set('mt:tabs', t2); if (i == a2) trTabGo(Math.max(0, i - 1)); else { LS.set('mt:tabi', a2 > i ? a2 - 1 : a2); trTabsUi(); } });
  $('#trtabadd').onclick = () => { const t2 = trTabs(); t2.push({ sym: TR.sym, tf: TR.tf }); LS.set('mt:tabs', t2); LS.set('mt:tabi', t2.length - 1); trTabsUi(); const q2 = $('#trq'); q2.focus(); q2.select(); toast('New tab: type a symbol'); }; }

/* terminal wallpaper: a picture or video behind the charts (kept on this device), separate from the app wallpaper */
let trWallURL = null;
async function trWall() { const c = LS.get('mt:wall', false); let el = document.getElementById('twall');
  if (!c || trPhone()) { el?.remove(); document.body.classList.remove('twall'); if (trWallURL) { URL.revokeObjectURL(trWallURL); trWallURL = null; } return; }
  let blob = null; try { blob = await idbGet('twall'); } catch (e) {} if (!blob) { LS.set('mt:wall', false); return; }
  if (!el) { el = document.createElement('div'); el.id = 'twall'; el.setAttribute('aria-hidden', 'true'); document.body.prepend(el); } if (trWallURL) URL.revokeObjectURL(trWallURL); trWallURL = URL.createObjectURL(blob);
  el.innerHTML = /^video/.test(c.mime) ? `<video src="${trWallURL}" autoplay loop muted playsinline></video>` : `<img alt="" src="${trWallURL}">`; el.querySelector('video')?.play().catch(() => {}); document.body.classList.add('twall'); }

/* ---------- Auto indicators: read what kind of market this is, then pick the indicators that suit it ---------- */
function trRegime(B, tf) {
  const n = B.length; if (n < 60) return null; const C = B.map(b => b.c), last = n - 1, L = 20;
  let path = 0; for (let i = n - L; i < n; i++) path += Math.abs(C[i] - C[i - 1]); const er = path ? Math.abs(C[last] - C[n - L - 1]) / path : 0; // efficiency: 1 = straight line, 0 = pure chop
  const atr = IM.rma(IM.tr(B), 14), atrp = atr.map((a, i) => a == null ? null : a / C[i]).filter(x => x != null), nowA = atrp[atrp.length - 1], rankA = atrp.slice(-200).filter(x => x <= nowA).length / Math.min(200, atrp.length);
  const m = IM.sma(C, 20), sd = IM.sd(C, 20), bw = C.map((_, i) => m[i] == null ? null : 4 * sd[i] / m[i]).filter(x => x != null), nowW = bw[bw.length - 1], rankW = bw.slice(-200).filter(x => x <= nowW).length / Math.min(200, bw.length);
  const adxO = IND.adx ? IND.adx.run(B, C, trPrmD('adx'), { tf }) : [], adx = adxO[0]?.v?.[last] ?? null, slope = m[last] != null && m[last - 5] != null ? (m[last] - m[last - 5]) / m[last - 5] : 0, intraday = /m$|h$|s$/.test(tf);
  const has = k => IND[k] ? k : null, pick = a => a.map(has).filter(Boolean);
  if ((adx != null && adx >= 25) || er >= .4) return { k: 'trend', name: `${slope >= 0 ? 'Up' : 'Down'}-trending`, why: `Strong direction (ADX ${adx == null ? '-' : adx.toFixed(0)}, efficiency ${(er * 100).toFixed(0)}%). Trend tools work best: Supertrend to trail, two EMAs for pullbacks, ADX to confirm the trend is still strong.`, ind: pick(['st', 'ema21', 'sma50', 'adx', 'vol']) };
  if (rankW <= .2) return { k: 'squeeze', name: 'Squeeze (quiet before a move)', why: `Bollinger width is in its lowest ${Math.max(1, Math.round(rankW * 100))}% of the last 200 bars. Volatility contracts before breakouts: Bollinger inside Keltner shows the squeeze, band width shows when it releases.`, ind: pick(['bb', 'kc', 'bbw', 'vol']) };
  if (rankA >= .85) return { k: 'volatile', name: 'Volatile', why: `Bar ranges are in the top ${Math.round((1 - rankA) * 100) || 1}% of the last 200 bars. Wide channels and ATR keep stops outside the noise; ${intraday ? 'VWAP' : 'the 20 average'} anchors fair value.`, ind: pick(['kc', 'atr', intraday ? 'vwap' : 'sma20', 'vol']) };
  return { k: 'range', name: 'Ranging (choppy)', why: `No clear direction (ADX ${adx == null ? '-' : adx.toFixed(0)}, efficiency ${(er * 100).toFixed(0)}%). Mean-reversion tools fit: Bollinger Bands for the edges, RSI for stretched moves, ${intraday ? 'VWAP' : 'the 20 average'} as the middle.`, ind: pick(['bb', 'rsi', intraday ? 'vwap' : 'sma20', 'vol']) };
}
const trPrmD = k => { const P = {}; for (const [n, , d] of IND[k].p) P[n] = d; return P; };
function trAuto(m) {
  const B = m ? m.B : trData?.B, tf = m ? m.tf : TR.tf; if (!B) return toast('No data yet'); const r = trRegime(B, tf); if (!r) return toast('Not enough bars to judge this market yet');
  if (m) { m.ind = r.ind.filter(k => k != 'vol'); trMiniSave(); trMiniPaint(m); }
  else { const keep = TR.ind.filter(k => IND[k]?.bot || IND[k]?.custom); TR.ind = [...r.ind, ...keep]; LS.set('mt:ind2', TR.ind); TR.why = r; trPaint(true); }
  trAutoNote(r, m); }
function trAutoNote(r, m) { let el = $('#trautonote'); if (!el) { el = document.createElement('div'); el.id = 'trautonote'; el.className = 'trautonote'; document.body.append(el); }
  el.innerHTML = `<div class=row style="justify-content:space-between;gap:10px"><b>${m ? esc((m.d?.name || trMiniSym(m)) + ' · ') : ''}${esc(r.name)}</b><button class=trprm aria-label=Close>${ic('x', 12)}</button></div><div>${esc(r.why)}</div><div class=mut style="margin-top:6px">Picked: ${r.ind.map(k => esc(IND[k].n)).join(', ')}</div>`;
  el.classList.remove('out'); el.querySelector('button').onclick = () => el.classList.add('out'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('out'), 12e3); }

/* ---------- your own indicators: a JavaScript file with calc(bars, params), run in a sandboxed Web Worker ---------- */
const CUSTOM_TPL = `// name: My moving average cross
// pane: false            (true = its own section under the price, like RSI)
// param: fast Fast length 9
// param: slow Slow length 21
//
// calc(bars, params) gets the candles, oldest first: [{ t, o, h, l, c, v }, ...]
// and returns one or more lines: [{ name, values: [number or null per bar], color, width }]
// Optional: style: 'histogram' for bars, and levels: [30, 70] for horizontal guide lines.
// It runs in a sandbox (a Web Worker): no page, no network, no account access.
function ema(a, n) { const k = 2 / (n + 1); let e = null; return a.map((x, i) => (e = e == null ? x : x * k + e * (1 - k), i >= n - 1 ? e : null)); }
function calc(bars, params) {
  const c = bars.map(b => b.c);
  return [
    { name: 'Fast EMA', values: ema(c, params.fast), color: '#00e5ff', width: 2 },
    { name: 'Slow EMA', values: ema(c, params.slow), color: '#ff4081', width: 2 },
  ];
}
`;
let trCusS = [], trCusR = {}, trPH = .18;
function trCustomParse(code, file) { const name = (code.match(/\/\/\s*name:\s*(.+)/i)?.[1] || file.replace(/\.(js|txt)$/i, '') || 'My indicator').trim().slice(0, 40), pane = /\/\/\s*pane:\s*true/i.test(code), p = [];
  for (const m of code.matchAll(/\/\/\s*param:\s*(\w+)\s+(.+?)\s+(-?[\d.]+)\s*$/gim)) p.push([m[1], m[2], +m[3], -1e9, 1e9, .5]); return { name, pane, p }; }
function trCustomReg() { for (const c of LS.get('mt:custom', [])) { const x = trCustomParse(c.code, c.name); IND['c_' + c.id] = { n: x.name, g: 'Custom', d: 'Your indicator' + (x.pane ? ' (own section)' : ''), p: x.p, custom: 1, pane: x.pane, code: c.code, col: '#00e5ff', run: () => [] }; }
  if (!INDGROUPS.includes('Custom')) INDGROUPS.push('Custom'); DOT.__c = 1; }
function trCustomAdd(code, file) { if (!/function\s+calc\s*\(/.test(code)) { toast('The file needs a function calc(bars, params)'); return; } if (code.length > 200e3) { toast('Too big (max 200 KB)'); return; }
  const id = Date.now().toString(36), L = LS.get('mt:custom', []); L.push({ id, name: file, code }); LS.set('mt:custom', L); trCustomReg(); TR.ind = [...TR.ind, 'c_' + id]; LS.set('mt:ind2', TR.ind); trPaint(true); toast('Indicator added: ' + IND['c_' + id].n); }
const WORKER_SRC = `self.onmessage = e => { const { code, bars, params } = e.data; try { const f = new Function('bars', 'params', '"use strict";' + code + '\\nreturn calc(bars, params);'); const out = f(bars, params); self.postMessage({ ok: true, out: Array.isArray(out) ? out.slice(0, 12).map(o => ({ name: String(o.name || '').slice(0, 40), values: Array.isArray(o.values) ? o.values.map(v => typeof v === 'number' && isFinite(v) ? v : null) : [], color: typeof o.color === 'string' ? o.color.slice(0, 30) : null, width: +o.width || 1.5, style: o.style === 'histogram' ? 'histogram' : 'line', levels: Array.isArray(o.levels) ? o.levels.slice(0, 6).map(Number).filter(isFinite) : [] })) : [] }); } catch (err) { self.postMessage({ ok: false, error: String(err && err.message || err) }); } };`;
function trCustomCalc(k, B) { return new Promise(ok => { const w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))), t = setTimeout(() => { w.terminate(); ok({ ok: false, error: 'took longer than 2 seconds' }); }, 2000);
  w.onmessage = e => { clearTimeout(t); w.terminate(); ok(e.data); }; w.onerror = e => { clearTimeout(t); w.terminate(); ok({ ok: false, error: e.message }); }; w.postMessage({ code: IND[k].code, bars: B.map(b => ({ t: b.t - TZ(), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), params: trPrm(k) }); }); }
async function trCustomRun(rebuild) {
  const ks = TR.ind.filter(k => IND[k]?.custom); if (!trS.main || !trData) return; const B = trBars(), key = trData.sym + TR.tf + B.length + B[B.length - 1]?.c + JSON.stringify(TR.prm);
  if (!rebuild && trCusR.key === key && trCusR.ks === ks.join()) return; trCusR = { key, ks: ks.join() };
  const res = await Promise.all(ks.map(k => trCustomCalc(k, B))); if (trCusR.key !== key) return;
  for (const x of trCusS) try { trChart.removeSeries(x); } catch (e) {} trCusS = []; const T = B.map(b => b.t), pal = indPalette();
  const panes = ks.filter(k => IND[k].pane), pBase = TR.ind.filter(k => IND[k]?.pane && !IND[k].custom && !IND[k].bot).length, PH = trPH;
  ks.forEach((k, j) => { const r = res[j]; if (!r.ok) { toast(`${IND[k].n}: ${r.error}`); return; } const pi = panes.indexOf(k), scale = pi >= 0 ? 'cp_' + k : 'right';
    r.out.forEach((o, n) => { const c = o.color || pal[(n + 2) % 8], sr = o.style == 'histogram' ? trChart.addHistogramSeries({ priceScaleId: scale, priceLineVisible: false, lastValueVisible: false }) : trChart.addLineSeries({ priceScaleId: scale, color: c, lineWidth: o.width, priceLineVisible: false, lastValueVisible: pi >= 0 && n == 0, crosshairMarkerVisible: false });
      if (pi >= 0) sr.priceScale().applyOptions({ scaleMargins: { top: 1 - PH * (pBase + pi + 1) + .03, bottom: PH * (pBase + pi) + .015 } }); for (const lv of o.levels) sr.createPriceLine({ price: lv, color: pal[8] + '99', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
      sr.setData(T.map((t, i) => o.values[i] == null ? { time: t } : { time: t, value: o.values[i], ...(o.style == 'histogram' ? { color: c + 'aa' } : {}) })); trCusS.push(sr); });
    IND[k].col = r.out[0]?.color || IND[k].col; }); trLegend(); }

/* ---------- Opposite Bot switch in the toolbar ---------- */
function trOppUi(on) { const b = $('#troppb'); if (b) { b.classList.toggle('on', !!on); b.title = on ? 'Opposite Bot is ON: it takes the reverse of your trades. Click to turn it off.' : 'Opposite Bot is off. Click to turn it on.'; } }
async function trOppToggle() { const on = TR.rp ? !RP.opp : !trState?.opp?.enabled; if (TR.rp) { RP.opp = on; LS.set('mt:rpopp', on); trOppUi(on); rpUi(); toast(on ? 'Opposite Bot on for this replay' : 'Opposite Bot off for this replay'); return; }
  try { await mtapi('opp', { on }); trOppUi(on); toast(on ? 'Opposite Bot on: it takes the other side of your trades' : 'Opposite Bot off'); trStateLoad(); } catch (e) { toast(esc(e.message)); } }

/* ---------- Terminal Replay: go back to any moment, let the market play forward at your speed, trade it as if it were live ---------- */
let RP = null, rpT = null;
const RPSPD = [1, 2, 5, 10, 30, 60, 120, 300, 600, 1800];
function rpPickStart() { trSheet(null); if (!trData) return; if (SECT[TR.tf]) { toast('Replay needs history: switched to 1 minute'); TR.tf = '1m'; LS.set('mt:tf', '1m'); trUiSync(); trLoad(true).then(rpPickStart); return; }
  TR.rpPick = true; $('#trrpb')?.classList.add('on'); rpBar(`<div class=rppick><b>Replay</b><span>Click the chart where the replay should start, or pick a time:</span><input type=datetime-local id=rpdt class=inp><button class="btn sm pri" id=rpgo>Start</button><button class="btn sm" id=rprand>Random point</button><button class="btn sm" id=rpx>Cancel</button></div>`);
  const B = trData.B, f = t => new Date((t - TZ()) * 1000 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16), dt = $('#rpdt'); dt.min = f(B[Math.min(B.length - 1, 30)].t); dt.max = f(B[B.length - 2].t); dt.value = f(B[Math.max(30, B.length - 300)].t);
  $('#rpgo').onclick = () => { const t = Date.parse(dt.value) / 1000 + TZ(); if (!isFinite(t)) return toast('Pick a date and time'); rpBegin(t); };
  $('#rprand').onclick = () => { const i = 60 + Math.floor(Math.random() * Math.max(1, B.length - 120)); rpBegin(B[i].t); }; $('#rpx').onclick = rpExit; }
function rpBegin(t) {
  const all = trData.B.map(b => ({ ...b })), i = all.findIndex(b => b.t >= t); if (i < 0 || i >= all.length - 1) return toast('Pick an earlier point: there is nothing after it to replay'); if (i < 20) return toast('Too early: pick a point with some history before it (or a bigger timeframe to go further back)');
  TR.rpPick = false; TR.rp = true; trTickStop(); const bs = TFSEC[TR.tf] || (TR.tf == '1d' ? 86400 : TR.tf == '1w' ? 604800 : 2592000);
  RP = { all, i, bs, simT: all[i].t, speed: LS.get('mt:rpspd', 60), play: false, last: 0, live: { ...all[i], h: all[i].o, l: all[i].o, c: all[i].o }, px: all[i].o, opp: LS.get('mt:rpopp', false), acct: { me: rpAcct(), opp: rpAcct() }, orders: [], fills: [], seq: 0 };
  trData = { ...trData, B: all.slice(0, i).concat([RP.live]) }; trFit = true; trPaint(true); rpUi(); trOppUi(RP.opp); toast('Replay ready: press play. Your replay trades use a separate $100,000 paper account.'); }
const rpAcct = () => ({ cash: trRpBal(), start: trRpBal(), qty: 0, avg: 0, realized: 0, n: 0, won: 0 });
function rpPath(b, p) { // the price inside a bar as it forms: open, then the nearer extreme, then the other, then the close
  const up = b.c >= b.o, a = up ? b.l : b.h, z = up ? b.h : b.l; if (p < 1 / 3) return b.o + (a - b.o) * p * 3; if (p < 2 / 3) return a + (z - a) * (p - 1 / 3) * 3; return z + (b.c - z) * (p - 2 / 3) * 3; }
function rpStep(dtSec) { const R = RP; if (!R) return; let newBar = false;
  R.simT += dtSec;
  while (R.i < R.all.length) { const b = R.all[R.i], end = b.t + R.bs; if (R.simT < end) break;
    trData.B[trData.B.length - 1] = { ...b }; rpTick(b.c, b); R.i++; newBar = true; if (R.i >= R.all.length) { R.play = false; toast('Replay reached the end of the data'); break; }
    const nb = R.all[R.i]; if (R.simT < nb.t) R.simT = nb.t; R.live = { ...nb, h: nb.o, l: nb.o, c: nb.o }; trData.B.push(R.live); }
  if (R.i < R.all.length) { const b = R.all[R.i], p = Math.max(0, Math.min(1, (R.simT - b.t) / R.bs)), px = rpPath(b, p); R.live.c = px; R.live.h = Math.max(R.live.h, px); R.live.l = Math.min(R.live.l, px); R.live.v = b.v * p; rpTick(px, R.live); }
  if (newBar) trPaint(false); else trRender(R.px); rpUi(); window.lpOnStep?.(); const now = performance.now(); if (now - (R.du || 0) > 700) { R.du = now; trAcct(); trTable(); } }
function rpLoop() { clearInterval(rpT); rpT = setInterval(() => { if (!RP || !RP.play) return; const now = performance.now(), dt = RP.last ? (now - RP.last) / 1000 : 0; RP.last = now; rpStep(Math.min(dt, .25) * RP.speed); }, 50); }
function rpKill() { window.lpStop?.(); clearInterval(rpT); rpT = null; RP = null; if (TR) { TR.rp = false; TR.rpPick = false; } $('#rpbar')?.remove(); }
function rpExit() { const R = RP; if (R) { const m = R.acct.me, eq = rpEq(m); toast(`Replay finished: ${eq >= m.start ? '+' : ''}${trM(eq - m.start)} over ${m.n} trade${m.n == 1 ? '' : 's'}`); }
  rpKill(); $('#trrpb')?.classList.remove('on'); trData = null; trLoad(true); trTick(); trStateLoad(); }
// replay paper accounts: market, limit and stop orders, with stop-loss / take-profit brackets, against the replayed price
const rpMult = () => trData?.spec?.mult || 1, rpEq = a => a.cash + a.qty * (RP?.px || 0) * rpMult();
function rpFill(acct, side, qty, px, why) { const a = RP.acct[acct], d = side == 'buy' ? 1 : -1, m = rpMult(); px = px * (1 + d * .0002);
  if (a.qty * d < 0) { const close = Math.min(Math.abs(a.qty), qty), pnl = (px - a.avg) * -d * close * m; a.realized += pnl; a.n++; if (pnl > 0) a.won++; a.qty += d * close; qty -= close; if (!a.qty) a.avg = 0; RP.fills.unshift({ acct, side, qty: close, px, pnl, t: RP.simT, why }); }
  if (qty > 0) { if (!a.qty) a.t0 = RP.live ? RP.live.t : RP.simT; a.avg = (a.avg * Math.abs(a.qty) + px * qty) / (Math.abs(a.qty) + qty); a.qty += d * qty; RP.fills.unshift({ acct, side, qty, px, pnl: 0, t: RP.simT, why }); }
  a.cash = a.start + a.realized - a.qty * a.avg * m; }
function rpOrder(o) { const R = RP; if (!R) return; if (!(o.qty > 0)) return toast('Enter a quantity'); const id = ++R.seq;
  if (o.kind == 'market') { rpFill('me', o.side, o.qty, R.px, 'market'); if (R.opp) rpFill('opp', o.side == 'buy' ? 'sell' : 'buy', o.qty, R.px, 'opposite of yours'); toast(`${o.side == 'buy' ? 'Bought' : 'Sold'} ${o.qty} at ${trN(R.px)} (replay)`); rpBrackets(o, id); }
  else { if (!(o.px > 0)) return toast('Enter a price'); R.orders.push({ id, ...o, acct: 'me' }); toast(`${o.kind} ${o.side} ${o.qty} at ${trN(o.px)} placed (replay)`); }
  trOrderLines(); rpUi(); }
function rpBrackets(o, id) { const ex = o.side == 'buy' ? 'sell' : 'buy'; if (o.sl) RP.orders.push({ id: ++RP.seq, grp: id, side: ex, kind: 'stop', qty: o.qty, px: o.sl, acct: 'me', br: 1 }); if (o.tp) RP.orders.push({ id: ++RP.seq, grp: id, side: ex, kind: 'limit', qty: o.qty, px: o.tp, acct: 'me', br: 1 }); }
function rpTick(px, bar) { const R = RP; R.px = px; let hit = false;
  for (const o of [...R.orders]) { const touch = o.kind == 'limit' ? (o.side == 'buy' ? px <= o.px : px >= o.px) : (o.side == 'buy' ? px >= o.px : px <= o.px); if (!touch) continue;
    R.orders = R.orders.filter(x => x !== o && !(o.grp && x.grp === o.grp)); const fp = o.kind == 'limit' ? o.px : px; rpFill('me', o.side, o.qty, fp, o.br ? (o.kind == 'stop' ? 'stop-loss' : 'take-profit') : o.kind);
    if (R.opp) rpFill('opp', o.side == 'buy' ? 'sell' : 'buy', o.qty, fp, 'opposite of yours'); if (!o.br) rpBrackets(o, o.id); hit = true; toast(`Replay: ${o.br ? (o.kind == 'stop' ? 'stop-loss' : 'take-profit') : o.kind + ' order'} filled at ${trN(fp)}`); }
  if (hit) trOrderLines(); }
function rpClose(part) { const a = RP.acct.me; if (!a.qty) return; const side = a.qty > 0 ? 'sell' : 'buy', aq = Math.abs(a.qty), pq = +part, partial = pq > 0 && pq < aq - 1e-9, q = partial ? pq : aq;
  if (partial) { for (const o of RP.orders) if (o.br) o.qty = aq - q; } else RP.orders = RP.orders.filter(o => !o.br);
  rpFill('me', side, q, RP.px, partial ? 'partly closed by you' : 'closed by you');
  if (RP.opp && RP.acct.opp.qty) { const oq = Math.abs(RP.acct.opp.qty), x = partial ? Math.min(oq, q) : oq; rpFill('opp', RP.acct.opp.qty > 0 ? 'sell' : 'buy', x, RP.px, 'closed with yours'); } trOrderLines(); rpUi(); }
function rpReverse() { const a = RP.acct.me; if (!a.qty) return; RP.orders = RP.orders.filter(o => !o.br); rpFill('me', a.qty > 0 ? 'sell' : 'buy', Math.abs(a.qty) * 2, RP.px, 'reversed by you');
  if (RP.opp && RP.acct.opp.qty) rpFill('opp', RP.acct.opp.qty > 0 ? 'sell' : 'buy', Math.abs(RP.acct.opp.qty) * 2, RP.px, 'reversed with yours'); trOrderLines(); rpUi(); }
function rpExitSet(kind, px) { const a = RP.acct.me; if (!a.qty) return; const k = kind == 'tp' ? 'limit' : 'stop', g = RP.orders.find(o => o.br)?.grp ?? ++RP.seq; RP.orders = RP.orders.filter(o => !(o.br && o.kind == k));
  if (px) RP.orders.push({ id: ++RP.seq, grp: g, side: a.qty > 0 ? 'sell' : 'buy', kind: k, qty: Math.abs(a.qty), px, acct: 'me', br: 1 }); trOrderLines(); }
function rpLines(out) {
  for (const o of RP.orders) out.push(trS.main.createPriceLine({ price: o.px, color: o.side == 'buy' ? trCss('--up') : trCss('--down'), lineWidth: 1, lineStyle: 2, title: `${o.br ? (o.kind == 'stop' ? 'SL' : 'TP') : o.kind} ${o.side} ${trN(o.qty, 0)}` })); }
function rpBar(html) { let el = $('#rpbar'); if (!el) { el = document.createElement('div'); el.id = 'rpbar'; el.className = 'rpbar'; ($('.trchartcard') || document.body).append(el); } el.innerHTML = html; return el; }
function rpUi() { const R = RP; if (!R) return; const m = R.acct.me, o = R.acct.opp, eq = rpEq(m), op = rpEq(o), up = (m.qty ? (R.px - m.avg) * m.qty * rpMult() : 0), d = new Date((R.simT - TZ()) * 1000);
  let el = $('#rpbar'); if (!el || !el.querySelector('.rpctl')) { el = rpBar(`<div class=rpctl><b class=rpt>REPLAY</b><button class="btn sm" id=rpplay aria-label="Play or pause"></button><button class="btn sm" id=rpstep title="Next bar">⏭</button>
    <select class=inp id=rpspd title="Speed: how much faster than real time">${RPSPD.map(x => `<option value=${x} ${R.speed == x ? 'selected' : ''}>${x}×</option>`).join('')}</select><span class="rpclock num" id=rpclock></span><span class=rpsp></span>
    <span class=rpst id=rpst></span><button class="btn sm" id=rpclose>Close position</button><button class="btn sm" id=rpnew title="Pick another start point">New start</button><button class="btn sm danger" id=rpx>Exit replay</button></div>`);
    $('#rpplay').onclick = () => { R.play = !R.play; R.last = 0; if (R.play) rpLoop(); rpUi(); }; $('#rpstep').onclick = () => { R.play = false; const b = R.all[R.i]; if (b) rpStep(b.t + R.bs - R.simT + .001); };
    $('#rpspd').onchange = e => { R.speed = +e.target.value; LS.set('mt:rpspd', R.speed); }; $('#rpclose').onclick = rpClose; $('#rpx').onclick = rpExit; $('#rpnew').onclick = () => { rpKill(); trData = null; trLoad(true).then(rpPickStart); }; }
  $('#rpplay').innerHTML = R.play ? '❚❚ Pause' : '▶ Play'; $('#rpplay').classList.toggle('pri', !R.play);
  $('#rpclock').textContent = d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: R.bs < 3600 ? '2-digit' : undefined });
  $('#rpst').innerHTML = `Equity <b class=num>${trM(eq)}</b> <span class="num ${eq >= m.start ? 'up' : 'down'}">${eq >= m.start ? '+' : ''}${trM(eq - m.start)}</span>${m.qty ? ` · ${m.qty > 0 ? 'Long' : 'Short'} ${trN(Math.abs(m.qty), Number.isInteger(m.qty) ? 0 : undefined)} <span class="num ${up >= 0 ? 'up' : 'down'}">${trM(up)}</span>` : ''} · ${m.n} trade${m.n == 1 ? '' : 's'}${m.n ? ', ' + Math.round(m.won / m.n * 100) + '% won' : ''}${R.opp ? ` · Opposite <span class="num ${op >= o.start ? 'up' : 'down'}">${op >= o.start ? '+' : ''}${trM(op - o.start)}</span>` : ''}`;
  $('#rpclose').hidden = !m.qty; }

/* ---------- routing orders to a connected broker (Brokers page) ---------- */
let trBrk = null;
async function trBrkLoad() { try { trBrk = (await brkApi('b-list', {})).connected; } catch (e) { trBrk = []; } }
const trRoute = () => { const id = LS.get('mt:route', ''); return TR.rp ? null : (trBrk || []).find(b => b.id == id) || null; };
const trAcctOpts = () => { const r = trRoute(); return `<option value="">Mimic paper ($100k practice)</option>${(trBrk || []).map(b => `<option value="${b.id}" ${r?.id == b.id ? 'selected' : ''}>${esc(b.label || b.name)} · ${b.paper ? esc(b.env) : 'LIVE'}</option>`).join('')}<option value="__add">+ Connect a broker…</option>`; };
async function trBrokerOrder(b, qty) { const px = +($('#trpxin')?.value || 0), last = trData?.B[trData.B.length - 1]?.c;
  if (!b.paper && !confirm(`Send a REAL-MONEY order to ${b.label || b.name}?\n\n${TR.side.toUpperCase()} ${qty} ${TR.sym} · ${TR.kind}${TR.kind != 'market' ? ' at ' + px : ''}`)) return;
  const go = $('#trgo'); go.disabled = true; try { const r = await brkApi('b-order', { id: b.id, sym: TR.sym, side: TR.side, kind: TR.kind, qty, px, ref: px || last, mult: trData?.spec?.mult || 1 }); toast(`${r.broker} (${r.paper === false ? 'live' : r.env}): order ${esc(String(r.status || 'sent'))}`); trOrderWin(false); }
  catch (e) { toast(esc(e.message)); } finally { go.disabled = false; } }

// the account the panels show: the replay account while a replay runs, otherwise the paper account on the server
const trRpBal = () => +LS.get('mt:rpbal', 1e5) || 1e5;
function rpState() { const R = RP, m = rpMult(), sym = trData?.sym || TR.sym, A = k => { const a = R.acct[k], up = a.qty ? (R.px - a.avg) * a.qty * m : 0; return { equity: rpEq(a), start: a.start, cash: a.cash, upnl: up, closed: a.n, won: a.won, enabled: k == 'opp' ? !!R.opp : true, positions: a.qty ? [{ sym, qty: a.qty, avg: a.avg, px: R.px, upnl: up }] : [] }; };
  return { me: A('me'), opp: A('opp'), orders: R.orders.filter(o => o.acct == 'me').map(o => ({ ...o, sym, ts: (R.simT - TZ()) * 1000 })), fills: R.fills.filter(f => f.acct == 'me' || R.opp).map(f => ({ ...f, sym, ts: (f.t - TZ()) * 1000, fee: 0 })) }; }
const trSt = () => TR?.rp && RP ? rpState() : trState;
// paper balance manager: set the starting balance, deposit or withdraw, and the balance replays start with
function trBalMgr() { $('#trbalm')?.remove(); const st = trState?.me, el = document.createElement('div'); el.id = 'trbalm'; el.className = 'trbalm';
  el.innerHTML = `<div class=trbalc><div class="row sb"><b>Paper balance</b><button class="btn sm ic" id=tbx aria-label=Close>${ic('x', 13)}</button></div>
   <div class=mut style="font-size:12.5px;margin:4px 0 12px">Now ${st ? trM(st.equity) : '-'} · started at ${st ? trM(st.start) : '-'}</div>
   <label class=tblab>New starting balance<div class=row style="gap:8px"><input class=inp id=tbset type=number min=100 step=1000 value="${st ? Math.round(st.start) : 100000}"><button class="btn sm pri" id=tbsetgo>Set and start fresh</button></div></label>
   <div class=row style="gap:6px;flex-wrap:wrap;margin:6px 0 12px">${[1e3, 5e3, 1e4, 25e3, 5e4, 1e5, 25e4, 1e6].map(v => `<button class="chip" data-v=${v}>${trM(v).replace('.00', '')}</button>`).join('')}</div>
   <label class=tblab>Deposit or withdraw (keeps your positions and P&L)<div class=row style="gap:8px"><input class=inp id=tbadd type=number step=100 placeholder="Amount"><button class="btn sm" id=tbdep>Deposit</button><button class="btn sm" id=tbwd>Withdraw</button></div></label>
   <label class=tblab style="margin-top:12px">Replay accounts start with<div class=row style="gap:8px"><input class=inp id=tbrp type=number min=100 step=1000 value="${trRpBal()}"><button class="btn sm" id=tbrpgo>Save</button></div></label>
   <button class="btn sm danger" id=tbrst style="margin-top:14px">Reset to $100,000</button></div>`;
  document.body.append(el); const close = () => el.remove(); el.onclick = e => { if (e.target === el) close(); }; $('#tbx').onclick = close;
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { $('#tbset').value = b.dataset.v; });
  const run = async (body, msg) => { try { await mtapi('balance', body); toast(msg); close(); trStateLoad(); } catch (e) { toast(esc(e.message)); } };
  $('#tbsetgo').onclick = () => { const v = +$('#tbset').value; if (!confirm(`Start fresh with ${trM(v)}? Positions, orders and history are cleared.`)) return; run({ acct: 'me', amount: v }, `Paper balance set to ${trM(v)}`); };
  $('#tbdep').onclick = () => { const v = Math.abs(+$('#tbadd').value); if (v) run({ acct: 'me', mode: 'add', amount: v }, `Deposited ${trM(v)}`); };
  $('#tbwd').onclick = () => { const v = Math.abs(+$('#tbadd').value); if (v) run({ acct: 'me', mode: 'add', amount: -v }, `Withdrew ${trM(v)}`); };
  $('#tbrpgo').onclick = () => { const v = Math.max(100, +$('#tbrp').value || 1e5); LS.set('mt:rpbal', v); toast(`Replays start with ${trM(v)}`); close(); };
  $('#tbrst').onclick = async () => { if (!confirm('Reset your paper account to $100,000? Positions, orders and history are cleared.')) return; await mtapi('reset', { acct: 'me' }); await mtapi('reset', { acct: 'opp' }); close(); trStateLoad(); toast('Accounts reset'); }; }

// ---- the position tag on the chart (TradingView style): entry line, zone, arrow, and  [reverse] [TP] [SL] [qty] [P&L] [x] ----
function trPosInfo() { if (!trData?.B?.length) return null; const B = trData.B, last = B[B.length - 1], m = trData.spec?.mult || 1, sym = trData.sym;
  if (TR.rp && RP) { const a = RP.acct.me; if (!a.qty) return null; const ex = RP.orders.filter(o => o.br), px = RP.px;
    return { sym, side: a.qty > 0 ? 'long' : 'short', price: a.avg, qty: a.qty, time: a.t0 ?? last.t, last: px, pnl: (px - a.avg) * a.qty * m, tp: ex.some(o => o.kind == 'limit'), sl: ex.some(o => o.kind == 'stop') }; }
  const q = trState?.me?.positions?.find(x => x.sym == sym); if (!q) return null; const long = q.qty > 0, ex = (trState.orders || []).filter(o => o.sym == sym && o.grp);
  const f = (trState.fills || []).find(x => x.acct == 'me' && x.sym == sym && !x.pnl && (x.side == 'buy') == long), px = last.c;
  return { sym, side: long ? 'long' : 'short', price: q.avg, qty: q.qty, time: f ? f.ts / 1000 + TZ() : last.t, last: px, pnl: (px - q.avg) * q.qty * m, tp: ex.some(o => o.kind == 'limit'), sl: ex.some(o => o.kind == 'stop') }; }
function trPosSync() { try { const P = trPosInfo(); if (P) P.inset = TR.ind.includes('vp') && !/smooth|line|base/.test(TR.type) ? Math.round(($('#trc')?.clientWidth || 0) * .2) + 6 : 0; trChart?.setPosition?.(P); } catch (e) {} }
function trPosAct(k) { const P = trPosInfo(); if (!P) return;
  if (k == 'x' || k == 'qty' || k == 'pnl') return trCloseDlg(P); if (k == 'rev') return trRevDlg(P);
  if (k == 'tp' || k == 'sl') { const long = P.side == 'long', up = (k == 'tp') == long, d = Math.max(P.last * (k == 'tp' ? .006 : .004), trTickSz() * 6), px = Math.round((P.last + (up ? d : -d)) / trTickSz()) * trTickSz();
    if (P[k]) { if (TR.rp) { rpExitSet(k, 0); trPosSync(); } else mtapi('exit', { sym: P.sym, kind: k, px: P.last, remove: 1 }).then(trStateLoad).catch(e => toast(esc(e.message))); toast(`${k == 'tp' ? 'Take profit' : 'Stop loss'} removed`); }
    else { if (TR.rp) { rpExitSet(k, px); trPosSync(); } else mtapi('exit', { sym: P.sym, kind: k, px }).then(trStateLoad).catch(e => toast(esc(e.message))); toast(`${k == 'tp' ? 'Take profit' : 'Stop loss'} set at ${trN(px)}`); } } }
function trDlg(title, body, ok, onOk) { $('#trdlg')?.remove(); const w = document.createElement('div'); w.id = 'trdlg'; w.className = 'trdlgw';
  w.innerHTML = `<div class=trdlg role=dialog aria-label="${esc(title)}"><div class=trdh><b>${esc(title)}</b><button class=trdx aria-label=Close>${ic('x', 18)}</button></div><div class=trdb>${body}</div><div class=trdf><button class=trdc>Cancel</button><button class=trdok>${esc(ok)}</button></div></div>`;
  document.body.append(w); const close = () => w.remove(); w.onclick = e => { if (e.target === w) close(); }; w.querySelector('.trdx').onclick = w.querySelector('.trdc').onclick = close;
  w.querySelector('.trdok').onclick = async () => { try { await onOk(w); close(); } catch (e) { toast(esc(e.message || String(e))); } }; return w; }
const trPosRow = P => `<div class=trdrow><span class=trdic>${esc((P.sym || '?')[0])}</span><div><div class=trdt><b>${esc(trData?.ex ? trData.ex.split(' ')[0].toUpperCase() + ':' : '')}${esc(P.sym.replace('-USD', '').replace('=F', ''))}</b> <i>\u2022</i> ${P.side == 'long' ? 'Long' : 'Short'} ${trN(Math.abs(P.qty), Number.isInteger(P.qty) ? 0 : undefined)} @ ${trN(P.price)}</div>`;
function trCloseDlg(P) { const w = trDlg('Close position', `${trPosRow(P)}<label class=trdpart><input type=checkbox id=trdp><span class=trdbox></span>Partial close</label><input id=trdq class=trdq type=number min=0 step=any placeholder="Quantity (max ${trN(Math.abs(P.qty))})" hidden></div></div>`, 'Close position', async d => {
    const part = d.querySelector('#trdp').checked ? +d.querySelector('#trdq').value : 0; if (d.querySelector('#trdp').checked && !(part > 0)) throw new Error('Enter how much to close');
    if (TR.rp) rpClose(part); else { await mtapi('close', { sym: P.sym, qty: part || undefined }); trStateLoad(); } toast(part && part < Math.abs(P.qty) ? 'Position partly closed' : 'Position closed'); });
  const cb = w.querySelector('#trdp'), qi = w.querySelector('#trdq'); cb.onchange = () => { qi.hidden = !cb.checked; if (cb.checked) { qi.value = trN(Math.abs(P.qty) / 2).replace(/,/g, ''); qi.focus(); } }; }
function trRevDlg(P) { trDlg('Reverse position', `${trPosRow(P)}<div class=trdsub>Closes it and opens the same size on the other side at the current price.</div></div></div>`, 'Reverse position', async () => {
    if (TR.rp) rpReverse(); else { await mtapi('reverse', { sym: P.sym }); trStateLoad(); } toast('Position reversed'); }); }
