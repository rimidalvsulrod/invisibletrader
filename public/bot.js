/* Auto Trader — real money on your Kalshi account. The engine runs on the server; this page shows live Kalshi data and settings. */
let botPoll, botFast;
const botStopPoll = () => { clearInterval(botPoll); clearInterval(botFast); };
const bapi = async (op, body) => {
  const r = await fetch('/api/bot' + (body ? '' : '?op=' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response from server' }));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
  return j;
};
const authPost = (op, data) => fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...data }) });

async function botPage() {
  app.innerHTML = sk(320);
  const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({ setup: {} }));
  OWNER = !!me.owner; renderSide();
  if (!me.setup?.db) return botNoDb();
  if (!me.setup.password) return botLogin(true);
  if (!OWNER) return botLogin(false);
  await botRefresh();
  botStopPoll();
  botFast = setInterval(() => { if (!$('#bstate')) return botStopPoll(); if (BOTON) fetch('/api/cron').catch(() => {}); }, 5000); // checks every 5s while open
  botPoll = setInterval(() => { if (!$('#bstate')) return botStopPoll(); if (!document.activeElement?.matches('input,select,textarea') && !$('#dial')?.onpointermove) botRefresh(true); }, 8000);
}
async function botRefresh() {
  try { botRender(await bapi('state')); }
  catch (e) { if (e.status === 401) return botLogin(false); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
function botNoDb() {
  app.innerHTML = `<div class="ph fade"><div><h1>Auto Trader</h1></div></div><div class="card pad" style="max-width:620px"><h2>Database not detected</h2>
    <p class=mut style="font-size:14px;line-height:1.6;margin:8px 0 0">The site can't see its database yet. In Vercel open your project → <b>Deployments</b> → ⋯ on the latest → <b>Redeploy</b>, then refresh this page.</p></div>`;
}
function botLogin(first) {
  app.innerHTML = `<div style="max-width:420px;margin:8vh auto 0" class="card pad fade"><div style="width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:var(--acbg);color:var(--ac)">${ic('lock', 22)}</div>
    <h2 style="margin-top:16px;font-size:22px">${first ? 'Create your account' : 'Log in'}</h2>
    <p class=mut style="margin:6px 0 18px;font-size:14px">${first ? 'Use your email and pick a password. This is the only account on the site.' : 'The Auto Trader trades real money on your Kalshi account.'}</p>
    <form id=lf><input class=inp id=em type=email placeholder=Email autocomplete=username required style="margin-bottom:8px">
      <input class=inp id=pw type=password placeholder="${first ? 'New password (8+ characters)' : 'Password'}" autocomplete="${first ? 'new-password' : 'current-password'}" required>
      ${first ? '<input class=inp id=pw2 type=password placeholder="Repeat password" autocomplete=new-password style="margin-top:8px" required>' : ''}
      <button class="btn pri" style="width:100%;margin-top:12px;height:46px">${first ? 'Create account' : 'Log in'}</button><div id=le class=down style="font-size:13px;margin-top:10px"></div></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    if (first && $('#pw').value !== $('#pw2').value) { $('#le').textContent = "Passwords don't match"; return; }
    const r = await authPost(first ? 'setup' : 'login', { email: $('#em').value, password: $('#pw').value }), j = await r.json().catch(() => ({}));
    if (!r.ok) { $('#le').textContent = j.error || 'Login failed'; return; }
    OWNER = true; syncFol(); toast('Logged in'); botPage();
  };
}

function botRender(S) {
  BOTON = S.enabled; renderSide();
  const c = S.cfg, A = S.account, connected = S.keys.set, real = S.keys.env === 'prod';
  const perTrade = A ? Math.min(A.cash * c.pct / 100, S.capServer || Infinity) : null;
  const stale = S.enabled && (!S.last || Date.now() - S.last > 5 * 60e3);
  const L = { bought: ['up', 'Bought'], sold: ['ac', 'Sold'], closed: ['n', 'Closed'], skip: ['n', 'Skipped'], error: ['down', 'Error'] };
  const keepOpen = $('details')?.open;

  const status = `<div class="card pad" id=bstate>
    <div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${S.enabled ? 'on' : ''}" id=btog aria-label="Bot on/off" ${connected ? '' : 'disabled'}></button>
      <div><div style="font-size:22px;font-weight:650;letter-spacing:-.5px">${S.enabled ? '<span class=up>Running</span>' : 'Paused'}</div>
      <div class=mut style="font-size:13px">${S.last ? `Last check ${rel(S.last / 1000)} · copying ${S.watching} trader${S.watching == 1 ? '' : 's'}` : connected ? 'Turn on to start copying' : 'Connect Kalshi to start'}</div></div></div>
      ${connected ? `<span class="pill ${real ? 'down' : 'ac'}" style="height:26px;padding:0 12px">${real ? 'Kalshi · real money' : 'Kalshi · demo account'}</span>` : ''}</div>
    ${stale ? `<div class=note style="margin-top:16px">The bot is on but hasn't checked in 5 minutes — the 24/7 runner may be restarting. It recovers on its own; tap Check now to run immediately.</div>` : ''}
    ${S.disabledServer ? `<div class=note style="margin-top:16px">Trading is switched off on the server (TRADING_DISABLED).</div>` : ''}
    ${S.accountError ? `<div class=note style="margin-top:16px">Kalshi: ${esc(S.accountError)}</div>` : ''}
    ${A ? `<div class="grid g3" style="margin-top:20px"><div class=stat><div class=k>Cash</div><div class="v num">${usd(A.cash, 2)}</div><div class=s>available on Kalshi</div></div>
      <div class=stat><div class=k>In positions</div><div class="v num">${usd(A.positionsValue, 2)}</div><div class=s>${S.positions.length} market${S.positions.length == 1 ? '' : 's'} · at current bids</div></div>
      <div class=stat><div class=k>Account value</div><div class="v num">${usd(A.total, 2)}</div><div class=s>cash + positions</div></div></div>` : ''}</div>`;

  const keysCard = connected
    ? `<div class="card pad"><div class="row sb"><h3>Kalshi account</h3><span class="pill ${real ? 'down' : 'ac'}">${real ? 'Real money' : 'Demo'}</span></div>
        <div class=mut style="font-size:13px;margin-top:8px">Connected · key <span class=num>${esc(S.keys.keyId)}</span>${S.keys.source == 'env' ? ' (set in Vercel)' : ''}</div>
        ${S.keys.source == 'app' ? `<button class="btn sm danger" id=kdel style="margin-top:12px">Disconnect</button>` : ''}</div>`
    : `<div class="card pad" id=kcard><h2>Connect Kalshi</h2><p class=mut style="font-size:13px;line-height:1.55;margin:6px 0 14px">On Kalshi open <b>Account → API keys → Create</b>, then paste the Key ID and the private key below. It's verified with Kalshi and stored encrypted.</p>
        <input class=inp id=kid placeholder="Key ID"><textarea class=inp id=kpem placeholder="-----BEGIN PRIVATE KEY-----&#10;…&#10;-----END PRIVATE KEY-----" style="height:120px;padding:10px 14px;margin-top:8px;font:12px ui-monospace,monospace;resize:vertical"></textarea>
        <button class="btn pri" id=ksave style="width:100%;margin-top:10px">Verify & connect</button><div id=kerr class=down style="font-size:13px;margin-top:8px"></div></div>`;

  const settings = `<div class="card pad"><h2>Trade size</h2><p class=mut style="font-size:13px;margin:4px 0 12px">Turn the dial: the share of your Kalshi cash each copied trade uses.</p>
    <div class=dialbox><div class=dialtop><button class=kbtn id=kminus aria-label=Less>−</button><div class=dialval><b class=num id=pctv>${c.pct}</b><span>% per trade</span></div><button class=kbtn id=kplus aria-label=More>+</button></div>
      <div class=dial id=dial role=slider aria-label="Percent per trade" aria-valuemin=1 aria-valuemax=100 aria-valuenow=${c.pct} tabindex=0><svg viewBox="0 0 224 224" id=dialsvg></svg><div class=face id=face><i></i></div></div>
      <div class="dialcap num" id=pcte>${perTrade != null ? `≈ ${usd(perTrade, 2)} per trade right now` : ''}</div></div>
    <details style="margin-top:18px"><summary>${ic('chev', 12)} Advanced</summary><div class="grid g2" style="margin-top:14px">
      ${[['minUsd', 'Copy trades over ($)', c.minUsd], ['maxPrice', 'Max price (¢)', c.maxPrice], ['slip', 'Max price gap vs trader (¢)', c.slip], ['maxUse', 'Max % of money in copies', c.maxUse], ['thresh', 'Match strictness (%)', c.thresh]]
        .map(([k, l, v]) => `<label><span class=lbl>${l}</span><input class=inp type=number data-k=${k} value=${v}></label>`).join('')}</div></details></div>`;

  const posT = `<div class="card" style="overflow:hidden"><div class="row sb pad" style="padding-bottom:8px"><h2>Positions</h2>${S.positions.some(p => p.copied) ? `<button class="btn sm danger" id=bsa>Sell all copies</button>` : ''}</div>
    <table class=tbl><tbody>${S.positions.map(p => `<tr><td><div class=ell style="font-weight:550;max-width:380px">${esc(p.title)}${p.sub ? ` <span class=mut>· ${esc(p.sub)}</span>` : ''}</div>
      <div class=mut style="font-size:12.5px;margin-top:3px"><span class="pill ${p.side == 'yes' ? 'up' : 'down'}" style="height:19px">${p.side.toUpperCase()}</span> ${fmt(p.count)} contracts · cost ${usd(p.cost, 2)}${p.copied ? ` · <span style="color:var(--ac)">copied ${esc(p.copied.trader)}</span>` : ''}${p.status && p.status != 'active' ? ` · ${esc(p.status)}` : ''}</div></td>
      <td class="r num">${p.value != null ? usd(p.value, 2) : '—'}<div class="${p.pnl != null ? ud(p.pnl) : 'mut'}" style="font-size:12px">${p.pnl != null ? sg(p.pnl, 2) : ''}</div></td>
      <td class=r style="width:1%"><button class="btn sm" data-sell="${esc(p.tk)}">Sell</button></td></tr>`).join('') || `<tr><td class=empty>${connected ? 'No open positions on Kalshi.' : 'Connect Kalshi to see your positions.'}</td></tr>`}</tbody></table></div>`;

  const fillsT = S.fills.length ? `<div class="card" style="overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Recent Kalshi fills</h2></div><table class=tbl><tbody>${S.fills.map(f => `<tr>
      <td style="width:1%"><span class="pill ${f.action == 'buy' ? 'up' : 'ac'}">${f.action == 'buy' ? 'Bought' : 'Sold'}</span></td><td><div class="num ell" style="max-width:360px">${esc(f.tk)}</div><div class=mut style="font-size:12.5px">${(f.side || '').toUpperCase()} · ${fmt(f.count)} × ${Math.round(f.price * 100)}¢${f.fee ? ` · fee ${usd(f.fee, 2)}` : ''}</div></td>
      <td class="r mut" style="font-size:12.5px;white-space:nowrap">${rel(f.t / 1000)}</td></tr>`).join('')}</tbody></table></div>` : '';

  const logT = `<div class="card" style="overflow:hidden"><div class="row sb pad" style="padding-bottom:8px"><h2>Bot activity</h2><button class="btn sm" id=bclr>Clear</button></div><table class=tbl><tbody>${S.log.map(e => {
      const [k, l] = L[e.st] || ['n', e.st];
      return `<tr><td style="width:1%"><span class="pill ${k}">${l}</span></td><td><div class=ell style="max-width:440px">${e.act == 'sell' ? '' : e.outcome ? `${esc(e.trader)} bought <b>${esc(e.outcome)}</b>${e.pm ? ` @ ${e.pm}¢` : ''} · ` : ''}${esc(e.title)}</div>
        <div class=mut style="font-size:12.5px;margin-top:2px">${e.tk ? `<span class=num>${esc(e.tk)}</span> · ` : ''}${esc(e.note || '')}</div></td><td class="r mut hide-m" style="font-size:12.5px;white-space:nowrap">${rel(e.t / 1000)}</td></tr>`;
    }).join('') || `<tr><td class=empty>Nothing yet — when a trader you follow buys on Polymarket, the bot's decision shows up here.</td></tr>`}</tbody></table></div>`;

  const cronCard = `<div class="card pad"><div class="row sb"><h3>Always on</h3><span class=live>24/7</span></div><p class=mut style="font-size:13px;line-height:1.55;margin:8px 0 0">The bot runs on GitHub's servers around the clock, checking every ~10 seconds — your phone and this page can be closed. While this page is open it also checks every 5 seconds.</p></div>`;

  app.innerHTML = `<div class="ph fade"><div><h1>Auto Trader</h1><p class=lead>Copies the Polymarket traders you follow onto your Kalshi account.</p></div>${connected ? `<button class=btn id=brun>Check now</button>` : ''}</div>
    ${status}<div class=split style="margin-top:20px"><div class=grid>${connected ? posT + fillsT : ''}${logT}</div><div class=grid>${keysCard}${connected ? settings : ''}${cronCard}</div></div>`;
  if (keepOpen && $('details')) $('details').open = true;

  const act = async (fn, okMsg) => { try { const r = await fn(); if (okMsg) toast(typeof okMsg == 'function' ? okMsg(r) : okMsg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } botRefresh(); };
  const save = cfg => act(() => bapi('cfg', { cfg }));
  $('#btog') && ($('#btog').onclick = () => {
    if (!S.enabled && !confirm(`Start copying trades with REAL money on your Kalshi ${real ? '' : 'demo '}account?\n\nEach trade uses ${c.pct}% of your cash.`)) return;
    act(() => bapi(S.enabled ? 'stop' : 'start', {}), S.enabled ? 'Bot paused' : 'Bot started');
  });
  $('#brun') && ($('#brun').onclick = () => act(() => bapi('runnow', {}), r => r.ran ? `Checked — ${r.trades || 0} new trade(s)` : 'Turn the bot on first'));
  $('#bsa') && ($('#bsa').onclick = () => confirm('Sell every position the bot copied, at the current bid?') && act(() => bapi('sell', { ticker: 'all' }), 'Sell orders sent'));
  $$('[data-sell]').forEach(b => b.onclick = () => confirm(`Sell your whole ${b.dataset.sell} position at the current bid?`) && act(() => bapi('sell', { ticker: b.dataset.sell }), 'Sell order sent'));
  $('#bclr').onclick = () => act(() => bapi('clearlog', {}));
  $('#kdel') && ($('#kdel').onclick = () => confirm('Disconnect your Kalshi account? The bot stops.') && act(() => bapi('keysdel', {}), 'Disconnected'));
  $('#ksave') && ($('#ksave').onclick = async () => {
    $('#ksave').disabled = true; $('#ksave').textContent = 'Checking with Kalshi…'; $('#kerr').textContent = '';
    try { const r = await bapi('keys', { keyId: $('#kid').value, pem: $('#kpem').value }); toast(`Connected your ${r.env == 'prod' ? 'real-money' : 'demo'} Kalshi account · cash ${usd(r.cash, 2)}`); botRefresh(); }
    catch (e) { $('#kerr').textContent = e.message; $('#ksave').disabled = false; $('#ksave').textContent = 'Verify & connect'; }
  });
  // rotary dial: 1–100% over a 270° sweep, 50 tick marks; drag, +/- buttons, arrow keys
  const dial = $('#dial');
  if (dial) {
    let v = c.pct, t;
    const ang = x => -135 + (x - 1) / 99 * 270;
    const ticks = () => { let h = ''; for (let k = 0; k <= 50; k++) { const a = (-135 + k * 270 / 50) * Math.PI / 180, on = k / 50 <= (v - 1) / 99 + 1e-9, r1 = 104, r2 = k % 5 ? 96 : 92;
        h += `<line x1="${112 + r1 * Math.sin(a)}" y1="${112 - r1 * Math.cos(a)}" x2="${112 + r2 * Math.sin(a)}" y2="${112 - r2 * Math.cos(a)}" style="stroke:${on ? 'var(--ac)' : 'var(--mut2)'};opacity:${on ? 1 : .45}" stroke-width="${k % 5 ? 1.6 : 2.4}" stroke-linecap=round />`; } return h; };
    const paint = () => { $('#pctv').textContent = v; $('#face').style.transform = `rotate(${ang(v)}deg)`; $('#dialsvg').innerHTML = ticks(); dial.setAttribute('aria-valuenow', v);
      if (A) $('#pcte').textContent = `≈ ${usd(Math.min(A.cash * v / 100, S.capServer || Infinity), 2)} per trade right now`; };
    const commit = () => { clearTimeout(t); t = setTimeout(() => v !== c.pct && save({ pct: v, maxUse: Math.max(c.maxUse, v) }), 500); };
    const setV = (x, haptic) => { const n = Math.max(1, Math.min(100, Math.round(x))); if (n !== v) { v = n; paint(); if (haptic && navigator.vibrate) navigator.vibrate(3); } };
    const fromPoint = e => { const r = dial.getBoundingClientRect(); let a = Math.atan2(e.clientX - r.left - r.width / 2, -(e.clientY - r.top - r.height / 2)) * 180 / Math.PI; a = Math.max(-135, Math.min(135, a)); setV(1 + (a + 135) / 270 * 99, 1); };
    dial.onpointerdown = e => { dial.setPointerCapture(e.pointerId); fromPoint(e); dial.onpointermove = fromPoint; };
    dial.onpointerup = dial.onpointercancel = () => { dial.onpointermove = null; commit(); };
    dial.onkeydown = e => { if (['ArrowUp', 'ArrowRight'].includes(e.key)) { setV(v + 1); commit(); e.preventDefault(); } if (['ArrowDown', 'ArrowLeft'].includes(e.key)) { setV(v - 1); commit(); e.preventDefault(); } };
    $('#kminus').onclick = () => { setV(v - 1); commit(); }; $('#kplus').onclick = () => { setV(v + 1); commit(); };
    paint();
  }
  $$('[data-k]').forEach(i => i.onchange = () => save({ [i.dataset.k]: +i.value }));
}
