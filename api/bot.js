// Auto Trader API (owner only). Everything money-related is read live from Kalshi.
const crypto = require('crypto');
const { handler, err, needOwner } = require('./_lib/util');
const db = require('./_lib/db');
const E = require('./_lib/engine');
const K = require('./_lib/kalshi');
const S = require('./_lib/settings');

const clamp = (v, lo, hi, fallback) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback; };
const num = (d, c) => { const x = parseFloat(d); return isNaN(x) ? (c ?? 0) : x; };
const MKT = new Map(); // short cache of market details for display
async function marketInfo(env, ticker) {
  const hit = MKT.get(env + ticker); if (hit && Date.now() - hit.t < 30e3) return hit.m;
  const m = await K.market(env, ticker).catch(() => null); MKT.set(env + ticker, { t: Date.now(), m }); return m;
}

async function state() {
  const s = await E.open();
  const [logs, follows] = await Promise.all([db.q('SELECT entry FROM botlog ORDER BY ts DESC LIMIT 60'), db.q('SELECT wallet, name FROM follows')]);
  const out = {
    enabled: s.row.enabled, cfg: s.cfg, last: s.st.last || null, watching: s.st.watching || 0, follows,
    capServer: Number(process.env.MAX_ORDER_USD) || null, disabledServer: !!process.env.TRADING_DISABLED,
    keys: s.creds ? { set: true, keyId: s.creds.keyId.slice(0, 8) + '…', env: s.creds.env, source: s.creds.source } : { set: false },
    log: logs.map(l => E.J(l.entry, {})), account: null, positions: [], fills: [], accountError: null,
  };
  if (!s.creds) return out;
  try {
    const [acct, fr] = await Promise.all([E.account(s.creds), K.call(s.creds, 'GET', '/portfolio/fills?limit=25')]);
    const copyOf = tk => s.copies.find(c => c.tk === tk);
    out.positions = await Promise.all([...acct.pos].map(async ([tk, p]) => {
      const side = p.yes > 0 ? 'yes' : 'no', count = side === 'yes' ? p.yes : p.no, m = await marketInfo(s.creds.env, tk);
      const bid = m ? num(side === 'yes' ? m.yes_bid_dollars : m.no_bid_dollars) : null;
      const value = bid != null ? count * bid : null;
      return { tk, side, count, cost: p.exposure, value, pnl: value != null ? value - p.exposure : null, fees: p.fees, title: m?.title || tk, sub: m?.yes_sub_title || '', status: m?.status || '', copied: copyOf(tk) ? { trader: copyOf(tk).trader } : null };
    }));
    out.account = { cash: acct.cash, positionsValue: out.positions.reduce((a, p) => a + (p.value ?? p.cost), 0) };
    out.account.total = out.account.cash + out.account.positionsValue;
    if (fr.ok) out.fills = (fr.json.fills || []).map(f => ({
      t: Date.parse(f.created_time) || (f.ts || 0) * 1000, tk: f.ticker || f.market_ticker, action: f.action, side: f.side || f.outcome_side,
      count: num(f.count_fp, f.count), price: num(f.side === 'no' ? f.no_price_dollars : f.yes_price_dollars, (f.side === 'no' ? f.no_price : f.yes_price) / 100), fee: num(f.fee_cost, 0),
    }));
  } catch (e) { out.accountError = String(e.message || e); }
  return out;
}

module.exports = handler(async (req, body, q) => {
  needOwner(req, await S.secret());
  const op = q.op || body.op;
  switch (op) {
    case 'state': return state();
    case 'cfg': {
      const c = body.cfg || {}, cur = (await E.open()).cfg, D = E.DEF;
      const cfg = {
        pct: clamp(c.pct ?? cur.pct, 0.5, 100, D.pct),
        minUsd: clamp(c.minUsd ?? cur.minUsd, 0, 1e7, D.minUsd), maxPrice: clamp(c.maxPrice ?? cur.maxPrice, 1, 99, D.maxPrice),
        slip: clamp(c.slip ?? cur.slip, 0, 20, D.slip), maxUse: clamp(c.maxUse ?? cur.maxUse, 1, 100, D.maxUse), thresh: clamp(c.thresh ?? cur.thresh, 50, 100, D.thresh),
      };
      await db.q("UPDATE bot SET cfg=$1 WHERE id='me'", [JSON.stringify(cfg)]); return { ok: true, cfg };
    }
    case 'start': {
      const s = await E.open();
      if (!s.creds) throw err(400, 'Connect your Kalshi account first');
      if (process.env.TRADING_DISABLED) throw err(400, 'Trading is disabled on the server (TRADING_DISABLED)');
      await E.account(s.creds); // fails loudly if Kalshi rejects the key
      s.st = { ...s.st, since: Math.floor(Date.now() / 1000) - 30, seen: [], errs: 0, retry: [] };
      await db.q("UPDATE bot SET enabled=true, state=$1, lock_until=NULL WHERE id='me'", [JSON.stringify(s.st)]);
      return E.run();
    }
    case 'stop': await db.q("UPDATE bot SET enabled=false WHERE id='me'"); return { ok: true };
    case 'runnow': return E.run();
    case 'sell': await E.manualSell(body.ticker === 'all' ? 'all' : String(body.ticker || '')); return { ok: true };
    case 'clearlog': await db.q('DELETE FROM botlog'); return { ok: true };
    case 'follows': {
      if (!Array.isArray(body.list)) throw err(400, 'list required');
      const list = body.list.filter(f => /^0x[0-9a-fA-F]{40}$/.test(f.wallet)).slice(0, 100);
      await db.q('DELETE FROM follows');
      for (const f of list) await db.q('INSERT INTO follows (wallet, name) VALUES ($1,$2) ON CONFLICT (wallet) DO NOTHING', [f.wallet.toLowerCase(), String(f.name || '').slice(0, 60)]);
      return { ok: true, n: list.length };
    }
    case 'keys': { // paste-in Kalshi API key; verified with Kalshi (real or demo detected) before it's stored encrypted
      const keyId = String(body.keyId || '').trim(), pem = S.normPem(body.pem);
      if (!/^[A-Za-z0-9-]{8,80}$/.test(keyId)) throw err(400, "That doesn't look like a Kalshi API key ID");
      try { crypto.createPrivateKey(pem); } catch (e) { throw err(400, 'That private key could not be read — paste the whole file including the BEGIN/END lines'); }
      let env = null, last = null;
      for (const e of ['prod', 'demo']) { const r = await K.balance({ keyId, pem, env: e }); if (r.ok) { env = e; break; } last = r; }
      if (!env) throw err(400, `Kalshi rejected this key (${last.status}: ${last.error}). Check the Key ID matches the private key.`);
      await S.saveCreds({ keyId, pem, env });
      const acct = await E.account({ keyId, pem, env });
      return { ok: true, env, cash: acct.cash };
    }
    case 'keysdel': await S.clearCreds(); await db.q("UPDATE bot SET enabled=false WHERE id='me'"); return { ok: true };
    default: throw err(400, 'unknown op');
  }
});
