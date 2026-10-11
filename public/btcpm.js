// BTC tab: a Polymarket-style market card (header, price to beat vs current price, countdown ring, live chart with Live / 1D / 7D, recent results, Up / Down prices).
// Data: the runner's once-a-second snapshot (live price, window start price, Polymarket US prices) polled by btcbot.js, plus /api/btc ops chart and past.
let btcTf = '15m', btcRng = 'live', btcTicks = [], btcOff = 0, btcRaf = 0, btcCh = {}, btcPast = {}, pmHover = null, pmLastDraw = 0;
const PMLEN = { '15m': 900, '1h': 3600 }, PMORG = '#f7931a', PMUP = '#12a150', PMDN = '#ef4136';
const pmNow = () => Date.now() + btcOff;
const pmWin = () => ((typeof btcS == 'object' && btcS && btcS.btclive && btcS.btclive.windows) || []).find(w => w.tf == btcTf);
const pmUsd = (x, d = 2) => Number.isFinite(x) ? '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-';
const pmClock = (t, secs = true) => { const d = new Date(t); let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, '0')}${secs ? ':' + String(d.getSeconds()).padStart(2, '0') : ''}${ap}`; };
const pmET = (t, o) => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', ...o });
const pmNice = x => { const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
const pmStop = () => { cancelAnimationFrame(btcRaf); btcRaf = 0; };

function btcFeed(L, now) { // every poll: keep the clock offset and a rolling list of prices [server time, price]
  if (now) btcOff = now - Date.now(); if (!L) return; if (L.h && L.h.length && !btcTicks.length) btcTicks = L.h.map(p => p.slice());
  if (L.t && L.S > 0 && (!btcTicks.length || L.t > btcTicks[btcTicks.length - 1][0])) btcTicks.push([L.t, L.S]);
  const cut = pmNow() - 6 * 6e4; while (btcTicks.length && btcTicks[0][0] < cut) btcTicks.shift();
}

/* ---------- the card ---------- */
const PMB = '<svg width=26 height=26 viewBox="0 0 32 32" fill=none stroke="#fff" stroke-width=3 stroke-linecap=square><path d="M12 8v16M12 9.5h5.2a3.2 3.2 0 0 1 0 6.4H12M12 15.9h6a3.4 3.4 0 0 1 0 6.8H12M15 5.5v3M18.6 5.5v3M15 23.5v3M18.6 23.5v3"/></svg>';
const PMARR = up => `<svg width=11 height=11 viewBox="0 0 12 12" fill=none stroke="#fff" stroke-width=2.2 stroke-linecap=round stroke-linejoin=round>${up ? '<path d="M6 10V2.5M2.7 5.7 6 2.4l3.3 3.3"/>' : '<path d="M6 2v7.5M2.7 6.3 6 9.6l3.3-3.3"/>'}</svg>`;
function btcPmHtml() {
  return `<div class="seg" id=pmtf style="margin:16px 0 10px"><button data-v=15m class="${btcTf == '15m' ? 'on' : ''}">15 minutes</button><button data-v=1h class="${btcTf == '1h' ? 'on' : ''}">1 hour</button></div>
  <div class=pm id=btcpm>
    <div class=pm-top><div class=pm-ico>${PMB}</div><div style="min-width:0"><div class=pm-meta id=pmmeta>&nbsp;</div><div class=pm-title id=pmtitle>&nbsp;</div></div>
      <div class=pm-act><button id=pmlink aria-label="Copy link"><svg width=20 height=20 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2.2 stroke-linecap=round stroke-linejoin=round><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1-1"/></svg></button>
        <button id=pmshare aria-label="Share"><svg width=20 height=20 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2.2 stroke-linecap=round stroke-linejoin=round><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></svg></button></div></div>
    <div class=pm-brand><svg width=18 height=18 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 stroke-linejoin=round><path d="M4 8 12 3l8 5v8l-8 5-8-5z"/><path d="M4 8l8 5 8-5M12 13v8"/></svg>Polymarket</div>
    <div class=pm-stats><div><div class=pm-k>Price to beat</div><div class=pm-v id=pmtarget style="color:#c7cbd1">-</div></div><div class=pm-sep></div>
      <div><div class=pm-k>Current price <span id=pmdelta></span></div><div class=pm-v id=pmcur>-</div></div>
      <div class=pm-timer><svg viewBox="0 0 66 38" fill=none><path d="M33 2H19a17 17 0 0 0 0 34h28a17 17 0 0 0 0-34z" stroke="#2a2e35" stroke-width=3 pathLength=100 transform="translate(0 0)"/><path id=pmring d="M33 2H19a17 17 0 0 0 0 34h28a17 17 0 0 0 0-34H33z" stroke="#f5b800" stroke-width=3 stroke-linecap=round pathLength=100 stroke-dasharray="0 100"/></svg><b id=pmleft>--:--</b></div></div>
    <div class=pm-chart><canvas id=pmcv></canvas></div>
    <div class=pm-foot><div class=pm-past id=pmpast>Past</div><div class=pm-rng id=pmrng><button data-v=live class="${btcRng == 'live' ? 'on' : ''}">Live</button><button data-v=1d class="${btcRng == '1d' ? 'on' : ''}">1D</button><button data-v=7d class="${btcRng == '7d' ? 'on' : ''}">7D</button></div></div>
    <div class=pm-market><span id=pmname>BTC Up or Down</span><div class=row style="gap:12px"><button class="pm-btn up" id=pmup>Up</button><button class="pm-btn dn" id=pmdn>Down</button></div></div>
  </div>`;
}
function btcPmInit() { // after the page is built: wire the controls, load history, start the draw loop
  const root = $('#btcpm'); if (!root) return;
  $$('#pmtf button').forEach(b => b.onclick = () => { if (b.dataset.v == btcTf) return; btcTf = b.dataset.v; pmHover = null; $$('#pmtf button').forEach(x => x.classList.toggle('on', x == b)); pmLoadPast(); btcPm(true); });
  $$('#pmrng button').forEach(b => b.onclick = () => { btcRng = b.dataset.v; pmHover = null; $$('#pmrng button').forEach(x => x.classList.toggle('on', x == b)); if (btcRng != 'live') pmLoadRange(btcRng); pmDraw(); });
  const url = () => location.href, copy = async () => { try { await navigator.clipboard.writeText(url()); toast('Link copied'); } catch (e) { toast('Copy the address bar to share this page'); } };
  $('#pmlink').onclick = copy; $('#pmshare').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'BTC Up or Down', url: url() }); } catch (e) {} } else copy(); };
  const cv = $('#pmcv'); cv.onpointermove = e => { const r = cv.getBoundingClientRect(); pmHover = { x: e.clientX - r.left }; if (btcRng != 'live') pmDraw(); }; cv.onpointerleave = () => { pmHover = null; if (btcRng != 'live') pmDraw(); };
  if (btcRng != 'live') pmLoadRange(btcRng); pmLoadPast(); btcPm(true); pmStop(); btcRaf = requestAnimationFrame(pmLoop);
}
function pmLoop(ts) { btcRaf = 0; if (!$('#pmcv')) return; if (btcRng == 'live' && document.visibilityState == 'visible' && ts - pmLastDraw > 30) { pmLastDraw = ts; pmDraw(); } btcRaf = requestAnimationFrame(pmLoop); }
async function pmLoadRange(r) { const c = btcCh[r]; if (c && Date.now() - c.t < 6e4) return; try { const j = await bbapi('chart&range=' + r); btcCh[r] = { t: Date.now(), pts: j.pts }; if (btcRng == r) pmDraw(); } catch (e) {} }
async function pmLoadPast() {
  const tf = btcTf, c = btcPast[tf], w = pmWin(); if (c && Date.now() - c.t < 6e4 && (!w || c.start == w.start)) return pmPast();
  try { const j = await bbapi('past&tf=' + tf); btcPast[tf] = { t: Date.now(), start: w ? w.start : 0, rows: j.past }; } catch (e) { if (!btcPast[tf]) btcPast[tf] = { t: Date.now(), start: 0, rows: [] }; } pmPast();
}
function pmPast() { const el = $('#pmpast'); if (!el) return; const rows = (btcPast[btcTf] || {}).rows || []; el.innerHTML = 'Past' + rows.map(r => `<span class=pm-dot style="background:${r.up ? PMUP : '#e0312b'}" title="${new Date(r.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}: ${r.up ? 'Up' : 'Down'} (${pmUsd(r.s0)} to ${pmUsd(r.s1)})">${PMARR(r.up)}</span>`).join(''); }

/* ---------- text, timer, prices (every poll) ---------- */
function btcPm(force) {
  const root = $('#btcpm'); if (!root) return; const w = pmWin(), now = pmNow(), len = PMLEN[btcTf], last = btcTicks.length ? btcTicks[btcTicks.length - 1][1] : w ? w.S : NaN;
  const name = `BTC Up or Down ${btcTf == '15m' ? '15 Minutes' : '1 Hour'}`;
  if (force || (w && root.dataset.start != String(w.start))) { // title and dates only change with the window
    $('#pmtitle').textContent = name; $('#pmname').textContent = name;
    if (w) { root.dataset.start = w.start; $('#pmmeta').textContent = `${btcTf == '15m' ? '15 Minutes' : 'Hourly'} · Up/Down · ${btcTf} · ${pmET(w.start, { month: 'short', day: 'numeric' })}, ${pmET(w.start, { hour: 'numeric', minute: '2-digit' })} – ${pmET(w.end, { hour: 'numeric', minute: '2-digit' })} ET`; if (btcPast[btcTf] && btcPast[btcTf].start != w.start) pmLoadPast(); }
    else $('#pmmeta').textContent = `${btcTf == '15m' ? '15 Minutes' : 'Hourly'} · Up/Down · ${btcTf}`; }
  const beat = w && w.S0 > 0 ? w.S0 : NaN, diff = last - beat, up = !(diff < 0);
  $('#pmtarget').textContent = Number.isFinite(beat) ? pmUsd(beat) : '…'; const cur = $('#pmcur'); cur.textContent = Number.isFinite(last) ? pmUsd(last) : '-'; cur.style.color = Number.isFinite(diff) ? (up ? '#1fb865' : PMDN) : '';
  $('#pmdelta').innerHTML = Number.isFinite(diff) ? `<span style="color:${up ? '#1fb865' : PMDN}">${up ? '▲' : '▼'} ${pmUsd(Math.abs(diff))} ${Math.abs(diff / beat * 100).toFixed(2)}%</span>` : '';
  const left = w ? Math.max(0, (w.end - now) / 1e3) : NaN, f = Number.isFinite(left) ? Math.min(1, left / Math.min(len, 3600)) : 0;
  $('#pmleft').textContent = Number.isFinite(left) ? (left >= 3600 ? `${Math.floor(left / 3600)}:${String(Math.floor(left % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}` : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`) : '--:--'; $('#pmring').setAttribute('stroke-dasharray', `${f * 100} 100`);
  const pc = x => Number.isFinite(x) ? Math.round(x * 100) + '%' : '-'; $('#pmup').textContent = `Up ${pc(w && w.upAsk)}`; $('#pmdn').textContent = `Down ${pc(w && w.downAsk)}`;
  if (btcRng != 'live') pmDraw();
}

