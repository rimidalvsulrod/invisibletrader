# Applying the look to an existing project

The goal: the person says "apply this" and their project gains the luminous ribbon background and the
matching UI treatment, without breaking their app, their content or their performance.

## 1. Read the project first (2 minutes, saves an hour)

- Framework and version: `package.json`. Next.js App Router (`src/app` or `app/`), Next Pages Router, Vite + React,
  Astro, SvelteKit, Vue/Nuxt, plain HTML. If the repo has an AGENTS.md / CLAUDE.md telling you to read framework
  docs first (newer Next.js versions do), do that before writing code.
- Styling: Tailwind v4 (`@import "tailwindcss"` in globals.css, `@tailwindcss/postcss` or `@tailwindcss/vite`),
  Tailwind v3 (`tailwind.config.*`), CSS modules, plain CSS.
- Brand: existing accent colour and fonts (globals.css tokens, tailwind theme, logo colour). Keep the brand accent
  unless the person asked for the lime look. Pass it as `accent`, the engine derives the strand palette from it.
- Page anatomy: which component is the hero, where sections are, whether there is a pricing/CTA zone, the
  layout file where a site-wide background belongs, whether the site is light or dark.
- Light-themed sites: the effect is additive light and needs a near-black background. Either switch the
  marketing pages to the dark look (say so in your summary) or scope it to a dark hero band. Do not put the
  ribbon over a white page; it will not show.

## 2. Copy the engine in

Copy from this skill's `assets/`:

| File | Where (examples) |
|---|---|
| `ribbon-engine.js` + `ribbon-engine.d.ts` | `src/components/ribbon/` (Next/Vite), `js/` (plain) |
| `RibbonBackground.tsx` | same folder as the engine (React projects only) |
| `luminous.css` | import once globally (e.g. at the top of `globals.css`: `@import "./luminous.css";`, or link it) |

TypeScript: the `.d.ts` makes `import('./ribbon-engine.js')` typed. If the project disallows `.js` imports, add
`"allowJs": true` or keep the `.d.ts` beside it (it is enough for `moduleResolution: bundler`).

## 3. Wire the three layers

| Layer | Where it goes | Notes |
|---|---|---|
| Hero ribbon | Absolutely fills a `position: relative; overflow: clip` wrapper around the hero. Best: wrap hero + the next short section (logos / integrations) so the lower arm keeps flowing past the fold | Content above it needs `position: relative; z-index: 1` |
| Ambient | One fixed canvas per page, in the root layout or page, before `main` | Hidden behind the hero automatically; then reshapes per `section` (or `[data-ribbon-shape]`) |
| Waves | Absolutely fills a relative wrapper around pricing + CTA (or any late, wide zone) | Optional; use when the page is long enough |

### Next.js App Router

```tsx
// src/app/(marketing)/page.tsx  (server component is fine; the ribbon components are client components)
import { RibbonHero, RibbonAmbient, RibbonWaves } from '@/components/ribbon/RibbonBackground';

export default function Page() {
  return (
    <div className="lum-page">
      <RibbonAmbient accent="#c3ff4c" />
      <div className="relative overflow-clip">
        <RibbonHero accent="#c3ff4c" />
        <Hero className="relative z-[1]" />
        <Logos className="relative z-[1]" />
      </div>
      <main className="relative z-[1]">...sections...</main>
      <div className="relative">
        <RibbonWaves accent="#c3ff4c" />
        <Pricing className="relative z-[1]" />
      </div>
    </div>
  );
}
```
The wrappers import the engine with a dynamic `import()` inside `useEffect`, so nothing runs on the server.
Use the same `accent` on every layer of a page so they share one engine and one animation loop.

### Vite + React

Same components. Put `<RibbonAmbient />` in `App.tsx` once; hero/waves inside their section wrappers.

### Plain HTML / static sites / single-file pages

```html
<canvas data-ribbon="ambient"></canvas>
<div class="hero-wrap"><canvas data-ribbon="hero"></canvas> ...hero... </div>
<script type="module">
  import { autoMount } from './ribbon-engine.js';
  autoMount({ accent: '#c3ff4c' });
</script>
```
Canvases position themselves (fixed for ambient, absolute fill for hero/waves). ES modules do not load from
`file://`; preview through any static server. For a single-file Artifact, paste the engine source into an inline
`<script type="module">` (its `export` statements are harmless there) and call `autoMount` below it.

### Vue, Svelte, Astro, anything else

`createRibbons()` on mount, `fx.hero(canvas)` etc., `fx.destroy()` on unmount. Import it client-side only.

## 4. Restyle to match (the part that makes it feel like "this", not just a background)

Apply in this order; stop where the brief stops:
1. **Ground**: page background `#040404` (or their darkest brand neutral), text `#f1f1ee`, body grey `#8d8d89`.
2. **Type**: display in Inter Tight 500 with tight tracking, body Inter, metadata in JetBrains Mono, one italic
   serif word per headline (Instrument Serif or another high-contrast italic; keep their font if they have one).
3. **Section headers**: tag pill with dot, headline left, one short explainer paragraph right (`.lum-sh`).
4. **Surfaces**: their cards become `.lum-glass` (dark translucent, 1px light border, 20px radius). At most one
   `.lum-frost` (real backdrop blur), usually the hero product card.
5. **Buttons**: primary `.lum-btn-accent`, secondary `.lum-btn-ghost`.
6. **Metadata**: timestamps, units, captions, nav status, footer column heads in `.lum-mono`, lowercase.
7. **Accent discipline**: the accent only marks what is live, chosen or clickable. Everything else greyscale.
8. **Reveal**: `.lum-reveal` blur-in on headings and cards (add `js` class on `<html>` and an
   IntersectionObserver that adds `in`; resting state stays visible without JS).

Keep their copy, routes, form fields, analytics IDs and information architecture. This is a visual layer.
With Tailwind v4 you can expose the tokens: `@theme { --color-accent: var(--lum-accent); --font-mono: var(--lum-mono); }`.

## 5. Verify before saying done

- Build or typecheck (`next build` / `tsc --noEmit` / `vite build`) and fix anything you introduced.
- Run the dev server and screenshot: `node scripts/shoot.mjs http://localhost:3000 out --auto 6`, then
  `--mobile`. Check: ribbon visible behind the hero, ambient appears after the hero, no horizontal overflow,
  text readable over the light (dim `alpha` or move content if a strand crosses body copy), no console errors.
- Performance: no `backdrop-filter` added to repeated cards, no CSS `filter` on the canvases, one ribbon engine
  per page. See `performance.md`.
- `prefers-reduced-motion`: the engine renders a still frame; nothing to add.
