// One owner account, no password: knowing the owner email is the access code.
const db = require('./db');
const byId = id => db.one('SELECT * FROM users WHERE id=$1', [id]);
const pub = u => u && { id: u.id, email: u.email, verified: true, admin: true };
let OWNER_ID;
// the single owner row; reuses the existing admin row so old data stays attached
async function owner() {
  if (OWNER_ID) { const u = await byId(OWNER_ID); if (u) return u; OWNER_ID = null; }
  let u = await db.one('SELECT * FROM users ORDER BY admin DESC, created ASC LIMIT 1');
  if (!u) { await db.q("INSERT INTO users (id, email, pw, verified, admin, created) VALUES ('owner','owner@local',NULL,true,true,$1) ON CONFLICT DO NOTHING", [Date.now()]); u = await byId('owner'); }
  if (!u.verified || !u.admin) { await db.q('UPDATE users SET verified=true, admin=true WHERE id=$1', [u.id]); u = await byId(u.id); }
  OWNER_ID = u.id; return u;
}
const { err, readCookie } = require('./util'), S = require('./settings');
// signed in only with the session cookie that the owner-email login hands out
async function current(req) { const c = req && readCookie(req, await S.secret()); if (!c) return null; const u = await owner(); return c.uid === u.id ? u : null; }
async function need(req) { const u = await current(req); if (!u) throw err(401, 'Not logged in'); return u; }
const byEmail = () => owner();
const confirm = async () => {}, notify = () => {}, sendCode = async () => {}, checkCode = async () => {};
module.exports = { owner, byId, byEmail, pub, current, need, confirm, notify, sendCode, checkCode };
