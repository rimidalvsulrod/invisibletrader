// Read-only performance report for every strategy: node scripts/report.js   (needs DATABASE_URL; it never writes)
// Prints trades, win rate, P&L, ROI and the breakdowns that show what is working. Paste the output to Claude.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false } });
const $ = (n, d = 2) => (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(d), pc = x => (x * 100).toFixed(0) + '%';
const sum = (a, f) => a.reduce((n, x) => n + (Number(f(x)) || 0), 0);
function line(name, rows, cost) { // rows: closed trades with pnl
  const w = rows.filter(r => r.pnl > 0).length, p = sum(rows, r => r.pnl), c = sum(rows, cost);
  return `${name.padEnd(26)} n=${String(rows.length).padStart(4)}  win ${rows.length ? pc(w / rows.length).padStart(4) : '   -'}  pnl ${$(p).padStart(10)}  roi ${c ? ((p / c) * 100).toFixed(1).padStart(6) + '%' : '     -'}`;
}
function by(title, rows, key, cost) {
  const m = new Map(); for (const r of rows) { const k = key(r); (m.get(k) || m.set(k, []).get(k)).push(r); }
  console.log('  ' + title); [...m].sort((a, b) => sum(b[1], r => r.pnl) - sum(a[1], r => r.pnl)).forEach(([k, v]) => console.log('    ' + line(String(k), v, cost)));
}
const q = async (sql, p) => (await pool.query(sql, p)).rows;
const day = ts => new Date(Number(ts)).toISOString().slice(0, 10);

(async () => {
  const c = await pool.connect(); await c.query('SET TRANSACTION READ ONLY').catch(() => {}); c.release();
  const since = Date.now() - 14 * 864e5;
  console.log('Report generated', new Date().toISOString(), '| all times UTC | closed trades only for win rate and P&L\n');

  // ---- BTC Up/Down
  const btc = await q('SELECT * FROM btctrades'), bc = btc.filter(t => t.status !== 'open' && t.pnl != null);
  console.log('== BTC Up or Down ==  total', btc.length, 'open', btc.length - bc.length);
  if (bc.length) { console.log('  ' + line('all', bc, t => t.price * t.qty));
    for (const m of ['paper', 'live']) { const r = bc.filter(t => t.mode === m); if (r.length) console.log('  ' + line(m, r, t => t.price * t.qty)); }
    by('by timeframe', bc, t => t.tf, t => t.price * t.qty); by('by side', bc, t => t.side, t => t.price * t.qty);
    by('by entry price', bc, t => t.price >= .85 ? '85c+' : t.price >= .7 ? '70-85c' : t.price >= .5 ? '50-70c' : '<50c', t => t.price * t.qty);
    by('by claimed edge', bc, t => t.edge >= 10 ? '10%+' : t.edge >= 6 ? '6-10%' : '<6%', t => t.price * t.qty);
    by('by day', bc, t => day(t.ts), t => t.price * t.qty); }

  // ---- Newsflash
  const nw = await q('SELECT * FROM ntrades'), nc = nw.filter(t => t.status !== 'open' && t.pnl != null);
  console.log('\n== Newsflash ==  total', nw.length, 'open', nw.length - nc.length);
  if (nc.length) { console.log('  ' + line('all', nc, t => t.notional)); by('by exit reason', nc, t => (t.reason || '?').slice(0, 24), t => t.notional);
    by('by headline score', nc, t => t.score >= 8 ? '8+' : t.score >= 5 ? '5-8' : '<5', t => t.notional); by('by symbol (top)', nc, t => t.sym, t => t.notional); }

  // ---- Meme Radar
  const mm = await q('SELECT * FROM memetrades'), mc = mm.filter(t => t.status !== 'open' && t.pnl != null);
  console.log('\n== Meme Radar ==  total', mm.length, 'open', mm.length - mc.length);
  if (mc.length) { console.log('  ' + line('all', mc, t => t.cost)); by('by exit reason', mc, t => (t.reason || '?').slice(0, 24), t => t.cost);
    by('by chain', mc, t => t.chain, t => t.cost); by('by entry score', mc, t => t.score >= 8 ? '8+' : t.score >= 6 ? '6-8' : '<6', t => t.cost); }

  // ---- Edge Lab
  const ed = await q('SELECT * FROM edgetrades'), ec = ed.filter(t => t.status !== 'open' && t.pnl != null);
  console.log('\n== Edge Lab ==  total', ed.length, 'open', ed.length - ec.length);
  for (const s of ['ladder', 'set', 'dog']) { const all = ed.filter(t => t.strat === s), r = ec.filter(t => t.strat === s); console.log(`  ${s}: placed ${all.length}, settled ${r.length}`); if (r.length) console.log('    ' + line(s, r, t => t.cost)); }
  const first = ed.length ? Math.min(...ed.map(t => Number(t.ts))) : 0; console.log('  first Edge Lab trade:', first ? new Date(first).toISOString() : 'none yet');

  // ---- Auto Trader (copies real traders) and its log
  const bots = await q('SELECT id, enabled, pnl, updated FROM bot').catch(() => []); console.log('\n== Auto Trader ==');
  bots.forEach(b => console.log('  ' + b.id, 'enabled', b.enabled, 'pnl', b.pnl != null ? $(b.pnl) : '-'));
  const log = await q('SELECT ts, entry FROM botlog WHERE ts > $1 ORDER BY ts DESC LIMIT 400', [since]).catch(() => []), kinds = new Map();
  for (const l of log) { let e; try { e = JSON.parse(l.entry); } catch { e = {}; } const k = e.kind || e.type || e.status || e.act || 'entry'; kinds.set(k, (kinds.get(k) || 0) + 1); }
  console.log('  last 14 days of log lines by kind:', JSON.stringify([...kinds].sort((a, b) => b[1] - a[1]).slice(0, 10)));
  if (log[0]) console.log('  sample log line:', String(log[0].entry).slice(0, 300));
  await pool.end();
})().catch(e => { console.error('report failed:', e.message); process.exit(1); });
