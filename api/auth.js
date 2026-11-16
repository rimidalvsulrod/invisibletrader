// No passwords: the owner email is the access code. Only that one email can log in.
const { handler, err, makeCookie, clearCookie, ip } = require('./_lib/util');
const db = require('./_lib/db'), S = require('./_lib/settings'), A = require('./_lib/accounts');
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'vladimirdorlus08@gmail.com').trim().toLowerCase();
module.exports = handler(async (req, body, q) => {
  const op = q.op || body.op;
  if (op === 'me') {
    if (!db.dbUrl()) return { user: null, setup: { db: false } };
    return { user: A.pub(await A.current(req)), setup: { db: true, email: false } };
  }
  if (op === 'logout') return { ok: true, _cookie: clearCookie() };
  if (op === 'login') {
    await db.limit('login:' + ip(req), 10, 15 * 60e3);
    if (String(body.email || '').trim().toLowerCase() !== OWNER_EMAIL) throw err(401, 'Wrong email');
    const u = await A.owner(); await db.q('UPDATE users SET email=$2 WHERE id=$1', [u.id, OWNER_EMAIL]).catch(() => {});
    return { ok: true, _cookie: makeCookie(await S.secret(), u) };
  }
  throw err(400, 'unknown op');
});
