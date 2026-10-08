# Ribbon engine reference

`assets/ribbon-engine.js`, WebGL2, no dependencies, SSR-safe.

## API

```js
import { createRibbons, autoMount, paletteFromAccent, PRESETS, SHAPES, AMBIENT, drift } from './ribbon-engine.js';
const fx = createRibbons({ accent: '#ff7a2f', cool: ['#4a7f9a', '#3a6a8a'], dpr: 1, fps: 60, onDegrade: lvl => {} });
fx.hero(canvas, { fade: [0, 70], alpha: 1, heightFrom: heroEl, params: { n: 220 } });
fx.ambient(canvas, { hideUntil: heroWrapEl, selector: 'main section', opacity: 1, stops: [{ el, shape: 'arch' }], shapes: { mine: { p: [[x,y]x4], o: .7 } } });
fx.waves(canvas, { fanY: .32, bandY: .9, fan: true, band: true, fade: [160, 120] });
fx.custom(canvas, { fixed: false, fade: [0, 0], bundles: [{ params: 'fan' | {...}, points: (t, w, h) => [[x, y], ...] }] });
fx.refresh(); fx.destroy(); fx.perf; fx.supported;
```
Each call returns `{ destroy() }`. One engine = one rAF loop for all its layers. Canvases are sized from their
CSS box (ResizeObserver) and only render while on screen (IntersectionObserver). The ambient layer renders at
0.25x resolution and is always on (it is fixed), with its opacity driven by the section it is in.

## How a ribbon is built

- **Spine**: Catmull-Rom curve through 5 to 8 control points (CSS px of the canvas), sampled at M points
  (<= 96). Points drift slowly on sines so the shape breathes.
- **Width**: grows from `wMin` at the pinch (`pinch` 0..1 along the length, or `pinchPoint` = control point index)
  to `wMax` at the far ends, curve exponent `wexp`. Widths are authored for a 1440px viewport and scaled.
- **Strands** (`n`): lateral position is centre-weighted (sum of three randoms) plus a weave
  `aw * sin(phi + tw * s * 2π + t * w)` so strands cross like a cable, plus a slow wobble (`wob`).
- **Colour**: palette `main` (accent shades, last one near-white for the core) and `cool` (outer strands,
  `blue` = how many). Per-strand alpha is LOW (0.05 to 0.22, scaled by `la`) because blending is additive.
- **Flow**: each strand carries light pulses: `mod(arc - t * speed, period) < pulseLength` brightens and whitens
  it. `flow` scales speed, `flowFrac` = share of strands that pulse. Direction is start to end of the spine,
  so author points in the direction light should travel (hero: top-right corner first).
- **Glow**: a soft halo pass for ~20% of strands (`haloFrac`, `hw` width, `ha` alpha), a radial `haze` and a hot
  `core` at the pinch. `haloOnly` turns a bundle into soft streaks (the ambient look).
- **Particles**: `spark` glitter flowing along the ribbon, `bokeh` soft discs, `dust` free-floating specks.
- **Pulse**: global intensity `1 + 0.1 sin(2πt/3.1) + 0.045 sin(2πt/1.37)` (the ~3s breathing).
- **Intro**: strands draw in along their length over ~1.25s, outer ones slightly later.
- **Fades**: `fade: [top, bottom]` px at canvas edges, `fadeIn` px at the start of a bundle (soft start instead
  of a hot comet head), `ef` fraction at both strand ends (stops hard cut-offs on wide soft strands).

## Presets (measured from the reference)

| Preset | Use | Key values |
|---|---|---|
| `hero` | Sharp hairpin behind the hero | 280 strands, pinch at control point 3, wMin 22, wMax 440, core 1.35, 360 glitter, 70 dust |
| `fan` | Sharp fan opening up and right (above pricing) | 230 strands, wMin 26 to wMax 360, fadeIn 300 |
| `band` | Sharp rising band (above CTA) | 190 strands, wMin 66 to wMax 160, wobble .14 |
| `ambient` | Soft fixed light | 44 halo-only strands, uniform spread, widths 170 to 470, end fade .16 |

Shapes: `SHAPES.hairpin(w, v)` (pinch at 36% x, 72% of hero height), `SHAPES.fan(w, y)`, `SHAPES.band(w, y)`.
Ambient keys (viewport fractions + opacity): `off, arm, sweepLeft, sweepLeftWide, hairpinLeft, diagDown,
edgeRight, edgeRightFaint, diagUp, sweepLeftLow, arch, horizontal, low`. Unlabelled sections cycle through them.

## Tuning recipes

| Want | Change |
|---|---|
| Brighter / denser | raise `la` (1.1 to 1.4) or `n`; not per-strand alpha in code |
| Calmer behind body text | hero `alpha: .6`, or move the pinch with a custom shape |
| More teal/blue | `blue` .25 to .35, or pass `cool` colours |
| Faster flow | `flow` 1.3 to 1.6 |
| Thicker glowing core | `core` 1.5, `wMin` 28 |
| Softer ambient | `opacity` .7 on `fx.ambient`, or per-shape `o` |
| A different composition | `fx.custom` with your own points; keep 5 to 8 points and let the spine run off-canvas at both ends |

## Pitfalls already paid for

1. `d = r * cos(theta)` lateral distribution piles strands at the edges: the bundle reads as a hollow tube.
   Use centre-weighted positions plus a small weave.
2. Per-strand alpha above ~0.25 saturates additive blending to white and loses the accent colour.
3. One fixed canvas for everything is wrong: the sharp hero ribbon scrolls with the page and ends below the
   fold; a separate fixed layer provides the blurred light; late sections get their own sharp bundles.
4. The ambient layer must be many separate soft streaks, dim (opacity .45 to .9), not one bright tube.
5. Narrow pinches at a bundle start create a white comet head; use `fadeIn` and a wider `wMin`.
6. Wide soft strands need `ef` end fades or they show straight cut lines.
7. Uncontrolled canvases: an unstyled `<canvas>` sits in the flow and pushes the page down. The engine positions
   its canvases; do not override `position` unless you mean it.