/* ---------- the chart ---------- */
function pmSeries() {
  const now = pmNow(); let pts, x0; if (btcRng == 'live') { x0 = now - 35e3; pts = btcTicks.filter(p => p[0] >= x0 - 4e3).map(p => p.slice()); }
  else { const c = btcCh[btcRng]; if (!c || !c.pts.length) return null; pts = c.pts.map(p => p.slice()); x0 = pts[0][0]; if (btcTicks.length) pts.push([Math.max(btcTicks[btcTicks.length - 1][0], pts[pts.length - 1][0] + 1), btcTicks[btcTicks.length - 1][1]]); }
  if (!pts.length) return null; pts.push([now, pts[pts.length - 1][1]]); return { pts, x0, x1: now }; // the price holds until the next tick, so the right edge is always "now"
}
function pmCurve(g, P) { // monotone cubic through the points: rounded stairs when the price jumps once a second, like Polymarket's live line
  const n = P.length; if (n < 2) return; const dx = [], m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0] || 1e-6; m[i] = (P[i + 1][1] - P[i][1]) / dx[i]; } t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
  g.moveTo(P[0][0], P[0][1]); for (let i = 0; i < n - 1; i++) { const h = dx[i]; g.bezierCurveTo(P[i][0] + h / 3, P[i][1] + t[i] * h / 3, P[i + 1][0] - h / 3, P[i + 1][1] - t[i + 1] * h / 3, P[i + 1][0], P[i + 1][1]); }
}
const pmRR = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
function pmDraw() {
  const cv = $('#pmcv'); if (!cv) return; const dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  if (cv.width != Math.round(W * dpr) || cv.height != Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.textBaseline = 'middle'; g.font = '12px Geist,system-ui,sans-serif';
  const w = pmWin(), beat = w && w.S0 > 0 ? w.S0 : NaN, S = pmSeries(), L = 0, R = 64, T = 8, B = 30, PW = W - L - R, PH = H - T - B, stale = btcRng == 'live' && (!btcTicks.length || pmNow() - btcTicks[btcTicks.length - 1][0] > 20e3);
  if (!S || S.pts.length < 2) { g.fillStyle = '#8c929b'; g.textAlign = 'center'; g.fillText(btcRng == 'live' ? 'Waiting for live prices…' : 'Loading…', W / 2, H / 2); return; }
  const ys = S.pts.map(p => p[1]); let mn = Math.min(...ys), mx = Math.max(...ys); const span = Math.max(mx - mn, btcRng == 'live' ? 2.4 : mx * .002); let lo = mn - span * .55, hi = mx + span * .14;
  if (Number.isFinite(beat) && beat >= lo - span * 1.5 && beat <= hi + span * 1.5) { lo = Math.min(lo, beat - span * .15); hi = Math.max(hi, beat + span * .15); }
  const X = t => L + (t - S.x0) / (S.x1 - S.x0) * PW, Y = p => T + (hi - p) / (hi - lo) * PH, P = S.pts.map(p => [X(p[0]), Y(p[1])]);
  // dotted grid + price labels on the right
  const step = pmNice((hi - lo) / 3); g.setLineDash([2, 5]); g.strokeStyle = '#2a2e35'; g.lineWidth = 1; g.fillStyle = '#7d8590'; g.textAlign = 'left';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { const y = Math.round(Y(v)) + .5; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW + 8, y); g.stroke(); g.fillText(pmUsd(v, step < 1 ? 2 : 0), L + PW + 14, y); } g.setLineDash([]);
  // time axis
  g.fillStyle = '#7d8590'; g.textAlign = 'center'; const ticks = []; if (btcRng == 'live') { for (let t = Math.ceil(S.x0 / 1e4) * 1e4; t <= S.x1; t += 1e4) ticks.push([t, pmClock(t)]); }
  else if (btcRng == '1d') { const d = new Date(S.x0); d.setMinutes(0, 0, 0); d.setHours(Math.ceil((d.getHours() + (S.x0 > d.getTime() ? 1 : 0)) / 4) * 4); for (; d.getTime() <= S.x1; d.setHours(d.getHours() + 4)) if (d.getTime() >= S.x0) ticks.push([d.getTime(), pmClock(d.getTime(), false)]); }
  else { const d = new Date(S.x0); d.setHours(24, 0, 0, 0); for (; d.getTime() <= S.x1; d.setDate(d.getDate() + 1)) ticks.push([d.getTime(), d.toLocaleDateString([], { month: 'short', day: 'numeric' })]); }
  for (const [t, s] of ticks) { const x = X(t); if (x > 24 && x < PW - 24) g.fillText(s, x, H - 9); }
  // the line, with the area under it
  g.save(); g.beginPath(); g.rect(L, 0, PW + 1, H - B + 4); g.clip(); const col = stale ? '#8c929b' : PMORG;
  g.beginPath(); pmCurve(g, P); g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  g.lineTo(P[P.length - 1][0], T + PH); g.lineTo(P[0][0], T + PH); g.closePath(); const gr = g.createLinearGradient(0, T, 0, T + PH); gr.addColorStop(0, stale ? 'rgba(140,146,155,.22)' : 'rgba(247,147,26,.26)'); gr.addColorStop(1, 'rgba(247,147,26,0)'); g.fillStyle = gr; g.fill(); g.restore();
  // the price to beat: dashed line (pinned to the bottom or top edge when it is far from the price) with its label
  if (Number.isFinite(beat)) { const inR = beat >= lo && beat <= hi, y = inR ? Y(beat) : beat < lo ? T + PH : T; g.setLineDash([5, 5]); g.strokeStyle = '#555b64'; g.beginPath(); g.moveTo(L, Math.round(y) + .5); g.lineTo(L + PW + 8, Math.round(y) + .5); g.stroke(); g.setLineDash([]);
    const txt = `${pmUsd(beat)} target`; g.font = '600 13px Geist,system-ui,sans-serif'; const tw = g.measureText(txt).width, bw = tw + 62, bx = L + PW / 2 - bw / 2, by = y - 14; g.fillStyle = '#16191e'; g.strokeStyle = '#2d3138'; pmRR(g, bx, by, bw, 28, 14); g.fill(); g.stroke();
    g.fillStyle = PMORG; g.beginPath(); g.arc(bx + 17, y, 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 12px Geist,system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('B', bx + 17, y + .5); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.lineCap = 'butt'; g.beginPath(); g.moveTo(bx + 15.4, y - 8); g.lineTo(bx + 15.4, y - 5.5); g.moveTo(bx + 18.6, y - 8); g.lineTo(bx + 18.6, y - 5.5); g.moveTo(bx + 15.4, y + 5.5); g.lineTo(bx + 15.4, y + 8); g.moveTo(bx + 18.6, y + 5.5); g.lineTo(bx + 18.6, y + 8); g.stroke(); g.font = '600 13px Geist,system-ui,sans-serif'; g.fillStyle = '#f3f4f6'; g.textAlign = 'left'; g.fillText(txt, bx + 32, y + .5); g.strokeStyle = '#8c929b'; g.lineWidth = 1.6; g.lineCap = 'round'; const cx = bx + bw - 17; g.beginPath(); g.moveTo(cx - 4, y - 4); g.lineTo(cx, y - 1); g.lineTo(cx + 4, y - 4); g.moveTo(cx - 4, y + 1); g.lineTo(cx, y + 4); g.lineTo(cx + 4, y + 1); g.stroke(); g.font = '12px Geist,system-ui,sans-serif'; }
  // the latest price: dot with a pulsing ring
  const e = P[P.length - 1]; if (!stale) { const ph = (performance.now() % 1800) / 1800; g.globalAlpha = (1 - ph) * .45; g.strokeStyle = PMORG; g.lineWidth = 1.5; g.beginPath(); g.arc(e[0], e[1], 4 + ph * 9, 0, 7); g.stroke(); g.globalAlpha = 1; } g.fillStyle = col; g.beginPath(); g.arc(e[0], e[1], 4.2, 0, 7); g.fill();
  // hover: nearest price point
  if (pmHover && pmHover.x >= L && pmHover.x <= L + PW) { const t = S.x0 + (pmHover.x - L) / PW * (S.x1 - S.x0); let k = 0; for (let i = 0; i < S.pts.length; i++) if (S.pts[i][0] <= t) k = i; const p = S.pts[k], x = X(p[0]), y = Y(p[1]); g.strokeStyle = '#4a4f58'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    const txt = `${pmUsd(p[1])}  ·  ${pmClock(p[0], btcRng == 'live')}`; g.font = '600 12px Geist,system-ui,sans-serif'; const tw = g.measureText(txt).width + 18, bx = Math.min(Math.max(x - tw / 2, L), L + PW - tw); g.fillStyle = '#1b1e24'; g.strokeStyle = '#33373f'; pmRR(g, bx, T + 2, tw, 24, 8); g.fill(); g.stroke(); g.fillStyle = '#f3f4f6'; g.textAlign = 'left'; g.fillText(txt, bx + 9, T + 14.5); }
}
addEventListener('resize', () => { if ($('#pmcv')) pmDraw(); });
