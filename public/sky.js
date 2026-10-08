// Storm background (storm-lightning skill engine, public/lightning.js): volumetric clouds lit from inside by real lightning.
// Dark theme only (the storm needs a dark sky). The lightning glow takes the Settings colour. Settings > Storm: On / Calm / Off.
// Calm (and prefers-reduced-motion) = the engine's safe mode: single slow, dim fades instead of strobing.
(() => {
  const root = document.documentElement; let storm = null, look = '';
  const pref = () => { try { return JSON.parse(localStorage.getItem('storm')) || 'on'; } catch (e) { return 'on'; } };
  const rgb = () => { const h = (getComputedStyle(root).getPropertyValue('--accent').trim() || '#3fbf86').replace('#', ''), n = parseInt(h.length == 3 ? h.replace(/./g, '$&$&') : h, 16); return [n >> 16, n >> 8 & 255, n & 255]; };
  // night sky kept very dark; the flash light is white-hot at the core, tinted with the accent toward the glow
  function palette() { const a = rgb(), mix = k => a.map(v => Math.round(v + (255 - v) * k)).join(',');
    return { top: [.012, .013, .03], hor: [.045, .045, .08], cloud: [.08, .08, .13], lit: a.map(v => .55 + v / 255 * .45), amb: a.map(v => .2 + v / 255 * .35), core: '255,255,255', mid: mix(.6), glow: a.join(',') }; }
  function mount() {
    const dark = root.dataset.theme !== 'light', p = pref(), key = [dark, p, rgb()].join();
    if (key === look) return; look = key;
    storm?.destroy(); storm = null; window.storm = null;
    if (!dark || p === 'off' || !window.Lightning) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    storm = window.storm = Lightning.create({ frequency: 12, palette: palette(), zIndex: 0, safe: p === 'calm' || reduce, cover: .7, quality: .5 });
    storm.wrap.classList.add('fxstorm'); // the ribbon light sits on top of it (public/fx.js)
    const amb = document.querySelector('.fxamb'); if (amb) storm.wrap.after(amb);
  }
  window.stormMount = mount;
  new MutationObserver(mount).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount); else mount();
})();
