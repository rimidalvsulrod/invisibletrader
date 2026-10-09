// Edge Lab tab: three mechanical paper strategies (ladder gaps, one-winner set gaps, underdogs), the live gap scanner, trades.
let edgeT = null, edgeS = null;
const edgeStop = () => { clearInterval(edgeT); edgeT = null; };
const eapi = async (op, body) => {
  const r = await fetch('/api/edge' + (body ? '' : '?op=' + op), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' })); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
};
const eDur = ms => ms < 12e4 ? Math.round(ms / 1e3) + 's' : ms < 72e5 ? Math.round(ms / 6e4) + 'm' : (ms / 36e5).toFixed(1) + 'h';
const EN = { ladder: 'Ladder gaps', set: 'Set gaps', dog: 'Underdogs' };
async function edgePage() {
  edgeStop();
  if (!OWNER) { const me = await fetch('/api/auth?op=me').then(r => r.json()).catch(() => ({})); if (me.setup) SETUP = me.setup; if (!me.user) return authView('login', '', edgePage); await signedIn(me.user); }
  app.innerHTML = sk(320);
  try { edgeS = await eapi('state'); } catch (e) { if (e.status === 401) return authView('login', '', edgePage); app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  edgeRender(); let n = 0;
  edgeT = setInterval(async () => { if (!$('#escan')) return edgeStop(); try { if (++n % 4 === 0) { edgeS = await eapi('state'); edgeRender(); } else { edgeS.live = (await eapi('live')).live; edgeScan(); } } catch (e) {} }, 4000);
}
function edgeScan() {
  const el = $('#escan'), L = edgeS.live; if (!el) return;
  if (!L) { el.innerHTML = `<div class=empty>Waiting for the 24/7 runner to scan the exchange…</div>`; return; }
  el.innerHTML = `<div class=mut style="font-size:12.5px;padding:0 20px 10px">Scanned ${Math.round((Date.now() - L.scanned) / 1e3)}s ago · ${(L.stats?.markets || 0).toLocaleString()} markets in ${(L.stats?.events || 0).toLocaleString()} events · ${L.stats?.ladders || 0} ladders checked · ${L.dogs} underdog candidates${L.err ? ` · <span class=down>${esc(L.err)}</span>` : ''}</div>` +
    `<table class=tbl><tbody>${L.gaps.map(g => `<tr><td style="width:1%"><span class="pill ${g.kind == 'ladder' ? 'ac' : 'up'}">${g.kind == 'ladder' ? 'Ladder' : 'Set'}</span></td><td><div>${esc(g.label)}</div><div class=mut style="font-size:12.5px">open for ${eDur(g.age)}</div></td><td class=r><div class="num up">+${(g.edge * 100).toFixed(1)}¢</div><div class=mut style="font-size:12px">per $1 set</div></td></tr>`).join('') || '<tr><td class=empty>No gaps right now. That is normal: most of the time the exchange is consistent.</td></tr>'}</tbody></table>` +
    (L.hist.length ? `<div class=mut style="font-size:12.5px;padding:12px 20px 4px">Gaps that closed (how long they lasted)</div><table class=tbl><tbody>${L.hist.map(h => `<tr><td>${esc(h.label)}</td><td class=r><span class=mut>${h.kind == 'ladder' ? 'ladder' : 'set'} · +${(h.edge * 100).toFixed(1)}¢ · lasted ${eDur(h.lasted)}</span></td></tr>`).join('')}</tbody></table>` : '');
}
function edgeRender() {
  const s = edgeS, c = s.cfg, A = s.paper, st = s.stats, opens = s.trades.filter(t => t.status == 'open'), openC = opens.reduce((n, t) => n + t.cost, 0), val = A.balance + openC, ret = (val - A.start) / A.start;
  const pnl = Object.values(st).reduce((n, x) => n + x.pnl, 0), won = Object.values(st).reduce((n, x) => n + x.won, 0), lost = Object.values(st).reduce((n, x) => n + x.lost, 0);
  const card = (k, t, d) => `<div class="card pad"><div class="row sb"><h3>${t}</h3><span class="pill n">${st[k].nopen} open</span></div><p class=mut style="font-size:12.5px;line-height:1.55;margin:8px 0 12px">${d}</p>
    <div class=row style="gap:18px"><div><div class="num ${ud(st[k].pnl)}" style="font-size:20px;font-weight:650">${sg(st[k].pnl, 2)}</div><div class=mut style="font-size:12px">${st[k].won} won · ${st[k].lost} lost</div></div></div></div>`;
  const row = t => `<tr><td style="width:1%"><span class="pill ${t.status == 'open' ? 'ac' : t.pnl > 0 ? 'up' : 'down'}">${t.status == 'open' ? 'Open' : t.pnl > 0 ? 'Won' : 'Lost'}</span></td>
    <td><div style="font-weight:550">${EN[t.strat]} <span class=mut style="font-weight:400">· ${t.qty} × ${t.legs.length == 1 ? '1 leg' : t.legs.length + ' legs'} · paper</span></div><div class=mut style="font-size:12.5px;margin-top:2px">${esc(t.label)}</div>
      <div class=mut style="font-size:12px;margin-top:2px">${t.legs.map(l => `${l.side.toUpperCase()} ${Math.round(l.px * 100)}¢`).join(' + ')} = ${usd(t.cost, 2)}${t.strat != 'dog' && t.legs.length < (t.strat == 'ladder' ? 2 : 3) ? ' · <span class=down>second leg moved: unhedged</span>' : ''}</div></td>
    <td class=r><div class="num ${t.pnl == null ? 'mut' : ud(t.pnl)}" style="font-weight:600">${t.pnl == null ? '…' : sg(t.pnl, 2)}</div><div class=mut style="font-size:12px">${rel(t.ts / 1000)}</div></td></tr>`;
  app.innerHTML = `<div class="ph fade"><div><h1>Edge Lab</h1><p class=lead>Three mechanical strategies tested on Polymarket US with paper money. Two hunt prices that can't both be right (a guaranteed payout costs less than it pays); one tests whether cheap underdogs are underpriced. The scanner shows how often gaps really appear and how long they last.</p></div></div>
    <div class="card pad"><div class="row sb wrapf" style="gap:16px"><div class=row style="gap:16px"><button class="sw ${s.enabled ? 'on' : ''}" id=etog aria-label="Edge Lab on/off"></button>
      <div><div style="font-size:22px;font-weight:650">${s.enabled ? '<span class=up>Running</span>' : 'Paused'}</div><div class=mut style="font-size:13px">Paper account: simulated money, real order books</div></div></div></div>
      <div class="grid g3" style="margin-top:20px"><div class=stat><div class=k>Portfolio value</div><div class="v num">${usd(val, 2)}</div><div class=s>cash ${usd(A.balance, 2)}${opens.length ? ` · open at cost ${usd(openC, 2)}` : ''} · <span class="${ud(ret)}">${ret >= 0 ? '+' : ''}${(ret * 100).toFixed(1)}%</span></div></div>
        <div class=stat><div class=k>Win rate</div><div class="v num">${won + lost ? Math.round(won / (won + lost) * 100) + '%' : '-'}</div><div class=s>${won} won · ${lost} lost${opens.length ? ` · ${opens.length} open` : ''}</div></div>
        <div class=stat><div class=k>Closed profit</div><div class="v num ${ud(pnl)}">${sg(pnl, 2)}</div><div class=s>after Polymarket US fees</div></div></div></div>
    <div class="grid g3" style="margin-top:16px">
      ${card('ladder', 'Ladder gaps', 'Alternate lines must be monotone: "29+ saves" cannot be likelier than "23+". When it is, buy NO on the harder line and YES on the easier one: it costs under $1 and always pays at least $1.')}
      ${card('set', 'Set gaps', 'One-winner sets (division, league, election) whose YES prices add up to under $1 after fees. Buy every outcome; exactly one pays $1. Only sets whose exchange reference prices add to exactly 1 qualify.')}
      ${card('dog', 'Underdogs', 'A forward test, not a proven edge: pre-game sides priced 6-20¢ on winner, spread and total markets. Global history suggested they win more than their price. About 15% win, so expect long losing streaks.')}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card pad"><h2>Trade size</h2><p class=mut style="font-size:13px;margin:6px 0 12px">Percent of the paper account per trade.</p>
        <div class="grid" style="gap:10px">${[['ladder', 'Ladder gaps', 25], ['set', 'Set gaps', 25], ['dog', 'Underdogs', 5]].map(([k, l, mx]) => `<label class="row sb"><span>${l}</span><span class=row style="gap:6px"><input class=inp type=number data-k=${k} min=.1 max=${mx} step=.1 value=${c[k]} style="width:90px"><b>%</b></span></label>`).join('')}</div>
        <div class=mut style="font-size:12.5px;margin-top:10px">Built in: gaps need 1.5¢ or more after fees (sets 2¢), a position is at most 10% of the shares showing, and legs fill one after another with a fresh price check: if the price runs away the first leg stays unhedged, like in real trading.</div></div>
      <div class="card pad"><h2>Paper account</h2><p class=mut style="font-size:13px;margin:6px 0 12px">Start over with a fresh simulated balance. All Edge Lab trades are cleared.</p>
        <div class=row style="gap:8px"><input class=inp type=number id=eamt value=${Math.round(A.start)} min=10 style="max-width:140px"><button class=btn id=ereset>Reset paper account</button></div></div></div>
    <div class=grid style="margin-top:16px"><div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:4px"><h2>Gap scanner</h2></div><div id=escan></div></div></div>
    <div class=grid style="margin-top:16px"><div class=card style="overflow:hidden"><div class="pad" style="padding-bottom:8px"><h2>Positions and trades</h2></div><table class=tbl><tbody>${s.trades.map(row).join('') || `<tr><td class=empty>No trades yet. Gaps are rare and underdogs only open pre-game, so give it a few hours.</td></tr>`}</tbody></table></div></div>`;
  edgeScan();
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(`<span class=down>${esc(e.message)}</span>`); } edgeS = await eapi('state').catch(() => edgeS); edgeRender(); };
  $('#etog').onclick = () => act(() => eapi(s.enabled ? 'stop' : 'start', {}), s.enabled ? 'Edge Lab paused' : 'Edge Lab started');
  $$('input[data-k]').forEach(i => i.onchange = () => act(() => eapi('cfg', { cfg: { [i.dataset.k]: +i.value } }), 'Saved'));
  $('#ereset').onclick = () => confirm('Reset the paper account? All Edge Lab trades will be cleared.') && act(() => eapi('reset', { amount: +$('#eamt').value }), 'Paper account reset');
}
