// Home: four doors instead of a long menu (Trading terminal, Backtest, Bots, Indicators), and the hub page behind each one.
const HOME4 = [
  ['trade', 'wave', 'Trading terminal', 'Charts like TradingView: four layouts, drawing tools, every indicator, paper orders.', 'var(--h1c,#1546ff)'],
  ['backtests', 'flask', 'Backtest', 'Build a strategy from indicator rules and test it on real candles, or test any bot.', '#0a0a0c'],
  ['bots', 'bot', 'Bots', 'Every bot on one screen: balance, profit or loss, on or off. Build your own.', '#e5484d'],
  ['replay', 'arrow', 'Terminal replay', 'Go back to any day, play the market at your speed and trade it as if it were live.', '#8b5cf6'],
  ['brokers', 'scales', 'Brokers', 'Connect Alpaca, Schwab, Tradier, tastytrade, Coinbase, Kraken, OANDA and more.', '#12a150'],
  ['indicators', 'spark', 'Indicators', 'The full library, bot signals as indicators, Auto pick, and your own imports.', '#f08a24']];
const greet = () => { const h = new Date().getHours(); return h < 5 ? ['Good', 'night'] : h < 12 ? ['Good', 'morning'] : h < 18 ? ['Good', 'afternoon'] : ['Good', 'evening']; };
async function homePage() {
  const [a, b] = greet();
  app.innerHTML = `<div class="home"><div class=homeh><h1 class=hgreet>${a}<br><span>${b}</span></h1></div>
   <div class=home4>${HOME4.map(([k, i, t, d, c], n) => `<a class="h4 h4-${n}" href="#/${k}" style="--hc:${c}"><span class=h4i>${ic(i, 26)}</span><b>${t}</b><span class=h4d>${d}</span><span class=h4s id=h4s-${k}></span><span class=h4go>${ic('chev', 16)}</span></a>`).join('')}</div>
   <div class=homex><a href="#/brokers">Brokers</a><a href="#/overview">Polymarket copy trading</a><a href="#/leaderboard">Leaderboard</a><a href="#/feed">Whale feed</a><a href="#/settings">Settings</a><a href="#/help">Help</a></div></div>`;
  if (OWNER) try { const d = await dapi('dash'), on = d.bots.filter(x => x.enabled), bal = on.reduce((s, x) => s + (x.balance || 0), 0), pnl = on.reduce((s, x) => s + ((x.balance ?? 0) - (x.start ?? x.balance ?? 0)), 0);
    if ($('#h4s-bots')) $('#h4s-bots').innerHTML = `<b class=num>${on.length}</b> running · <span class="num ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}${usd(pnl, 0)}</span>`;
    const me = d.bots.find(x => x.route == 'trade'); if (me && $('#h4s-trade')) $('#h4s-trade').innerHTML = `Paper account <b class=num>${usd(me.balance, 0)}</b>`; } catch (e) {}
  if ($('#h4s-indicators')) $('#h4s-indicators').innerHTML = `<b class=num>${Object.values(INDS).filter(x => !x.bot && !x.custom).length}</b> built in · <b class=num>${(typeof LABS != "undefined" ? LABS : []).reduce((n, [, x]) => n + x.length, 0) + 7}</b> bots`;
  if ($('#h4s-backtests')) $('#h4s-backtests').innerHTML = 'Templates: EMA cross, RSI dip, Supertrend, Bollinger, MACD';
}
function backtestHub() {
  const old = [['powell', 'Powell Strategy'], ['supertrend', 'Supertrend Bot'], ['sweep', 'Sweep Bot'], ['gex', 'GEX Levels'], ['swing', 'Swing Trader'], ['btc', 'BTC Up or Down'], ['backtest', 'Profit Bot (Polymarket)']];
  app.innerHTML = `<div class=ph><div><h1>Backtest</h1><p class=lead>Test an idea on real history before any bot trades it.</p></div></div>
   <a class="card pad hubbig" href="#/build/new"><span class=h4i style="--hc:#1546ff">${ic('flask', 24)}</span><div><b>Build and backtest your own strategy</b><div class=mut>Pick indicator conditions (EMA cross, RSI below 30, price above Supertrend…), a stop and a target. See every trade on the chart. Then run it as a paper bot.</div></div>${ic('chev', 18)}</a>
   <h2 class=hubh>Backtest a built-in bot</h2>${(typeof LABS != "undefined" ? LABS : []).map(([g, x]) => `<div class=hubg><div class=hubgt>${esc(g)}</div><div class=hubchips>${x.map(([id, , n]) => `<a class=chip href="#/lab/${id}">${esc(n)}</a>`).join('')}</div></div>`).join('')}
   <div class=hubg><div class=hubgt>More bots</div><div class=hubchips>${old.map(([r, n]) => `<a class=chip href="#/${r}">${n}</a>`).join('')}</div></div>`;
}
async function botsHub() {
  await dashPage(); if (!$('#dbody')) return; const h = app.querySelector('.ph'); if (h) { h.querySelector('h1').textContent = 'Bots'; h.insertAdjacentHTML('beforeend', `<a class="btn pri" href="#/build/new" style="flex:none">+ Build your own</a>`); }
  app.insertAdjacentHTML('beforeend', `<h2 class=hubh>Open a bot</h2>${(typeof LABS != "undefined" ? LABS : []).map(([g, x]) => `<div class=hubg><div class=hubgt>${esc(g)}</div><div class=hubchips>${x.map(([id, , n]) => `<a class=chip href="#/lab/${id}">${esc(n)}</a>`).join('')}</div></div>`).join('')}
   <div class=hubg><div class=hubgt>Futures and stocks</div><div class=hubchips>${[['powell', 'Powell Strategy'], ['supertrend', 'Supertrend Bot'], ['sweep', 'Sweep Bot'], ['gex', 'GEX Levels'], ['swing', 'Swing Trader'], ['news', 'Newsflash']].map(([r, n]) => `<a class=chip href="#/${r}">${n}</a>`).join('')}</div></div>
   <div class=hubg><div class=hubgt>Crypto and prediction markets</div><div class=hubchips>${[['btc', 'BTC Up or Down'], ['meme', 'Meme Radar'], ['edge', 'Edge Lab'], ['bot', 'Auto Trader (copy trading)'], ['backtest', 'Profit Bot']].map(([r, n]) => `<a class=chip href="#/${r}">${n}</a>`).join('')}</div></div>`);
}
async function indicatorsPage(q = '') {
  trInit(); try { if (!Object.values(IND).some(x => x.bot)) await trBotReg(); trCustomReg(); } catch (e) {}
  const groups = {}; for (const [k, d] of Object.entries(IND)) { if (q && !(d.n + ' ' + d.d + ' ' + d.g).toLowerCase().includes(q.toLowerCase())) continue; (groups[d.g] || (groups[d.g] = [])).push([k, d]); }
  app.innerHTML = `<div class=ph><div><h1>Indicators</h1><p class=lead>Switch any of these on for the trading terminal. Bots can be indicators too: their own entries, exits and levels on your chart.</p></div><a class="btn pri" href="#/trade" style="flex:none">Open the terminal</a></div>
   <div class="card pad indtop"><div><b>Auto</b><div class=mut>In the terminal, press Auto: it reads the market (trending, ranging, squeeze or volatile) and picks the indicators that suit it.</div></div><div class=row style="gap:8px;flex-wrap:wrap"><button class=btn id=indimp>Import your own…</button><button class=btn id=indtpl>Template</button><input type=file id=indfile accept=".js,.txt" hidden></div></div>
   <input class=inp id=indq placeholder="Search ${Object.keys(IND).length} indicators" value="${esc(q)}" style="margin:16px 0">
   ${Object.entries(groups).map(([g, L]) => `<h2 class=hubh>${esc(g)} <span class=mut>${L.length}</span></h2><div class=indgrid>${L.map(([k, d]) => `<div class="card indc ${TR.ind.includes(k) ? 'on' : ''}" data-k="${k}"><div class=row style="justify-content:space-between;gap:10px"><b>${esc(d.n)}</b><button class="trsw sm ${TR.ind.includes(k) ? 'on' : ''}" aria-label="On the chart"><i></i></button></div><div class=mut>${esc(d.d || '')}</div></div>`).join('')}</div>`).join('') || '<div class=empty>Nothing matches.</div>'}`;
  const qi = $('#indq'); qi.oninput = () => { clearTimeout(qi._t); qi._t = setTimeout(() => { indicatorsPage(qi.value); const n = $('#indq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
  app.querySelectorAll('.indc').forEach(c => c.onclick = () => { const k = c.dataset.k, on = !TR.ind.includes(k); TR.ind = on ? [...TR.ind, k] : TR.ind.filter(x => x != k); LS.set('mt:ind2', TR.ind); c.classList.toggle('on', on); c.querySelector('.trsw').classList.toggle('on', on); toast(on ? `${IND[k].n} is on in the terminal` : `${IND[k].n} removed`); });
  $('#indimp').onclick = () => $('#indfile').click(); $('#indfile').onchange = async e => { const f = e.target.files[0]; if (f) { trCustomAdd(await f.text(), f.name); indicatorsPage(); } };
  $('#indtpl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([CUSTOM_TPL], { type: 'text/javascript' })); a.download = 'my-indicator.js'; a.click(); };
}
