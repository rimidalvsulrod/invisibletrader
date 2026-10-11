// GEX Levels tab: SPY options gamma exposure (free delayed CBOE data), the max-GEX wall, the zero-gamma flip, the dealer regime,
// the signal log (pin fade, magnet drift, stand aside), and the GEX bot: it paper-trades each pin-fade signal in SPY shares in the built-in paper
// account (balance, profit and risk dials like the other bots). Nothing here ever sends an order to a broker.
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
const gxTrade = () => { const t = gxS.trades.filter(x => x.status != 'skip'), lastDay = gxS.bars.length ? gxDay(gxS.bars[gxS.bars.length - 1][0]) : null; return t.find(x => x.status == 'open') || t.find(x => x.day == lastDay) || null; }; // the trade the charts follow: the open one, else the latest of the last session
const gxPct = x => (x >= 0 ? '+' : '') + x.toFixed(2) + '%';

async function gexPage() {
  gxStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', gexPage); await signedIn(me.user); }
  app.innerHTML = sk(420);
  try { gxS = await gxapi('state'); } catch (e) { if (e.status === 401) return authView('login', '', gexPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  gxRender(); gxT = setInterval(async () => { if (!$('#gxhero')) return gxStop(); try { gxS = await gxapi('state'); gxPaint(); } catch (e) {} }, 15000); // live parts only: never resets a dial
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
  const tags = []; const line = (K, col, dash, label) => { if (K == null) return; const y = yOf(K); g.save(); g.strokeStyle = col; g.setLineDash(dash); g.lineWidth = 1.5; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.restore(); tags.push({ y, text: label, col }); };
  line(sn.spot, fg, [2, 3], 'SPY ' + gxn(sn.spot)); line(sn.flip, '#e8b84a', [6, 4], 'flip ' + gxn(sn.flip, 1)); tags.push({ y: yOf(sn.maxK), text: 'MAX ' + sn.maxK, col: fg });
  tags.sort((a, b) => a.y - b.y); for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 13) tags[i].y = tags[i - 1].y + 13; g.textAlign = 'left'; for (const t of tags) { g.fillStyle = t.col; g.fillText(t.text, L + PW + 6, t.y); } // labels kept apart when the levels are close
  g.fillStyle = mut; g.textAlign = 'center'; g.fillText('← put gamma', cx - PW / 4, H - 8); g.fillText('call gamma →', cx + PW / 4, H - 8);
}
function gxDrawPrice() { // SPY 5-minute candles for the last two sessions: the levels, and the trade the bot is in (or the last one it took)
  const cv = $('#gxprice'); if (!cv || !gxS.snap || !gxS.bars.length) return; const sn = gxS.snap, bars = gxS.bars, N = bars.length, lastDay = gxDay(bars[N - 1][0]), tr = gxTrade(), mine = tr && tr.entry != null && bars.some(b => gxDay(b[0]) == tr.day) ? tr : null;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = Math.round(Math.min(440, Math.max(290, W * .44))); cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const fg = getComputedStyle(document.body).color, mut = 'rgba(127,127,127,.75)', grid = 'rgba(127,127,127,.14)', UP = '#2fbf71', DN = '#e5484d';
  const L = 10, R = 112, T = 12, B = 22, PW = W - L - R, PH = H - T - B, K = sn.maxK, wall = mine && mine.level != null ? mine.level : null, last = bars[N - 1][4];
  const ext = [...bars.map(b => b[3]), ...bars.map(b => b[2]), K * .993, K * 1.007, sn.flip || K]; if (mine) ext.push(mine.entry, mine.stop, mine.tp, ...(mine.exitp ? [mine.exitp] : []), ...(wall != null ? [wall] : [])); let lo = Math.min(...ext), hi = Math.max(...ext); const pad = (hi - lo) * .05; lo -= pad; hi += pad;
  const X = i => L + (i + .5) / N * PW, Y = p => T + (hi - p) / (hi - lo) * PH, cw = Math.max(1.5, PW / N * .62), idx = t => { const i = bars.findIndex(b => b[0] + 3e5 > t); return i < 0 ? N - 1 : i; }; g.font = '11px ui-monospace,Menlo,monospace'; g.textBaseline = 'middle';
  const labels = []; const tag = (p, text, col) => labels.push({ y: Y(p), text, col }); // right-axis labels, pushed apart so they never overlap
  g.fillStyle = 'rgba(232,184,74,.10)'; g.fillRect(L, Y(K * (1 + gxS.sig.touch)), PW, Y(K * (1 - gxS.sig.touch)) - Y(K * (1 + gxS.sig.touch))); // the pin zone: 0.3% either side of the current wall
  for (let i = 0; i <= 4; i++) { const p = lo + (hi - lo) * i / 4, y = Y(p); g.strokeStyle = grid; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); tag(p, gxn(p), mut); }
  let prev = null; bars.forEach((b, i) => { const d = gxDay(b[0]), m = new Date(b[0]).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }), x = L + i / N * PW;
    if (d != prev) { g.strokeStyle = 'rgba(127,127,127,.35)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); g.setLineDash([]); g.fillStyle = mut; g.textAlign = 'left'; g.fillText(d.slice(5), x + 4, H - 8); prev = d; }
    else if (m == '11:00' || m == '13:00' || m == '15:00') { g.fillStyle = mut; g.textAlign = 'center'; g.fillText(m, X(i), H - 8); } });
  const hl = (p, col, dash, text, w = 1.4) => { if (p == null) return; const y = Y(p); g.save(); g.strokeStyle = col; g.setLineDash(dash); g.lineWidth = w; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.restore(); if (text) tag(p, text, col); };
  let e0 = -1, e1 = -1; if (mine) { e0 = idx(mine.ts); e1 = mine.status == 'open' ? N - 1 : Math.max(e0, mine.exitts ? idx(mine.exitts) : N - 1); const x0 = X(e0), x1 = X(Math.max(e1, Math.min(N - 1, e0 + 1)));
    g.fillStyle = 'rgba(47,191,113,.10)'; g.fillRect(x0, Math.min(Y(mine.entry), Y(mine.tp)), x1 - x0, Math.abs(Y(mine.tp) - Y(mine.entry))); g.fillStyle = 'rgba(229,72,77,.10)'; g.fillRect(x0, Math.min(Y(mine.entry), Y(mine.stop)), x1 - x0, Math.abs(Y(mine.stop) - Y(mine.entry))); }
  bars.forEach((b, i) => { const [, o, h, l, c] = b, x = X(i), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.beginPath(); g.moveTo(x, Y(h)); g.lineTo(x, Y(l)); g.stroke(); g.fillRect(x - cw / 2, Math.min(Y(o), Y(c)), cw, Math.max(1, Math.abs(Y(o) - Y(c)))); });
  hl(K, fg, [], 'MAX GEX ' + K); hl(sn.flip, '#e8b84a', [6, 4], 'flip ' + gxn(sn.flip, 1)); hl(K * (1 - sn.sigdrift), 'rgba(127,127,127,.5)', [2, 4], ''); hl(K * (1 + sn.sigdrift), 'rgba(127,127,127,.5)', [2, 4], '');
  for (const s of gxS.log.filter(x => x.day == lastDay && x.kind == 'pin' && !gxS.trades.some(t => t.sig == x.id))) { const x = X(idx(s.ts)), up = s.dir == 'long', y = Y(s.entry); g.globalAlpha = .55; g.fillStyle = s.status == 'win' ? UP : s.status == 'open' ? fg : DN; g.beginPath(); if (up) { g.moveTo(x, y - 9); g.lineTo(x - 5, y + 1); g.lineTo(x + 5, y + 1); } else { g.moveTo(x, y + 9); g.lineTo(x - 5, y - 1); g.lineTo(x + 5, y - 1); } g.closePath(); g.fill(); g.globalAlpha = 1; } // signals the bot did not trade (bot off, or skipped)
  if (mine) { const long = mine.dir == 'long', open = mine.status == 'open', x0 = X(e0), x1 = X(Math.max(e1, Math.min(N - 1, e0 + 1)));
    if (wall != null && Math.abs(wall - K) > .001) hl(wall, fg, [3, 3], 'wall ' + wall + ' (trade)', 1);
    const seg = (p, col, dash, text) => { g.save(); g.strokeStyle = col; g.setLineDash(dash); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, Y(p)); g.lineTo(L + PW, Y(p)); g.stroke(); g.restore(); tag(p, text, col); };
    seg(mine.entry, fg, [], 'in ' + gxn(mine.entry)); seg(mine.stop, DN, [6, 4], 'stop ' + gxn(mine.stop)); seg(mine.tp, UP, [6, 4], 'target ' + gxn(mine.tp));
    g.fillStyle = fg; g.beginPath(); if (long) { g.moveTo(x0, Y(mine.entry) - 11); g.lineTo(x0 - 6, Y(mine.entry) + 1); g.lineTo(x0 + 6, Y(mine.entry) + 1); } else { g.moveTo(x0, Y(mine.entry) + 11); g.lineTo(x0 - 6, Y(mine.entry) - 1); g.lineTo(x0 + 6, Y(mine.entry) - 1); } g.closePath(); g.fill();
    if (!open && mine.exitp) { const xe = X(e1), ye = Y(mine.exitp), c = mine.pnl > 0 ? UP : DN; g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.arc(xe, ye, 5, 0, 7); g.stroke(); g.lineWidth = 1; tag(mine.exitp, 'out ' + gxn(mine.exitp), c); }
    const pnl = open ? gxOpenPnl(mine) : mine.pnl, txt = `${long ? 'LONG' : 'SHORT'} ${mine.qty} SPY · ${open ? 'open' : 'closed' + (mine.reason ? ' (' + mine.reason.split(':')[0] + ')' : '')}${pnl != null ? '  ' + gxSg(pnl) : ''}`; g.font = '600 12px ui-monospace,Menlo,monospace'; const w = g.measureText(txt).width + 18;
    g.fillStyle = 'rgba(8,10,12,.78)'; g.fillRect(L + 6, T + 6, w, 24); g.fillStyle = pnl == null ? '#fff' : pnl >= 0 ? UP : DN; g.textAlign = 'left'; g.fillText(txt, L + 15, T + 18); g.font = '11px ui-monospace,Menlo,monospace';
    if (open) { const y = Y(last), c = pnl >= 0 ? UP : DN; g.save(); g.strokeStyle = c; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.restore(); tag(last, 'now ' + gxn(last), c); } }
  else { tag(last, 'SPY ' + gxn(last), fg); }
  labels.sort((a, b) => a.y - b.y); for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 12) labels[i].y = labels[i - 1].y + 12; // keep the labels apart
  g.textAlign = 'left'; for (const l of labels) { g.fillStyle = l.col; g.fillText(l.text, L + PW + 6, Math.min(T + PH, l.y)); }
}

