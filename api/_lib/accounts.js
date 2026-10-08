// Users, sessions and one-time email codes.
const crypto = require('crypto'), db = require('./db'), S = require('./settings'), mail = require('./mail');
const { err, hmac, readCookie } = require('./util');
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(e) && e.length <= 200;
const byId = id => db.one('SELECT * FROM users WHERE id=$1', [id]);
const byEmail = e => db.one('SELECT * FROM users WHERE email=$1', [normEmail(e)]);
const pub = u => u && { id: u.id, email: u.email, verified: u.verified, admin: u.admin };

// the signed-in user (verified, session version current) or null
async function current(req) {
  const c = readCookie(req, await S.secret()); if (!c) return null;
  const u = await byId(c.uid); return u && u.verified && u.sv === c.sv ? u : null;
}
async function need(req) { const u = await current(req); if (!u) throw err(401, 'Not logged in'); return u; }

/* one-time codes: 6 digits, stored hashed, 15 minutes, 5 tries, one live code per email+purpose */
const PURPOSES = { verify: 'confirm your email', reset: 'reset your password', email: 'confirm your new email', keys: 'change your Polymarket US connection', delete: 'delete your account' };
const codeHash = async (email, purpose, code) => hmac(await S.secret(), `${normEmail(email)}|${purpose}|${code}`);
async function sendCode(email, purpose, ip) {
  email = normEmail(email); const base = purpose.split(':')[0]; if (!PURPOSES[base]) throw err(400, 'bad purpose');
  await db.limit(`code:${email}`, 5, 15 * 60e3); if (ip) await db.limit(`codeip:${ip}`, 20, 15 * 60e3);
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  await db.q('DELETE FROM codes WHERE (email=$1 AND purpose=$2) OR exp<$3', [email, purpose, Date.now()]);
  await db.q('INSERT INTO codes (id, email, purpose, hash, exp) VALUES ($1,$2,$3,$4,$5)', [crypto.randomBytes(9).toString('hex'), email, purpose, await codeHash(email, purpose, code), Date.now() + 15 * 60e3]);
  await mail.send(email, `${code} is your Mimic code`, `Your code to ${PURPOSES[base]} on Mimic is:\n\n    ${code}\n\nIt expires in 15 minutes. If you didn't ask for this, ignore this email; nothing changes without the code.`);
}
async function checkCode(email, purpose, code) {
  email = normEmail(email); const r = await db.one('SELECT * FROM codes WHERE email=$1 AND purpose=$2', [email, purpose]);
  if (!r || Number(r.exp) < Date.now()) throw err(400, 'That code expired. Send a new one');
  if (r.tries >= 5) throw err(429, 'Too many wrong codes. Send a new one');
  if (!/^\d{6}$/.test(String(code || '').trim()) || r.hash !== await codeHash(email, purpose, String(code).trim())) { await db.q('UPDATE codes SET tries=tries+1 WHERE id=$1', [r.id]); throw err(400, 'Wrong code'); }
  await db.q('DELETE FROM codes WHERE id=$1', [r.id]);
}
// sensitive actions (Polymarket keys, deleting the account) need the code emailed to you; without email set up, your password
async function confirm(u, body, purpose) {
  if (await mail.configured()) return checkCode(u.email, purpose, body.code);
  if (!(await S.checkPw(String(body.password || ''), u.pw))) throw err(401, 'Password is wrong');
}
// security notice to the account email; never blocks the action it reports
const notify = (email, subject, text) => mail.send(email, subject, `${text}\n\nIf this wasn't you, reset your password now from the Mimic login page.`).catch(() => {});

async function remove(uid) {
  for (const sql of ['DELETE FROM ufollows WHERE uid=$1', 'DELETE FROM notes WHERE uid=$1', 'DELETE FROM botlog WHERE uid=$1', 'DELETE FROM bot WHERE id=$1', 'DELETE FROM btctrades WHERE uid=$1', 'DELETE FROM ntrades WHERE uid=$1', 'DELETE FROM nbot WHERE uid=$1', 'DELETE FROM btcbot WHERE uid=$1', 'DELETE FROM users WHERE id=$1']) await db.q(sql, [uid]);
}
module.exports = { normEmail, validEmail, byId, byEmail, pub, current, need, sendCode, checkCode, confirm, notify, remove };
