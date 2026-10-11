// Newsflash tab: connect Alpaca, on/off, trade size, live scored headlines, trades.
let newsT = null, newsS = null, nwSym = null, nwCh = null, nwN = 0;
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
  newsT = setInterval(async () => { if (!$('#nfeed')) return newsStop(); if (++nwN % 10 === 0) { nwCh = null; nwChart(); } try { if (++n % 10 === 0) { newsS = await napi('state'); newsRender(); } else { newsS.live = (await napi('live')).live; newsFeed(); } } catch (e) {} }, 2000);
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
      <input class=inp id=nkey name=alpaca-key-id placeholder="API Key ID (starts with PK or AK)" autocomplete=off autocapitalize=off spellcheck=false data-lpignore=true data-1p-ignore>
      <input class=inp id=nsec name=alpaca-secret placeholder="Secret Key" autocomplete=off autocapitalize=off spellcheck=false data-lpignore=true data-1p-ignore style="margin-top:8px;-webkit-text-security:disc">
      <button class="btn pri" id=nkgo style="width:100%;margin-top:10px">Connect</button>
      <div id=nkerr class=down style="font-size:13px;margin-top:8px"></div></div>`;
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
          ${c.size == 'usd' ? `<label class=row style="gap:8px"><input class=inp type=number id=nsz value=${c.usd} style="width:110px"><b>$</b></label>` : ''}</div>${c.size == 'pct' ? '<div id=ndial style="margin-top:10px"></div>' : ''}
        <div class=mut style="font-size:12.5px;margin-top:10px">Built in: only strong headlines about 1 to 3 companies, under 3 minutes old, during market hours. Exits at +3%, -1.5% or after 30 minutes, and everything is sold 5 minutes before the close. Up to 12 positions and 40% of the account open at once, up to 3 trades per stock per day, and it rests for the day if its own trades lose 3% of the account. A slow connection or a rate limit is retried, not skipped: a skip now means the market was closed, the stock could not be traded, or one of those limits was reached, and the reason is always shown.</div></div></div>
    <div class="card pad" style="margin-top:16px"><div class="row sb wrapf" style="gap:12px"><h2>Chart</h2><div class=bcsel><select class=inp id=nwsel style="width:auto"></select></div></div>
      <div class=mut style="font-size:13px;margin-top:8px;line-height:1.55" id=nwinfo></div><div id=nwcv style="margin-top:10px"></div><div id=nwleg></div></div>
    ${bcProfitCard('nwpc')}
    ${btCard('nwbt', { opts: [[3, 'Last 3 days'], [7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days'], [90, 'Last 90 days']], def: 30, note: 'Newsflash trades headlines in the first seconds after they appear, and free sources do not keep that timing, so it cannot be replayed honestly. This shows the recorded results of its own trades over the period you pick (the last 100 trades are loaded).' })}
    <div class=grid style="margin-top:16px">
      <div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Trades</h2></div><table class=tbl><tbody>${s.trades.map(t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.status == 'skip' ? 'n' : t.pnl > 0 ? 'up' : 'down'}">${t.status == 'open' ? 'Open' : t.status == 'skip' ? 'Skipped' : t.pnl > 0 ? 'Won' : 'Lost'}</span></td>
        <td><div><b>${esc(t.sym)}</b> · ${esc(t.headline || '')}</div><div class=mut style="font-size:12.5px;margin-top:2px">score ${t.score > 0 ? '+' : ''}${t.score}${t.entry ? ` · bought ${usd(t.notional || t.qty * t.entry, 2)} at ${usd(t.entry, 2)}` : ''}${t.exitp ? ` · sold at ${usd(t.exitp, 2)}` : ''}${t.reason ? ` · ${esc(t.reason)}` : ''}</div></td>
        <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? (t.status == 'open' ? '…' : '') : sg(t.pnl, 2)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`).join('') || `<tr><td class=empty>No trades yet. It only acts on strong, fresh headlines during market hours.</td></tr>`}</tbody></table></div>
      <div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:4px"><h2>Live headlines</h2></div><div id=nfeed></div></div></div>`;
  nwChart(); bcProfitDraw('nwpc', s.trades.filter(t => t.status == 'closed'), { label: t => t.sym });
  btWire('nwbt', { run: async n => btForwardHtml(newsS.trades, +n) });
  newsFeed();
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } newsS = await napi('state').catch(() => newsS); newsRender(); };
  $('#ntog').onclick = () => { if (!s.enabled && !s.paper && !confirm('Start Newsflash with REAL money on your Alpaca account?')) return; act(() => napi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'Newsflash paused' : 'Newsflash started'); };
  $$('#nsize button').forEach(b => b.onclick = () => b.dataset.v != c.size && act(() => napi('cfg', { cfg: { size: b.dataset.v } })));
  $('#nsz') && ($('#nsz').onchange = () => act(() => napi('cfg', { cfg: { usd: +$('#nsz').value } }), 'Saved'));
  dialMount('#ndial', { key: 'news-pct', value: c.pct, min: .5, max: 25, step: .5, unit: '% per trade', size: 'sm', caption: v => A ? `≈ ${usd(A.equity * v / 100, 2)} per trade right now` : '', onCommit: v => act(() => napi('cfg', { cfg: { pct: v } }), 'Saved') });
  let paper = true; $$('#npaper button').forEach(b => b.onclick = () => { paper = b.dataset.v == '1'; $$('#npaper button').forEach(x => x.classList.toggle('on', x === b)); });
  const proof = v => s.emailCodes ? { code: v } : { password: v };
  $('#nkgo') && ($('#nkgo').onclick = async () => { $('#nkgo').disabled = true; $('#nkerr').textContent = '';
    if (!$('#nkey').value.trim() || !$('#nsec').value.trim()) { $('#nkerr').textContent = 'Paste both keys first'; $('#nkgo').disabled = false; return; }
    try { const r = await napi('keys', { key: $('#nkey').value, secret: $('#nsec').value, paper }); toast(`Alpaca ${r.paper ? 'paper' : 'LIVE'} account connected · ${usd(r.equity, 2)}`); newsS = await napi('state'); newsRender(); }
    catch (e) { $('#nkerr').textContent = e.message; $('#nkgo').disabled = false; } });
  $('#nkdel') && ($('#nkdel').onclick = async () => { if (!confirm('Disconnect Alpaca? Newsflash stops. Open positions stay in your Alpaca account.')) return;
    if (s.emailCodes) try { await napi('code', { purpose: 'keys' }, '/api/auth'); } catch (e) { return toast(`<span class=down>${esc(e.message)}</span>`); }
    const v = prompt(s.emailCodes ? `Enter the 6-digit code we emailed to ${USER.email}` : 'Enter your Mimic password'); if (v) act(() => napi('keysdel', proof(v.trim())), 'Alpaca disconnected'); });
}

