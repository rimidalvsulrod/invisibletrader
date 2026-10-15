// Strategy Lab tab: one page for every Lab bot (ICT, options, quant, order flow). The server's lab.js describes each bot (name, rules, dials, backtest choices)
// and sends a "view" (status, candles + what the rules drew, or holdings for portfolio bots). Paper only: each bot has its own simulated account.
const LABS = [ // [id, icon, name] in the menu, by group
  ['ICT', [['fvg', 'star', 'FVG Bot'], ['fib', 'spark', 'Fibonacci OTE'], ['stdv', 'wave', 'STDV Bot'], ['qt', 'book', 'Quarterly Theory'], ['liq', 'scales', 'Liquidity Raid'], ['amt', 'flask', 'AMT Value Area']]],
  ['Options', [['putwall', 'lock', 'Put Wall'], ['callwall', 'unlock', 'Call Wall'], ['flip', 'arrow', 'Gamma Flip'], ['vex', 'spark', 'VEX Bot'], ['oflow', 'wave', 'Options Flow']]],
  ['Quant', [['quant', 'flask', 'Quant RSI-2'], ['top', 'trophy', 'Top Picks'], ['proven', 'star', 'Proven Trend'], ['pairs', 'scales', 'Stat-Arb Pairs'], ['macro', 'coin', 'Macro Regime'], ['wallst', 'book', 'Wall Street']]],
  ['Order flow', [['lv2', 'search', 'LV2 Imbalance'], ['foot', 'paper', 'Footprint'], ['cvd', 'wave', 'Order Flow CVD'], ['heat', 'sun', 'Heat Map']]]];
