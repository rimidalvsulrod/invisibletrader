// Run a bot on the live chart: pick one of your bots and its own entries and exits are taken in your paper account as they happen,
// drawn on the chart with long / short boxes, fill arrows, notifications and the position tag. It runs while the terminal is open.
// The signals are the bot's real ones (the same /botsig the Bots indicators use); trades go through the normal order API to the Mimic paper account only.
let BR = null;
const brDir = m => (m.dir === 1 || m.dir === 'long') ? 'long' : 'short';
const brLast = () => trData?.B?.[trData.B.length - 1];
const brPos = () => trState?.me?.positions?.find(x => x.sym == BR?.sym);
const brShort = s => String(s || '').replace('-USD', '').replace('=F', '');
function botRunToggle() { BR ? botRunStop(true) : botRunPicker(); }
async function botRunPicker() {
  if (TR.rp || TR.rpPick) return toast('Leave the replay first: a bot runs on the live chart');
  await trBotReg(); const sym = trData?.sym || TR.sym, all = Object.entries(IND).filter(([, d]) => d.bot).map(([k, d]) => ({ k, ...d })), ok = all.filter(b => !b.syms || b.syms.includes(sym)), no = all.length - ok.length, last = LS.get('mt:botrun', {});
  const qty = last.qty || (trFut() ? 1 : trCrypto() ? 0.01 : 10), unit = trFut() ? 'contracts' : trCrypto() ? 'coins' : 'shares';
  const w = trDlg('Run a bot on this chart', ok.length ? `<div class=brauto><button type=button class="btn sm" id=brauto>Auto choose</button><span class=brd>Picks the bot with the best recent record on this ticker, in markets like today's.</span></div><div id=braum class=braum hidden></div><div class=brlist>${ok.map((b, i) => `<label class=brrow><input type=radio name=brk value="${esc(b.k)}" ${(last.k ? last.k == b.k : !i) ? 'checked' : ''}><span class=brdot style="background:${b.col}"></span><div><b>${esc(b.n)}</b><div class=brd>${esc(b.d)}</div></div></label>`).join('')}</div>
     <label class=brsz>Size <input id=brqty class=trdq type=number min=0 step=any value="${qty}" style="width:110px;margin:0 8px"> ${unit} per trade</label>
     <div class=trdsub>${no} more bot${no == 1 ? '' : 's'} trade other symbols. Trades go to your Mimic paper account only. A position the bot opens stays open if you stop it.</div>` : `<div class=trdsub>None of your bots trade ${esc(brShort(sym))}. Open a symbol they work on (NQ, ES, SPY, BTC ...) and try again.</div>`,
    ok.length ? 'Start' : 'Close', async d => { if (!ok.length) return; const k = d.querySelector('input[name=brk]:checked')?.value, q = +d.querySelector('#brqty').value; if (!k) throw new Error('Pick a bot'); if (!(q > 0)) throw new Error('Enter a size'); botRunStart(k, q); });
  const ab = w.querySelector('#brauto'); if (ab) ab.onclick = () => botAuto(w, sym, ab);
}
// Auto choose: the server ranks the bots on this symbol by their record over the last 40 sessions, half of it from sessions that began like today (api/_lib/botauto.js)
async function botAuto(w, sym, btn) { const out = w.querySelector('#braum'); btn.disabled = true; btn.textContent = 'Checking…';
  try { const r = await mtapi('botauto', null, `&sym=${encodeURIComponent(sym)}`), top = r.ranked.filter(x => x.ok).slice(0, 4), row = r.pick && [...w.querySelectorAll('input[name=brk]')].find(i => i.value == r.pick);
    if (row) { row.checked = true; row.closest('.brrow').scrollIntoView({ block: 'nearest' }); }
    out.hidden = false; out.className = 'braum' + (r.weak || !r.pick ? ' weak' : '');
    out.innerHTML = `${r.state ? `<div>Market: ${esc(r.state.text)}${r.open ? '' : ' (closed now: this is for the next session)'}.</div>` : ''}<div><b>${esc(r.note)}</b></div>`
      + (top.length ? `<div class=brd>${top.map(x => `${esc(x.name)} ${x.score >= 0 ? '+' : ''}${x.score.toFixed(2)}R/session (${x.n} trades)`).join(' · ')}. Past results do not promise future ones.</div>` : '');
    if (r.pick && !row) out.insertAdjacentHTML('beforeend', '<div class=brd>That bot is not in the list below.</div>'); }
  catch (e) { out.hidden = false; out.className = 'braum weak'; out.textContent = e.message; }
  btn.disabled = false; btn.textContent = 'Auto choose'; }
