// Alpaca (stocks) client. Keys belong to one user and are stored encrypted; paper keys trade Alpaca's free paper account.
const db = require('./db'), S = require('./settings'), { err } = require('./util');
const TRADE = paper => paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets', DATA = 'https://data.alpaca.markets';
const hdr = c => ({ 'APCA-API-KEY-ID': c.key, 'APCA-API-SECRET-KEY': c.secret, 'content-type': 'application/json' });
async function req(c, method, url, body) {
  const r = await fetch(url, { method, headers: hdr(c), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch (_) { j = { message: t.slice(0, 200) }; }
  if (!r.ok) throw err(r.status === 401 || r.status === 403 ? 400 : 502, `Alpaca: ${j.message || r.status}`); return j;
}
const alpacaFrom = async (s, uid) => { const j = JSON.parse(s); return { uid, key: j.key, secret: await S.dec(j.secret), paper: !!j.paper }; };
const trade = (c, m, p, b) => req(c, m, TRADE(c.paper) + p, b);
const raw = {
  account: c => trade(c, 'GET', '/v2/account'),
  clock: c => trade(c, 'GET', '/v2/clock'),
  positions: c => trade(c, 'GET', '/v2/positions'),
  buy: (c, sym, notional) => trade(c, 'POST', '/v2/orders', { symbol: sym, notional: notional.toFixed(2), side: 'buy', type: 'market', time_in_force: 'day' }),
  buyQty: (c, sym, qty) => trade(c, 'POST', '/v2/orders', { symbol: sym, qty: String(qty), side: 'buy', type: 'market', time_in_force: 'day' }),
  last: (c, sym) => req(c, 'GET', `${DATA}/v2/stocks/${encodeURIComponent(sym)}/trades/latest`).then(j => Number(j.trade?.p)),
  sell: (c, sym, qty) => trade(c, 'POST', '/v2/orders', { symbol: sym, qty: String(qty), side: 'sell', type: 'market', time_in_force: 'day' }),
  close: (c, sym) => trade(c, 'DELETE', `/v2/positions/${encodeURIComponent(sym)}`),
  order: (c, id) => trade(c, 'GET', `/v2/orders/${id}`),
  orderNested: (c, id) => trade(c, 'GET', `/v2/orders/${id}?nested=true`), // includes the stop / target legs of a bracket
  cancel: (c, id) => trade(c, 'DELETE', `/v2/orders/${id}`),
  // market entry with a protective stop and a profit target attached (whole shares only; Alpaca does not allow fractional brackets)
  bracket: (c, o) => trade(c, 'POST', '/v2/orders', { symbol: o.symbol, qty: String(o.qty), side: o.side, type: 'market', time_in_force: 'day', order_class: 'bracket',
    take_profit: { limit_price: o.tp.toFixed(2) }, stop_loss: { stop_price: o.sl.toFixed(2) } }),
  asset: (c, sym) => trade(c, 'GET', `/v2/assets/${encodeURIComponent(sym)}`),
  // daily bars (split + dividend adjusted) for several symbols, oldest first. IEX feed: the one free accounts may query.
  async bars(c, syms, startISO) { const out = {}; let tok = '';
    for (let i = 0; i < 12; i++) { const j = await req(c, 'GET', `${DATA}/v2/stocks/bars?symbols=${syms.map(encodeURIComponent).join(',')}&timeframe=1Day&start=${encodeURIComponent(startISO)}&limit=10000&adjustment=all&feed=iex${tok ? '&page_token=' + tok : ''}`);
      for (const [k, a] of Object.entries(j.bars || {})) (out[k] ||= []).push(...a); tok = j.next_page_token; if (!tok) break; } return out; },
  news: (c, after) => req(c, 'GET', `${DATA}/v1beta1/news?limit=50&sort=desc${after ? `&start=${encodeURIComponent(after)}` : ''}`),
  hdr,
  async getCreds(uid) { // the account's chosen broker: Alpaca (paper or live) or Webull (real money, only once unlocked in Settings)
    const u = await db.one('SELECT alpaca, broker, webull FROM users WHERE id=$1', [uid]); if (!u) return null;
    const a = u.alpaca ? await alpacaFrom(u.alpaca, uid) : null;
    if (u.broker === 'webull') { let w = null; try { w = JSON.parse(u.webull); } catch (_) {} if (!w?.appKey || !w.accountId || !w.unlocked) return null; // locked or incomplete: the bots see "not connected"
      return { uid, broker: 'webull', paper: false, key: w.appKey, appKey: w.appKey, secret: await S.dec(w.secret), token: w.token ? await S.dec(w.token) : null, accountId: w.accountId, capUsd: w.capUsd ?? 1000, data: a,
        lastPrice: sym => a ? raw.last(a, sym) : Promise.reject(Object.assign(new Error('Webull needs a free Alpaca connection for market data'), { status: 400 })) }; }
    return a; },
  async getAlpacaCreds(uid) { const u = await db.one('SELECT alpaca FROM users WHERE id=$1', [uid]); return u?.alpaca ? alpacaFrom(u.alpaca, uid) : null; },
  async saveCreds(uid, c) { await db.q('UPDATE users SET alpaca=$2 WHERE id=$1', [uid, JSON.stringify({ key: c.key, secret: await S.enc(c.secret), paper: !!c.paper })]); },
  clearCreds: uid => db.q('UPDATE users SET alpaca=NULL WHERE id=$1', [uid]),
};

// One interface for every bot. Orders and account reads go to the chosen broker; market data (clock, prices, bars, news) always comes from
// the free Alpaca connection, so Webull users keep Alpaca connected for data.
const W = require('./webull'), out = { ...raw };
const needData = c => { if (!c.data) throw err(400, 'Connect Alpaca (free) for market data: Webull has no data feed here'); return c.data; };
for (const k of ['account', 'positions', 'asset', 'buy', 'buyQty', 'sell', 'close', 'order', 'orderNested', 'cancel', 'bracket']) out[k] = (c, ...a) => c?.broker === 'webull' ? W.adapter[k](c, ...a) : raw[k](c, ...a);
for (const k of ['clock', 'last', 'bars', 'news', 'hdr']) out[k] = (c, ...a) => raw[k](c?.broker === 'webull' ? needData(c) : c, ...a);

// Built-in paper trading takes whatever the real broker cannot: futures, symbols it will not list, shorts it refuses, and anything already held in the paper account.
const PB = require('./paperbroker'), base = { ...out }, NOALP = new Map(), seen = new Map();
PB.configure({ stock: async (uid, sym) => { let h = seen.get(uid); if (!h || Date.now() - h.t > 6e4) { h = { t: Date.now(), c: await raw.getAlpacaCreds(uid) }; seen.set(uid, h); } if (!h.c) throw err(400, 'Connect Alpaca (free) for market data'); return raw.last(h.c, sym); } });
async function toPaper(c, sym, side, qty) {
  if (PB.isFut(sym)) return true; if (!c?.uid) return false; const f = NOALP.get(c.uid + '|' + sym); if (f === 'untradable') return true;
  const p = await PB.pos(c.uid, sym), held = p ? p.qty : 0; if ((side === 'sell' && held > 0) || (side === 'buy' && held < 0)) return true; // closing a paper position
  if (f === 'noshort' && side === 'sell') { const real = (await base.positions(c)).find(x => x.symbol === sym); return !(real && Number(real.qty) >= qty); } // selling shares you really hold stays with the broker
  return false;
}
out.asset = async (c, s) => {
  if (PB.isFut(s)) return { tradable: true, fractionable: true, shortable: true, paper: true };
  let a = null; try { a = await base.asset(c, s); } catch (e) { if (!/not found|404|could not find/i.test(e.message)) throw e; } // other errors (network, auth) are not "untradable"
  if ((!a || !a.tradable) && c?.uid) { NOALP.set(c.uid + '|' + s, 'untradable'); return { tradable: true, fractionable: false, shortable: true, paper: true }; }
  if (a && a.shortable === false && c?.uid) { NOALP.set(c.uid + '|' + s, 'noshort'); return { ...a, shortable: true }; } return a || { tradable: false };
};
out.buyQty = async (c, s, q) => (await toPaper(c, s, 'buy', q)) ? PB.market(c, 'buy', s, q) : base.buyQty(c, s, q);
out.sell = async (c, s, q) => (await toPaper(c, s, 'sell', q)) ? PB.market(c, 'sell', s, q) : base.sell(c, s, q);
out.buy = async (c, s, notional) => (await toPaper(c, s, 'buy', 0)) ? PB.market(c, 'buy', s, notional / await PB.price(c.uid, s)) : base.buy(c, s, notional);
out.close = async (c, s) => { const p = c?.uid ? await PB.pos(c.uid, s) : null; return p ? PB.market(c, p.qty > 0 ? 'sell' : 'buy', s, Math.abs(p.qty)) : base.close(c, s); };
out.bracket = async (c, o) => (await toPaper(c, o.symbol, o.side, o.qty)) ? PB.bracket(c, o) : base.bracket(c, o);
out.last = async (c, s) => PB.isFut(s) ? PB.price(c.uid, s) : base.last(c, s);
out.positions = async c => { const a = await base.positions(c); return c?.uid ? [...a, ...await PB.positions(c.uid)] : a; };
out.account = async c => { const a = await base.account(c); if (!c?.uid) return a; const o = await PB.overlay(c.uid); if (!o.open && !o.delta) return a; // the paper account rides on the real balance
  return { ...a, equity: String(Number(a.equity) + o.total), cash: String(Number(a.cash) + o.delta), last_equity: String(Number(a.last_equity) + o.total) }; };
for (const k of ['order', 'orderNested', 'cancel']) { const b = out[k]; out[k] = (c, id, ...r) => String(id).startsWith('paper:') ? PB[k](c, id, ...r) : b(c, id, ...r); }
out.paper = PB;
module.exports = out;
