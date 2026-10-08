#!/usr/bin/env python3
"""Decode a screen recording of a website into things you can actually look at.

Subcommands (all need ffmpeg/ffprobe on PATH and Pillow):
  probe  VIDEO OUT                 -> duration/size/fps, a ruler-annotated frame, and a suggested crop of the
                                      website region (works for vertical social videos with captions around the site)
  sheet  VIDEO OUT --crop X:Y:W:H  -> contact sheets (timestamped tiles) at --fps (default 5)
  crops  VIDEO OUT --crop .. --times 0.6,5.6,...  -> full-resolution crops upscaled to --width (default 1440 = CSS px)
  burst  VIDEO OUT --crop .. --start S --dur D     -> every frame in a window + a sheet of --n evenly spaced frames

Typical flow: probe -> look at probe.jpg -> sheet (whole video) -> crops (one per distinct section/state)
-> burst (a window where the page is NOT scrolling, to study ambient animation).
"""
import argparse, json, os, subprocess, sys
from PIL import Image, ImageDraw


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"command failed: {' '.join(cmd)}\n{r.stderr[-800:]}")
    return r.stdout


def info(video):
    out = json.loads(run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", video]))
    v = next(s for s in out["streams"] if s["codec_type"] == "video")
    num, den = (v.get("r_frame_rate", "30/1").split("/") + ["1"])[:2]
    return {"width": int(v["width"]), "height": int(v["height"]), "fps": round(float(num) / float(den or 1), 3), "duration": float(out["format"]["duration"])}


def frame_at(video, t, crop=None, width=None):
    vf = []
    if crop: vf.append(f"crop={crop.replace(':', ':')}")
    if width: vf.append(f"scale={width}:-1:flags=lanczos")
    cmd = ["ffmpeg", "-v", "error", "-ss", str(t), "-i", video, "-frames:v", "1"]
    if vf: cmd += ["-vf", ",".join(vf)]
    tmp = f"/tmp/_frame_{os.getpid()}.png"
    run(cmd + ["-y", tmp])
    return Image.open(tmp).convert("RGB")


def suggest_crop(video, meta, samples=28):
    """Rows/columns that change over time = the scrolling website; static captions and blurred padding do not."""
    small_w = 180
    frames = [frame_at(video, meta["duration"] * (i + .5) / samples, width=small_w).convert("L") for i in range(samples)]
    w, h = frames[0].size
    rows, cols = [0.0] * h, [0.0] * w
    grow, gcol = [0.0] * h, [0.0] * w  # spatial detail: the real page is sharp, blurred padding copies are not
    for a, b in zip(frames, frames[1:]):
        pa, pb = a.load(), b.load()
        for y in range(h):
            for x in range(w):
                d = abs(pa[x, y] - pb[x, y]); rows[y] += d; cols[x] += d
                if x: g = abs(pa[x, y] - pa[x - 1, y]); grow[y] += g; gcol[x] += g
    act = [i for i, v in enumerate(rows) if v > .3 * max(rows)]
    if act:
        gs = sorted(grow[i] for i in act); gthr = .35 * gs[int(len(gs) * .75)]
        rows = [v if grow[i] > gthr else 0 for i, v in enumerate(rows)]

    def band(v):
        m = max(v) or 1; on = [x > .3 * m for x in v]
        for i in range(1, len(on) - 1):  # close 1-row gaps
            if not on[i] and on[i - 1] and on[i + 1]: on[i] = True
        best = (0, 0); s = None
        for i, f in enumerate(on + [False]):
            if f and s is None: s = i
            if not f and s is not None:
                if i - s > best[1] - best[0]: best = (s, i)
                s = None
        return best

    sy = meta["height"] / h; sx = meta["width"] / w
    (y0, y1), (x0, x1) = band(rows), band(cols)
    # a fixed nav/footer barely changes between frames: grow the band through adjacent rows that are still sharp
    if act:
        lo = .12 * gthr  # upward only: fixed navs sit at the top; blurred padding below would leak in
        while y0 > 0 and grow[y0 - 1] > lo: y0 -= 1
    if x1 - x0 > .85 * w: x0, x1 = 0, w
    X, Y, W, H = int(x0 * sx), int(y0 * sy), int((x1 - x0) * sx), int((y1 - y0) * sy)
    return f"{W - W % 2}:{H - H % 2}:{X}:{Y}"


def cmd_probe(a):
    meta = info(a.video); os.makedirs(a.out, exist_ok=True)
    im = frame_at(a.video, meta["duration"] * .3)
    d = ImageDraw.Draw(im)
    for y in range(0, im.height, 50):
        d.line([(0, y), (im.width, y)], fill=(255, 0, 0) if y % 200 == 0 else (90, 0, 0)); d.text((2, y + 1), str(y), fill=(255, 255, 0))
    for x in range(0, im.width, 100):
        d.line([(x, 0), (x, im.height)], fill=(0, 90, 160)); d.text((x + 2, 2), str(x), fill=(0, 255, 255))
    im.save(os.path.join(a.out, "probe.jpg"), quality=88)
    meta["suggested_crop_WxH:X:Y"] = suggest_crop(a.video, meta)
    print(json.dumps(meta, indent=2))
    print(f"ruler frame: {os.path.join(a.out, 'probe.jpg')}  (crop format for other commands: W:H:X:Y)")


def cmd_sheet(a):
    os.makedirs(a.out, exist_ok=True)
    vf = []
    if a.crop: vf.append(f"crop={a.crop}")
    vf += [f"fps={a.fps}", f"scale={a.tile}:-1", "drawtext=text='%{pts\\:hms}':x=4:y=4:fontsize=14:fontcolor=white:box=1:boxcolor=black@0.6", f"tile={a.cols}x{a.rows}"]
    run(["ffmpeg", "-v", "error", "-i", a.video, "-vf", ",".join(vf), "-q:v", "3", os.path.join(a.out, "sheet_%02d.jpg")])
    print("\n".join(sorted(os.path.join(a.out, f) for f in os.listdir(a.out) if f.startswith("sheet_"))))


def cmd_crops(a):
    os.makedirs(a.out, exist_ok=True)
    for t in [x.strip() for x in a.times.split(",") if x.strip()]:
        p = os.path.join(a.out, f"c_{t}.jpg")
        frame_at(a.video, t, a.crop, a.width).save(p, quality=90); print(p)


def cmd_burst(a):
    os.makedirs(a.out, exist_ok=True)
    vf = (f"crop={a.crop}," if a.crop else "") + "null"
    run(["ffmpeg", "-v", "error", "-ss", str(a.start), "-t", str(a.dur), "-i", a.video, "-vf", vf, "-q:v", "2", os.path.join(a.out, "b_%04d.jpg")])
    files = sorted(f for f in os.listdir(a.out) if f.startswith("b_"))
    pick = [files[int(i * (len(files) - 1) / max(1, a.n - 1))] for i in range(min(a.n, len(files)))]
    ims = [Image.open(os.path.join(a.out, f)) for f in pick]; w, h = ims[0].size; cols = 3
    sheet = Image.new("RGB", (w * cols, h * ((len(ims) + cols - 1) // cols)))
    for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    if sheet.width > 2400: sheet = sheet.resize((2400, int(sheet.height * 2400 / sheet.width)))
    sp = os.path.join(a.out, "burst_sheet.jpg"); sheet.save(sp, quality=85)
    print(f"{len(files)} frames in {a.out}; sheet of {len(pick)}: {sp}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("probe"); p.add_argument("video"); p.add_argument("out"); p.set_defaults(f=cmd_probe)
    p = sub.add_parser("sheet"); p.add_argument("video"); p.add_argument("out"); p.add_argument("--crop"); p.add_argument("--fps", default="5")
    p.add_argument("--tile", type=int, default=360); p.add_argument("--cols", type=int, default=4); p.add_argument("--rows", type=int, default=4); p.set_defaults(f=cmd_sheet)
    p = sub.add_parser("crops"); p.add_argument("video"); p.add_argument("out"); p.add_argument("--crop"); p.add_argument("--times", required=True)
    p.add_argument("--width", type=int, default=1440); p.set_defaults(f=cmd_crops)
    p = sub.add_parser("burst"); p.add_argument("video"); p.add_argument("out"); p.add_argument("--crop"); p.add_argument("--start", type=float, default=0)
    p.add_argument("--dur", type=float, default=3); p.add_argument("--n", type=int, default=6); p.set_defaults(f=cmd_burst)
    a = ap.parse_args(); a.f(a)