function botRunStart(k, qty) {
  botRunStop(false); BR = { k, name: IND[k].n, sym: trData.sym, qty, seen: new Set(), init: false, draws: [], box: null, msg: 'starting', t0: Date.now(), busy: false, tk: 0 };
  LS.set('mt:botrun', { k, qty }); $('#trbotb')?.classList.add('on'); botHud(); brRunPoll(); BR.iv = setInterval(brRunPoll, 10000); toast(`${IND[k].n} is running on ${brShort(BR.sym)}`);
}
function botRunStop(say) { const B = BR; if (!B) return; clearInterval(B.iv); BR = null; $('#brhud')?.remove(); $('#trbotb')?.classList.remove('on');
  try { if (trChart && trData) trChart.setDrawings(trDrawGet(trData.sym)); } catch (e) {} if (say) toast('Bot stopped. An open position stays open: close it from Positions or the chart tag.'); }
async function brRunPoll() { const B = BR; if (!B || B.busy) return; if (!$('#trc')) return botRunStop(false);
  if (trData?.sym !== B.sym) { B.msg = `paused: the bot is on ${brShort(B.sym)}`; return botHud(); } if (TR.rp) { B.msg = 'paused: replay'; return botHud(); }
  B.busy = true;
  try { const r = await mtapi('botsig', null, `&k=${B.k}&sym=${encodeURIComponent(B.sym)}`); if (BR !== B) return;
    if (r.off) { B.msg = r.status || 'this bot does not trade this symbol'; return; }
    const lv = r.levels || [], stop = lv.find(l => l.name == 'stop')?.p, target = lv.find(l => l.name == 'target')?.p, mk = (r.marks || []).filter(m => m.type == 'entry' || m.type == 'exit').sort((a, b) => a.t - b.t);
    for (const m of mk) { const key = `${m.t}|${m.type}|${m.dir}`; if (B.seen.has(key)) continue; B.seen.add(key); if (!B.init || m.t < B.t0 - 90000) continue; await botAct(m, stop, target); if (BR !== B) return; } // the first poll only learns what already happened
    B.init = true; B.msg = r.status ? String(r.status).slice(0, 90) : 'watching'; }
  catch (e) { B.msg = e.message; } finally { B.busy = false; botHud(); } }
async function botAct(m, stop, target) { const B = BR, dir = brDir(m), p = brPos(), same = p && (p.qty > 0) == (dir == 'long');
  if (m.type == 'exit') { if (same) await botClose('Bot exit'); return; }
  if (same) return; if (p) await botClose('Reversing');
  const last = brLast().c, up = dir == 'long', side = up ? 'buy' : 'sell'; let sl = stop, tp = target;
  if (sl != null && !(up ? sl < last : sl > last)) sl = null; if (tp != null && !(up ? tp > last : tp < last)) tp = null;
  try { await mtapi('order', { sym: B.sym, side, kind: 'market', qty: B.qty, sl: sl || undefined, tp: tp || undefined }); } catch (e) { B.msg = e.message; return toast(esc(e.message)); }
  await trStateLoad(); const q = brPos(), px = q ? q.avg : last, n = q ? Math.abs(q.qty) : B.qty; botOpenBox(dir, px, sl, tp, n); botNote(side, n, px, 'Market'); }
async function botClose(why) { const B = BR; try { await mtapi('close', { sym: B.sym }); } catch (e) { return toast(esc(e.message)); } await trStateLoad(); botFinish(why); }
function botFinish(why) { const B = BR; if (!B) return; const f = trState?.fills?.find(x => x.acct == 'me' && x.sym == B.sym && x.pnl), net = f ? f.pnl - (f.fee || 0) : 0;
  if (B.box) { B.box.done = true; B.box.live = false; B.box.cur = f ? f.px : brLast().c; B.box.pnl = net; B.box = null; }
  if (f) botNote(f.side, f.qty, f.px, why || (/take/.test(f.why) ? 'Take profit' : /stop/.test(f.why) ? 'Stop loss' : 'Market'), net); botDrawSync(); }
