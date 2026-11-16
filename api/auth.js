// No login system. `me` just reports the built-in owner so the UI knows data is available.
const { handler, err, clearCookie } = require('./_lib/util');
const db = require('./_lib/db'), A = require('./_lib/accounts');
module.exports = handler(async (req, body, q) => {
  const op = q.op || body.op;
  if (op === 'me') {
    if (!db.dbUrl()) return { user: null, setup: { db: false } };
    return { user: A.pub(await A.current(req)), setup: { db: true, email: false } };
  }
  if (op === 'logout') return { ok: true, _cookie: clearCookie() };
  throw err(400, 'unknown op');
});
