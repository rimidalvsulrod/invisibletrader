#!/usr/bin/env python3
"""Turn ambient animation into numbers: pulse period, flow direction, intro order, scroll vs still windows.

  measure_motion.py VIDEO --crop W:H:X:Y --start 0 --dur 5 --region core:240,300,290,350 --region upper:560,40,700,120 ...
      Mean luminance per region over time (regions in crop pixel coords at native video resolution).
      Prints a table every --step seconds plus the dominant period per region (autocorrelation).
      Reading it: regions peaking one after another along a path = light flowing that way;
      everything dark for the first frames then lighting up in sequence = a draw-in intro.

  measure_motion.py VIDEO --crop W:H:X:Y --activity
      Mean absolute frame-to-frame difference every 0.2s for the whole clip: high = scrolling,
      low = page still (use those windows to study the background animation on its own).
"""
import argparse, os, subprocess, sys, tempfile
from PIL import Image, ImageChops, ImageStat


def frames(video, crop, start, dur, fps):
    d = tempfile.mkdtemp(prefix="mm_")
    vf = (f"crop={crop}," if crop else "") + f"fps={fps}"
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start)] + (["-t", str(dur)] if dur else []) + ["-i", video, "-vf", vf, "-q:v", "3", os.path.join(d, "f_%05d.jpg")]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-600:])
    return [os.path.join(d, f) for f in sorted(os.listdir(d))]


def period(xs, fps):
    n = len(xs); m = sum(xs) / n; v = [x - m for x in xs]; den = sum(x * x for x in v) or 1
    best, lag = 0, 0
    for L in range(int(fps * .6), n // 2):
        c = sum(v[i] * v[i + L] for i in range(n - L)) / den
        if c > best: best, lag = c, L
    return (lag / fps, best) if lag else (None, 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video"); ap.add_argument("--crop"); ap.add_argument("--start", type=float, default=0); ap.add_argument("--dur", type=float, default=5)
    ap.add_argument("--fps", type=float, default=30); ap.add_argument("--step", type=float, default=.1)
    ap.add_argument("--region", action="append", default=[], help="name:x0,y0,x1,y1")
    ap.add_argument("--activity", action="store_true")
    a = ap.parse_args()
    if a.activity:
        fs = frames(a.video, a.crop, 0, None, 5); prev = None
        print("time   activity (mean abs diff, >6 usually = scrolling)")
        for i, f in enumerate(fs):
            im = Image.open(f).convert("L").resize((180, 120))
            if prev is not None:
                v = ImageStat.Stat(ImageChops.difference(im, prev)).mean[0]
                print(f"{i / 5:5.1f}s {v:6.2f} {'#' * int(min(60, v * 3))}")
            prev = im
        sys.exit()
    if not a.region: sys.exit("give at least one --region name:x0,y0,x1,y1")
    regs = [(r.split(":")[0], tuple(int(v) for v in r.split(":")[1].split(","))) for r in a.region]
    fs = frames(a.video, a.crop, a.start, a.dur, a.fps)
    series = {n: [] for n, _ in regs}
    for f in fs:
        im = Image.open(f).convert("L")
        for n, box in regs: series[n].append(ImageStat.Stat(im.crop(box)).mean[0])
    every = max(1, int(round(a.step * a.fps)))
    print("time   " + " ".join(f"{n:>8}" for n, _ in regs))
    for i in range(0, len(fs), every):
        print(f"{a.start + i / a.fps:5.2f}s " + " ".join(f"{series[n][i]:8.1f}" for n, _ in regs))
    print()
    for n, _ in regs:
        xs = series[n]; p, c = period(xs, a.fps); peak = xs.index(max(xs)) / a.fps + a.start
        print(f"{n:>8}: mean {sum(xs) / len(xs):6.1f}  range {min(xs):6.1f}-{max(xs):6.1f}  first peak {peak:5.2f}s  period {f'{p:.2f}s (r={c:.2f})' if p else 'none'}")
