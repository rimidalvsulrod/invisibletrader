// Meme Radar tab: paper-trades new meme coins at the start of a trend. Radar of what the scanner sees, paper account, positions, trades.
let memeT = null, memeS = null;
const memeStop = () => { clearInterval(memeT); memeT = null; };
const mapi = async (op, body) => {
  const r = await fetch('/api/meme' + (body ? '' : '?op=' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const mpx = p => !(p > 0) ? '-' : p >= 1 ? '$' + p.toFixed(2) : '$' + p.toPrecision(3);
const mk = x => x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? '$' + Math.round(x / 1e3) + 'k' : '$' + Math.round(x);
const mp = x => (x >= 0 ? '+' : '-') + Math.abs(x).toFixed(0) + '%';
const mdur = ms => { const m = Math.round(ms / 6e4); return m < 60 ? m + 'm' : (m / 60).toFixed(1) + 'h'; };

async function memePage() {
  memeStop();
  if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', memePage); await signedIn(me.user); }
  app.innerHTML = sk(320);
  try { memeS = await mapi('state'); } catch (e) { if (e.status === 401) return authView('login', '', memePage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  memeRender(); let n = 0;
  memeT = setInterval(async () => { if (!$('#mradar')) return memeStop(); try { if (++n % 3 === 0) { memeS = await mapi('state'); memeRender(); } else { memeS.live = (await mapi('live')).live; memeRadar(); } } catch (e) {} }, 3000);
}
function memeRadar() {
  const el = $('#mradar'), L = memeS.live; if (!el) return;
  if (!L) { el.innerHTML = `<div class=empty>Waiting for the 24/7 runner to scan the market…</div>`; return; }
  const age = Math.max(0, Math.round((Date.now() - L.scanned) / 1e3));
  el.innerHTML = `<div class=mut style="font-size:12.5px;padding:0 20px 10px">Scanned ${age}s ago · Solana + Base · new and trending pools${L.err ? ` · <span class=down>${esc(L.err)}</span>` : ''}</div>` +
    `<table class=tbl><tbody>${L.radar.slice(0, 12).map(x => `<tr><td style="width:1%"><span class="pill ${x.ok ? (x.streak >= 2 ? 'up' : 'ac') : 'n'} num">${x.score}</span></td>
      <td><div><b>${esc(x.sym)}</b> <span class=mut style="font-weight:400">${x.chain} · ${x.age}m old · liq ${mk(x.liq)} · cap ${mk(x.fdv)}</span></div>
      <div class=mut style="font-size:12.5px;margin-top:2px">${x.ok ? `<span class=up>${x.streak >= 2 ? 'Signal confirmed: buying' : 'Signal: confirming on the next scan'}</span> · ${esc(x.why.join(' · '))}` : esc(x.fails[0] || 'no signal')}</div></td>
      <td class=r><div class="num ${ud(x.pc.m15)}">${mp(x.pc.m15)}</div><div class=mut style="font-size:12px">15m</div></td></tr>`).join('') || '<tr><td class=empty>Nothing near a signal right now.</td></tr>'}</tbody></table>`;
}
function memeRender() {
  const s = memeS, c = s.cfg, A = s.paper, settled = A.won + A.lost, opens = s.trades.filter(t => t.status == 'open'), mark = opens.reduce((n, t) => n + (t.value ?? t.cost), 0), val = A.balance + mark, ret = (val - A.start) / A.start;
  const row = t => { const open = t.status == 'open', chg = open ? t.last / t.entry - 1 : t.exitp / t.entry - 1, pnl = open ? t.value - t.cost : t.pnl;
    return `<tr><td style="width:1%"><span class="pill ${open ? 'ac' : t.pnl > 0 ? 'up' : 'down'}">${open ? 'Open' : t.pnl > 0 ? 'Won' : 'Lost'}</span></td>
      <td><div style="font-weight:550">${esc(t.sym)} <span class=mut style="font-weight:400">· ${t.chain} · paper</span></div><div class=mut style="font-size:12.5px;margin-top:2px">bought ${usd(t.cost, 2)} at ${mpx(t.entry)} · ${open ? `now ${mpx(t.last)} (${mp(chg * 100)}) · peak ${mp((t.peak / t.entry - 1) * 100)} · held ${mdur(Date.now() - t.ts)}` : `${esc(t.reason || 'closed')} · held ${mdur(t.exitts - t.ts)}`}</div>${t.why ? `<div class=mut style="font-size:12px;margin-top:2px">${esc(t.why)}</div>` : ''}</td>
      <td class=r><div class="num ${ud(pnl)}" style="font-weight:600">${sg(pnl, 2)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`; };
  app.innerHTML = `<div class="ph fade"><div><h1>Meme Radar</h1><p class=lead>Scans brand-new meme coins on Solana and Base and buys the ones that are just starting to trend: volume speeding up, lots of different buyers, price rising but not yet blown off. Paper trading only: simulated money, real prices.</p></div></div>
    <div class="card pad"><div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${s.enabled ? 'on' : ''}" id=mtog aria-label="Meme Radar on/off"></button>
      <div><div style="font-size:22px;font-weight:650">${s.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">Paper account: simulated money, real prices</div></div></div></div>
      <div class="grid g3" style="margin-top:20px"><div class=stat><div class=k>Portfolio value</div><div class="v num">${usd(val, 2)}</div><div class=s>cash ${usd(A.balance, 2)}${opens.length ? ` · open ${usd(mark, 2)}` : ''} · <span class="${ud(ret)}">${ret >= 0 ? '+' : ''}${(ret * 100).toFixed(1)}%</span> since ${usd(A.start, 0)}</div></div>
        <div class=stat><div class=k>Win rate</div><div class="v num">${settled ? Math.round(A.won / settled * 100) + '%' : '-'}</div><div class=s>${A.won} won · ${A.lost} lost${opens.length ? ` · ${opens.length} open` : ''}</div></div>
        <div class=stat><div class=k>Closed profit</div><div class="v num ${ud(A.pnl)}">${sg(A.pnl, 2)}</div><div class=s>${A.trades} trade${A.trades == 1 ? '' : 's'}, after fees and slippage</div></div></div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card pad"><h2>Trade size</h2><p class=mut style="font-size:13px;margin:6px 0 12px">How much each buy uses: a share of your paper account, or a fixed amount.</p>
        <div class=row style="gap:10px;flex-wrap:wrap"><div class=seg id=msize><button data-v=pct class="${c.size == 'pct' ? 'on' : ''}">% of account</button><button data-v=usd class="${c.size == 'usd' ? 'on' : ''}">$ per trade</button></div>
          <label class=row style="gap:8px"><input class=inp type=number id=msz min=${c.size == 'pct' ? .5 : 1} max=${c.size == 'pct' ? 25 : 10000} step=${c.size == 'pct' ? .5 : 1} value=${c.size == 'pct' ? c.pct : c.usd} style="width:110px"><b>${c.size == 'pct' ? '%' : '$'}</b></label></div>
        <div class=mut style="font-size:12.5px;margin-top:10px">${c.size == 'pct' ? `≈ ${usd(val * c.pct / 100, 2)} per trade right now. ` : ''}Built in: at most 6 positions, never more than 1% of a pool's liquidity per buy, and it stops for the day after losing 15%.</div></div>
      <div class="card pad"><h2>Paper account</h2><p class=mut style="font-size:13px;margin:6px 0 12px">Start over with a fresh simulated balance. All paper trades are cleared.</p>
        <div class=row style="gap:8px"><input class=inp type=number id=mamt value=${Math.round(A.start)} min=10 style="max-width:140px"><button class=btn id=mreset>Reset paper account</button></div></div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:4px"><h2>Radar</h2></div><div id=mradar></div></div>
      <div class="card pad"><h3>How it decides</h3><p class=mut style="font-size:13px;line-height:1.6;margin:8px 0 0">Every 30 seconds it reads the newest and trending pools on Solana and Base. A coin must be 15 minutes to 12 hours old (the first minutes are mostly snipers), with $15k+ liquidity and a $25k-$8M market cap. Then it scores the trend: volume in the last 15 minutes running 1.5-2.5× or more above its hourly pace, buys outnumbering sells, many distinct buyers, price up 4-50% in 15 minutes but not already pumped. It needs a score of 6+ on two scans in a row, then checks the price again on a second source before buying.<br><br><b>Exits:</b> stop at -25%; a trailing stop once it is up 30% (20% below the peak) or 100% (15% below); sell if liquidity falls 40%, if it hasn't moved after 40 minutes, or after 4 hours. Fills include price impact from the pool's size plus a 1% fee both ways, and a pulled-liquidity exit sells into the crash.<br><br><span class=mut>Paper results flatter real meme trading: real buys race bots, can fail, and some coins can't be sold at all. Treat this as a way to test the idea.</span></p></div></div>
    <div class=grid style="margin-top:16px"><div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Positions and trades</h2></div><table class=tbl><tbody>${s.trades.map(row).join('') || `<tr><td class=empty>No trades yet. It only buys confirmed early trends, so quiet stretches are normal.</td></tr>`}</tbody></table></div></div>`;
  memeRadar();
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } memeS = await mapi('state').catch(() => memeS); memeRender(); };
  $('#mtog').onclick = () => act(() => mapi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'Meme Radar paused' : 'Meme Radar started');
  $$('#msize button').forEach(b => b.onclick = () => b.dataset.v != c.size && act(() => mapi('cfg', { cfg: { size: b.dataset.v } })));
  $('#msz').onchange = () => act(() => mapi('cfg', { cfg: { [c.size]: +$('#msz').value } }), 'Saved');
  $('#mreset').onclick = () => confirm('Reset the paper account? All paper trades will be cleared.') && act(() => mapi('reset', { amount: +$('#mamt').value }), 'Paper account reset');
}
