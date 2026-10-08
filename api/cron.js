// Runs the trading engine. Safe to call often: it runs at most once per 4s and never twice at once.
// Called by: the GitHub Actions schedule in .github/workflows/bot.yml, the Auto Trader page while open, or any pinger.
// Set CRON_SECRET in Vercel only if you want to require ?key=… (optional).
const { handler, err, same } = require('./_lib/util');
const E = require('./_lib/engine');
module.exports = handler(async (req, body, q) => {
  if (process.env.CRON_SECRET && !same(q.key || String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), process.env.CRON_SECRET)) throw err(401, 'bad key');
  const [copy] = await Promise.all([E.runAll(undefined, 4e3), require('./_lib/btc').tick().catch(e => ({ error: e.message }))]);
  return copy;
});
