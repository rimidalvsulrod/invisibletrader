# InvisibleTrader

Track the best Polymarket traders and copy them onto Kalshi.
**Data:** Polymarket (official P&L/volume, positions, trades). **Orders:** Kalshi.

- `public/` — the site (no build step)
- `api/proxy.js` — read-only proxy to Polymarket's APIs
- `api/auth.js` — owner login (single user)
- `api/bot.js` — Auto Trader settings/state (owner only)
- `api/cron.js` — runs the trading engine; call it every minute
- `api/_lib/engine.js` — the copy-trading engine (Polymarket signal → matched Kalshi market → order)

Local dev: `npm install && DEV_PGMEM=1 ADMIN_PASSWORD=devpassword SESSION_SECRET=devsecretdevsecretdev node dev/server.js`

## Vercel environment variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (Vercel → Storage → Neon sets it) |
| `ADMIN_PASSWORD` | Your login password (8+ chars) |
| `SESSION_SECRET` | Long random string (32+ chars) |
| `CRON_SECRET` | Key for `/api/cron?key=…` |
| `KALSHI_KEY_ID`, `KALSHI_PRIVATE_KEY` | Kalshi API key (RSA or Ed25519 PEM) |
| `KALSHI_ENV` | `demo` (default) or `prod` |
| `KALSHI_ALLOW_LIVE` | `yes` to allow real-money orders on `prod` |
| `MAX_ORDER_USD` | Hard cap per order (default 25) |
| `TRADING_DISABLED` | `1` = kill switch |

**Run every minute:** create a free job at cron-job.org hitting `https://YOUR-SITE/api/cron?key=CRON_SECRET` every minute
(Vercel's free plan only allows daily crons).

## How markets are lined up
A copied buy is placed only if the Kalshi market matches the Polymarket question: most words match, every number/date matches,
direction words (above/below/before/after/not…) are identical, both markets resolve within 3 days of each other,
and Kalshi's price is within the slippage limit of what the trader paid. Otherwise the bot logs "Skipped" with the reason.
When the copied trader sells, the bot sells (reduce-only, immediate-or-cancel).
