// Luminous ribbon background (WebGL2): sharp hairpin behind the Overview header, soft ambient light everywhere else.
// Dark theme: glowing light. Light theme: the same ribbon drawn as dark green "ink" (the engine's output is premultiplied,
// so dark colours darken the white page instead of vanishing). One engine, one rAF loop.
import { createRibbons, supported, paletteFromAccent, AMBIENT } from '/ribbon-engine.js';
const app = document.getElementById('app'), root = document.documentElement;
let fx = null, amb = null, hero = null, ambCanvas = null, heroCanvas = null, ambKey = '', theme = '', t = 0;
// the user's accent (Settings): dark theme glows in it, light theme draws it as ink
const accent = () => getComputedStyle(root).getPropertyValue('--accent').trim() || '#3fbf86';
const DPR = Math.min(window.devicePixelRatio || 1, 2);
// more glow and livelier motion: brighter strands, a bigger hot core and halo, faster light pulses, more glitter
// secondary strand colours = neighbouring shades of the accent (the engine's default uses the opposite hue,
// which turned a red accent green). Works for every accent in Settings.
const hsl2hex = (h, s2, l) => { const k = n => (n + h / 30) % 12, a2 = s2 * Math.min(l, 1 - l), f = n => l - a2 * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
function neighbours(hex) {
  const n = parseInt(hex.replace('#', ''), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0, h = !d ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [[22, .75, .5], [-22, .75, .45], [38, .6, .55], [-38, .6, .42]].map(([dh, sm, lv]) => hsl2hex((h + dh + 360) % 360, Math.min(1, sat * sm + .15), lv));
}
// background layer: the same thin, sharp strands as the hero (not wide blurry halos), dim, reshaping as you scroll
const AMB = { haloOnly: 0, n: 260, lw: 1.7, la: .6, wMin: 190, wMax: 560, haze: .35, uniform: 0, flow: 1.2, flowFrac: .6, spark: 140, bokeh: 6, dust: 40, ef: .12, haloFrac: .28, hw: 5, ha: .16 };
const GLOW = { la: 1.3, core: 1.7, haze: 1.2, hz: .8, ha: .28, haloFrac: .24, flow: 1.45, flowFrac: .8, spark: 480, bokeh: 22, dust: 100, wob: .07, blue: .22 }; // sharp on retina; the engine steps down on its own if a device struggles
const ink = () => { const p = paletteFromAccent(accent(), { cool: neighbours(accent()) }), k = .32, d = c => c.map(v => v * k); return { ...p, main: p.main.map(d), cool: p.cool.map(d), haze: d(p.haze), coreHot: d(p.coreHot), core: d(p.core), glitter: d(p.glitter), bokeh: d(p.bokeh), dust: d(p.dust) }; };

function teardown() {
  hero?.destroy(); amb?.destroy(); hero = amb = null;
  if (heroCanvas?.isConnected) heroCanvas.replaceWith(heroCanvas.cloneNode()); // a destroyed canvas keeps its lost GL context
  heroCanvas = null;
  ambCanvas?.remove(); ambCanvas = null; ambKey = ''; fx?.destroy(); fx = null;
}
function mount() {
  if (!supported()) { root.classList.add('ribbon-nogl'); return; }
  const dark = root.dataset.theme !== 'light';
  const look = root.dataset.theme + accent();
  if (theme !== look) { teardown(); theme = look; }
  fx ||= dark ? createRibbons({ accent: accent(), cool: neighbours(accent()), dpr: DPR }) : createRibbons({ palette: ink(), dpr: DPR });
  const hc = app.querySelector('canvas[data-ribbon="hero"]');
  if (hc !== heroCanvas) { hero?.destroy(); hero = null; heroCanvas = hc; reachRight(); if (hc) hero = fx.hero(hc, { alpha: dark ? .85 : .55, fade: [0, 120], heightFrom: hc.parentElement, params: GLOW }); }
  // pages re-render on their own polls: only rebuild the ambient when the page itself changes
  const key = location.hash.split('/')[1] || 'home';
  if (key === ambKey) return fx.refresh();
  ambKey = key;
  // the ambient canvas loses its GL context on destroy, so each page gets a fresh one
  amb?.destroy(); ambCanvas?.remove();
  ambCanvas = document.createElement('canvas'); ambCanvas.className = 'fxamb'; ambCanvas.setAttribute('aria-hidden', 'true');
  const sky = document.querySelector('.fxstorm'); sky ? sky.after(ambCanvas) : document.body.prepend(ambCanvas); // ribbon light on top of the storm clouds
  amb = fx.ambient(ambCanvas, { selector: '#app > *, #fxstops i', opacity: dark ? .7 : .55, params: AMB, hideUntil: hc ? hc.parentElement : undefined,
    shapes: hc ? {} : { off: { p: AMBIENT.edgeRightFaint.p, o: .5 } } });
}
// scroll checkpoints every 750px: the soft light keeps reshaping as you scroll, even down one long table
const stops = document.createElement('div'); stops.id = 'fxstops'; stops.setAttribute('aria-hidden', 'true');
stops.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="top:${700 + i * 750}px"></i>`).join('');
app.parentElement.append(stops);
// wide screens: let the ribbon run to the right edge of the screen (its left side and height stay as they are)
function reachRight() {
  const c = heroCanvas; if (!c || !c.isConnected) return; c.style.removeProperty('width');
  const m = app.parentElement.getBoundingClientRect(), r = c.getBoundingClientRect(); if (m.right > r.right) c.style.setProperty('width', `${r.width + m.right - r.right}px`, 'important');
}
addEventListener('resize', reachRight);
const later = () => { clearTimeout(t); t = setTimeout(mount, 60); };
new MutationObserver(later).observe(app, { childList: true });                       // a new page was rendered
new MutationObserver(later).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
mount();
