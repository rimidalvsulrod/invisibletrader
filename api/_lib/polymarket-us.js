// Polymarket US retail API client. Public market discovery is deliberately
// separate from the signed account/order API.
const crypto = require('crypto');
const API = 'https://api.polymarket.us', GATEWAY = 'https://gateway.polymarket.us';
const json = async r => { const text = await r.text(); try { return JSON.parse(text); } catch (_) { return { raw: text.slice(0, 300) }; } };

function privateKey(secret) {
  const seed = Buffer.from(String(secret || ''), 'base64').subarray(0, 32);
  if (seed.length !== 32) throw new Error('Polymarket US secret key must be base64-encoded Ed25519 key material');
  // RFC 8410 PKCS#8 wrapper for a raw Ed25519 32-byte seed.
  return crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
}
function headers(c, method, path) {
  const timestamp = String(Date.now());
  const signature = crypto.sign(null, Buffer.from(timestamp + method + path), privateKey(c.secret)).toString('base64');
  return { 'X-PM-Access-Key': c.keyId, 'X-PM-Timestamp': timestamp, 'X-PM-Signature': signature, 'content-type': 'application/json' };
}
async function call(c, method, path, body) {
  const r = await fetch(API + path, { method, headers: headers(c, method, path), body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, status: r.status, json: await json(r) };
}
async function pub(path) {
  const r = await fetch(GATEWAY + path); if (!r.ok) throw new Error(`Polymarket US market data: ${r.status}`); return json(r);
}
async function markets({ offset = 0, limit = 500, active = true, closed = false, slug } = {}) {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit), active: String(active), closed: String(closed) });
  if (slug) q.append('slug', slug); const r = await pub('/v1/markets?' + q); return r.markets || [];
}
async function allOpenMarkets() {
  const out = []; for (let offset = 0; offset < 20000; offset += 500) { const page = await markets({ offset }); out.push(...page); if (page.length < 500) break; } return out;
}
const balance = c => call(c, 'GET', '/v1/account/balances');
const positions = c => call(c, 'GET', '/v1/portfolio/positions');
const activities = c => call(c, 'GET', '/v1/portfolio/activities?limit=25');
function order(c, { slug, side, quantity, slippageBips }) {
  return call(c, 'POST', '/v1/orders', { marketSlug: slug, quantity, outcomeSide: side === 'no' ? 'OUTCOME_SIDE_NO' : 'OUTCOME_SIDE_YES', action: 'ORDER_ACTION_BUY', tif: 'TIME_IN_FORCE_IMMEDIATE_OR_CANCEL', synchronousExecution: true, maxBlockTime: '10', slippageTolerance: { bips: slippageBips, ticks: 0 }, manualOrderIndicator: 'MANUAL_ORDER_INDICATOR_AUTOMATIC' });
}
const closePosition = (c, slug, slippageBips) => call(c, 'POST', '/v1/order/close-position', { marketSlug: slug, synchronousExecution: true, maxBlockTime: '10', slippageTolerance: { bips: slippageBips, ticks: 0 } });
module.exports = { API, GATEWAY, call, markets, allOpenMarkets, balance, positions, activities, order, closePosition };
