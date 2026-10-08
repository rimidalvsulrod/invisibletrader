// Storm sky behind every page: slow drifting clouds (two parallax layers) and lightning that strikes every few seconds,
// lighting up the clouds around it. Plain 2D canvas under the ribbon. Tinted with the accent; dims for the light theme.
// Reduced motion: static clouds, no lightning.
(() => {
  const root = document.documentElement, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas'); cv.className = 'fxsky'; cv.setAttribute('aria-hidden', 'true'); document.body.prepend(cv);
  const g = cv.getContext('2d'), DPR = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, clouds = [], dark = true, acc = [63, 191, 134], bolt = null, next = 0, last = 0, rnd = Math.random;
  const R = (a, b) => a + rnd() * (b - a);
  const rgb = () => { const h = (getComputedStyle(root).getPropertyValue('--accent').trim() || '#3fbf86').replace('#', ''), n = parseInt(h.length == 3 ? h.replace(/./g, '$&$&') : h, 16); return [n >> 16, n >> 8 & 255, n & 255]; };
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

  // one cloud = many soft puffs on a flat-bottomed blob; a lit copy of the same shape is used for lightning flashes
  function sprite(w, h, col, alpha, seed) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 110; i++) { // many small puffs = billowy edges instead of one soft smudge
      const u = r(), px = w * (.1 + .8 * u), top = 1 - Math.pow(Math.abs(u - .5) * 2, 1.6); // taller in the middle
      const py = h * (.82 - .5 * top * Math.sqrt(r())), pr = h * (.07 + .15 * r()) * (.7 + .5 * top);
      const shade = mix(col, [0, 0, 0], Math.max(0, py / h - .35) * .6), a = alpha * (.55 + .45 * r()); // darker underneath
      const gr = x.createRadialGradient(px, py - pr * .25, 0, px, py, pr);
      gr.addColorStop(0, `rgba(${shade},${a})`); gr.addColorStop(.6, `rgba(${shade},${a * .5})`); gr.addColorStop(1, `rgba(${shade},0)`);
      x.fillStyle = gr; x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    return c;
  }
  const size = () => { W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0); };
  function build() {
    dark = root.dataset.theme !== 'light'; acc = rgb(); size();
    const base = dark ? mix([34, 38, 46], acc, .12) : [118, 124, 136], lit = mix([235, 240, 255], acc, .25);
    clouds = []; const n = Math.max(6, Math.round(W * H / 110000));
    for (let i = 0; i < n; i++) {
      const far = i % 2 == 0, w = R(320, 620) * (far ? .8 : 1.15), h = w * R(.42, .55), seed = 1 + Math.floor(rnd() * 1e6);
      clouds.push({ x: R(-w, W), y: R(-h * .3, H * (rnd() < .6 ? .45 : 1)) - h / 2, w, h, far,
        v: (far ? R(4, 8) : R(9, 16)), par: far ? .04 : .09,
        img: sprite(Math.round(w), Math.round(h), base, dark ? (far ? .28 : .42) : (far ? .045 : .07), seed),
        lit: dark ? sprite(Math.round(w), Math.round(h), lit, .4, seed) : null });
    }
    clouds.sort((a, b) => b.far - a.far);
  }
  // midpoint-displacement bolt with a few forks
  function path(x0, y0, x1, y1, rough, depth, out) {
    if (depth == 0) { out.push([x1, y1]); return; }
    const mx = (x0 + x1) / 2 + R(-1, 1) * rough, my = (y0 + y1) / 2 + R(-.3, .3) * rough;
    path(x0, y0, mx, my, rough / 2, depth - 1, out); path(mx, my, x1, y1, rough / 2, depth - 1, out);
  }
  function strike() {
    const L = document.querySelector('main')?.getBoundingClientRect().left || 0; // strike over the content, not behind the sidebar
    const tops = clouds.filter(c => c.y + c.h * .6 > 0 && c.y + c.h * .6 < H * .5 && c.x + c.w * .5 > L + 40 && c.x + c.w * .5 < W - 40);
    const c = tops.length ? tops[Math.floor(rnd() * tops.length)] : null, sheet = !c || rnd() < .25; // sheet lightning: flash only
    const x0 = c ? c.x + c.w * R(.3, .7) : R(L + 40, W - 40), y0 = c ? c.y + c.h * .62 : R(0, H * .2);
    const segs = [];
    if (!sheet) {
      const x1 = x0 + R(-.25, .25) * H, y1 = y0 + H * R(.35, .7), main = [[x0, y0]]; path(x0, y0, x1, y1, H * .12, 7, main); segs.push({ p: main, w: 1 });
      for (let k = 0, f = 1 + Math.floor(rnd() * 3); k < f; k++) { // forks branch off the main channel
        const s = main[Math.floor(R(.15, .7) * main.length)], ang = Math.atan2(y1 - y0, x1 - x0) + R(.35, .8) * (rnd() < .5 ? -1 : 1), L = H * R(.08, .22);
        const b = [s]; path(s[0], s[1], s[0] + Math.cos(ang) * L, s[1] + Math.sin(ang) * L, L * .25, 5, b); segs.push({ p: b, w: .5 });
      }
    }
    // flicker: main flash, a dip, one or two re-strikes, then fade
    const beats = [[0, 1], [70, .25], [120, .9], [190, .35], [250, rnd() < .5 ? .75 : .3], [520, 0]];
    bolt = { t0: performance.now(), x: x0, y: y0, segs, beats };
  }
  const level = t => { const B = bolt.beats; for (let i = 1; i < B.length; i++) if (t < B[i][0]) { const [ta, a] = B[i - 1], [tb, b] = B[i]; return a + (b - a) * ((t - ta) / (tb - ta)) ** 2; } return -1; };

  function draw(now) {
    const dt = Math.min(.1, (now - (last || now)) / 1000); last = now; const sy = scrollY;
    g.clearRect(0, 0, W, H);
    let fl = 0; if (bolt) { fl = level(now - bolt.t0); if (fl < 0) { bolt = null; fl = 0; } }
    for (const c of clouds) {
      c.x += c.v * dt; if (c.x > W + 20) { c.x = -c.w - R(0, 200); c.y = R(-c.h * .3, H * .9) - c.h / 2; }
      const y = c.y - (sy * c.par) % (H + c.h); // gentle parallax with scroll
      g.drawImage(c.img, c.x, y < -c.h ? y + H + c.h : y);
      if (fl && c.lit) { const d = Math.hypot(c.x + c.w / 2 - bolt.x, y + c.h / 2 - bolt.y), k = fl * Math.max(0, 1 - d / (W * .6)); // clouds near the strike light up
        if (k > .02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, k * (c.far ? .7 : 1)); g.drawImage(c.lit, c.x, y < -c.h ? y + H + c.h : y); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } }
    }
    if (bolt && fl > 0) {
      const [r, gg, b] = acc, glowC = dark ? mix([200, 215, 255], acc, .35) : mix([60, 70, 90], acc, .5);
      g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const halo = g.createRadialGradient(bolt.x, bolt.y, 0, bolt.x, bolt.y, H * .7); // the sky around the strike brightens
      halo.addColorStop(0, `rgba(${glowC},${(dark ? .22 : .06) * fl})`); halo.addColorStop(1, `rgba(${glowC},0)`); g.fillStyle = halo; g.fillRect(0, 0, W, H);
      g.lineJoin = g.lineCap = 'round';
      for (const s of bolt.segs) {
        g.beginPath(); s.p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        for (const [lw, a, col] of [[14, .08, `${r},${gg},${b}`], [6, .22, glowC], [2.4 * s.w + .6, .55, glowC], [1.1 * s.w + .3, .95, dark ? '255,255,255' : glowC]]) {
          g.lineWidth = lw * (s.w < 1 ? .7 : 1); g.strokeStyle = `rgba(${col},${a * fl * (dark ? 1 : .8)})`; g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
    if (!reduce && now > next && !bolt) { strike(); next = now + R(3500, 9000); }
    if (!reduce) requestAnimationFrame(draw);
  }
  build(); next = performance.now() + 1500;
  if (reduce) draw(performance.now()); else requestAnimationFrame(draw);
  let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { innerWidth == W ? size() : build(); if (reduce) draw(performance.now()); }, 150); });
  new MutationObserver(() => { build(); if (reduce) draw(performance.now()); }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
})();
