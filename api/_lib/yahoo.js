// One door to Yahoo Finance for every bot. The 24/7 runner sits on a cloud address that Yahoo rate-limits (HTTP 429) when many bots each pull
// the same 60 days of candles every few seconds, which left the bots without prices. So: one shared cache per URL, identical requests in flight
// are shared, requests are spaced out one at a time, a 429 switches to a browser-style session (cookie + crumb, the way yfinance does it) on the
// other host, and while Yahoo is cooling down the last good copy is served instead of failing.
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', accept: 'application/json,text/plain,*/*', 'accept-language': 'en-US,en;q=0.9' };
const C = new Map(), INF = new Map(); let sess = null, sessAt = 0, cool = 0, strikes = 0, queue = Promise.resolve(), lastAt = 0, host = 0;
const GAP = 700, sleep = ms => new Promise(z => setTimeout(z, ms));
async function session() { // cookie + crumb, refreshed every 30 minutes
  if (sess && Date.now() - sessAt < 18e5) return sess;
  const r = await fetch('https://fc.yahoo.com', { headers: UA, redirect: 'manual', signal: AbortSignal.timeout(10e3) }).catch(() => null), ck = (r?.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  if (!ck) throw new Error('Yahoo: no session cookie'); const crumb = await (await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { ...UA, cookie: ck }, signal: AbortSignal.timeout(10e3) })).text();
  if (!crumb || crumb.length > 40 || /too many|invalid|<html/i.test(crumb)) throw new Error('Yahoo: no crumb'); sess = { ck, crumb }; sessAt = Date.now(); return sess;
}
function spaced(fn) { const p = queue.then(async () => { const w = lastAt + GAP - Date.now(); if (w > 0) await sleep(w); lastAt = Date.now(); return fn(); }); queue = p.catch(() => {}); return p; }
async function once(path, withSession) {
  const h = ['query1', 'query2'][host % 2]; let url = `https://${h}.finance.yahoo.com${path}`, headers = UA;
  if (withSession) { const s = await session(); url += (path.includes('?') ? '&' : '?') + 'crumb=' + encodeURIComponent(s.crumb); headers = { ...UA, cookie: s.ck }; }
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(25e3) }); return r;
}
// path: '/v8/finance/chart/SPY?range=5d&interval=5m'. ttl: how old a cached copy may be.
async function get(path, ttl = 30e3, fast = false) { // fast: small live-price requests skip the spaced queue (they must not wait behind big candle downloads)
  const hit = C.get(path); if (hit && Date.now() - hit.at < ttl) return hit.v;
  if (hit && Date.now() < cool) return hit.v; // cooling down after a refusal: the last good copy
  if (INF.has(path)) return INF.get(path);
  const p = (async () => {
    let lastErr = null;
    for (let a = 0; a < 4; a++) {
      if (Date.now() < cool && a === 0 && !hit) await sleep(Math.min(5e3, cool - Date.now()));
      let r; try { r = fast && a === 0 ? await once(path, !!sess) : await spaced(() => once(path, a >= 1 || !!sess)); } catch (e) { lastErr = e; await sleep(400 * (a + 1)); continue; }
      if (r.ok) { const v = await r.json(); C.set(path, { at: Date.now(), v }); if (C.size > 300) C.delete(C.keys().next().value); strikes = 0; return v; }
      lastErr = new Error(`Yahoo Finance: ${r.status}`); if (r.status === 404) break;
      if (r.status === 429 || r.status >= 500 || r.status === 401) { host++; if (r.status !== 429) sess = null; strikes++; cool = Date.now() + Math.min(5 * 6e4, 5e3 * 2 ** Math.min(strikes, 6)); await sleep(800 * (a + 1)); continue; }
      break;
    }
    if (hit) return hit.v; throw lastErr || new Error('Yahoo Finance unavailable');
  })();
  INF.set(path, p); try { return await p; } finally { INF.delete(path); }
}
const chart = (sym, q, ttl) => get(`/v8/finance/chart/${encodeURIComponent(sym)}?${q}`, ttl);
module.exports = { get, chart, _state: () => ({ cool, strikes, host, cached: C.size }) };
