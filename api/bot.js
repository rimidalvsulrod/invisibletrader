// Auto Trader controls for the signed-in user. Signals are international Polymarket wallets; account data and orders are
// the user's own Polymarket US account. Everything here is scoped to that user.
const crypto = require('crypto');
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), E = require('./_lib/engine'), P = require('./_lib/polymarket-us'), S = require('./_lib/settings'), A = require('./_lib/accounts');
const value = x => Number(x?.value ?? x ?? 0) || 0;
const follows = uid => db.q('SELECT wallet, name FROM ufollows WHERE uid=$1 ORDER BY name', [uid]);
const notes = uid => db.q('SELECT id, t, d FROM notes WHERE uid=$1 ORDER BY d DESC LIMIT 500', [uid]);

async function state(uid) {
  const s = await E.open(uid), [logs, follow] = await Promise.all([db.q('SELECT entry FROM botlog WHERE uid=$1 ORDER BY ts DESC LIMIT 60', [uid]), follows(uid)]);
  const out = { enabled: s.row.enabled, cfg: { pct: s.cfg.pct }, last: s.st.last || null, watching: s.st.watching || 0, follows: follow, capServer: Number(process.env.MAX_ORDER_USD) || null, disabledServer: !!process.env.TRADING_DISABLED,
    keys: s.creds ? { set: true, keyId: s.creds.keyId.slice(0, 8) + '…', env: 'prod', source: s.creds.source } : { set: false }, log: logs.map(x => E.J(x.entry, {})), account: null, positions: [], fills: [], accountError: null };
  if (!s.creds) return out;
  try {
    const [a, acts] = await Promise.all([E.account(s.creds), P.activities(s.creds)]);
    out.positions = [...a.pos.values()].map(p => ({ tk: p.tk, side: p.side, count: p.count, cost: p.cost, value: null, pnl: null, fees: 0, title: p.tk, sub: '', status: 'open', copied: s.copies.some(x => x.tk === p.tk) ? { trader: s.copies.find(x => x.tk === p.tk).trader } : null }));
    await Promise.all(out.positions.map(async p => { const q = await P.bbo(p.tk, false).catch(() => null); if (!q) return; p.status = q.open ? 'open' : String(q.state || '').replace('MARKET_STATE_', '').toLowerCase();
      const px = Number.isFinite(q.settle) && !q.open ? (p.side === 'yes' ? q.settle : 1 - q.settle) : (p.side === 'yes' ? q.bid : 1 - q.ask); if (Number.isFinite(px) && px >= 0) { p.value = p.count * px; p.pnl = p.value - p.cost; } }));
    out.account = { cash: a.cash, positionsValue: out.positions.reduce((n, p) => n + (p.value ?? p.cost), 0), open: out.positions.filter(p => p.status === 'open').length }; out.account.total = out.account.cash + out.account.positionsValue;
    const activity = acts.json.activities || acts.json.data || [];
    if (acts.ok) out.fills = (Array.isArray(activity) ? activity : Object.values(activity)).filter(x => x.trade).map(x => ({ t: Date.parse(x.trade.createTime) || Date.now(), tk: x.trade.marketSlug, action: x.trade.action || 'buy', side: x.trade.outcomeSide || '', count: value(x.trade.qtyDecimal || x.trade.qty), price: value(x.trade.price), fee: 0 }));
  } catch (e) { out.accountError = String(e.message || e); }
  return out;
}

