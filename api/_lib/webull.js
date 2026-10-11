// Webull (US) OpenAPI client + the adapter the bots use through alpaca.js. Written from Webull's official Python SDK (v3.0.x).
// Signing: HMAC-SHA256 over the path + sorted query/headers + body hash, key = app secret + "&". Verified against the SDK on identical inputs.
// Orders: Webull's own payloads (US equities, MARKET / LIMIT / STOP_LOSS, bracket = MASTER + STOP_PROFIT + STOP_LOSS combo).
// Response shapes are not documented, so every reader FAILS CLOSED: if a balance or position cannot be read, the bots do nothing.
// There is no Webull paper environment for the US API: this is real money. It stays locked until you confirm the numbers in Settings.
const crypto = require('crypto');
const HOST = 'api.webull.com';
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); // same as Python quote(s, safe='')
const iso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const bad = (m, status = 502) => Object.assign(new Error(m), { status });

/* ---------- signing ---------- */
function sign({ method, path, query = {}, body, appKey, secret, host = HOST, ts = iso(), nonce = crypto.randomUUID().replace(/-/g, '') }) {
  const hdr = { 'x-app-key': appKey, 'x-timestamp': ts, 'x-signature-version': '1.0', 'x-signature-algorithm': 'HMAC-SHA256', 'x-signature-nonce': nonce };
  const p = { ...hdr, host }; for (const [k, v] of Object.entries(query)) p[k] = p[k] != null ? p[k] + '&' + v : String(v);
  let s = path + '&' + Object.keys(p).sort().map(k => k + '=' + p[k]).join('&');
  const raw = body == null ? null : JSON.stringify(body); if (raw != null) s += '&' + crypto.createHash('sha256').update(raw, 'utf8').digest('hex').toUpperCase();
  const signature = crypto.createHmac('sha256', secret + '&').update(enc(s), 'utf8').digest('base64');
  return { headers: { ...hdr, 'x-signature': signature, 'x-version': 'v3', host }, raw };
}

/* ---------- http (reads are cached for 2s: Webull allows about 1 balance / positions call per second) ---------- */
const CACHE = new Map();
async function call(c, method, path, { query = {}, body, category, ttl = 0 } = {}) {
  const key = ttl ? c.appKey + method + path + JSON.stringify(query) : null, hit = key && CACHE.get(key); if (hit && Date.now() - hit.at < ttl) return hit.v;
  const { headers, raw } = sign({ method, path, query, body, appKey: c.appKey, secret: c.secret }); headers['content-type'] = 'application/json'; delete headers.host;
  if (c.token) headers['x-access-token'] = c.token; if (category) headers.category = category;
  const qs = Object.keys(query).length ? '?' + new URLSearchParams(query) : '';
  const r = await fetch(`https://${HOST}${path}${qs}`, { method, headers, body: raw ?? undefined, signal: AbortSignal.timeout(20e3) });
  const t = await r.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch (_) { j = { message: t.slice(0, 200) }; }
  if (!r.ok) throw bad(`Webull: ${j.message || j.msg || j.error_msg || r.status}`, r.status === 401 || r.status === 403 ? 400 : 502);
  if (key) CACHE.set(key, { at: Date.now(), v: j }); return j;
}

/* ---------- tolerant readers (fail closed) ---------- */
const pick = (o, names) => { for (const n of names) if (o && o[n] != null && o[n] !== '') return o[n]; };
const num = x => { const n = Number(x); return Number.isFinite(n) ? n : null; };
const find = (o, names, depth = 0) => { // first matching key anywhere in a small JSON tree
  if (!o || typeof o !== 'object' || depth > 4) return undefined; const v = pick(o, names); if (v != null) return v;
  for (const k of Object.keys(o)) { const r = find(o[k], names, depth + 1); if (r != null) return r; } };
