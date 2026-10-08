# Rebuilding a website 1:1 from a screen recording

Used when the person sends a video (or screenshots) of a site and wants it replicated, or wants "this" effect
and the effect only exists in a recording. Expect 3 to 5 compare-and-fix rounds; the first build is never 1:1.

## 1. Decode the video

```bash
python3 scripts/extract_frames.py probe VIDEO work/probe        # size, fps, suggested crop, ruler frame
```
Look at `probe.jpg` and confirm the crop (format `W:H:X:Y`). Vertical social videos usually have a caption
above the site and a blurred copy below; the crop is the sharp middle band. The site was recorded at some
browser width; scaling the crop to 1440px wide gives (close to) CSS px, so measure in those coordinates.

```bash
python3 scripts/extract_frames.py sheet VIDEO work/sheets --crop W:H:X:Y --fps 5     # whole video as timestamped tiles
python3 scripts/measure_motion.py VIDEO --crop W:H:X:Y --activity                     # when is it scrolling vs still
python3 scripts/extract_frames.py crops VIDEO work/crops --crop W:H:X:Y --times 0.6,5.6,6.8,...  # 1440px-wide stills
```
Take one crop per distinct section and per state change (before/after an animation). Read every crop at full
size: transcribe copy verbatim, note positions and sizes in px, list every widget and what moves.

## 2. Study the motion separately from the scrolling

Pick a still window from `--activity` (the hero before the first scroll is ideal):
```bash
python3 scripts/extract_frames.py burst VIDEO work/burst --crop W:H:X:Y --start 0 --dur 5 --n 6
python3 scripts/measure_motion.py VIDEO --crop W:H:X:Y --start 0.4 --dur 5 \
  --region core:x0,y0,x1,y1 --region upperArm:... --region lowerArm:...
```
- Regions that brighten one after another along a path = light flowing that way.
- Dark first frames that light up in sequence = a draw-in intro (note the order).
- A slow periodic swing in the brightest region = the breathing pulse (period from the autocorrelation).
- Compare consecutive scroll frames: does the background move with the page (absolute layer) or stay put
  (fixed layer)? Does it sharpen or blur by section? Each answer is a separate layer.

## 3. Measure tokens

```bash
python3 scripts/sample_colors.py work/crops/c_0.6.jpg bg:40,300 accent:110,690 card:300,880
python3 scripts/sample_colors.py work/crops/c_0.6.jpg --palette 8
```
Sample flat areas, not text edges. Note font families by shape (geometric/grotesk sans, italic serif accent,
mono for metadata), sizes from cap heights, radii, line weights.

## 4. Build

Single HTML file (or the project's framework). Structure: tokens on `:root`, then sections top to bottom in
the recorded order with the recorded copy. Backgrounds via the ribbon engine layers; widgets as real HTML/SVG
UI, never screenshots. Keep the copy 1:1. If the recorded brand is a real company, keep the layout and motion
but rename the brand or label the page as a design recreation, and never present invented testimonials or
figures as real.

## 5. Compare loop

```bash
node scripts/shoot.mjs build.html work/shots --targets targets.json      # same scroll positions as the crops
python3 scripts/compare.py work/cmp1.jpg work/crops/c_0.6.jpg:work/shots/00-hero.jpg ... --ref-top 40 --ref-height 900
```
Look at 3 or 4 pairs per sheet and fix in this order:
1. Background character: density, colour (white blow-out vs saturated accent), spread, focus, where it sits.
2. Positions: hero card, headline, section starts (measure the offset in px, change the CSS, re-shoot).
3. Sizes: font sizes from text widths, card heights, gaps.
4. Details: copy, icons, states.
Then `--mobile` for overflow, then `perf.mjs`. Ship when the remaining differences are ones you can name
(e.g. "photos replaced with illustrations, true 3D approximated in 2D").

## Worked example

`assets/examples/relay-replica.html` is the full result of this process for the "Relay" recording: nav,
hero with live workflow card, integrations row, three feature rows (run trace, Slack approval, isometric bars),
scroll-driven icon-to-panel morph, reliability cards, bento dashboard, count-up stats, quotes, pricing
estimator, CTA and footer. Reuse its components when a request matches them.
