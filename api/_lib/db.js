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
  `INSERT INTO bot (id, enabled, cfg, state, positions) VALUES ('me', false, '{}', '{}', '[]') ON CONFLICT (id) DO NOTHING`,
];
const ensure = () => ready ??= (async () => { for (const s of SCHEMA) await getPool().query(s); })().catch(e => { ready = null; throw e; });
const q = async (sql, params = []) => { await ensure(); return (await getPool().query(sql, params)).rows; };
const one = async (sql, params) => (await q(sql, params))[0];
async function limit(key, max, windowMs) {
  const now = Date.now(), r = await one('SELECT n, reset FROM rate WHERE k=$1', [key]);
  if (!r || Number(r.reset) < now) { await q('INSERT INTO rate (k,n,reset) VALUES ($1,1,$2) ON CONFLICT (k) DO UPDATE SET n=1, reset=$2', [key, now + windowMs]); return; }
  if (r.n >= max) throw err(429, 'Too many attempts — try again in a few minutes');
  await q('UPDATE rate SET n=n+1 WHERE k=$1', [key]);
}
module.exports = { q, one, limit, dbUrl };
