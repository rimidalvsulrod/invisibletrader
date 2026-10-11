// Swing Trader tab: on/off, size, what it is watching, positions and trades. Uses the Alpaca account connected in Newsflash.
let swT = null, swS = null, swSym = null, swCh = null;
const swStop = () => { clearInterval(swT); swT = null; };
const swapi = async (op, body) => {
  const r = await fetch('/api/swing' + (body ? '' : '?op=' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
async function swingPage() {
  swStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', swingPage); await signedIn(me.user); }
  app.innerHTML = sk(320);
  try { swS = await swapi('state'); } catch (e) { if (e.status === 401) return authView('login', '', swingPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  swRender(); swT = setInterval(async () => { if (!$('#swwatch')) return swStop(); try { swS = await swapi('state'); swRender(); } catch (e) {} }, 30000);
}
function swRender() {
  const s = swS, c = s.cfg, A = s.account, st = s.stats, R = s.rules, L = s.live, settled = st.won + st.lost, open = s.trades.filter(t => t.status == 'open');
  app.innerHTML = `<div class="ph fade"><div><h1>Swing Trader</h1><p class=lead>Buys sharp dips in uptrends on your Alpaca account and sells the bounce, a few days later. It decides once a day, from yesterday's closing prices.</p></div></div>
    <div class="card pad"><div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${s.enabled ? 'on' : ''}" id=swtog aria-label="Swing Trader on/off" ${s.connected ? '' : 'disabled'}></button>
      <div><div style="font-size:22px;font-weight:650">${s.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">${!s.connected ? 'Connect Alpaca in the Newsflash tab first' : s.paper ? 'Alpaca paper account: fake money, real market' : 'Alpaca LIVE account: real money'}</div></div></div>
      ${s.connected ? '' : '<a class="btn pri" href="#/news">Connect Alpaca</a>'}</div>
      ${s.accountError ? `<div class=note style="margin-top:14px">${esc(s.accountError)}</div>` : ''}
      <div class="grid g3" style="margin-top:20px"><div class=stat><div class=k>Account value</div><div class="v num">${A ? usd(A.equity, 2) : '-'}</div><div class=s>${A ? `today <span class="${ud(A.day)}">${sg(A.day, 2)}</span> · cash ${usd(A.cash, 2)}` : 'on Alpaca'}</div></div>
        <div class=stat><div class=k>Bot win rate</div><div class="v num">${settled ? Math.round(st.won / settled * 100) + '%' : '-'}</div><div class=s>${st.won} won · ${st.lost} lost</div></div>
        <div class=stat><div class=k>Bot profit</div><div class="v num ${ud(st.pnl)}">${sg(st.pnl, 2)}</div><div class=s>${st.n} closed trade${st.n == 1 ? '' : 's'} · ${open.length} open</div></div></div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card pad"><h2>Size</h2><p class=mut style="font-size:13px;margin:6px 0 12px">How much of your account each position uses, and how many it can hold at once.</p>
        <div class=dials><div id=swd1></div><div id=swd2></div></div>
        <div class=mut style="font-size:12.5px;margin-top:10px">At most ${c.pct * c.max}% of your account is invested at once. It never touches stocks you already own, and only sells shares it bought itself.</div></div>
      <div class="card pad"><h2>The rules</h2><div class=mut style="font-size:13px;line-height:1.6;margin-top:6px">Watches ${R.universe} large, liquid stocks and ETFs. <b>Buys</b> when one closes above its ${R.trend}-day average (uptrend) but its 2-day RSI is under ${R.rsi} (a sharp dip). <b>Sells</b> when it closes back above its ${R.exitMA}-day average, after ${R.maxDays} trading days, or at -${R.stop}%. Skips new buys for the day if your account is down 3%.</div>
        <div class=note style="margin-top:12px;font-size:12.5px;line-height:1.55">Honest expectations: in a test on 2003 to 2026 prices, about 2 in 3 trades won and the average gain was small (about +0.15% per trade after costs), which works out to roughly 1 to 5% a year at these sizes. It lost less than the market in crashes but earned much less than just holding in good years. It is a low-risk, low-return strategy, not a way to get rich fast.</div></div></div>
    <div class="card pad" style="margin-top:16px"><div class="row sb wrapf" style="gap:12px"><h2>Chart</h2><div class=bcsel><select class=inp id=swsel style="width:auto"></select></div></div>
      <div class=mut style="font-size:13px;margin-top:8px;line-height:1.55" id=swinfo></div><div id=swcv style="margin-top:10px"></div><div id=swleg></div></div>
    ${bcProfitCard('swpc')}
    ${btCard('swbt', { opts: [[1, 'Last 1 year'], [2, 'Last 2 years'], [3, 'Last 3 years']], def: 2, note: `Replays the exact rules (above the ${R.trend}-day average, 2-day RSI under ${R.rsi}, sell above the ${R.exitMA}-day average, after ${R.maxDays} days or at -${R.stop}%) on free Yahoo Finance daily prices for the same ${R.universe} stocks and ETFs, ${c.pct}% per position, at most ${c.max} at once, with 0.05% slippage each way. It takes a few seconds.` })}
    <div class="card" style="margin-top:16px;overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Watching</h2><div class=mut style="font-size:12.5px;margin-top:4px" id=swwatch>${!L ? 'Waiting for the 24/7 runner to load prices…' : `${L.uptrend} of ${L.n} are in an uptrend · ${L.buys} buy signal${L.buys == 1 ? '' : 's'} · prices as of ${esc(L.asof || '?')} close`}</div></div>
      ${L && L.watch.length ? `<table class=tbl><tbody>${L.watch.map(w => `<tr><td style="width:1%"><span class="pill ${w.buy ? 'up' : 'n'}">${w.buy ? 'Buy signal' : 'Watching'}</span></td><td><b>${esc(w.sym)}</b> <span class=mut>${usd(w.c, 2)}</span></td><td class="r num mut">RSI(2) ${w.r2}</td></tr>`).join('')}</tbody></table>` : ''}</div>
    <div class="card" style="margin-top:16px;overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Trades</h2></div><table class=tbl><tbody>${s.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.pnl > 0 ? 'up' : t.pnl < 0 ? 'down' : 'n'}">${t.status == 'open' ? 'Open' : t.pnl > 0 ? 'Won' : t.pnl < 0 ? 'Lost' : 'Closed'}</span></td>
      <td><div><b>${esc(t.sym)}</b> · bought ${usd(t.notional || t.qty * t.entry, 2)} at ${usd(t.entry, 2)}${t.exitp ? ` · sold at ${usd(t.exitp, 2)}` : t.last ? ` · now ${usd(t.last, 2)}` : ''}</div><div class=mut style="font-size:12.5px;margin-top:2px">${esc(t.why || '')}${t.reason ? ` · ${esc(t.reason)}` : t.stop ? ` · stop ${usd(t.stop, 2)}` : ''}</div></td>
      <td class=r><div class="num ${t.pnl == null ? (t.last ? ud(t.last - t.entry) : 'mut') : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? (t.last ? sg((t.last - t.entry) * t.qty, 2) : '') : sg(t.pnl, 2)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It decides once a day, 10 minutes after the market opens, and only buys when a stock dips sharply in an uptrend.</td></tr>`}</tbody></table></div>`;
  swChart(); bcProfitDraw('swpc', s.trades, { label: t => t.sym });
  btWire('swbt', { run: async y => btSwingHtml(await swapi('bt', { years: +y })) });
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } swS = await swapi('state').catch(() => swS); swRender(); };
  $('#swtog').onclick = () => { if (!s.enabled && !s.paper && !confirm('Start the Swing Trader with REAL money on your Alpaca account?')) return; act(() => swapi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'Swing Trader paused' : 'Swing Trader started'); };
  dialMount('#swd1', { key: 'swing-pct', value: c.pct, min: 1, max: 20, step: 1, unit: '% each position', fmt: v => String(Math.round(v)), size: 'sm', caption: v => A ? `≈ ${usd(A.equity * v / 100, 0)} per position` : '', onCommit: v => act(() => swapi('cfg', { cfg: { pct: v } }), 'Saved') });
  dialMount('#swd2', { key: 'swing-max', value: c.max, min: 1, max: 10, step: 1, unit: 'positions at once', fmt: v => String(Math.round(v)), size: 'sm', caption: v => `at most ${c.pct * v}% of your account invested`, onCommit: v => act(() => swapi('cfg', { cfg: { max: v } }), 'Saved') });
}

function btSwingHtml(r) {
  return `<h2 style="font-size:17px">${esc(r.from)} to ${esc(r.to)} · ${r.symbols} symbols</h2>` + btTiles([['Trades', r.trades, `${Math.round(r.win * 100)}% won · ${btPct(r.avgRet, 2)} a trade`], ['Strategy return', btPct(r.total), `${btPct(r.cagr)} a year`, r.total >= 0 ? 'up' : 'down'], ['Worst drop', btPct(r.maxDD), `invested ${Math.round(r.exposure * 100)}% of the days`]])
    + btWarn(`<b>For comparison,</b> simply holding SPY returned <b>${r.spy == null ? '-' : btPct(r.spy, 0)}</b> over the same period. The bot never has more than ${swS.cfg.pct * swS.cfg.max}% of the account invested, so it risks far less than holding, and also earns less. Best trade ${btPct(r.best)}, worst ${btPct(r.worst)}. Past results do not predict future ones.`)
    + btRows(r.list.map(t => ({ tag: t.ret > 0 ? 'Won' : 'Lost', good: t.ret > 0, bad: t.ret <= 0, title: `<b>${esc(t.sym)}</b>`, sub: `${esc(t.from)} to ${esc(t.to)} · ${esc(t.why)}`, right: btPct(t.ret, 2) })));
}

/* ---------- chart: the rule drawn as an indicator (uptrend filter, 2-day RSI, the bounce average) ---------- */
async function swChart() {
  const sel = $('#swsel'); if (!sel) return; const L = swS.live, open = swS.trades.filter(t => t.status == 'open'), watch = (L && L.watch) || [];
  const syms = [...new Set([...open.map(t => t.sym), ...watch.filter(w => w.buy).map(w => w.sym), 'SPY', ...watch.map(w => w.sym)])]; if (!syms.length) syms.push('SPY');
  if (!swSym || !syms.includes(swSym)) swSym = syms[0];
  sel.innerHTML = syms.map(x => `<option ${x == swSym ? 'selected' : ''} value="${x}">${x}${open.some(t => t.sym == x) ? ' · open position' : watch.some(w => w.sym == x && w.buy) ? ' · buy signal' : ''}</option>`).join(''); sel.onchange = () => { swSym = sel.value; swCh = null; swChart(); };
  if (!swCh || swCh.sym != swSym) { try { swCh = await swapi('chart&sym=' + swSym); } catch (e) { $('#swcv').innerHTML = `<div class=empty style="padding:30px 0">Prices unavailable right now (${esc(e.message)})</div>`; return; } }
  if (!$('#swcv') || swCh.sym != swSym) return; const C = swCh, B = C.bars.map(b => ({ t: Date.parse(b.d + 'T12:00:00Z') / 1000, o: b.o, h: b.h, l: b.l, c: b.c })), n = B.length, R = C.rules;
  const idx = ts => bcIdx(B, ts / 1000), dist = B.map((b, i) => C.s200[i] ? (b.c / C.s200[i] - 1) * 100 : null), buyShade = C.buys.map(i => ({ i0: i, i1: i, color: 'rgba(48,209,88,.16)' }));
  const S = { bars: B, h: 320, yfmt: v => v.toFixed(2), last: B[n - 1].c, tf: t => new Date(t * 1000).toLocaleDateString([], { month: 'short', year: '2-digit' }), tfFull: t => new Date(t * 1000).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), fitOverlays: false,
    overlays: [{ name: R.trend + '-day average (uptrend filter)', pts: C.s200, color: '#ff9f0a', w: 1.8 }, { name: R.exitMA + '-day average (the bounce target)', pts: C.s5, color: '#64b5ff', w: 1.4 }], shade: buyShade, levels: [], marks: [], vlines: [],
    panes: [{ name: '2-day RSI: the rule buys below ' + R.rsi + ' (a sharp dip)', short: 'RSI(2)', h: 84, vals: C.r2, color: 'var(--text)', min: 0, max: 100, levels: [{ y: R.rsi, name: 'buy < ' + R.rsi, color: 'var(--up)' }, { y: 50, name: '50', color: 'var(--mut2)', dash: '2 4' }], fmt: v => v.toFixed(0), shade: [] },
      { name: 'Distance from the ' + R.trend + '-day average (the rule needs it above 0)', short: 'vs ' + R.trend + '-day average', h: 70, vals: dist, color: 'var(--text)', levels: [{ y: 0, name: '0', color: 'var(--up)' }], fmt: v => v.toFixed(0) + '%' }] };
  for (const i of C.buys) S.marks.push({ i, y: B[i].l, kind: 'up', color: 'var(--up)', tip: '<b class=up>Buy signal</b>: above the long average and RSI(2) under ' + R.rsi });
  for (const t of C.trades) { const i = idx(t.ts), e = t.entry; S.marks.push({ i, y: e, kind: 'dot', r: 6, color: 'var(--text)', name: 'bot bought', tip: `Bot bought at ${usd(e, 2)}` }); if (t.status == 'closed' && t.exitts) S.marks.push({ i: idx(t.exitts), y: t.exitp, kind: 'down', color: t.pnl > 0 ? 'var(--up)' : 'var(--down)', name: 'sold', tip: `Sold at ${usd(t.exitp, 2)} · ${esc(t.reason || '')}` });
    if (t.status == 'open') S.levels.push({ y: t.stop || e * (1 - R.stop), name: 'stop ' + usd(t.stop || e * (1 - R.stop), 2), color: 'var(--down)', i0: i, pin: true }); }
  const cur = C.buys.includes(n - 1), up = dist[n - 1] != null && dist[n - 1] > 0, r2 = C.r2[n - 1], tr = C.trades.find(t => t.status == 'open');
  $('#swinfo').innerHTML = `<b>${esc(C.sym)}</b> · last close ${usd(B[n - 1].c, 2)} · ${up ? '<span class=up>above</span>' : '<span class=down>below</span>'} its ${R.trend}-day average (${dist[n - 1] != null ? dist[n - 1].toFixed(1) + '%' : '-'}) · RSI(2) <b>${r2 != null ? r2.toFixed(0) : '-'}</b> · ${cur ? '<b class=up>buy signal today</b>' : r2 != null && up ? `needs RSI(2) under ${R.rsi} to buy` : up ? '' : 'no buy while it is below the long average'}${tr ? ` · <b>open position</b> bought at ${usd(tr.entry, 2)}, sells when the close is back above the ${R.exitMA}-day average` : ''}`;
  bcChart($('#swcv'), S);
  $('#swleg').innerHTML = bcLegend([['#ff9f0a', R.trend + '-day average'], ['#64b5ff', R.exitMA + '-day average'], ['rgba(48,209,88,.5)', 'green column: the days the rule would have bought', 'box'], ['var(--up)', 'buy signal', 'tri'], ['var(--text)', 'where the bot bought']]) + '<div class=mut style="font-size:12px;margin-top:6px">One year of daily candles (Yahoo Finance, adjusted). Buy = above the long average AND 2-day RSI under ' + R.rsi + '; sell = close back above the ' + R.exitMA + '-day average, after ' + (swS.rules ? swS.rules.maxDays : 10) + ' days, or at -' + R.stop * 100 + '%.</div>';
}
