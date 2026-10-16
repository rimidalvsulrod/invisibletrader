// Chart larper (admins only): a terminal replay that trades by itself. A fake mouse moves around the terminal, picks the
// long / short position tool, drags the green and red boxes, clicks Buy or Sell and manages the trade, while the replay plays.
// It looks ahead in the replay data so the day ends up green or red, as chosen, with some losing (or winning) trades mixed in.
let LP = null;
let LPF = 1; // hand speed: 1 = normal, higher = the mouse and its pauses run that many times faster (follows the speed number)
const lpR = (a, b) => a + Math.random() * (b - a), lpPick = a => a[Math.floor(Math.random() * a.length)], lpSleep = ms => new Promise(r => setTimeout(r, ms / LPF));
const lpShuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const LP_SYMS = [['SPY', 'SPY'], ['QQQ', 'QQQ'], ['NQ=F', 'NQ'], ['ES=F', 'ES'], ['BTC-USD', 'BTC'], ['AAPL', 'AAPL'], ['TSLA', 'TSLA'], ['NVDA', 'NVDA']];

function larpPage() {
  if (!USER?.admin) { location.replace('#/'); return; }
  const c = LS.get('lp:cfg', { sym: 'NQ=F', tf: '1m', goal: 'profit', amt: 1500, trades: 5, pace: 30 });
  const seg = (id, L, v) => `<div class=seg id=${id}>${L.map(([k, l]) => `<button data-v="${k}" class="${String(v) == String(k) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  app.innerHTML = `<div class=ph><div><h1>Chart larper</h1><p class=lead>A replay that trades by itself: the mouse moves, sets long and short boxes, clicks Buy and Sell and manages the trades. You pick whether the day ends green or red. Admins only.</p></div></div>
   <div class="card pad" style="max-width:720px;display:grid;gap:18px">
    <div><b>Ticker</b><div class=row style="gap:8px;margin-top:8px;align-items:center"><input class=inp id=lpsymin value="${esc(c.sym)}" placeholder="Any ticker: AAPL, AMD, NQ=F, BTC-USD" autocapitalize=characters spellcheck=false style="max-width:260px"></div><div class=hubchips style="margin-top:8px" id=lpsym>${LP_SYMS.map(([k, l]) => `<button class="chip ${c.sym == k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div><b>Today</b><div style="margin-top:8px">${seg('lpgoal', [['profit', 'Profit'], ['loss', 'Lose']], c.goal)}</div></div>
    <div><b>About how much</b><div class=row style="gap:8px;margin-top:8px;align-items:center"><span class=mut>$</span><input class=inp id=lpamt type=number min=50 step=50 value="${c.amt}" style="max-width:160px"></div></div>
    <div><b>Account balance</b><div class=row style="gap:8px;margin-top:8px;align-items:center"><span class=mut>$</span><input class=inp id=lpbal type=number min=100 step=1000 value="${LS.get('mt:rpbal', 100000)}" style="max-width:160px"></div></div>
    <div><b>Trades</b><div style="margin-top:8px">${seg('lptr', [[3, '3'], [5, '5'], [8, '8']], c.trades)}</div></div>
    <div><b>Candles</b><div style="margin-top:8px">${seg('lptf', [['1m', '1 minute'], ['5m', '5 minutes']], c.tf)}</div></div>
    <div><b>Speed</b><div class=row style="gap:8px;margin-top:8px;align-items:center"><input class=inp id=lppace type=number min=1 max=1000 step=1 value="${c.pace}" style="max-width:120px"><span class=mut>× real time. The market and the mouse both run this fast (30 = normal, 120+ = really fast)</span></div><div class=hubchips style="margin-top:8px" id=lppre>${[10, 30, 60, 120, 300].map(n => `<button class=chip data-v="${n}">${n}×</button>`).join('')}</div></div>
    <div class=row style="gap:10px;align-items:center"><button class="btn pri" id=lpgo>Start</button><span class=mut style="font-size:12.5px">Esc stops it · H hides the small control</span></div>
    <div class=mut style="font-size:12.5px">It runs on a past session in the replay paper account; nothing goes to a broker. Results land near the amount, not exactly on it.</div></div>`;
  $('#lpsymin').oninput = e => { const v = e.target.value.trim().toUpperCase(); app.querySelectorAll('#lpsym button').forEach(b => b.classList.toggle('on', b.dataset.v == v)); };
  app.querySelectorAll('#lpsym button').forEach(b => b.addEventListener('click', () => { $('#lpsymin').value = b.dataset.v; }));
  app.querySelectorAll('#lppre button').forEach(b => b.onclick = () => { $('#lppace').value = b.dataset.v; });
  app.querySelectorAll('.seg,.hubchips').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }));
  $('#lpgo').onclick = () => { const v = id => app.querySelector(`#${id} .on`).dataset.v;
    const cfg = { sym: $('#lpsymin').value.trim().toUpperCase() || 'NQ=F', goal: v('lpgoal'), amt: Math.max(50, +$('#lpamt').value || 1500), trades: +v('lptr'), tf: v('lptf'), pace: Math.max(1, Math.min(1000, +$('#lppace').value || 30)) }; LS.set('lp:cfg', cfg); LS.set('mt:rpbal', Math.max(100, +$('#lpbal').value || 1e5));
    trInit(); TR.sym = cfg.sym; TR.tf = cfg.tf; LS.set('mt:sym', cfg.sym); LS.set('mt:tf', cfg.tf); window.__larp = cfg; location.hash = '#/trade'; };
}

