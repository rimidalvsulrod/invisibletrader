// GEX Levels tab: SPY options gamma exposure (free delayed CBOE data), the max-GEX wall, the zero-gamma flip, the dealer regime,
// and the paper-signal log (pin fade, magnet drift, stand aside). Log only: nothing here ever places a trade.
let gxT = null, gxS = null;
const gxStop = () => { clearInterval(gxT); gxT = null; };
const gxapi = async (op, body) => {
  const r = await fetch('/api/gex' + (body ? '' : '?op=' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const gxn = (x, d = 2) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const gxB = x => (x < 0 ? '-' : '') + '$' + (Math.abs(x) >= 1e9 ? (Math.abs(x) / 1e9).toFixed(2) + 'B' : (Math.abs(x) / 1e6).toFixed(0) + 'M');
const gxDay = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const gxTime = t => new Date(t).toLocaleTimeString([], { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const gxPct = x => (x >= 0 ? '+' : '') + x.toFixed(2) + '%';

async function gexPage() {
  gxStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', gexPage); await signedIn(me.user); }
  app.innerHTML = sk(420);
  try { gxS = await gxapi('state'); } catch (e) { if (e.status === 401) return authView('login', '', gexPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  gxRender(); gxT = setInterval(async () => { if (!$('#gxstrike')) return gxStop(); try { gxS = await gxapi('state'); gxRender(); } catch (e) {} }, 30000);
}

/* ---------- charts ---------- */
function gxDrawStrikes() { // gamma by strike: puts to the left (red), calls to the right (green)
  const cv = $('#gxstrike'); if (!cv || !gxS.snap) return; const sn = gxS.snap, rows = sn.strikes.filter(e => Math.abs(e.K / sn.spot - 1) <= .03).sort((a, b) => b.K - a.K); if (!rows.length) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = Math.max(360, Math.min(620, rows.length * 9 + 40)); cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const fg = getComputedStyle(document.body).color, mut = 'rgba(127,127,127,.75)', grid = 'rgba(127,127,127,.14)', UP = '#2fbf71', DN = '#e5484d';
  const L = 52, R = 110, T = 10, B = 22, PW = W - L - R, PH = H - T - B, cx = L + PW / 2, rh = PH / rows.length, mx = Math.max(...rows.map(e => Math.max(e.call, -e.put))) || 1, sc = (PW / 2 - 6) / mx;
  const yOf = K => { const i = rows.findIndex(e => e.K <= K); if (i < 0) return T + PH; if (i === 0) return T; const a = rows[i - 1], b = rows[i]; return T + (i - 1 + .5) * rh + (a.K - K) / (a.K - b.K) * rh; };
  g.font = '11px ui-monospace,Menlo,monospace'; g.textBaseline = 'middle'; g.strokeStyle = grid; g.beginPath(); g.moveTo(cx, T); g.lineTo(cx, T + PH); g.stroke();
  rows.forEach((e, i) => { const y = T + i * rh, top = e.K === sn.maxK; g.fillStyle = UP; g.globalAlpha = top ? 1 : .8; g.fillRect(cx, y + 1, e.call * sc, Math.max(1, rh - 2)); g.fillStyle = DN; g.fillRect(cx + e.put * sc, y + 1, -e.put * sc, Math.max(1, rh - 2)); g.globalAlpha = 1;
    if (top) { g.strokeStyle = fg; g.lineWidth = 1.4; g.strokeRect(L, y, PW, rh); g.lineWidth = 1; } if (i % Math.max(1, Math.round(rows.length / 14)) === 0 || top) { g.fillStyle = top ? fg : mut; g.textAlign = 'right'; g.fillText(String(e.K), L - 6, y + rh / 2); } });
  const line = (K, col, dash, label) => { if (K == null) return; const y = yOf(K); g.save(); g.strokeStyle = col; g.setLineDash(dash); g.lineWidth = 1.5; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.restore(); g.fillStyle = col; g.textAlign = 'left'; g.fillText(label, L + PW + 6, y); };
  line(sn.spot, fg, [2, 3], 'SPY ' + gxn(sn.spot)); line(sn.flip, '#e8b84a', [6, 4], 'flip ' + gxn(sn.flip, 1)); g.fillStyle = fg; g.textAlign = 'left'; g.fillText('MAX ' + sn.maxK, L + PW + 6, yOf(sn.maxK) + (sn.maxK > sn.spot ? -2 : 2));
  g.fillStyle = mut; g.textAlign = 'center'; g.fillText('← put gamma', cx - PW / 4, H - 8); g.fillText('call gamma →', cx + PW / 4, H - 8);
}
function gxDrawPrice() { // SPY 5-minute candles for the last two sessions with the levels and today's signals
  const cv = $('#gxprice'); if (!cv || !gxS.snap || !gxS.bars.length) return; const sn = gxS.snap, bars = gxS.bars, N = bars.length, today = gxDay(bars[N - 1][0]), todays = gxS.log.filter(s => s.day == today && s.kind == 'pin');
  const dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = Math.round(Math.min(420, Math.max(280, W * .42))); cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const fg = getComputedStyle(document.body).color, mut = 'rgba(127,127,127,.75)', grid = 'rgba(127,127,127,.14)', UP = '#2fbf71', DN = '#e5484d';
  const L = 10, R = 104, T = 12, B = 22, PW = W - L - R, PH = H - T - B, K = sn.maxK; let lo = Math.min(...bars.map(b => b[3]), K * .993, sn.flip || K), hi = Math.max(...bars.map(b => b[2]), K * 1.007, sn.flip || K); const pad = (hi - lo) * .05; lo -= pad; hi += pad;
  const X = i => L + (i + .5) / N * PW, Y = p => T + (hi - p) / (hi - lo) * PH, cw = Math.max(1.5, PW / N * .62); g.font = '11px ui-monospace,Menlo,monospace'; g.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) { const p = lo + (hi - lo) * i / 4, y = Y(p); g.strokeStyle = grid; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.fillStyle = mut; g.textAlign = 'left'; g.fillText(gxn(p), L + PW + 6, y); }
  g.fillStyle = 'rgba(232,184,74,.10)'; g.fillRect(L, Y(K * (1 + gxS.sig.touch)), PW, Y(K * (1 - gxS.sig.touch)) - Y(K * (1 + gxS.sig.touch))); // the pin zone: 0.3% either side of the wall
  let prev = null; bars.forEach((b, i) => { const d = gxDay(b[0]); if (d != prev) { const x = L + i / N * PW; g.strokeStyle = 'rgba(127,127,127,.35)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); g.setLineDash([]); g.fillStyle = mut; g.textAlign = 'left'; g.fillText(d.slice(5), x + 4, H - 8); prev = d; } });
  const hl = (p, col, dash, label) => { if (p == null) return; const y = Y(p); g.save(); g.strokeStyle = col; g.setLineDash(dash); g.lineWidth = 1.4; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.restore(); g.fillStyle = col; g.textAlign = 'left'; g.fillText(label, L + PW + 6, y); };
  bars.forEach((b, i) => { const [, o, h, l, c] = b, x = X(i), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.beginPath(); g.moveTo(x, Y(h)); g.lineTo(x, Y(l)); g.stroke(); g.fillRect(x - cw / 2, Math.min(Y(o), Y(c)), cw, Math.max(1, Math.abs(Y(o) - Y(c)))); });
  hl(K, fg, [], 'MAX GEX ' + K); hl(sn.flip, '#e8b84a', [6, 4], 'flip ' + gxn(sn.flip, 1)); hl(K * (1 - sn.sigdrift), 'rgba(127,127,127,.5)', [2, 4], '-1% drift'); hl(K * (1 + sn.sigdrift), 'rgba(127,127,127,.5)', [2, 4], '+1% drift');
  for (const s of todays) { const i = bars.findIndex(b => b[0] + 3e5 > s.ts); if (i < 0) continue; const x = X(i), up = s.dir == 'long', y = Y(s.entry), col = s.status == 'win' ? UP : s.status == 'open' ? fg : DN; g.fillStyle = col; g.beginPath(); if (up) { g.moveTo(x, y - 10); g.lineTo(x - 6, y + 1); g.lineTo(x + 6, y + 1); } else { g.moveTo(x, y + 10); g.lineTo(x - 6, y - 1); g.lineTo(x + 6, y - 1); } g.closePath(); g.fill();
    g.save(); g.strokeStyle = DN; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, Y(s.stop)); g.lineTo(Math.min(L + PW, x + 70), Y(s.stop)); g.stroke(); g.strokeStyle = UP; g.beginPath(); g.moveTo(x, Y(s.target)); g.lineTo(Math.min(L + PW, x + 70), Y(s.target)); g.stroke(); g.restore(); }
}

/* ---------- page ---------- */
function gxRender() {
  const s = gxS, sn = s.snap, st = s.stats; if (sn) sn.sigdrift = s.sig.drift;
  const lvl = sn ? (() => { const dm = (sn.maxK / sn.spot - 1) * 100, df = sn.flip ? (sn.flip / sn.spot - 1) * 100 : null, long = sn.regime == 'long';
    return `<div class="grid g3" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))"><div class=stat><div class=k>Max GEX strike</div><div class="v num">${gxn(sn.maxK, sn.maxK % 1 ? 2 : 0)}</div><div class=s>${long ? 'the magnet / wall' : 'biggest gamma strike'} · ${gxPct(dm)} from SPY · ${gxB(sn.maxGex)} total</div></div>
      <div class=stat><div class=k>Zero-gamma flip</div><div class="v num">${sn.flip ? gxn(sn.flip) : 'none'}</div><div class=s>${sn.flip ? `${gxPct(df)} from SPY · net gamma crosses zero here` : 'net gamma does not cross zero within ±12%'}</div></div>
      <div class=stat><div class=k>Net gamma</div><div class="v num ${long ? 'up' : 'down'}">${gxB(sn.net)}</div><div class=s>calls ${gxB(sn.callGex)} · puts ${gxB(sn.putGex)}</div></div>
      <div class=stat><div class=k>Dealer regime</div><div class="v" style="font-size:24px;font-weight:650;margin-top:6px"><span class="${long ? 'up' : 'down'}">${long ? 'Long gamma' : 'Short gamma'}</span></div><div class=s>${long ? 'pinning: expect price to stick near the max GEX strike' : 'amplification: moves get bigger, stand aside'}</div></div></div>`; })() : `<div class=note>${esc(s.snapError || 'No options data yet')}</div>`;
  const nm = k => ({ pin: 'Pin fade', drift: 'Magnet drift', aside: 'Stand aside' })[k] || k, dirOf = x => x.dir == 'long' || x.dir == 'up' ? '<span class=up>' + (x.kind == 'drift' ? 'up' : 'long') + '</span>' : x.dir == 'short' || x.dir == 'down' ? '<span class=down>' + (x.kind == 'drift' ? 'down' : 'short') + '</span>' : '';
  const stat = x => x.status == 'open' ? '<span class="pill ac">Open</span>' : x.status == 'win' ? '<span class="pill up">Win</span>' : x.status == 'loss' ? '<span class="pill down">Loss</span>' : x.status == 'invalidated' ? '<span class="pill down">Killed</span>' : '<span class="pill n">Note</span>';
  const pf = st.pin, dr = st.drift;
  app.innerHTML = `<div class="ph fade"><div><h1>GEX Levels</h1><p class=lead>Where dealers' options hedging pins or amplifies SPY. Free, delayed CBOE options data turned into levels and paper signals. Log only: nothing here ever trades.</p></div></div>
    <div class="card pad"><div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${s.enabled ? 'on' : ''}" id=gxtog aria-label="GEX bot on/off"></button><div><div style="font-size:22px;font-weight:650">${s.enabled ? '<span class=up>Logging signals</span>' : 'Paused'}</div><div class=mut style="font-size:13px">Re-prices the SPY options chain against the live price every minute during the NY session</div></div></div>
      ${sn ? `<div class=mut style="font-size:12.5px;text-align:right;line-height:1.55">SPY <b class=num style="color:var(--text)">${gxn(sn.spot)}</b> · ${sn.contracts.toLocaleString()} contracts, ${sn.expirations} expirations<br>${esc(sn.source)} · chain as of ${gxDay(sn.asof)} ${gxTime(sn.asof)} ET · levels updated ${gxTime(sn.t)} ET</div>` : ''}</div>
      <div style="margin-top:18px">${lvl}</div></div>
    ${sn ? `<div class="card pad" style="margin-top:16px"><h2>Gamma by strike</h2><div class=mut style="font-size:12.5px;margin:4px 0 10px">GEX = gamma × open interest × 100 × price, summed over every expiration. Green = call gamma, red = put gamma. The outlined row is the max GEX strike.</div><canvas id=gxstrike style="width:100%;display:block"></canvas></div>
    <div class="card pad" style="margin-top:16px"><h2>SPY and the levels</h2><div class=mut style="font-size:12.5px;margin:4px 0 10px">5-minute candles, last two sessions. White line = max GEX, yellow dashed = zero-gamma flip, shaded = the pin-fade entry zone (0.1% to 0.3% either side of the wall; stop and invalidation sit 0.5% beyond it), dotted = ±1% magnet-drift lines. Arrows are today's pin-fade signals with their stop (red) and target (green).</div><canvas id=gxprice style="width:100%;display:block"></canvas></div>` : ''}
    <div class="card pad" style="margin-top:16px"><div class="row sb wrapf"><h2>Paper signals</h2><span class=mut style="font-size:12.5px">Pin fades: ${pf.n ? `${pf.won} won, ${pf.lost} lost (${Math.round(pf.won / pf.n * 100)}%), average ${gxPct(pf.avg)}, total ${gxPct(pf.pnl)}` : 'none resolved yet'} · Magnet drift: ${dr.n ? `${dr.won} of ${dr.n} drifted toward the magnet` : 'none scored yet'}</span></div>
      <div class=mut style="font-size:12.5px;line-height:1.6;margin:8px 0 0"><b>Pin fade:</b> in a long-gamma regime, SPY 0.10% to 0.30% from the max GEX strike (a touch) is faded back to it. Entry = price then, target = the strike, stop = 0.5% beyond the strike. A bar closing 0.5% beyond the strike kills it. <b>Magnet drift:</b> SPY 1% or more from the strike in a long-gamma regime: a bias note, scored at the close. <b>Stand aside:</b> net gamma is negative (dealers amplify moves), so no trades; noted once a day.</div></div>
    <div class="card" style="margin-top:16px;overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Signal log</h2></div><table class=tbl><tbody>${s.log.map(x => `<tr><td style="width:1%">${stat(x)}</td>
      <td><div><b>${nm(x.kind)}</b> ${dirOf(x)} · level ${x.level != null ? gxn(x.level, x.level % 1 ? 2 : 0) : '-'}</div><div class=mut style="font-size:12.5px;margin-top:2px">${x.entry != null && x.kind == 'pin' ? `entry ${gxn(x.entry)} · stop ${gxn(x.stop)} · target ${gxn(x.target)}${x.exitp != null ? ` · exit ${gxn(x.exitp)}` : ''} · ` : x.entry != null ? `price ${gxn(x.entry)} · ` : ''}${esc(x.note || '')}</div></td>
      <td class=r><div class="num ${x.pnl == null ? 'mut' : ud(x.pnl)}" style="font-weight:600">${x.pnl == null ? '' : gxPct(x.pnl)}</div><div class=mut style="font-size:12px">${x.day} ${gxTime(x.ts)}</div></td></tr>`).join('') || `<tr><td class=empty>No signals yet. Turn the bot on: it logs a signal when SPY sits near the max GEX strike in a pinning regime, or a stand-aside note when gamma is negative.</td></tr>`}</tbody></table></div>`;
  $('#gxtog').onclick = async () => { try { await gxapi(s.enabled ? 'stop' : 'start', {}); toast(s.enabled ? 'GEX bot paused' : 'GEX bot on: logging signals'); gxS = await gxapi('state'); gxRender(); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } };
  gxDrawStrikes(); gxDrawPrice();
}
addEventListener('resize', () => { if ($('#gxstrike')) { gxDrawStrikes(); gxDrawPrice(); } });
