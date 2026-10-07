// Settings that live in the database so everything can be set up from inside the app (env vars still override).
const crypto = require('crypto'), db = require('./db'), { err } = require('./util');
let SEC;
const get = async k => (await db.one('SELECT v FROM settings WHERE k=$1', [k]))?.v ?? null;
const set = (k, v) => db.q('INSERT INTO settings (k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=$2', [k, v]);
async function secret() { // session-signing / encryption key, generated once
  if ((process.env.SESSION_SECRET || '').length >= 16) return process.env.SESSION_SECRET; if (SEC) return SEC;
  if (!(await get('secret'))) await db.q('INSERT INTO settings (k,v) VALUES ($1,$2) ON CONFLICT (k) DO NOTHING', ['secret', crypto.randomBytes(32).toString('hex')]);
  return SEC = await get('secret');
}
const key = async () => crypto.createHash('sha256').update((await secret()) + '|polymarket-us-keys').digest();
async function enc(text) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', await key(), iv), d = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.'); }
async function dec(s) { const [iv, tag, d] = s.split('.').map(x => Buffer.from(x, 'base64')), c = crypto.createDecipheriv('aes-256-gcm', await key(), iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString('utf8'); }
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 64, (e, k) => e ? no(e) : ok(k)));
async function hasPassword() { return !!(process.env.ADMIN_PASSWORD || await get('pw')); }
async function setPassword(pw) { if (String(pw).length < 8) throw err(400, 'Use at least 8 characters'); const salt = crypto.randomBytes(16); await set('pw', salt.toString('hex') + ':' + (await scrypt(pw, salt)).toString('hex')); }
async function checkPassword(pw) {
  if (process.env.ADMIN_PASSWORD) { const a = crypto.createHash('sha256').update(String(pw)).digest(), b = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest(); return crypto.timingSafeEqual(a, b); }
  const stored = await get('pw'); if (!stored) return false; const [s, h] = stored.split(':'); return crypto.timingSafeEqual(await scrypt(String(pw), Buffer.from(s, 'hex')), Buffer.from(h, 'hex'));
}
const normPem = p => { p = String(p || '').trim().replace(/\\n/g, '\n'); return p; };
async function getCreds() { // {keyId, secret, source} or null
  if (process.env.POLYMARKET_US_KEY_ID && process.env.POLYMARKET_US_SECRET_KEY) return { keyId: process.env.POLYMARKET_US_KEY_ID, secret: process.env.POLYMARKET_US_SECRET_KEY, source: 'env' };
  const raw = await get('polymarket_us'); if (!raw) return null; const j = JSON.parse(raw);
  return { keyId: j.keyId, secret: await dec(j.secret), source: 'app' };
}
async function saveCreds({ keyId, secret }) { await set('polymarket_us', JSON.stringify({ keyId, secret: await enc(secret) })); }
const clearCreds = () => db.q("DELETE FROM settings WHERE k='polymarket_us'");
module.exports = { get, set, secret, hasPassword, setPassword, checkPassword, getCreds, saveCreds, clearCreds, normPem };
