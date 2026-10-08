#!/usr/bin/env node
// Frame-rate check at several scroll positions, optionally A/B against another build.
//
//   node perf.mjs <page-or-url> [--at 0,3200,6000] [--vs other.html]
//
// Headless Chrome here renders WebGL in software (SwiftShader), so absolute fps is far below a real GPU.
// Use it RELATIVELY: compare two builds or toggle one feature at a time (copy the page, disable a pass,
// re-run) to find what costs the most. Real-device numbers come from the user.
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs'; import { resolve, dirname, join } from 'node:path';
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

const args = process.argv.slice(2), opt = n => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1]; };
const pages = [args[0], opt('vs')].filter(Boolean), at = (opt('at') || '0,2400,4800').split(',').map(Number);
const servers = [];
async function toUrl(src) {
  if (/^https?:/.test(src)) return src; let f = resolve(src); const h = readFileSync(f, 'utf8');
  if (!/<html/i.test(h)) { const w = join(dirname(f), '.__wrapped_' + f.split('/').pop()); writeFileSync(w, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + h + '</html>'); f = w; }
  const sv = await serveDir(dirname(f)); servers.push(sv.srv); return sv.base + f.split('/').pop();
}
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const src of pages) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto(await toUrl(src)); await p.waitForTimeout(2500);
  const row = [];
  for (const y of at) {
    await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(1200);
    const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / 3); })(); }));
    row.push(`y=${y}: ${fps.toFixed(1)}fps`);
  }
  console.log(src.split('/').pop().padEnd(28), row.join('   '));
  await p.close();
}
await b.close(); servers.forEach(s => s.close());
