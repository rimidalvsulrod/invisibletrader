// Powell Strategy tab: your balance and profit, what the bot is trading right now (the chart follows its position), the 10 AM sweep
// signal on 5-minute NQ / ES candles (America/New_York), risk dials, the backtest, and every trade.
let pwT = null, pwD = null, pwB = null, pwSym = 'NQ', pwIdx = -1, pwManual = false;
const pwStop = () => { clearInterval(pwT); pwT = null; };
const pwapi = async (op, body, qs = '') => {
  const r = await fetch('/api/powell' + (body ? '' : '?op=' + op + qs), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const pwn = (x, d = 2) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pwEtToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const pwClock = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const pwMin = ts => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ts)); return (+p.find(x => x.type == 'hour').value % 24) * 60 + +p.find(x => x.type == 'minute').value; };
const PWM = { NQ: 20, MNQ: 2, ES: 50, MES: 5 }, pwFut = s => s in PWM, pwRoot = s => ({ MNQ: 'NQ', QQQ: 'NQ', MES: 'ES', SPY: 'ES' })[s] || s;
const sg2 = x => (x >= 0 ? '+' : '-') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// the trade the bot is in right now, else today's closed one: this is what the chart shows
const pwCurrent = () => { const t = (pwB?.trades || []).filter(x => x.status != 'skip'); return t.find(x => x.status == 'open') || t.find(x => x.day == pwEtToday()) || null; };
function pwFocus() { // chart follows the bot's trade (or its signal symbol) until you pick something yourself
  if (pwManual || !pwB) return; const cur = pwCurrent(); pwSym = cur ? pwRoot(cur.fut || cur.etf) : pwB.cfg.sym;
}
function pwSetIdx() { if (!pwD) return; if (!pwManual) { const cur = pwCurrent(), i = cur ? pwD.days.findIndex(d => d.date == cur.day) : -1; pwIdx = i >= 0 ? i : pwD.days.length - 1; } pwIdx = Math.min(Math.max(pwIdx, 0), pwD.days.length - 1); }
// live profit on an open trade, from the chart's latest price (futures: exact; ETF: from the signal's percentage move)
function pwOpenPnl(t) {
  if (!t || t.status != 'open' || !pwD || pwD.sym != pwRoot(t.fut || t.etf)) return null; const day = pwD.days[pwD.days.length - 1]; if (!day || day.date != t.day || !day.cs.length) return null; const px = day.cs[day.cs.length - 1][4], long = t.dir == 'long', sg = day.signal;
  if (pwFut(t.etf)) return (px - t.entry) * t.qty * PWM[t.etf] * (long ? 1 : -1);
  return sg ? (px - sg.entry) / sg.entry * (long ? 1 : -1) * t.qty * t.entry : null;
}
const pwR = (t, pnl) => { const risk = pwFut(t.etf) ? Math.abs(t.entry - t.stop) * t.qty * PWM[t.etf] : Math.abs(t.entry - t.stop) * t.qty; return risk > 0 && pnl != null ? pnl / risk : null; };

