// BTC Up or Down tab: live model for the current windows, the paper (or live) account, settings and every trade.
let btcT = null, btcS = null;
const btcStop = () => { clearInterval(btcT); btcT = null; typeof pmStop == 'function' && pmStop(); };
const bbapi = async (op, body) => {
  const r = await fetch('/api/btc' + (body ? '' : '?op=' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const cents = x => Number.isFinite(x) ? `${Math.round(x * 100)}¢` : '-';
const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

async function btcPage() {
  btcStop();
  if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', btcPage); await signedIn(me.user); } // a direct link may load before sign-in status
  app.innerHTML = sk(320);
  try { btcS = await bbapi('state'); } catch (e) { if (e.status === 401) return authView('login', '', btcPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  btcFeed(btcS.btclive, btcS.now); btcRender();
  let n = 0;
  btcT = setInterval(async () => {
    if (!$('#btcwin')) return btcStop();
    try { if (++n % 15 === 0) { btcS = await bbapi('state'); btcFeed(btcS.btclive, btcS.now); btcRender(); } else { const l = await bbapi('live'); btcS.btclive = l.live; btcS.now = l.now; btcFeed(l.live, l.now); btcWin(); btcPm(); } } catch (e) {}
  }, 1000);
}

// paper portfolio value: cash + every open trade marked at what it would sell for right now (updates every second)
function btcValue() {
  const el = $('#bpv'), s = btcS; if (!el || s.mode == 'live') return;
  const W = Object.fromEntries((s.btclive?.windows || []).map(w => [w.slug, w])); let open = 0, marked = 0;
  for (const t of s.trades) { if (t.status != 'open' || t.mode != 'paper') continue; const w = W[t.slug];
    const bid = w ? (t.side == 'up' ? 1 - w.downAsk : 1 - w.upAsk) : NaN; // selling Up gets the Up bid (= 1 - Down ask)
    open += t.qty * (Number.isFinite(bid) ? bid : t.price); if (Number.isFinite(bid)) marked++; }
  const v = s.paper.balance + open, r = (v - s.paper.start) / s.paper.start;
  el.textContent = usd(v, 2); $('#bpvs').innerHTML = `cash ${usd(s.paper.balance, 2)}${open ? ` · open trades ${usd(open, 2)}` : ''} · <span class="${ud(r)}">${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%</span> since ${usd(s.paper.start, 2)}`;
}
function btcWin() { // the live model, one card per window
  btcValue(); const el = $('#btcwin'), L = btcS.btclive; if (!el) return;
  if (!L || !L.windows) { el.innerHTML = `<div class="card pad mut">Waiting for the 24/7 runner to price the first window…</div>`; return; }
  const age = (Date.now() - L.t) / 1e3;
  el.innerHTML = L.windows.map(w => {
    const left = w.secs - age, up = w.S0 ? w.S - w.S0 : null, fav = w.fav == 'up' ? 'Up' : 'Down', pc = w.pLB != null ? Math.round(w.pLB * 100) + '%' : null;
    const verdict = !w.open ? 'Window not open' : !(w.S0 > 0) ? 'Measuring the start price…' : !L.cal ? 'Waiting for the history study (the runner builds it when it starts)' : left < 12 ? 'Closing' : w.pLB == null ? 'The lead is too small, or too early in the window, for a reliable number' : w.calZ < 2 ? `Waiting for a bigger lead: the bot needs the favourite at least 2 volatilities ahead (now ${w.calZ.toFixed(1)})` : !w.calm ? 'Skipping: the last few minutes are much wilder than the last hour' : !w.sane ? `Skipping: the market (${cents(w.favAsk)}) is far from our number, so our price or start is probably off` : w.edge * 100 >= 2 && w.favAsk <= .985 ? `<span class=up>Edge: buy ${fav} at ${cents(w.favAsk)} (we are 95% sure it wins at least ${pc} of the time)</span>` : `No edge: ${fav} costs ${cents(w.favAsk)}, our bound is ${pc}`;
    return `<div class="card pad"><div class="row sb"><h3>${w.tf == '15m' ? '15 minutes' : '1 hour'}</h3><span class="num mut">${mmss(left)} left</span></div>
      <div class="grid g2" style="margin-top:14px;gap:14px">
        <div class=stat><div class=k>Bitcoin vs start</div><div class="v num ${up == null ? '' : ud(up)}">${up == null ? '-' : `${up >= 0 ? '+' : '-'}$${Math.abs(up).toFixed(0)}`}</div><div class=s>now $${Math.round(w.S).toLocaleString()} · start ${w.S0 ? '$' + Math.round(w.S0).toLocaleString() : '…'}</div></div>
        <div class=stat><div class=k>${w.pLB != null ? `${fav} wins, at least` : 'Favourite wins'}</div><div class="v num">${pc || '-'}</div><div class=s>market: Up ${cents(w.upAsk)} · Down ${cents(w.downAsk)}${w.fair > 0 ? ` · textbook ${Math.round(w.fair * 100)}% Up` : ''}</div></div></div>
      <div class=mut style="font-size:13.5px;margin-top:12px">${verdict}</div></div>`;
  }).join('') + `<div class=mut style="grid-column:1/-1;font-size:12.5px">${L.feed == 'live' ? '<span class=up>●</span> Polymarket US prices: live feed' : `Polymarket US prices: refreshed every ~3s${L.feedErr ? ` (live feed unavailable: ${esc(L.feedErr)})` : ''}`} · checked ${Math.max(0, Math.round(age))}s ago${L.cal ? ` · calibrated on ${L.cal.days} days of history` : ''}</div>`;
}
function btBtHtml(r) {
  const pc = x => x == null ? '-' : (x * 100).toFixed(1) + '%', tfn = { '15m': '15-minute windows', '1h': '1-hour windows' };
  const lead = tf => { const w = r.wf[tf]; if (!w || !w.lead || !w.lead.length) return `<div class=mut style="font-size:13px;margin-top:8px">Not enough history in this period for ${tfn[tf]}. Pick a longer one.</div>`;
    return `<h2 style="font-size:16px;margin-top:18px">${tfn[tf]}, ${w.focus} minutes left</h2><div class=mut style="font-size:12.5px;margin:2px 0 6px">Calibrated on ${w.trainDays} days, then checked on the next ${w.testDays} days it had never seen (${w.testSamples.toLocaleString()} moments). "Lead" is how many volatilities the favourite is ahead of the start price.</div>
      <table class=tbl><thead><tr><th class=mut style="text-align:left;font-weight:500;font-size:12px">Lead</th><th class=mut style="font-weight:500;font-size:12px">Moments</th><th class=mut style="font-weight:500;font-size:12px">Textbook said</th><th class=mut style="font-weight:500;font-size:12px">Bot trusts (95% bound)</th><th class=mut style="font-weight:500;font-size:12px">Really won</th></tr></thead><tbody>${w.lead.map(l => `<tr><td>${l.from}${l.to > 50 ? '+' : ' to ' + l.to}</td><td class=num>${l.n}</td><td class=num>${pc(l.textbook)}</td><td class=num>${pc(l.table)}</td><td class="num ${l.win >= l.table ? 'up' : 'down'}" style="font-weight:600">${pc(l.win)}</td></tr>`).join('')}</tbody></table>
      <div class=mut style="font-size:12.5px;margin-top:8px">${w.rows.filter(x => x.n).map(x => `When the table said at least ${Math.round(x.thr * 100)}%: ${x.n.toLocaleString()} moments, really won ${pc(x.win)}`).join(' · ')}</div>`; };
  const rec = r.recorded, rows = rec.rules.filter(x => x.n);
  const recHtml = !rec.windows ? `<div class=mut style="font-size:13px;margin-top:6px">No quotes recorded for this period yet. The runner now records Polymarket US's price near the end of every window, so check back in a day or two: this section will then show what buying at the real asks would have earned.</div>`
    : `<div class=mut style="font-size:12.5px;margin:2px 0 6px">${rec.windows} finished window${rec.windows == 1 ? '' : 's'} recorded since ${rec.since ? new Date(rec.since).toLocaleDateString() : '-'}. For each level of caution, the first moment in each window that cleared the bar:</div>
      ${rows.length ? `<table class=tbl><thead><tr><th class=mut style="text-align:left;font-weight:500;font-size:12px">Needed edge</th><th class=mut style="font-weight:500;font-size:12px">Trades</th><th class=mut style="font-weight:500;font-size:12px">Won</th><th class=mut style="font-weight:500;font-size:12px">Paid on average</th><th class=mut style="font-weight:500;font-size:12px">Per contract</th></tr></thead><tbody>${rows.map(x => `<tr><td>${x.edge}¢ or more${x.edge == r.rules.minEdge ? ' <span class=mut>(the bot)</span>' : ''}</td><td class=num>${x.n}</td><td class=num>${pc(x.win)}</td><td class=num>${cents(x.cost)}</td><td class="num ${x.perContract >= 0 ? 'up' : 'down'}" style="font-weight:600">${x.perContract >= 0 ? '+' : ''}${(x.perContract * 100).toFixed(1)}¢</td></tr>`).join('')}</tbody></table>` : `<div class=mut style="font-size:13px">At no level of caution did the recorded asks ever leave an edge.</div>`}
      ${rec.lead.length ? `<div class=mut style="font-size:12.5px;margin-top:10px">How the market priced each lead (average ask of the favourite vs how often it won): ${rec.lead.map(l => `${l.from}${l.to > 50 ? '+' : '-' + l.to} vols: ${cents(l.ask)} vs ${pc(l.win)} (${l.n})`).join(' · ')}</div>` : ''}`;
  return `<h2 style="font-size:17px">Does the favourite hold?</h2><div class=mut style="font-size:12.5px;margin:4px 0 0">The strategy rests on one claim: when Bitcoin is far enough ahead of the start price with little time left, the side that is ahead almost always wins. This tests it on real minute-by-minute history (Bitstamp), with the error of our price feed added, last updated ${new Date(r.t).toLocaleString()}.</div>${lead('15m')}${lead('1h')}
    <h2 style="font-size:17px;margin-top:22px">What the market really offered</h2>${recHtml}
    ${btWarn(`<b>How to read this.</b> Tested on history, the textbook formula turned out to be about right, so a bad formula is probably not why the old bot lost. The likelier reason: it was buying small "edges" (a few cents, often near 50-50) that were smaller than the error of its own price feed, from a market that prices the same thing. The bot now trades only a favourite at least ${r.rules.minZ} volatilities ahead, when our 95% lower bound beats the ask by at least ${r.rules.minEdge}¢ after fees, never above ${+(r.rules.maxPrice * 100).toFixed(1)}¢, and skips it if the market is more than ${Math.round(r.rules.sanity * 100)} points away from our number. It will trade rarely. Nothing here proves a profit: only the recorded real quotes can, and they take days to build up.`)}`;
}

function btcRender() {
  const s = btcS, c = s.cfg, live = s.mode == 'live', acct = live ? s.live : s.paper, settled = acct.won + acct.lost;
    app.innerHTML = `<div class="ph fade"><div><h1>BTC Up or Down</h1><p class=lead>Trades Polymarket US's Bitcoin up-or-down windows. It doesn't guess where Bitcoin goes next: it works out the real chance of Up from how far Bitcoin has already moved and how little time is left, and buys only when the market sells that side for clearly less.</p></div></div>
    <div class="card pad"><div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${s.enabled ? 'on' : ''}" id=btog aria-label="BTC bot on/off"></button>
      <div><div style="font-size:22px;font-weight:650">${s.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">${live ? 'Live: real money on your Polymarket US account' : 'Paper account: simulated money, real prices and results'}</div></div></div>
      <div class=seg id=bmode><button data-v=paper class="${live ? '' : 'on'}">Paper</button><button data-v=live class="${live ? 'on' : ''}">Live</button></div></div>
      <div class="grid g3" style="margin-top:20px">
        ${live ? `<div class=stat><div class=k>Live profit</div><div class="v num ${ud(acct.pnl)}">${sg(acct.pnl, 2)}</div><div class=s>settled trades, after fees</div></div>`
          : `<div class=stat><div class=k>Portfolio value</div><div class="v num" id=bpv>${usd(s.paper.balance + s.paper.open, 2)}</div><div class=s id=bpvs>cash ${usd(s.paper.balance, 2)} · started with ${usd(s.paper.start, 2)}</div></div>`}
        <div class=stat><div class=k>Win rate</div><div class="v num">${settled ? Math.round(acct.won / settled * 100) + '%' : '-'}</div><div class=s>${acct.won} won · ${acct.lost} lost${acct.open ? ` · ${usd(acct.open, 2)} in open trades` : ''}</div></div>
        <div class=stat><div class=k>Profit</div><div class="v num ${ud(acct.pnl)}">${sg(acct.pnl, 2)}</div><div class=s>${acct.trades} trade${acct.trades == 1 ? '' : 's'}</div></div></div></div>
    ${btcPmHtml()}
    <div class="grid g2" id=btcwin style="margin-top:16px"></div>
    ${btCard('btbt', { opts: [[3, 'Last 3 days'], [7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days']], def: 14, note: 'Tests the strategy on real minute-by-minute Bitcoin history, calibrating on the first part and judging on the rest, then shows what the recorded Polymarket US quotes would have paid. Polymarket US keeps no price history, so the quotes are recorded by the runner from now on.' })}
    <div class="grid g2" style="margin-top:16px">
      <div class="card pad"><h2>Trade size</h2><p class=mut style="font-size:13px;margin:6px 0 12px">How much each trade uses: a share of your ${live ? 'Polymarket US cash' : 'paper balance'}, or a fixed amount.</p>
        <div class=row style="gap:10px;flex-wrap:wrap"><div class=seg id=bsize><button data-v=pct class="${c.size == 'pct' ? 'on' : ''}">% of balance</button><button data-v=usd class="${c.size == 'usd' ? 'on' : ''}">$ per trade</button></div>
          ${c.size == 'usd' ? `<label class=row style="gap:8px"><input class=inp type=number id=bsz min=1 max=10000 step=1 value=${c.usd} style="width:110px"><b>$</b></label>` : ''}</div>${c.size == 'pct' ? '<div id=bdial style="margin-top:10px"></div>' : ''}
        <div class=mut style="font-size:12.5px;margin-top:10px">${c.size == 'pct' && !live ? `≈ ${usd(s.paper.balance * c.pct / 100, 2)} per trade right now. ` : ''}Built in: buys only the favourite, only with a lead of at least 2 volatilities and when it is at least 2¢ cheaper than our 95% lower bound after fees (never above 98.5¢), in both 15-minute and 1-hour windows. It stops for the day after losing 20% of the account.</div></div>
      <div class="card pad"><h2>Paper account</h2><p class=mut style="font-size:13px;margin:6px 0 12px">Start over with a fresh simulated balance. Paper trades are cleared; live trades are kept.</p>
        <div class=row style="gap:8px"><input class=inp type=number id=bamt value=${Math.round(s.paper.start)} min=10 style="max-width:140px"><button class=btn id=breset>Reset paper account</button></div></div>
    </div>
    <div class=grid style="margin-top:16px">
      <div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Trades</h2></div><table class=tbl><tbody>${s.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'won' ? 'up' : t.status == 'lost' ? 'down' : 'n'}">${t.status == 'open' ? 'Open' : t.status == 'won' ? 'Won' : 'Lost'}</span></td>
        <td><div style="font-weight:550">Bought ${t.side == 'up' ? 'Up' : 'Down'} at ${cents(t.price)} × ${t.qty}${t.mode == 'paper' ? ' <span class=mut style="font-weight:400">· paper</span>' : ''}</div><div class=mut style="font-size:12.5px;margin-top:2px">${t.tf} window · model ${Math.round(t.fair * 100)}% · edge ${Math.round(t.edge * 100)}¢ · ${mmss(t.secs)} left · BTC ${t.s >= t.s0 ? '+' : '-'}$${Math.abs(t.s - t.s0).toFixed(0)}</div></td>
        <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? '…' : sg(t.pnl, 2)}</div><div class="mut" style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It only buys when the model finds a clear edge, so quiet stretches are normal.</td></tr>`}</tbody></table></div>
      <div class="card pad"><h3>How it decides</h3><p class=mut style="font-size:13px;line-height:1.6;margin:8px 0 0">On every price move (up to 4 times a second): Bitcoin's price (median of Coinbase, Kraken and Bitstamp, streamed live) versus the window's start price, its recent volatility and the time left say how many volatilities ahead the favourite is. Instead of the textbook formula, the bot looks that up in a table measured on real minute-by-minute history, with the error of our price feed built in and cut to a 95% lower bound (rebuilt every 6 hours). It buys at most once per window, only the favourite, only with a lead of at least 2 volatilities, only if that bound beats the ask by 2¢ after Polymarket US's fee, only if the market is within 20 points of our number, and only when the last 5 minutes are not much wilder than the last hour. It holds to the result, which settles on Polymarket US's own outcome.</p></div>
    </div>`;
  btWire('btbt', { run: async d => btBtHtml(await bbapi('bt', { days: +d })) });
  btcWin(); btcPmInit();
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } btcS = await bbapi('state').catch(() => btcS); btcRender(); };
  $('#btog').onclick = () => { if (!s.enabled && live && !confirm(`Start the BTC bot with REAL money?\n\n${c.size == 'pct' ? c.pct + '% of your cash' : '$' + c.usd} per trade; it stops for the day after losing 20%.`)) return; act(() => bbapi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'BTC bot paused' : 'BTC bot started'); };
  $$('#bmode button').forEach(b => b.onclick = () => { const m = b.dataset.v; if (m == s.mode) return; if (m == 'live' && !confirm('Switch to LIVE trading with real money on your Polymarket US account?\n\nThe bot pauses; turn it on again when ready.')) return; act(() => bbapi('mode', { mode: m }), m == 'live' ? 'Live mode. Turn the bot on when ready' : 'Paper mode'); });
  $$('#bsize button').forEach(b => b.onclick = () => b.dataset.v != c.size && act(() => bbapi('cfg', { cfg: { size: b.dataset.v } })));
  $('#bsz') && ($('#bsz').onchange = () => act(() => bbapi('cfg', { cfg: { usd: +$('#bsz').value } }), 'Saved'));
  dialMount('#bdial', { key: 'btc-pct', value: c.pct, min: .5, max: 50, step: .5, unit: '% per trade', size: 'sm', caption: v => !live ? `≈ ${usd(s.paper.balance * v / 100, 2)} per trade right now` : '', onCommit: v => act(() => bbapi('cfg', { cfg: { pct: v } }), 'Saved') });
  $('#breset').onclick = () => confirm('Reset the paper account? Paper trades will be cleared.') && act(() => bbapi('reset', { amount: +$('#bamt').value }), 'Paper account reset');
}
