// Backtest card shared by every bot tab: choose how far back, press the button, see the result. Each tab passes what to run and how far back it can go.
//   btCard(id, { title, label, opts: [[value, label], ...], def, note, initial })  -> html      btWire(id, { run: async value => html })  -> wires the button
const BTS = {}; // what each card last showed, so a tab that redraws itself keeps the choice and the result
const btCard = (id, o) => { const st = BTS[id] || {}, def = st.sel ?? o.def, ini = st.html ?? o.initial; return `<div class="card pad" style="margin-top:16px" id=${id}><div class="row sb wrapf" style="gap:12px"><h2>${o.title || 'Backtest'}</h2><div class=row style="gap:8px;flex-wrap:wrap"><span class=mut style="font-size:13px">${o.label || 'How far back'}</span>
  <select class=inp id=${id}-sel style="width:auto">${o.opts.map(([v, l]) => `<option value="${v}" ${String(v) == String(def) ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn pri" id=${id}-go>Run backtest</button></div></div>
  ${o.note ? `<div class=mut style="font-size:12.5px;line-height:1.55;margin:8px 0 0">${o.note}</div>` : ''}<div id=${id}-out style="margin-top:14px">${ini || '<div class=mut style="font-size:13px">Pick how far back to test and press Run backtest.</div>'}</div></div>`; };
function btWire(id, o) {
  const go = $('#' + id + '-go'), out = $('#' + id + '-out'), sel = $('#' + id + '-sel'); if (!go) return; let seq = 0;
  sel.onchange = () => { (BTS[id] ||= {}).sel = sel.value; };
  go.onclick = async () => { const my = ++seq; (BTS[id] ||= {}).sel = sel.value; go.disabled = true; go.textContent = 'Running…'; out.innerHTML = `<div class=mut style="padding:12px 0;font-size:13px">Running the backtest…</div>`;
    try { const h = await o.run(sel.value); if (my === seq) { BTS[id].html = h; if ($('#' + id)) out.innerHTML = h; } } catch (e) { if (my === seq && $('#' + id)) out.innerHTML = `<div class=note style="font-size:13px">${esc(e.message || 'The backtest failed')}</div>`; }
    finally { const g = $('#' + id + '-go'); if (g) { g.disabled = false; g.textContent = 'Run backtest'; } } };
}
// result building blocks
const btNum = (x, d = 2) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const btPct = (x, d = 1) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const btUsd = x => (x >= 0 ? '+' : '-') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const btTiles = items => `<div class="grid g3">${items.map(([k, v, s, cls]) => `<div class=stat><div class=k>${k}</div><div class="v num ${cls || ''}">${v}</div><div class=s>${s || ''}</div></div>`).join('')}</div>`;
const btWarn = html => `<div class=note style="margin-top:12px;font-size:12.5px;line-height:1.55">${html}</div>`;
const btRows = rows => rows.length ? `<table class=tbl style="margin-top:12px"><tbody>${rows.map(r => `<tr><td style="width:1%"><span class="pill ${r.good ? 'up' : r.bad ? 'down' : 'n'}">${r.tag}</span></td><td><div>${r.title}</div><div class=mut style="font-size:12.5px">${r.sub || ''}</div></td><td class=r><div class="num ${r.good ? 'up' : r.bad ? 'down' : ''}" style="font-weight:600">${r.right || ''}</div><div class=mut style="font-size:12px">${r.right2 || ''}</div></td></tr>`).join('')}</tbody></table>` : '';
const btSample = n => n < 30 ? btWarn(`<b>${n === 0 ? 'No trades' : `Only ${n} trade${n == 1 ? '' : 's'}`}.</b> That is too few to tell luck from skill, so treat this as a hint at best, not proof.`) : '';
// the live record of a bot's own trades over the chosen period (for bots whose history free data cannot replay)
function btForward(trades, days) {
  const cut = Date.now() - days * 864e5, ts = t => { const x = Number(t.ts); return x > 1e12 ? x : x * 1000; }, done = (trades || []).filter(t => ts(t) >= cut && t.pnl != null && t.status != 'open' && t.status != 'skip');
  const won = done.filter(t => t.pnl > 0), lost = done.filter(t => t.pnl <= 0), sum = done.reduce((n, t) => n + t.pnl, 0);
  return { n: done.length, won: won.length, lost: lost.length, pnl: sum, avg: done.length ? sum / done.length : 0, best: done.length ? Math.max(...done.map(t => t.pnl)) : 0, worst: done.length ? Math.min(...done.map(t => t.pnl)) : 0 };
}
const btForwardHtml = (trades, days, extra) => { const f = btForward(trades, days);
  return btTiles([['Closed trades', f.n, `${f.won} won · ${f.lost} lost`], ['Profit', btUsd(f.pnl), f.n ? `${btUsd(f.avg)} a trade` : 'no closed trades in this period', f.pnl >= 0 ? 'up' : 'down'], ['Win rate', f.n ? Math.round(f.won / f.n * 100) + '%' : '-', f.n ? `best ${btUsd(f.best)} · worst ${btUsd(f.worst)}` : '']]) + btSample(f.n) + (extra || ''); };
