// Alpaca (stocks) client. Keys belong to one user and are stored encrypted; paper keys trade Alpaca's free paper account.
const db = require('./db'), S = require('./settings'), { err } = require('./util');
const TRADE = paper => paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets', DATA = 'https://data.alpaca.markets';
const hdr = c => ({ 'APCA-API-KEY-ID': c.key, 'APCA-API-SECRET-KEY': c.secret, 'content-type': 'application/json' });
async function req(c, method, url, body) {
  const r = await fetch(url, { method, headers: hdr(c), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch (_) { j = { message: t.slice(0, 200) }; }
  if (!r.ok) throw err(r.status === 401 || r.status === 403 ? 400 : 502, `Alpaca: ${j.message || r.status}`); return j;
}
const trade = (c, m, p, b) => req(c, m, TRADE(c.paper) + p, b);
module.exports = {
  account: c => trade(c, 'GET', '/v2/account'),
  clock: c => trade(c, 'GET', '/v2/clock'),
  positions: c => trade(c, 'GET', '/v2/positions'),
  buy: (c, sym, notional) => trade(c, 'POST', '/v2/orders', { symbol: sym, notional: notional.toFixed(2), side: 'buy', type: 'market', time_in_force: 'day' }),
  buyQty: (c, sym, qty) => trade(c, 'POST', '/v2/orders', { symbol: sym, qty: String(qty), side: 'buy', type: 'market', time_in_force: 'day' }),
  last: (c, sym) => req(c, 'GET', `${DATA}/v2/stocks/${encodeURIComponent(sym)}/trades/latest`).then(j => Number(j.trade?.p)),
  sell: (c, sym, qty) => trade(c, 'POST', '/v2/orders', { symbol: sym, qty: String(qty), side: 'sell', type: 'market', time_in_force: 'day' }),
  close: (c, sym) => trade(c, 'DELETE', `/v2/positions/${encodeURIComponent(sym)}`),
  order: (c, id) => trade(c, 'GET', `/v2/orders/${id}`),
  asset: (c, sym) => trade(c, 'GET', `/v2/assets/${encodeURIComponent(sym)}`),
  news: (c, after) => req(c, 'GET', `${DATA}/v1beta1/news?limit=50&sort=desc${after ? `&start=${encodeURIComponent(after)}` : ''}`),
  hdr,
  async getCreds(uid) { const u = await db.one('SELECT alpaca FROM users WHERE id=$1', [uid]); if (!u?.alpaca) return null; const j = JSON.parse(u.alpaca); return { key: j.key, secret: await S.dec(j.secret), paper: !!j.paper }; },
  async saveCreds(uid, c) { await db.q('UPDATE users SET alpaca=$2 WHERE id=$1', [uid, JSON.stringify({ key: c.key, secret: await S.enc(c.secret), paper: !!c.paper })]); },
  clearCreds: uid => db.q('UPDATE users SET alpaca=NULL WHERE id=$1', [uid]),
};