module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  switch (op) {
    case 'state': return state(uid);
    case 'live': { const [r, live] = await Promise.all([db.one('SELECT enabled FROM bot WHERE id=$1', [uid]), S.get('live')]); return { enabled: !!r?.enabled, live: E.J(live, null), now: Date.now() }; }
    case 'cfg': { // the only setting: % of cash per copied trade
      const pct = Number(body.cfg?.pct); if (!(pct >= .5 && pct <= 100)) throw err(400, 'Pick 0.5% to 100%');
      await E.open(uid); await db.q('UPDATE bot SET cfg=$2 WHERE id=$1', [uid, JSON.stringify({ pct })]); return { ok: true, cfg: { pct } };
    }
    case 'start': {
      const s = await E.open(uid); if (!s.creds) throw err(400, 'Connect your Polymarket US account first');
      if (process.env.TRADING_DISABLED) throw err(400, 'Trading is disabled on the server');
      await E.account(s.creds); s.st = { ...s.st, since: Math.floor(Date.now() / 1000) - 30, seen2: [], errs: 0 };
      await db.q('UPDATE bot SET enabled=true, state=$2, lock_until=NULL WHERE id=$1', [uid, JSON.stringify(s.st)]); return E.run(uid);
    }
    case 'stop': await db.q('UPDATE bot SET enabled=false WHERE id=$1', [uid]); return { ok: true };
    case 'runnow': return E.run(uid);
    case 'sell': await E.manualSell(uid, body.ticker === 'all' ? 'all' : String(body.ticker || '')); return { ok: true };
    case 'clearlog': await db.q('DELETE FROM botlog WHERE uid=$1', [uid]); return { ok: true };
    case 'followlist': return { follows: await follows(uid) };
    case 'follow': {
      const wallet = String(body.wallet || '').toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw err(400, 'bad wallet');
      if ((await follows(uid)).length >= 50) throw err(400, 'You can track up to 50 traders');
      await db.q('INSERT INTO ufollows (uid, wallet, name) VALUES ($1,$2,$3) ON CONFLICT (uid, wallet) DO UPDATE SET name=$3', [uid, wallet, String(body.name || '').slice(0, 60)]); return { follows: await follows(uid) };
    }
    case 'unfollow': await db.q('DELETE FROM ufollows WHERE uid=$1 AND wallet=$2', [uid, String(body.wallet || '').toLowerCase()]); return { follows: await follows(uid) };
    case 'follows': { // one-time import of a list saved on this device by older versions
      if (!Array.isArray(body.list)) throw err(400, 'list required'); if ((await follows(uid)).length) return { follows: await follows(uid) };
      for (const f of body.list.filter(f => /^0x[0-9a-fA-F]{40}$/.test(f.wallet)).slice(0, 50)) await db.q('INSERT INTO ufollows (uid, wallet, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [uid, f.wallet.toLowerCase(), String(f.name || '').slice(0, 60)]);
      return { follows: await follows(uid) };
    }
    case 'keys': { // connecting or replacing keys needs the emailed code
      const keyId = String(body.keyId || '').trim(), secret = String(body.secret || '').trim();
      if (!/^[A-Za-z0-9_-]{8,160}$/.test(keyId) || !secret) throw err(400, 'Enter a Polymarket US Key ID and Secret Key');
      const creds = { keyId, secret }; let cash;
      try { cash = (await E.account(creds)).cash; } catch (e) { throw err(400, `Polymarket US rejected this key: ${e.message}`); }
      await A.confirm(u, body, 'keys'); await S.saveCreds(uid, creds);
      A.notify(u.email, 'Polymarket US connected to your Mimic account', `A Polymarket US key (${keyId.slice(0, 8)}…) was connected to your account.`);
      return { ok: true, cash };
    }
    case 'keysdel':
      await A.confirm(u, body, 'keys'); await S.clearCreds(uid); await db.q('UPDATE bot SET enabled=false WHERE id=$1', [uid]);
      A.notify(u.email, 'Polymarket US disconnected from your Mimic account', 'Your Polymarket US key was removed and your bot was turned off.');
      return { ok: true };
    case 'notes': return { notes: await notes(uid) };
    case 'note': { const t = String(body.t || '').trim().slice(0, 2000); if (!t) throw err(400, 'Empty note'); await db.q('INSERT INTO notes (id, uid, t, d) VALUES ($1,$2,$3,$4)', [crypto.randomBytes(8).toString('hex'), uid, t, Date.now()]); return { notes: await notes(uid) }; }
    case 'notedel': await db.q('DELETE FROM notes WHERE uid=$1 AND id=$2', [uid, String(body.id || '')]); return { notes: await notes(uid) };
    default: throw err(400, 'unknown op');
  }
});