const list = j => Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.positions) ? j.positions : Array.isArray(j?.items) ? j.items : Array.isArray(j?.accounts) ? j.accounts : Array.isArray(j?.data?.positions) ? j.data.positions : Array.isArray(j?.data?.accounts) ? j.data.accounts : null;
const EQ = ['net_liquidation_value', 'net_liquidation', 'total_net_liquidation_value', 'total_asset', 'total_assets', 'account_value', 'total_market_value_and_cash', 'equity', 'total_value'];
const CASH = ['cash_balance', 'total_cash_balance', 'settled_cash', 'cash', 'total_cash_value', 'cash_value', 'buying_power', 'cash_buying_power'];
const PREV = ['previous_day_net_liquidation_value', 'prev_net_liquidation_value', 'last_equity'];

const accounts = async c => { const j = await call(c, 'GET', '/openapi/account/list', { ttl: 5e3 }), a = list(j) || []; return a.map(x => ({ id: String(pick(x, ['account_id', 'accountId', 'id']) ?? ''), type: pick(x, ['account_type', 'type', 'account_class']) ?? '', raw: x })).filter(x => x.id); };
async function account(c) {
  if (!c.accountId) throw bad('Webull: choose an account in Settings');
  const j = await call(c, 'GET', '/trading/assets/balances/get', { query: { account_id: c.accountId }, ttl: 2e3 });
  const equity = num(find(j, EQ)), cash = num(find(j, CASH)); if (equity == null || cash == null) throw bad('Webull balance response was not recognised: trading paused (see Settings > Brokerage > Test)');
  return { equity: String(equity), cash: String(cash), last_equity: String(num(find(j, PREV)) ?? equity) }; // no previous-day figure -> the daily-loss guard cannot trigger
}
async function positions(c) {
  if (!c.accountId) throw bad('Webull: choose an account in Settings');
  const j = await call(c, 'GET', '/trading/assets/positions/list', { query: { account_id: c.accountId }, ttl: 2e3 }), a = list(j);
  if (!a) throw bad('Webull positions response was not recognised: trading paused');
  const out = a.map(x => ({ symbol: String(pick(x, ['symbol', 'ticker', 'display_symbol']) ?? ''), qty: num(pick(x, ['quantity', 'qty', 'position', 'holding_qty'])), current_price: num(pick(x, ['last_price', 'market_price', 'current_price', 'lastPrice'])), avg_entry_price: num(pick(x, ['cost_price', 'avg_cost', 'average_price', 'avg_price', 'costPrice'])) }));
  if (a.length && out.every(p => !p.symbol || p.qty == null)) throw bad('Webull positions could not be read: trading paused');
  return out.filter(p => p.symbol && p.qty != null).map(p => ({ ...p, qty: String(p.qty), current_price: String(p.current_price ?? ''), avg_entry_price: String(p.avg_entry_price ?? '') }));
}
const STATUS = s => { s = String(s || '').toUpperCase().replace(/ /g, '_'); return s === 'FILLED' ? 'filled' : ['CANCELLED', 'CANCELED'].includes(s) ? 'canceled' : ['REJECTED', 'FAILED'].includes(s) ? 'rejected' : s === 'PARTIAL_FILLED' ? 'partially_filled' : 'new'; };
async function detail(c, id) {
  const j = await call(c, 'GET', '/trading/orders/get', { query: { account_id: c.accountId, client_order_id: id } }), d = list(j)?.[0] || j?.data || j, st = pick(d, ['status', 'order_status']) ?? find(j, ['status', 'order_status']);
  return { id, status: STATUS(st), filled_qty: String(num(find(d, ['filled_quantity', 'filled_qty', 'filled_quantity_total'])) ?? 0), filled_avg_price: String(num(find(d, ['filled_price', 'avg_filled_price', 'filled_avg_price', 'average_filled_price'])) ?? ''), raw: st };
}

/* ---------- orders ---------- */
const cid = () => crypto.randomUUID().replace(/-/g, '');
const eqOrder = (o) => ({ client_order_id: o.id, combo_type: o.combo || 'NORMAL', symbol: o.symbol, instrument_type: 'EQUITY', market: 'US', order_type: o.type || 'MARKET', quantity: String(o.qty), support_trading_session: 'CORE',
  side: o.side, time_in_force: 'DAY', entrust_type: 'QTY', ...(o.limit ? { limit_price: o.limit.toFixed(2) } : {}), ...(o.stop ? { stop_price: o.stop.toFixed(2) } : {}) });