function botOpenBox(dir, px, sl, tp, qty) { const B = BR, L = brLast(), bs = TFSEC[TR.tf] || 60, up = dir == 'long', risk = sl != null ? Math.abs(px - sl) : px * .002;
  B.box = { id: 'botb' + Date.now().toString(36), k: dir, t1: L.t, p1: px, t2: L.t + bs * 20, p2: tp ?? px + (up ? 1 : -1) * risk * 2, sl: sl ?? px + (up ? -1 : 1) * risk, qty, live: true, cur: px, tc: L.t, pnl: 0 }; B.draws.push(B.box); botDrawSync(); }
function botDrawSync() { const B = BR; if (!B || !trChart || trData?.sym !== B.sym) return; try { trChart.setDrawings([...trDrawGet(B.sym), ...B.draws]); } catch (e) {} }
// called with every price update: the live box follows the price and P&L; a stop or target hit on the server closes it
window.botOnTick = () => { const B = BR; if (!B || !B.box) return; const now = performance.now(); if (now - B.tk < 300) return; B.tk = now; const L = brLast(), p = brPos(), b = B.box;
  if (!p && trState) return botFinish(); // its stop or target closed the position on the server
  if (p) { const m = trData.spec?.mult || 1; b.cur = L.c; b.tc = L.t; b.pnl = (L.c - p.avg) * p.qty * m; if (L.t > b.t2 - (TFSEC[TR.tf] || 60) * 3) b.t2 = L.t + (TFSEC[TR.tf] || 60) * 10; botDrawSync(); botHud(); } };
window.botDrawSync = botDrawSync;
// a fill: an arrow on the chart and an "order executed" notification with a close button that works
function botNote(side, qty, px, kind, pnl) { const B = BR; if (B) { B.draws.push({ id: 'botx' + Math.random().toString(36).slice(2, 8), k: 'exec', side, t1: brLast().t, p1: px, text: `${side == 'buy' ? 'Buy' : 'Sell'} ${qty}` }); botDrawSync(); }
  let box = $('#lpnotes'); if (!box) { box = document.createElement('div'); box.id = 'lpnotes'; document.body.append(box); }
  const n = document.createElement('div'); n.className = 'lpnote'; n.innerHTML = `<i class="${side}">${side == 'buy' ? '▲' : '▼'}</i><div><b>${esc(kind)} order executed</b><span>${side == 'buy' ? 'Buy' : 'Sell'} ${qty} ${esc(brShort(trData?.sym))} @ ${trN(px)}${pnl != null ? ` · <em class=${pnl >= 0 ? 'up' : 'down'}>${pnl >= 0 ? '+' : ''}${trM(pnl)}</em>` : ''}</span></div><button class=lpnx type=button aria-label="Close notification">×</button>`;
  const gone = () => { if (!n.isConnected || n.classList.contains('out')) return; n.classList.add('out'); setTimeout(() => n.remove(), 200); }; n.querySelector('.lpnx').addEventListener('click', e => { e.stopPropagation(); gone(); });
  while (box.children.length >= 3) box.lastElementChild.remove(); box.prepend(n); setTimeout(gone, 2200); }
function botHud() { const B = BR; if (!B) return; let el = $('#brhud'); if (!el) { el = document.createElement('div'); el.id = 'brhud'; document.body.append(el); }
  const p = brPos(), u = p ? (p.upnl ?? 0) : 0;
  el.innerHTML = `<i class=on></i><b>${esc(B.name)}</b><span>${esc(brShort(B.sym))}</span><span>Paper · size ${B.qty}</span>${B.box && p ? `<span class="num ${B.box.pnl >= 0 ? 'up' : 'down'}">${p.qty > 0 ? 'long' : 'short'} ${B.box.pnl >= 0 ? '+' : ''}${trM(B.box.pnl)}</span>` : ''}<span class=mut>${esc(B.msg || '')}</span><button id=brx type=button>Stop</button>`; void u;
  el.querySelector('#brx').onclick = () => botRunStop(true); }
