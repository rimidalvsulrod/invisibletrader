---
name: luminous-ribbon
description: 'Applies the "Luminous Console" look (the Relay-style site from the reference video) to any website or app: a GPU light-ribbon background that flows corner to corner, pulses and glows, a soft blurred ambient light that reshapes per section, sharp light waves behind pricing/CTA, plus the matching UI (near-black ground, glass cards, tag pills, mono metadata, one italic serif word per headline, accent-only-for-live-things). Ships a drop-in WebGL2 engine with React/Next.js/Vite/plain-HTML wrappers, any brand accent, built-in performance safeguards. Also rebuilds a website 1:1 from a screen recording (frame extraction, motion measurement, side-by-side compare loop). Use whenever the user says "apply this", "apply the luminous / ribbon / Relay style", "add the glowing flowing light background", "make it look like that video/Relay site", "add the animated light streaks", "replicate this site from the video", or wants this aesthetic on a landing page, portfolio, SaaS or app, even if they only say "this".'
---

# Luminous Ribbon

Three jobs, one kit:

| The user wants | Do | Read |
|---|---|---|
| "Apply this" to their project (most common) | Mode A | `references/apply-to-project.md` |
| A new site in this style | Mode B | `references/design-language.md`, `assets/examples/relay-replica.html` |
| A site rebuilt 1:1 from a video or screenshots | Mode C | `references/replicate-from-video.md` |

Always: `references/performance.md` before shipping. Engine details and tuning: `references/engine.md`.

## What "this" is

- **Background, three layers.** (1) A sharp hairpin of ~280 thin light strands behind the hero: enters at the
  top-right corner, pinches into a white-hot core on the left, fans out to the bottom-right; light pulses run
  along every strand from corner to corner, the core breathes on a ~3s cycle, it draws itself in on load.
  (2) A fixed, soft, dim aurora of blurred streaks behind the rest of the page that changes shape per section.
  (3) Sharp wave bundles that sweep across the pricing / CTA zone. All rendered in WebGL2 by
  `assets/ribbon-engine.js`; the CPU only computes ~80 spine points per ribbon per frame.
- **UI language.** Near-black ground, one accent (lime `#c3ff4c` by default, or the brand's), greyscale
  everything else, glass cards without backdrop blur, tag pills with a glowing dot, lowercase mono metadata,
  headlines in a tight grotesk with exactly one italic serif word, product widgets as imagery, dry specific
  copy. Tokens and components: `assets/luminous.css`.

## Mode A: apply it to an existing project

Do not ask questions you can answer from the repo. Defaults when the request is just "apply this":
hero ribbon + ambient light on the main marketing page(s), waves if there is a pricing/CTA zone, the UI
restyle on the same pages, the project's existing accent if it has one (lime otherwise), copy and routes untouched.
Ask only if it is genuinely unclear which pages, or if the site is light-themed and switching to dark would be
a big brand change.

1. **Read the project**: framework + version, styling system, brand accent and fonts, hero component, section
   structure, root layout. Respect repo instructions (e.g. AGENTS.md asking you to read framework docs first).
2. **Copy assets** into the project: `ribbon-engine.js` (+ `.d.ts`), `RibbonBackground.tsx` for React,
   `luminous.css` imported globally.
3. **Wire layers**: `<RibbonAmbient>` once per page; hero wrapper `position:relative; overflow:clip` holding
   `<RibbonHero>` and the hero content (content `z-index:1`); `<RibbonWaves>` in a relative wrapper around
   pricing + CTA. Plain HTML: `<canvas data-ribbon="hero|ambient|waves">` + `autoMount({ accent })`.
   Same accent on every layer so they share one loop.
4. **Restyle** in this order, stopping where the brief stops: ground and text colours, type roles,
   section headers (tag, headline with italic word, short explainer right), cards to glass, buttons,
   mono metadata, reveal-on-scroll. Keep their content and IA.
5. **Verify**: build/typecheck, run it, `node scripts/shoot.mjs <url> out --auto 6` (then `--mobile`), check the
   ribbon reads behind the hero, ambient fades in after it, no overflow, no console errors, text stays readable.
6. **Report** what changed, where the files went, the accent used, and anything you could not apply.

## Mode B: a new site in this style

Start from `references/design-language.md` (tokens, layout grammar, component kit, motion catalog, copy voice)
and lift components from `assets/examples/relay-replica.html`: live workflow card, run trace, approval card,
isometric bars, bento dashboard, count-up stats, pricing estimator, icon-to-panel morph. Make the product's
own widgets the imagery. Use the engine for the background. If the taste-design skill is available, its
pre-flight rules still apply (where they conflict with this look, e.g. the italic serif word, this look wins).

## Mode C: replicate from a video

Follow `references/replicate-from-video.md`: probe and crop, contact sheets, still windows for motion
(`scripts/measure_motion.py`), colour sampling, build, then the screenshot + side-by-side compare loop
(`scripts/shoot.mjs`, `scripts/compare.py`) for 3 to 5 rounds, fixing background character first, then
positions, then sizes. Real brands: keep the design, rename or label as a recreation, never present invented
testimonials or numbers as real.

## Non-negotiables (each one cost a round of rework)

- The ribbon is **WebGL2**, never Canvas 2D path strokes, and never with CSS `filter` / `mix-blend-mode` /
  `mask-image` on the animated canvas.
- **No `backdrop-filter`** on repeated cards over animated light; at most one small frosted element.
- **Nothing inside cards that repaints every frame** (SVG `animateMotion`/`<animate>`/SVG filters): move
  dots with `transform`.
- **Low per-strand alpha, centre-weighted strands**: high alpha blows out to white; cos-distributed strands
  look like a hollow tube.
- **The ambient layer is dim, wide and made of separate soft streaks**, hidden while the hero ribbon is visible.
- **Additive light needs a dark ground.** On light pages, scope it to a dark band or switch the page to dark.
- `prefers-reduced-motion` gets one still frame (the engine handles it); low-end machines step down
  automatically (`html.ribbon-lite` in CSS removes the last backdrop blur).

## Bundled files

| Path | What |
|---|---|
| `assets/ribbon-engine.js` / `.d.ts` | The engine: `createRibbons`, `autoMount`, `paletteFromAccent`, presets, shapes |
| `assets/RibbonBackground.tsx` | `RibbonHero`, `RibbonAmbient`, `RibbonWaves` React client components (SSR-safe) |
| `assets/luminous.css` | Design tokens + components (`lum-` prefix), lite and no-WebGL fallbacks |
| `assets/demo.html` | Minimal working page (serve the folder; `?accent=ff7a2f` to recolour) |
| `assets/examples/relay-replica.html` | Full 1:1 recreation of the reference site |
| `scripts/extract_frames.py` | `probe`, `sheet`, `crops`, `burst` for screen recordings (ffmpeg + Pillow) |
| `scripts/measure_motion.py` | Region brightness over time (flow, pulse period, intro order), scroll activity |
| `scripts/sample_colors.py` | Exact colours at points, or a dominant palette |
| `scripts/shoot.mjs` | Screenshots at scroll targets with WebGL (desktop/mobile), overflow + console check |
| `scripts/compare.py` | Reference vs build side-by-side sheets |
| `scripts/perf.mjs` | Relative fps per scroll position, A/B two builds |

Scripts need `ffmpeg`, Python with Pillow, Node with `playwright` (local or global). Headless WebGL is
software-rendered: trust screenshots for looks, use fps only to compare builds.
