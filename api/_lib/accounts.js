// No accounts: the whole site is one built-in owner. Anyone who opens it is that owner.
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
const current = () => owner(), need = () => owner();
const byEmail = () => owner();
const confirm = async () => {}, notify = () => {}, sendCode = async () => {}, checkCode = async () => {};
module.exports = { byId, byEmail, pub, current, need, confirm, notify, sendCode, checkCode };
