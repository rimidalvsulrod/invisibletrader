---
name: storm-lightning
description: Applies a realistic thunderstorm look to any website, app, landing page, section or component. It adds volumetric 3D storm clouds lit from inside by physically-timed lightning (stepped leaders, return strokes, restrikes, ground strikes, anvil crawlers, in-cloud flashes), and UI that reacts to each flash (glowing headings, cards lit from the bolt's direction, buttons that get struck). Ships a dependency-free drop-in engine (lightning.js, WebGL2 with a WebGL1 fallback) plus plain-HTML, React and Next.js wiring. Use it whenever the user asks for lightning, a storm, thunder, an electric or stormy background or theme, "the lightning effect", "the storm design", or "apply this lightning/storm skill", even if they only say "add the storm" or "make it look like the lightning one".
---

# Storm Lightning

A realistic storm background (clouds + lightning) plus a UI that reacts to every flash. Everything visual lives in
`assets/lightning.js`, so applying the skill mostly means wiring that file in and styling the page so it fits the storm.

Files:
- `assets/lightning.js`: the engine. No dependencies. Copy it into the target project unmodified.
- `assets/demo.html`: a complete reference page showing every pattern below. Read it when unsure how a piece fits together.
- `assets/StormBackground.tsx`: a React / Next.js client component wrapper.
- `references/storm-reference.md`: what real lightning does (measured from footage), how the engine models it, and every tuning knob. Read it when the user wants to tune realism or asks why something behaves the way it does.

## Workflow

1. **Find the stack.** Check for plain HTML, React/Vite, Next.js (App or Pages router), Vue, Svelte, etc. Respect the project's existing design system: the storm is a background and an accent, not a rebrand.
2. **Copy the engine** to a static/public folder (`public/lightning.js` in Next/Vite, next to `index.html` for static sites). Don't rewrite or minify it.
3. **Mount it once** (see Integration). By default it is full-viewport and fixed behind all content (`z-index:-1`).
4. **Make the page let the storm through.** Remove opaque `body`/`main`/section backgrounds where the storm should show, or the canvas is hidden. Set `body { background:#05060d }` as the fallback colour. Make content surfaces semi-transparent dark (`rgba(9,10,24,.6)`), not solid. Avoid `backdrop-filter` over the storm because it is expensive over an animated canvas.
5. **Add flash reactions** with the CSS recipes below: headings, cards, buttons, an optional ground silhouette.
6. **Wire interactions** if they fit: click the sky to strike, `data-strike` buttons that get hit.
7. **Accessibility pass** (required): see Safety.
8. **Verify**: open the page and fire `storm.strike({type:'cg'})`, `{type:'crawler'}` and `{type:'cloud'}` from code or the console. Check there are no console errors and that the content stays readable during a big flash.

## Integration

### Plain HTML
```html
<script src="lightning.js"></script>
<script>
  const storm = Lightning.create({ frequency: 14, palette: 'night', ground: '#ground' });
</script>
```

### React / Vite / Next.js
Copy `assets/StormBackground.tsx` into the components folder and `lightning.js` into `public/`. Render
`<StormBackground />` once, high in the tree (in Next.js App Router: in `app/layout.tsx` or the page; it is already a
`"use client"` component). It injects `/lightning.js`, creates the storm and destroys it on unmount. In Next.js, read the
repo's own Next docs/AGENTS.md first if the project says its Next version differs from what you know.

### Only one section (not the whole page)
```js
Lightning.create({ container: '#hero', fixed: false });
```
The container needs `position:relative; isolation:isolate; overflow:hidden` and no opaque background. Coordinates passed to
`strike()` are then relative to the container. Convert click positions with `storm.toLocal(e.clientX, e.clientY)`.

### API
```js
const storm = Lightning.create(options);
storm.strike({ type: 'cg' | 'crawler' | 'cloud', x, y, toX, toY, scale, bloom }); // all optional
storm.set({ frequency, intensity, palette, cover, bolts, auto, safe, quality });
storm.destroy();
window.addEventListener('lightning', (e) => e.detail); // {type, x, y, scale, delay}: hook thunder audio, analytics, etc.
```
Options (defaults): `frequency: 14` strikes/min · `intensity: 1` · `palette: 'night'` · `cover: 0.72` clouds 0.3–0.95 ·
`bolts: true` · `auto: true` · `safe: prefers-reduced-motion` · `quality: 0.5` sky render scale · `ground: null` (selector;
ground strikes land on its top edge, so bolts disappear behind hills or a footer) · `container: body`, `fixed: true` ·
`zIndex: -1` · `mix: {cloud:.45, cg:.3, crawler:.25}` share of each strike type.

Palettes: `night` (lavender, the default), `steel` (blue-hour supercell), `dusk` (pink/magenta). Brand colours use a custom
object; any missing keys fall back to `night`:
```js
palette: { top:[.012,.013,.032], hor:[.05,.045,.1], cloud:[.085,.08,.15], lit:[.8,.74,1], amb:[.36,.32,.62],
           core:'255,255,255', mid:'218,210,255', glow:'150,128,255' }  // vec3 = 0..1 linear-ish RGB, strings = "r,g,b"
```
Keep the sky colours (`top`, `hor`, `cloud`) very dark. The realism comes from the contrast between a dark sky and the flash.

## CSS that reacts to the storm

The engine writes these on `<html>` every frame: `--flash` (0–1 sky brightness), `--fx` and `--fy` (screen % of the
brightest flash), and `--lit` (the palette's `mid` colour as `r,g,b`).

```css
:root { --flash:0; --fx:50%; --fy:30%; --lit:200,190,255; }

/* headings and the logo bloom with each flash */
h1, h2, .logo { text-shadow: 0 2px 30px rgba(0,0,0,.6),
                0 0 calc(var(--flash) * 40px) rgba(var(--lit), calc(var(--flash) * .7)); }

/* cards lit from the bolt's real screen position: background-attachment:fixed makes the
   gradient viewport-anchored, so cards near the strike light up and far ones barely do */
.card { position:relative; overflow:hidden; background:rgba(9,10,24,.62); border:1px solid rgba(255,255,255,.08); }
.card::before { content:""; position:absolute; inset:0; pointer-events:none; opacity:var(--flash);
  background:radial-gradient(circle at var(--fx) var(--fy), rgba(var(--lit),.35), rgba(var(--lit),.06) 45%, transparent 75%) fixed; }
/* lit rim on the card border */
.card::after { content:""; position:absolute; inset:0; border-radius:inherit; padding:1px; pointer-events:none; opacity:var(--flash);
  background:radial-gradient(circle at var(--fx) var(--fy), rgba(var(--lit),.9), transparent 55%) fixed;
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; }
.card > * { position:relative; }

/* buttons glow; .struck plays when a bolt hits them */
.btn { box-shadow: 0 0 calc(var(--flash) * 30px) rgba(var(--lit), calc(var(--flash) * .5)); }
.btn.struck { animation: struck .5s; }
@keyframes struck { 0% { transform:translate(2px,-1px); filter:brightness(2.5); } 30% { transform:translate(-2px,1px); } 100% { transform:none; filter:none; } }
```

Ground silhouette (strongly recommended for hero sections): a near-black SVG landscape (hills, trees, power poles)
pinned to the bottom of the hero, with id `ground` passed as the `ground` option. Bolts terminate behind it, which sells
the depth. Add a second copy filled with a top-down `rgb(var(--lit))` gradient at `opacity: calc(var(--flash) * .4)` for
rim light. `assets/demo.html` has a ready-made one.

Interactions:
```js
// click the sky -> bolt lands where you clicked
hero.addEventListener('click', (e) => { if (e.target.closest('a,button')) return;
  storm.strike({ type:'cg', toX:e.clientX, toY:e.clientY, scale:1, bloom:true }); });
// a bolt hits the button, then it shakes on the return stroke
document.querySelectorAll('[data-strike]').forEach((b) => b.addEventListener('click', () => {
  const r = b.getBoundingClientRect();
  const st = storm.strike({ type:'cg', toX:r.left + r.width/2, toY:r.top, scale:.9, bloom:true });
  setTimeout(() => { b.classList.remove('struck'); void b.offsetWidth; b.classList.add('struck'); }, st.leader);
}));
```

## Design rules that keep it realistic

- **Dark is the canvas.** Near-black blue/violet grounds, with light text at high contrast. Never place the storm behind light-themed content.
- **Accent colour = the lightning colour.** Use the palette's `mid` colour (`--lit`) for focus rings, links and highlights, so the UI feels lit by the same light.
- **Restraint.** 8–20 strikes per minute feels like a real storm. Above about 30 it reads as a strobe. Keep the default mix, where most flashes are hidden in-cloud. A wall of visible bolts looks fake.
- **Don't animate the UI on its own.** UI motion should only be a response to flashes (glow, lit rims, struck buttons). Avoid pulsing or looping effects that compete with the storm.
- **Text over the sky** needs a soft dark `text-shadow` or a semi-opaque panel, because a big flash brightens the whole sky.
- **Don't change bolt or cloud internals** unless asked. Tune with options first. `references/storm-reference.md` explains each internal constant if you must.

## Safety and performance (required)

- **Photosensitivity:** lightning flashes. `safe` mode turns on automatically under `prefers-reduced-motion`, replacing strobing with single slow, dim fades. Always expose a visible toggle (`storm.set({ safe:true })`) on pages where the storm is prominent, and never raise `frequency` or `intensity` far above the defaults on public pages (WCAG 2.3.1: no more than 3 flashes per second).
- The canvas is `aria-hidden` and `pointer-events:none`, so it never blocks clicks or screen readers.
- Performance: the clouds are raymarched at `quality × viewport` resolution (default 0.5), and mobile automatically uses fewer steps. If a device struggles, lower `quality` to 0.35 or `cover` (fewer clouds means fewer samples). Rendering pauses in hidden tabs. Mount only one storm per page.
- No WebGL at all: the engine draws a simple gradient sky with flash glows, so the page never breaks.
