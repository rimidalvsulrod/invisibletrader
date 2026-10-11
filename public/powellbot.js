// Powell Strategy tab: 5-minute NQ / ES chart (America/New_York) with the 10:00 line, sweep signals, stop and 2R target,
// a backtest of the rule, and the Powell bot (one trade a day through your Alpaca account).
let pwT = null, pwD = null, pwB = null, pwSym = 'NQ', pwIdx = -1;
const pwStop = () => { clearInterval(pwT); pwT = null; };
const pwapi = async (op, body, qs = '') => {
  const r = await fetch('/api/powell' + (body ? '' : '?op=' + op + qs), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const pwn = (x, d = 2) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pwEtToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const pwFut = s => ['NQ', 'ES', 'MNQ', 'MES'].includes(s);
const pwClock = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

async function powellPage() {
  pwStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', powellPage); await signedIn(me.user); }
  app.innerHTML = sk(420);
  try { [pwD, pwB] = await Promise.all([pwapi('data', null, '&sym=' + pwSym), pwapi('state')]); } catch (e) { if (e.status === 401) return authView('login', '', powellPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  pwIdx = pwD.days.length - 1; powellRender();
  pwT = setInterval(async () => { if (!$('#pwcv')) return pwStop(); try { const last = pwIdx === pwD.days.length - 1; pwD = await pwapi('data', null, '&sym=' + pwSym); if (last) pwIdx = pwD.days.length - 1; pwB = await pwapi('state'); powellRender(); } catch (e) {} }, 15000);
}
async function powellLoad(sym) {
  sym = String(sym || '').trim().toUpperCase(); if (!/^(NQ|ES|MNQ|MES)$/.test(sym)) { toast('<span class=down>Use NQ, ES, MNQ or MES</span>'); return powellRender(); }
  pwSym = sym; try { pwD = await pwapi('data', null, '&sym=' + sym); pwIdx = pwD.days.length - 1; } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } powellRender();
}

function powellDraw() {
  const cv = $('#pwcv'); if (!cv || !pwD) return; const day = pwD.days[pwIdx]; if (!day) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = Math.round(Math.min(480, Math.max(300, W * .5))); cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const fg = getComputedStyle(document.body).color, mut = 'rgba(127,127,127,.75)', grid = 'rgba(127,127,127,.14)', UP = '#2fbf71', DN = '#e5484d';
  const L = 34, R = 104, T = 16, B = 26, PW = W - L - R, PH = H - T - B, sg = day.signal, lv = day.levels || {}, cs = day.cs;
  let lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2]));
  if (sg) { lo = Math.min(lo, sg.stop, sg.tp); hi = Math.max(hi, sg.stop, sg.tp); } const pad = (hi - lo) * .05 || 1; lo -= pad; hi += pad;
  const X = m => L + (m - 480) / 480 * PW, Y = p => T + (hi - p) / (hi - lo) * PH, cw = Math.max(1.5, PW / 96 * .66);
  g.font = '11px ui-monospace,Menlo,monospace'; g.textBaseline = 'middle';
  // grid + price axis
  for (let i = 0; i <= 5; i++) { const p = lo + (hi - lo) * i / 5, y = Y(p); g.strokeStyle = grid; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.fillStyle = mut; g.textAlign = 'left'; g.fillText(pwn(p), L + PW + 6, y); }
  g.textAlign = 'center'; for (let m = 480; m <= 960; m += 60) { const x = X(m); g.strokeStyle = grid; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); g.fillStyle = mut; g.fillText(pwClock(m), x, H - 10); }
  // opening range 9:30-10:00 shaded
  g.fillStyle = 'rgba(127,127,200,.08)'; g.fillRect(X(570), T, X(600) - X(570), PH);
  const hline = (p, m0, m1, col, dash, label) => { if (p == null) return; const y = Y(p); g.save(); g.strokeStyle = col; g.setLineDash(dash); g.lineWidth = 1; g.beginPath(); g.moveTo(X(m0), y); g.lineTo(X(m1), y); g.stroke(); g.restore();
    if (label) { g.fillStyle = col; g.textAlign = 'left'; g.fillText(label, X(m1) + 4, y); } };
  hline(lv.orh, 570, 720, 'rgba(150,150,230,.8)', [3, 3], 'OR high'); hline(lv.orl, 570, 720, 'rgba(150,150,230,.8)', [3, 3], 'OR low');
  hline(lv.swh, 480, 600, 'rgba(200,170,90,.7)', [2, 4], 'swing high'); hline(lv.swl, 480, 600, 'rgba(200,170,90,.7)', [2, 4], 'swing low');
  // candles
  for (const [m, o, h, l, c] of cs) { const x = X(m) + (PW / 96) / 2, up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.beginPath(); g.moveTo(x, Y(h)); g.lineTo(x, Y(l)); g.stroke();
    g.fillRect(x - cw / 2, Math.min(Y(o), Y(c)), cw, Math.max(1, Math.abs(Y(o) - Y(c)))); }
  // the 10:00 line
  g.save(); g.strokeStyle = 'rgba(255,200,60,.95)'; g.setLineDash([6, 4]); g.lineWidth = 1.4; g.beginPath(); g.moveTo(X(600), T); g.lineTo(X(600), T + PH); g.stroke(); g.restore();
  g.fillStyle = 'rgba(255,200,60,.95)'; g.textAlign = 'center'; g.fillText('10:00 ET', X(600), T - 2);
  // signal: triangle on the 10:00 candle, entry, stop, 2R target
  if (sg) { const c10 = cs.find(c => c[0] === 600), x = X(600) + (PW / 96) / 2, long = sg.dir === 'long', col = long ? UP : DN;
    if (c10) { g.fillStyle = col; const y = long ? Y(c10[3]) + 9 : Y(c10[2]) - 9, s = 7; g.beginPath(); if (long) { g.moveTo(x, y - s); g.lineTo(x - s, y + s * .8); g.lineTo(x + s, y + s * .8); } else { g.moveTo(x, y + s); g.lineTo(x - s, y - s * .8); g.lineTo(x + s, y - s * .8); } g.closePath(); g.fill(); }
    const end = sg.exitM != null ? sg.exitM + 5 : Math.max(...cs.map(c => c[0])) + 5, t0 = 605;
    hline(sg.entry, t0, end, 'rgba(127,127,127,.9)', [2, 3], null); hline(sg.stop, t0, end, DN, [6, 4], null); hline(sg.tp, t0, end, UP, [6, 4], null);
    g.textAlign = 'left'; g.fillStyle = DN; g.fillText('SL ' + pwn(sg.stop), L + PW + 6, Y(sg.stop) + (long ? 9 : -9)); g.fillStyle = UP; g.fillText('TP ' + pwn(sg.tp), L + PW + 6, Y(sg.tp) + (long ? -9 : 9));
    g.fillStyle = mut; g.fillText('in ' + pwn(sg.entry), L + PW + 6, Y(sg.entry) + 0);
    if (sg.exitM != null) { g.fillStyle = sg.r > 0 ? UP : DN; g.beginPath(); g.arc(X(sg.exitM) + (PW / 96) / 2, Y(sg.exit), 4, 0, 7); g.fill(); } }
}