async function pwLoadData(sym) { pwD = await pwapi('data', null, '&sym=' + sym); pwSetIdx(); }
async function powellPage() {
  pwStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', powellPage); await signedIn(me.user); }
  app.innerHTML = sk(420); pwManual = false;
  try { pwB = await pwapi('state'); pwFocus(); await pwLoadData(pwSym); } catch (e) { if (e.status === 401) return authView('login', '', powellPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  powellRender();
  pwT = setInterval(async () => { if (!$('#pwcv')) return pwStop(); try { pwB = await pwapi('state'); const was = pwSym; pwFocus(); await pwLoadData(pwSym); if (pwSym != was) powellRender(); else paintDynamic(); } catch (e) {} }, 15000); // refreshes only the live parts, never the dials
}
async function powellLoad(sym) {
  sym = String(sym || '').trim().toUpperCase(); if (!/^(NQ|ES|MNQ|MES)$/.test(sym)) { toast('<span class=down>Use NQ, ES, MNQ or MES</span>'); return powellRender(); }
  pwManual = true; pwSym = sym; try { await pwLoadData(sym); pwIdx = pwD.days.length - 1; } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } powellRender();
}

/* ---------- chart ---------- */
function powellDraw() {
  const cv = $('#pwcv'); if (!cv || !pwD) return; const day = pwD.days[pwIdx]; if (!day) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = Math.round(Math.min(480, Math.max(300, W * .5))); cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const fg = getComputedStyle(document.body).color, mut = 'rgba(127,127,127,.75)', grid = 'rgba(127,127,127,.14)', UP = '#2fbf71', DN = '#e5484d';
  const L = 34, R = 104, T = 16, B = 26, PW = W - L - R, PH = H - T - B, sg = day.signal, lv = day.levels || {}, cs = day.cs, tr = pwCurrent(), mine = tr && tr.day == day.date ? tr : null;
  // the bot's position in chart prices (ETF trades use the signal's own levels: same percentage stop and target)
  const pos = mine && (pwFut(mine.etf) ? { entry: mine.entry, stop: mine.stop, tp: mine.tp } : sg ? { entry: sg.entry, stop: sg.stop, tp: sg.tp } : null), lvl = pos || (sg ? { entry: sg.entry, stop: sg.stop, tp: sg.tp } : null);
  let lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2])); if (lvl) { lo = Math.min(lo, lvl.stop, lvl.tp); hi = Math.max(hi, lvl.stop, lvl.tp); } const pad = (hi - lo) * .05 || 1; lo -= pad; hi += pad;
  const X = m => L + (m - 480) / 480 * PW, Y = p => T + (hi - p) / (hi - lo) * PH, cw = Math.max(1.5, PW / 96 * .66), half = PW / 96 / 2;
  g.font = '11px ui-monospace,Menlo,monospace'; g.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) { const p = lo + (hi - lo) * i / 5, y = Y(p); g.strokeStyle = grid; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.fillStyle = mut; g.textAlign = 'left'; g.fillText(pwn(p), L + PW + 6, y); }
  g.textAlign = 'center'; for (let m = 480; m <= 960; m += 60) { const x = X(m); g.strokeStyle = grid; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); g.fillStyle = mut; g.fillText(pwClock(m), x, H - 10); }
  g.fillStyle = 'rgba(127,127,200,.08)'; g.fillRect(X(570), T, X(600) - X(570), PH);
  const hline = (p, m0, m1, col, dash, label) => { if (p == null) return; const y = Y(p); g.save(); g.strokeStyle = col; g.setLineDash(dash); g.lineWidth = 1; g.beginPath(); g.moveTo(X(m0), y); g.lineTo(X(m1), y); g.stroke(); g.restore(); if (label) { g.fillStyle = col; g.textAlign = 'left'; g.fillText(label, X(m1) + 4, y); } };
  hline(lv.orh, 570, 720, 'rgba(150,150,230,.8)', [3, 3], 'OR high'); hline(lv.orl, 570, 720, 'rgba(150,150,230,.8)', [3, 3], 'OR low'); hline(lv.swh, 480, 600, 'rgba(200,170,90,.7)', [2, 4], 'swing high'); hline(lv.swl, 480, 600, 'rgba(200,170,90,.7)', [2, 4], 'swing low');
  // position zones first, so candles sit on top: green = the way to the target, red = the way to the stop
  const lastM = cs.length ? cs[cs.length - 1][0] + 5 : 605, endM = mine ? (mine.status == 'open' ? Math.max(lastM, 610) : mine.exitts ? Math.min(960, pwMin(mine.exitts) + 5) : 960) : sg && sg.exitM != null ? sg.exitM + 5 : lastM;
  if (lvl && (mine || sg)) { const x0 = X(605), x1 = X(Math.max(endM, 610)); g.fillStyle = 'rgba(47,191,113,.10)'; g.fillRect(x0, Math.min(Y(lvl.entry), Y(lvl.tp)), x1 - x0, Math.abs(Y(lvl.tp) - Y(lvl.entry))); g.fillStyle = 'rgba(229,72,77,.10)'; g.fillRect(x0, Math.min(Y(lvl.entry), Y(lvl.stop)), x1 - x0, Math.abs(Y(lvl.stop) - Y(lvl.entry))); }
  for (const [m, o, h, l, c] of cs) { const x = X(m) + half, up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.beginPath(); g.moveTo(x, Y(h)); g.lineTo(x, Y(l)); g.stroke(); g.fillRect(x - cw / 2, Math.min(Y(o), Y(c)), cw, Math.max(1, Math.abs(Y(o) - Y(c)))); }
  g.save(); g.strokeStyle = 'rgba(255,200,60,.95)'; g.setLineDash([6, 4]); g.lineWidth = 1.4; g.beginPath(); g.moveTo(X(600), T); g.lineTo(X(600), T + PH); g.stroke(); g.restore(); g.fillStyle = 'rgba(255,200,60,.95)'; g.textAlign = 'center'; g.fillText('10:00 ET', X(600), T - 2);
  if (sg) { const c10 = cs.find(c => c[0] === 600), long = sg.dir === 'long', col = long ? UP : DN;
    if (c10) { g.fillStyle = col; const x = X(600) + half, y = long ? Y(c10[3]) + 9 : Y(c10[2]) - 9, s = 7; g.beginPath(); if (long) { g.moveTo(x, y - s); g.lineTo(x - s, y + s * .8); g.lineTo(x + s, y + s * .8); } else { g.moveTo(x, y + s); g.lineTo(x - s, y - s * .8); g.lineTo(x + s, y - s * .8); } g.closePath(); g.fill(); } }
  if (lvl && (mine || sg)) { const long = (mine ? mine.dir : sg.dir) == 'long';
    hline(lvl.entry, 605, endM, mine ? fg : 'rgba(127,127,127,.9)', mine ? [] : [2, 3], null); hline(lvl.stop, 605, endM, DN, [6, 4], null); hline(lvl.tp, 605, endM, UP, [6, 4], null);
    g.textAlign = 'left'; g.fillStyle = DN; g.fillText('SL ' + pwn(lvl.stop), L + PW + 6, Y(lvl.stop) + (long ? 9 : -9)); g.fillStyle = UP; g.fillText('TP ' + pwn(lvl.tp), L + PW + 6, Y(lvl.tp) + (long ? -9 : 9)); g.fillStyle = mine ? fg : mut; const nowY = mine && mine.status == 'open' && cs.length ? Y(cs[cs.length - 1][4]) : -99; g.fillText('in ' + pwn(lvl.entry), L + PW + 6, Y(lvl.entry) + (Math.abs(Y(lvl.entry) - nowY) < 16 ? (nowY >= Y(lvl.entry) ? -11 : 11) : 0));
    const ex = mine ? (mine.exitp && pwFut(mine.etf) ? mine.exitp : null) : sg.exit; if ((mine ? mine.status == 'closed' : sg.exitM != null) && ex != null) { g.fillStyle = (mine ? mine.pnl : sg.r) > 0 ? UP : DN; g.beginPath(); g.arc(X(endM - 5) + half, Y(ex), 4.5, 0, 7); g.fill(); } }
  // live price tag + profit, while the bot is in the trade
  if (mine && mine.status == 'open' && cs.length && day.date == pwD.days[pwD.days.length - 1].date) { const px = cs[cs.length - 1][4], pnl = pwOpenPnl(mine), col = pnl == null ? fg : pnl >= 0 ? UP : DN, y = Y(px);
    g.save(); g.strokeStyle = col; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); g.restore(); g.fillStyle = col; g.fillRect(L + PW + 2, y - 8, 98, 16); g.fillStyle = '#04100a'; g.textAlign = 'left'; g.fillText('now ' + pwn(px), L + PW + 6, y); }
  if (mine) { const pnl = mine.status == 'open' ? pwOpenPnl(mine) : mine.pnl, r = pwR(mine, pnl), txt = `${mine.dir == 'long' ? 'LONG' : 'SHORT'} ${mine.qty} ${mine.etf}${mine.status == 'open' ? ' · open' : ' · closed'}${pnl != null ? `  ${sg2(pnl)}${r != null ? `  ${r >= 0 ? '+' : ''}${r.toFixed(2)}R` : ''}` : ''}`;
    g.font = '600 12px ui-monospace,Menlo,monospace'; const w = g.measureText(txt).width + 18; g.fillStyle = 'rgba(8,10,12,.78)'; g.fillRect(L + 6, T + 6, w, 24); g.fillStyle = pnl == null ? fg : pnl >= 0 ? UP : DN; g.textAlign = 'left'; g.fillText(txt, L + 15, T + 18); }
}

