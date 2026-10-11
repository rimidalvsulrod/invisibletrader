// Meme Radar tab: paper-trades new meme coins at the start of a trend. Radar of what the scanner sees, paper account, positions, trades.
let memeT = null, memeS = null, mcSel = null, mcN = 0, mcCache = null;
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
  memeT = setInterval(async () => { if (!$('#mradar')) return memeStop(); if (++mcN % 10 === 0) memeChart(true); try { if (++n % 3 === 0) { memeS = await mapi('state'); memeRender(); } else { memeS.live = (await mapi('live')).live; memeRadar(); } } catch (e) {} }, 3000);
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
          ${c.size == 'usd' ? `<label class=row style="gap:8px"><input class=inp type=number id=msz min=1 max=10000 step=1 value=${c.usd} style="width:110px"><b>$</b></label>` : ''}</div>${c.size == 'pct' ? '<div id=mdial style="margin-top:10px"></div>' : ''}
        <div class=mut style="font-size:12.5px;margin-top:10px">${c.size == 'pct' ? `≈ ${usd(val * c.pct / 100, 2)} per trade right now. ` : ''}Built in: at most 6 positions and no more than 15% of the account open at once, never more than 1% of a pool's liquidity per buy, 40% size on coins under a $100k market cap, and it rests for the day after losing 5% and for the week after losing 10%.</div></div>
      <div class="card pad"><h2>Paper account</h2><p class=mut style="font-size:13px;margin:6px 0 12px">Start over with a fresh simulated balance. All paper trades are cleared.</p>
        <div class=row style="gap:8px"><input class=inp type=number id=mamt value=${Math.round(A.start)} min=10 style="max-width:140px"><button class=btn id=mreset>Reset paper account</button></div></div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:4px"><h2>Radar</h2></div><div id=mradar></div></div>
      <div class="card pad"><h3>How it decides</h3><p class=mut style="font-size:13px;line-height:1.6;margin:8px 0 0">Every 30 seconds it reads the newest and trending pools on Solana and Base. A coin must be 15 minutes to 12 hours old (the first minutes are mostly snipers), with $15k+ liquidity and a $25k-$8M market cap. Then it scores the trend: volume in the last 15 minutes running 1.5-2.5× or more above its hourly pace, buys outnumbering sells, many distinct buyers, price up 4-50% in 15 minutes but not already pumped. It needs a score of 6+ on two scans in a row, then checks the price again on a second source before buying.<br><br><b>Exits:</b> stop at -25%; a trailing stop once it is up 30% (20% below the peak) or 100% (15% below); sell if liquidity falls 40%, if it hasn't moved after 40 minutes, or after 4 hours. Fills include price impact from the pool's size, 2% for landing late and a 1% fee both ways, and a pulled-liquidity exit sells into the crash. Before any buy the token must pass the safety check: mint and freeze authority revoked, liquidity locked or burned, no top-holder concentration flag, the dev holding under 10%, no transfer fee or sell restrictions.<br><br><span class=mut>Paper results flatter real meme trading: real buys race bots, can fail, and some coins can't be sold at all. Treat this as a way to test the idea.</span></p></div></div>
    <div class="card pad" style="margin-top:16px"><div class="row sb wrapf" style="gap:12px"><h2>Chart</h2><div class=bcsel><select class=inp id=mcsel style="width:auto;max-width:100%"></select></div></div>
      <div class=mut style="font-size:13px;margin-top:8px;line-height:1.55" id=mcinfo></div><div id=mccv style="margin-top:10px"></div><div id=mcleg></div></div>
    ${bcProfitCard('mmpc')}
    ${btCard('mmbt', { opts: [[1, 'Last 1 day'], [3, 'Last 3 days'], [7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days']], def: 7, note: 'Free sources keep no history of brand-new coins, so this cannot replay the past. Instead the runner logs every coin that meets the basic bar and follows each one for 4 hours on 1-minute candles with the bot\'s own exit rules and costs (a $50 position). That scores dozens of signals a day instead of waiting for the few real trades.' })}
    <div class=grid style="margin-top:16px"><div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Positions and trades</h2></div><table class=tbl><tbody>${s.trades.map(row).join('') || `<tr><td class=empty>No trades yet. It only buys confirmed early trends, so quiet stretches are normal.</td></tr>`}</tbody></table></div></div>`;
  btWire('mmbt', { run: async d => btMemeHtml(await mapi('bt', { days: +d })) });
  memeRadar(); memeChart(); bcProfitDraw('mmpc', s.trades, { label: t => t.sym });
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } memeS = await mapi('state').catch(() => memeS); memeRender(); };
  $('#mtog').onclick = () => act(() => mapi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'Meme Radar paused' : 'Meme Radar started');
  $$('#msize button').forEach(b => b.onclick = () => b.dataset.v != c.size && act(() => mapi('cfg', { cfg: { size: b.dataset.v } })));
  $('#msz') && ($('#msz').onchange = () => act(() => mapi('cfg', { cfg: { usd: +$('#msz').value } }), 'Saved'));
  dialMount('#mdial', { key: 'meme-pct', value: c.pct, min: .5, max: 25, step: .5, unit: '% per trade', size: 'sm', caption: v => `≈ ${usd(val * v / 100, 2)} per trade right now`, onCommit: v => act(() => mapi('cfg', { cfg: { pct: v } }), 'Saved') });
  $('#mreset').onclick = () => confirm('Reset the paper account? All paper trades will be cleared.') && act(() => mapi('reset', { amount: +$('#mamt').value }), 'Paper account reset');
}

function btMemeHtml(r) {
  const pc = x => x == null ? '-' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', rows = list => `<table class=tbl><thead><tr><th class=mut style="text-align:left;font-weight:500;font-size:12px"></th><th class=mut style="font-weight:500;font-size:12px">Signals</th><th class=mut style="font-weight:500;font-size:12px">Won</th><th class=mut style="font-weight:500;font-size:12px">Average</th><th class=mut style="font-weight:500;font-size:12px">Typical</th><th class=mut style="font-weight:500;font-size:12px">Rugs</th></tr></thead><tbody>${list.map(g => `<tr><td><div>${esc(g.name)}</div>${g.note ? `<div class=mut style="font-size:12px">${esc(g.note)}</div>` : ''}</td><td class=num>${g.n}</td><td class=num>${g.win == null ? '-' : Math.round(g.win * 100) + '%'}</td><td class="num ${g.avg == null ? '' : g.avg >= 0 ? 'up' : 'down'}" style="font-weight:600">${pc(g.avg)}</td><td class=num>${pc(g.median)}</td><td class=num>${g.rugs || 0}</td></tr>`).join('')}</tbody></table>`;
  if (!r.evaluated) return btTiles([['Signals logged', r.logged, 'in this period'], ['Followed to the end', 0, `${r.pending} still being followed`], ['Your paper trades', r.mine ? r.mine.n : 0, r.mine && r.mine.n ? `${btUsd(r.mine.pnl)}` : 'none closed in this period']]) + btWarn('Nothing has been followed to the end yet. The runner logs signals from now on and follows each for 4 hours, so the first results appear about 4 hours after it starts logging. Check back later.');
  const bot = r.groups.find(g => g.name == "The bot's rules");
  return btTiles([['Signals followed', r.evaluated, `${r.logged} logged · ${r.pending} still being followed`], ["The bot's rules", bot.n ? pc(bot.avg) : '-', bot.n ? `${Math.round(bot.win * 100)}% won over ${bot.n} signal${bot.n == 1 ? '' : 's'}` : 'no signal met every rule', bot.avg >= 0 ? 'up' : 'down'], ['Your paper trades', r.mine.n, r.mine.n ? `${btUsd(r.mine.pnl)} · ${r.mine.won} won` : 'none closed in this period']])
    + `<div style="margin-top:14px">${rows(r.groups)}</div>` + (bot.verdict ? `<div class="mut" style="font-size:13px;margin-top:10px"><b class="${bot.verdict.ok === true ? 'up' : bot.verdict.ok === false ? 'down' : ''}">Verdict on the bot's rules:</b> ${esc(bot.verdict.text)}${bot.exBest != null && bot.n >= 5 ? ` Without its best ${bot.cut} signal${bot.cut == 1 ? '' : 's'} the average is ${pc(bot.exBest)}.` : ''}</div>` : '') + (r.variants.length ? `<h2 style="font-size:16px;margin-top:20px">Which signs went with better results</h2><div class=mut style="font-size:12.5px;margin:2px 0 6px">Among every coin followed (at least 10 signals each). If the signal rules mean anything, the bot's rules should beat "Everything the scanner found".</div>${rows(r.variants)}` : '')
    + btWarn(`<b>Read this carefully.</b> Each signal is a $50 position with the bot's exit rules, a 1% fee, 2% slop and price impact on both sides, and a 25% stop. Average is the mean return per signal, typical is the middle one. Memecoin results are dominated by a few big winners and a few rugs, so small samples swing wildly, and picking a filter that looked good here is just as easy to overfit as anything else. Treat this as evidence building up, not proof${r.evaluated < 30 ? `. With only ${r.evaluated} signals followed so far it says almost nothing yet` : ''}.`);
}

/* ---------- chart: candles with the bot's position and the signal drawn as an indicator ---------- */
function memeOptions() {
  const s = memeS, o = [], tr = s.trades || [];
  for (const t of tr.filter(t => t.status == 'open')) o.push({ v: 't:' + t.id, l: `Open position · ${t.sym} (${t.chain})` });
  for (const t of tr.filter(t => t.status != 'open').slice(0, 8)) o.push({ v: 't:' + t.id, l: `${t.pnl > 0 ? 'Won' : 'Lost'} · ${t.sym} · ${rel(t.ts / 1000)}` });
  for (const x of ((s.live && s.live.radar) || []).slice(0, 8)) o.push({ v: 'r:' + x.chain + ':' + x.pool, l: `Radar · ${x.sym} (score ${x.score}${x.ok ? ', signal' : ''})` });
  return o;
}
async function memeChart(refetch) {
  const sel = $('#mcsel'); if (!sel) return; const opts = memeOptions();
  if (!opts.length) { sel.innerHTML = ''; $('#mccv').innerHTML = '<div class=empty style="padding:30px 0">Nothing to chart yet. Positions appear here once the bot buys; until then the radar candidates do.</div>'; $('#mcinfo').textContent = ''; $('#mcleg').innerHTML = ''; return; }
  if (!opts.some(o => o.v == mcSel)) mcSel = opts[0].v; sel.innerHTML = opts.map(o => `<option value="${esc(o.v)}" ${o.v == mcSel ? 'selected' : ''}>${esc(o.l)}</option>`).join(''); sel.onchange = () => { mcSel = sel.value; mcCache = null; memeChart(true); };
  let chain, pool, tr = null, rd = null;
  if (mcSel[0] == 't') { tr = memeS.trades.find(t => 't:' + t.id == mcSel); if (!tr) return; chain = tr.chain; pool = tr.pool; }
  else { const [, c, p] = mcSel.split(':'); chain = c; pool = p; rd = ((memeS.live && memeS.live.radar) || []).find(x => x.pool == p); }
  const old = tr && Date.now() - tr.ts > 4 * 36e5, agg = old ? 5 : 1, key = chain + pool + agg;
  if (!mcCache || mcCache.key != key || (refetch && Date.now() - mcCache.t > 12e3)) {
    try { const j = await mapi(`chart&chain=${chain}&pool=${encodeURIComponent(pool)}&agg=${agg}`); mcCache = { key, t: Date.now(), candles: j.candles, agg }; }
    catch (e) { if (!mcCache || mcCache.key != key) { $('#mccv').innerHTML = `<div class=empty style="padding:30px 0">Candles unavailable right now (${esc(e.message)}). The free price source limits how often it can be asked: try again in a minute.</div>`; return; } }
  }
  if (!$('#mccv') || mcCache.key != key) return; memeDraw(mcCache.candles, mcCache.agg, tr, rd);
}
function memeDraw(cd, agg, tr, rd) {
  const B = cd.map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] })), n = B.length, X = memeS.rules.X, k15 = agg == 1 ? 15 : 3, k60 = agg == 1 ? 60 : 12, sum = (a, i, k) => { let t = 0; for (let j = i - k + 1; j <= i; j++) t += a[j]; return t; };
  const vol = B.map(b => b.v), pace = B.map((_, i) => i >= k60 - 1 ? sum(vol, i, k15) / Math.max(1e-9, sum(vol, i, k60) / (k60 / k15)) : null), chg = B.map((b, i) => i >= k15 ? (b.c / B[i - k15].c - 1) * 100 : null);
  const ign = B.map((_, i) => pace[i] != null && chg[i] != null && pace[i] >= 1.5 && chg[i] >= 3 && chg[i] <= 60), shade = []; for (let i = 0; i < n; i++) if (ign[i]) { let j = i; while (j + 1 < n && ign[j + 1]) j++; shade.push({ i0: i, i1: j, color: 'rgba(48,209,88,.10)' }); i = j; }
  const S = { bars: B, h: 330, shade, levels: [], overlays: [], vlines: [], marks: [], yfmt: mpx, last: B[n - 1].c, lastColor: B[n - 1].c >= B[0].o ? 'var(--up)' : 'var(--down)',
    tf: (t) => agg == 1 && n < 400 ? new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), tfFull: (t) => new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    panes: [{ name: 'Volume', h: 56, type: 'bars', vals: vol, colors: B.map(b => b.c >= b.o ? 'var(--up)' : 'var(--down)'), fmt: v => v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v)) },
      { name: 'Volume pace: last 15 min vs its hourly rate (the bot wants 1.5× or more)', short: 'Volume pace (needs 1.5×)', h: 70, vals: pace, color: 'var(--text)', levels: [{ y: 1.5, name: '1.5×', color: 'var(--up)' }, { y: 2.5, name: '2.5×', color: 'var(--up)', dash: '2 4' }, { y: 1, name: '1×', color: 'var(--mut2)', dash: '2 4' }], fmt: v => v.toFixed(1) + '×', min: 0 },
      { name: 'Price change over 15 min (the bot wants +3% to +60%)', short: '15-min change (needs +3%)', h: 70, vals: chg, color: 'var(--text)', levels: [{ y: 3, name: '+3%', color: 'var(--up)' }, { y: 0, name: '0', color: 'var(--mut2)', dash: '2 4' }], fmt: v => v.toFixed(0) + '%' }] };
  let info = '';
  if (tr) { const e = tr.entry, i0 = bcIdx(B, tr.ts / 1000), open = tr.status == 'open', closed = !open;
    // the trailing stop as it would stand candle by candle: armed once the trade is up 30%, tighter once it is up 100%
    let peak = e; const trail = B.map((b, i) => { if (i < i0) return null; peak = Math.max(peak, b.h); const up = peak / e - 1; return up >= X.trail2[0] ? peak * X.trail2[1] : up >= X.trail1[0] ? peak * X.trail1[1] : null; });
    const endI = closed && tr.exitts ? bcIdx(B, tr.exitts / 1000) : n - 1; for (let i = endI + 1; i < n; i++) trail[i] = null;
    S.levels.push({ y: e, name: 'bought ' + mpx(e), color: 'var(--text)', dash: '', i0, i1: endI, fit: true }, { y: e * (1 + X.sl), name: 'stop ' + mpx(e * (1 + X.sl)), color: 'var(--down)', i0, i1: endI, pin: true });
    S.overlays.push({ name: 'trailing stop', pts: trail, color: '#ff9f0a', w: 1.6 });
    if (B[0].t < tr.ts / 1000 - 60) S.marks.push({ i: i0, y: e, kind: 'up', color: 'var(--up)', name: 'bought', tip: `Bought ${usd(tr.cost, 2)} at ${mpx(e)}` });
    const dl = (ms, name) => { const i = bcIdx(B, (tr.ts + ms) / 1000); if ((tr.ts + ms) / 1000 <= B[n - 1].t && i > i0) S.vlines.push({ i, name, color: 'var(--mut)' }); }; dl(X.stale[0], '40 min: needs +5%'); dl(X.hold, '4 h: time exit');
    if (closed && tr.exitts) S.marks.push({ i: endI, y: tr.exitp || B[endI].c, kind: 'down', color: tr.pnl > 0 ? 'var(--up)' : 'var(--down)', name: 'sold', tip: `Sold at ${mpx(tr.exitp)} · ${esc(tr.reason || '')}` });
    const now = open ? tr.last : tr.exitp, pnl = open ? (tr.value != null ? tr.value - tr.cost : null) : tr.pnl;
    info = `<b>${esc(tr.sym)}</b> · ${tr.chain} · ${open ? 'open position' : tr.pnl > 0 ? '<span class=up>won</span>' : '<span class=down>lost</span>'} · bought ${usd(tr.cost, 2)} at ${mpx(e)}${now ? ` · ${open ? 'now' : 'sold at'} ${mpx(now)} (${mp((now / e - 1) * 100)})` : ''}${pnl != null ? ` · <b class="${ud(pnl)}">${sg(pnl, 2)}</b>` : ''}${tr.reason ? ` · ${esc(tr.reason)}` : ''}<br><span class=mut>${esc(tr.why || '')}</span>`;
  } else if (rd) info = `<b>${esc(rd.sym)}</b> · ${rd.chain} · ${rd.age}m old · liquidity ${mk(rd.liq)} · market cap ${mk(rd.fdv)} · score <b>${rd.score}</b>/6 needed · ${rd.ok ? '<span class=up>meets every rule</span>' : esc(rd.fails.join(' · '))}`;
  $('#mcinfo').innerHTML = info; bcChart($('#mccv'), S);
  $('#mcleg').innerHTML = bcLegend([['rgba(48,209,88,.5)', 'green band: volume and price both in the bot\'s range (the part of the signal candles can show; buyer counts and the buy/sell mix are checked live)', 'box'], tr && ['#ff9f0a', 'trailing stop'], tr && ['var(--down)', 'stop -25%'], tr && ['var(--text)', 'entry price']]) + `<div class=mut style="font-size:12px;margin-top:6px">${agg == 1 ? '1-minute' : '5-minute'} candles from GeckoTerminal. Hover for exact values.</div>`;
}