const place = (c, orders) => call(c, 'POST', '/trading/orders/place', { body: { account_id: c.accountId, new_orders: orders }, category: 'US_EQUITY' });
async function guard(c, sym, qty) { // hard per-order dollar cap, from the account's Settings
  const px = await c.lastPrice(sym); if (!(px > 0)) throw bad('Webull: no price for ' + sym + ' (connect Alpaca for market data)');
  if (c.capUsd && qty * px > c.capUsd) throw bad(`Webull: ${qty} x ${sym} is about $${Math.round(qty * px)}, over your $${c.capUsd} per-order limit (Settings > Brokerage)`, 400); return px;
}
// Selling shares you hold (or buying back a short) only reduces risk: the dollar cap never blocks an exit, only new positions.
async function isExit(c, side, sym, qty) { try { const p = (await positions(c)).find(x => x.symbol === sym), h = p ? Number(p.qty) : 0; return side === 'SELL' ? h >= qty : h <= -qty; } catch (_) { return false; } }
async function market(c, side, sym, qty) { qty = Math.floor(qty); if (!(qty >= 1)) throw bad('Webull: whole shares only (quantity under 1)', 400); if (!(await isExit(c, side, sym, qty))) await guard(c, sym, qty); const id = cid(); await place(c, [eqOrder({ id, symbol: sym, qty, side })]); return { id, status: 'accepted' }; }
async function bracket(c, o) { // market entry + take-profit limit + protective stop, one combo
  await guard(c, o.symbol, o.qty); const out = o.side === 'buy' ? 'SELL' : 'BUY', m = cid(), tp = cid(), sl = cid();
  await place(c, [eqOrder({ id: m, combo: 'MASTER', symbol: o.symbol, qty: o.qty, side: o.side.toUpperCase() }), eqOrder({ id: tp, combo: 'STOP_PROFIT', symbol: o.symbol, qty: o.qty, side: out, type: 'LIMIT', limit: o.tp }),
    eqOrder({ id: sl, combo: 'STOP_LOSS', symbol: o.symbol, qty: o.qty, side: out, type: 'STOP_LOSS', stop: o.sl })]);
  return { id: [m, tp, sl].join('|'), status: 'accepted' };
}
const adapter = {
  account, positions, accounts,
  asset: async () => ({ tradable: true, fractionable: false, shortable: true }), // Webull rejects what it cannot do; whole shares only
  buyQty: (c, s, q) => market(c, 'BUY', s, q), sell: (c, s, q) => market(c, 'SELL', s, q),
  buy: async (c, s, notional) => { const px = await c.lastPrice(s); return market(c, 'BUY', s, notional / px); },
  async close(c, s) { const p = (await positions(c)).find(x => x.symbol === s); if (!p) throw bad('no position', 404); const q = Number(p.qty); return market(c, q > 0 ? 'SELL' : 'BUY', s, Math.abs(q)); },
  order: (c, id) => detail(c, String(id).split('|')[0]),
  async orderNested(c, id) { const [m, tp, sl] = String(id).split('|'), top = await detail(c, m); if (!tp) return top;
    const [a, b] = await Promise.all([detail(c, tp), detail(c, sl)]); return { ...top, id, legs: [{ id: tp, type: 'limit', status: a.status, filled_avg_price: a.filled_avg_price }, { id: sl, type: 'stop', status: b.status, filled_avg_price: b.filled_avg_price }] }; },
  cancel: (c, id) => call(c, 'POST', '/trading/orders/cancel', { body: { account_id: c.accountId, client_order_id: String(id).split('|')[0] } }),
  bracket,
};
/* ---------- 2FA access token (approved in the Webull app) ---------- */
const token = {
  create: c => call(c, 'POST', '/auth/tokens/create', { body: {} }),
  check: (c, t) => call(c, 'POST', '/auth/tokens/check', { body: { token: t } }),
};
module.exports = { HOST, sign, enc, call, adapter, token, accounts, STATUS, find, list, EQ, CASH };
