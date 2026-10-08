// Outgoing email (verification codes, security notices). Any one of these works, first match wins:
//   GMAIL_USER + GMAIL_APP_PASSWORD   (a Google app password; Gmail sends ~500/day)
//   SMTP_URL                          (smtps://user:pass@host:465)
//   RESEND_API_KEY + EMAIL_FROM       (resend.com; needs a verified domain to email anyone but yourself)
//   or the Gmail address + app password the admin saves in the app (Account page), stored encrypted.
// In local development with none of these, the email is printed to the console instead.
const S = require('./settings'), { err } = require('./util');
let transport, transportKey;
async function config() {
  const e = process.env;
  if (e.GMAIL_USER && e.GMAIL_APP_PASSWORD) return { kind: 'smtp', from: e.GMAIL_USER, url: { service: 'gmail', auth: { user: e.GMAIL_USER, pass: e.GMAIL_APP_PASSWORD.replace(/\s+/g, '') } } };
  if (e.SMTP_URL) return { kind: 'smtp', from: e.EMAIL_FROM || decodeURIComponent((/\/\/([^:]+):/.exec(e.SMTP_URL) || [])[1] || ''), url: e.SMTP_URL };
  if (e.RESEND_API_KEY && e.EMAIL_FROM) return { kind: 'resend', from: e.EMAIL_FROM, key: e.RESEND_API_KEY };
  const saved = await S.get('mail').catch(() => null);
  if (saved) { const j = JSON.parse(saved); return { kind: 'smtp', from: j.user, url: { service: 'gmail', auth: { user: j.user, pass: await S.dec(j.pass) } }, saved: true }; }
  return null;
}
const devMode = () => !process.env.VERCEL && process.env.NODE_ENV !== 'production' && !process.env.GITHUB_ACTIONS;
async function configured() { return !!(await config()) || devMode(); }
async function send(to, subject, text) {
  const c = await config();
  if (!c) { if (devMode()) { console.log(`\n[email to ${to}] ${subject}\n${text}\n`); return; } throw err(503, "Email isn't set up on this site yet"); }
  if (c.kind === 'resend') {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${c.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: c.from, to, subject, text }) });
    if (!r.ok) throw err(502, `Couldn't send email (${r.status})`); return;
  }
  const k = JSON.stringify(c.url);
  if (!transport || transportKey !== k) { transport = require('nodemailer').createTransport(c.url); transportKey = k; }
  try { await transport.sendMail({ from: `Mimic <${c.from}>`, to, subject, text }); }
  catch (e) { transport = null; throw err(502, `Couldn't send email: ${String(e.message || e).slice(0, 120)}`); }
}
// admin: save / test Gmail sending from inside the app
async function saveGmail(user, pass) {
  user = String(user || '').trim(); pass = String(pass || '').replace(/\s+/g, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user) || pass.length < 12) throw err(400, 'Enter the Gmail address and its 16-letter app password');
  const t = require('nodemailer').createTransport({ service: 'gmail', auth: { user, pass } });
  try { await t.verify(); } catch (e) { throw err(400, `Gmail refused the login: ${String(e.message || e).slice(0, 120)}`); }
  await S.set('mail', JSON.stringify({ user, pass: await S.enc(pass) })); transport = null;
}
async function status() { const c = await config(); return c ? { set: true, from: c.from, source: c.saved ? 'app' : 'env' } : { set: false, dev: devMode() }; }
module.exports = { send, configured, saveGmail, status };
