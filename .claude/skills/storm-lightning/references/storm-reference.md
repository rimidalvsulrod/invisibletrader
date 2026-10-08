# Storm reference

These measurements come from frame-by-frame luminance analysis of two real storm films: a 24fps blue-hour supercell
time-lapse and 60fps real-time night footage. Use them when tuning or explaining the effect.

## What real lightning does

| Phenomenon | Measured / observed | Engine (`lightning.js`) |
|---|---|---|
| Stepped leader | faint channel crawls out before the flash | `leader`: CG 60–150ms, crawler 200–450ms, drawn progressively at ~30% alpha with flicker (`_drawLeader`) |
| Return stroke rise | dark to peak in **1 frame** (<17ms at 60fps) | instant, no ease-in |
| Peak hold | 2–3 frames (~25–55ms) | `hold: rnd(25,55)` |
| Decay | exponential, ~45–90ms to near dark | `decay: rnd(45,90)`; the bolt channel decays 1.7× slower than the sky (afterglow) |
| Restrikes | 1–4 strokes in the same channel, 40–160ms apart, later ones 45–95% of the first | `makeStrokes`: 35% one, 30% two, 20% three, 15% four |
| Continuing current | some strokes stay bright 150–350ms | 20% chance per CG stroke, 12% for others |
| Flicker | ±10% shimmer during the peak | `1 - .12*random()` while holding |
| Where the light is | mostly cloud illumination; the bolt itself is often hidden | 45% of auto strikes are `cloud` (no channel) |
| Cloud lighting | billows facing the flash light up, thick cores silhouette dark, gaps glow, the whole sky goes lavender on big strikes | raymarched volume: shadowed light march toward the brightest flash, multiple-scattering term, ambient `uAmb` lift |
| Rhythm | long dark gaps, then clusters | Poisson timing at `frequency`/min; 35% chance of 1–2 follow-ups 0.25–1.5s later |
| CG channel | thick white core, coloured sheath, wide halo, downward-forking branches that thin and fade, bright attachment point | 4 stroke passes (halo, glow, sheath, core), recursive branches (max depth 3) biased downward, radial bloom at the ground |
| Anvil crawler | long horizontal "spider" across the sky, dendritic, often both directions from one origin | `buildCrawler`: 35–80% of viewport width, 55% chance of a second arm in the opposite direction, branch probability 0.11 |
| Occlusion | segments vanish behind cloud | per-chunk sinusoidal alpha dip on main channels; CG fades in over its first 8% (emerging from the cloud base) |
| Colour | night: lavender/violet; blue hour: steel blue-white; distant or low storms: pink/magenta | palettes `night`, `steel`, `dusk` |

## Clouds

The WebGL2 path bakes a 64³ tileable noise volume once on the GPU (R = perlin-worley, G = low-frequency worley fBm,
B = high-frequency worley fBm). It then raymarches a cloud deck between heights 1.0 and 3.8 (`BASE`, `TOP`). The camera
is pitched up 0.5 rad, so the cloud base fills the screen and the horizon sits near the bottom.

- **Coverage:** the `cover` option, modulated by a low-frequency weather map so towers and gaps form.
- **Shape:** flat dark base (`smoothstep(0,.05,h)`) and rounded tops whose height varies with the weather map.
- **Fluffiness:** detail worley erosion, stronger at the base (`mix(.55,.3,h)`).
- **Lighting:**
  - Each screen-space flash is projected into the cloud, 0.5 units above the base.
  - The brightest flash gets a 4-tap shadow march; the others use local density.
  - Light is mixed as 80% sharp transmittance and 20% soft multiple scattering.
- **Steps:** 72 on desktop, 40 when the viewport is narrower than 700px. Each frame blends 70% new over 30% previous (temporal smoothing) to remove raymarch grain.
- **Aerial perspective:** distant clouds fade to the sky colour.
- **WebGL1 fallback:** a 2D fBm shader with gradient-normal lighting (`FRAG1`).

## Tuning cheatsheet

| Want | Do |
|---|---|
| Calmer, distant storm | `frequency: 6, intensity: .7, mix: {cloud:.7, cg:.15, crawler:.15}` |
| Violent, close storm | `frequency: 24, intensity: 1.3, mix: {cloud:.3, cg:.45, crawler:.25}` |
| Only glow, no visible bolts | `bolts: false` |
| Clear sky with distant cells | `cover: .4` |
| Overcast deck | `cover: .85` |
| Faster on weak GPUs | `quality: .35` |
| Brand colour lightning | custom `palette` object; keep the sky values dark |
| Scripted moment (hero load, CTA) | `auto: false`, then call `storm.strike()` at chosen times |
| Thunder | listen to `lightning` events; play audio after `detail.delay` ms plus a distance delay, and start audio only after a user gesture |
