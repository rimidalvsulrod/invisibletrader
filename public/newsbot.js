// Newsflash tab: connect Alpaca, on/off, trade size, live scored headlines, trades.
let newsT = null, newsS = null;
const newsStop = () => { clearInterval(newsT); newsT = null; };
const napi = async (op, body, url = '/api/news') => {
  const r = await fetch(url + (body ? '' : '?op=' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
async function newsPage() {
  newsStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', newsPage); await signedIn(me.user); } // a direct link may load before sign-in status
  app.innerHTML = sk(320);
  try { newsS = await napi('state'); } catch (e) { if (e.status === 401) return authView('login', '', newsPage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  newsRender(); let n = 0;
  newsT = setInterval(async () => { if (!$('#nfeed')) return newsStop(); try { if (++n % 10 === 0) { newsS = await napi('state'); newsRender(); } else { newsS.live = (await napi('live')).live; newsFeed(); } } catch (e) {} }, 2000);
}
function newsFeed() {
  const el = $('#nfeed'), L = newsS.live; if (!el) return;
  if (!L) { el.innerHTML = `<div class="empty">Waiting for the 24/7 runner to open the news feed${newsS.connected ? '' : ' (connect Alpaca first)'}…</div>`; return; }
  el.innerHTML = `<div class=mut style="font-size:12.5px;padding:0 20px 10px">${L.feed == 'stream' ? '<span class=up>●</span> Live Benzinga stream' : `Polling every 5s${L.err ? ` (live stream unavailable: ${esc(L.err)})` : ''}`}</div>` +
    (L.news.length ? `<table class=tbl><tbody>${L.news.map(x => `<tr><td style="width:1%"><span class="pill ${x.score >= 3 ? 'up' : x.score <= -3 ? 'down' : 'n'} num">${x.score > 0 ? '+' : ''}${x.score}</span></td><td><div>${x.syms.length ? `<b>${esc(x.syms.join(', '))}</b> · ` : ''}${esc(x.headline)}</div><div class=mut style="font-size:12px">${rel(x.t / 1000)}${Math.abs(x.score) >= 3 ? (x.score > 0 ? ' · strong positive: buys if the rules allow' : ' · strong negative: sells if held') : ''}</div></td></tr>`).join('')}</tbody></table>` : '<div class=empty>No headlines yet.</div>');
}
function newsRender() {
  const s = newsS, c = s.cfg, A = s.account, st = s.stats, settled = st.won + st.lost;
  const connect = s.connected ? `<div class="card pad"><div class="row sb"><h3>Alpaca</h3><span class="pill ${s.paper ? 'n' : 'down'}">${s.paper ? 'Paper' : 'Real money'}</span></div><div class=mut style="font-size:13px;margin-top:8px">Connected · key <span class=num>${esc(s.key)}</span></div><button class="btn sm danger" id=nkdel style="margin-top:12px">Disconnect</button></div>`
    : `<div class="card pad"><h2>Connect Alpaca</h2><p class=mut style="font-size:13px;line-height:1.55;margin:6px 0 12px">Create API keys at alpaca.markets (Paper Trading keys are free and use fake money). Paste them here; they're checked with Alpaca and stored encrypted.</p>
      <div class=seg id=npaper style="margin-bottom:10px"><button data-v=1 class=on>Paper keys</button><button data-v=0>Live keys</button></div>
      <input class=inp id=nkey placeholder="API Key ID"><input class=inp id=nsec type=password placeholder="Secret Key" style="margin-top:8px">
      <button class="btn pri" id=nksave style="width:100%;margin-top:10px">${s.emailCodes ? 'Email me a code to connect' : 'Connect'}</button>
      <div id=nkc hidden style="margin-top:8px"><input class=inp id=nkcode inputmode=numeric placeholder="${s.emailCodes ? '6-digit code from your email' : 'Your Mimic password'}" ${s.emailCodes ? '' : 'type=password'}><button class="btn pri" id=nkgo style="width:100%;margin-top:8px">Connect</button></div><div id=nkerr class=down style="font-size:13px;margin-top:8px"></div></div>`;
  app.innerHTML = `<div class="ph fade"><div><h1>Newsflash</h1><p class=lead>Trades stock headlines on your Alpaca account. Real-time Benzinga news is scored the moment it lands: strong good news about one company buys it, strong bad news sells it, and every trade exits on its own.</p></div></div>
    <div class="card pad"><div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${s.enabled ? 'on' : ''}" id=ntog aria-label="Newsflash on/off" ${s.connected ? '' : 'disabled'}></button>
      <div><div style="font-size:22px;font-weight:650">${s.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">${!s.connected ? 'Connect Alpaca to start' : s.paper ? 'Alpaca paper account: fake money, real market' : 'Alpaca LIVE account: real money'}</div></div></div></div>
      ${s.accountError ? `<div class=note style="margin-top:14px">${esc(s.accountError)}</div>` : ''}
      <div class="grid g3" style="margin-top:20px"><div class=stat><div class=k>Account value</div><div class="v num">${A ? usd(A.equity, 2) : '-'}</div><div class=s>${A ? `today <span class="${ud(A.day)}">${sg(A.day, 2)}</span> · cash ${usd(A.cash, 2)}` : 'on Alpaca'}</div></div>
        <div class=stat><div class=k>Bot win rate</div><div class="v num">${settled ? Math.round(st.won / settled * 100) + '%' : '-'}</div><div class=s>${st.won} won · ${st.lost} lost</div></div>
        <div class=stat><div class=k>Bot profit</div><div class="v num ${ud(st.pnl)}">${sg(st.pnl, 2)}</div><div class=s>${st.n} closed trade${st.n == 1 ? '' : 's'}</div></div></div></div>
    <div class="grid g2" style="margin-top:16px">${connect}
      <div class="card pad"><h2>Trade size</h2><p class=mut style="font-size:13px;margin:6px 0 12px">How much each trade uses: a share of your account value, or a fixed amount.</p>
        <div class=row style="gap:10px;flex-wrap:wrap"><div class=seg id=nsize><button data-v=pct class="${c.size == 'pct' ? 'on' : ''}">% of account</button><button data-v=usd class="${c.size == 'usd' ? 'on' : ''}">$ per trade</button></div>
          <label class=row style="gap:8px"><input class=inp type=number id=nsz value=${c.size == 'pct' ? c.pct : c.usd} style="width:110px"><b>${c.size == 'pct' ? '%' : '$'}</b></label></div>
        <div class=mut style="font-size:12.5px;margin-top:10px">Built in: only strong headlines about 1 to 3 companies, under 90 seconds old, during market hours. Exits at +3%, -1.5% or after 30 minutes, and everything is sold 5 minutes before the close. At most 5 positions, one trade per stock per day, and it stops for the day if the account is down 3%.</div></div></div>
    <div class=grid style="margin-top:16px">
      <div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Trades</h2></div><table class=tbl><tbody>${s.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.status == 'skip' ? 'n' : t.pnl > 0 ? 'up' : 'down'}">${t.status == 'open' ? 'Open' : t.status == 'skip' ? 'Skipped' : t.pnl > 0 ? 'Won' : 'Lost'}</span></td>
        <td><div><b>${esc(t.sym)}</b> · ${esc(t.headline || '')}</div><div class=mut style="font-size:12.5px;margin-top:2px">score ${t.score > 0 ? '+' : ''}${t.score}${t.entry ? ` · bought ${usd(t.notional || t.qty * t.entry, 2)} at ${usd(t.entry, 2)}` : ''}${t.exitp ? ` · sold at ${usd(t.exitp, 2)}` : ''}${t.reason ? ` · ${esc(t.reason)}` : ''}</div></td>
        <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? (t.status == 'open' ? '…' : '') : sg(t.pnl, 2)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It only acts on strong, fresh headlines during market hours.</td></tr>`}</tbody></table></div>
      <div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:4px"><h2>Live headlines</h2></div><div id=nfeed></div></div></div>`;
  newsFeed();
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } newsS = await napi('state').catch(() => newsS); newsRender(); };
  $('#ntog').onclick = () => { if (!s.enabled && !s.paper && !confirm('Start Newsflash with REAL money on your Alpaca account?')) return; act(() => napi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'Newsflash paused' : 'Newsflash started'); };
  $$('#nsize button').forEach(b => b.onclick = () => b.dataset.v != c.size && act(() => napi('cfg', { cfg: { size: b.dataset.v } })));
  $('#nsz').onchange = () => act(() => napi('cfg', { cfg: { [c.size]: +$('#nsz').value } }), 'Saved');
  let paper = true; $$('#npaper button').forEach(b => b.onclick = () => { paper = b.dataset.v == '1'; $$('#npaper button').forEach(x => x.classList.toggle('on', x === b)); });
  const proof = v => s.emailCodes ? { code: v } : { password: v };
  $('#nksave') && ($('#nksave').onclick = async () => {
    $('#nkerr').textContent = ''; if (!$('#nkey').value.trim() || !$('#nsec').value.trim()) return $('#nkerr').textContent = 'Paste both keys first';
    if (s.emailCodes) try { await napi('code', { purpose: 'keys' }, '/api/auth'); toast(`Code sent to ${esc(USER.email)}`); } catch (e) { return $('#nkerr').textContent = e.message; }
    $('#nksave').hidden = true; $('#nkc').hidden = false; $('#nkcode').focus();
  });
  $('#nkgo') && ($('#nkgo').onclick = async () => { $('#nkgo').disabled = true; $('#nkerr').textContent = '';
    try { const r = await napi('keys', { key: $('#nkey').value, secret: $('#nsec').value, paper, ...proof($('#nkcode').value.trim()) }); toast(`Alpaca ${r.paper ? 'paper' : 'LIVE'} account connected · ${usd(r.equity, 2)}`); newsS = await napi('state'); newsRender(); }
    catch (e) { $('#nkerr').textContent = e.message; $('#nkgo').disabled = false; } });
  $('#nkdel') && ($('#nkdel').onclick = async () => { if (!confirm('Disconnect Alpaca? Newsflash stops. Open positions stay in your Alpaca account.')) return;
    if (s.emailCodes) try { await napi('code', { purpose: 'keys' }, '/api/auth'); } catch (e) { return toast(`<span class=down>${esc(e.message)}</span>`); }
    const v = prompt(s.emailCodes ? `Enter the 6-digit code we emailed to ${USER.email}` : 'Enter your Mimic password'); if (v) act(() => napi('keysdel', proof(v.trim())), 'Alpaca disconnected'); });
}
