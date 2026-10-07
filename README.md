# InvisibleTrader

Track public Polymarket International wallets and execute high-confidence signals on Polymarket US.
**Signals:** Polymarket International public wallet activity. **Orders:** Polymarket US.

- `public/` — the site (no build step)
- `api/proxy.js` — read-only proxy to Polymarket's APIs
- `api/auth.js` — owner login (single user)
- `api/bot.js` — Auto Trader settings/state (owner only)
- `api/cron.js` — runs the trading engine; call it every minute
- `api/_lib/engine.js` — the signal copier (international trade → matched Polymarket US market → IOC order)

Local dev: `npm install && DEV_PGMEM=1 ADMIN_PASSWORD=devpassword SESSION_SECRET=devsecretdevsecretdev node dev/server.js`

## Vercel environment variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (Vercel → Storage → Neon sets it) |
| `ADMIN_PASSWORD` | Your login password (8+ chars) |
| `SESSION_SECRET` | Long random string (32+ chars) |
| `CRON_SECRET` | Key for `/api/cron?key=…` |
| `POLYMARKET_US_KEY_ID`, `POLYMARKET_US_SECRET_KEY` | Polymarket US Key ID and Secret Key |
| `MAX_ORDER_USD` | Hard cap per order (default 25) |
| `TRADING_DISABLED` | `1` = kill switch |

**Run every minute:** create a free job at cron-job.org hitting `https://YOUR-SITE/api/cron?key=CRON_SECRET` every minute
(Vercel's free plan only allows daily crons).

## How markets are lined up
A copied buy is placed only if the Polymarket US market matches the international question: most words match, every number/date matches,
direction words (above/below/before/after/not…) are identical, both markets have compatible resolution dates, and the US price is within the slippage limit. The matcher rejects ambiguous candidates and logs every skip reason. When the signal trader sells, the bot closes its corresponding US position.
