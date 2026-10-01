// Kalshi order/portfolio proxy. Credentials live ONLY in Vercel env vars:
//   KALSHI_KEY_ID, KALSHI_PRIVATE_KEY (PEM; "\n" escapes allowed), BOT_SECRET (password the UI must send),
//   KALSHI_ENV=demo|prod (default demo), KALSHI_ALLOW_LIVE=yes (required for prod),
//   MAX_ORDER_USD (default 25), TRADING_DISABLED=1 (kill switch).
const crypto = require('crypto');
const BASES = { demo: 'https://external-api.demo.kalshi.co/trade-api/v2', prod: 'https://external-api.kalshi.com/trade-api/v2' };
const env = () => ({
  keyId: process.env.KALSHI_KEY_ID, pem: (process.env.KALSHI_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  env: process.env.KALSHI_ENV === 'prod' ? 'prod' : 'demo', allowLive: process.env.KALSHI_ALLOW_LIVE === 'yes',
  secret: process.env.BOT_SECRET || '', maxUsd: Number(process.env.MAX_ORDER_USD) || 25, disabled: !!process.env.TRADING_DISABLED,
});
function sign(pem, msg) {
  const key = crypto.createPrivateKey(pem);
  const sig = key.asymmetricKeyType === 'ed25519' ? crypto.sign(null, Buffer.from(msg), key)
    : crypto.sign('sha256', Buffer.from(msg), { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST });
  return sig.toString('base64');
}
async function kalshi(c, method, endpoint, body) {
  const url = BASES[c.env] + endpoint, ts = String(Date.now());
  const headers = { 'KALSHI-ACCESS-KEY': c.keyId, 'KALSHI-ACCESS-TIMESTAMP': ts, 'KALSHI-ACCESS-SIGNATURE': sign(c.pem, ts + method + new URL(url).pathname), 'content-type': 'application/json' };
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  return { status: r.status, json };
}
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const dollars = cents => (cents / 100).toFixed(4);

module.exports = async (req, res) => {
  const c = env(), q = req.query || {}, body = req.body && typeof req.body === 'object' ? req.body : {};
  const op = q.op || body.op;
  try {
    if (op === 'markets') { // public market data, no credentials needed
      const base = BASES[q.env === 'demo' ? 'demo' : 'prod'];
      const p = new URLSearchParams({ status: 'open', limit: '1000', mve_filter: 'exclude' }); if (q.cursor) p.set('cursor', q.cursor);
      const r = await fetch(`${base}/markets?${p}`);
      res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(r.status).send(await r.text());
    }
    if (!c.secret) return res.status(503).json({ error: 'BOT_SECRET is not set on the server' });
    if (!same(req.headers['x-bot-secret'] || '', c.secret)) return res.status(401).json({ error: 'bad bot secret' });
    const configured = !!(c.keyId && c.pem);
    if (op === 'status') {
      const out = { configured, env: c.env, liveAllowed: c.env === 'demo' || c.allowLive, maxOrderUsd: c.maxUsd, disabled: c.disabled };
      if (configured) { const b = await kalshi(c, 'GET', '/portfolio/balance'); out.balance = b.json; out.balanceStatus = b.status; }
      return res.status(200).json(out);
    }
    if (!configured) return res.status(503).json({ error: 'KALSHI_KEY_ID / KALSHI_PRIVATE_KEY not set' });
    if (op === 'positions') { const r = await kalshi(c, 'GET', '/portfolio/positions?limit=200'); return res.status(r.status).json(r.json); }
    if (op === 'order') {
      if (c.disabled) return res.status(403).json({ error: 'trading disabled (TRADING_DISABLED)' });
      if (c.env === 'prod' && !c.allowLive) return res.status(403).json({ error: 'live trading not allowed (set KALSHI_ALLOW_LIVE=yes)' });
      const { ticker, side, count, price_cents, ref } = body;
      if (!/^[A-Za-z0-9._-]{3,80}$/.test(String(ticker))) return res.status(400).json({ error: 'bad ticker' });
      if (side !== 'yes' && side !== 'no') return res.status(400).json({ error: 'side must be yes|no' });
      if (!Number.isInteger(count) || count < 1 || count > 1000) return res.status(400).json({ error: 'count must be 1..1000' });
      if (!Number.isInteger(price_cents) || price_cents < 1 || price_cents > 99) return res.status(400).json({ error: 'price_cents must be 1..99' });
      const cost = count * price_cents / 100;
      if (cost > c.maxUsd) return res.status(400).json({ error: `order $${cost.toFixed(2)} exceeds MAX_ORDER_USD $${c.maxUsd}` });
      // V2 single-book quoting: bid = buy YES at p; ask = sell YES at p == buy NO at 1-p. IOC so nothing rests.
      const order = { ticker, client_order_id: String(ref || crypto.randomUUID()).slice(0, 64), side: side === 'yes' ? 'bid' : 'ask',
        count: count.toFixed(2), price: dollars(side === 'yes' ? price_cents : 100 - price_cents), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross' };
      const r = await kalshi(c, 'POST', '/portfolio/events/orders', order);
      return res.status(r.status).json({ ...r.json, _sent: order, _env: c.env, _cost: cost });
    }
    return res.status(400).json({ error: 'unknown op' });
  } catch (e) { return res.status(502).json({ error: String(e && e.message || e) }); }
};
module.exports.sign = sign;
