// Build your own bot: indicator conditions for the entry and the exit, a stop and a target. Backtest it on real candles, then save it as a
// 24/7 paper bot (the server runs exactly the same rules). Server side: api/_lib/userbot.js
const UB_OPS = [['gt', 'is above'], ['lt', 'is below'], ['xa', 'crosses above'], ['xb', 'crosses below']];
const UB_TF = [['5m', '5m'], ['15m', '15m'], ['30m', '30m'], ['1h', '1H'], ['4h', '4H'], ['1d', '1D']];
const UB_LAB = { bands: { u: 'upper', l: 'lower', m: 'middle' }, macd: { m: 'MACD line', s: 'signal', h: 'histogram' }, adx: { a: 'ADX', p: '+DI', m: '-DI' }, aroon: { u: 'up', d: 'down' }, stoch: { k: '%K', d: '%D' }, srsi: { k: '%K', d: '%D' },
  ichi: { tk: 'Tenkan', kj: 'Kijun', sa: 'Span A', sb: 'Span B' }, piv: { p: 'pivot', r1: 'R1', r2: 'R2', s1: 'S1', s2: 'S2' }, vol: { v: 'volume', a: '20-bar average' } };
const UB_TPL = [
  ['EMA cross', { tf: '15m', entry: [{ a: 'ind:ema9', op: 'xa', b: 'ind:ema21' }], exit: [{ a: 'ind:ema9', op: 'xb', b: 'ind:ema21' }], stop: 1, target: 3 }],
  ['RSI dip in an uptrend', { tf: '1d', entry: [{ a: 'ind:rsi', op: 'lt', b: 'num:30' }, { a: 'price:c', op: 'gt', b: 'ind:sma200' }], exit: [{ a: 'ind:rsi', op: 'gt', b: 'num:55' }], stop: 5, target: 0 }],
  ['Supertrend flip', { tf: '1h', entry: [{ a: 'price:c', op: 'xa', b: 'ind:st' }], exit: [{ a: 'price:c', op: 'xb', b: 'ind:st' }], stop: 0, target: 0 }],
  ['Bollinger bounce', { tf: '15m', entry: [{ a: 'price:c', op: 'lt', b: 'ind:bb.l' }], exit: [{ a: 'price:c', op: 'gt', b: 'ind:bb.m' }], stop: 2, target: 0 }],
  ['MACD momentum', { tf: '1h', entry: [{ a: 'ind:macd.m', op: 'xa', b: 'ind:macd.s' }, { a: 'ind:adx.a', op: 'gt', b: 'num:20' }], exit: [{ a: 'ind:macd.m', op: 'xb', b: 'ind:macd.s' }], stop: 2, target: 4 }]];
let UB = null, UBOPTS = null;
function ubOptions() { if (UBOPTS) return UBOPTS; let p = 100; const B = Array.from({ length: 260 }, (_, i) => { const o = p; p += Math.sin(i / 7) + (i % 5) / 5 - .4; return { t: i * 300, o, h: Math.max(o, p) + .5, l: Math.min(o, p) - .5, c: p, v: 1000 + i }; }), C = B.map(b => b.c), o = [];
  o.push(['Price', [['price:c', 'Close'], ['price:o', 'Open'], ['price:h', 'High'], ['price:l', 'Low'], ['price:v', 'Volume']]]);
  const groups = {}; for (const [k, d] of Object.entries(INDS)) { if (d.bot || d.custom || k == 'vp') continue; let outs = []; try { outs = d.run(B, C, Object.fromEntries(d.p.map(([n, , v]) => [n, v])), { tf: '5m' }); } catch (e) {}
    const lab = UB_LAB[k] || (/^(bb|kc|dc|env)$/.test(k) ? UB_LAB.bands : {}), L = groups[d.g] || (groups[d.g] = []);
    if (k == 'st') L.push(['ind:st', 'Supertrend']); else if (k == 'ribbon') outs.forEach(x => L.push([`ind:${k}.${x.id}`, `Ribbon EMA ${x.id.slice(1)}`]));
    else if (outs.length <= 1) L.push([`ind:${k}`, d.n]); else outs.forEach(x => L.push([`ind:${k}.${x.id}`, `${d.n} · ${lab[x.id] || x.id}`])); }
  for (const [g, L] of Object.entries(groups)) o.push([g, L]); o.push(['Number', [['num', 'A number…']]]); return UBOPTS = o; }
