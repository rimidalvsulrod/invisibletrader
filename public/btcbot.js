// BTC Up or Down tab: live model for the current windows, the paper (or live) account, settings and every trade.
let btcT = null, btcS = null;
const btcStop = () => { clearInterval(btcT); btcT = null; };
const bbapi = async (op, body) => {
  const r = await fetch('/api/btc' + (body ? '' : '?op=' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const cents = x => Number.isFinite(x) ? `${Math.round(x * 100)}¢` : '-';
const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

async function btcPage() {
  btcStop();
  if (!OWNER) return authView('login', '', btcPage);
  app.innerHTML = sk(320);
  try { btcS = await bbapi('state'); } catch (e) { if (e.status === 401) return authView('login', '', btcPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  btcRender();
  let n = 0;
  btcT = setInterval(async () => {
    if (!$('#btcwin')) return btcStop();
    try { if (++n % 8 === 0) { btcS = await bbapi('state'); btcRender(); } else { const l = await bbapi('live'); btcS.btclive = l.live; btcS.now = l.now; btcWin(); } } catch (e) {}
  }, 2000);
}

function btcWin() { // the live model, one card per window
  const el = $('#btcwin'), L = btcS.btclive; if (!el) return;
  if (!L || !L.windows) { el.innerHTML = `<div class="card pad mut">Waiting for the 24/7 runner to price the first window…</div>`; return; }
  const age = (Date.now() - L.t) / 1e3, tfs = btcS.cfg.tfs;
  el.innerHTML = L.windows.map(w => {
    const left = w.secs - age, up = w.S0 ? w.S - w.S0 : null, inPlay = left <= (w.tf == '15m' ? 900 : 3600) * .6 && left >= 20;
    const best = w.upEdge >= w.downEdge ? ['Up', w.upEdge, w.upAsk] : ['Down', w.downEdge, w.downAsk];
    const verdict = !w.open ? 'Window not open' : !(w.fair > 0) ? 'Measuring the start price…' : !inPlay ? (left > 20 ? `Waits until ${mmss((w.tf == '15m' ? 900 : 3600) * .6)} left` : 'Closing') : best[1] * 100 >= btcS.cfg.minEdge ? `<span class=up>Edge: buy ${best[0]} at ${cents(best[2])}</span>` : 'No edge right now';
    return `<div class="card pad ${tfs.includes(w.tf) ? '' : 'dim'}"><div class="row sb"><h3>${w.tf == '15m' ? '15 minutes' : '1 hour'}</h3><span class="num mut">${mmss(left)} left</span></div>
      <div class="grid g2" style="margin-top:14px;gap:14px">
        <div class=stat><div class=k>Bitcoin vs start</div><div class="v num ${up == null ? '' : ud(up)}">${up == null ? '-' : `${up >= 0 ? '+' : '-'}$${Math.abs(up).toFixed(0)}`}</div><div class=s>now $${Math.round(w.S).toLocaleString()} · start ${w.S0 ? '$' + Math.round(w.S0).toLocaleString() : '…'}</div></div>
        <div class=stat><div class=k>Chance of Up (model)</div><div class="v num">${w.fair > 0 ? Math.round(w.fair * 100) + '%' : '-'}</div><div class=s>market: Up ${cents(w.upAsk)} · Down ${cents(w.downAsk)}</div></div></div>
      <div class=mut style="font-size:13.5px;margin-top:12px">${verdict}</div></div>`;
  }).join('');
}

function btcRender() {
  const s = btcS, c = s.cfg, live = s.mode == 'live', acct = live ? s.live : s.paper, settled = acct.won + acct.lost;
  const roi = live ? null : (s.paper.balance + s.paper.open - s.paper.start) / s.paper.start;
  app.innerHTML = `<div class="ph fade"><div><h1>BTC Up or Down</h1><p class=lead>Trades Polymarket US's Bitcoin up-or-down windows. It doesn't guess where Bitcoin goes next: it works out the real chance of Up from how far Bitcoin has already moved and how little time is left, and buys only when the market sells that side for clearly less.</p></div></div>
    <div class="card pad"><div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${s.enabled ? 'on' : ''}" id=btog aria-label="BTC bot on/off"></button>
      <div><div style="font-size:22px;font-weight:650">${s.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">${live ? 'Live: real money on your Polymarket US account' : 'Paper account: simulated money, real prices and results'}</div></div></div>
      <div class=seg id=bmode><button data-v=paper class="${live ? '' : 'on'}">Paper</button><button data-v=live class="${live ? 'on' : ''}">Live</button></div></div>
      <div class="grid g3" style="margin-top:20px">
        ${live ? `<div class=stat><div class=k>Live profit</div><div class="v num ${ud(acct.pnl)}">${sg(acct.pnl, 2)}</div><div class=s>settled trades, after fees</div></div>`
          : `<div class=stat><div class=k>Paper balance</div><div class="v num">${usd(s.paper.balance + s.paper.open, 2)}</div><div class=s>started with ${usd(s.paper.start, 2)} · <span class="${ud(roi)}">${roi >= 0 ? '+' : ''}${(roi * 100).toFixed(1)}%</span></div></div>`}
        <div class=stat><div class=k>Win rate</div><div class="v num">${settled ? Math.round(acct.won / settled * 100) + '%' : '-'}</div><div class=s>${acct.won} won · ${acct.lost} lost${acct.open ? ` · ${usd(acct.open, 2)} in open trades` : ''}</div></div>
        <div class=stat><div class=k>Profit</div><div class="v num ${ud(acct.pnl)}">${sg(acct.pnl, 2)}</div><div class=s>${acct.trades} trade${acct.trades == 1 ? '' : 's'}</div></div></div></div>
    <div class="grid g2" id=btcwin style="margin-top:16px"></div>
    <div class=split style="margin-top:16px"><div class=grid>
      <div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Trades</h2></div><table class=tbl><tbody>${s.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'won' ? 'up' : t.status == 'lost' ? 'down' : 'n'}">${t.status == 'open' ? 'Open' : t.status == 'won' ? 'Won' : 'Lost'}</span></td>
        <td><div style="font-weight:550">Bought ${t.side == 'up' ? 'Up' : 'Down'} at ${cents(t.price)} × ${t.qty}${t.mode == 'paper' ? ' <span class=mut style="font-weight:400">· paper</span>' : ''}</div><div class=mut style="font-size:12.5px;margin-top:2px">${t.tf} window · model ${Math.round(t.fair * 100)}% · edge ${Math.round(t.edge * 100)}¢ · ${mmss(t.secs)} left · BTC ${t.s >= t.s0 ? '+' : '-'}$${Math.abs(t.s - t.s0).toFixed(0)}</div></td>
        <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? '…' : sg(t.pnl, 2)}</div><div class="mut" style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It only buys when the model finds a clear edge, so quiet stretches are normal.</td></tr>`}</tbody></table></div>
    </div><div class=grid>
      <div class="card pad"><h2>Settings</h2><div class="grid g2" style="margin-top:12px">
        <label><span class=lbl>$ per trade</span><input class=inp type=number min=1 step=1 data-c=usd value=${c.usd}></label>
        <label><span class=lbl>Minimum edge (¢, after fees)</span><input class=inp type=number min=1 max=50 data-c=minEdge value=${c.minEdge}></label>
        <label><span class=lbl>Stop for the day after losing ($)</span><input class=inp type=number min=1 data-c=maxLoss value=${c.maxLoss}></label>
        <div><span class=lbl>Windows</span><div class=row style="gap:8px;margin-top:6px">${['15m', '1h'].map(tf => `<button class="chip ${c.tfs.includes(tf) ? 'on' : ''}" data-tf=${tf}>${tf == '15m' ? '15 min' : '1 hour'}</button>`).join('')}</div></div></div></div>
      <div class="card pad"><h2>Paper account</h2><p class=mut style="font-size:13px;margin:6px 0 12px">Start over with a fresh simulated balance. Paper trades are cleared; live trades are kept.</p>
        <div class=row style="gap:8px"><input class=inp type=number id=bamt value=${Math.round(s.paper.start)} min=10 style="max-width:140px"><button class=btn id=breset>Reset paper account</button></div></div>
      <div class="card pad"><h3>How it decides</h3><p class=mut style="font-size:13px;line-height:1.6;margin:8px 0 0">Every 5 seconds: Bitcoin's price (median of Coinbase, Kraken and Bitstamp) versus the window's start price, its recent volatility and the time left give a chance of Up. It buys at most once per window, only in the last 60% of it, only if the side is at least your minimum edge cheaper than that chance after Polymarket US's fee, and holds to the result. Results settle on Polymarket US's own outcome.</p></div>
    </div></div>`;
  btcWin();
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } btcS = await bbapi('state').catch(() => btcS); btcRender(); };
  $('#btog').onclick = () => { if (!s.enabled && live && !confirm(`Start the BTC bot with REAL money?\n\nUp to $${c.usd} per trade, stops for the day after losing $${c.maxLoss}.`)) return; act(() => bbapi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'BTC bot paused' : 'BTC bot started'); };
  $$('#bmode button').forEach(b => b.onclick = () => { const m = b.dataset.v; if (m == s.mode) return; if (m == 'live' && !confirm('Switch to LIVE trading with real money on your Polymarket US account?\n\nThe bot pauses; turn it on again when ready.')) return; act(() => bbapi('mode', { mode: m }), m == 'live' ? 'Live mode. Turn the bot on when ready' : 'Paper mode'); });
  $$('[data-c]').forEach(i => i.onchange = () => act(() => bbapi('cfg', { cfg: { [i.dataset.c]: +i.value } }), 'Saved'));
  $$('[data-tf]').forEach(b => b.onclick = () => { const on = c.tfs.includes(b.dataset.tf), tfs = on ? c.tfs.filter(x => x != b.dataset.tf) : [...c.tfs, b.dataset.tf]; if (!tfs.length) return toast('Keep at least one window'); act(() => bbapi('cfg', { cfg: { tfs } })); });
  $('#breset').onclick = () => confirm('Reset the paper account? Paper trades will be cleared.') && act(() => bbapi('reset', { amount: +$('#bamt').value }), 'Paper account reset');
}