/* ---------- live regions (refreshed every 15s) and static controls ---------- */
function heroHtml() {
  const B = pwB, A = B.account, st = B.stats, cur = pwCurrent(), open = B.trades.find(t => t.status == 'open'), today = pwEtToday(), settled = st.won + st.lost, c = B.cfg;
  const live = open ? pwOpenPnl(open) : null, closedToday = B.trades.filter(t => t.status == 'closed' && t.pnl != null && t.day == today).reduce((n, t) => n + t.pnl, 0);
  const todayPnl = closedToday + (live || 0), profit = st.pnl + (live || 0);
  const strip = open ? (() => { const r = pwR(open, live); return `<b class="${open.dir == 'long' ? 'up' : 'down'}">${open.dir == 'long' ? 'LONG' : 'SHORT'}</b> ${open.qty} ${esc(open.etf)}${pwFut(open.etf) ? ' (built-in paper)' : ''} · in <b class=num>${pwFut(open.etf) ? pwn(open.entry) : usd(open.entry, 2)}</b> · stop <span class=num>${pwFut(open.etf) ? pwn(open.stop) : usd(open.stop, 2)}</span> · target <span class=num>${pwFut(open.etf) ? pwn(open.tp) : usd(open.tp, 2)}</span>${live != null ? ` · <b class="num ${live >= 0 ? 'up' : 'down'}">${sg2(live)}${r != null ? ` (${r >= 0 ? '+' : ''}${r.toFixed(2)}R)` : ''}</b> right now` : ''}`; })()
    : cur ? `Done for today: <b class="${cur.pnl > 0 ? 'up' : 'down'}">${cur.pnl != null ? sg2(cur.pnl) : 'closed'}</b> on ${cur.dir} ${cur.qty} ${esc(cur.etf)} (${esc(cur.reason || '')}). One trade a day, next signal tomorrow at 10:00 ET.`
    : B.enabled ? 'Flat. Waiting for the 10:00 ET candle (the bot acts 10:06 to 10:30).' : 'Flat. The bot is paused.';
  return `<div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${B.enabled ? 'on' : ''}" id=pwtog aria-label="Powell bot on/off" ${B.connected ? '' : 'disabled'}></button>
      <div><div style="font-size:22px;font-weight:650">${B.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">${!B.connected ? 'Connect Alpaca in the Newsflash tab first' : c.inst == 'etf' ? (B.paper ? 'Trading ' + (c.sym == 'NQ' ? 'QQQ' : 'SPY') + ' on your Alpaca paper account' : 'Trading ' + (c.sym == 'NQ' ? 'QQQ' : 'SPY') + ' with REAL money') : `Trading the real ${esc(c.sym)} contracts in the built-in paper account`}</div></div></div>
      <div class=row style="gap:8px"><span class="pill ${c.inst == 'etf' && !B.paper ? 'down' : 'n'}">${c.inst == 'etf' ? (B.paper ? 'Paper' : 'Real money') : 'Built-in paper'}</span>${B.connected ? '' : '<a class="btn pri sm" href="#/news">Connect</a>'}</div></div>
    ${B.accountError ? `<div class=note style="margin-top:12px">${esc(B.accountError)}</div>` : ''}
    <div class="grid g3" id=pwstats style="margin-top:18px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class=stat><div class=k>Balance</div><div class="v num">${A ? usd(A.equity, 2) : '-'}</div><div class=s>${A ? `cash ${usd(A.cash, 2)} · includes paper P&L` : 'on your broker'}</div></div>
      <div class=stat><div class=k>Today</div><div class="v num ${ud(todayPnl)}">${sg2(todayPnl)}</div><div class=s>${live != null ? 'includes the open trade' : 'closed trades today'}</div></div>
      <div class=stat><div class=k>Bot profit</div><div class="v num ${ud(profit)}">${sg2(profit)}</div><div class=s>${st.n} closed · all time</div></div>
      <div class=stat><div class=k>Win rate</div><div class="v num">${settled ? Math.round(st.won / settled * 100) + '%' : '-'}</div><div class=s>${st.won} won · ${st.lost} lost</div></div></div>
    <div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--fill);font-size:13.5px;line-height:1.55"><span class=mut>Trading now · </span>${strip}</div>`;
}
function metaHtml() {
  const D = pwD, day = D.days[pwIdx], sg = day && day.signal, today = pwEtToday(), mine = pwCurrent();
  const status = !day ? 'No data' : sg ? `<b class="${sg.dir == 'long' ? 'up' : 'down'}">${sg.dir.toUpperCase()}</b> signal · swept the ${esc(sg.kind.toLowerCase())} ${pwn(sg.level)} and closed back ${sg.dir == 'long' ? 'above' : 'below'} it · entry ${pwn(sg.entry)} · stop ${pwn(sg.stop)} · target ${pwn(sg.tp)} (2R = ${pwn(sg.R * 2)} pts)${sg.skip ? ` · <span class=mut>not traded: ${esc(sg.skip)}</span>` : ''}${sg.outcome == 'open' ? '' : sg.r != null ? ` · <b class="${sg.r > 0 ? 'up' : 'down'}">${sg.outcome == 'target' ? 'target hit' : sg.outcome == 'stop' ? 'stopped out' : 'closed 15:55'} ${sg.r >= 0 ? '+' : ''}${sg.r.toFixed(2)}R</b>` : ''}`
    : !day.levels ? '<span class=mut>No complete 9:30 to 10:05 candles for this day.</span>' : day.date == today && !day.cs.some(x => x[0] == 600) ? '<span class=mut>Waiting for the 10:00 candle…</span>' : `<span class=mut>${esc(day.note || 'No sweep on the 10:00 candle: no signal.')}</span>`;
  return `<div class=mut style="font-size:12.5px;margin:10px 0 8px">${esc(pwSym)} 5-minute candles, America/New_York · last ${D.price ? pwn(D.price) : '-'} · updated ${new Date(D.t).toLocaleTimeString([], { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ET · free Yahoo Finance data${D.delay ? `, delayed ${D.delay} min` : ''}${pwManual ? ` · <a href="#" id=pwfollow style="color:var(--ac)">Follow the bot's trade</a>` : mine ? ` · <span class=ac>following the bot's trade</span>` : ''}</div>`
    + `<div id=pwstatus style="font-size:13.5px;margin-top:12px;line-height:1.6">${status}</div><div class=mut style="font-size:12px;margin-top:6px">Yellow dashed = 10:00 ET · shaded = opening range · ▲ long signal, ▼ short signal · the bot's trade: solid line = entry, green zone = path to the target, red zone = path to the stop</div>`;
}
function ctlHtml() { const D = pwD;
  return `<div class="row sb wrapf" style="gap:12px"><div class=row style="gap:10px;flex-wrap:wrap"><label class=row style="gap:8px"><span class=mut style="font-size:13px">Symbol</span><input class=inp id=pwsym list=pwsyms value="${esc(pwSym)}" style="width:96px;text-transform:uppercase" autocomplete=off><datalist id=pwsyms><option value=NQ><option value=ES><option value=MNQ><option value=MES></datalist></label>
    <div class=seg id=pwq><button data-v=NQ class="${pwSym == 'NQ' ? 'on' : ''}">NQ</button><button data-v=ES class="${pwSym == 'ES' ? 'on' : ''}">ES</button></div></div>
    <div class=row style="gap:8px"><button class="btn sm" id=pwprev ${pwIdx <= 0 ? 'disabled' : ''}>‹</button><select class=inp id=pwday style="width:auto">${D.days.map((d, i) => `<option value=${i} ${i == pwIdx ? 'selected' : ''}>${d.date}${d.signal ? (d.signal.dir == 'long' ? ' ▲' : ' ▼') : ''}</option>`).join('')}</select><button class="btn sm" id=pwnext ${pwIdx >= D.days.length - 1 ? 'disabled' : ''}>›</button></div></div>`;
}
function tradesHtml() {
  return `<div class="pad" style="padding-bottom:8px"><h2>Bot trades</h2></div><table class=tbl><tbody>${pwB.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.status == 'skip' ? 'n' : t.pnl > 0 ? 'up' : t.pnl < 0 ? 'down' : 'n'}">${t.status == 'open' ? 'Open' : t.status == 'skip' ? 'Skipped' : t.pnl > 0 ? 'Won' : t.pnl < 0 ? 'Lost' : 'Closed'}</span></td>
    <td><div><b>${esc(t.day)}</b> · ${t.dir == 'long' ? '<span class=up>Long</span>' : '<span class=down>Short</span>'} ${esc(t.etf)} from ${esc(t.fut)} · ${esc(t.kind || '')}</div><div class=mut style="font-size:12.5px;margin-top:2px">${t.qty ? (pwFut(t.etf) ? `${t.qty} ${esc(t.etf)} contract${t.qty == 1 ? '' : 's'} at ${pwn(t.entry)} · stop ${pwn(t.stop)} · target ${pwn(t.tp)} · built-in paper` : `${t.qty} sh at ${usd(t.entry, 2)} · stop ${usd(t.stop, 2)} · target ${usd(t.tp, 2)}`) : ''}${t.exitp ? ` · exit ${pwFut(t.etf) ? pwn(t.exitp) : usd(t.exitp, 2)}` : ''}${t.reason ? ` · ${esc(t.reason)}` : ''}</div></td>
    <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? '' : sg2(t.pnl)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It trades only when the 10:00 candle sweeps and reclaims a level, at most once a day.</td></tr>`}</tbody></table>`;
}
function btPowellHtml(r) { const S = r.summary;
  return `<h2 style="font-size:17px">${r.sym}: ${r.from} to ${r.to} (${S.days} sessions)</h2><div class=mut style="font-size:12.5px;margin:4px 0 10px">Entry at the signal candle's close, stop 1 tick past the wick, 2R target, closed at 15:55. If one candle touches both, the stop counts first. No commissions.</div>`
    + btTiles([['Trades', S.closed, `${S.longs} long · ${S.shorts} short`], ['Result', `${S.totalR >= 0 ? '+' : ''}${S.totalR.toFixed(1)}R`, S.closed ? `${S.avgR >= 0 ? '+' : ''}${S.avgR.toFixed(2)}R a trade · ${S.target} hit target · ${S.stop} stopped` : '', S.totalR >= 0 ? 'up' : 'down'], ['Worst run', `${S.maxDD.toFixed(1)}R`, 'peak to trough']]) + btSample(S.closed)
    + btRows(r.trades.map(t => ({ tag: t.r > 0 ? 'Won' : 'Lost', good: t.r > 0, bad: t.r <= 0, title: `<b>${esc(t.date)}</b> · ${t.dir == 'long' ? '<span class=up>Long</span>' : '<span class=down>Short</span>'} <span class=mut>${esc(t.kind || '')}</span>`, sub: `entry ${pwn(t.entry)} · ${esc(t.outcome)}`, right: `${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R` })));
}
function btHtml() { const S = pwD.summary;
  return `<h2>Last ${S.days} sessions, same rule</h2><div class=mut style="font-size:12.5px;margin:4px 0 10px">Entry at the signal candle's close, stop 1 tick past the wick, 2R target, closed at 15:55. If one candle touches both, the stop counts first. No commissions.</div>
    <div class="grid g3"><div class=stat><div class=k>Signals</div><div class="v num">${S.closed}</div><div class=s>${S.longs} long · ${S.shorts} short</div></div><div class=stat><div class=k>Hit target</div><div class="v num">${S.target}</div><div class=s>${S.stop} stopped · ${S.time} time exit</div></div><div class=stat><div class=k>Average</div><div class="v num ${ud(S.avgR)}">${S.avgR >= 0 ? '+' : ''}${S.avgR.toFixed(2)}R</div><div class=s>total ${S.totalR >= 0 ? '+' : ''}${S.totalR.toFixed(1)}R</div></div></div>
    <div class=note style="margin-top:12px;font-size:12.5px;line-height:1.55">Read this with care: it signals on only about 1 day in 4, so ${S.closed} trades is a very small sample. A 2R target needs roughly 1 win in 3 to break even. Results swing a lot at this size, and the free source only provides the last 60 days of 5-minute data.</div>`;
}
const pwAct = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } try { pwB = await pwapi('state'); pwFocus(); if (pwD.sym != pwSym) await pwLoadData(pwSym); } catch (e) {} powellRender(); };
function wireHero() {
  const B = pwB; $('#pwtog') && ($('#pwtog').onclick = () => { if (!B.enabled && B.cfg.inst == 'etf' && !B.paper && !confirm('Start the Powell bot with REAL money on your broker account?')) return; pwAct(() => pwapi(B.enabled ? 'stop' : 'start', {}), B.enabled ? 'Powell bot paused' : 'Powell bot started'); });
}
function wireCtl() {
  const D = pwD; $('#pwsym').onchange = () => powellLoad($('#pwsym').value); $$('#pwq button').forEach(b => b.onclick = () => powellLoad(b.dataset.v));
  $('#pwday').onchange = () => { pwManual = true; pwIdx = +$('#pwday').value; paintDynamic(true); }; $('#pwprev').onclick = () => { pwManual = true; pwIdx = Math.max(0, pwIdx - 1); paintDynamic(true); }; $('#pwnext').onclick = () => { pwManual = true; pwIdx = Math.min(D.days.length - 1, pwIdx + 1); paintDynamic(true); };
}
function paintDynamic(force) { // live parts only: balance, profit, trading-now strip, chart, status, trades
  if (!$('#pwhero')) return; $('#pwhero').innerHTML = heroHtml(); wireHero(); $('#pwmeta').innerHTML = metaHtml(); $('#pwtr').innerHTML = tradesHtml(); bcProfitDraw('pwpc', pwB.trades, { label: t => `${t.dir} ${t.etf} ${t.day}`, fmt: v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(0) });
  if (force || !document.activeElement?.closest?.('#pwctl')) { $('#pwctl').innerHTML = ctlHtml(); wireCtl(); } // do not yank the symbol box while it is being typed in
  const f = $('#pwfollow'); if (f) f.onclick = e => { e.preventDefault(); pwManual = false; pwAct(async () => {}); };
  powellDraw();
}
function powellRender() {
  const B = pwB, c = B.cfg, eq = B.account ? B.account.equity : null, cfg = (k, v) => pwAct(() => pwapi('cfg', { cfg: { [k]: v } }), 'Saved');
  app.innerHTML = `<div class="ph fade"><div><h1>Powell Strategy</h1><p class=lead>The 10 AM sweep on NQ and ES futures. If the 10:00 ET candle wicks through the opening-range extreme (or the latest swing) and closes back inside, that is the signal. Stop beyond the wick, target 2R.</p></div></div>
    <div class="card pad" id=pwhero></div>
    <div class="card pad" style="margin-top:16px"><div id=pwctl></div><canvas id=pwcv style="width:100%;display:block;margin-top:10px"></canvas><div id=pwmeta></div></div>
    <div class="card pad" style="margin-top:16px"><div class="row sb wrapf"><h2>Risk settings</h2><span class=mut style="font-size:12.5px">Unlock a dial to change it</span></div>
      <div class=dials style="margin-top:6px"><div id=pwd1></div><div id=pwd2></div></div>
      <div class=row style="gap:14px;flex-wrap:wrap;margin-top:14px;justify-content:center"><label class=row style="gap:8px"><span class=mut style="font-size:13px">Signal</span><select class=inp id=pwbs style="width:auto"><option value=NQ ${c.sym == 'NQ' ? 'selected' : ''}>NQ</option><option value=ES ${c.sym == 'ES' ? 'selected' : ''}>ES</option></select></label>
        <label class=row style="gap:8px"><span class=mut style="font-size:13px">Trades</span><select class=inp id=pwin style="width:auto"><option value=futures ${c.inst != 'etf' ? 'selected' : ''}>The futures (built-in paper)</option><option value=etf ${c.inst == 'etf' ? 'selected' : ''}>${c.sym == 'NQ' ? 'QQQ' : 'SPY'} on your broker</option></select></label></div>
      <div class=mut style="font-size:12.5px;line-height:1.55;margin-top:12px;text-align:center">${c.inst == 'etf' ? `Trades ${c.sym == 'NQ' ? 'QQQ' : 'SPY'} on your connected broker (same percentage stop and 2R target as a bracket order; whole shares; shorts need a shortable ETF).` : `<b>Alpaca and Webull cannot trade futures</b>, so the real ${esc(c.sym)} contracts trade in Mimic's built-in paper account: the signal's own stop and 2R target, real contract sizes (micros when ${esc(c.sym)} is too big for your risk), simulated fills, riding on your Alpaca balance.`} One trade a day; it closes anything open at 15:55 ET.</div></div>
    ${bcProfitCard('pwpc')}
    ${btCard('pwbt', { opts: [[5, 'Last 5 sessions'], [10, 'Last 10 sessions'], [20, 'Last 20 sessions'], [40, 'Last 40 sessions'], [60, 'All the data (about 60)']], def: 60, note: `Replays the 10 AM sweep rule on free 5-minute ${c.sym} candles. Free data only goes back about 60 sessions.`, initial: btHtml() })}
    <div class="card" style="margin-top:16px;overflow:hidden" id=pwtr></div>`;
  dialMount('#pwd1', { key: 'pw-risk', value: c.risk, min: .1, max: 2, step: .1, unit: '% risked per trade', size: 'sm', caption: v => eq ? `≈ ${usd(eq * v / 100, 0)} at risk if the stop is hit` : '', onCommit: v => cfg('risk', v) });
  dialMount('#pwd2', { key: 'pw-max', value: c.max, min: 5, max: 100, step: 5, unit: '% max position', fmt: v => String(Math.round(v)), size: 'sm', caption: v => eq ? `≈ ${usd(eq * v / 100, 0)} largest position (ETF mode)` : '', onCommit: v => cfg('max', v) });
  $('#pwbs').onchange = () => cfg('sym', $('#pwbs').value); $('#pwin').onchange = () => cfg('inst', $('#pwin').value);
  btWire('pwbt', { run: async n => btPowellHtml(await pwapi('bt', { days: +n })) });
  paintDynamic(true);
}
addEventListener('resize', () => { if ($('#pwcv')) powellDraw(); });
