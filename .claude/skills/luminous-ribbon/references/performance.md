# Performance rules

The first canvas-2D version of the reference made a whole computer lag. Everything below is what fixed it.

## Rules

1. **Strands on the GPU.** One instanced draw per bundle; the CPU only samples the spine (~80 points) per frame.
   Never stroke hundreds of paths with Canvas 2D every frame (CPU path building, dashing and rasterising).
2. **No CSS effects on animated canvases.** `filter: blur()`, `mix-blend-mode`, `mask-image` on a canvas that
   changes every frame force full-layer recompositing. Glow and fades live in the shaders; the ambient layer
   gets its softness from 0.25x resolution plus soft strands.
3. **Backdrop blur is the silent killer.** `backdrop-filter` over animated content re-blurs every frame.
   Allow one small frosted element (hero card). Everything else: translucent dark fills.
4. **Nothing inside cards that repaints every frame.** SVG `animateMotion`, `<animate>`, SVG `filter`s, and
   CSS animations of `left/top/width/filter` make the whole card (shadows included) repaint. Move dots with
   `transform` on their own small element (`will-change: transform`). Static `drop-shadow` is fine.
5. **One loop.** One `requestAnimationFrame` for everything, capped at 60fps (skip frames on 120Hz screens),
   reads (scrollY, rects) before writes (styles). Only render layers that are on screen.
6. **Resolution 1x.** The look is soft; DPR above 1 doubles fill cost for little gain.
7. **Adaptive.** Measure real frame intervals; step down: fewer strands + no backdrop blur
   (`html.ribbon-lite`), then 30fps, then lower resolution. The engine does this; respect `ribbon-lite` in CSS.
8. **Reduced motion.** Render one still frame; reveals show immediately.

## Diagnosing a slow page

- `node scripts/perf.mjs page.html --at 0,3000,6000` gives fps per scroll position. Headless WebGL is software
  rendered, so read it relatively: copy the page, disable one thing (a layer, the hero card, an SVG animation,
  `backdrop-filter`), re-run with `--vs`. The biggest jump is the culprit.
- If fps is low even with every ribbon disabled, the cost is in the DOM: look for per-frame repaints (rule 4)
  and backdrop filters (rule 3).
- Ask the person for their machine and browser when it still lags for them; offer to make the lite mode default
  (`createRibbons({ fps: 30 })`, fewer strands via `params: { n: 160 }`).
