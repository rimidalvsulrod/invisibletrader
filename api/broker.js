// Brokerage settings: which broker every bot trades through (Alpaca or Webull), and the Webull connection.
// Webull is real money (its US API has no paper account), so it stays LOCKED until you test the connection, confirm the numbers
// match your Webull app, and unlock it. Changing keys, switching to Webull and unlocking all need your emailed code or password.
const { handler, err } = require('./_lib/util');
const db = require('./_lib/db'), S = require('./_lib/settings'), AL = require('./_lib/alpaca'), A = require('./_lib/accounts'), W = require('./_lib/webull'), mail = require('./_lib/mail');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clamp = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
const peek = j => JSON.stringify(j).slice(0, 1400); // shown to the signed-in owner so they can compare with their Webull app
const saveW = (uid, w) => db.q('UPDATE users SET webull=$2 WHERE id=$1', [uid, JSON.stringify(w)]);
module.exports = handler(async (req, body, q) => {
  const u = await A.need(req), uid = u.id, op = q.op || body.op;
  const row = await db.one('SELECT alpaca, broker, webull FROM users WHERE id=$1', [uid]), w = J(row?.webull, null), broker = row?.broker === 'webull' ? 'webull' : 'alpaca';
  const creds = async () => { if (!w?.appKey) throw err(400, 'Save your Webull App Key and Secret first'); return { appKey: w.appKey, secret: await S.dec(w.secret), token: w.token ? await S.dec(w.token) : null, accountId: w.accountId || null, capUsd: w.capUsd ?? 1000,
    data: await AL.getAlpacaCreds(uid).catch(() => null), lastPrice: async sym => { const a = await AL.getAlpacaCreds(uid); if (!a) throw err(400, 'Connect Alpaca (free) for market data'); return AL.last(a, sym); } }; };
  switch (op) {
    case 'state': return { broker, emailCodes: await mail.configured(),
      alpaca: await AL.getAlpacaCreds(uid).then(c => c ? { connected: true, key: c.key.slice(0, 6) + '…', paper: c.paper } : { connected: false }).catch(() => ({ connected: false })),
      webull: w?.appKey ? { configured: true, key: w.appKey.slice(0, 6) + '…', accountId: w.accountId || null, hasToken: !!w.token, tokenStatus: w.tokenStatus || null, unlocked: !!w.unlocked, capUsd: w.capUsd ?? 1000 } : { configured: false } };
    case 'select': { const to = body.broker === 'webull' ? 'webull' : 'alpaca'; if (to === broker) return { ok: true, broker };
      // positions opened through one broker cannot be managed through the other: switch only when the bots are flat
      const open = (await Promise.all([['ntrades', 'status'], ['swingtrades', 'status'], ['powelltrades', 'status']].map(([t]) => db.one(`SELECT count(*)::int AS n FROM ${t} WHERE uid=$1 AND status='open'`, [uid])))).reduce((n, x) => n + x.n, 0);
      if (open) throw err(400, `${open} bot position${open == 1 ? ' is' : 's are'} still open on ${broker === 'webull' ? 'Webull' : 'Alpaca'}. Let the bots close them (or close them yourself) before switching.`);
      if (to === 'webull') { if (!w?.unlocked) throw err(400, 'Test and unlock Webull first'); await A.confirm(u, body, 'keys'); }
      await db.q('UPDATE users SET broker=$2 WHERE id=$1', [uid, to]);
      await Promise.all(['nbot', 'sbot', 'pbot'].map(t => db.q(`UPDATE ${t} SET enabled=false WHERE uid=$1`, [uid]))); // every bot restarts paused on the new broker
      A.notify(u.email, `Mimic now trades through ${to === 'webull' ? 'Webull (real money)' : 'Alpaca'}`, `Your account's bots were switched to ${to === 'webull' ? 'Webull' : 'Alpaca'} and paused. Turn each bot back on when you are ready.`);
      return { ok: true, broker: to, paused: true }; }
    case 'webull-save': { const appKey = String(body.appKey || '').trim(), secret = String(body.secret || '').trim(); if (appKey.length < 8 || secret.length < 8) throw err(400, 'Paste your Webull App Key and App Secret');
      if (w?.appKey) await A.confirm(u, body, 'keys'); // replacing saved keys needs confirmation
      await saveW(uid, { appKey, secret: await S.enc(secret), accountId: null, token: null, unlocked: false, capUsd: w?.capUsd ?? 1000 }); // new keys must be tested and unlocked again
      if (broker === 'webull') { await db.q("UPDATE users SET broker='alpaca' WHERE id=$1", [uid]); await Promise.all(['nbot', 'sbot', 'pbot'].map(t => db.q(`UPDATE ${t} SET enabled=false WHERE uid=$1`, [uid]))); }
      A.notify(u.email, 'Webull keys saved to your Mimic account', 'Webull API keys were saved. Trading stays locked until you test and unlock the connection.'); return { ok: true }; }
    case 'webull-delete': await A.confirm(u, body, 'keys'); if (broker === 'webull') { await db.q("UPDATE users SET broker='alpaca' WHERE id=$1", [uid]); await Promise.all(['nbot', 'sbot', 'pbot'].map(t => db.q(`UPDATE ${t} SET enabled=false WHERE uid=$1`, [uid]))); }
      await db.q('UPDATE users SET webull=NULL WHERE id=$1', [uid]); return { ok: true };
    case 'webull-token': { const c = await creds(), t = body.action === 'check' ? await W.token.check(c, await S.dec(w.pendingToken)) : await W.token.create(c);
      const token = W.find(t, ['token', 'access_token']), status = String(W.find(t, ['status']) || '');
      if (body.action !== 'check' && !token) throw err(502, 'Webull did not return a token: ' + peek(t));
      await saveW(uid, { ...w, pendingToken: body.action === 'check' ? w.pendingToken : await S.enc(token), tokenStatus: status });
      if (body.action === 'check' && /NORMAL/i.test(status)) await saveW(uid, { ...w, token: w.pendingToken, pendingToken: null, tokenStatus: status });
      return { ok: true, status, hint: /NORMAL/i.test(status) ? 'Token verified.' : 'Open the Webull app, approve the API access request, then press Check.' }; }
    case 'webull-accounts': { const c = await creds(), list = await W.accounts(c); return { accounts: list.map(a => ({ id: a.id, type: a.type })) }; }
    case 'webull-test': { // read-only: nothing here can place an order
      const c = await creds(); if (body.accountId) { c.accountId = String(body.accountId); await saveW(uid, { ...w, accountId: c.accountId, unlocked: false }); }
      if (!c.accountId) throw err(400, 'Choose which Webull account to use');
      let balance, positions, error = null; try { balance = await W.adapter.account(c); positions = await W.adapter.positions(c); } catch (e) { error = e.message; }
      return { ok: !error, error, accountId: c.accountId, balance: balance ? { equity: +balance.equity, cash: +balance.cash } : null, positions: positions || null, data: !!c.data }; }
    case 'webull-raw': { const c = await creds(); if (!c.accountId) throw err(400, 'Choose which Webull account to use'); // the unprocessed replies, so a mismatch can be diagnosed
      const [b, p] = await Promise.all([W.call(c, 'GET', '/trading/assets/balances/get', { query: { account_id: c.accountId } }).then(peek).catch(e => e.message), W.call(c, 'GET', '/trading/assets/positions/list', { query: { account_id: c.accountId } }).then(peek).catch(e => e.message)]);
      return { balance: b, positions: p }; }
    case 'webull-unlock': { await A.confirm(u, body, 'keys'); const c = await creds(); if (!c.accountId) throw err(400, 'Choose which Webull account to use'); if (!c.data) throw err(400, 'Connect Alpaca (free) first: it provides the market data and news the bots use');
      if (body.confirmed !== true) throw err(400, 'Confirm the balance matches your Webull app');
      await W.adapter.account(c); await W.adapter.positions(c); // must read cleanly right now
      await saveW(uid, { ...w, unlocked: true, capUsd: clamp(body.capUsd, 50, 100000, 1000) }); return { ok: true }; }
    case 'webull-lock': await saveW(uid, { ...w, unlocked: false }); if (broker === 'webull') await Promise.all(['nbot', 'sbot', 'pbot'].map(t => db.q(`UPDATE ${t} SET enabled=false WHERE uid=$1`, [uid]))); return { ok: true };
    case 'webull-cap': await saveW(uid, { ...w, capUsd: clamp(body.capUsd, 50, 100000, 1000) }); return { ok: true };
    default: throw err(400, 'unknown op');
  }
});
