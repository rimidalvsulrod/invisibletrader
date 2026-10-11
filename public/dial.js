// The risk dial: the same knob as the Polymarket Auto Trader's trade-size dial, reusable for every percentage setting.
// Locked by default (a latch under it) so a stray touch cannot change your risk; it relocks 12 seconds after you let go.
//   dialMount('#host', { key, value, min, max, step, unit, fmt, caption(v), onCommit(v), size: 'sm' })
const DIALS = {}; // key -> { open, timer }: stays unlocked across re-renders until it times out
function dialMount(host, o) {
  const el = typeof host == 'string' ? $(host) : host; if (!el) return;
  const min = o.min ?? 1, max = o.max ?? 100, step = o.step ?? 1, dec = (String(step).split('.')[1] || '').length, fmt = o.fmt || (x => x.toFixed(dec)), st = DIALS[o.key] ||= { open: false };
  const clamp = x => Math.max(min, Math.min(max, Math.round((x - min) / step) * step + min)), tidy = x => +x.toFixed(dec);
  let v = clamp(+o.value), saved = v, t;
  el.innerHTML = `<div class="dialbox ${o.size == 'sm' ? 'sm' : ''} ${st.open ? '' : 'locked'}"><div class=dialtop><button class=kbtn data-d=-1 aria-label=Less>−</button><div class=dialval><b class=num data-v>${fmt(v)}</b><span>${o.unit || ''}</span></div><button class=kbtn data-d=1 aria-label=More>+</button></div>
    <div class=dial role=slider aria-label="${o.unit || 'value'}" aria-valuemin=${min} aria-valuemax=${max} aria-valuenow=${v} tabindex=0><svg viewBox="0 0 224 224"></svg><div class=face><i></i></div></div>
    <div class=latchrow><span class=latchlbl style="text-align:right" data-ll>${st.open ? 'Unlocked' : 'Locked'}</span><button class="latch ${st.open ? 'open' : ''}" data-latch aria-label="Lock or unlock the dial"><i>${ic(st.open ? 'unlock' : 'lock', 15)}</i></button><span class=latchlbl></span></div>
    <div class="dialcap num" data-cap></div></div>`;
  const q = s => el.querySelector(s), box = q('.dialbox'), dial = q('.dial'), frac = () => (v - min) / (max - min);
  const ticks = () => { let h = ''; for (let k = 0; k <= 50; k++) { const a = (-135 + k * 270 / 50) * Math.PI / 180, on = k / 50 <= frac() + 1e-9, r1 = 104, r2 = k % 5 ? 96 : 92;
      h += `<line x1="${112 + r1 * Math.sin(a)}" y1="${112 - r1 * Math.cos(a)}" x2="${112 + r2 * Math.sin(a)}" y2="${112 - r2 * Math.cos(a)}" style="stroke:${on ? 'var(--ac)' : 'var(--mut2)'};opacity:${on ? 1 : .45}" stroke-width="${k % 5 ? 1.6 : 2.4}" stroke-linecap="round"/>`; } return h; };
  const paint = () => { q('[data-v]').textContent = fmt(v); q('.face').style.transform = `rotate(${-135 + frac() * 270}deg)`; q('svg').innerHTML = ticks(); dial.setAttribute('aria-valuenow', v); if (o.caption) q('[data-cap]').textContent = o.caption(v) || ''; };
  const setLock = open => { st.open = open; box.classList.toggle('locked', !open); q('[data-latch]').classList.toggle('open', open); q('[data-latch] i').innerHTML = ic(open ? 'unlock' : 'lock', 15); q('[data-ll]').textContent = open ? 'Unlocked' : 'Locked'; };
  const relockSoon = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { if (el.isConnected) setLock(false); else st.open = false; }, 12000); };
  const commit = () => { relockSoon(); clearTimeout(t); t = setTimeout(() => { if (v !== saved) { saved = v; o.onCommit && o.onCommit(tidy(v)); } }, 500); };
  const setV = (x, haptic) => { const n = clamp(x); if (n !== v) { v = n; paint(); if (haptic && navigator.vibrate) navigator.vibrate(3); } };
  const fromPoint = e => { const r = dial.getBoundingClientRect(); let a = Math.atan2(e.clientX - r.left - r.width / 2, -(e.clientY - r.top - r.height / 2)) * 180 / Math.PI; a = Math.max(-135, Math.min(135, a)); setV(min + (a + 135) / 270 * (max - min), 1); };
  q('[data-latch]').onclick = () => { setLock(!st.open); if (st.open) relockSoon(); };
  dial.onpointerdown = e => { if (!st.open) return toast('Unlock the dial first'); dial.setPointerCapture(e.pointerId); fromPoint(e); dial.onpointermove = fromPoint; };
  dial.onpointerup = dial.onpointercancel = () => { dial.onpointermove = null; commit(); };
  dial.onkeydown = e => { if (!st.open) return; const d = ['ArrowUp', 'ArrowRight'].includes(e.key) ? 1 : ['ArrowDown', 'ArrowLeft'].includes(e.key) ? -1 : 0; if (d) { setV(v + d * step); commit(); e.preventDefault(); } };
  el.querySelectorAll('.kbtn').forEach(b => b.onclick = () => { if (!st.open) return toast('Unlock the dial first'); setV(v + +b.dataset.d * step); commit(); });
  if (st.open) relockSoon(); paint();
}