const ubSel = (v, cls) => `<select class="inp ${cls}">${ubOptions().map(([g, L]) => `<optgroup label="${esc(g)}">${L.map(([k, l]) => `<option value="${k}" ${v == k || (k == 'num' && /^num:/.test(v)) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select>`;
const ubNew = () => ({ name: 'My bot', sym: 'SPY', tf: '15m', side: 'long', entry: [{ a: 'ind:ema9', op: 'xa', b: 'ind:ema21' }], exit: [], stop: 2, target: 4, risk: 10, ext: false });
async function buildPage(id) {
  app.innerHTML = `<div class=ph><div><h1>Build your own bot</h1><p class=lead>Pick conditions on any indicator, test them on real candles, then let it trade on paper around the clock.</p></div></div>
   <div id=ublist></div><div class="card pad ubed" id=ubed></div><div id=ubres></div>`;
  let bots = []; try { bots = (await mtapi('ub-list')).bots; } catch (e) { if (e.status == 401) return authView('login', '', () => buildPage(id)); }
  const edit = id && id != 'new' ? bots.find(b => b.id == id) : null; UB = edit ? { id: edit.id, ...edit.cfg } : (UB && id == 'new' ? UB : ubNew()); if (!edit && id != 'new') UB.id = undefined;
  ubList(bots); ubEditor();
}
function ubList(bots) { const el = $('#ublist'); if (!el) return; if (!bots.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<h2 style="margin:4px 0 12px">Your bots</h2><div class="dgrid ublist">${bots.map(b => { const p = b.balance - b.paper; return `<div class="card pad ubcard"><div class="row sb"><div><b>${esc(b.cfg.name)}</b><div class=mut style="font-size:12.5px">${esc(b.cfg.sym)} · ${UB_TF.find(x => x[0] == b.cfg.tf)?.[1] || b.cfg.tf} · ${b.cfg.side}</div></div><button class="trsw ${b.enabled ? 'on' : ''}" data-on="${b.id}" role=switch aria-checked=${b.enabled} aria-label="Bot on or off"><i></i></button></div>
    <div class="num dbal" style="margin-top:10px">${usd(b.balance, 0)}</div><div class="num ${p >= 0 ? 'up' : 'down'}" style="font-size:13px">${p >= 0 ? '+' : ''}${usd(p, 2)} · ${b.n} trade${b.n == 1 ? '' : 's'}${b.n ? ' · ' + Math.round(b.won / b.n * 100) + '% won' : ''}</div>
    <div class=mut style="font-size:12px;margin-top:6px">${b.enabled ? (b.state?.at ? 'Checked ' + rel(b.state.at) : 'Starting…') : 'Off'}</div>
    <div class=row style="gap:8px;margin-top:12px"><a class="btn sm" href="#/build/${b.id}">Edit</a><button class="btn sm danger" data-del="${b.id}">Delete</button></div></div>`; }).join('')}</div>`;
  el.querySelectorAll('[data-on]').forEach(x => x.onclick = async () => { const on = !x.classList.contains('on'); try { await mtapi('ub-on', { id: x.dataset.on, on }); toast(on ? 'Bot on: it trades on paper from the next finished candle' : 'Bot off'); buildPage(location.hash.split('/')[2]); } catch (e) { toast(esc(e.message)); } });
  el.querySelectorAll('[data-del]').forEach(x => x.onclick = async () => { if (!confirm('Delete this bot and its trade history?')) return; await mtapi('ub-del', { id: x.dataset.del }); location.hash = '#/build'; buildPage(); }); }
function ubRow(c, i, part) { return `<div class=ubrow data-part=${part} data-i=${i}>${ubSel(c.a, 'uba')}<select class="inp ubop">${UB_OPS.map(([k, l]) => `<option value=${k} ${c.op == k ? 'selected' : ''}>${l}</option>`).join('')}</select>${ubSel(c.b, 'ubb')}<input class="inp ubn" type=number step=any value="${/^num:/.test(c.b) ? esc(c.b.slice(4)) : ''}" ${/^num:/.test(c.b) ? '' : 'hidden'} placeholder=Number><button class="btn sm ic ubx" aria-label="Remove">${ic('x', 13)}</button></div>`; }
function ubEditor() {
  const el = $('#ubed'), s = UB;
  el.innerHTML = `<div class="row sb" style="flex-wrap:wrap;gap:10px"><h2>${s.id ? 'Edit bot' : 'New bot'}</h2><div class="seg chips ubtpl">${UB_TPL.map(([n], i) => `<button data-t=${i}>${n}</button>`).join('')}</div></div>
   <div class=ubgrid><label>Name<input class=inp id=ubname value="${esc(s.name)}" maxlength=40></label><label>Symbol<input class=inp id=ubsym value="${esc(s.sym)}" placeholder="SPY, AAPL, BTC-USD, NQ=F"></label>
    <label>Timeframe<div class=seg id=ubtf>${UB_TF.map(([k, l]) => `<button data-v=${k} class="${s.tf == k ? 'on' : ''}">${l}</button>`).join('')}</div></label>
    <label>Direction<div class=seg id=ubside>${[['long', 'Buy (long)'], ['short', 'Sell (short)']].map(([k, l]) => `<button data-v=${k} class="${s.side == k ? 'on' : ''}">${l}</button>`).join('')}</div></label></div>
   <h3 class=ubh>Enter when <span class=mut>all of these are true at a candle's close (fills at the next open)</span></h3><div id=ubentry>${s.entry.map((c, i) => ubRow(c, i, 'entry')).join('')}</div><button class="btn sm" data-add=entry>+ Condition</button>
   <h3 class=ubh>Exit when <span class=mut>all of these are true (optional; the stop and target also exit)</span></h3><div id=ubexit>${s.exit.map((c, i) => ubRow(c, i, 'exit')).join('')}</div><button class="btn sm" data-add=exit>+ Condition</button>
   <div class="ubgrid" style="margin-top:18px"><label>Stop loss %<input class=inp id=ubstop type=number min=0 max=50 step=.1 value=${s.stop}><span class=mut>0 = none</span></label><label>Take profit %<input class=inp id=ubtgt type=number min=0 max=200 step=.1 value=${s.target}><span class=mut>0 = none</span></label>
    <label>Position size<input class=inp id=ubrisk type=number min=.1 max=100 step=1 value=${s.risk}><span class=mut>% of the bot's balance per trade</span></label><label class=ubext><span>Extended hours</span><button class="trsw ${s.ext ? 'on' : ''}" id=ubext role=switch aria-checked=${s.ext}><i></i></button></label></div>
   <div class=row style="gap:10px;margin-top:20px;flex-wrap:wrap"><button class="btn" id=ubbt>Backtest</button><button class="btn" id=ubsave>Save</button><button class="btn pri" id=ubgo>${s.id ? 'Save' : 'Save'} and start paper trading</button>${s.id ? '<a class=btn href="#/build/new">New bot</a>' : ''}</div>`;
  const read = () => { const rows = part => [...el.querySelectorAll(`.ubrow[data-part=${part}]`)].map(r => { const b = r.querySelector('.ubb').value; return { a: r.querySelector('.uba').value, op: r.querySelector('.ubop').value, b: b == 'num' ? 'num:' + (r.querySelector('.ubn').value || 0) : b }; });
    Object.assign(UB, { name: $('#ubname').value.trim() || 'My bot', sym: $('#ubsym').value.trim().toUpperCase() || 'SPY', entry: rows('entry'), exit: rows('exit'), stop: +$('#ubstop').value || 0, target: +$('#ubtgt').value || 0, risk: +$('#ubrisk').value || 10 }); return UB; };
  el.querySelectorAll('.ubb').forEach(x => x.onchange = () => { const n = x.parentElement.querySelector('.ubn'); n.hidden = x.value != 'num'; if (!n.hidden) n.focus(); });
  el.querySelectorAll('.ubx').forEach(x => x.onclick = () => { const r = x.parentElement; read(); UB[r.dataset.part].splice(+r.dataset.i, 1); ubEditor(); });
  el.querySelectorAll('[data-add]').forEach(x => x.onclick = () => { read(); UB[x.dataset.add].push({ a: 'price:c', op: 'gt', b: 'ind:sma50' }); ubEditor(); });
  el.querySelectorAll('#ubtf button').forEach(x => x.onclick = () => { read(); UB.tf = x.dataset.v; ubEditor(); });
  el.querySelectorAll('#ubside button').forEach(x => x.onclick = () => { read(); UB.side = x.dataset.v; ubEditor(); });
  $('#ubext').onclick = () => { read(); UB.ext = !UB.ext; ubEditor(); };
  el.querySelectorAll('.ubtpl button').forEach(x => x.onclick = () => { read(); const [n, t] = UB_TPL[+x.dataset.t]; Object.assign(UB, JSON.parse(JSON.stringify(t)), { name: n }); ubEditor(); toast('Template: ' + n); });
  $('#ubbt').onclick = () => ubBacktest(read());
  const save = async start => { try { const r = await mtapi('ub-save', { id: UB.id, cfg: read() }); UB.id = r.id; if (start) await mtapi('ub-on', { id: r.id, on: true }); toast(start ? 'Saved. The bot trades on paper from the next finished candle.' : 'Saved'); location.hash = '#/build/' + r.id; } catch (e) { toast(esc(e.message)); } };
  $('#ubsave').onclick = () => save(false); $('#ubgo').onclick = () => save(true); }
let ubChart = null;
async function ubBacktest(cfg) {
  const el = $('#ubres'); el.innerHTML = '<div class="card pad"><div class=sk style="height:220px;border-radius:16px"></div></div>'; let r;
  try { r = await mtapi('ub-bt', { cfg }); } catch (e) { el.innerHTML = `<div class="card pad"><b>Backtest failed</b><div class=mut>${esc(e.message)}</div></div>`; return; }
  const tile = (k, v, cls = '') => `<div class=stat><div class=k>${k}</div><div class="v num ${cls}">${v}</div></div>`;
  el.innerHTML = `<div class="card pad"><div class="row sb" style="flex-wrap:wrap;gap:8px"><h2>Backtest · ${esc(r.name || r.sym)} · ${UB_TF.find(x => x[0] == r.tf)?.[1]}</h2><span class=mut style="font-size:12.5px">${new Date(r.from * 1000).toLocaleDateString()} to ${new Date(r.to * 1000).toLocaleDateString()} · ${r.bars} candles</span></div>
    <div class="grid g4" style="margin-top:14px">${tile('Net result', (r.net >= 0 ? '+' : '') + usd(r.net, 0) + ` <small>(${r.netPct.toFixed(1)}%)</small>`, r.net >= 0 ? 'up' : 'down')}${tile('Trades', r.n)}${tile('Won', r.n ? Math.round(r.win * 100) + '%' : '-')}${tile('Worst drop', r.maxDD.toFixed(1) + '%', 'down')}</div>
    <div class=mut style="font-size:12.5px;margin:10px 0">Starting from $10,000 · profit factor ${r.pf == null ? '∞' : r.pf.toFixed(2)} · ${esc(r.note)}</div><div class=ubchart id=ubchart></div></div>`;
  try { const d = await mtapi('candles', null, `&sym=${encodeURIComponent(cfg.sym)}&tf=${cfg.tf}&ext=${cfg.ext ? 1 : 0}`); if (!window.MimicCharts) await trLib(); ubChart?.remove();
    const dark = document.documentElement.dataset.theme == 'dark', c = MimicCharts.createChart($('#ubchart'), { layout: { textColor: dark ? '#8d8d93' : '#86868f', fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 }, grid: { vertLines: { color: dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)' }, horzLines: { color: dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)' } }, localization: { priceFormatter: p => (+p).toFixed(2) } });
    ubChart = c; const s = c.addCandlestickSeries({}), z = TZ(); s.setData(d.bars.map(x => ({ time: x[0] + z, open: x[1], high: x[2], low: x[3], close: x[4] })));
    const mk = []; for (const t of r.trades) { const up = t.dir == 1; mk.push({ time: t.t0 + z, position: up ? 'belowBar' : 'aboveBar', shape: up ? 'arrowUp' : 'arrowDown', color: up ? '#089981' : '#f23645', text: up ? 'Buy' : 'Sell' }); mk.push({ time: t.t1 + z, position: up ? 'aboveBar' : 'belowBar', shape: 'circle', color: t.pnl >= 0 ? '#089981' : '#f23645', text: (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0) }); }
    s.setMarkers(mk.sort((a, b) => a.time - b.time)); const n = d.bars.length; c.timeScale().setVisibleLogicalRange({ from: n - 160, to: n + 3 }); } catch (e) { }
}
