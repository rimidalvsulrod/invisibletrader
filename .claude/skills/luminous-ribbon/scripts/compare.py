#!/usr/bin/env python3
"""Side-by-side sheets: reference frame on the left, your build on the right, one row per pair.

  compare.py OUT.jpg ref1.jpg:mine1.jpg ref2.jpg:mine2.jpg ... [--ref-top 40] [--ref-height 900] [--w 720]

--ref-top/--ref-height trim the reference crop to the viewport (screen recordings often include a strip of
browser chrome or caption above the page). Rows are scaled to --w px wide each so a sheet of 3-4 rows stays
readable. Compare the background character first (density, colour, spread, focus), then positions, then sizes.
"""
import argparse
from PIL import Image

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out"); ap.add_argument("pairs", nargs="+")
    ap.add_argument("--ref-top", type=int, default=0); ap.add_argument("--ref-height", type=int, default=0); ap.add_argument("--w", type=int, default=720)
    a = ap.parse_args()
    rows = []
    for pair in a.pairs:
        ref, mine = pair.split(":")
        r = Image.open(ref).convert("RGB"); m = Image.open(mine).convert("RGB")
        if a.ref_top or a.ref_height:
            r = r.crop((0, a.ref_top, r.width, a.ref_top + (a.ref_height or r.height - a.ref_top)))
        h = int(a.w * m.height / m.width)
        rows.append((r.resize((a.w, h)), m.resize((a.w, h))))
    H = sum(r[0].height for r in rows)
    sheet = Image.new("RGB", (a.w * 2 + 10, H), (255, 0, 0)); y = 0
    for r, m in rows:
        sheet.paste(r, (0, y)); sheet.paste(m, (a.w + 10, y)); y += r.height
    sheet.save(a.out, quality=85); print(a.out)
