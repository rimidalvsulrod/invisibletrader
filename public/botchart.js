// Shared bot charts. bcChart: candles (or a line) with the strategy drawn on top (levels, zones, markers, moving lines) and indicator
// panes underneath, as SVG with a crosshair readout. bcProfit*: the profit curve every bot gets. Bars are { t, o, h, l, c, v }, ascending.
const BCUP = 'var(--up)', BCDN = 'var(--down)', BCREG = new Map();
const bcNum = v => v == null || !isFinite(v) ? '-' : Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : Math.abs(v) >= 100 ? v.toFixed(2) : Math.abs(v) >= 1 ? v.toFixed(3) : Math.abs(v) >= .01 ? v.toFixed(4) : v === 0 ? '0' : v.toPrecision(3);
const bcIdx = (bars, t) => { // nearest bar to a time
  let lo = 0, hi = bars.length - 1; if (!bars.length || t <= bars[0].t) return 0; if (t >= bars[hi].t) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bars[m].t <= t) lo = m; else hi = m; } return t - bars[lo].t <= bars[hi].t - t ? lo : hi;
};
const bcLegend = items => `<div class="bcleg">${items.filter(Boolean).map(([c, t, k]) => `<span><i style="${k == 'box' ? 'height:9px;opacity:.55' : k == 'tri' ? 'width:0;height:0;background:none;border:5px solid transparent;border-bottom:8px solid ' + c + ';border-top:0' : ''};background:${k == 'tri' ? 'none' : c}"></i>${t}</span>`).join('')}</div>`;
const W0 = el => (el.clientWidth || 720) < 520 ? 66 : 98;
function bcChart(el, S) {
  if (!el) return; BCREG.set(el.id || el, { el, S });
  const B = S.bars || [], n = B.length; el.classList.add('chart');
  if (n < 2) { el.innerHTML = `<div class=empty style="padding:30px 0">${S.empty || 'Not enough data yet'}</div>`; return; }
  const W = el.clientWidth || 720, L = 6, R = W0(el), T = 8, AX = 20, PW = W - L - R, step = PW / n, bw = Math.max(1, Math.min(14, step * .72)), X = i => L + (i + .5) * step;
  const panes = (S.panes || []).filter(p => p), H = S.h || 300, GAP = 22, total = T + H + panes.reduce((a, p) => a + GAP + (p.h || 70), 0) + AX;
  const candle = S.style ? S.style == 'candle' : B.some(b => b.o !== b.c || b.h !== b.l), at = v => v;
  // main y range: bars + anything flagged to fit
  let lo = Infinity, hi = -Infinity; for (const b of B) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
  for (const o of S.overlays || []) for (const v of o.pts || []) if (v != null && isFinite(v)) { if (S.fitOverlays) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
  for (const l of S.levels || []) if (l.fit && l.y != null) { lo = Math.min(lo, l.y); hi = Math.max(hi, l.y); } for (const z of S.zones || []) if (z.fit) { lo = Math.min(lo, z.y0, z.y1); hi = Math.max(hi, z.y0, z.y1); }
  const pd = (hi - lo) * .06 || Math.abs(hi) * .01 || 1; lo -= pd; hi += pd; const Y = v => T + (hi - v) / (hi - lo) * H;
  const out = [], tag = (y, txt, col, bg) => { out.push(`<g><rect x="${W - R + 2}" y="${y - 8}" width="${R - 4}" height="16" rx="3" fill="${bg || 'var(--bg)'}" opacity=".92"/><text x="${W - R + 5}" y="${y + 4}" font-size="10.5" fill="${col || 'var(--mut)'}" style="font-variant-numeric:tabular-nums">${txt}</text></g>`); };
  // vertical shading spans (behind everything)
  const colH = (p0, p1) => ({ y0: p0, y1: p1 }); const bottom = T + H + panes.reduce((a, p) => a + GAP + (p.h || 70), 0);
  for (const s of S.shade || []) { const x0 = L + Math.max(0, s.i0) * step, x1 = L + Math.min(n, s.i1 + 1) * step; if (x1 > x0) out.push(`<rect x="${x0.toFixed(1)}" y="${T}" width="${(x1 - x0).toFixed(1)}" height="${bottom - T}" fill="${s.color || 'rgba(127,127,127,.08)'}"/>`); }
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); out.push(`<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${W - R + 5}" y="${y + 4}" font-size="10.5" fill="var(--mut2)" style="font-variant-numeric:tabular-nums">${(S.yfmt || bcNum)(v)}</text>`); }
  for (const z of S.zones || []) { const x0 = L + (z.i0 ?? 0) * step, x1 = L + ((z.i1 ?? n - 1) + 1) * step, ya = Y(Math.max(z.y0, z.y1)), yb = Y(Math.min(z.y0, z.y1)); out.push(`<rect x="${x0.toFixed(1)}" y="${ya.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${Math.max(1, yb - ya).toFixed(1)}" fill="${z.color || 'rgba(127,127,127,.1)'}"/>`); }
  // time ticks
  const tf = S.tf || (t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), tk = Math.max(1, Math.round(n / Math.max(3, Math.floor(PW / 90))));
  for (let i = 0; i < n; i += tk) { out.push(`<line x1="${X(i)}" x2="${X(i)}" y1="${T}" y2="${bottom}" stroke="var(--grid)"/><text x="${X(i)}" y="${bottom + 14}" font-size="10.5" fill="var(--mut2)" text-anchor="${X(i) < 34 ? 'start' : 'middle'}">${tf(B[i].t, i)}</text>`); }
  // candles / line
  if (candle) { let d = ''; for (let i = 0; i < n; i++) { const b = B[i], x = X(i), up = b.c >= b.o, col = up ? BCUP : BCDN; d += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(b.h).toFixed(1)}" y2="${Y(b.l).toFixed(1)}" stroke="${col}"/><rect x="${(x - bw / 2).toFixed(1)}" y="${Math.min(Y(b.o), Y(b.c)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(b.o) - Y(b.c))).toFixed(1)}" fill="${col}"/>`; } out.push(d); }
  else { const p = B.map((b, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(b.c).toFixed(1)).join(''); out.push(`<path d="${p}" fill="none" stroke="${S.color || 'var(--text)'}" stroke-width="1.8" stroke-linejoin="round"/>`); }
  const path = (pts, Yf) => { let d = '', pen = false; pts.forEach((v, i) => { if (v == null || !isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yf(v).toFixed(1); pen = true; }); return d; };
  for (const o of S.overlays || []) { const d = path(o.pts || [], Y); if (d) out.push(`<path d="${d}" fill="none" stroke="${o.color}" stroke-width="${o.w || 1.5}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} stroke-linejoin="round" opacity=".95"/>`); }
  // horizontal levels
  const tags = [];
  for (const l of S.levels || []) { if (l.y == null || !isFinite(l.y)) continue; if (l.y < lo || l.y > hi) { if (l.pin) out.push(`<text x="${W - R - 4}" y="${l.y < lo ? T + H - 4 : T + 11}" font-size="10.5" fill="${l.color || 'var(--mut)'}" text-anchor="end" font-weight="600">${l.y < lo ? '▼' : '▲'} ${l.name}</text>`); continue; } const y = Y(l.y), x0 = L + (l.i0 ?? 0) * step, x1 = L + ((l.i1 ?? n - 1) + 1) * step;
    out.push(`<line x1="${x0.toFixed(1)}" x2="${x1.toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${l.color || 'var(--mut)'}" stroke-width="${l.w || 1.2}" ${l.dash === '' ? '' : `stroke-dasharray="${l.dash || '5 4'}"`}/>`); if (l.name) tags.push({ y, txt: l.name, col: l.color }); }
  tags.sort((a, b) => a.y - b.y); for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 14) tags[i].y = tags[i - 1].y + 14; for (const t of tags) tag(t.y, t.txt, t.col);
  for (const v of S.vlines || []) { const i = v.i ?? bcIdx(B, v.t), x = X(i); out.push(`<line x1="${x}" x2="${x}" y1="${T}" y2="${bottom}" stroke="${v.color || 'var(--mut)'}" stroke-dasharray="${v.dash || '4 4'}" stroke-width="1.2"/>${v.name ? `<text x="${x + 3}" y="${T + 10 + (v.row || 0) * 11}" font-size="10" fill="${v.color || 'var(--mut)'}">${v.name}</text>` : ''}`); }
  for (const m of S.marks || []) { const i = m.i ?? bcIdx(B, m.t), x = X(i), y = Y(m.y ?? B[i].c), col = m.color || 'var(--text)', s = 6;
    if (m.kind == 'up') out.push(`<path d="M${x} ${y - s - 2}L${x - s} ${y + s * .6}L${x + s} ${y + s * .6}Z" fill="${col}" stroke="var(--bg)"/>`); else if (m.kind == 'down') out.push(`<path d="M${x} ${y + s + 2}L${x - s} ${y - s * .6}L${x + s} ${y - s * .6}Z" fill="${col}" stroke="var(--bg)"/>`);
    else if (m.kind == 'x') out.push(`<path d="M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}" stroke="${col}" stroke-width="2"/>`); else out.push(`<circle cx="${x}" cy="${y}" r="${m.r || 4.5}" fill="${col}" stroke="var(--bg)" stroke-width="1.5"/>`);
    if (m.name) out.push(`<text x="${Math.min(x + 8, W - R - 40)}" y="${y + (m.kind == 'down' ? 16 : -8)}" font-size="10.5" fill="${col}" font-weight="600">${m.name}</text>`); }
  if (S.last != null && isFinite(S.last)) { const y = Y(S.last); out.push(`<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${S.lastColor || 'var(--text)'}" stroke-dasharray="2 3" opacity=".7"/>`); tag(y, (S.yfmt || bcNum)(S.last), 'var(--bg)', S.lastColor || 'var(--text)'); }
  // indicator panes
  let top = T + H; const paneGeo = [];
  for (const p of panes) { top += GAP; const ph = p.h || 70, vals = p.vals || [], all = [...vals, ...(p.lines || []).flatMap(l => l.pts || [])].filter(v => v != null && isFinite(v));
    let a = p.min ?? (p.type == 'bars' && all.every(v => v >= 0) ? 0 : Math.min(...all, ...(p.levels || []).map(l => l.y))), b = p.max ?? Math.max(...all, ...(p.levels || []).map(l => l.y)); if (!isFinite(a) || !isFinite(b)) { a = 0; b = 1; } if (a === b) b = a + 1; if (p.min == null && !(p.type == 'bars' && a === 0)) a -= (b - a) * .08; if (p.max == null) b += (b - a) * .08;
    const Yp = v => top + (b - v) / (b - a) * ph; paneGeo.push({ p, top, ph, a, b });
    out.push(`<rect x="${L}" y="${top}" width="${PW}" height="${ph}" fill="rgba(127,127,127,.04)" stroke="var(--grid)"/><text x="${L + 4}" y="${top - 6}" font-size="11" fill="var(--mut)" font-weight="600">${W < 560 && p.short ? p.short : p.name || ''}</text>`);
    for (const s of p.shade || []) { const x0 = L + s.i0 * step, x1 = L + (s.i1 + 1) * step; out.push(`<rect x="${x0.toFixed(1)}" y="${top}" width="${(x1 - x0).toFixed(1)}" height="${ph}" fill="${s.color}"/>`); }
    for (const l of p.levels || []) { const y = Yp(l.y); out.push(`<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${l.color || 'var(--mut)'}" stroke-dasharray="${l.dash || '4 4'}"/>`); tag(y, l.name || (p.fmt || bcNum)(l.y), l.color); }
    if (p.type == 'bars') { const zero = Yp(Math.max(a, Math.min(0, b))); let d = ''; vals.forEach((v, i) => { if (v == null || !isFinite(v)) return; const col = (p.colors && p.colors[i]) || p.color || 'var(--mut)', y = Yp(v); d += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Math.min(y, zero).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(zero - y)).toFixed(1)}" fill="${col}" opacity=".85"/>`; }); out.push(d); }
    else if (vals.length) { const d = path(vals, Yp); if (d) out.push(`<path d="${d}" fill="none" stroke="${p.color || 'var(--text)'}" stroke-width="1.6" stroke-linejoin="round"/>`); }
    for (const l of p.lines || []) { const d = path(l.pts, Yp); if (d) out.push(`<path d="${d}" fill="none" stroke="${l.color}" stroke-width="${l.w || 1.4}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''} stroke-linejoin="round"/>`); }
    for (const m of p.marks || []) out.push(`<circle cx="${X(m.i)}" cy="${Yp(m.y)}" r="3.5" fill="${m.color}" stroke="var(--bg)"/>`);
    if (!(p.levels || []).length) for (let k = 0; k <= 2; k++) { const v = a + (b - a) * k / 2; out.push(`<text x="${W - R + 5}" y="${Yp(v) + 4}" font-size="10" fill="var(--mut2)" style="font-variant-numeric:tabular-nums">${(p.fmt || bcNum)(v)}</text>`); }
    top += ph; }
  el.innerHTML = `<svg width="${W}" height="${total}" viewBox="0 0 ${W} ${total}" style="display:block;font-family:inherit">${out.join('')}<line id="${(el.id || 'bc') + '_x'}" y1="${T}" y2="${bottom}" stroke="var(--grid2)" stroke-dasharray="3 3" style="display:none"/><rect x="${L}" y="${T}" width="${PW}" height="${bottom - T}" fill="transparent" id="${(el.id || 'bc') + '_h'}"/></svg><div class="bctip" style="display:none"></div>`;
  // crosshair + readout
  const hit = el.querySelector('rect[id$=_h]'), ln = el.querySelector('line[id$=_x]'), tip = el.querySelector('.bctip'); if (!hit) return;
  const show = e => { const r = el.getBoundingClientRect(), cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, i = Math.max(0, Math.min(n - 1, Math.floor((cx - L) / step))), b = B[i], x = X(i);
    ln.style.display = ''; ln.setAttribute('x1', x); ln.setAttribute('x2', x);
    const rows = [`<b>${(S.tfFull || tf)(b.t, i)}</b>`, candle ? `O ${bcNum(b.o)} · H ${bcNum(b.h)} · L ${bcNum(b.l)} · C <b>${bcNum(b.c)}</b>` : `<b>${(S.yfmt || bcNum)(b.c)}</b>`];
    if (b.v != null && S.showVol !== false) rows.push(`Volume ${bcNum(b.v)}`); for (const o of S.overlays || []) if (o.name && o.pts && o.pts[i] != null) rows.push(`<span style="color:${o.color}">${o.name}</span> ${bcNum(o.pts[i])}`);
    for (const g of paneGeo) { const p = g.p; if (p.vals && p.vals[i] != null) rows.push(`${p.short || p.name}: <b>${(p.fmt || bcNum)(p.vals[i])}</b>`); for (const l of p.lines || []) if (l.pts && l.pts[i] != null) rows.push(`<span style="color:${l.color}">${l.name}</span> ${(p.fmt || bcNum)(l.pts[i])}`); }
    for (const m of [...(S.marks || []), ...(S.vlines || [])]) if ((m.i ?? bcIdx(B, m.t)) === i && m.tip) rows.push(m.tip);
    tip.innerHTML = rows.join('<br>'); tip.style.display = 'block'; const tw = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(W - tw - 4, x + 14 > W - tw - 4 ? x - tw - 14 : x + 14)) + 'px'; tip.style.top = (T + 6) + 'px'; };
  hit.onmousemove = show; hit.ontouchmove = show; hit.ontouchstart = show; hit.onmouseleave = () => { ln.style.display = 'none'; tip.style.display = 'none'; };
}
addEventListener('resize', () => { clearTimeout(bcChart.t); bcChart.t = setTimeout(() => { for (const [k, v] of [...BCREG]) { if (!v.el.isConnected) BCREG.delete(k); else bcChart(v.el, v.S); } }, 150); });

