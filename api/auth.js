// Single-owner login. First visit creates the password in-app (or set ADMIN_PASSWORD in Vercel to override).
const { handler, err, makeCookie, clearCookie, isOwner, needOwner, ip } = require('./_lib/util');
const db = require('./_lib/db'), S = require('./_lib/settings');
// The only account allowed (override with OWNER_EMAIL in Vercel if it ever changes)
const OWNER = (process.env.OWNER_EMAIL || 'vladimirdorlus08@gmail.com').trim().toLowerCase();
const isOwnerEmail = e => String(e || '').trim().toLowerCase() === OWNER;
module.exports = handler(async (req, body, q) => {
  const op = q.op || body.op;
  if (op === 'me') {
    if (!db.dbUrl()) return { owner: false, setup: { db: false } };
    const key = await S.secret();
    return { owner: isOwner(req, key), setup: { db: true, password: await S.hasPassword() } };
  }
  if (op === 'logout') return { ok: true, _cookie: clearCookie() };
  if (op === 'setup') { // only works while no password exists
    if (await S.hasPassword()) throw err(409, 'Account already exists — log in instead');
    if (!isOwnerEmail(body.email)) throw err(403, 'This site has one account and that email isn\'t it');
    await S.setPassword(String(body.password || '')); return { ok: true, _cookie: makeCookie(await S.secret()) };
  }
  if (op === 'login') {
    await db.limit('login:' + ip(req), 8, 15 * 60e3);
    if (!(await S.hasPassword())) throw err(409, 'No password yet — create one');
    const okPw = await S.checkPassword(body.password || '');
    if (!isOwnerEmail(body.email) || !okPw) throw err(401, 'Wrong email or password');
    return { ok: true, _cookie: makeCookie(await S.secret()) };
  }
  if (op === 'password') { needOwner(req, await S.secret()); if (process.env.ADMIN_PASSWORD) throw err(400, 'Password is set by ADMIN_PASSWORD in Vercel'); await S.setPassword(String(body.password || '')); return { ok: true }; }
  throw err(400, 'unknown op');
});
