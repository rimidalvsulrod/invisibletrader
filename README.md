# InvisibleTrader

Polymarket trader tracker + Kalshi auto-trader. Static UI in `public/`, serverless API in `api/`.
Local dev: `node dev/server.js`.

## Auto Trader setup (Vercel → Settings → Environment Variables)
| Variable | Meaning |
|---|---|
| `BOT_SECRET` | Password the UI sends with every trading request. **Required** — without it nobody can place orders. |
| `KALSHI_KEY_ID` | Kalshi API key id |
| `KALSHI_PRIVATE_KEY` | The PEM private key (RSA or Ed25519). `\n` escapes are fine. |
| `KALSHI_ENV` | `demo` (default) or `prod` |
| `KALSHI_ALLOW_LIVE` | Must be `yes` for `prod` orders to be accepted |
| `MAX_ORDER_USD` | Hard per-order cap enforced on the server (default 25) |
| `TRADING_DISABLED` | Set to `1` to block all orders instantly (kill switch) |

Start with `KALSHI_ENV=demo` (create keys at demo.kalshi.co). Orders are immediate-or-cancel limit orders.
