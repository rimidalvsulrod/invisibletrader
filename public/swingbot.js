// Swing Trader tab: on/off, size, what it is watching, positions and trades. Uses the Alpaca account connected in Newsflash.
let swT = null, swS = null;
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
        <div class=row style="gap:14px;flex-wrap:wrap"><label class=row style="gap:8px"><input class=inp type=number id=swpct value=${c.pct} min=1 max=20 step=1 style="width:84px"><b>% each</b></label><label class=row style="gap:8px"><input class=inp type=number id=swmax value=${c.max} min=1 max=10 step=1 style="width:84px"><b>positions</b></label></div>
        <div class=mut style="font-size:12.5px;margin-top:10px">At most ${c.pct * c.max}% of your account is invested at once. It never touches stocks you already own, and only sells shares it bought itself.</div></div>
      <div class="card pad"><h2>The rules</h2><div class=mut style="font-size:13px;line-height:1.6;margin-top:6px">Watches ${R.universe} large, liquid stocks and ETFs. <b>Buys</b> when one closes above its ${R.trend}-day average (uptrend) but its 2-day RSI is under ${R.rsi} (a sharp dip). <b>Sells</b> when it closes back above its ${R.exitMA}-day average, after ${R.maxDays} trading days, or at -${R.stop}%. Skips new buys for the day if your account is down 3%.</div>
        <div class=note style="margin-top:12px;font-size:12.5px;line-height:1.55">Honest expectations: in a test on 2003 to 2026 prices, about 2 in 3 trades won and the average gain was small (about +0.15% per trade after costs), which works out to roughly 1 to 5% a year at these sizes. It lost less than the market in crashes but earned much less than just holding in good years. It is a low-risk, low-return strategy, not a way to get rich fast.</div></div></div>
    <div class="card" style="margin-top:16px;overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Watching</h2><div class=mut style="font-size:12.5px;margin-top:4px" id=swwatch>${!L ? 'Waiting for the 24/7 runner to load prices…' : `${L.uptrend} of ${L.n} are in an uptrend · ${L.buys} buy signal${L.buys == 1 ? '' : 's'} · prices as of ${esc(L.asof || '?')} close`}</div></div>
      ${L && L.watch.length ? `<table class=tbl><tbody>${L.watch.map(w => `<tr><td style="width:1%"><span class="pill ${w.buy ? 'up' : 'n'}">${w.buy ? 'Buy signal' : 'Watching'}</span></td><td><b>${esc(w.sym)}</b> <span class=mut>${usd(w.c, 2)}</span></td><td class="r num mut">RSI(2) ${w.r2}</td></tr>`).join('')}</tbody></table>` : ''}</div>
    <div class="card" style="margin-top:16px;overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Trades</h2></div><table class=tbl><tbody>${s.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.pnl > 0 ? 'up' : t.pnl < 0 ? 'down' : 'n'}">${t.status == 'open' ? 'Open' : t.pnl > 0 ? 'Won' : t.pnl < 0 ? 'Lost' : 'Closed'}</span></td>
      <td><div><b>${esc(t.sym)}</b> · bought ${usd(t.notional || t.qty * t.entry, 2)} at ${usd(t.entry, 2)}${t.exitp ? ` · sold at ${usd(t.exitp, 2)}` : t.last ? ` · now ${usd(t.last, 2)}` : ''}</div><div class=mut style="font-size:12.5px;margin-top:2px">${esc(t.why || '')}${t.reason ? ` · ${esc(t.reason)}` : t.stop ? ` · stop ${usd(t.stop, 2)}` : ''}</div></td>
      <td class=r><div class="num ${t.pnl == null ? (t.last ? ud(t.last - t.entry) : 'mut') : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? (t.last ? sg((t.last - t.entry) * t.qty, 2) : '') : sg(t.pnl, 2)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It decides once a day, 10 minutes after the market opens, and only buys when a stock dips sharply in an uptrend.</td></tr>`}</tbody></table></div>`;
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } swS = await swapi('state').catch(() => swS); swRender(); };
  $('#swtog').onclick = () => { if (!s.enabled && !s.paper && !confirm('Start the Swing Trader with REAL money on your Alpaca account?')) return; act(() => swapi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'Swing Trader paused' : 'Swing Trader started'); };
  $('#swpct').onchange = () => act(() => swapi('cfg', { cfg: { pct: +$('#swpct').value } }), 'Saved');
  $('#swmax').onchange = () => act(() => swapi('cfg', { cfg: { max: +$('#swmax').value } }), 'Saved');
}
