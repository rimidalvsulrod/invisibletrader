// Luminous ribbon background (WebGL2): sharp hairpin behind the Overview header, soft ambient light everywhere else.
// Dark theme: glowing light. Light theme: the same ribbon drawn as dark green "ink" (the engine's output is premultiplied,
// so dark colours darken the white page instead of vanishing). One engine, one rAF loop.
import { createRibbons, supported, paletteFromAccent, AMBIENT } from '/ribbon-engine.js';
const app = document.getElementById('app'), root = document.documentElement;
let fx = null, amb = null, hero = null, ambCanvas = null, heroCanvas = null, ambKey = '', theme = '', t = 0;
const ink = () => { const p = paletteFromAccent('#14845a'), k = .32, d = c => c.map(v => v * k); return { ...p, main: p.main.map(d), cool: p.cool.map(d), haze: d(p.haze), coreHot: d(p.coreHot), core: d(p.core), glitter: d(p.glitter), bokeh: d(p.bokeh), dust: d(p.dust) }; };

function teardown() {
  hero?.destroy(); amb?.destroy(); hero = amb = null;
  if (heroCanvas?.isConnected) heroCanvas.replaceWith(heroCanvas.cloneNode()); // a destroyed canvas keeps its lost GL context
  heroCanvas = null;
  ambCanvas?.remove(); ambCanvas = null; ambKey = ''; fx?.destroy(); fx = null;
}
function mount() {
  if (!supported()) { root.classList.add('ribbon-nogl'); return; }
  const dark = root.dataset.theme !== 'light';
  if (theme !== root.dataset.theme) { teardown(); theme = root.dataset.theme; }
  fx ||= dark ? createRibbons({ accent: '#3fbf86' }) : createRibbons({ palette: ink() });
  const hc = app.querySelector('canvas[data-ribbon="hero"]');
  if (hc !== heroCanvas) { hero?.destroy(); hero = null; heroCanvas = hc; if (hc) hero = fx.hero(hc, { alpha: dark ? .55 : .5, fade: [0, 120], heightFrom: hc.parentElement }); }
  // pages re-render on their own polls: only rebuild the ambient when the page itself changes
  const key = location.hash.split('/')[1] || 'home';
  if (key === ambKey) return fx.refresh();
  ambKey = key;
  // the ambient canvas loses its GL context on destroy, so each page gets a fresh one
  amb?.destroy(); ambCanvas?.remove();
  ambCanvas = document.createElement('canvas'); ambCanvas.className = 'fxamb'; ambCanvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(ambCanvas);
  amb = fx.ambient(ambCanvas, { selector: '#app > *, #fxstops i', opacity: dark ? .75 : .6, hideUntil: hc ? hc.parentElement : undefined,
    shapes: hc ? {} : { off: { p: AMBIENT.edgeRightFaint.p, o: .5 } } });
}
// scroll checkpoints every 750px: the soft light keeps reshaping as you scroll, even down one long table
const stops = document.createElement('div'); stops.id = 'fxstops'; stops.setAttribute('aria-hidden', 'true');
stops.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="top:${700 + i * 750}px"></i>`).join('');
app.parentElement.append(stops);
const later = () => { clearTimeout(t); t = setTimeout(mount, 60); };
new MutationObserver(later).observe(app, { childList: true });                       // a new page was rendered
new MutationObserver(later).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
mount();