/* ---------- page ---------- */
const gxSg = x => (x >= 0 ? '+' : '-') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gxLast = () => gxS.bars.length ? gxS.bars[gxS.bars.length - 1][4] : gxS.snap ? gxS.snap.spot : null;
const gxOpenPnl = t => { const px = gxLast(); return t && t.status == 'open' && t.entry != null && px != null ? (px - t.entry) * (t.dir == 'long' ? 1 : -1) * t.qty : null; };
const gxNm = k => ({ pin: 'Pin fade', drift: 'Magnet drift', aside: 'Stand aside' })[k] || k;
const gxDir = x => x.dir == 'long' || x.dir == 'up' ? '<span class=up>' + (x.kind == 'drift' ? 'up' : 'long') + '</span>' : x.dir == 'short' || x.dir == 'down' ? '<span class=down>' + (x.kind == 'drift' ? 'down' : 'short') + '</span>' : '';
const gxStat = x => x.status == 'open' ? '<span class="pill ac">Open</span>' : x.status == 'win' ? '<span class="pill up">Win</span>' : x.status == 'loss' ? '<span class="pill down">Loss</span>' : x.status == 'invalidated' ? '<span class="pill down">Killed</span>' : '<span class="pill n">Note</span>';
function gxHero() {
  const s = gxS, A = s.account, st = s.tstats, open = s.trades.find(t => t.status == 'open'), today = gxDay(Date.now()), live = open ? gxOpenPnl(open) : null, settled = st.won + st.lost;
  const closedToday = s.trades.filter(t => t.status == 'closed' && t.pnl != null && t.day == today).reduce((n, t) => n + t.pnl, 0), todayPnl = closedToday + (live || 0), profit = st.pnl + (live || 0), last = gxLast();
  const strip = open ? `<b class="${open.dir == 'long' ? 'up' : 'down'}">${open.dir == 'long' ? 'LONG' : 'SHORT'}</b> ${open.qty} SPY (built-in paper) · in <b class=num>${gxn(open.entry)}</b> · stop <span class=num>${gxn(open.stop)}</span> · target <span class=num>${gxn(open.tp)}</span> ${live != null ? `· <b class="num ${live >= 0 ? 'up' : 'down'}">${gxSg(live)}</b> right now` : ''}`
    : `Flat. ${last != null ? `SPY ${gxn(last)}. ` : ''}${s.enabled ? 'Waiting for a pin-fade signal (SPY within 0.10% to 0.30% of the max GEX strike in a long-gamma regime).' : 'The bot is paused.'}`;
  return `<div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${s.enabled ? 'on' : ''}" id=gxtog aria-label="GEX bot on/off" ${s.connected ? '' : 'disabled'}></button>
    <div><div style="font-size:22px;font-weight:650">${s.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">${!s.connected ? 'Connect Alpaca in the Newsflash tab first' : 'Re-prices the SPY options chain against the live price every minute, paper-trades each pin-fade signal'}</div></div></div>
    <div class=row style="gap:8px"><span class="pill n">Built-in paper</span>${s.connected ? '' : '<a class="btn pri sm" href="#/news">Connect</a>'}</div></div>${s.accountError ? `<div class=note style="margin-top:12px">${esc(s.accountError)}</div>` : ''}
    <div class="grid g3" style="margin-top:18px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class=stat><div class=k>Balance</div><div class="v num" style="font-size:30px">${A ? usd(A.equity, 2) : '-'}</div><div class=s>${A ? `cash ${usd(A.cash, 2)} · includes paper P&L` : 'on your broker'}</div></div>
      <div class=stat><div class=k>Today</div><div class="v num ${ud(todayPnl)}" style="font-size:30px">${gxSg(todayPnl)}</div><div class=s>${live != null ? 'includes the open trade' : 'closed trades today'}</div></div><div class=stat><div class=k>Bot profit</div><div class="v num ${ud(profit)}" style="font-size:30px">${gxSg(profit)}</div><div class=s>${st.n} closed trade${st.n == 1 ? '' : 's'}</div></div>
      <div class=stat><div class=k>Win rate</div><div class="v num" style="font-size:30px">${settled ? Math.round(st.won / settled * 100) + '%' : '-'}</div><div class=s>${st.won} won · ${st.lost} lost</div></div></div>
    <div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--fill);font-size:13.5px;line-height:1.55"><span class=mut>Trading now · </span>${strip}</div>`;
}
function gxLevels() {
  const s = gxS, sn = s.snap; if (!sn) return `<div class=note>${esc(s.snapError || 'No options data yet')}</div>`;
  const dm = (sn.maxK / sn.spot - 1) * 100, df = sn.flip ? (sn.flip / sn.spot - 1) * 100 : null, long = sn.regime == 'long';
  return `<div class=mut style="font-size:12.5px;text-align:right;line-height:1.55;margin-bottom:12px">SPY <b class=num style="color:var(--text)">${gxn(sn.spot)}</b> · ${sn.contracts.toLocaleString()} contracts, ${sn.expirations} expirations · ${esc(sn.source)} · chain as of ${gxDay(sn.asof)} ${gxTime(sn.asof)} ET · levels updated ${gxTime(sn.t)} ET</div>
    <div class="grid g3" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))"><div class=stat><div class=k>Max GEX strike</div><div class="v num">${gxn(sn.maxK, sn.maxK % 1 ? 2 : 0)}</div><div class=s>${long ? 'the magnet / wall' : 'biggest gamma strike'} · ${gxPct(dm)} from SPY · ${gxB(sn.maxGex)} total</div></div>
      <div class=stat><div class=k>Zero-gamma flip</div><div class="v num">${sn.flip ? gxn(sn.flip) : 'none'}</div><div class=s>${sn.flip ? `${gxPct(df)} from SPY · net gamma crosses zero here` : 'net gamma does not cross zero within ±12%'}</div></div>
      <div class=stat><div class=k>Net gamma</div><div class="v num ${long ? 'up' : 'down'}">${gxB(sn.net)}</div><div class=s>calls ${gxB(sn.callGex)} · puts ${gxB(sn.putGex)}</div></div>
      <div class=stat><div class=k>Dealer regime</div><div class="v" style="font-size:24px;font-weight:650;margin-top:6px"><span class="${long ? 'up' : 'down'}">${long ? 'Long gamma' : 'Short gamma'}</span></div><div class=s>${long ? 'pinning: expect price to stick near the max GEX strike' : 'amplification: moves get bigger, stand aside'}</div></div></div>`;
}
function gxTrades() {
  return `<div class="pad" style="padding-bottom:8px"><h2>Bot trades</h2></div><table class=tbl><tbody>${gxS.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.status == 'skip' ? 'n' : t.pnl > 0 ? 'up' : t.pnl < 0 ? 'down' : 'n'}">${t.status == 'open' ? 'Open' : t.status == 'skip' ? 'Skipped' : t.pnl > 0 ? 'Won' : t.pnl < 0 ? 'Lost' : 'Closed'}</span></td>
    <td><div><b>${esc(t.day)}</b> · ${t.dir == 'long' ? '<span class=up>Long</span>' : '<span class=down>Short</span>'} SPY</div><div class=mut style="font-size:12.5px;margin-top:2px">${t.qty ? `${t.qty} share${t.qty == 1 ? '' : 's'} at ${gxn(t.entry)} · stop ${gxn(t.stop)} · target ${gxn(t.tp)} · built-in paper` : ''}${t.exitp ? ` · exit ${gxn(t.exitp)}` : ''}${t.reason ? `${t.qty ? ' · ' : ''}${esc(t.reason)}` : ''}</div></td>
    <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? '' : gxSg(t.pnl)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. The bot trades a pin-fade signal (not the drift or stand-aside notes) with the size from your risk dials.</td></tr>`}</tbody></table>`;
}
function gxLog() {
  const s = gxS;
  return `<div class="pad" style="padding-bottom:8px"><h2>Signal log</h2></div><table class=tbl><tbody>${s.log.map(x => `<tr><td style="width:1%">${gxStat(x)}</td>
    <td><div><b>${gxNm(x.kind)}</b> ${gxDir(x)} · level ${x.level != null ? gxn(x.level, x.level % 1 ? 2 : 0) : '-'}</div><div class=mut style="font-size:12.5px;margin-top:2px">${x.entry != null && x.kind == 'pin' ? `entry ${gxn(x.entry)} · stop ${gxn(x.stop)} · target ${gxn(x.target)}${x.exitp != null ? ` · exit ${gxn(x.exitp)}` : ''} · ` : x.entry != null ? `price ${gxn(x.entry)} · ` : ''}${esc(x.note || '')}</div></td>
    <td class=r><div class="num ${x.pnl == null ? 'mut' : ud(x.pnl)}" style="font-weight:600">${x.pnl == null ? '' : gxPct(x.pnl)}</div><div class=mut style="font-size:12px">${x.day} ${gxTime(x.ts)}</div></td></tr>`).join('') || `<tr><td class=empty>No signals yet. Turn the bot on: it logs a signal when SPY sits near the max GEX strike in a pinning regime, or a stand-aside note when gamma is negative.</td></tr>`}</tbody></table>`;
}
function gxSigHead() {
  const pf = gxS.stats.pin, dr = gxS.stats.drift;
  return `<span class=mut style="font-size:12.5px">Pin fades (the signal itself, scored on 5-minute bars): ${pf.n ? `${pf.won} won, ${pf.lost} lost (${Math.round(pf.won / pf.n * 100)}%), average ${gxPct(pf.avg)}, total ${gxPct(pf.pnl)}` : 'none resolved yet'} · Magnet drift: ${dr.n ? `${dr.won} of ${dr.n} drifted toward the magnet` : 'none scored yet'}</span>`;
}
function gxPaint() {
  if (!$('#gxhero')) return; const s = gxS; if (s.snap) s.snap.sigdrift = s.sig.drift;
  $('#gxhero').innerHTML = gxHero(); $('#gxlvl').innerHTML = gxLevels(); $('#gxcharts').style.display = s.snap ? '' : 'none'; $('#gxsighead').innerHTML = gxSigHead(); $('#gxtr').innerHTML = gxTrades(); $('#gxlog').innerHTML = gxLog();
  $('#gxtog') && ($('#gxtog').onclick = () => gxAct(() => gxapi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'GEX bot paused' : 'GEX bot on: paper-trading pin-fade signals'));
  gxDrawStrikes(); gxDrawPrice();
}
const gxAct = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } try { gxS = await gxapi('state'); } catch (e) {} gxRender(); };
function gxRender() {
  const s = gxS, c = s.cfg, eq = s.account ? s.account.equity : null, save = (k, v) => gxAct(() => gxapi('cfg', { cfg: { [k]: v } }), 'Saved');
  app.innerHTML = `<div class="ph fade"><div><h1>GEX Levels</h1><p class=lead>Where dealers' options hedging pins or amplifies SPY. Free, delayed CBOE options data turned into levels and signals. The GEX bot paper-trades the pin-fade signals in Mimic's built-in paper account: it never sends an order to a broker.</p></div></div>
    <div class="card pad"><div id=gxhero></div><div id=gxlvl style="margin-top:18px"></div></div>
    <div id=gxcharts><div class="card pad" style="margin-top:16px"><h2>Gamma by strike</h2><div class=mut style="font-size:12.5px;margin:4px 0 10px">GEX = gamma × open interest × 100 × price, summed over every expiration. Green = call gamma, red = put gamma. The outlined row is the max GEX strike.</div><canvas id=gxstrike style="width:100%;display:block"></canvas></div>
    <div class="card pad" style="margin-top:16px"><h2>SPY and the levels</h2><div class=mut style="font-size:12.5px;margin:4px 0 10px">5-minute candles, last two sessions. White line = max GEX, yellow dashed = zero-gamma flip, shaded = the pin-fade entry zone (0.1% to 0.3% either side of the wall; stop and invalidation sit 0.5% beyond it), dotted = ±1% magnet-drift lines. The chart follows the bot: its entry, stop and target (green and red zones), live price and P&L, then the exit once it closes. If the wall moved after the trade was taken, the wall it was taken against is dashed. Faded arrows are signals the bot did not trade.</div><canvas id=gxprice style="width:100%;display:block"></canvas></div></div>
    <div class="card pad" style="margin-top:16px"><div class="row sb wrapf"><h2>Risk settings</h2><span class=mut style="font-size:12.5px">Unlock a dial to change it</span></div><div class=dials style="margin-top:6px"><div id=gxd1></div><div id=gxd2></div><div id=gxd3></div></div>
      <div class=mut style="font-size:12.5px;line-height:1.55;margin-top:12px;text-align:center">The bot buys or sells SPY shares in Mimic's built-in paper account, riding on your broker balance. Size is the smaller of what the risk dial allows (distance from the price to the stop) and the max position, and you can pick how many trades it takes a day. It stops for the day after a 3% loss, takes one trade at a time, and is flat by 15:55 ET.</div></div>
    ${btCard('gxbt', { opts: [[7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days'], [90, 'Last 90 days']], def: 30, note: 'A true historical backtest needs past options open interest, which is not free anywhere. So this shows what can be measured honestly: the recorded results of the signals, and of your bot\'s paper trades, over the period you pick. It only covers days the bot was switched on.' })}
    <div class="card pad" style="margin-top:16px"><div class="row sb wrapf"><h2>Signals</h2><div id=gxsighead></div></div>
      <div class=mut style="font-size:12.5px;line-height:1.6;margin:8px 0 0"><b>Pin fade</b> (traded): in a long-gamma regime, SPY 0.10% to 0.30% from the max GEX strike (a touch) is faded back to it. Entry = price then, target = the strike, stop = 0.5% beyond the strike. A bar closing 0.5% beyond the strike kills it. <b>Magnet drift</b> (note): SPY 1% or more from the strike in a long-gamma regime, scored at the close. <b>Stand aside</b> (note): net gamma is negative (dealers amplify moves), so no trades; noted once a day.</div></div>
    <div class="card" style="margin-top:16px;overflow:hidden" id=gxtr></div><div class="card" style="margin-top:16px;overflow:hidden" id=gxlog></div>`;
  dialMount('#gxd1', { key: 'gx-risk', value: c.risk, min: .1, max: 2, step: .1, unit: '% risked per trade', size: 'sm', caption: v => eq ? `≈ ${usd(eq * v / 100, 0)} at risk if the stop is hit` : '', onCommit: v => save('risk', v) });
  dialMount('#gxd2', { key: 'gx-max', value: c.max, min: 5, max: 100, step: 5, unit: '% max position', fmt: v => String(Math.round(v)), size: 'sm', caption: v => eq ? `≈ ${usd(eq * v / 100, 0)} largest position` : '', onCommit: v => save('max', v) });
  dialMount('#gxd3', { key: 'gx-per', value: c.per, min: 1, max: 6, step: 1, unit: 'max trades a day', fmt: v => String(Math.round(v)), size: 'sm', caption: () => 'pin-fade signals it will take in a day', onCommit: v => save('per', v) });
  btWire('gxbt', { run: async n => btGexHtml(await gxapi('bt', { days: +n })) });
  gxPaint();
}
addEventListener('resize', () => { if ($('#gxstrike')) { gxDrawStrikes(); gxDrawPrice(); } });

function btGexHtml(r) { const P = r.signals.pin, D = r.signals.drift, T = r.trades;
  return btTiles([['Pin-fade signals', P.n, P.n ? `${P.won} won · ${P.lost} lost (${Math.round(P.won / P.n * 100)}%)` : 'none scored yet'], ['Signal result', P.n ? btPct(P.pnl / 100, 2) : '-', P.n ? `${btPct(P.avg / 100, 2)} a signal, scored on 5-minute candles` : '', P.pnl >= 0 ? 'up' : 'down'], ['Your paper trades', T.n, T.n ? `${btUsd(T.pnl)} · ${T.won} won · ${T.lost} lost` : 'none closed in this period', T.pnl >= 0 ? 'up' : 'down']])
    + btSample(P.n) + btWarn(`Magnet drift notes: ${D.n ? `${D.won} of ${D.n} drifted toward the wall` : 'none scored yet'}. The signals were recorded on ${r.signals.sessions} session${r.signals.sessions == 1 ? '' : 's'} in the last ${r.days} days.`); }
