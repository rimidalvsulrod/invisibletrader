// Kalshi REST client (RSA-PSS or Ed25519 request signing). Credentials come from Vercel env vars only.
const crypto = require('crypto');
const BASES = { demo: 'https://external-api.demo.kalshi.co/trade-api/v2', prod: 'https://external-api.kalshi.com/trade-api/v2' };
const creds = () => ({ keyId: process.env.KALSHI_KEY_ID, pem: (process.env.KALSHI_PRIVATE_KEY || '').replace(/\\n/g, '\n'), env: process.env.KALSHI_ENV === 'prod' ? 'prod' : 'demo' });
const configured = () => { const c = creds(); return !!(c.keyId && c.pem); };
function sign(pem, msg) {
  const key = crypto.createPrivateKey(pem);
  const sig = key.asymmetricKeyType === 'ed25519' ? crypto.sign(null, Buffer.from(msg), key)
    : crypto.sign('sha256', Buffer.from(msg), { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST });
  return sig.toString('base64');
}
async function call(method, endpoint, body) {
  const c = creds(), url = BASES[c.env] + endpoint, ts = String(Date.now());
  const r = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'KALSHI-ACCESS-KEY': c.keyId, 'KALSHI-ACCESS-TIMESTAMP': ts, 'KALSHI-ACCESS-SIGNATURE': sign(c.pem, ts + method + new URL(url).pathname), 'content-type': 'application/json' } });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch (e) { json = { raw: text.slice(0, 200) }; }
  return { ok: r.ok, status: r.status, json };
}
const dollars = cents => (cents / 100).toFixed(4);
// V2 single-book quoting: bid = buy YES, ask = sell YES (buy NO @q == ask @ 1-q, sell NO @q == bid @ 1-q).
// Immediate-or-cancel so nothing rests; sells are reduce_only so they can never open a position.
function orderBody({ ticker, side, action, count, priceCents, ref }) {
  const yesLeg = side === 'yes' ? priceCents : 100 - priceCents;
  const o = { ticker, client_order_id: String(ref || crypto.randomUUID()).slice(0, 64), side: (action === 'buy') === (side === 'yes') ? 'bid' : 'ask',
    count: Number(count).toFixed(2), price: dollars(yesLeg), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross' };
  if (action === 'sell') o.reduce_only = true; return o;
}
const placeOrder = p => call('POST', '/portfolio/events/orders', orderBody(p));
async function balance() {
  const r = await call('GET', '/portfolio/balance'); if (!r.ok) return { ok: false, status: r.status, error: r.json.error || r.json.message || r.json.raw || 'balance request failed' };
  const d = parseFloat(r.json.balance_dollars); return { ok: true, balance: !isNaN(d) ? d : typeof r.json.balance === 'number' ? r.json.balance / 100 : null };
}
async function openMarkets(env) { let cur = '', all = [];
  for (let i = 0; i < 6; i++) { const r = await fetch(`${BASES[env]}/markets?status=open&limit=1000&mve_filter=exclude${cur ? '&cursor=' + encodeURIComponent(cur) : ''}`); if (!r.ok) break; const j = await r.json(); all.push(...(j.markets || [])); cur = j.cursor; if (!cur) break; }
  return all; }
async function market(env, ticker) { const r = await fetch(`${BASES[env]}/markets/${encodeURIComponent(ticker)}`); return r.ok ? (await r.json()).market : null; }
module.exports = { sign, creds, configured, call, orderBody, placeOrder, balance, openMarkets, market };
