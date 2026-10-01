// Single-owner login: the password is the ADMIN_PASSWORD env var.
const { handler, err, same, makeCookie, clearCookie, isOwner, ip } = require('./_lib/util');
const db = require('./_lib/db');
module.exports = handler(async (req, body, q) => {
  const op = q.op || body.op;
  if (op === 'me') return { owner: isOwner(req), setup: { db: !!process.env.DATABASE_URL, password: !!process.env.ADMIN_PASSWORD, session: (process.env.SESSION_SECRET || '').length >= 16 } };
  if (op === 'logout') return { ok: true, _cookie: clearCookie() };
  if (op === 'login') {
    const pw = process.env.ADMIN_PASSWORD; if (!pw || pw.length < 8) throw err(503, 'ADMIN_PASSWORD is not set (min 8 characters)');
    await db.limit('login:' + ip(req), 8, 15 * 60e3);
    if (!same(String(body.password || ''), pw)) throw err(401, 'Wrong password');
    return { ok: true, _cookie: makeCookie() };
  }
  throw err(400, 'unknown op');
});
