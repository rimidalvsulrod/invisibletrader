// Supertrend Bot tab: copies the Supertrend indicator's colour flips on 15-minute NQ / ES candles in the built-in paper account.
// It acts on a 15-minute timer (only when a bar closes). Shows balance and profit, the chart with the line and the bot's position,
// risk dials, a backtest of the same rules, and every trade. Helpers (pwn, sg2, PWM, pwFut, pwEtToday) come from powellbot.js.
let stT = null, stT2 = null, stD = null, stB = null;
const stStop = () => { clearInterval(stT); clearInterval(stT2); stT = stT2 = null; };
const stapi = async (op, body) => {
  const r = await fetch('/api/powell' + (body ? '' : '?op=st-' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'st-' + op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const stDay = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const stClock = t => new Date(t).toLocaleTimeString([], { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const stTrade = () => { const t = (stB?.trades || []).filter(x => x.status != 'skip'); return t.find(x => x.status == 'open') || t.find(x => x.day == pwEtToday()) || null; };
const stNext = () => { const n = Date.now(), b = Math.ceil((n - 2e4) / 9e5) * 9e5 + 2e4; return b <= n ? b + 9e5 : b; }; // the next bar close + 20s
const stOpenPnl = t => { if (!t || t.status != 'open' || !stD?.last) return null; return (stD.last - t.entry) * (t.dir == 'long' ? 1 : -1) * t.qty * (PWM[t.sym] || 1); };

async function supertrendPage() {
  stStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', supertrendPage); await signedIn(me.user); }
  app.innerHTML = sk(420);
  try { [stB, stD] = await Promise.all([stapi('state'), stapi('data')]); } catch (e) { if (e.status === 401) return authView('login', '', supertrendPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  stRender();
  stT = setInterval(async () => { if (!$('#stcv')) return stStop(); try { [stB, stD] = await Promise.all([stapi('state'), stapi('data')]); stPaint(); } catch (e) {} }, 15000); // live parts only: never resets a dial
  stT2 = setInterval(() => { const el = $('#stnext'); if (!el) return; const s = Math.max(0, Math.round((stNext() - Date.now()) / 1000)); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
}

function stDraw() {
  const cv = $('#stcv'); if (!cv || !stD || !stD.bars.length) return; const bars = stD.bars, dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = Math.round(Math.min(460, Math.max(300, W * .48))); cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const fg = getComputedStyle(document.body).color, mut = 'rgba(127,127,127,.75)', grid = 'rgba(127,127,127,.14)', UP = '#2fbf71', DN = '#e5484d';
  const L = 10, R = 100, T = 14, B = 26, PW = W - L - R, PH = H - T - B, N = bars.length, tr = stTrade(), mine = tr && bars.some(b => stDay(b[0]) == tr.day) ? tr : null;
  let lo = Math.min(...bars.map(b => b[3]), ...bars.filter(b => b[5] != null).map(b => b[5])), hi = Math.max(...bars.map(b => b[2]), ...bars.filter(b => b[5] != null).map(b => b[5])); if (mine) { lo = Math.min(lo, mine.stop, mine.entry); hi = Math.max(hi, mine.stop, mine.entry); } const pad = (hi - lo) * .05 || 1; lo -= pad; hi += pad;
  const X = i => L + (i + .5) / N * PW, Y = p => T + (hi - p) / (hi - lo) * PH, cw = Math.max(1.5, PW / N * .62); g.font = '11px ui-monospace,Menlo,monospace'; g.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) { const p = lo + (hi - lo) * i / 5, y = Y(p); g.strokeStyle = grid; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.fillStyle = mut; g.textAlign = 'left'; g.fillText(pwn(p), L + PW + 6, y); }
  let prevDay = null; bars.forEach((b, i) => { const d = stDay(b[0]); if (d != prevDay) { const x = L + i / N * PW; g.strokeStyle = 'rgba(127,127,127,.35)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); g.setLineDash([]); g.fillStyle = mut; g.textAlign = 'left'; g.fillText(d.slice(5), x + 4, H - 10); prevDay = d; } });
  // the bot's position: zone from entry to the (trailing) stop, then candles on top
  let ei = -1; if (mine) { ei = bars.findIndex(b => b[0] <= mine.ts && mine.ts < b[0] + 9e5); if (ei < 0) ei = bars.findIndex(b => b[0] > mine.ts - 9e5); }
  if (mine && ei >= 0) { const endI = mine.status == 'open' ? N - 1 : Math.max(ei, bars.findIndex(b => mine.exitts && b[0] + 9e5 > mine.exitts)); g.fillStyle = 'rgba(229,72,77,.10)'; g.fillRect(X(ei), Math.min(Y(mine.entry), Y(mine.stop)), X(Math.max(endI, ei + 1)) - X(ei), Math.abs(Y(mine.stop) - Y(mine.entry))); }
  bars.forEach((b, i) => { const [, o, h, l, c] = b, x = X(i), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.beginPath(); g.moveTo(x, Y(h)); g.lineTo(x, Y(l)); g.stroke(); g.fillRect(x - cw / 2, Math.min(Y(o), Y(c)), cw, Math.max(1, Math.abs(Y(o) - Y(c)))); });
  g.lineWidth = 2; for (let i = 1; i < N; i++) { const a = bars[i - 1], b = bars[i]; if (a[5] == null || b[5] == null || a[6] != b[6]) continue; g.strokeStyle = b[6] == 1 ? UP : DN; g.beginPath(); g.moveTo(X(i - 1), Y(a[5])); g.lineTo(X(i), Y(b[5])); g.stroke(); } g.lineWidth = 1;
  for (let i = 1; i < N; i++) if (bars[i][6] != bars[i - 1][6] && bars[i][5] != null) { const up = bars[i][6] == 1, x = X(i), y = up ? Y(bars[i][3]) + 12 : Y(bars[i][2]) - 12, s = 6; g.fillStyle = up ? UP : DN; g.beginPath(); if (up) { g.moveTo(x, y - s); g.lineTo(x - s, y + s * .8); g.lineTo(x + s, y + s * .8); } else { g.moveTo(x, y + s); g.lineTo(x - s, y - s * .8); g.lineTo(x + s, y - s * .8); } g.closePath(); g.fill(); }
  if (mine && ei >= 0) { const long = mine.dir == 'long', endI = mine.status == 'open' ? N - 1 : Math.max(ei, bars.findIndex(b => mine.exitts && b[0] + 9e5 > mine.exitts)), x0 = X(ei), x1 = X(Math.max(endI, ei + 1));
    g.strokeStyle = fg; g.beginPath(); g.moveTo(x0, Y(mine.entry)); g.lineTo(x1, Y(mine.entry)); g.stroke(); g.save(); g.strokeStyle = DN; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(x0, Y(mine.stop)); g.lineTo(x1, Y(mine.stop)); g.stroke(); g.restore();
    g.textAlign = 'left'; g.fillStyle = fg; g.fillText('in ' + pwn(mine.entry), L + PW + 6, Y(mine.entry) + (long ? -9 : 9)); g.fillStyle = DN; g.fillText('stop ' + pwn(mine.stop), L + PW + 6, Y(mine.stop) + (long ? 9 : -9));
    const pnl = mine.status == 'open' ? stOpenPnl(mine) : mine.pnl, txt = `${long ? 'LONG' : 'SHORT'} ${mine.qty} ${mine.sym} · ${mine.status == 'open' ? 'open' : 'closed'}${pnl != null ? '  ' + sg2(pnl) : ''}`; g.font = '600 12px ui-monospace,Menlo,monospace'; const w = g.measureText(txt).width + 18;
    g.fillStyle = 'rgba(8,10,12,.78)'; g.fillRect(L + 6, T + 6, w, 24); g.fillStyle = pnl == null ? fg : pnl >= 0 ? UP : DN; g.fillText(txt, L + 15, T + 18);
    if (mine.status == 'open' && stD.last) { const y = Y(stD.last); g.save(); g.strokeStyle = pnl >= 0 ? UP : DN; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.restore(); g.fillStyle = pnl >= 0 ? UP : DN; g.fillRect(L + PW + 2, y - 8, 96, 16); g.fillStyle = '#04100a'; g.font = '11px ui-monospace,Menlo,monospace'; g.fillText('now ' + pwn(stD.last), L + PW + 6, y); } }
}

/* ---------- live regions ---------- */
function stHero() {
  const B = stB, A = B.account, st = B.stats, c = B.cfg, open = B.trades.find(t => t.status == 'open'), cur = stTrade(), today = pwEtToday(), settled = st.won + st.lost, live = open ? stOpenPnl(open) : null;
  const closedToday = B.trades.filter(t => t.status == 'closed' && t.pnl != null && t.day == today).reduce((n, t) => n + t.pnl, 0), todayPnl = closedToday + (live || 0), profit = st.pnl + (live || 0), last = stD?.bars[stD.bars.length - 1], line = last && last[5] != null ? last : null;
  const strip = open ? `<b class="${open.dir == 'long' ? 'up' : 'down'}">${open.dir == 'long' ? 'LONG' : 'SHORT'}</b> ${open.qty} ${esc(open.sym)} (built-in paper) · in <b class=num>${pwn(open.entry)}</b> · stop <span class=num>${pwn(open.stop)}</span> (trails the line) ${live != null ? `· <b class="num ${live >= 0 ? 'up' : 'down'}">${sg2(live)}</b> right now` : ''}`
    : `Flat. ${line ? `Supertrend is <b class="${line[6] == 1 ? 'up' : 'down'}">${line[6] == 1 ? 'GREEN' : 'RED'}</b> (line ${pwn(line[5])}). ` : ''}${B.enabled ? 'Waiting for the next colour flip.' : 'The bot is paused.'}${cur && cur.status == 'closed' ? ` Last trade today: <b class="${cur.pnl > 0 ? 'up' : 'down'}">${cur.pnl != null ? sg2(cur.pnl) : 'closed'}</b>.` : ''}`;
  return `<div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${B.enabled ? 'on' : ''}" id=sttog aria-label="Supertrend bot on/off" ${B.connected ? '' : 'disabled'}></button>
    <div><div style="font-size:22px;font-weight:650">${B.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">${!B.connected ? 'Connect Alpaca in the Newsflash tab first' : `Checks every 15 minutes, 20 seconds after a bar closes · next check in <b class=num id=stnext>…</b>`}</div></div></div>
    <div class=row style="gap:8px"><span class="pill n">Built-in paper</span>${B.connected ? '' : '<a class="btn pri sm" href="#/news">Connect</a>'}</div></div>${B.accountError ? `<div class=note style="margin-top:12px">${esc(B.accountError)}</div>` : ''}
    <div class="grid g3" id=pwstats style="margin-top:18px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class=stat><div class=k>Balance</div><div class="v num">${A ? usd(A.equity, 2) : '-'}</div><div class=s>${A ? `cash ${usd(A.cash, 2)} · includes paper P&L` : 'on your broker'}</div></div>
      <div class=stat><div class=k>Today</div><div class="v num ${ud(todayPnl)}">${sg2(todayPnl)}</div><div class=s>${live != null ? 'includes the open trade' : 'closed trades today'}</div></div><div class=stat><div class=k>Bot profit</div><div class="v num ${ud(profit)}">${sg2(profit)}</div><div class=s>${st.n} closed · after commissions</div></div>
      <div class=stat><div class=k>Win rate</div><div class="v num">${settled ? Math.round(st.won / settled * 100) + '%' : '-'}</div><div class=s>${st.won} won · ${st.lost} lost</div></div></div>
    <div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--fill);font-size:13.5px;line-height:1.55"><span class=mut>Trading now · </span>${strip}</div>`;
}
function stMeta() { const D = stD, c = stB.cfg;
  return `<div class=mut style="font-size:12.5px;margin:10px 0 0">${esc(c.sym)} 15-minute candles, America/New_York · Supertrend(${c.atr}, ${c.mult}) · last ${D.last ? pwn(D.last) : '-'} · latest bar ${D.t ? stClock(D.t) : '-'} ET · free Yahoo Finance data</div>
    <div class=mut style="font-size:12px;margin-top:6px">Green line = uptrend (it trails below price and is the stop), red line = downtrend. ▲ flips green, ▼ flips red. The bot copies each flip inside the NY session. Shaded red = the distance to the stop.</div>`; }
function stBacktest(b = stD.backtest) { const c = stB.cfg;
  return `<h2>Last ${b.days} sessions, same rules</h2><div class=mut style="font-size:12.5px;margin:4px 0 10px">${esc(c.sym)} 15m, ${b.from} to ${b.to}, Supertrend(${c.atr}, ${c.mult}), NY session only${c.adx ? ', skips choppy flips (ADX under 20)' : ''}, at most ${c.max} trades a day. Includes 1 tick of slippage each way and commissions ($${(b.micro == 'MNQ' || b.micro == 'MES' ? 1.24 : 4.5).toFixed(2)} a round trip per contract), one ${b.micro} contract.</div>
    <div class="grid g3" id=stbt><div class=stat><div class=k>Trades</div><div class="v num">${b.trades}</div><div class=s>${Math.round(b.win * 100)}% won</div></div><div class=stat><div class=k>Net, per ${b.micro}</div><div class="v num ${ud(b.totalUsd)}">${sg2(b.totalUsd)}</div><div class=s>${b.avgPts >= 0 ? '+' : ''}${b.avgPts.toFixed(1)} pts a trade</div></div><div class=stat><div class=k>Typical stop</div><div class="v num">${b.avgStop.toFixed(0)} pts</div><div class=s>worst trade ${sg2(b.worst)}</div></div></div>
    <div class=note style="margin-top:12px;font-size:12.5px;line-height:1.55">${b.totalUsd < 0 ? `<b>On these sessions these settings lose money.</b> ` : ''}Supertrend is a trend follower: it makes money in smooth trends and gives it back in chop, and its stop is the line itself, which sits ${b.avgStop.toFixed(0)} points away on average. That is why the bot sizes each trade by the distance to the stop, and only 15m bars, the NY session, the chop filter and a daily trade limit are used. About ${b.days} sessions is a very small sample, so treat this bot as a paper experiment.</div>`; }
function stTradesHtml() {
  return `<div class="pad" style="padding-bottom:8px"><h2>Bot trades</h2></div><table class=tbl><tbody>${stB.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.status == 'skip' ? 'n' : t.pnl > 0 ? 'up' : t.pnl < 0 ? 'down' : 'n'}">${t.status == 'open' ? 'Open' : t.status == 'skip' ? 'Skipped' : t.pnl > 0 ? 'Won' : t.pnl < 0 ? 'Lost' : 'Closed'}</span></td>
    <td><div><b>${esc(t.day)}</b> · ${t.dir == 'long' ? '<span class=up>Long</span>' : '<span class=down>Short</span>'} ${esc(t.sym)}</div><div class=mut style="font-size:12.5px;margin-top:2px">${t.qty ? `${t.qty} contract${t.qty == 1 ? '' : 's'} at ${pwn(t.entry)} · stop ${pwn(t.stop)} · built-in paper` : ''}${t.exitp ? ` · exit ${pwn(t.exitp)}` : ''}${t.reason ? ` · ${esc(t.reason)}` : ''}</div></td>
    <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? '' : sg2(t.pnl)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It copies a Supertrend flip only inside the NY session, and skips it when the market is choppy or the daily limit is reached.</td></tr>`}</tbody></table>`;
}
function stPaint() { if (!$('#sthero')) return; $('#sthero').innerHTML = stHero(); $('#stmeta').innerHTML = stMeta(); $('#sttr').innerHTML = stTradesHtml(); const B = stB;
  $('#sttog') && ($('#sttog').onclick = () => stAct(() => stapi(B.enabled ? 'stop' : 'start', {}), B.enabled ? 'Supertrend bot paused' : 'Supertrend bot started')); stDraw(); }
const stAct = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } try { [stB, stD] = await Promise.all([stapi('state'), stapi('data')]); } catch (e) {} stRender(); };
function stRender() {
  const B = stB, c = B.cfg, eq = B.account ? B.account.equity : null, save = (k, v) => stAct(() => stapi('cfg', { cfg: { [k]: v } }), 'Saved');
  app.innerHTML = `<div class="ph fade"><div><h1>Supertrend Bot</h1><p class=lead>Copies the Supertrend indicator's colour flips on 15-minute NQ and ES candles. Long when the line turns green, short when it turns red, with the line as the trailing stop. It looks once every 15 minutes, when a bar closes.</p></div></div>
    <div class="card pad" id=sthero></div><div class="card pad" style="margin-top:16px"><canvas id=stcv style="width:100%;display:block"></canvas><div id=stmeta></div></div>
    <div class="card pad" style="margin-top:16px"><div class="row sb wrapf"><h2>Risk settings</h2><span class=mut style="font-size:12.5px">Unlock a dial to change it</span></div><div class=dials style="margin-top:6px"><div id=std1></div><div id=std2></div><div id=std3></div><div id=std4></div></div>
      <div class=row style="gap:14px;flex-wrap:wrap;margin-top:14px;justify-content:center"><label class=row style="gap:8px"><span class=mut style="font-size:13px">Trades</span><select class=inp id=stsym style="width:auto"><option value=NQ ${c.sym == 'NQ' ? 'selected' : ''}>NQ (Nasdaq-100)</option><option value=ES ${c.sym == 'ES' ? 'selected' : ''}>ES (S&P 500)</option></select></label>
        <div class=row style="gap:8px"><span class=mut style="font-size:13px">Skip choppy markets</span><div class=seg id=stadx><button data-v=on class="${c.adx ? 'on' : ''}">On</button><button data-v=off class="${c.adx ? '' : 'on'}">Off</button></div></div></div>
      <div class=mut style="font-size:12.5px;line-height:1.55;margin-top:12px;text-align:center">Alpaca and Webull cannot trade futures, so the bot trades the real ${esc(c.sym)} contracts in Mimic's built-in paper account (micro contracts when ${esc(c.sym)} is too big for your risk), riding on your broker balance. Entries 9:30 to 15:30 ET, flat by 15:55. Size is set by the distance to the stop, so a wider line means fewer contracts.</div></div>
    ${btCard('stbtc', { opts: [[5, 'Last 5 sessions'], [10, 'Last 10 sessions'], [20, 'Last 20 sessions'], [40, 'Last 40 sessions'], [60, 'All the data (about 60)']], def: 60, note: `Replays the Supertrend rules on free 15-minute ${esc(c.sym)} candles. Free data only goes back about 60 sessions.`, initial: stBacktest() })}<div class="card" style="margin-top:16px;overflow:hidden" id=sttr></div>`;
  dialMount('#std1', { key: 'st-risk', value: c.risk, min: .1, max: 2, step: .1, unit: '% risked per trade', size: 'sm', caption: v => eq ? `≈ ${usd(eq * v / 100, 0)} at risk if the stop is hit` : '', onCommit: v => save('risk', v) });
  dialMount('#std2', { key: 'st-mult', value: c.mult, min: 1, max: 6, step: .5, unit: 'ATR multiplier', size: 'sm', caption: v => v > c.mult ? 'wider line: fewer flips, bigger stops' : v < c.mult ? 'tighter line: more flips, smaller stops' : 'standard is 3', onCommit: v => save('mult', v) });
  dialMount('#std3', { key: 'st-atr', value: c.atr, min: 5, max: 20, step: 1, unit: 'ATR period (bars)', fmt: v => String(Math.round(v)), size: 'sm', caption: () => 'standard is 10', onCommit: v => save('atr', v) });
  dialMount('#std4', { key: 'st-max', value: c.max, min: 1, max: 6, step: 1, unit: 'max trades a day', fmt: v => String(Math.round(v)), size: 'sm', caption: () => 'a limit on flip-flopping costs', onCommit: v => save('max', v) });
  $('#stsym').onchange = () => save('sym', $('#stsym').value); $$('#stadx button').forEach(b => b.onclick = () => save('adx', b.dataset.v == 'on'));
  btWire('stbtc', { run: async n => stBacktest((await stapi('bt', { days: +n })).backtest) });
  stPaint();
}
addEventListener('resize', () => { if ($('#stcv')) stDraw(); });
