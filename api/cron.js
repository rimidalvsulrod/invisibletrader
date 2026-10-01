// Called every minute by a scheduler (cron-job.org, GitHub Actions, or Vercel Cron on Pro). Protected by CRON_SECRET.
const { handler, err, same } = require('./_lib/util');
const E = require('./_lib/engine');
module.exports = handler(async (req, body, q) => {
  const key = q.key || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET) throw err(503, 'CRON_SECRET is not set'); if (!same(key, process.env.CRON_SECRET)) throw err(401, 'bad key');
  return E.run();
});
