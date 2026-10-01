const crypto = require('crypto');
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const err = (s, m) => new HttpError(s, m);
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('base64url');
const same = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };
const COOKIE = 'it_session', DAY = 864e5, secure = () => (process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '');
function makeCookie(key, days = 30) { const body = Buffer.from(JSON.stringify({ owner: true, exp: Date.now() + days * DAY })).toString('base64url'); return `${COOKIE}=${body}.${hmac(key, body)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure()}`; }
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`;
function isOwner(req, key) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '=')); if (!m) return false;
  const [body, sig] = m.slice(COOKIE.length + 1).split('.'); if (!body || !sig || !same(sig, hmac(key, body))) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url')).exp > Date.now(); } catch (e) { return false; }
}
const ip = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
// JSON in/out, error mapping, JSON-only POSTs (CSRF hardening together with SameSite=Lax)
const handler = fn => async (req, res) => {
  try {
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').includes('application/json')) throw err(415, 'JSON only');
    const out = await fn(req, req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {}, req.query || {}) || { ok: true };
    if (out._cookie) { res.setHeader('Set-Cookie', out._cookie); delete out._cookie; }
    res.setHeader('cache-control', 'no-store'); return res.status(200).json(out);
  } catch (e) { if (!e.status) console.error(e); return res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' }); }
};
const needOwner = (req, key) => { if (!isOwner(req, key)) throw err(401, 'Not logged in'); };
module.exports = { err, same, makeCookie, clearCookie, isOwner, needOwner, ip, handler, DAY };
