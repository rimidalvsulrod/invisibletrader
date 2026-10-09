const { Pool } = require('pg');
const { err } = require('./util');
let pool, ready;
// Neon's Vercel integration may name the variable DATABASE_URL, POSTGRES_URL, or add a custom prefix (e.g. STORAGE_DATABASE_URL)
const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || Object.entries(process.env).find(([k, v]) => /(DATABASE_URL|POSTGRES_URL)$/.test(k) && /^postgres/.test(v || ''))?.[1];
const getPool = () => { const url = dbUrl(); if (!url) throw err(503, 'No database connected'); return pool ??= new Pool({ connectionString: url, max: 2 }); };
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS follows (wallet text PRIMARY KEY, name text)`,
  `CREATE TABLE IF NOT EXISTS bot (id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, cfg text, state text, positions text, pnl double precision NOT NULL DEFAULT 0, lock_until bigint, updated bigint)`,
  `CREATE TABLE IF NOT EXISTS botlog (id text PRIMARY KEY, ts bigint NOT NULL, entry text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (k text PRIMARY KEY, v text)`,
  `CREATE TABLE IF NOT EXISTS rate (k text PRIMARY KEY, n int NOT NULL, reset bigint NOT NULL)`,
  `ALTER TABLE bot ADD COLUMN IF NOT EXISTS live text`, // runner heartbeat for the app's live view
  // accounts: every user has their own bot row (bot.id = user id), tracked traders, log, notes and Polymarket US keys
  `CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text UNIQUE NOT NULL, pw text, verified boolean NOT NULL DEFAULT false, admin boolean NOT NULL DEFAULT false, creds text, sv int NOT NULL DEFAULT 1, created bigint)`,
  `CREATE TABLE IF NOT EXISTS codes (id text PRIMARY KEY, email text NOT NULL, purpose text NOT NULL, hash text NOT NULL, exp bigint NOT NULL, tries int NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS ufollows (uid text NOT NULL, wallet text NOT NULL, name text, PRIMARY KEY (uid, wallet))`,
  `CREATE TABLE IF NOT EXISTS notes (id text PRIMARY KEY, uid text NOT NULL, t text NOT NULL, d bigint NOT NULL)`,
  `ALTER TABLE botlog ADD COLUMN IF NOT EXISTS uid text`,
  // BTC Up or Down bot: one row per user (paper balance lives here) + every trade it takes, paper or live
  `CREATE TABLE IF NOT EXISTS btcbot (uid text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, mode text NOT NULL DEFAULT 'paper', cfg text, paper double precision NOT NULL DEFAULT 100, paperstart double precision NOT NULL DEFAULT 100, updated bigint)`,
  // Meme Radar (paper-only meme coin bot): one row per user (paper balance) + every trade
  `CREATE TABLE IF NOT EXISTS membot (uid text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, cfg text, paper double precision NOT NULL DEFAULT 1000, paperstart double precision NOT NULL DEFAULT 1000, updated bigint)`,
  `CREATE TABLE IF NOT EXISTS memetrades (id text PRIMARY KEY, uid text NOT NULL, ts bigint NOT NULL, chain text, pool text, token text, sym text, entry double precision, qty double precision, cost double precision, liq double precision, fdv double precision, score double precision, why text, status text NOT NULL DEFAULT 'open', peak double precision, last double precision, lastts bigint, lastliq double precision, slipin double precision, exitp double precision, proceeds double precision, pnl double precision, reason text, exitts bigint)`,
  // Edge Lab (paper-only mechanical strategies): paper account + every position (a position can have several legs)
  `CREATE TABLE IF NOT EXISTS edgebot (uid text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, cfg text, paper double precision NOT NULL DEFAULT 1000, paperstart double precision NOT NULL DEFAULT 1000, updated bigint)`,
  `CREATE TABLE IF NOT EXISTS edgetrades (id text PRIMARY KEY, uid text NOT NULL, ts bigint NOT NULL, strat text NOT NULL, ref text, label text, legs text, qty double precision, cost double precision, status text NOT NULL DEFAULT 'open', payoff double precision, pnl double precision, gs bigint, settledts bigint)`,
  // Newsflash (Alpaca news bot): the user's Alpaca keys, bot row, and every trade/decision
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS alpaca text`,
  `CREATE TABLE IF NOT EXISTS nbot (uid text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, cfg text, updated bigint)`,
  `CREATE TABLE IF NOT EXISTS ntrades (id text PRIMARY KEY, uid text NOT NULL, ts bigint NOT NULL, sym text NOT NULL, headline text, url text, score double precision, notional double precision, qty double precision, entry double precision, exitp double precision, status text NOT NULL, pnl double precision, reason text, exitts bigint, newsid text)`,
  `CREATE TABLE IF NOT EXISTS btctrades (id text PRIMARY KEY, uid text NOT NULL, ts bigint NOT NULL, slug text NOT NULL, tf text, side text, price double precision, qty double precision, fee double precision, fair double precision, edge double precision, s0 double precision, s double precision, secs double precision, mode text, status text NOT NULL DEFAULT 'open', pnl double precision, wend bigint)`,
];
// One time: the site used to have a single owner (bot row 'me', global follows/log, keys + password in settings).
// Move all of it into the owner's user account so nothing is lost.
async function migrate(pool) {
  const q = (sql, p) => pool.query(sql, p).then(r => r.rows);
  if ((await q('SELECT count(*)::int AS n FROM users'))[0].n) return;
  const get = async k => (await q('SELECT v FROM settings WHERE k=$1', [k]))[0]?.v ?? null;
  const pw = await get('pw'), had = (await q("SELECT id FROM bot WHERE id='me'")).length;
  if (!pw && !process.env.ADMIN_PASSWORD) { await q("DELETE FROM bot WHERE id='me' AND (cfg IS NULL OR cfg='{}') AND (positions IS NULL OR positions='[]')"); return; }
  const C = require('crypto'), email = (process.env.OWNER_EMAIL || 'vladimirdorlus08@gmail.com').trim().toLowerCase(), uid = C.randomBytes(9).toString('base64url');
  const salt = C.randomBytes(16), hash = pw || salt.toString('hex') + ':' + C.scryptSync(String(process.env.ADMIN_PASSWORD), salt, 64).toString('hex');
  await q('INSERT INTO users (id, email, pw, verified, admin, creds, created) VALUES ($1,$2,$3,true,true,$4,$5)', [uid, email, hash, await get('polymarket_us'), Date.now()]);
  if (had) await q("UPDATE bot SET id=$1 WHERE id='me'", [uid]);
  for (const f of await q('SELECT wallet, name FROM follows')) await q('INSERT INTO ufollows (uid, wallet, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [uid, f.wallet, f.name]);
  await q('UPDATE botlog SET uid=$1 WHERE uid IS NULL', [uid]);
  await q("DELETE FROM settings WHERE k IN ('polymarket_us')");
}
const ensure = () => ready ??= (async () => { const p = getPool(); for (const s of SCHEMA) await p.query(s); await migrate(p); })().catch(e => { ready = null; throw e; });
const q = async (sql, params = []) => { await ensure(); return (await getPool().query(sql, params)).rows; };
const one = async (sql, params) => (await q(sql, params))[0];
async function limit(key, max, windowMs) {
  const now = Date.now(), r = await one('SELECT n, reset FROM rate WHERE k=$1', [key]);
  if (!r || Number(r.reset) < now) { await q('INSERT INTO rate (k,n,reset) VALUES ($1,1,$2) ON CONFLICT (k) DO UPDATE SET n=1, reset=$2', [key, now + windowMs]); return; }
  if (r.n >= max) throw err(429, 'Too many attempts — try again in a few minutes');
  await q('UPDATE rate SET n=n+1 WHERE k=$1', [key]);
}
module.exports = { q, one, limit, dbUrl, _migrate: () => migrate(getPool()) };
