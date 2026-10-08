#!/usr/bin/env python3
"""Sample exact colours from a frame.

  sample_colors.py IMAGE name:x,y [name:x,y ...]   -> hex of a 5x5 average at each point (pick flat areas, not text edges)
  sample_colors.py IMAGE --palette 10              -> dominant colours with share, near-black/near-white grouped
"""
import sys
from PIL import Image

if __name__ == "__main__":
    if len(sys.argv) < 3: sys.exit(__doc__)
    im = Image.open(sys.argv[1]).convert("RGB")
    if sys.argv[2] == "--palette":
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        q = im.resize((360, int(360 * im.height / im.width))).quantize(colors=n, method=Image.Quantize.MEDIANCUT)
        pal = q.getpalette(); counts = sorted(q.getcolors(), reverse=True); total = sum(c for c, _ in counts)
        for c, i in counts:
            r, g, b = pal[i * 3:i * 3 + 3]
            print(f"#{r:02x}{g:02x}{b:02x}  {100 * c / total:5.1f}%")
        sys.exit()
    for arg in sys.argv[2:]:
        name, xy = arg.split(":"); x, y = (int(v) for v in xy.split(","))
        px = [im.getpixel((min(im.width - 1, max(0, x + dx)), min(im.height - 1, max(0, y + dy)))) for dx in range(-2, 3) for dy in range(-2, 3)]
        r, g, b = (sum(p[i] for p in px) // 25 for i in range(3))
        print(f"{name:16} #{r:02x}{g:02x}{b:02x}  rgb({r},{g},{b})")
