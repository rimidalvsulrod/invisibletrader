# Luminous Console (style preset)

Reverse-engineered from a 17.5s screen recording of "Relay", a workflow-automation landing
page (dark, lime accent, glowing light-ribbon background). Use this preset when the brief
wants a technical product to feel alive, precise and premium: dev tools, infra, automation,
fintech ops, logistics, energy, anything with runs, events, telemetry.

The one-line read: **a black void lit by one physical light source, with the product's own
live UI floating in it as glass instruments, and copy that sounds like a calm engineer.**

---

## 1. Frame-by-frame timeline (what the recording shows)

| t (s) | Scroll position | What happens |
|---|---|---|
| 0.0-5.0 | Hero, static scroll | Light ribbon (hundreds of thin lime/teal filaments in a bundle) arcs from bottom-left through the hero and sweeps off top-right. It slowly breathes and drifts. Sparse dust particles. Right side: glass "workflow canvas" card (node graph: trigger -> condition -> branch true/else -> human approval) with a live `last runs` log whose timestamps and ms values update. Cursor hovers nodes. |
| 5.0-6.0 | Scroll starts | Nav stays fixed with a dark translucent backing. Hero card scrolls away; the ribbon stays fixed and becomes the page's background. Integration row types in on mono: `connects to 240 apps, and to wh...`; app tiles (SL ST PG HS) light up in sequence with a dot travelling along a dotted connector. |
| 6.0-7.5 | Section 2 "Most of a process is *glue*." | Ribbon now defocused (heavy blur, low opacity) acting as ambient light. Small tag pill, headline left, explainer right. Feature 01: run trace card (gantt rows `read refund / check amount / branch / ask finance`, bars fill left to right, axis 0-200 ms, `finished in 129 ms`). Body text blurs in (blur -> sharp + fade). |
| 7.5-9.0 | Features 02, 03 | Zigzag alternation. 02: Slack-style approval card (`#finance`, typing dots, then message + definition list + Approve (accent) / Hold (ghost), `waiting 27 min`). 03: isometric 3D bar chart (mon-sat), last bar in accent with a floating diamond cap; `62,000 average`. |
| 9.0-10.8 | Brand morph moment | The logo icon appears center screen as a small accent rounded square, scales up into a full-width accent panel (dotted grid texture), the panel holds the manifesto: mono typed kicker `[ what we are actually selling ]`, headline with the italic word blurring in (`nobody mentions`), dark logo tile. Then the panel collapses back to the icon, now an accent ring around a dark tile. Shared-element feel driven by scroll. |
| 10.8-11.8 | "*Boring* in the ways that matter." | Two equal cards: hub diagram (logo tile center, app nodes orbit with dots running along lines) and region bars (`eu-central-1 46%`, `us-east-1 38%`, `ap-south 16%`), the logo tile from the morph lands into the hub. |
| 11.8-13.2 | "A *Tuesday*, seen from Relay." | Dashboard bento: week heatmap (rows of dim bars, today's slot in accent, `next run in 12 min` chip), donut ring counting to 82%, avatars of people being waited on, failure/retry wave chart drawing itself, dotted world map. |
| 13.2-14.4 | "Numbers we did *not* have to explain away." | Three big stats count up from 0 (62,000 / 11 / 99%), each with its own micro-viz (sparkline, segmented bar of 12 cells, full-width progress). Three quotes underneath with name + mono role line. Ribbon reappears near the bottom as horizontal waves. |
| 14.4-16.0 | Pricing "You pay for runs, not *seats*." | Estimator card: slider (3,000 / 30,000 / 300,000) updates the recommended plan panel live. Three tier cards, middle one has accent `most picked` chip and accent CTA, others ghost. |
| 16.0-17.5 | Final CTA + footer | Ribbon flows horizontally across the top. Two cards: dark brand card (huge ghost chevrons, socials as mono chips) + accent CTA card (`what now`, "Pick the task you *hate* most.", pill email input with dark button). Mono status strip with accent dots. 4-column footer with mono column heads. |

---

## 2. Tokens

```css
--void:      #050506;   /* page background, near-black with no hue */
--panel:     rgba(255,255,255,.035); /* glass card fill */
--panel-2:   rgba(255,255,255,.06);  /* chips, inputs, inner tiles */
--line:      rgba(255,255,255,.08);  /* 1px borders, hairlines */
--fg:        #ececea;   /* headlines */
--fg-2:      #9b9b98;   /* body */
--fg-3:      #5f5f5c;   /* mono meta, axis labels */
--accent:    #c3ff4c;   /* lime in the original: buttons, active data, dots */
--on-accent: #0b0d05;   /* text on accent */
--glow-2:    #4a6e6e;   /* secondary ribbon tone (steel teal), only in light, never in UI */
```

- **One accent.** It appears only where something is live, chosen or clickable: primary CTAs,
  the active data series, status dots, the selected plan. Everything else is greyscale.
- The ribbon is the only place a second hue exists, and it is light, not paint.
- Radii: cards 16-20px, inner tiles 10-12px, buttons and pills full-round. Applied consistently.
- No drop shadows. Depth = glass fill + 1px light border + the ribbon glowing behind.

## 3. Typography

| Role | In the original | Use |
|---|---|---|
| Display / UI sans | Neutral grotesk (Inter Display / Geist-like), weight 500-600, tracking -0.03em | Headlines 56-64px hero, 40-44px section, 22-26px card titles |
| Accent italic serif | High-contrast italic serif (Instrument Serif-like) | **Exactly one word per headline**, the word that carries the opinion: *themselves*, *glue*, *Boring*, *Tuesday*, *not*, *seats*, *hate* |
| Mono | Typewriter-ish mono, lowercase | Every piece of metadata: status, timestamps, units, axis labels, captions under stats, roles, footer column heads, the trust line under CTAs |

Rules: mono text is always lowercase and grey (`--fg-3`), never shouted. Sans headlines are
sentence case. The italic word is the only typographic flourish on the page.
(This deliberately overrides the general "same-family emphasis" rule: here the mixed-family
italic word IS the brand signature. Rotate the serif per project; do not reuse
Instrument Serif or Fraunces by default.)

## 4. Layout grammar

- 1280-1360px container, 80px side gutters, 12-col feel.
- Hero: left text column (tag pill, 2-line headline, 2-line subtext, 2 CTAs, mono trust line),
  right a floating product card that bleeds slightly off the right edge.
- Section header pattern: tag pill with dot -> headline left (with italic word) -> one short
  explainer paragraph top-right. (This is a split header. It works here because the right
  paragraph is short, aligned to the headline baseline, and the sections below are wide visuals.)
- Feature rows: numbered 01 / 02 / 03 in tiny mono (they really are a sequence), title + 2-line
  body on one side, a live product widget on the other, alternating. Max 3 rows.
- One full-bleed accent moment in the middle of the page (the morph panel) and one accent card
  at the end (CTA). The accent is never used as a section background anywhere else.
- Bento dashboard section with mixed cell sizes (2/3 + 1/3 top, three thirds bottom).
- Stats as a 3-column row with no card boxes, separated by space only.

## 5. Component kit

- **Status pill** (nav): mono `• all systems normal`, dark glass pill, accent dot. Real semantic state.
- **Tag pill** (section): `• reliability`, small, dark fill, accent dot.
- **Primary button**: accent fill, dark text, full pill, 44px tall. **Ghost button**: panel-2 fill, 1px line, light text, leading glyph.
- **Glass card**: panel fill, 1px line, 16-20px radius, `backdrop-filter: blur(12px)`, header row with mono title left and mono meta right.
- **Node graph**: dark tiles with title + mono subtitle, thin accent-tinted bezier connectors, mono edge labels (`true`, `else`) in small boxes.
- **Run log rows**: accent dot for newest, mono timestamp, mono name, right-aligned ms.
- **Gantt trace**: mono step names with check icons, bars on a ms axis, current step pulsing.
- **Chat approval**: channel header, bot avatar tile, message, definition list with accent left rule, Approve/Hold.
- **Isometric bars**: CSS 3D boxes (three faces with stepped greys), the max bar in accent with a floating cap.
- **Donut**: thin accent ring, big number centered, mono caption below.
- **Segmented bar**: 12 rounded cells, filled count in accent with a gradient from bright to deep.
- **Slider estimator**: accent track fill, round thumb with glow, mono stops, linked plan panel.

## 6. Motion catalog (all motivated)

| Motion | Purpose | Implementation |
|---|---|---|
| Light ribbon: slow drift, filament shimmer, particles | Atmosphere; the "energy flowing through" metaphor of the product | WebGL2 instanced strands along a Catmull-Rom spine, additive blending, shader-side flow pulses and glow (see `assets/ribbon-engine.js`), paused when off screen |
| Ribbon defocus with scroll | Hero is sharp and alive; content sections get ambient light without competing | Fixed canvas; CSS scroll-driven animation (`animation-timeline: scroll(root)`) on `filter: blur()` and `opacity`. No scroll listeners |
| Text blur-in (blur 8px -> 0, 12px rise, fade) | Hierarchy: draws the eye section by section | IntersectionObserver adds a class once; resting state is visible if JS fails |
| Mono typewriter | Machine voice: the product "speaking" | Type once on reveal, 18-28ms per char, block caret |
| Live log / timestamps ticking | Proof the product is running | `setInterval`, new row slides in at top, oldest drops |
| Bars fill, donut draws, sparkline draws, numbers count up | Data arriving, state change | CSS transitions triggered by reveal class; count-up via rAF with ease-out |
| Sequential node light-up with travelling dot | Shows the handoff between tools | CSS keyframes with staggered delays |
| Icon -> panel -> icon morph | The single orchestrated brand moment | Sticky section, CSS `animation-timeline: view()` scaling a panel from icon size to full width and back |
| Button press | Feedback | `scale(.98)` on active, 150ms |

All motion collapses under `prefers-reduced-motion: reduce` (ribbon renders one still frame,
reveals are instant, morph shows the open panel).

### 6.1 The light ribbon, exactly (measured from the recording)

It is three layers, not one fixed canvas:

| Layer | Where | Look |
|---|---|---|
| A. Hero ribbon | Absolute canvas covering hero + integrations row, scrolls with the page, bottom edge fades over ~70px | Sharp hairpin: enters at the top-right corner, pinches into a white-hot lime core at about (36% x, 72% y) of the hero, fans out to the bottom-right. Half-width ~22px at the pinch, ~440px at the far ends |
| B. Ambient | `position: fixed` full-viewport canvas rendered at 0.3x, CSS `blur(20px)` | Dim olive/teal out-of-focus streaks. Shape changes per section as you scroll (diagonals corner to corner, a hairpin at the left, an arch behind the stats). Hidden while layer A is in view |
| C. Lower waves | Absolute canvas spanning stats, pricing and CTA, scrolls with the page | Two sharp bundles: one starts soft at ~25% x above the pricing header and fans up and right; one rises from the left edge above the CTA to the top-right |

Filament model (render it in **WebGL2**, not Canvas 2D: a Canvas 2D version with CSS blur/blend layers made whole machines lag):
- Spine is a Catmull-Rom curve through 5 to 8 points; width grows away from a pinch point.
- 200 to 280 filaments per bundle. Lateral position is centre-weighted (sum of three randoms), plus a slow weave (`sin` of a twist along the length and time), so strands cross like a cable. Do not use `r * cos(theta)`: that piles strands up at the edges and the bundle reads as a hollow tube.
- Per-strand alpha is low (0.05 to 0.22). High alpha saturates additive blending to white and loses the lime.
- Palette is mostly saturated lime/yellow-green; teal and blue go on the outer strands; near-white only at the pinch.
- **Flow:** each strand is stroked a second time with a long dash (`setLineDash([70..270, 220..740])`) whose `lineDashOffset` decreases over time, so pulses of light run from the top-right corner down to the bottom.
- **Pulse:** global intensity `1 + 0.1 sin(2πt/3.1) + 0.045 sin(2πt/1.37)`, plus a radial hot core and a soft green haze at the pinch.
- **Glow:** a 1/4-resolution copy of the canvas drawn each frame onto a sibling canvas with CSS `blur(8px) brightness(1.2) saturate(1.45)` and `mix-blend-mode: screen`.
- **Extras:** glitter (tiny squares flowing along the bundle), out-of-focus bokeh discs, sparse ambient dust.
- **Intro:** strands draw in along their length over ~1.25s, top-right first, which reads as the light flowing in.
- Shapes drift slowly (control points move on sines) and the hero card follows the mouse with a small 3D tilt.
- Performance rules (learned the hard way):
  - One instanced draw per bundle: a shared strip of M spine samples x 2 sides, per-strand attributes as instance data. The CPU only samples the spine (~80 points) and uploads it as a uniform array; the shader computes offsets, weave, flow pulses (`mod(arc - t*speed, period)`), coverage and fades. Glitter, bokeh and dust are GL_POINTS positioned on the same spine in the shader. Additive blending `ONE, ONE` with premultiplied output.
  - Do the glow in the shader (a wide soft halo pass for ~20% of strands plus radial quads at the pinch), never with CSS `filter`/`mix-blend-mode` on an animating canvas.
  - Fades go in the fragment shader, not CSS `mask-image`. Fade strand ends too, or soft wide strands show hard straight cut-offs.
  - The ambient layer renders at 0.25x and lets the browser upscale it; no CSS blur.
  - No `backdrop-filter` over animating content except one small element. No SVG `animateMotion`, `<animate>` or SVG `filter` inside cards: move dots with `transform` on their own layer, or the whole card (and its shadows) repaints every frame.
  - One rAF loop for everything, capped at 60fps (also on 120Hz screens), reads before writes, and only render layers that are on screen (IntersectionObserver).
  - Measure real frame intervals and step down: fewer strands and no backdrop blur, then 30fps, then lower resolution.

Working implementation: `assets/examples/relay-replica.html`; reusable engine: `assets/ribbon-engine.js`.

## 7. Copy voice

Short, dry, specific, slightly self-deprecating, written by someone who has done the job.
Every headline is a plain claim with one opinionated italic word. Every number has a unit
and a mono caption saying exactly what it counts. Microcopy stays honest: `free for 14 days /
no card / no call with sales`, `If Relay cannot run it by the end of the trial, we will tell you so.`
No filler verbs, no hype adjectives, no exclamation marks.

## 8. Recipe to replicate

1. Pick the product's "flow" metaphor and give it one light source (ribbon, current, wind, signal).
2. Pick one accent that reads as "live" on black. Keep every other color greyscale.
3. Build 4-6 real product widgets (node graph, trace, approval, chart, dashboard, estimator)
   from actual domain data. These are the imagery; no stock photos needed.
4. Lay out: hero (text + product card) -> integrations strip -> 3 alternating feature rows ->
   accent morph moment -> two-card reliability -> bento dashboard -> stats + quotes ->
   pricing estimator -> accent CTA + footer.
5. Write headlines as plain claims, one italic serif word each.
6. Wire the motion catalog above, then run the taste-design Pre-Flight.