/* ---------- chart: the stock's minute candles with the headline, the bot's entry and exits, and the score drawn as an indicator ---------- */
const nwET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
const nwMin = t => { const p = nwET.formatToParts(new Date(t * 1000)); return +p[0].value % 24 * 60 + +p[2].value; };
async function nwChart() {
  const sel = $('#nwsel'); if (!sel) return; const tr = newsS.trades.filter(t => t.status != 'skip'), feed = ((newsS.live && newsS.live.news) || []).filter(x => Math.abs(x.score) >= 3 && x.syms.length);
  const syms = [...new Set([...tr.map(t => t.sym), ...feed.map(x => x.syms[0])])].slice(0, 14);
  if (!syms.length) { sel.innerHTML = ''; $('#nwcv').innerHTML = '<div class=empty style="padding:30px 0">Nothing to chart yet. Once the bot trades a headline, or a strong headline appears in the live feed, its stock shows here with the entry, the exits and the news.</div>'; $('#nwinfo').textContent = ''; $('#nwleg').innerHTML = ''; return; }
  if (!nwSym || !syms.includes(nwSym)) nwSym = syms[0]; sel.innerHTML = syms.map(x => `<option value="${x}" ${x == nwSym ? 'selected' : ''}>${x}${tr.some(t => t.sym == x && t.status == 'open') ? ' · open position' : tr.some(t => t.sym == x) ? ' · traded' : ' · strong headline'}</option>`).join(''); sel.onchange = () => { nwSym = sel.value; nwCh = null; nwChart(); };
  if (!nwCh || nwCh.sym != nwSym) { try { nwCh = await napi('chart&sym=' + nwSym); } catch (e) { $('#nwcv').innerHTML = `<div class=empty style="padding:30px 0">Prices unavailable right now (${esc(e.message)})</div>`; return; } }
  if (!$('#nwcv') || nwCh.sym != nwSym) return; const C = nwCh, my = C.trades, last = my.length ? my[my.length - 1] : null, focus = last ? last.ts / 1000 : C.news.length ? C.news[C.news.length - 1].t / 1000 : C.bars[C.bars.length - 1].t;
  // window: from an hour before the first thing that happened that day to the end of the data
  const day0 = Math.min(focus - 3600, ...C.news.filter(x => x.t / 1000 > focus - 6 * 3600).map(x => x.t / 1000 - 1800)), all = C.bars.filter(b => b.t >= day0 - 600 && b.t <= focus + 4 * 3600); const B = all.length >= 20 ? all : C.bars.slice(-240), n = B.length;
  const rth = B.map(b => { const m = nwMin(b.t); return m >= 570 && m < 960; }), shade = []; for (let i = 0; i < n; i++) if (!rth[i]) { let j = i; while (j + 1 < n && !rth[j + 1]) j++; shade.push({ i0: i, i1: j, color: 'rgba(127,127,127,.10)' }); i = j; }
  const R = C.rules, scores = new Array(n).fill(null), cols = new Array(n).fill(null), S = { bars: B, h: 330, shade, yfmt: v => v.toFixed(2), last: B[n - 1].c, levels: [], marks: [], vlines: [], overlays: [],
    tf: t => new Date(t * 1000).toLocaleTimeString([], { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }), tfFull: t => new Date(t * 1000).toLocaleString([], { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' ET' };
  for (const x of C.news) { if (x.t / 1000 < B[0].t - 300 || x.t / 1000 > B[n - 1].t + 300) continue; const i = bcIdx(B, x.t / 1000); scores[i] = (scores[i] || 0) + x.score; cols[i] = scores[i] > 0 ? 'var(--up)' : 'var(--down)';
    S.vlines.push({ i, name: (x.score > 0 ? '+' : '') + x.score, color: x.score > 0 ? 'var(--up)' : 'var(--down)', dash: '2 3', tip: '<b>' + esc(x.headline).slice(0, 90) + '</b>', row: S.vlines.length % 3 }); }
  for (const t of my) { if (t.status == 'skip') continue; const i = bcIdx(B, t.ts / 1000), e = t.entry || B[i].c, end = t.status == 'closed' && t.exitts ? bcIdx(B, t.exitts / 1000) : n - 1;
    S.marks.push({ i, y: e, kind: 'up', color: 'var(--up)', name: 'bought', tip: `Bought ${t.notional ? usd(t.notional, 2) : ''} at ${usd(e, 2)}` });
    S.levels.push({ y: e, name: 'in ' + e.toFixed(2), color: 'var(--text)', dash: '', i0: i, i1: end, fit: true }, { y: e * (1 + R.tp), name: 'target +3%', color: 'var(--up)', i0: i, i1: end, fit: true }, { y: e * (1 + R.sl), name: 'stop -1.5%', color: 'var(--down)', i0: i, i1: end, fit: true });
    const hi = bcIdx(B, t.ts / 1000 + R.hold / 1000); if (t.ts / 1000 + R.hold / 1000 <= B[n - 1].t && hi > i) S.vlines.push({ i: hi, name: '30 min limit', color: 'var(--mut)', row: 4 });
    if (t.status == 'closed' && t.exitts) S.marks.push({ i: end, y: t.exitp || B[end].c, kind: 'down', color: t.pnl > 0 ? 'var(--up)' : 'var(--down)', name: 'sold', tip: `Sold at ${usd(t.exitp, 2)} · ${esc(t.reason || '')}` }); }
  S.panes = [{ name: 'Headline score (the bot acts at +3 or more, sells at -3 or less)', short: 'Headline score', h: 70, type: 'bars', vals: scores, colors: cols, levels: [{ y: 3, name: '+3', color: 'var(--up)' }, { y: -3, name: '-3', color: 'var(--down)' }, { y: 0, name: '', color: 'var(--mut2)', dash: '2 4' }], min: -8, max: 8, fmt: v => (v > 0 ? '+' : '') + v.toFixed(0) },
    { name: 'Volume', h: 52, type: 'bars', vals: B.map(b => b.v), colors: B.map(b => b.c >= b.o ? 'var(--up)' : 'var(--down)'), fmt: v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(v) }];
  $('#nwinfo').innerHTML = `<b>${esc(C.sym)}</b> · ${last ? `${last.status == 'open' ? '<b>open position</b>' : last.pnl > 0 ? '<span class=up>won</span>' : '<span class=down>lost</span>'}${last.pnl != null ? ` <b class="${ud(last.pnl)}">${sg(last.pnl, 2)}</b>` : ''}${last.reason ? ` · ${esc(last.reason)}` : ''}<br><span class=mut>${esc(last.headline || '')}</span>` : `<span class=mut>${esc((C.news[C.news.length - 1] || {}).headline || '')}</span>`}`;
  bcChart($('#nwcv'), S);
  $('#nwleg').innerHTML = bcLegend([['var(--up)', 'good headline (dotted line)', 'tri'], ['var(--down)', 'bad headline (dotted line)'], ['var(--text)', 'entry price'], ['var(--up)', 'target +3%'], ['var(--down)', 'stop -1.5%'], ['rgba(127,127,127,.5)', 'grey = pre-market / after-hours', 'box']]) + '<div class=mut style="font-size:12px;margin-top:6px">1-minute candles, New York time (Yahoo Finance, a few minutes delayed at times). The bot only buys during regular hours; every trade ends at the target, the stop, 30 minutes, or 5 minutes before the close.</div>';
}
