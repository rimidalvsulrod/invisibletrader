#!/usr/bin/env node
// Screenshot a page at chosen scroll positions with WebGL enabled (software GL works headless).
//
//   node shoot.mjs <file.html | http://localhost:3000/path> <outDir> [--targets targets.json] [--auto 8]
//                  [--mobile] [--width 1440 --height 900] [--wait 2300]
//
// targets.json: [["00-hero", 0], ["03-glue", "#product", -110], ["08-morph", "#morph", "m:.5"]]
//   number      absolute scrollY
//   selector,o  element top + o px   ("m:.5" = 50% through a tall sticky section)
// --auto N      N evenly spaced positions over the page instead of targets.
// Prints console errors, horizontal overflow (scrollWidth) and, with --mobile, the elements causing it.
// Artifact-style HTML fragments (no <html>) are wrapped automatically.
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'; import { resolve, dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
function pw() { try { return require('playwright'); } catch { return require(join(execSync('npm root -g').toString().trim(), 'playwright')); } }
const { chromium } = pw();
// serve a local file's folder over http (ES modules do not load from file://)
import { createServer } from 'node:http'; import { extname } from 'node:path';
async function serveDir(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const srv = createServer((q, r) => { try { const f = join(dir, decodeURIComponent(q.url.split('?')[0])); r.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); } catch { r.writeHead(404); r.end(); } });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); return { srv, base: `http://127.0.0.1:${srv.address().port}/` };
}

const args = process.argv.slice(2), opt = n => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1]; }, flag = n => args.includes('--' + n);
const [src, out] = args; if (!src || !out) { console.log('usage: node shoot.mjs <page> <outDir> [--targets f.json|--auto N] [--mobile]'); process.exit(1); }
mkdirSync(out, { recursive: true });
let url = src;
if (!/^https?:/.test(src)) {
  let file = resolve(src); const html = readFileSync(file, 'utf8');
  if (!/<html/i.test(html)) { const w = join(dirname(file), '.__wrapped_' + file.split('/').pop()); writeFileSync(w, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' + html + '</html>'); file = w; }
  const sv = await serveDir(dirname(file)); globalThis.__srv = sv.srv; url = sv.base + file.split('/').pop();
}
const mobile = flag('mobile'), W = +(opt('width') || (mobile ? 390 : 1440)), H = +(opt('height') || (mobile ? 844 : 900)), wait = +(opt('wait') || 2300);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1800);
let targets = opt('targets') && existsSync(opt('targets')) ? JSON.parse(readFileSync(opt('targets'), 'utf8')) : null;
if (!targets) { const n = +(opt('auto') || 6), total = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight); targets = Array.from({ length: n }, (_, i) => [String(i).padStart(2, '0') + '-auto', Math.round(total * i / Math.max(1, n - 1))]); }
for (const [name, target, off] of targets) {
  await p.evaluate(([t, o]) => {
    let y; if (typeof t === 'number') y = t; else { const el = document.querySelector(t); if (!el) return; const r = el.getBoundingClientRect();
      y = typeof o === 'string' && o.startsWith('m:') ? r.top + scrollY + (r.height - innerHeight) * parseFloat(o.slice(2)) : r.top + scrollY + (o || 0); }
    scrollTo(0, y);
  }, [target, off]);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: join(out, `${mobile ? 'm-' : ''}${name}.jpg`), quality: 72 });
}
const sw = await p.evaluate(() => document.documentElement.scrollWidth);
console.log(`viewport ${W}x${H}  scrollWidth ${sw}${sw > W ? '  <-- horizontal overflow' : ''}`);
if (sw > W) console.log(await p.evaluate(vw => { const o = []; document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right <= vw + 1) return;
  for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== 'visible' || cs.position === 'fixed') return; }
  if (getComputedStyle(e).position !== 'fixed') o.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${(e.className.baseVal ?? e.className).toString().split(' ')[0]} right=${Math.round(r.right)}`); }); return o.slice(0, 10); }, W));
console.log('errors', errs.length ? errs : 'none'); console.log(`saved ${targets.length} screenshots to ${out}`);
await b.close(); if (globalThis.__srv) globalThis.__srv.close();
