// Makes Kronos forecasts for past sessions so the Kronos AI bot can be backtested, and writes them to api/_lib/lab/kronos-hist.json.
// Each forecast uses only the candles up to its decision candle (the same call the live bot makes). It is slow on a CPU (about 15 s per forecast),
// so it samples 3 decision times a session: 9:45, 10:30 and 11:15 ET.   Usage:
//   KRONOS_PY=venv/bin/python KRONOS_DIR=Kronos node scripts/kronos-backfill.js [sessions=50] [NQ,ES]
const fs = require('fs'), path = require('path'), L = require('../api/_lib/lab'), ICT = require('../api/_lib/ict'), K = require('../api/_lib/kronos');
const FILE = path.join(__dirname, '..', 'api', '_lib', 'lab', 'kronos-hist.json'), N = Number(process.argv[2]) || 50, SYMS = (process.argv[3] || K.SYMS.join(',')).split(','), AT = [580, 625, 670], BATCH = 6;
(async () => {
  let hist = {}; try { hist = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
  for (const sym of SYMS) {
    const b = await L.bars5(sym, 0, '60d'), ses = ICT.sessions(b), have = new Set((hist[sym] || []).map(r => r.t)), todo = [];
    for (const S of ses.slice(-N)) for (let i = S.first; i <= S.last; i++) if (AT.includes(b[i].m) && b[i].date === S.date && i >= K.LOOK && !have.has(b[i].t)) todo.push({ b, i, key: sym });
    console.log(sym, todo.length, 'forecasts to make'); const t0 = Date.now();
    for (let k = 0; k < todo.length; k += BATCH) {
      const out = await K.forecast(todo.slice(k, k + BATCH)); hist[sym] = [...(hist[sym] || []), ...out.map(K.rec)].sort((a, c) => a.t - c.t);
      fs.writeFileSync(FILE, JSON.stringify(hist)); console.log(sym, Math.min(k + BATCH, todo.length) + '/' + todo.length, ((Date.now() - t0) / 6e4).toFixed(1) + ' min');
    }
  }
  K.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