function powellRender() {
  const D = pwD, B = pwB, day = D.days[pwIdx], sg = day && day.signal, S = D.summary, c = B.cfg, A = B.account, st = B.stats, settled = st.won + st.lost, today = pwEtToday();
  const status = !day ? 'No data' : sg ? `<b class="${sg.dir == 'long' ? 'up' : 'down'}">${sg.dir.toUpperCase()}</b> · swept the ${esc(sg.kind.toLowerCase())} ${pwn(sg.level)} and closed back ${sg.dir == 'long' ? 'above' : 'below'} it · entry ${pwn(sg.entry)} · stop ${pwn(sg.stop)} · target ${pwn(sg.tp)} (2R = ${pwn(sg.R * 2)} pts)${sg.skip ? ` · <span class=mut>not traded: ${esc(sg.skip)}</span>` : ''}${sg.outcome == 'open' ? ' · <span class=ac>running</span>' : sg.r != null ? ` · <b class="${sg.r > 0 ? 'up' : 'down'}">${sg.outcome == 'target' ? 'target hit' : sg.outcome == 'stop' ? 'stopped out' : 'closed 15:55'} ${sg.r >= 0 ? '+' : ''}${sg.r.toFixed(2)}R</b>` : ''}`
    : !day.levels ? `<span class=mut>No complete 9:30 to 10:05 candles for this day.</span>` : day.date == today && !day.cs.some(x => x[0] == 600) ? '<span class=mut>Waiting for the 10:00 candle…</span>' : `<span class=mut>${esc(day.note || 'No sweep on the 10:00 candle: no signal.')}</span>`;
  const tr = B.trades;
  app.innerHTML = `<div class="ph fade"><div><h1>Powell Strategy</h1><p class=lead>The 10 AM sweep on NQ and ES futures. If the 10:00 ET candle wicks through the opening-range extreme (or the latest swing) and closes back inside, that is the signal. Stop beyond the wick, target 2R.</p></div></div>
    <div class="card pad"><div class="row sb wrapf" style="gap:12px"><div class=row style="gap:10px;flex-wrap:wrap"><label class=row style="gap:8px"><span class=mut style="font-size:13px">Symbol</span><input class=inp id=pwsym list=pwsyms value="${esc(pwSym)}" style="width:96px;text-transform:uppercase" autocomplete=off><datalist id=pwsyms><option value=NQ><option value=ES><option value=MNQ><option value=MES></datalist></label>
      <div class=seg id=pwq><button data-v=NQ class="${pwSym == 'NQ' ? 'on' : ''}">NQ</button><button data-v=ES class="${pwSym == 'ES' ? 'on' : ''}">ES</button></div></div>
      <div class=row style="gap:8px"><button class="btn sm" id=pwprev ${pwIdx <= 0 ? 'disabled' : ''}>‹</button><select class=inp id=pwday style="width:auto">${D.days.map((d, i) => `<option value=${i} ${i == pwIdx ? 'selected' : ''}>${d.date}${d.signal ? (d.signal.dir == 'long' ? ' ▲' : ' ▼') : ''}</option>`).join('')}</select><button class="btn sm" id=pwnext ${pwIdx >= D.days.length - 1 ? 'disabled' : ''}>›</button></div></div>
      <div class=mut style="font-size:12.5px;margin:10px 0 8px">${esc(pwSym)} 5-minute candles, America/New_York · last price ${D.price ? pwn(D.price) : '-'} · updated ${new Date(D.t).toLocaleTimeString([], { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ET · free Yahoo Finance data${D.delay ? `, delayed ${D.delay} min` : ''}</div>
      <canvas id=pwcv style="width:100%;display:block"></canvas>
      <div style="font-size:13.5px;margin-top:12px;line-height:1.6">${status}</div>
      <div class=mut style="font-size:12px;margin-top:6px">Yellow dashed line = 10:00 ET · shaded = opening range 9:30 to 10:00 · green ▲ long signal, red ▼ short signal · red dashed = stop, green dashed = 2R target · exits at 15:55 if neither is hit</div></div>
    <div class="grid g2" style="margin-top:16px"><div class="card pad"><h2>Last ${S.days} sessions, same rule</h2>
      <div class=mut style="font-size:12.5px;margin:4px 0 10px">Entry at the signal candle's close, stop 1 tick past the wick, 2R target, closed at 15:55. If one candle touches both, the stop counts first. No commissions.</div>
      <div class="grid g3"><div class=stat><div class=k>Signals</div><div class="v num">${S.closed}</div><div class=s>${S.longs} long · ${S.shorts} short</div></div><div class=stat><div class=k>Hit target</div><div class="v num">${S.target}</div><div class=s>${S.stop} stopped · ${S.time} time exit</div></div><div class=stat><div class=k>Average</div><div class="v num ${ud(S.avgR)}">${S.avgR >= 0 ? '+' : ''}${S.avgR.toFixed(2)}R</div><div class=s>total ${S.totalR >= 0 ? '+' : ''}${S.totalR.toFixed(1)}R</div></div></div>
      <div class=note style="margin-top:12px;font-size:12.5px;line-height:1.55">Read this with care: it signals on only about 1 day in 4, so ${S.closed} trades is a very small sample. A 2R target needs roughly 1 win in 3 to break even. Results can swing a lot with a sample this size, and the first 60 days of 5-minute data is all the free source provides.</div></div>
    <div class="card pad"><div class="row sb"><h2>Powell bot</h2><span class="pill ${B.connected ? (B.paper ? 'n' : 'down') : 'n'}">${!B.connected ? 'Not connected' : B.paper ? 'Paper' : 'Real money'}</span></div>
      <div class=row style="gap:16px;margin-top:10px"><button class="sw ${B.enabled ? 'on' : ''}" id=pwtog aria-label="Powell bot on/off" ${B.connected ? '' : 'disabled'}></button><div><div style="font-size:20px;font-weight:650">${B.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:12.5px">${B.connected ? 'One trade a day, 10:06 to 10:30 ET' : 'Connect Alpaca in the Newsflash tab first'}</div></div>${B.connected ? '' : '<a class="btn pri sm" href="#/news" style="margin-left:auto">Connect</a>'}</div>
      ${B.accountError ? `<div class=note style="margin-top:10px">${esc(B.accountError)}</div>` : ''}
      <div class=row style="gap:14px;flex-wrap:wrap;margin-top:14px"><label class=row style="gap:8px"><span class=mut style="font-size:13px">Signal</span><select class=inp id=pwbs style="width:auto"><option value=NQ ${c.sym == 'NQ' ? 'selected' : ''}>NQ</option><option value=ES ${c.sym == 'ES' ? 'selected' : ''}>ES</option></select></label>
        <label class=row style="gap:8px"><span class=mut style="font-size:13px">Trades</span><select class=inp id=pwin style="width:auto"><option value=futures ${c.inst != 'etf' ? 'selected' : ''}>The futures (built-in paper)</option><option value=etf ${c.inst == 'etf' ? 'selected' : ''}>${c.sym == 'NQ' ? 'QQQ' : 'SPY'} on your broker</option></select></label>
        <label class=row style="gap:8px"><input class=inp type=number id=pwrisk value=${c.risk} min=.1 max=2 step=.1 style="width:80px"><b>% risked</b></label><label class=row style="gap:8px"><input class=inp type=number id=pwmax value=${c.max} min=5 max=100 step=5 style="width:80px"><b>% max size</b></label></div>
      <div class=mut style="font-size:12.5px;line-height:1.55;margin-top:10px">${c.inst == 'etf' ? `Trades ${c.sym == 'NQ' ? 'QQQ' : 'SPY'} on your connected broker (the same percentage stop and 2R target as a bracket order; whole shares; shorts need a shortable ETF).` : `<b>Alpaca and Webull cannot trade futures</b>, so the real ${esc(c.sym)} contracts trade in Mimic's built-in paper account: the signal's own stop and 2R target, real contract sizes (micro contracts when ${esc(c.sym)} is too big for your risk), simulated fills. The paper account rides on your Alpaca balance.`} One trade a day. It skips the day if it already holds the instrument, and closes anything open at 15:55 ET.</div>
      <div class=mut style="font-size:13px;margin-top:14px;line-height:1.7">Account <b class=num style="color:var(--text)">${A ? usd(A.equity, 0) : '-'}</b>${A ? ` (today <span class="${ud(A.day)}">${sg2(A.day)}</span>)` : ''} · Win rate <b class=num style="color:var(--text)">${settled ? Math.round(st.won / settled * 100) + '%' : '-'}</b> (${st.won} won, ${st.lost} lost) · Bot profit <b class="num ${ud(st.pnl)}">${sg2(st.pnl)}</b></div></div></div></div>
    <div class="card" style="margin-top:16px;overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Bot trades</h2></div><table class=tbl><tbody>${tr.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.status == 'skip' ? 'n' : t.pnl > 0 ? 'up' : t.pnl < 0 ? 'down' : 'n'}">${t.status == 'open' ? 'Open' : t.status == 'skip' ? 'Skipped' : t.pnl > 0 ? 'Won' : t.pnl < 0 ? 'Lost' : 'Closed'}</span></td>
      <td><div><b>${esc(t.day)}</b> · ${t.dir == 'long' ? '<span class=up>Long</span>' : '<span class=down>Short</span>'} ${esc(t.etf)} from ${esc(t.fut)} · ${esc(t.kind || '')}</div><div class=mut style="font-size:12.5px;margin-top:2px">${t.qty ? (pwFut(t.etf) ? `${t.qty} ${esc(t.etf)} contract${t.qty == 1 ? '' : 's'} at ${pwn(t.entry)} · stop ${pwn(t.stop)} · target ${pwn(t.tp)} · built-in paper` : `${t.qty} sh at ${usd(t.entry, 2)} · stop ${usd(t.stop, 2)} · target ${usd(t.tp, 2)}`) : ''}${t.exitp ? ` · exit ${pwFut(t.etf) ? pwn(t.exitp) : usd(t.exitp, 2)}` : ''}${t.reason ? ` · ${esc(t.reason)}` : ''}</div></td>
      <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? '' : sg2(t.pnl)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It trades only when the 10:00 candle sweeps and reclaims a level, at most once a day.</td></tr>`}</tbody></table></div>`;
  powellDraw();
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } pwB = await pwapi('state').catch(() => pwB); powellRender(); };
  $('#pwsym').onchange = () => powellLoad($('#pwsym').value); $$('#pwq button').forEach(b => b.onclick = () => powellLoad(b.dataset.v));
  $('#pwday').onchange = () => { pwIdx = +$('#pwday').value; powellRender(); }; $('#pwprev').onclick = () => { pwIdx = Math.max(0, pwIdx - 1); powellRender(); }; $('#pwnext').onclick = () => { pwIdx = Math.min(D.days.length - 1, pwIdx + 1); powellRender(); };
  $('#pwtog').onclick = () => { if (!B.enabled && !B.paper && !confirm('Start the Powell bot with REAL money on your Alpaca account?')) return; act(() => pwapi(B.enabled ? 'stop' : 'start', {}), B.enabled ? 'Powell bot paused' : 'Powell bot started'); };
  $('#pwbs').onchange = () => act(() => pwapi('cfg', { cfg: { sym: $('#pwbs').value } }), 'Saved'); $('#pwin').onchange = () => act(() => pwapi('cfg', { cfg: { inst: $('#pwin').value } }), 'Saved'); $('#pwrisk').onchange = () => act(() => pwapi('cfg', { cfg: { risk: +$('#pwrisk').value } }), 'Saved'); $('#pwmax').onchange = () => act(() => pwapi('cfg', { cfg: { max: +$('#pwmax').value } }), 'Saved');
}
const sg2 = x => (x >= 0 ? '+' : '-') + '$' + Math.abs(x).toFixed(2);
addEventListener('resize', () => { if ($('#pwcv')) powellDraw(); });