/* ---------- the profit curve every bot gets ---------- */
// trades -> [{ t (seconds), pnl, label }] of the closed ones, oldest first. A trade is closed when it has a profit figure and is not open or skipped.
function bcClosed(trades, label) {
  return (trades || []).filter(t => t && t.pnl != null && isFinite(+t.pnl) && t.status != 'open' && t.status != 'skip' && t.status != 'cancelled')
    .map(t => ({ t: +(t.exitts || t.settledts || t.wend || t.ts || t.t) / (+(t.exitts || t.settledts || t.wend || t.ts || t.t) > 1e11 ? 1000 : 1), pnl: +t.pnl, label: label ? label(t) : (t.sym || t.etf || t.root || t.strat || t.slug || t.label || '') })).sort((a, b) => a.t - b.t);
}
const bcProfitCard = (id, note) => `<div class="card pad" style="margin-top:16px"><div class="row sb"><h2>Profit curve</h2><span class=mut style="font-size:12.5px" id="${id}n"></span></div><div id="${id}" class=chart style="margin-top:10px"></div><div class=mut style="font-size:12px;margin-top:8px">${note || 'Running total of closed trades, after fees. Hover for each trade. Shows the last 100 trades.'}</div></div>`;
function bcProfitDraw(id, trades, o = {}) {
  const el = document.getElementById(id); if (!el) return; const rows = bcClosed(trades, o.label), money = o.fmt || (v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2)), nEl = document.getElementById(id + 'n');
  if (rows.length < 2) { el.innerHTML = `<div class=empty style="padding:26px 0">${rows.length ? 'One closed trade so far: the curve starts with the second.' : 'No closed trades yet. The curve fills in as the bot trades.'}</div>`; if (nEl) nEl.textContent = ''; return; }
  let run = 0; const vals = [0, ...rows.map(r => run += r.pnl)], wins = rows.filter(r => r.pnl > 0).length, dd = (() => { let pk = 0, d = 0; for (const v of vals) { pk = Math.max(pk, v); d = Math.min(d, v - pk); } return d; })();
  if (nEl) nEl.innerHTML = `<span class="${run >= 0 ? 'up' : 'down'}" style="font-weight:600">${run >= 0 ? '+' : ''}${money(run)}</span> · ${rows.length} trades · ${Math.round(wins / rows.length * 100)}% won · worst dip ${money(dd)}`;
  area(el, vals, { h: o.h || 190, axis: 1, zero: true, fmt: v => money(v), tip: i => i ? `<b class=num>${money(vals[i])}</b><div class=mut>${esc(rows[i - 1].label)} · <span class="${rows[i - 1].pnl >= 0 ? 'up' : 'down'}">${rows[i - 1].pnl >= 0 ? '+' : ''}${money(rows[i - 1].pnl)}</span></div><div class=mut>${new Date(rows[i - 1].t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>` : '<b class=num>start</b>' });
}
