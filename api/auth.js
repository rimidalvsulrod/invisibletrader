// Accounts: sign up with email verification, log in, reset password, change email/password, log out everywhere, delete.
const crypto = require('crypto');
const { handler, err, makeCookie, clearCookie, ip } = require('./_lib/util');
const db = require('./_lib/db'), S = require('./_lib/settings'), A = require('./_lib/accounts'), mail = require('./_lib/mail');
const ADMIN = (process.env.OWNER_EMAIL || 'vladimirdorlus08@gmail.com').trim().toLowerCase();
const cookie = async u => makeCookie(await S.secret(), u);
const pw = p => { p = String(p || ''); if (p.length < 8) throw err(400, 'Use at least 8 characters'); if (p.length > 200) throw err(400, 'Password is too long'); return p; };

module.exports = handler(async (req, body, q) => {
  const op = q.op || body.op;
  if (op === 'me') {
    if (!db.dbUrl()) return { user: null, setup: { db: false } };
    return { user: A.pub(await A.current(req)), setup: { db: true, email: await mail.configured() } };
  }
  if (op === 'logout') return { ok: true, _cookie: clearCookie() };

  if (op === 'signup') {
    const email = A.normEmail(body.email), pass = pw(body.password);
    if (!A.validEmail(email)) throw err(400, 'Enter a valid email');
    await db.limit('signup:' + ip(req), 10, 60 * 60e3);
    let u = await A.byEmail(email);
    if (u?.verified) throw err(409, 'An account with this email already exists. Log in instead');
    const first = !(await db.one('SELECT id FROM users LIMIT 1'));
    // bootstrap: the very first account, for the admin email, can't receive a code before email is set up
    if (first && email === ADMIN && !(await mail.configured())) {
      const id = crypto.randomBytes(9).toString('base64url');
      await db.q('INSERT INTO users (id, email, pw, verified, admin, created) VALUES ($1,$2,$3,true,true,$4)', [id, email, await S.hashPw(pass), Date.now()]);
      return { ok: true, _cookie: await cookie(await A.byId(id)) };
    }
    if (!(await mail.configured())) throw err(503, "Sign-ups open once the site's email sending is set up");
    if (u) await db.q('UPDATE users SET pw=$2 WHERE id=$1', [u.id, await S.hashPw(pass)]);
    else await db.q('INSERT INTO users (id, email, pw, verified, admin, created) VALUES ($1,$2,$3,false,$4,$5)', [crypto.randomBytes(9).toString('base64url'), email, await S.hashPw(pass), email === ADMIN && !(await db.one('SELECT id FROM users WHERE admin LIMIT 1')), Date.now()]);
    await A.sendCode(email, 'verify', ip(req));
    return { next: 'verify', email };
  }
  if (op === 'verify') {
    const email = A.normEmail(body.email), u = await A.byEmail(email); if (!u) throw err(400, 'Wrong code');
    await A.checkCode(email, 'verify', body.code); await db.q('UPDATE users SET verified=true WHERE id=$1', [u.id]);
    return { ok: true, _cookie: await cookie({ ...u, verified: true }) };
  }
  if (op === 'login') {
    await db.limit('login:' + ip(req), 10, 15 * 60e3); await db.limit('loginem:' + A.normEmail(body.email), 10, 15 * 60e3);
    const u = await A.byEmail(body.email), ok = await S.checkPw(String(body.password || ''), u?.pw);
    if (!u || !ok) throw err(401, 'Wrong email or password');
    if (!u.verified) { await A.sendCode(u.email, 'verify', ip(req)); return { next: 'verify', email: u.email }; }
    return { ok: true, _cookie: await cookie(u) };
  }
  if (op === 'resend') { // verify / reset codes before you're logged in
    const purpose = body.purpose === 'reset' ? 'reset' : 'verify', u = await A.byEmail(body.email);
    if (u && (purpose === 'reset' || !u.verified)) await A.sendCode(u.email, purpose, ip(req));
    return { ok: true };
  }
  if (op === 'forgot') { const u = await A.byEmail(body.email); if (u) await A.sendCode(u.email, 'reset', ip(req)); return { ok: true, next: 'reset' }; }
  if (op === 'reset') {
    const u = await A.byEmail(body.email); if (!u) throw err(400, 'Wrong code');
    const pass = pw(body.password); await A.checkCode(u.email, 'reset', body.code);
    await db.q('UPDATE users SET pw=$2, verified=true, sv=sv+1 WHERE id=$1', [u.id, await S.hashPw(pass)]);
    A.notify(u.email, 'Your Mimic password was reset', 'Your password was just reset and every other device was logged out.');
    return { ok: true, _cookie: await cookie(await A.byId(u.id)) };
  }

  // ---- everything below needs a signed-in, verified user ----
  const u = await A.need(req);
  if (op === 'logoutall') { await db.q('UPDATE users SET sv=sv+1 WHERE id=$1', [u.id]); return { ok: true, _cookie: clearCookie() }; }
  if (op === 'password') {
    if (!(await S.checkPw(String(body.current || ''), u.pw))) throw err(401, 'Current password is wrong');
    await db.q('UPDATE users SET pw=$2, sv=sv+1 WHERE id=$1', [u.id, await S.hashPw(pw(body.password))]);
    A.notify(u.email, 'Your Mimic password changed', 'Your password was just changed and every other device was logged out.');
    return { ok: true, _cookie: await cookie(await A.byId(u.id)) };
  }
  if (op === 'emailstart') {
    const email = A.normEmail(body.email); if (!A.validEmail(email)) throw err(400, 'Enter a valid email');
    if (!(await S.checkPw(String(body.password || ''), u.pw))) throw err(401, 'Password is wrong');
    if (await A.byEmail(email)) throw err(409, 'That email already has an account');
    await A.sendCode(email, 'email:' + u.id, ip(req)); return { ok: true, next: 'emailconfirm', email };
  }
  if (op === 'emailconfirm') {
    const email = A.normEmail(body.email); await A.checkCode(email, 'email:' + u.id, body.code);
    if (await A.byEmail(email)) throw err(409, 'That email already has an account');
    await db.q('UPDATE users SET email=$2 WHERE id=$1', [u.id, email]);
    A.notify(u.email, 'Your Mimic email changed', `Your account email was changed to ${email}.`);
    return { ok: true, user: A.pub(await A.byId(u.id)) };
  }
  if (op === 'code') { // codes for sensitive actions, sent to your own email
    const purpose = ['keys', 'delete'].includes(body.purpose) ? body.purpose : null; if (!purpose) throw err(400, 'bad purpose');
    await A.sendCode(u.email, purpose, ip(req)); return { ok: true };
  }
  if (op === 'delete') {
    await A.confirm(u, body, 'delete'); await A.remove(u.id);
    return { ok: true, _cookie: clearCookie() };
  }
  // ---- admin: email sending setup ----
  if (op === 'mailstatus') { if (!u.admin) throw err(403, 'Admins only'); return mail.status(); }
  if (op === 'mail') { if (!u.admin) throw err(403, 'Admins only'); await mail.saveGmail(body.user, body.pass); await mail.send(u.email, 'Mimic email is working', 'Verification emails will now be sent from this address.'); return mail.status(); }
  throw err(400, 'unknown op');
});
