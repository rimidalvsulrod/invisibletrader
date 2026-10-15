// Mimic Charts: our own canvas chart engine for the Trade page (candles, bars, lines, areas, baselines, histograms, price scales,
// price lines, markers, crosshair, pan / zoom / pinch with momentum). Times are numbers in seconds (already shifted to local time).
(() => {
  const DASH = { 0: [], 1: [1, 2], 2: [4, 3], 3: [6, 5], 4: [1, 5] };
  const merge = (a, b) => { for (const k in b) { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && typeof a[k] === 'object' && a[k]) merge(a[k], v); else a[k] = v; } return a; };
  const abbr = v => { const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : (+v).toFixed(a < 10 ? 2 : 0); };
  const nice = x => { const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], p2 = n => String(n).padStart(2, '0');
  const TSTEPS = [1, 5, 15, 30, 60, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 7 * 86400, 'M', 'Q', 'Y'];
  const LINE_DEF = { color: '#2962ff', lineWidth: 2, lineStyle: 0, lineType: 0, lineVisible: true, pointMarkersVisible: false, pointMarkersRadius: 2, crosshairMarkerVisible: true, crosshairMarkerRadius: 4 };
  const DEF = { candle: { upColor: '#089981', downColor: '#f23645', borderUpColor: '#089981', borderDownColor: '#f23645', wickUpColor: '#089981', wickDownColor: '#f23645', borderVisible: true },
    bar: { upColor: '#089981', downColor: '#f23645', thinBars: true }, line: LINE_DEF, area: { ...LINE_DEF, lineColor: '#2962ff', topColor: 'rgba(41,98,255,.3)', bottomColor: 'rgba(41,98,255,0)' },
    base: { ...LINE_DEF, baseValue: { price: 0 }, topLineColor: '#089981', bottomLineColor: '#f23645', topFillColor1: 'rgba(8,153,129,.28)', topFillColor2: 'rgba(8,153,129,.05)', bottomFillColor1: 'rgba(242,54,69,.05)', bottomFillColor2: 'rgba(242,54,69,.28)' },
    hist: { color: '#26a69a', base: 0 }, fill: { color: 'rgba(41,98,255,.1)', priceLineVisible: false, lastValueVisible: false } };

  function createChart(el, o = {}) {
    const opt = merge({ layout: { background: { color: 'transparent' }, textColor: '#787b86', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 11 }, grid: { vertLines: { color: 'rgba(128,128,128,.08)', visible: true }, horzLines: { color: 'rgba(128,128,128,.08)', visible: true } },
      rightPriceScale: { borderVisible: true, borderColor: 'rgba(128,128,128,.2)', scaleMargins: { top: .1, bottom: .08 } }, timeScale: { borderVisible: true, borderColor: 'rgba(128,128,128,.2)', timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 7 },
      crosshair: { vertLine: { color: '#9598a1', style: 3, labelBackgroundColor: '#131722' }, horzLine: { color: '#9598a1', style: 3, labelBackgroundColor: '#131722' } }, localization: {}, glow: false }, o);
    const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;display:block'; cv.className = 'mc-canvas'; el.append(cv);
    const g = cv.getContext('2d'), series = [], scales = { right: { m: { ...opt.rightPriceScale.scaleMargins }, mode: 0, auto: true } }, cbMove = [], cbClick = [], cbRange = [];
    let draws = [], tool = null, sel = null, pend = null, cbDraw = [], W = 0, H = 0, dpr = 1, AX = 56, TAX = 28, times = [], tIdx = new Map(), dirtyT = true, range = null, cross = null, raf = 0, dead = false, lastN = 0;
    const scaleOf = id => scales[id] || (scales[id] = { m: { top: .2, bottom: .1 }, mode: 0, auto: true });
    const fmt = (p, s) => s?.vol ? abbr(p) : opt.localization.priceFormatter ? opt.localization.priceFormatter(p) : (+p).toFixed(2);
    const PW = () => W - AX, PH = () => H - TAX;
    function rebuildTimes() { const set = new Set(); for (const s of series) for (const d of s.data) set.add(d.time); times = [...set].sort((a, b) => a - b); tIdx = new Map(times.map((t, i) => [t, i])); for (const s of series) s.ix = s.data.map(d => tIdx.get(d.time)); dirtyT = false; }
    const ensure = () => { if (dirtyT) rebuildTimes(); if (!range) { const n = times.length, bs = opt.timeScale.barSpacing, vis = Math.max(10, PW() / bs); range = { from: n - vis, to: n - 1 + opt.timeScale.rightOffset }; } };
    const bs = () => PW() / Math.max(1e-6, range.to - range.from);
    const xOf = i => (i - range.from) * bs();
    const iOf = x => range.from + x / bs();
    let bsC = null; const barS = () => { if (bsC && bsC.n === times.length) return bsC.v; const n = times.length, d = []; for (let i = Math.max(1, n - 60); i < n; i++) d.push(times[i] - times[i - 1]); d.sort((x, y) => x - y); const v = d.length ? Math.max(1, d[d.length >> 1]) : 60; bsC = { n, v }; return v; }; // typical bar length (median: gaps overnight and at weekends don't count)
    const idxOfT = t => { const n = times.length; if (!n) return 0; if (t <= times[0]) return (t - times[0]) / barS(); if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / barS(); let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; } return lo + (t - times[lo]) / Math.max(1, times[hi] - times[lo]); };
    const tOfIdx = i => { const n = times.length; if (!n) return 0; if (i <= 0) return times[0] + i * barS(); if (i >= n - 1) return times[n - 1] + (i - n + 1) * barS(); const a = Math.floor(i), f = i - a; return times[a] + f * (times[a + 1] - times[a]); };
    const xOfT = t => xOf(idxOfT(t)), tOfX = x => tOfIdx(iOf(x));
    // price scales: auto-fit over the visible bars
    function fit() {
      const a = Math.floor(range.from) - 1, z = Math.ceil(range.to) + 1;
      for (const id in scales) { const sc = scales[id]; if (!sc.auto && sc.min != null) continue; sc.lo = Infinity; sc.hi = -Infinity; }
      for (const s of series) { if (!s.on) continue; const sc = scaleOf(s.scale); if (!sc.auto && sc.min != null) continue;
        for (let k = 0; k < s.data.length; k++) { const i = s.ix[k]; if (i < a || i > z) continue; const d = s.data[k];
          if (s.type == 'candle' || s.type == 'bar') { if (d.high != null) { sc.lo = Math.min(sc.lo, d.low); sc.hi = Math.max(sc.hi, d.high); } }
          else if (d.value != null && isFinite(d.value)) { sc.lo = Math.min(sc.lo, d.value); sc.hi = Math.max(sc.hi, d.value); if (s.type == 'hist') { sc.lo = Math.min(sc.lo, 0); sc.hi = Math.max(sc.hi, 0); } } } }
      for (const id in scales) { const sc = scales[id]; if (!sc.auto && sc.min != null) { sc.lo = sc.min; sc.hi = sc.max; continue; } if (!isFinite(sc.lo)) { sc.lo = 0; sc.hi = 1; } if (sc.hi === sc.lo) { const e = Math.abs(sc.hi) * .01 || 1; sc.lo -= e; sc.hi += e; }
        if (sc === scales.right && opt.minRange) { const mid = (sc.lo + sc.hi) / 2, mr = Math.abs(mid) * opt.minRange; if (sc.hi - sc.lo < mr) { sc.lo = mid - mr / 2; sc.hi = mid + mr / 2; } } } // a floor on the visible range: one-cent moves on a 1-second chart are not full-height bars
    }
    const tf = (sc, p) => sc.mode === 1 ? Math.log(Math.max(p, 1e-12)) : p, itf = (sc, v) => sc.mode === 1 ? Math.exp(v) : v;
    const yOf = (sc, p) => { const h = PH(), top = h * sc.m.top, hh = h * (1 - sc.m.top - sc.m.bottom), lo = tf(sc, sc.lo), hi = tf(sc, sc.hi); return top + (1 - (tf(sc, p) - lo) / (hi - lo)) * hh; };
    const pOf = (sc, y) => { const h = PH(), top = h * sc.m.top, hh = h * (1 - sc.m.top - sc.m.bottom), lo = tf(sc, sc.lo), hi = tf(sc, sc.hi); return itf(sc, lo + (1 - (y - top) / hh) * (hi - lo)); };
    function timeLabel(t, step) { const d = new Date(t * 1000), Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate();
      if (step === 'Y') return String(Y); if (step === 'M' || step === 'Q') return M === 0 ? String(Y) : MON[M];
      if (step >= 86400) return D === 1 ? (M === 0 ? String(Y) : MON[M]) : String(D);
      const hm = p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return String(D); return step < 60 ? hm + ':' + p2(d.getUTCSeconds()) : hm; }
    const bucket = (t, step) => { if (typeof step === 'number') return Math.floor(t / step); const d = new Date(t * 1000); return step === 'Y' ? d.getUTCFullYear() : step === 'Q' ? d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3) : d.getUTCFullYear() * 12 + d.getUTCMonth(); };
    function render() {
      raf = 0; if (dead || !W) return; ensure(); fit(); const pw = PW(), ph = PH(), L = opt.layout, R = scales.right, fs = L.fontSize, font = `${fs}px ${L.fontFamily}`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); if (L.background.color && L.background.color !== 'transparent') { g.fillStyle = L.background.color; g.fillRect(0, 0, W, H); }
      g.font = font; g.textBaseline = 'middle';
      // price ticks
      const ticks = []; { const n = Math.max(2, Math.floor(ph / 42)), lo = R.lo, hi = R.hi; if (R.mode === 1) { for (let k = 0; k <= n; k++) ticks.push(pOf(R, ph * R.m.top + k * ph * (1 - R.m.top - R.m.bottom) / n)); } else { const st = nice((hi - lo) / n); for (let p = Math.ceil(pOf(R, ph) / st) * st; p <= pOf(R, 0); p += st) ticks.push(p); } }
      const base = R.mode === 2 ? (() => { const m = series.find(s => s.scale == 'right' && s.on && s.data.length); if (!m) return null; const k = m.ix.findIndex(i => i >= Math.floor(range.from)); const d = m.data[Math.max(0, k)]; return d ? (d.close ?? d.value) : null; })() : null;
      const plab = p => base ? ((p / base - 1) * 100).toFixed(2) + '%' : fmt(p);
      let need = 0; for (const p of ticks) need = Math.max(need, g.measureText(plab(p)).width); const want = Math.ceil(need + 18); if (want > AX || want < AX - 16) { AX = Math.max(48, want); return schedule(); }
      // time ticks
      const n = times.length, spacing = bs(), barSec = barS(); let step = 'Y';
      for (const s of TSTEPS) { const sec = s === 'M' ? 2592000 : s === 'Q' ? 7776000 : s === 'Y' ? 31536000 : s; if (sec < barSec * .99) continue; if (sec / barSec * spacing >= 74) { step = s; break; } }
      const tt = []; { const a = Math.max(1, Math.floor(range.from)), z = Math.min(n - 1, Math.ceil(range.to)); let lastX = -1e9; for (let i = a; i <= z; i++) if (bucket(times[i], step) !== bucket(times[i - 1], step)) { const x = xOf(i); if (x - lastX >= 60) { tt.push([x, timeLabel(times[i], step)]); lastX = x; } } }
      // grid
      g.lineWidth = 1; if (opt.grid.horzLines.visible !== false) { g.strokeStyle = opt.grid.horzLines.color; g.beginPath(); for (const p of ticks) { const y = Math.round(yOf(R, p)) + .5; g.moveTo(0, y); g.lineTo(pw, y); } g.stroke(); }
      if (opt.grid.vertLines.visible !== false) { g.strokeStyle = opt.grid.vertLines.color; g.beginPath(); for (const [x] of tt) { const xx = Math.round(x) + .5; g.moveTo(xx, 0); g.lineTo(xx, ph); } g.stroke(); }
      // series
      g.save(); g.beginPath(); g.rect(0, 0, pw, ph); g.clip(); const a = Math.floor(range.from) - 1, z = Math.ceil(range.to) + 1;
      for (const s of series) if (s.on) drawSeries(s, a, z);
      for (const s of series) if (s.on && s.markers.length) drawMarkers(s, a, z);
      drawDrawings();
      // price lines
      for (const s of series) { if (!s.on) continue; const sc = scaleOf(s.scale); for (const pl of s.lines) { const y = Math.round(yOf(sc, pl.price)) + .5; if (y < 0 || y > ph) continue; g.strokeStyle = pl.color; g.lineWidth = pl.lineWidth || 1; g.setLineDash(DASH[pl.lineStyle ?? 2]); g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); g.setLineDash([]);
        if (pl.title) { g.font = font; const tw = g.measureText(pl.title).width + 10; g.fillStyle = pl.color; g.globalAlpha = .9; rr(pw - tw - 4, y - 9, tw, 18, 3); g.fill(); g.globalAlpha = 1; g.fillStyle = '#fff'; g.textAlign = 'right'; g.fillText(pl.title, pw - 9, y); g.textAlign = 'left'; } }
        const lv = lastOf(s); if (lv && s.o.priceLineVisible !== false) { const y = Math.round(yOf(sc, lv.v)) + .5; g.strokeStyle = s.o.priceLineColor || lv.c; g.setLineDash(DASH[s.o.priceLineStyle ?? 2]); g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); g.setLineDash([]); } }
      // crosshair
      if (cross) { const C = opt.crosshair; g.lineWidth = 1; g.strokeStyle = C.vertLine.color; g.setLineDash(DASH[C.vertLine.style ?? 3]); g.beginPath(); const cx = Math.round(xOf(cross.i)) + .5; g.moveTo(cx, 0); g.lineTo(cx, ph); g.stroke();
        g.strokeStyle = C.horzLine.color; g.setLineDash(DASH[C.horzLine.style ?? 3]); g.beginPath(); g.moveTo(0, Math.round(cross.y) + .5); g.lineTo(pw, Math.round(cross.y) + .5); g.stroke(); g.setLineDash([]);
        for (const s of series) { if (!s.on || !(s.type == 'line' || s.type == 'area' || s.type == 'base') || s.o.crosshairMarkerVisible === false) continue; const k = s.ix.indexOf(cross.i), d = s.data[k]; if (!d || d.value == null) continue; const y = yOf(scaleOf(s.scale), d.value);
          g.fillStyle = s.o.crosshairMarkerBackgroundColor || s.o.color || s.o.lineColor || s.o.topLineColor; g.beginPath(); g.arc(cx, y, s.o.crosshairMarkerRadius || 4, 0, 7); g.fill(); g.lineWidth = s.o.crosshairMarkerBorderWidth || 2; g.strokeStyle = s.o.crosshairMarkerBorderColor || 'rgba(255,255,255,.9)'; g.stroke(); } }
      g.restore();
      // axes
      g.fillStyle = L.background.color && L.background.color !== 'transparent' ? L.background.color : 'transparent'; g.strokeStyle = opt.rightPriceScale.borderColor; g.lineWidth = 1;
      if (opt.rightPriceScale.borderVisible) { g.beginPath(); g.moveTo(pw + .5, 0); g.lineTo(pw + .5, ph); g.stroke(); } if (opt.timeScale.borderVisible) { g.strokeStyle = opt.timeScale.borderColor; g.beginPath(); g.moveTo(0, ph + .5); g.lineTo(pw, ph + .5); g.stroke(); }
      g.fillStyle = L.textColor; g.textAlign = 'left'; for (const p of ticks) { const y = yOf(R, p); if (y > 6 && y < ph - 6) g.fillText(plab(p), pw + 8, y); }
      g.textAlign = 'center'; for (const [x, t] of tt) if (x > 16 && x < pw - 16) g.fillText(t, x, ph + TAX / 2); g.textAlign = 'left';
      // last-value labels and price-line labels on the axis
      const tag = (y, txt, bg, fg = '#fff') => { if (y < -8 || y > ph + 8) return; g.font = font; g.fillStyle = bg; rr(pw + 1, y - 9, AX - 2, 18, 3); g.fill(); g.fillStyle = fg; g.fillText(txt, pw + 7, y); };
      for (const s of series) { if (!s.on) continue; const sc = scaleOf(s.scale); for (const pl of s.lines) if (pl.axisLabelVisible !== false) tag(yOf(sc, pl.price), fmt(pl.price, s), pl.color);
        const lv = lastOf(s); if (lv && s.o.lastValueVisible !== false) tag(yOf(sc, lv.v), s.scale == 'right' && base ? plab(lv.v) : fmt(lv.v, s), lv.c); }
      if (cross) { const C = opt.crosshair; tag(cross.y, R.mode === 2 && base ? plab(pOf(R, cross.y)) : fmt(pOf(R, cross.y)), C.horzLine.labelBackgroundColor);
        const t = times[cross.i]; if (t != null) { const d = new Date(t * 1000), txt = barSec >= 86400 ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}${opt.timeScale.secondsVisible ? ':' + p2(d.getUTCSeconds()) : ''}`, tw = g.measureText(txt).width + 14, x = Math.max(0, Math.min(pw - tw, xOf(cross.i) - tw / 2));
          g.fillStyle = C.vertLine.labelBackgroundColor; rr(x, ph + 4, tw, TAX - 8, 3); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(txt, x + tw / 2, ph + TAX / 2); g.textAlign = 'left'; } }
    }
    function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function lastOf(s) { for (let k = s.data.length - 1; k >= 0; k--) { const d = s.data[k], v = d.close ?? d.value; if (v != null && isFinite(v)) { const o = s.o, up = d.close == null || d.close >= d.open; return { v, c: s.type == 'candle' || s.type == 'bar' ? (up ? o.upColor : o.downColor) : s.type == 'hist' ? d.color || o.color : s.type == 'base' ? (v >= o.baseValue.price ? o.topLineColor : o.bottomLineColor) : d.color || o.color || o.lineColor }; } } return null; }
    const glowOn = (c, b) => { if (opt.glow) { g.shadowColor = c; g.shadowBlur = b; } }, glowOff = () => { g.shadowBlur = 0; };
    function drawSeries(s, a, z) {
      const sc = scaleOf(s.scale), o = s.o, w = bs(), y = p => yOf(sc, p);
      if (s.type == 'candle') { const bw = Math.max(1, Math.min(w * .7, 40)); for (let k = 0; k < s.data.length; k++) { const i = s.ix[k]; if (i < a || i > z) continue; const d = s.data[k]; if (d.open == null) continue; const up = d.close >= d.open, x = Math.round(xOf(i)), yo = y(d.open), yc = y(d.close), top = Math.round(Math.min(yo, yc)), h = Math.max(1, Math.round(Math.abs(yc - yo)));
          const body = up ? o.upColor : o.downColor, edge = up ? o.borderUpColor : o.borderDownColor, wick = up ? o.wickUpColor : o.wickDownColor; glowOn(edge || body, 6);
          g.fillStyle = wick; g.fillRect(x - (w > 12 ? 1 : .5), Math.round(y(d.high)), w > 12 ? 2 : 1, Math.max(1, Math.round(y(d.low) - y(d.high))));
          if (bw >= 3) { const hollow = /rgba\(0, ?0, ?0, ?0\)|transparent/.test(body); if (!hollow) { g.fillStyle = body; g.fillRect(Math.round(x - bw / 2), top, Math.round(bw), h); } if (o.borderVisible !== false && edge && (hollow || edge !== body)) { g.strokeStyle = edge; g.lineWidth = 1; g.strokeRect(Math.round(x - bw / 2) + .5, top + .5, Math.round(bw) - 1, Math.max(0, h - 1)); } } } glowOff(); return; }
      if (s.type == 'bar') { const tk = Math.max(1, Math.min(w * .35, 8)); g.lineWidth = o.thinBars === false && w > 6 ? 2 : 1; for (let k = 0; k < s.data.length; k++) { const i = s.ix[k]; if (i < a || i > z) continue; const d = s.data[k]; if (d.open == null) continue; const x = Math.round(xOf(i)) + .5; g.strokeStyle = d.close >= d.open ? o.upColor : o.downColor; g.beginPath(); g.moveTo(x, y(d.high)); g.lineTo(x, y(d.low)); g.moveTo(x - tk, y(d.open)); g.lineTo(x, y(d.open)); g.moveTo(x, y(d.close)); g.lineTo(x + tk, y(d.close)); g.stroke(); } return; }
      if (s.type == 'fill') { let prev = null; for (let k = 0; k < s.data.length; k++) { const i = s.ix[k], d = s.data[k]; if (i < a - 1 || i > z + 1 || d.a == null || d.b == null || !isFinite(d.a) || !isFinite(d.b)) { prev = null; continue; } const cur = [xOf(i), y(d.a), y(d.b), d.color || o.color];
          if (prev) { g.fillStyle = cur[3]; g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(cur[0], cur[1]); g.lineTo(cur[0], cur[2]); g.lineTo(prev[0], prev[2]); g.closePath(); g.fill(); } prev = cur; } return; }
      if (s.type == 'hist') { const bw = Math.max(1, Math.min(w * .75, 40)), y0 = y(o.base ?? 0); for (let k = 0; k < s.data.length; k++) { const i = s.ix[k]; if (i < a || i > z) continue; const d = s.data[k]; if (d.value == null || !isFinite(d.value)) continue; const yv = y(d.value); g.fillStyle = d.color || o.color; g.fillRect(Math.round(xOf(i) - bw / 2), Math.min(yv, y0), Math.max(1, Math.round(bw)), Math.max(1, Math.abs(y0 - yv))); } return; }
      // line, area, baseline: build the visible path (breaks on missing values)
      const pts = []; for (let k = 0; k < s.data.length; k++) { const i = s.ix[k]; if (i < a - 1 || i > z + 1) continue; const d = s.data[k]; pts.push(d.value == null || !isFinite(d.value) ? null : [xOf(i), y(d.value), d.color]); }
      const color = o.color || o.lineColor || o.topLineColor, runs = []; let cur = []; for (const p of pts) { if (!p) { if (cur.length) runs.push(cur); cur = []; } else cur.push(p); } if (cur.length) runs.push(cur);
      const path = r => { g.beginPath(); g.moveTo(r[0][0], r[0][1]); for (let j = 1; j < r.length; j++) { if (o.lineType === 2 && j < r.length - 1) { const mx = (r[j][0] + r[j + 1][0]) / 2, my = (r[j][1] + r[j + 1][1]) / 2; g.quadraticCurveTo(r[j][0], r[j][1], mx, my); } else g.lineTo(r[j][0], r[j][1]); } };
      if (s.type == 'area') for (const r of runs) { if (r.length < 2) continue; path(r); g.lineTo(r[r.length - 1][0], PH()); g.lineTo(r[0][0], PH()); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, PH()); gr.addColorStop(0, o.topColor); gr.addColorStop(1, o.bottomColor); g.fillStyle = gr; g.fill(); }
      if (s.type == 'base') { const yb = y(o.baseValue.price); for (const r of runs) { if (r.length < 2) continue; for (const [top, c1, c2] of [[true, o.topFillColor1, o.topFillColor2], [false, o.bottomFillColor1, o.bottomFillColor2]]) { g.save(); g.beginPath(); top ? g.rect(0, 0, PW(), yb) : g.rect(0, yb, PW(), PH()); g.clip(); path(r); g.lineTo(r[r.length - 1][0], yb); g.lineTo(r[0][0], yb); g.closePath(); const gr = g.createLinearGradient(0, top ? 0 : yb, 0, top ? yb : PH()); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fill();
          g.strokeStyle = top ? o.topLineColor : o.bottomLineColor; g.lineWidth = o.lineWidth; glowOn(g.strokeStyle, 12); path(r); g.stroke(); glowOff(); g.restore(); } } return; }
      if (o.lineVisible !== false) { g.lineWidth = o.lineWidth || 2; g.lineJoin = 'round'; g.lineCap = 'round'; g.setLineDash(DASH[o.lineStyle || 0]);
        for (const r of runs) { if (r.some(p => p[2])) { for (let j = 1; j < r.length; j++) { g.strokeStyle = r[j][2] || color; glowOn(g.strokeStyle, 12); g.beginPath(); g.moveTo(r[j - 1][0], r[j - 1][1]); g.lineTo(r[j][0], r[j][1]); g.stroke(); } } else { g.strokeStyle = color; glowOn(color, 13); path(r); g.stroke(); } }
        glowOff(); g.setLineDash([]); }
      if (o.pointMarkersVisible) { g.fillStyle = color; const rad = o.pointMarkersRadius || 2; for (const r of runs) for (const p of r) { g.beginPath(); g.arc(p[0], p[1], rad, 0, 7); g.fill(); } }
    }
    const FIB = [0, .236, .382, .5, .618, .786, 1, 1.618];
    const mainScale = () => scales.right;
    function geom(d) { const R = mainScale(), x1 = xOfT(d.t1), y1 = yOf(R, d.p1), x2 = d.t2 != null ? xOfT(d.t2) : x1, y2 = d.p2 != null ? yOf(R, d.p2) : y1; return { x1, y1, x2, y2 }; }
    function drawDrawings() {
      const list = pend ? [...draws, pend] : draws, R = mainScale(), pw = PW(), ph = PH(); if (!list.length) return; g.font = `${opt.layout.fontSize}px ${opt.layout.fontFamily}`;
      for (const d of list) { const { x1, y1, x2, y2 } = geom(d), c = d.color || opt.drawColor || '#2962ff', on = d === sel || d === pend; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = on ? 2 : 1.5; g.setLineDash([]);
        if (d.k == 'trend' || d.k == 'ray') { let ex = x2, ey = y2; if (d.k == 'ray' && x2 !== x1) { ex = x2 > x1 ? pw : 0; ey = y1 + (y2 - y1) * (ex - x1) / (x2 - x1); } g.beginPath(); g.moveTo(x1, y1); g.lineTo(ex, ey); g.stroke(); }
        else if (d.k == 'hline') { g.beginPath(); g.moveTo(0, y1); g.lineTo(pw, y1); g.stroke(); g.textAlign = 'right'; g.fillText(fmt(d.p1), pw - 6, y1 - 8); g.textAlign = 'left'; }
        else if (d.k == 'vline') { g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, ph); g.stroke(); }
        else if (d.k == 'rect') { g.globalAlpha = .14; g.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); g.globalAlpha = 1; g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); }
        else if (d.k == 'fib') { const L = Math.min(x1, x2), Rr = Math.max(x1, x2, L + 40); FIB.forEach((f, j) => { const p = d.p2 + (d.p1 - d.p2) * f, y = yOf(R, p); g.globalAlpha = .9; g.strokeStyle = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86', '#2962ff'][j]; g.beginPath(); g.moveTo(L, y); g.lineTo(Rr, y); g.stroke(); g.fillStyle = g.strokeStyle; g.fillText(`${f} (${fmt(p)})`, L + 4, y - 7); g.globalAlpha = 1; });
          g.strokeStyle = c; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); }
        else if (d.k == 'long' || d.k == 'short') posDraw(d, x1, y1, x2, y2, R);
        if (on) for (const [hx, hy] of d.k == 'hline' ? [[pw / 2, y1]] : d.k == 'vline' ? [[x1, ph / 2]] : [[x1, y1], [x2, y2]]) { g.fillStyle = '#fff'; g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath(); g.arc(hx, hy, 4.5, 0, 7); g.fill(); g.stroke(); } }
    }
    const slOf = d => d.sl != null ? d.sl : d.p1 - (d.p2 - d.p1);
    function posDraw(d, x1, y1, x2, y2, R) { const L = Math.min(x1, x2), W = Math.max(Math.abs(x2 - x1), 60), ys = yOf(R, slOf(d)), lg = d.k == 'long', up = 'rgba(8,153,129,', dn = 'rgba(242,54,69,';
      g.fillStyle = up + '.2)'; g.fillRect(L, Math.min(y1, y2), W, Math.abs(y2 - y1)); g.fillStyle = dn + '.2)'; g.fillRect(L, Math.min(y1, ys), W, Math.abs(ys - y1));
      if (d.cur != null) { const yc = yOf(R, d.cur), xc = d.tc != null ? Math.min(L + W, Math.max(L, xOfT(d.tc))) : L + W, good = lg ? d.cur >= d.p1 : d.cur <= d.p1; g.fillStyle = (good ? up : dn) + '.32)'; g.fillRect(L, Math.min(y1, yc), xc - L, Math.abs(yc - y1));
        g.strokeStyle = 'rgba(160,165,180,.8)'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(L, y1); g.lineTo(xc, yc); g.stroke(); g.setLineDash([]); }
      g.strokeStyle = 'rgba(160,165,180,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y1); g.lineTo(L + W, y1); g.stroke();
      const pct = v => (Math.abs(v - d.p1) / d.p1 * 100).toFixed(2), rr = Math.abs(d.p2 - d.p1) / Math.max(1e-9, Math.abs(d.p1 - slOf(d))), cx = L + W / 2;
      const tag = (txt, y, bg) => { g.font = `${opt.layout.fontSize - 1}px ${opt.layout.fontFamily}`; const w = g.measureText(txt).width + 12; g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(cx - w / 2, y - 9, w, 18, 3) : g.rect(cx - w / 2, y - 9, w, 18); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, cx, y); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; };
      const tTop = y2 < ys ? y2 : ys, tBot = y2 < ys ? ys : y2;
      if (!d.done || d === sel) tag(`Target: ${fmt(d.p2)} (${pct(d.p2)}%)`, y2 + (y2 < y1 ? -12 : 12), up + '.95)'); if (!d.done || d === sel) tag(`Stop: ${fmt(slOf(d))} (${pct(slOf(d))}%)`, ys + (ys < y1 ? -12 : 12), dn + '.95)');
      if (d === sel || d === pend || (d.cur != null && !d.done)) tag(`${d.cur != null ? (d.done ? 'Closed' : 'Open') + ' P&L: ' + (d.pnl != null ? (d.pnl >= 0 ? '' : '-') + '$' + Math.abs(d.pnl).toFixed(2) : '') + ', ' : ''}${d.qty ? 'Qty: ' + d.qty + ', ' : ''}Risk/Reward Ratio: ${rr.toFixed(2)}`, y1 + (lg ? 12 : -12), d.cur != null ? ((lg ? d.cur >= d.p1 : d.cur <= d.p1) ? up + '.95)' : dn + '.95)') : 'rgba(80,90,110,.95)'); void tTop; void tBot; }
    function hit(px, py) { const R = mainScale(); for (let k = draws.length - 1; k >= 0; k--) { const d = draws[k], { x1, y1, x2, y2 } = geom(d);
        if (d.k == 'hline' && Math.abs(py - y1) < 6) return d; if (d.k == 'vline' && Math.abs(px - x1) < 6) return d;
        if (d.k == 'trend' || d.k == 'ray') { let ex = x2, ey = y2; if (d.k == 'ray' && x2 !== x1) { ex = x2 > x1 ? PW() : 0; ey = y1 + (y2 - y1) * (ex - x1) / (x2 - x1); } const dx = ex - x1, dy = ey - y1, L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2)); if (Math.hypot(px - x1 - u * dx, py - y1 - u * dy) < 6) return d; }
        if ((d.k == 'long' || d.k == 'short') && px >= Math.min(x1, x2) - 5 && px <= Math.min(x1, x2) + Math.max(60, Math.abs(x2 - x1)) + 5) { const ys = yOf(R, slOf(d)); if (py >= Math.min(y1, y2, ys) - 5 && py <= Math.max(y1, y2, ys) + 5) return d; }
        if ((d.k == 'rect' || d.k == 'fib') && px >= Math.min(x1, x2) - 5 && px <= Math.max(x1, x2, d.k == 'fib' ? x1 + 40 : x1) + 5 && py >= Math.min(y1, y2) - 5 && py <= Math.max(y1, y2) + 5) { if (d.k == 'rect') return d; for (const f of FIB) if (Math.abs(yOf(R, d.p2 + (d.p1 - d.p2) * f) - py) < 6) return d; } }
      return null; }
    const emitDraw = () => { for (const f of cbDraw) f(draws.map(d => ({ ...d }))); };
    const ptAt = (x, y) => ({ t: Math.round(tOfX(x)), p: pOf(mainScale(), y) });
    function drawMarkers(s, a, z) {
      const sc = scaleOf(s.scale), byI = new Map(), w = bs(); for (const m of s.markers) { const i = tIdx.get(m.time); if (i == null || i < a || i > z) continue; (byI.get(i) || byI.set(i, []).get(i)).push(m); }
      g.font = `600 ${opt.layout.fontSize}px ${opt.layout.fontFamily}`; g.textAlign = 'center';
      for (const [i, ms] of byI) { const k = s.ix.indexOf(i), d = s.data[k]; if (!d) continue; const hi = yOf(sc, d.high ?? d.value), lo = yOf(sc, d.low ?? d.value), x = xOf(i); let up = 0, dn = 0;
        for (const m of ms) { const sz = Math.max(4, Math.min(8, w * .6)) * (m.size || 1), below = m.position !== 'aboveBar', yy = below ? lo + 8 + dn : hi - 8 - up; g.fillStyle = m.color;
          if (m.shape == 'arrowUp' || m.shape == 'arrowDown') { const u = m.shape == 'arrowUp', y0 = below ? yy : yy - sz * 2; g.beginPath(); if (u) { g.moveTo(x, y0); g.lineTo(x + sz, y0 + sz); g.lineTo(x - sz, y0 + sz); } else { g.moveTo(x, y0 + sz * 2); g.lineTo(x + sz, y0 + sz); g.lineTo(x - sz, y0 + sz); } g.closePath(); g.fill(); g.fillRect(x - sz * .3, u ? y0 + sz : y0, sz * .6, sz); }
          else if (m.shape == 'circle') { g.beginPath(); g.arc(x, below ? yy + sz * .7 : yy - sz * .7, sz * .7, 0, 7); g.fill(); } else { g.fillRect(x - sz * .6, below ? yy : yy - sz * 1.2, sz * 1.2, sz * 1.2); }
          const used = sz * 2 + 4; if (m.text) { g.fillText(m.text, x, below ? yy + used + 6 : yy - used - 6); } if (below) dn += used + (m.text ? 16 : 0); else up += used + (m.text ? 16 : 0); } }
      g.textAlign = 'left';
    }
    function schedule() { if (!raf && !dead) raf = requestAnimationFrame(render); }
    function setRange(r, quiet) { const n = times.length, span = Math.max(4, Math.min(5000, r.to - r.from)); let from = r.from, to = from + span; const lo = -span + 3, hi = n - 1 + span - 3; if (to > hi) { to = hi; from = to - span; } if (from < lo) { from = lo; to = from + span; } range = { from, to }; schedule(); if (!quiet) for (const f of cbRange) f({ ...range }); }
    function resize() { const r = el.getBoundingClientRect(); W = Math.max(0, Math.round(r.width)); H = Math.max(0, Math.round(r.height)); dpr = window.devicePixelRatio || 1; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); if (range) for (const f of cbRange) f({ ...range }); schedule(); }
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    // input: pan with momentum, wheel / pinch zoom, crosshair, click, price-axis drag to stretch
    const pts = new Map(); let drag = null, pinch = null, vel = 0, inertia = 0, moved = false;
    const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const evAt = (x, y) => { ensure(); const i = Math.max(0, Math.min(times.length - 1, Math.round(iOf(x)))), sd = new Map(); for (const s of series) { const k = s.ix.indexOf(i); if (k >= 0) sd.set(s.api, s.data[k]); } return { time: times[i], logical: i, point: { x, y }, seriesData: sd }; };
    const hover = (x, y) => { if (!times.length) return; if (x < 0 || y < 0 || x > PW() || y > PH()) { if (cross) { cross = null; schedule(); for (const f of cbMove) f({ point: undefined, time: undefined, seriesData: new Map() }); } return; } const ev = evAt(x, y); cross = { i: ev.logical, y }; schedule(); for (const f of cbMove) f(ev); };
    let mv = null;
    cv.addEventListener('pointerdown', e => { cancelAnimationFrame(inertia); inertia = 0; cv.setPointerCapture(e.pointerId); const p = local(e); pts.set(e.pointerId, p); moved = false; ensure(); fit();
      if (p.x <= PW() && p.y <= PH() && pts.size === 1) {
        if (tool) { const a = ptAt(p.x, p.y); if (pend) { pend.t2 = a.t; pend.p2 = a.p; draws.push(pend); sel = pend; pend = null; tool = null; emitDraw(); schedule(); mv = { done: true }; return; }
          if (tool == 'hline' || tool == 'vline') { const d = { id: Date.now().toString(36), k: tool, t1: a.t, p1: a.p }; draws.push(d); sel = d; tool = null; emitDraw(); schedule(); mv = { done: true }; return; }
          pend = { id: Date.now().toString(36), k: tool, t1: a.t, p1: a.p, t2: a.t, p2: a.p }; mv = { create: true, x: p.x, y: p.y }; schedule(); return; }
        const h = hit(p.x, p.y); if (h) { sel = h; const a = ptAt(p.x, p.y); mv = { d: h, a, o: { t1: h.t1, p1: h.p1, t2: h.t2, p2: h.p2, sl: h.sl } }; cv.style.cursor = 'grabbing'; schedule(); return; } if (sel) { sel = null; schedule(); } }
      if (pts.size === 2) { const [A, B] = [...pts.values()]; pinch = { d: Math.hypot(A.x - B.x, A.y - B.y), r: { ...range }, cx: (A.x + B.x) / 2 }; drag = null; return; }
      drag = { x: p.x, y: p.y, r: { ...range }, axis: p.x > PW(), t: performance.now(), lx: p.x, lt: performance.now(), sc: p.x > PW() ? { lo: scales.right.lo, hi: scales.right.hi } : null, cur: cv.style.cursor = p.x > PW() ? 'ns-resize' : 'grabbing', pv: { lo: tf(scales.right, scales.right.lo), hi: tf(scales.right, scales.right.hi) }, vy: false }; vel = 0; });
    cv.addEventListener('pointermove', e => { const p = local(e); if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pend && !mv?.done) { const a = ptAt(p.x, p.y); pend.t2 = a.t; pend.p2 = a.p; hover(p.x, p.y); return; }
      if (mv?.d && pts.has(e.pointerId)) { const a = ptAt(p.x, p.y), dt = a.t - mv.a.t, dp = a.p - mv.a.p, o = mv.o; mv.d.t1 = o.t1 + dt; mv.d.p1 = o.p1 + dp; if (o.t2 != null) { mv.d.t2 = o.t2 + dt; mv.d.p2 = o.p2 + dp; } if (o.sl != null) mv.d.sl = o.sl + dp; mv.moved = true; schedule(); return; }
      if (pinch && pts.size === 2) { const [A, B] = [...pts.values()], d = Math.hypot(A.x - B.x, A.y - B.y), k = pinch.d / Math.max(10, d), span = (pinch.r.to - pinch.r.from) * k, at = pinch.r.from + pinch.cx / PW() * (pinch.r.to - pinch.r.from); setRange({ from: at - (pinch.cx / PW()) * span, to: at + (1 - pinch.cx / PW()) * span }); moved = true; return; }
      if (drag) { const dx = p.x - drag.x, dy = p.y - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (!moved) return;
        if (drag.axis) { const R = scales.right, mid = (drag.sc.lo + drag.sc.hi) / 2, k = Math.exp(dy / 150), half = (drag.sc.hi - drag.sc.lo) / 2 * k; R.auto = false; R.min = mid - half; R.max = mid + half; schedule(); return; }
        const now = performance.now(); vel = (p.x - drag.lx) / Math.max(1, now - drag.lt); drag.lx = p.x; drag.lt = now; const sh = dx / bs(); setRange({ from: drag.r.from - sh, to: drag.r.to - sh });
          // vertical pan like TradingView: dragging up or down moves the price scale too (auto-scale switches off; double-click the price axis or press Auto to reset)
          if (drag.vy || Math.abs(dy) > 8) { const R = scales.right, hh = PH() * (1 - R.m.top - R.m.bottom), d = dy / Math.max(1, hh) * (drag.pv.hi - drag.pv.lo); drag.vy = true; R.auto = false; R.min = itf(R, drag.pv.lo + d); R.max = itf(R, drag.pv.hi + d); schedule(); } if (e.pointerType !== 'mouse') { cross = null; } return; }
      if (e.pointerType === 'mouse') hover(p.x, p.y); });
    const up = e => { const p = local(e); pts.delete(e.pointerId); cv.style.cursor = tool ? 'crosshair' : ''; if (pinch) { if (pts.size < 2) pinch = null; return; }
      if (mv) { const m = mv; mv = null; drag = null; if (m.create && pend && Math.hypot(p.x - m.x, p.y - m.y) > 8) { draws.push(pend); sel = pend; pend = null; tool = null; emitDraw(); schedule(); } else if (m.d && m.moved) emitDraw(); return; }
      if (drag && !moved) { const ev = evAt(p.x, p.y); if (p.x <= PW() && p.y <= PH()) { for (const f of cbClick) f(ev); if (e.pointerType !== 'mouse') hover(p.x, p.y); } }
      else if (drag && !drag.axis && Math.abs(vel) > .15 && performance.now() - drag.lt < 80) { let v = vel * 16; const step = () => { v *= .94; if (Math.abs(v) < .3) { inertia = 0; return; } const sh = v / bs(); setRange({ from: range.from - sh, to: range.to - sh }); inertia = requestAnimationFrame(step); }; inertia = requestAnimationFrame(step); } // momentum: a flick keeps the chart gliding
      drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) hover(-1, -1); });
    const onKey = e => { if (dead) return; if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { draws = draws.filter(d => d !== sel); sel = null; emitDraw(); schedule(); e.preventDefault(); } if (e.key === 'Escape' && (pend || tool)) { pend = null; tool = null; schedule(); for (const f of cbDraw) f(null); } };
    window.addEventListener('keydown', onKey);
    cv.addEventListener('dblclick', e => { const p = local(e); if (p.x > PW()) { scales.right.auto = true; scales.right.min = scales.right.max = null; schedule(); } });
    cv.addEventListener('wheel', e => { e.preventDefault(); ensure(); const p = local(e); if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const sh = e.deltaX / bs(); setRange({ from: range.from + sh, to: range.to + sh }); return; }
      const k = Math.exp(e.deltaY * .0015), fx = Math.max(0, Math.min(1, p.x / PW())), at = range.from + fx * (range.to - range.from), span = (range.to - range.from) * k; setRange({ from: at - fx * span, to: at + (1 - fx) * span }); }, { passive: false });
    // the public API
    function addSeries(type, so = {}) {
      const s = { type, o: merge(JSON.parse(JSON.stringify(DEF[type])), so), data: [], ix: [], lines: [], markers: [], scale: so.priceScaleId || 'right', on: true };
      if (so.priceFormat?.type === 'volume') s.vol = true; scaleOf(s.scale);
      s.api = { setData: d => { s.data = d.slice(); dirtyT = true; if (s.scale == 'right' && range) { ensure(); } schedule(); },
        update: d => { const L = s.data[s.data.length - 1]; if (L && L.time === d.time) s.data[s.data.length - 1] = d; else { const atEnd = range && range.to >= times.length - 1; s.data.push(d); dirtyT = true; if (atEnd) { ensure(); setRange({ from: range.from + 1, to: range.to + 1 }, true); } } schedule(); },
        applyOptions: x => { merge(s.o, x); schedule(); }, options: () => s.o,
        priceScale: () => scaleApi(s.scale),
        createPriceLine: pl => { const h = { ...pl, applyOptions: x => { Object.assign(h, x); schedule(); } }; s.lines.push(h); schedule(); return h; },
        removePriceLine: h => { s.lines = s.lines.filter(x => x !== h); schedule(); },
        setMarkers: m => { s.markers = m || []; schedule(); },
        priceToCoordinate: p => { ensure(); fit(); return p == null || !isFinite(p) ? null : yOf(scaleOf(s.scale), p); },
        coordinateToPrice: y => { ensure(); fit(); return pOf(scaleOf(s.scale), y); } };
      series.push(s); return s.api;
    }
    const scaleApi = id => ({ applyOptions: x => { const sc = scaleOf(id); if (x.scaleMargins) sc.m = { ...x.scaleMargins }; if (x.mode != null) sc.mode = x.mode; if (x.autoScale) { sc.auto = true; sc.min = sc.max = null; } schedule(); }, width: () => AX });
    return {
      applyOptions: x => { merge(opt, x); if (x.rightPriceScale?.scaleMargins) scales.right.m = { ...x.rightPriceScale.scaleMargins }; schedule(); },
      remove: () => { dead = true; window.removeEventListener('keydown', onKey); ro.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(inertia); cv.remove(); },
      addCandlestickSeries: o => addSeries('candle', o), addBarSeries: o => addSeries('bar', o), addLineSeries: o => addSeries('line', o), addAreaSeries: o => addSeries('area', o), addBaselineSeries: o => addSeries('base', o), addHistogramSeries: o => addSeries('hist', o), addFillSeries: o => addSeries('fill', o),
      removeSeries: api => { const k = series.findIndex(s => s.api === api); if (k < 0) throw new Error('unknown series'); series.splice(k, 1); dirtyT = true; schedule(); },
      subscribeCrosshairMove: f => cbMove.push(f), subscribeClick: f => cbClick.push(f),
      priceScale: id => scaleApi(id || 'right'),
      timeScale: () => ({ fitContent: () => { ensure(); const n = times.length; setRange({ from: -0.5, to: n - 0.5 + 2 }); }, setVisibleLogicalRange: r => { ensure(); setRange(r); }, getVisibleLogicalRange: () => range ? { ...range } : null,
        subscribeVisibleLogicalRangeChange: f => cbRange.push(f), applyOptions: x => { merge(opt.timeScale, x); schedule(); } }),
      setTool: k => { tool = k || null; pend = null; cv.style.cursor = tool ? 'crosshair' : ''; schedule(); }, getTool: () => tool,
      setDrawings: l => { draws = (l || []).map(d => ({ ...d })); sel = null; pend = null; schedule(); }, subscribeDrawings: f => cbDraw.push(f),
      deleteSelected: () => { if (!sel) return false; draws = draws.filter(d => d !== sel); sel = null; emitDraw(); schedule(); return true; },
      timeToCoordinate: t => { ensure(); return xOfT(t); }, coordinateToTime: x => { ensure(); return tOfX(x); },
      takeScreenshot: () => { render(); const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c; } };
  }
  window.MimicCharts = { createChart };
})();