// ---- the fake mouse ----
const LP_SVG = `<svg width=22 height=22 viewBox="0 0 22 22"><path d="M4 2.5v15.2l3.9-3.7 2.5 5.8 2.7-1.2-2.5-5.6 5.4-.3z" fill="#000" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
function lpCursor() { let el = $('#lpcur'); if (!el) { el = document.createElement('div'); el.id = 'lpcur'; el.innerHTML = trPhone() ? '<i></i>' : LP_SVG; if (trPhone()) el.className = 'touch'; document.body.append(el); el.style.left = innerWidth * .6 + 'px'; el.style.top = innerHeight * .5 + 'px'; LP.x = innerWidth * .6; LP.y = innerHeight * .5; } return el; }
function lpPut(x, y) { LP.x = x; LP.y = y; const el = lpCursor(); el.style.left = x + 'px'; el.style.top = y + 'px'; // the chart's own crosshair follows it
  const cv = $('#trc canvas'); if (!cv) return; const r = cv.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) cv.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true })); }
// human-like moves, not smooth: a quick ballistic push that stops short or long of the target, one or two small corrections,
// a wobbly path, whole-pixel steps at uneven intervals with the odd hitch (like a real mouse polled by the browser)
async function lpSeg(x0, y0, x, y, T, wob, each) { const d = Math.hypot(x - x0, y - y0) || 1, ux = (x - x0) / d, uy = (y - y0) / d, bend = lpR(-.12, .12) * d,
    f1 = lpR(1.5, 3.5), f2 = lpR(4, 8), ph1 = lpR(0, 6.3), ph2 = lpR(0, 6.3), k = lpR(1.6, 2.6), t0 = performance.now(); T /= LPF;
  while (LP?.on) { const t = Math.min(1, (performance.now() - t0) / T), s = 1 - Math.pow(1 - t, k) * (1 - t * .15), // fast start, long slow-down
      off = bend * 4 * s * (1 - s) + wob * (Math.sin(f1 * s * 6.3 + ph1) * .7 + Math.sin(f2 * s * 6.3 + ph2) * .3) * Math.sin(Math.PI * s);
    const px = Math.round(x0 + (x - x0) * s - uy * off + lpR(-.8, .8)), py = Math.round(y0 + (y - y0) * s + ux * off + lpR(-.8, .8)); lpPut(px, py); each?.(px, py);
    if (t >= 1) break; await lpSleep(Math.random() < .06 ? lpR(35, 90) : lpR(7, 18)); } }
async function lpMove(x, y, opt = {}) { if (!LP?.on) return; const x0 = LP.x, y0 = LP.y, d = Math.hypot(x - x0, y - y0); if (d < 1) return;
  const T = opt.ms || (180 + Math.pow(d, .8) * lpR(1.6, 2.4)), miss = opt.exact ? 0 : lpR(-.08, .07), ex = x + (x - x0) * miss + lpR(-3, 3) * Math.min(1, d / 200), ey = y + (y - y0) * miss + lpR(-3, 3) * Math.min(1, d / 200);
  await lpSeg(x0, y0, ex, ey, T, opt.exact ? 0 : Math.min(9, d * .018), opt.each);
  if (opt.exact) return; await lpSleep(lpR(20, 80));
  let cx = LP.x, cy = LP.y; for (let n = 0; n < 2 && Math.hypot(x - cx, y - cy) > 1.5; n++) { const last = n == 1 || Math.random() < .5, tx = last ? x : x + lpR(-2, 2), ty = last ? y : y + lpR(-2, 2);
    await lpSeg(cx, cy, tx, ty, lpR(70, 150) + Math.hypot(tx - cx, ty - cy) * 3, 0, opt.each); cx = LP.x; cy = LP.y; await lpSleep(lpR(15, 60)); } }
async function lpClick(press) { const el = lpCursor(); el.classList.add('dn'); const rp = document.createElement('i'); rp.className = 'lprip'; rp.style.left = LP.x + 'px'; rp.style.top = LP.y + 'px'; document.body.append(rp); setTimeout(() => rp.remove(), 500);
  await lpSleep(press || lpR(70, 120)); el.classList.remove('dn'); }
const lpEl = s => { const e = $(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
async function lpTo(sel, jx = .3, jy = .3) { const r = lpEl(sel); if (!r) return false; await lpMove(r.left + r.width * (.5 + lpR(-jx, jx)), r.top + r.height * (.5 + lpR(-jy, jy))); return true; }
// screen position of a time / price on the main chart
function lpXY(t, p) { const cv = $('#trc canvas'); if (!cv || !trChart || !trS.main) return null; const r = cv.getBoundingClientRect(), x = trChart.timeToCoordinate(t), y = trS.main.priceToCoordinate(p); return x == null || y == null ? null : { x: r.left + x, y: r.top + y }; }
const lpPrice = y => { const cv = $('#trc canvas'), r = cv.getBoundingClientRect(); return trS.main.coordinateToPrice(y - r.top); };

// ---- replay hooks ----
const lpDrawAll = () => { if (LP && trChart) trChart.setDrawings(LP.draws); };
window.lpOnStep = () => { if (!LP?.on || !RP) return; const a = RP.acct.me, m = rpMult();
  for (const d of LP.draws) if (!d.done && d.live) { d.cur = RP.px; d.tc = RP.simT; d.pnl = a.qty ? (RP.px - a.avg) * a.qty * m : d.pnl; }
  const ts = trChart?.timeScale(), r = ts?.getVisibleLogicalRange(), n = trData.B.length; if (r && r.to - n < 14) ts.setVisibleLogicalRange({ from: r.from + (n + 22 - r.to), to: n + 22 }); // room on the right for the boxes
  const now = performance.now(); if (a.qty && now - (LP.ol || 0) > 120) { LP.ol = now; trOrderLines(); }
  lpDrawAll(); lpHud(); };
window.lpStop = () => { LPF = 1; if (!LP) return; LP.on = false; window.__quiet = false; document.body.classList.remove('larp', 'lprun'); $('#lpcur')?.remove(); $('#lphud')?.remove(); $('#lpnotes')?.remove(); removeEventListener('keydown', lpKey, true); LP = null; };
function lpKey(e) { if (!LP) return; if (e.key == 'Escape') { e.preventDefault(); lpEnd(true); } else if ((e.key == 'h' || e.key == 'H') && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) $('#lphud')?.classList.toggle('hid'); }
const lpPnl = () => RP ? RP.acct.me.realized + (RP.acct.me.qty ? (RP.px - RP.acct.me.avg) * RP.acct.me.qty * rpMult() : 0) : 0;
function lpHud(msg) { let el = $('#lphud'); if (!el) { el = document.createElement('div'); el.id = 'lphud'; document.body.append(el); }
  if (msg != null) LP.msg = msg; const p = lpPnl(), c = LP.c; el.innerHTML = `<i class=${LP.on ? 'on' : ''}></i><b>${c.goal == 'profit' ? 'Profit' : 'Lose'} ${trM(c.amt)}</b><span class=num style="color:${p >= 0 ? 'var(--up)' : 'var(--down)'}">${p >= 0 ? '+' : ''}${trM(p)}</span><span>${LP.k}/${LP.plan.length + LP.extra} trades</span><span class=mut>${esc(LP.msg || '')}</span>${LP.on ? '<button id=lpx>Stop</button>' : '<button id=lpag>Again</button><button id=lpx>Exit</button>'}`;
  el.querySelector('#lpx').onclick = () => lpEnd(true); const ag = el.querySelector('#lpag'); if (ag) ag.onclick = () => { const c2 = LP.c; lpEnd(true); setTimeout(() => { window.__larp = c2; larpGo(); }, 900); }; }

// ---- looking ahead: would this trade hit its target or its stop first? (same price path the replay uses) ----
function lpSim(dir, tp, sl) { const R = RP, up = dir == 'long'; let bars = 0;
  const chk = px => up ? (px >= tp ? 'W' : px <= sl ? 'L' : null) : (px <= tp ? 'W' : px >= sl ? 'L' : null);
  for (let i = R.i; i < Math.min(R.all.length, R.i + 150); i++, bars++) { const b = R.all[i], p0 = i == R.i ? Math.max(0, Math.min(1, (R.simT - b.t) / R.bs)) : 0;
    for (let p = p0; p <= 1.0001; p += .015) { const r = chk(rpPath(b, Math.min(1, p))); if (r) return { r, bars }; } }
  return null; }
function lpAtr() { const R = RP, a = R.all.slice(Math.max(1, R.i - 20), R.i); if (!a.length) return Math.abs(R.px) * .001; let s = 0; for (let k = 0; k < a.length; k++) { const pc = (R.all[R.i - a.length + k - 1] || a[k]).c; s += Math.max(a[k].h - a[k].l, Math.abs(a[k].h - pc), Math.abs(a[k].l - pc)); } return s / a.length; }
const lpTick = () => trTickSz?.() || (RP.px > 1000 ? .25 : .01), lpRound = p => { const t = lpTick(); return Math.round(p / t) * t; };
// dollars this trade should make (W) or lose (L) so the day lands near the goal
function lpGoal(want) { const c = LP.c, sg = c.goal == 'profit' ? 1 : -1, left = Math.max(c.amt * .06, c.amt - sg * RP.acct.me.realized), rest = LP.plan.slice(LP.k), nW = rest.filter(x => x == 'W').length, nL = rest.length - nW;
  if (rest.length <= 1) return left; const u = left / Math.max(.6, sg > 0 ? nW * 1.9 - nL : nL - nW * 1.9); return (want == 'W' ? 1.9 * u : u) * lpR(.7, 1.25); }
function lpUnits(unit$, goal) { const m = rpMult(), maxQ = Math.max(1, m > 1 ? rpEq(RP.acct.me) / 2500 : rpEq(RP.acct.me) * 4 / (RP.px * m)); let q = Math.min(goal / Math.max(1e-9, unit$), maxQ); // futures: about $2,500 day margin a contract; stocks: no more than 4x buying power
  return m > 1 || RP.px > 500 ? Math.max(1, Math.round(q)) : Math.max(1, q > 50 ? Math.round(q / 10) * 10 : Math.round(q)); }
function lpFind(want, entry) { const atr = lpAtr(), m = rpMult(), goal = lpGoal(want), out = [];
  // a trader leans with the last few candles more often than against them
  const R = RP, mom = R.all[R.i - 1].c - R.all[Math.max(0, R.i - 8)].c, dirs = Math.random() < .65 ? [mom >= 0 ? 'long' : 'short', mom >= 0 ? 'short' : 'long'] : lpShuffle(['long', 'short']);
  for (const dir of dirs) for (const k of [.5, .7, .9, 1.2, 1.5, 2, 2.6]) for (const rr of want == 'W' ? [1.3, 1.6, 2, 2.4, 3] : [1.2, 1.5, 2, 2.5]) {
    const risk = Math.max(atr * k, lpTick() * 4), sg = dir == 'long' ? 1 : -1, tp = lpRound(entry + sg * risk * rr), sl = lpRound(entry - sg * risk), x = lpSim(dir, tp, sl);
    if (!x || x.r != want || x.bars < 2 || x.bars > 28) continue; const unit = (want == 'W' ? Math.abs(tp - entry) : Math.abs(entry - sl)) * m, q = lpUnits(unit, goal);
    out.push({ dir, tp, sl, risk: Math.abs(entry - sl), rr: Math.abs(tp - entry) / Math.abs(entry - sl), bars: x.bars, goal, q, err: Math.abs(q * unit - goal) / goal + (dir == dirs[0] ? 0 : .15) + Math.random() * .12 }); }
  out.sort((a, b) => a.err - b.err); return out[0] || null; }
function lpQty(s, want, e0) { const unit = (want == 'W' ? Math.abs(s.tp - e0) : Math.abs(e0 - s.sl)) * rpMult(); return lpUnits(unit, s.goal); }
function lpPlan(c) { const n = c.trades, odd = Math.max(0, Math.round(n * lpR(.2, .38))), main = c.goal == 'profit' ? 'W' : 'L', alt = main == 'W' ? 'L' : 'W';
  const p = lpShuffle([...Array(n - odd - 1).fill(main), ...Array(odd).fill(alt)]); p.push(main); return p; }
const lpBars = async n => { const end = RP.i + n; while (LP?.on && RP && RP.i < end && RP.i < RP.all.length) await lpSleep(120); };
const lpLive = () => !!(LP?.on && RP && RP.i < RP.all.length - 2);

// ---- one trade, done by "hand" ----
async function lpTrade(want) {
  const R = RP, slow = R.speed; let s = null;
  for (let tries = 0; lpLive() && !s; tries++) { s = lpFind(want, R.px); if (!s) { await lpIdle(1); } if (tries > 40) return false; }
  if (!s) return false; R.speed = Math.max(1, slow / 12); // the market keeps moving while the hand works, just slower
  const k = s.dir, tb = `.trlt [data-p=${k}]`; lpHud(k == 'long' ? 'long setup' : 'short setup');
  if (await lpTo(tb, .15, .15)) { await lpSleep(lpR(120, 300)); await lpClick(); $(tb)?.classList.add('on'); }
  let e0 = R.px; const t1 = R.live.t, t2 = t1 + R.bs * Math.round(lpR(10, 18)), A = lpXY(t1, e0); if (!A) { R.speed = slow; return false; }
  await lpMove(A.x + lpR(-3, 3), A.y + lpR(-2, 2)); await lpSleep(lpR(80, 200)); const el = lpCursor(); el.classList.add('dn');
  const d = { id: 'lp' + Date.now().toString(36), k, t1, p1: e0, t2: t1, p2: e0, sl: e0, qty: 0 }; LP.draws.push(d); lpDrawAll();
  const B = lpXY(t2, s.tp), cr = lpEl('#trc canvas'); B.x = Math.min(B.x, cr.right - 75); await lpMove(B.x + lpR(-6, 6), B.y + lpR(-4, 4), { ms: lpR(500, 800), each: (x, y) => { d.t2 = Math.round(trChart.coordinateToTime(x - $('#trc canvas').getBoundingClientRect().left)); d.p2 = lpPrice(y); d.sl = d.p1 - (d.p2 - d.p1); lpDrawAll(); } });
  el.classList.remove('dn'); $(tb)?.classList.remove('on'); d.p2 = s.tp; d.t2 = t2; lpDrawAll(); await lpSleep(lpR(150, 350));
  // drag the stop to where it should be
  const S0 = lpXY(t1 + (t2 - t1) / 2, d.sl), S1 = lpXY(t1 + (t2 - t1) / 2, s.sl);
  if (S0 && S1) { await lpMove(S0.x + lpR(-20, 20), S0.y + lpR(-1, 1)); await lpSleep(lpR(60, 160)); el.classList.add('dn'); await lpMove(S1.x + lpR(-8, 8), S1.y, { ms: lpR(300, 520), each: (x, y) => { d.sl = lpPrice(y); lpDrawAll(); } }); el.classList.remove('dn'); }
  d.sl = s.sl; lpDrawAll(); await lpSleep(lpR(200, 600));
  // to the Buy / Sell button; check again with the price at the moment of the click
  await lpTo(`.trqb.${k == 'long' ? 'buy' : 'sell'}`, .25, .2); await lpSleep(lpR(90, 260));
  let s2 = lpSim(k, d.p2, d.sl); if (!s2 || s2.r != want) { const f = lpFind(want, R.px); if (f && f.dir == k) { d.p2 = f.tp; d.sl = f.sl; s = f; lpDrawAll(); s2 = f; } }
  if (!s2 || (s2.r || want) != want) { // the setup went away: change of mind, remove the boxes
    lpHud('no trade'); const C = lpXY(t1 + (t2 - t1) * .3, d.p1); if (C) { await lpMove(C.x, C.y); await lpClick(); } await lpSleep(lpR(200, 400)); LP.draws = LP.draws.filter(x => x !== d); lpDrawAll(); R.speed = slow; return false; }
  const side = k == 'long' ? 'buy' : 'sell', qty = lpQty({ ...s, tp: d.p2, sl: d.sl }, want, R.px), viaWin = !trPhone() && Math.random() < .6;
  if (viaWin) { await lpClick(); trOrderWin(side); await lpSleep(lpR(250, 450)); R.speed = Math.max(1, slow / 30); await lpWin(side, qty, d.p2, d.sl);
    // the price moved while typing: fix the prices, or give up on it
    const ok = () => { const sg = k == 'long' ? 1 : -1, x = lpSim(k, d.p2, d.sl); return (RP.px - d.sl) * sg > 0 && (d.p2 - RP.px) * sg > 0 && x && x.r == want; };
    if (!ok()) { const f = lpFind(want, R.px); if (f && f.dir == k) { d.p2 = f.tp; d.sl = f.sl; s = f; lpDrawAll(); await lpType('#trtp', trN(f.tp).replace(/,/g, '')); await lpType('#trsl', trN(f.sl).replace(/,/g, '')); } }
    if (!ok()) { await lpTo('#twx', .1, .1); await lpClick(); trOrderWin(false); LP.draws = LP.draws.filter(x => x !== d); lpDrawAll(); R.speed = slow; lpHud('no trade'); return false; }
    await lpTo('#trgo', .25, .2); await lpSleep(lpR(120, 350)); if (!ok()) { trOrderWin(false); LP.draws = LP.draws.filter(x => x !== d); lpDrawAll(); R.speed = slow; return false; } await lpClick(); }
  else { const qb = $(`.trqb.${side}`); qb?.classList.add('lpflash'); setTimeout(() => qb?.classList.remove('lpflash'), 220); await lpClick(); }
  e0 = R.px; d.p1 = e0; d.t1 = R.live.t; d.qty = qty; d.live = true; d.cur = e0; d.tc = R.simT;
  if (viaWin && $('#trgo')) { const g = $('#trgo'); g.classList.add('lpflash'); setTimeout(() => g.classList.remove('lpflash'), 220); g.click(); } else rpOrder({ side, kind: 'market', qty, tp: d.p2, sl: d.sl }); trOrderWin(false); const f0 = RP.fills[0]; lpExec(k == 'long' ? 'buy' : 'sell', qty, f0 ? f0.px : e0, 'Market'); lpDrawAll(); R.speed = slow; lpHud(`${k == 'long' ? 'long' : 'short'} ${qty}`);
  // manage: watch it, sometimes trail the stop to break-even when it is safe
  let trailed = false; const early = Math.random() < (want == 'W' ? .25 : .3) ? lpR(.55, .88) : 0; await lpSleep(lpR(300, 700));
  while (lpLive() && RP.acct.me.qty) { await lpIdle(0, d);
    const sg = k == 'long' ? 1 : -1, prog = (RP.px - d.p1) * sg / Math.abs(d.p2 - d.p1);
    const lossProg = (d.p1 - RP.px) * sg / Math.abs(d.p1 - d.sl);
    if (early && ((want == 'W' && prog > early) || (want == 'L' && lossProg > early))) { lpHud(want == 'W' ? 'taking profit' : 'cutting it'); await lpTo('#trtbl [data-close]', .2, .2) || await lpTo('#rpclose', .2, .2); await lpSleep(lpR(120, 400)); await lpClick(); if (RP.acct.me.qty) rpClose(); break; }
    if (!trailed && want == 'W' && prog > .55 && Math.random() < .5) { trailed = true; const be = lpRound(d.p1 + sg * lpTick() * 2), t = lpSim(k, d.p2, be);
      if (t && t.r == 'W') { const P = lpXY(d.t1 + (d.t2 - d.t1) / 2, d.sl), Q = lpXY(d.t1 + (d.t2 - d.t1) / 2, be); if (P && Q) { await lpMove(P.x, P.y); el.classList.add('dn'); await lpMove(Q.x, Q.y, { ms: 380, each: (x, y) => { d.sl = lpPrice(y); lpDrawAll(); } }); el.classList.remove('dn'); }
        d.sl = be; for (const o of RP.orders) if (o.br && o.kind == 'stop') o.px = be; trOrderLines(); lpDrawAll(); lpHud('stop to break-even'); } } }
  const f = RP.fills.find(x => x.acct == 'me' && x.pnl); if (f) lpExec(f.side, f.qty, f.px, /take/.test(f.why) ? 'Take profit' : /stop/.test(f.why) ? 'Stop loss' : 'Market', f.pnl); d.live = false; d.done = true; d.cur = f ? f.px : RP.px; d.pnl = f ? f.pnl : 0; lpDrawAll(); return true; }
// idle: look around the chart like a person waiting for a setup
async function lpIdle(bars, d) { const R = RP; if (!R) return; const end = R.i + Math.max(1, bars || 0), t0 = performance.now();
  do { const r = lpEl('#trc canvas'); if (!r) return; const roll = Math.random();
    if (d && roll < .35) { const P = lpXY(d.t1 + (d.t2 - d.t1) * lpR(.2, .8), lpPick([d.p1, d.p2, d.sl, R.px])); if (P) await lpMove(P.x + lpR(-25, 25), P.y + lpR(-12, 12)); }
    else if (roll < .07 && !d) await lpTo('.trwl,.trside', .3, .35);
    else { const P = lpXY(R.live.t, R.px); if (P) await lpMove(Math.min(r.right - 70, P.x - lpR(10, 260)), Math.max(r.top + 40, Math.min(r.bottom - 40, P.y + lpR(-90, 90)))); }
    await lpSleep(lpR(300, 1400)); } while (LP?.on && RP && (bars ? RP.i < end : performance.now() - t0 < 900) && (!d || RP.acct.me.qty)); }

async function larpGo() { const c = window.__larp; window.__larp = null; if (!c || !USER?.admin) return; window.lpStop();
  LPF = Math.max(.5, Math.min(12, (c.pace || 30) / 30)); LP = { c, on: true, draws: [], plan: lpPlan(c), k: 0, extra: 0, x: 0, y: 0 }; window.__quiet = true; document.body.classList.add('larp', 'lprun'); addEventListener('keydown', lpKey, true);
  lpCursor(); lpHud('loading');
  if (TR.sym !== c.sym) trSet(c.sym); if (TR.tf !== c.tf) { TR.tf = c.tf; LS.set('mt:tf', c.tf); trUiSync(); trLoad(true); }
  for (let w = 0; w < 100 && !(trData && trData.tf == c.tf && trData.sym == TR.sym && trData.B.length > 200); w++) await lpSleep(150);
  if (!LP?.on) return; if (!trData) return lpEnd(false, 'no data for ' + c.sym); const B = trData.B, n = B.length, et = t => { const d = new Date((t - TZ()) * 1000), p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d); return +p[0].value * 60 + +p[2].value; };
  const need = c.trades * (c.tf == '1m' ? 30 : 12), cand = []; for (let i = 40; i < n - need; i++) { const m = et(B[i].t); if (m >= 575 && m <= 600) cand.push(i); }
  const i = cand.length ? lpPick(cand) : Math.floor(lpR(60, Math.max(61, n - need))); rpBegin(B[i].t); if (!RP) return lpEnd(false, 'not enough history'); $('#trrpb')?.classList.remove('on');
  const ps = $('#trpanes'); if (ps && +ps.dataset.n > 1 && ps.dataset.focus == null) { await lpTo('#trc .trpbtns [data-a=max]', .1, .1); await lpClick(); trFocus(0); await lpSleep(350); } // one big chart
  trChart.timeScale().setVisibleLogicalRange({ from: trData.B.length - 110, to: trData.B.length + 22 }); RP.speed = c.pace; RP.play = true; RP.last = 0; rpLoop(); lpHud('watching'); await lpIdle(Math.round(lpR(3, 7)));
  while (LP?.on && lpLive()) { const c2 = LP.c, sg = c2.goal == 'profit' ? 1 : -1, real = RP.acct.me.realized;
    if (LP.k >= LP.plan.length) { if (sg * real >= c2.amt * .8 || LP.extra >= 3) break; LP.plan.push(c2.goal == 'profit' ? 'W' : 'L'); LP.extra++; } // short of the goal: one more
    const ok = await lpTrade(LP.plan[LP.k]); if (ok) LP.k++; lpHud('waiting'); await lpIdle(Math.round(lpR(2, 9))); }
  if (LP?.on) lpEnd(false); }
function lpEnd(exit, why) { if (!LP) return; LP.on = false; if (RP) { RP.play = false; if (RP.acct.me.qty) rpClose(); } document.body.classList.remove('lprun'); $('#lpcur')?.remove();
  const p = lpPnl(); lpHud(why || `done: ${p >= 0 ? '+' : ''}${trM(p)}`); if (exit) { const ds = LP.draws; window.lpStop(); void ds; if (RP) rpExit(); } }

// a fill: an arrow on the chart and a TradingView-style "order executed" notification
function lpExec(side, qty, px, kind, pnl) { if (!LP) return; LP.draws.push({ id: 'lx' + Math.random().toString(36).slice(2, 8), k: 'exec', side, t1: RP.live.t, p1: px, text: `${side == 'buy' ? 'Buy' : 'Sell'} ${qty}` }); lpDrawAll();
  let box = $('#lpnotes'); if (!box) { box = document.createElement('div'); box.id = 'lpnotes'; document.body.append(box); }
  const n = document.createElement('div'); n.className = 'lpnote'; n.innerHTML = `<i class="${side}">${side == 'buy' ? '▲' : '▼'}</i><div><b>${kind} order executed</b><span>${side == 'buy' ? 'Buy' : 'Sell'} ${qty} ${esc(trData?.sym || '')} @ ${trN(px)}${pnl != null ? ` · <em class=${pnl >= 0 ? 'up' : 'down'}>${pnl >= 0 ? '+' : ''}${trM(pnl)}</em>` : ''}</span></div>`;
  box.prepend(n); setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, 4200); }

// the order window, filled in by hand: side, Market, quantity, take profit and stop loss (with the odd typo)
async function lpType(sel, text) { let el = $(sel); if (!el) return; await lpTo(sel, .3, .15); await lpClick(); el = $(sel); el.focus(); el.select?.(); await lpSleep(lpR(80, 200)); el.value = '';
  let cur = ''; const put = v => { cur = v; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }; // keep the text here: a number field reads back empty mid-typing ("30523.")
  for (const ch of String(text)) { if (Math.random() < .07 && /\d/.test(ch)) { put(cur + String((+ch + 1 + Math.floor(Math.random() * 8)) % 10)); await lpSleep(lpR(150, 320)); put(cur.slice(0, -1)); await lpSleep(lpR(90, 200)); }
    put(cur + ch); await lpSleep(lpR(55, 160)); }
  el.value = String(text); el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true })); }
async function lpWin(side, qty, tp, sl) {
  const sb = `#trtk .tws.${side}`; if (!$(sb)?.classList.contains('on')) { await lpTo(sb, .25, .2); await lpClick(); $(sb)?.click(); await lpSleep(lpR(150, 300)); }
  const mk = '#trkind [data-v=market]'; if (!$(mk)?.classList.contains('on')) { await lpTo(mk, .2, .2); await lpClick(); $(mk)?.click(); await lpSleep(lpR(120, 250)); }
  await lpType('#trqty', qty);
  for (const [s, inp, v] of [['#twtpon', '#trtp', tp], ['#twslon', '#trsl', sl]]) { if (!$(s)?.classList.contains('on')) { await lpTo(s, .15, .15); await lpSleep(lpR(80, 180)); await lpClick(); $(s)?.click(); await lpSleep(lpR(150, 280)); }
    await lpType(inp, trN(v).replace(/,/g, '')); }
  await lpSleep(lpR(200, 600)); }
