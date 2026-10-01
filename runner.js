// Runs the trading engine in a loop (used by .github/workflows/bot.yml). Needs DATABASE_URL.
// Safe alongside other runners and the site: the engine's database lock lets only one check run at a time.
const E = require('./api/_lib/engine');
const GAP = 2000, end = Date.now() + (Number(process.env.RUN_MINUTES) || 130) * 6e4;
let stop = false; for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop = true; });
(async () => {
  let n = 0;
  while (!stop && Date.now() < end) {
    const t = Date.now();
    const r = await E.run(undefined, GAP - 500).catch(e => ({ error: String(e.message || e) }));
    if (r.error || r.trades) console.log(new Date().toISOString(), JSON.stringify(r));
    if (++n % 300 === 0) console.log(new Date().toISOString(), `${n} checks`);
    await new Promise(z => setTimeout(z, Math.max(0, GAP - (Date.now() - t))));
  }
  process.exit(0);
})();
