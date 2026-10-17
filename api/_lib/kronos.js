// Kronos forecasts for the Kronos AI bot (Strategy Lab). Kronos (https://github.com/shiyu-coder/Kronos, MIT licence) is an open-source foundation model for candlesticks:
// it reads the last candles and writes out possible next candles. scripts/kronos_worker.py runs it; this file feeds it candles and keeps the answers.
// The model needs Python + PyTorch, so it runs only where the 24/7 runner has them (KRONOS=1, set by .github/workflows/bot.yml); the site itself only reads the stored forecasts.
// A forecast is made when a 5-minute candle closes at a quarter hour (9:45 ... 15:30 ET), from the 256 candles up to and including it, and stored by that candle's time,
// so a backtest, the chart and the live bot all read the same number and none of them can see anything later.
const { spawn } = require('child_process'), path = require('path'), L = require('./lab'), S = require('./settings'), db = require('./db');
const LOOK = 256, PRED = 12, SAMPLES = 8, SYMS = ['NQ', 'ES'], KEEP = 2500, WORKER = path.join(__dirname, '..', '..', 'scripts', 'kronos_worker.py');
let HIST = {}; try { HIST = require('./lab/kronos-hist.json'); } catch (_) {} // forecasts made ahead of time for a backtest (scripts/kronos-backfill.js)
const isDecision = x => (x.m + 5) % 15 === 0 && x.m + 5 >= 585 && x.m + 5 <= 930; // x.m = the candle's open, minutes after midnight ET
const rec = o => ({ t: o.t, c: o.last, q10: o.q10, q50: o.q50, q90: o.q90, p: o.pUp, hi: o.hi, lo: o.lo, m: o.mean[o.mean.length - 1] });

/* ---------- the worker process ---------- */
class Worker {
  constructor() { this.p = null; this.n = 0; this.wait = new Map(); this.buf = ''; this.tail = Promise.resolve(); }
  start() {
    if (this.p) return this.ready;
    // third-party code (the Kronos repo and its libraries): it gets a bare environment, never the database, session or broker secrets this process holds
    const keep = ['PATH', 'HOME', 'LANG', 'TMPDIR', 'HF_HOME', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'KRONOS_DIR', 'KRONOS_MODEL', 'KRONOS_THREADS'];
    const env = Object.fromEntries(keep.filter(k => process.env[k] != null).map(k => [k, process.env[k]])); env.KRONOS_DIR ||= 'Kronos'; env.HF_HUB_DISABLE_TELEMETRY = '1';
    const p = this.p = spawn(process.env.KRONOS_PY || 'python3', [WORKER], { env, stdio: ['pipe', 'pipe', 'inherit'] });
    this.buf = ''; let up, down; this.ready = new Promise((a, b) => { up = a; down = b; }); this.ready.catch(() => {});
    p.stdout.on('data', d => { this.buf += d; let i;
      while ((i = this.buf.indexOf('\n')) >= 0) { const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1); let m; try { m = JSON.parse(line); } catch (_) { continue; }
        if (m.ready) up(m); else { const w = this.wait.get(m.id); if (w) { this.wait.delete(m.id); m.ok ? w.ok(m.out) : w.no(new Error(m.error)); } } } });
    p.on('error', e => { down(e); this.fail(e); }); p.on('exit', code => { down(new Error('Kronos worker exited ' + code)); this.fail(new Error('Kronos worker stopped')); });
    return this.ready;
  }
  fail(e) { this.p = null; for (const w of this.wait.values()) w.no(e); this.wait.clear(); }
  stop() { try { this.p?.kill(); } catch (_) {} }
  ask(jobs, n = SAMPLES) { // one request at a time; every job has the same number of candles
    const run = async () => { await this.start(); const id = ++this.n;
      return new Promise((ok, no) => { const to = setTimeout(() => { this.wait.delete(id); no(new Error('Kronos timed out')); this.stop(); }, 20 * 6e4); this.wait.set(id, { ok: v => { clearTimeout(to); ok(v); }, no: e => { clearTimeout(to); no(e); } });
        this.p.stdin.write(JSON.stringify({ id, pred: PRED, n, jobs }) + '\n'); }); };
    return this.tail = this.tail.then(run, run);
  }
}
const W = new Worker();
const job = (b, i, key) => { const w = b.slice(i - LOOK + 1, i + 1); return { key, t: w.map(x => x.t / 1000), o: w.map(x => x.o), h: w.map(x => x.h), l: w.map(x => x.l), c: w.map(x => x.c), v: w.map(x => x.v) }; };
async function forecast(items) { // items: [{ b, i, key }] -> [{ key, t, last, mean, q10, q50, q90, pUp, hi, lo }]
  const out = await W.ask(items.map(it => job(it.b, it.i, it.key))); return out.map((o, k) => ({ ...o, t: items[k].b[items[k].i].t })); }

/* ---------- storage: the database (live) + the file (ahead of time), merged ---------- */
const C = new Map(); // sym -> { at, m: Map(t -> record) }
async function load(sym) {
  const hit = C.get(sym); if (hit && Date.now() - hit.at < 8e3) return hit.m;
  const m = new Map(); for (const r of HIST[sym] || []) m.set(r.t, r);
  try { for (const r of JSON.parse(await S.get('kronos:' + sym) || '[]')) m.set(r.t, r); } catch (_) {}
  C.set(sym, { at: Date.now(), m }); return m;
}
const warm = () => Promise.all(SYMS.map(load));
const cache = sym => C.get(sym)?.m || new Map(HIST[sym]?.map(r => [r.t, r]) || []); // what is loaded now (call warm() first)
async function save(sym, recs) {
  let cur = []; try { cur = JSON.parse(await S.get('kronos:' + sym) || '[]'); } catch (_) {}
  const m = new Map(cur.map(r => [r.t, r])); for (const r of recs) m.set(r.t, r);
  await S.set('kronos:' + sym, JSON.stringify([...m.values()].sort((a, b) => a.t - b.t).slice(-KEEP))); C.delete(sym);
}

/* ---------- the runner's job: forecast each symbol when a decision candle has just closed, only while someone's Kronos bot is on ---------- */
let busy = false, last = 0, hold = 0;
async function tick() {
  if (!process.env.KRONOS || busy || Date.now() - last < 2e4 || Date.now() < hold) return; busy = true; last = Date.now();
  try {
    if (!(await db.one("SELECT count(*)::int AS n FROM labbot b JOIN users u ON u.id=b.uid WHERE b.strat='kronos' AND b.enabled=true AND u.verified=true")).n) return;
    const due = [];
    for (const sym of SYMS) { const b = await L.bars5(sym, 15e3), i = L.closedUpto(b) - 1, x = b[i];
      if (!x || i < LOOK || !isDecision(x) || Date.now() - (x.t + 3e5) > 12 * 6e4 || (await load(sym)).has(x.t)) continue; due.push({ sym, b, i, key: sym }); }
    if (!due.length) return;
    const t0 = Date.now(), out = await forecast(due);
    for (const o of out) await save(o.key, [rec(o)]);
    console.log('kronos', out.map(o => `${o.key} ${(o.pUp * 100).toFixed(0)}% up, median ${o.q50}`).join('; '), `(${((Date.now() - t0) / 1e3).toFixed(0)}s)`);
  } catch (e) { hold = Date.now() + 5 * 6e4; W.stop(); throw e; // the model would not start or answer: try again in 5 minutes, not every 20 seconds
  } finally { busy = false; }
}
module.exports = { LOOK, PRED, SAMPLES, SYMS, isDecision, rec, forecast, load, warm, cache, save, tick, stop: () => W.stop() };