const LABIDS = LABS.flatMap(([, x]) => x.map(y => y[0]));
let labT = null, labS = null, labId = null;
const labStop = () => { clearInterval(labT); labT = null; };
const labapi = async (op, id, body) => {
  const r = await fetch('/api/powell' + (body ? '' : `?op=lab-${op}&id=${id}`), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'lab-' + op, id, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const labM = (x, d = 2) => (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const labN = x => x == null ? '-' : Math.abs(x) >= 100 ? Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 }) : Number(x).toFixed(Math.abs(x) >= 1 ? 2 : 4);
const labClock = t => new Date(t).toLocaleString([], { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

async function labPage(id) {
  labStop(); labId = id; if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', () => labPage(id)); await signedIn(me.user); }
  app.innerHTML = sk(420);
  try { labS = await labapi('state', id); } catch (e) { if (e.status === 401) return authView('login', '', () => labPage(id)); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  labRender(); labT = setInterval(async () => { if (!$('#labhero') || labId !== id) return labStop(); try { labS = await labapi('state', id); labPaint(); } catch (e) {} }, 15000);
}
function labOpenPnl() { return (labS.trades || []).filter(t => t.status == 'open' && t.upnl != null).reduce((a, t) => a + t.upnl, 0); }
function labRender() {
  const s = labS, m = s.meta;
  app.innerHTML = `<div class="ph fade"><div><div class=row style="gap:8px"><span class="pill n">${esc(m.group)}</span><span class="pill n">Paper</span></div><h1 style="margin-top:6px">${esc(m.name)}</h1><p class=lead>${esc(m.blurb)}</p></div></div>
  <div class="card pad hero" id=labhero></div>
  <div class="card pad" style="margin-top:16px"><div class="row sb wrapf"><h2>${m.kind == 'port' ? 'Portfolio' : 'Live chart'}</h2><span class=mut style="font-size:12.5px" id=labsub></span></div><div id=labstat class=mut style="font-size:13.5px;margin-top:6px"></div><div id=labch style="margin-top:10px"></div><div id=lablg></div><div id=labhold></div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card pad"><h2>Settings</h2><div id=labcfg style="margin-top:10px"></div></div>
   <div class="card pad"><h2>The rules</h2><ol style="margin:10px 0 0 18px;padding:0;font-size:13.5px;line-height:1.6">${(m.how || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol><div class=mut style="font-size:12.5px;margin-top:10px">${esc(m.data || '')}</div>${m.honest ? btWarn(esc(m.honest)) : ''}</div></div>
  ${m.bt ? btCard('labbt' + s.id, { opts: m.bt.opts, def: m.bt.def, note: 'The exact rules the bot trades, replayed on past data with the same conservative fills (stop first, slippage, fees).' }) : ''}
  ${bcProfitCard('labpc')}
  <div class="card pad" style="margin-top:16px"><div class="row sb"><h2>Trades</h2><button class="btn" id=labreset>Reset paper account</button></div><div id=labtr style="margin-top:8px"></div></div>`;
  labCfg(); labPaint();
  if (m.bt) btWire('labbt' + s.id, { run: async v => labBt(await labapi('bt', s.id, { days: +v })) });
  $('#labreset').onclick = async () => { const a = prompt('Start the paper account again with how many dollars?', '25000'); if (a == null) return; await labapi('reset', s.id, { amount: +a || 25000 }); labS = await labapi('state', s.id); labPaint(); toast?.('Paper account reset'); };
}
function labPaint() {
  const s = labS, a = s.account, up = labOpenPnl(), eq = a.equity + up, prof = eq - a.start, h = $('#labhero'); if (!h) return;
  h.innerHTML = `<div class="row sb wrapf" style="gap:16px"><div><div class=mut style="font-size:13px">Paper balance</div><div class="num" style="font-size:38px;font-weight:650;letter-spacing:-.02em">${labM(eq)}</div>
   <div class="num ${prof >= 0 ? 'up' : 'down'}" style="font-weight:600">${prof >= 0 ? '+' : ''}${labM(prof)} (${btPct(prof / a.start, 2)})${up ? ` <span class=mut style="font-weight:400">incl. ${labM(up)} open</span>` : ''}</div></div>
   <div class=row style="gap:22px;flex-wrap:wrap"><div><div class=mut style="font-size:12px">Trades</div><div class=num style="font-size:20px;font-weight:600">${a.n}</div></div><div><div class=mut style="font-size:12px">Win rate</div><div class=num style="font-size:20px;font-weight:600">${a.n ? Math.round(a.won / a.n * 100) + '%' : '-'}</div></div>
   <button class="btn ${s.enabled ? '' : 'pri'}" id=labgo style="min-width:120px">${s.enabled ? 'Stop bot' : 'Start bot'}</button></div></div>
   <div class=row style="gap:8px;margin-top:12px"><span class="dot" style="background:${s.enabled ? 'var(--up)' : 'var(--mut2)'};position:static"></span><span class=mut style="font-size:13px">${s.enabled ? 'Running 24/7 on the server, paper trading every signal.' : 'Off. Start it and it paper-trades every signal the rules make from now on.'}</span></div>`;
  $('#labgo').onclick = async () => { $('#labgo').disabled = true; try { await labapi(s.enabled ? 'stop' : 'start', s.id, {}); labS = await labapi('state', s.id); labPaint(); } catch (e) { toast?.(e.message); } };
  const v = s.view; $('#labstat').innerHTML = v ? esc(v.status || '') : `<span class=down>${esc(s.viewError || 'No data')}</span>`; $('#labsub').textContent = v?.t ? 'Updated ' + labClock(v.t) + ' ET' : '';
  labChart(v); labHold(v);
  bcProfitDraw('labpc', s.trades);
  const tr = s.trades || []; $('#labtr').innerHTML = tr.length ? `<div style="overflow-x:auto"><table class=tbl><thead><tr><th>When (ET)</th><th>Trade</th><th class=r>Entry</th><th class=r>Exit</th><th class=r>Profit</th></tr></thead><tbody>${tr.map(t => `<tr><td class=mut style="white-space:nowrap">${labClock(t.ts)}</td><td><span class="pill ${t.dir == 'long' ? 'up' : 'down'}">${t.dir}</span> ${t.qty != null ? labN(+t.qty) + ' ' : ''}${esc(t.sym)}<div class=mut style="font-size:12px">${esc(t.status == 'skip' ? 'Not taken: ' + (t.reason || '') : t.why || '')}${t.status == 'closed' && t.reason ? ' · ' + esc(t.reason) : ''}</div></td><td class="r num">${labN(+t.entry)}</td><td class="r num">${t.exitp != null ? labN(+t.exitp) : t.status == 'open' ? '<span class=pill>open</span>' : '-'}</td><td class="r num ${(t.pnl ?? t.upnl) >= 0 ? 'up' : 'down'}">${t.pnl != null ? sg2(+t.pnl) : t.upnl != null ? sg2(t.upnl) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty" style="padding:20px 0">No trades yet. Start the bot: it records every trade its rules make.</div>';
}
function labChart(v) {
  const el = $('#labch'); if (!el) return; if (!v || !(v.bars || v.line)) { el.innerHTML = ''; $('#lablg').innerHTML = ''; return; }
  const B = v.bars ? v.bars.map(x => ({ t: x[0] / 1000, o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })) : v.line.map(x => ({ t: x[0] / 1000, o: x[1], h: x[1], l: x[1], c: x[1] })), I = t => bcIdx(B, t / 1000), d = v.draw || {};
  const levels = (d.levels || []).map(l => ({ y: l.y, name: l.name, color: l.color, i0: l.t0 ? I(l.t0) : undefined, i1: l.t1 ? I(l.t1) : undefined, dash: l.dash }));
  const lo = Math.min(...B.map(b => b.l)), hi = Math.max(...B.map(b => b.h)), pad = (hi - lo) * .05;
  const zones = (d.zones || []).filter(z => Math.max(z.y0, z.y1) >= lo - pad && Math.min(z.y0, z.y1) <= hi + pad).map(z => ({ y0: z.y0, y1: z.y1, color: z.color, i0: z.t0 ? I(z.t0) : undefined, i1: z.t1 ? I(z.t1) : undefined }));
  const vlines = (d.vlines || []).map(x => ({ i: I(x.t), name: x.name, color: x.color }));
  const marks = (v.events || []).filter(e => e.type == 'fill' || e.type == 'exit').map(e => ({ i: I(e.t), y: e.p, kind: e.type == 'fill' ? (e.dir == 1 ? 'up' : 'down') : 'x', color: e.type == 'fill' ? (e.dir == 1 ? 'var(--up)' : 'var(--down)') : 'var(--text)', tip: e.type == 'fill' ? `${e.dir == 1 ? 'Bought' : 'Sold'} ${labN(e.p)}` : `Closed ${labN(e.p)} (${e.why || ''})` }));
  for (const e of (v.events || []).filter(e => e.type == 'arm')) marks.push({ i: I(e.t), y: e.p, color: 'var(--ac)', r: 3, tip: 'Armed: ' + (e.why || '') });
  for (const x of d.marks || []) marks.push({ i: I(x.t), y: x.y, kind: x.kind, color: x.color, name: x.name, tip: x.tip });
  const p = v.pos || v.order; if (p) { const i0 = I(p.t0), tag = v.pos ? '' : 'order '; levels.push({ y: p.entry ?? v.last, name: tag + 'entry', color: 'var(--text)', i0, dash: '' }, { y: p.stop, name: 'stop', color: 'var(--down)', i0, fit: 1 }); if (p.target != null) levels.push({ y: p.target, name: 'target', color: 'var(--up)', i0, fit: 1 }); }
  const panes = (v.panes || []).map(q => ({ ...q, colors: q.colors }));
  if (v.bars && !panes.length && B.some(b => b.v)) panes.push({ name: 'Volume', short: 'Vol', type: 'bars', vals: B.map(b => b.v), colors: B.map(b => b.c >= b.o ? 'rgba(48,209,88,.5)' : 'rgba(255,69,58,.5)'), h: 50 });
  bcChart(el, { bars: B, levels, zones, vlines, marks, panes, last: v.last, overlays: (d.lines || []).map(o => ({ ...o })), h: 320, tf: v.line ? (t => new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })) : (t => new Date(t * 1000).toLocaleTimeString([], { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })), tfFull: v.line ? (t => new Date(t * 1000).toLocaleDateString()) : (t => labClock(t * 1000)), style: v.bars ? 'candle' : 'line', color: 'var(--ac)' });
  $('#lablg').innerHTML = v.line ? '<div class=mut style="font-size:12px;margin-top:6px">The rules\' result over the last year (start = 100), after costs.</div>' : bcLegend([['var(--up)', 'buy', 'tri'], ['var(--down)', 'sell', 'tri'], ['var(--ac)', 'armed'], ...(d.legend || [])]);
}
function labHold(v) {
  const el = $('#labhold'); if (!el) return; if (!v?.holdings) { el.innerHTML = ''; return; }
  el.innerHTML = v.holdings.length ? `<table class=tbl style="margin-top:12px"><thead><tr><th>${esc(v.holdTitle || 'Target holdings')}</th><th class=r>Weight</th><th>Why</th></tr></thead><tbody>${v.holdings.map(h => `<tr><td><b>${esc(h.sym)}</b>${h.px ? `<div class="mut num" style="font-size:12px">${labN(h.px)}</div>` : ''}</td><td class="r num ${h.w < 0 ? 'down' : ''}">${(h.w * 100).toFixed(0)}%</td><td class=mut style="font-size:12.5px">${esc(h.why || '')}</td></tr>`).join('')}</tbody></table>` : '<div class=empty style="padding:14px 0">In cash.</div>';
}
function labCfg() {
  const s = labS, m = s.meta, c = s.cfg, el = $('#labcfg'), seg = (k, opts) => `<div style="margin-bottom:12px"><div class=mut style="font-size:12.5px;margin-bottom:5px">${k == 'sym' ? 'Market' : esc(m.choiceLabels?.[k] || k)}</div><div class=seg data-k=${k}>${opts.map(o => `<button data-v="${o}" class="${c[k] == o ? 'on' : ''}">${esc(String(o))}</button>`).join('')}</div></div>`;
  el.innerHTML = (m.syms && m.syms.length > 1 ? seg('sym', m.syms) : '') + Object.entries(m.choices || {}).map(([k, o]) => seg(k, o)).join('') +
    (m.params || []).map(p => `<div style="margin-bottom:12px"><div class="row sb"><span style="font-size:13.5px">${esc(p.label)}</span><b class=num id=labv-${p.k}>${c[p.k]}</b></div><input type=range min=${p.min} max=${p.max} step=${p.step} value=${c[p.k]} data-k=${p.k} style="width:100%"><div class=mut style="font-size:12px">${esc(p.unit || '')}</div></div>`).join('') + '<div class=mut style="font-size:12px" id=labsaved></div>';
  const save = async patch => { try { const r = await labapi('cfg', s.id, { cfg: patch }); labS.cfg = r.cfg; $('#labsaved').textContent = 'Saved.'; labS = await labapi('state', s.id); labPaint(); } catch (e) { $('#labsaved').textContent = e.message; } };
  $$('#labcfg .seg button').forEach(b => b.onclick = () => { const k = b.parentNode.dataset.k; $$(`#labcfg .seg[data-k=${k}] button`).forEach(x => x.classList.toggle('on', x === b)); save({ [k]: b.dataset.v }); });
  $$('#labcfg input[type=range]').forEach(r => { r.oninput = () => { $('#labv-' + r.dataset.k).textContent = r.value; }; r.onchange = () => save({ [r.dataset.k]: +r.value }); });
}
function labBt(r) {
  if (r.port) return btTiles([['Return', btPct(r.ret), `${r.from} to ${r.to}`, r.ret >= 0 ? 'up' : 'down'], ['Buy and hold ' + r.bench, btPct(r.benchRet), 'same period', r.benchRet >= 0 ? 'up' : 'down'], ['Worst drop', btPct(r.maxDD), 'peak to trough', 'down'], ['Yearly', btPct(r.cagr), 'compounded'], ['Sharpe', r.sharpe.toFixed(2), 'risk-adjusted, yearly'], ['Rebalances', r.n, r.note || '']]) +
    (r.curve ? (labBt.c = r.curve, setTimeout(labBtCurve, 30), `<div id=labbtc class=chart style="margin-top:12px"></div>`) : '') + (r.trades?.length ? btRows(r.trades.map(t => ({ tag: t.date, title: esc(t.what), sub: esc(t.why || ''), right: t.ret != null ? btPct(t.ret) : '', good: t.ret > 0, bad: t.ret < 0 }))) : '') + (r.warn ? btWarn(esc(r.warn)) : '');
  return btTiles([['Trades', r.n, `${r.from || ''} to ${r.to || ''}`], ['Win rate', r.n ? Math.round(r.win * 100) + '%' : '-', 'of trades'], ['Total', (r.totalR >= 0 ? '+' : '') + r.totalR.toFixed(1) + 'R', 'R = the amount risked', r.totalR >= 0 ? 'up' : 'down'],
    ['Profit per ' + r.unit, btUsd(r.net), 'after fees and slippage', r.net >= 0 ? 'up' : 'down'], ['Profit factor', r.pf == null ? '∞' : r.pf.toFixed(2), 'won ÷ lost'], ['Worst run', r.maxDD.toFixed(1) + 'R', 'peak to trough']]) +
    (r.exBest != null && r.n >= 5 ? btWarn(`Without the best ${r.cut} trade${r.cut > 1 ? 's' : ''} the average is <b>${r.exBest >= 0 ? '+' : ''}${r.exBest.toFixed(2)}R</b> a trade. ${r.exBest <= 0 ? 'So the result leans on a few lucky trades.' : 'So it does not depend on one lucky trade.'}`) : '') + btSample(r.n) +
    btRows((r.trades || []).map(t => ({ tag: t.date, title: `${t.dir == 1 ? 'Long' : 'Short'} ${labN(t.entry)} → ${labN(t.exit)}`, sub: esc(t.why || ''), right: (t.r >= 0 ? '+' : '') + t.r.toFixed(2) + 'R', good: t.r > 0, bad: t.r < 0 })));
}
function labBtCurve() { const el = $('#labbtc'); if (!el || !labBt.c) return; const c = labBt.c; area(el, c.map(x => x[1]), { h: 170, axis: 1, fmt: v => btPct(v - 1), tip: i => `<b class=num>${btPct(c[i][1] - 1)}</b><div class=mut>${c[i][0]}</div>` }); }
