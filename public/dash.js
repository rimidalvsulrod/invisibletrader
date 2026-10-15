// Dashboard: every bot on one screen (paper balance, profit or loss, win rate, a mini profit curve), plus the sign-up questionnaire.
let dashT = null, dashF = 'all', dashD = null;
const dashStop = () => { clearInterval(dashT); dashT = null; };
const dapi = async (op, body) => { const r = await fetch('/api/powell' + (body ? '' : '?op=lab-' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'lab-' + op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j; };
const dM = (x, d = 0) => (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
// numbers that count up when they appear
function countUp(el, to, fmt, ms = 900) { const t0 = performance.now(), from = 0; const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }
const spark = (c, up) => { if (!c || c.length < 2) return '<svg class=dspark viewBox="0 0 120 36"><line x1=0 x2=120 y1=30 y2=30 stroke="var(--line2)" stroke-dasharray="3 4"/></svg>';
  const v = [0, ...c], lo = Math.min(...v), hi = Math.max(...v), Y = x => 32 - (x - lo) / ((hi - lo) || 1) * 28, d = v.map((x, i) => (i ? 'L' : 'M') + (i / (v.length - 1) * 120).toFixed(1) + ' ' + Y(x).toFixed(1)).join('');
  return `<svg class=dspark viewBox="0 0 120 36" preserveAspectRatio=none><path d="${d}" fill=none stroke="${up ? 'var(--up)' : 'var(--down)'}" stroke-width=2 stroke-linejoin=round stroke-linecap=round pathLength=1 class=draw /></svg>`; };

async function dashPage() {
  dashStop(); if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', dashPage); await signedIn(me.user); }
  app.innerHTML = `<div class="ph fade"><div><h1>Dashboard</h1><p class=lead>Every bot on one screen: its paper balance and whether it is making or losing money.</p></div><button class="btn ic" id=dqz title="Retake the questions" aria-label="Retake the questions">${ic('help')}</button></div><div id=dbody>${sk(140)}<div style="height:16px"></div>${sk(420)}</div>`;
  $('#dqz').onclick = () => onboard(true);
  try { dashD = await dapi('dash'); } catch (e) { if (e.status === 401) return authView('login', '', dashPage); $('#dbody').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  dashRender(true); dashT = setInterval(async () => { if (!$('#dgrid')) return dashStop(); try { dashD = await dapi('dash'); dashRender(false); } catch (e) {} }, 30000);
}
function dashRender(first) {
  const B = dashD.bots, used = b => b.enabled || b.n || b.open, money = B.filter(b => b.balance != null && used(b)), tot = money.reduce((a, b) => a + b.balance, 0), pnl = B.reduce((a, b) => a + b.pnl, 0), run = B.filter(b => b.enabled).length,
    up = B.filter(b => b.pnl > 0).length, dn = B.filter(b => b.pnl < 0).length, n = B.reduce((a, b) => a + b.n, 0), won = B.reduce((a, b) => a + b.won, 0);
  const show = B.filter(b => dashF == 'all' || (dashF == 'on' && b.enabled) || (dashF == 'up' && b.pnl > 0) || (dashF == 'down' && b.pnl < 0)).sort((a, b) => (b.enabled - a.enabled) || (b.pnl - a.pnl) || a.name.localeCompare(b.name));
  $('#dbody').innerHTML = `<div class="dhero card pad ${first ? 'pop' : ''}"><div class="row sb wrapf" style="gap:20px;align-items:flex-end"><div><div class=mut style="font-size:14px">${money.length ? `Paper balance of your ${money.length} active bot${money.length == 1 ? '' : 's'}` : 'No bots started yet: open one and press Start bot'}</div><div class="num dbig" id=dtot>${dM(tot)}</div>
     <div class="pill ${pnl >= 0 ? 'up' : 'down'}" style="height:28px;font-size:14px;padding:0 12px;margin-top:10px" id=dpnl>${pnl >= 0 ? '+' : ''}${dM(pnl, 2)} all-time</div></div>
     <div class="dkpis"><div><b class=num>${run}</b><span>running</span></div><div><b class="num up">${up}</b><span>in profit</span></div><div><b class="num down">${dn}</b><span>at a loss</span></div><div><b class=num>${n ? Math.round(won / n * 100) + '%' : '-'}</b><span>trades won</span></div></div></div></div>
   <div class="row sb wrapf" style="margin:22px 0 14px;gap:12px"><div class="seg chips" id=dflt>${[['all', 'All ' + B.length], ['on', 'Running ' + run], ['up', 'Profit ' + up], ['down', 'Loss ' + dn]].map(([k, l]) => `<button data-v=${k} class="${dashF == k ? 'on' : ''}">${l}</button>`).join('')}</div><span class=mut style="font-size:12.5px">Updates every 30 seconds</span></div>
   <div class="dgrid" id=dgrid>${show.map((b, i) => `<a class="card dcard ${first ? 'rise' : ''} ${used(b) ? '' : 'idle'}" style="animation-delay:${Math.min(i, 16) * 35}ms" href="#/${b.route}">
     <div class="row sb"><div class=row style="gap:10px;min-width:0"><span class="ddot ${b.enabled ? 'on' : ''}"></span><div style="min-width:0"><div class=dname>${esc(b.name)}</div><div class=mut style="font-size:12px">${esc(b.group)}${b.open ? ` · ${b.open} open` : ''}</div></div></div><span class="dgo">${ic('chev', 14)}</span></div>
     <div class="row sb" style="margin-top:16px;align-items:flex-end"><div><div class="num dbal">${b.balance != null ? dM(b.balance) : dM(b.pnl, 2)}</div><div class="num ${b.pnl > 0 ? 'up' : b.pnl < 0 ? 'down' : 'mut'}" style="font-size:13px;font-weight:600">${b.balance != null ? (b.pnl >= 0 ? '+' : '') + dM(b.pnl, 2) + (b.start ? ` (${(b.pnl / b.start * 100).toFixed(1)}%)` : '') : 'profit, shared paper account'}</div></div>${spark(b.curve, b.pnl >= 0)}</div>
     <div class="dfoot mut"><span>${b.n} trade${b.n == 1 ? '' : 's'}</span><span>${b.n ? Math.round(b.won / b.n * 100) + '% won' : 'no closed trades'}</span><span>${b.enabled ? 'On' : 'Off'}</span></div></a>`).join('') || '<div class="card empty" style="grid-column:1/-1">Nothing here yet.</div>'}</div>
   ${USER?.admin ? '<div class="card pad" style="margin-top:22px" id=dprefs><h2>What people want</h2><div class=mut style="font-size:13px;margin-top:6px">Answers to the sign-up questions (admins only).</div><div id=dprefsb style="margin-top:10px">' + sk(60) + '</div></div>' : ''}`;
  if (first) { countUp($('#dtot'), tot, v => dM(v)); }
  $$('#dflt button').forEach(b => b.onclick = () => { dashF = b.dataset.v; dashRender(false); });
  if (USER?.admin) dapi('prefsum').then(r => { const el = $('#dprefsb'); if (!el) return; el.innerHTML = r.n ? Object.entries(r.count).map(([q, c]) => { const QQ = OBQ.find(x => x.k == q), tot = Object.values(c).reduce((a, b) => a + b, 0);
    return `<div style="margin-top:14px"><div style="font-weight:600;font-size:14px">${esc(QQ?.q || q)}</div>${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class=dbar><span>${esc(QQ?.o.find(o => o[0] == k)?.[1] || k)}</span><i style="--w:${(v / tot * 100).toFixed(0)}%"></i><b class=num>${v}</b></div>`).join('')}</div>`; }).join('') + `<div class=mut style="font-size:12px;margin-top:12px">${r.n} ${r.n == 1 ? 'person' : 'people'} answered.</div>` : '<div class=mut>No answers yet.</div>'; }).catch(() => {});
}

/* ---------- the sign-up questionnaire ---------- */
const OBQ = [
  { k: 'markets', q: 'What do you want to trade?', sub: 'Pick as many as you like.', multi: 1, o: [['stocks', 'Stocks & ETFs', 'coin'], ['futures', 'Futures (NQ, ES)', 'arrow'], ['crypto', 'Crypto', 'rocket'], ['options', 'Options signals', 'spark'], ['pred', 'Prediction markets', 'scales']] },
  { k: 'style', q: 'How fast do you like to trade?', o: [['intraday', 'Fast: in and out the same day', 'wave'], ['swing', 'Swing: days to weeks', 'arrow'], ['long', 'Slow: a portfolio I check monthly', 'book']] },
  { k: 'risk', q: 'How much risk is OK?', o: [['low', 'Careful: protect the money first', 'lock'], ['mid', 'Balanced', 'scales'], ['high', 'Bold: big swings are fine', 'rocket']] },
  { k: 'exp', q: 'How much have you traded before?', o: [['new', 'I am new', 'star'], ['some', 'A bit', 'spark'], ['pro', 'A lot', 'trophy']] },
  { k: 'goal', q: 'What do you want most from Mimic?', o: [['learn', 'Learn how strategies work', 'flask'], ['steady', 'Steady growth', 'wave'], ['big', 'Hunt for big wins', 'rocket'], ['auto', 'Let bots do it for me', 'bot']] }];
function obPicks(a) { // answers -> recommended bots (route, name, why)
  const m = new Set([].concat(a.markets || [])), out = [], add = (r, n, w) => { if (!out.some(x => x[0] == r)) out.push([r, n, w]); };
  if (a.style == 'long' || a.risk == 'low' || a.goal == 'steady') { add('lab/proven', 'Proven Trend', 'trend following across asset classes, the most-studied rule'); add('lab/macro', 'Macro Regime', 'moves to safety when the economy looks risky'); }
  if (m.has('stocks')) { add('lab/top', 'Top Picks', 'the strongest large-cap stocks each month'); if (a.style != 'long') add('lab/quant', 'Quant RSI-2', 'buys sharp dips in an uptrend'); add('lab/wallst', 'Wall Street', 'copies insiders buying their own stock'); }
  if (m.has('futures')) { add('lab/fib', 'Fibonacci OTE', 'the ICT bot that held up best in testing'); if (a.style == 'intraday') add('powell', 'Powell Strategy', 'one rule-based NQ / ES trade a morning'); }
  if (m.has('options')) { add('lab/putwall', 'Put Wall', 'buys bounces off the biggest put strike'); add('lab/flip', 'Gamma Flip', 'trades the dealer-gamma switch'); }
  if (m.has('crypto')) { add(a.risk == 'high' ? 'meme' : 'lab/cvd', a.risk == 'high' ? 'Meme Radar' : 'Order Flow CVD', a.risk == 'high' ? 'new meme coins with strict safety checks' : 'BTC order flow: absorbed selling and buying'); add('btc', 'BTC Up or Down', 'short-term BTC markets'); }
  if (m.has('pred')) add('edge', 'Edge Lab', 'price gaps in prediction markets');
  if (a.goal == 'learn') add('lab/fvg', 'FVG Bot', 'see fair value gaps drawn live on the chart');
  if (!out.length) add('lab/proven', 'Proven Trend', 'a calm, well-tested place to start');
  return out.slice(0, 5);
}
let OBON = false;
function obCheck() { if (OBON || LS.get('onb', '')) return; dapi('prefs').then(r => { if (!r.answers) onboard(); else LS.set('onb', '1'); }).catch(() => {}); }
function onboard(again) {
  if (OBON) return; OBON = true;
  const st = { i: 0, a: {} }, el = document.createElement('div'); el.className = 'obwrap'; document.body.append(el); document.body.style.overflow = 'hidden';
  const close = () => { OBON = false; el.classList.add('out'); document.body.style.overflow = ''; setTimeout(() => el.remove(), 260); };
  const draw = dir => { const done = st.i >= OBQ.length, q = OBQ[st.i];
    el.innerHTML = `<div class="obbox ${dir || ''}"><div class="row sb"><div class=obdots>${OBQ.map((_, k) => `<i class="${k < st.i ? 'd' : k == st.i ? 'on' : ''}"></i>`).join('')}<i class="${done ? 'on' : ''}"></i></div><button class="btn ic sm" id=obx aria-label="Close">${ic('x', 14)}</button></div>
      ${done ? `<div class=obhead><div class=obemoji>${ic('spark', 26)}</div><h2>Your starting lineup</h2><p class=mut>Based on your answers. They trade a simulated $25,000 each, never real money. Start them here and watch them on the dashboard.</p></div>
        <div class=oblist>${obPicks(st.a).map(([r, n, w], k) => `<label class="obopt pick" style="animation-delay:${k * 70}ms"><input type=checkbox checked value="${r}"><span class=obck></span><span><b>${esc(n)}</b><span class=mut style="display:block;font-size:13px">${esc(w)}${r.startsWith('lab/') ? '' : ' · set it up in its tab'}</span></span></label>`).join('')}</div>
        <div class="row sb" style="margin-top:22px"><button class=btn id=obback>Back</button><button class="btn pri" id=obgo>Start these bots</button></div>`
      : `<div class=obhead><div class=mut style="font-size:13px">Question ${st.i + 1} of ${OBQ.length}</div><h2>${q.q}</h2>${q.sub ? `<p class=mut>${q.sub}</p>` : ''}</div>
        <div class=oblist>${q.o.map(([v, l, icn], k) => { const on = [].concat(st.a[q.k] || []).includes(v); return `<button class="obopt ${on ? 'on' : ''}" data-v="${v}" style="animation-delay:${k * 50}ms"><span class=obic>${ic(icn, 18)}</span><span>${l}</span>${q.multi ? '<span class=obck></span>' : ''}</button>`; }).join('')}</div>
        <div class="row sb" style="margin-top:22px"><button class=btn id=obback ${st.i ? '' : 'style="visibility:hidden"'}>Back</button>${q.multi ? `<button class="btn pri" id=obnext ${(st.a[q.k] || []).length ? '' : 'disabled'}>Next</button>` : '<span></span>'}</div>`}</div>`;
    $('#obx', el).onclick = () => { LS.set('onb', '1'); if (Object.keys(st.a).length) dapi('prefs', { answers: st.a }).catch(() => {}); close(); };
    const back = $('#obback', el); if (back) back.onclick = () => { st.i = Math.max(0, st.i - 1); draw('back'); };
    if (!done) { $$('.obopt', el).forEach(b => b.onclick = () => { const v = b.dataset.v; if (q.multi) { const s = new Set(st.a[q.k] || []); s.has(v) ? s.delete(v) : s.add(v); st.a[q.k] = [...s]; b.classList.toggle('on'); $('#obnext', el).disabled = !s.size; } else { st.a[q.k] = v; b.classList.add('on'); setTimeout(() => { st.i++; draw('fwd'); }, 180); } });
      const nx = $('#obnext', el); if (nx) nx.onclick = () => { st.i++; draw('fwd'); }; }
    else $('#obgo', el).onclick = async () => { const go = $('#obgo', el); go.disabled = true; go.textContent = 'Starting…'; LS.set('onb', '1'); await dapi('prefs', { answers: st.a }).catch(() => {});
      for (const c of $$('.oblist input:checked', el)) { const r = c.value; if (r.startsWith('lab/')) await dapi('start', { id: r.slice(4) }).catch(() => {}); }
      close(); toast('Bots started in paper mode'); if (location.hash == '#/dash') dashPage(); else location.hash = '#/dash'; };
  };
  draw('fwd');
}
