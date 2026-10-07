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
async function pub(path) { // retries briefly on rate limits / server hiccups
  for (let i = 0; ; i++) { const r = await fetch(GATEWAY + path);
    if (r.ok) return json(r); if (i >= 2 || (r.status !== 429 && r.status < 500)) throw new Error(`Polymarket US market data: ${r.status}`);
    await new Promise(z => setTimeout(z, 400 * (i + 1))); }
}
async function markets({ offset = 0, limit = 500, active = true, closed = false, slug } = {}) {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit), active: String(active), closed: String(closed) });
  if (slug) q.append('slug', slug); const r = await pub('/v1/markets?' + q); return r.markets || [];
}
// live best bid/offer for one market (public); prices are YES prices: buy YES at bestAsk, buy NO at 1 - bestBid
async function bbo(slug) { const d = (await pub(`/v1/markets/${encodeURIComponent(slug)}/bbo`)).marketData || {}; const v = x => Number(x?.value);
  return { open: d.state === 'MARKET_STATE_OPEN', state: d.state, ask: v(d.bestAsk), bid: v(d.bestBid), settle: v(d.settlementPx) }; }
// every open NON-sports market (sports are looked up one by one by exact slug; all ~78k markets would be ~220 MB)
const NON_SPORTS = ['politics', 'culture', 'crypto', 'macro', 'climate', 'technology', 'finance', 'geopolitics', 'science', 'economics', 'world', 'business', 'entertainment', 'mentions'];
async function allOpenMarkets() {
  const out = [], cats = NON_SPORTS.map(c => 'categories=' + c).join('&');
  for (let offset = 0; offset < 200000; offset += 500) { const r = await pub(`/v1/markets?limit=500&offset=${offset}&active=true&closed=false&${cats}`); const page = r.markets || []; out.push(...page); if (page.length < 500) break; }
  return out;
}
const MKT = new Map(); // slug -> {t, m}; null m = not listed
async function marketBySlug(slug) {
  const c = MKT.get(slug); if (c && Date.now() - c.t < 6e4) return c.m;
  const r = await fetch(`${GATEWAY}/v1/market/slug/${encodeURIComponent(slug)}`); let m = null;
  if (r.ok) { const j = await json(r); m = j.market && j.market.active && !j.market.closed ? j.market : null; } else if (r.status >= 500) throw new Error(`Polymarket US market data: ${r.status}`);
  if (MKT.size > 2000) MKT.clear(); MKT.set(slug, { t: Date.now(), m }); return m;
}
const balance = c => call(c, 'GET', '/v1/account/balances');
const positions = c => call(c, 'GET', '/v1/portfolio/positions');
const activities = c => call(c, 'GET', '/v1/portfolio/activities?limit=25');
function order(c, { slug, side, quantity, slippageBips }) {
  return call(c, 'POST', '/v1/orders', { marketSlug: slug, quantity, outcomeSide: side === 'no' ? 'OUTCOME_SIDE_NO' : 'OUTCOME_SIDE_YES', action: 'ORDER_ACTION_BUY', tif: 'TIME_IN_FORCE_IMMEDIATE_OR_CANCEL', synchronousExecution: true, maxBlockTime: '10', slippageTolerance: { bips: slippageBips }, manualOrderIndicator: 'MANUAL_ORDER_INDICATOR_AUTOMATIC' });
}
const closePosition = (c, slug, slippageBips) => call(c, 'POST', '/v1/order/close-position', { marketSlug: slug, synchronousExecution: true, maxBlockTime: '10', slippageTolerance: { bips: slippageBips } });
module.exports = { API, GATEWAY, call, markets, bbo, marketBySlug, allOpenMarkets, balance, positions, activities, order, closePosition };
