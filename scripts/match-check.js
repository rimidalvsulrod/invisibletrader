// Coverage check for the Polymarket -> Polymarket US matcher, on real recent trades.
//   node scripts/match-check.js [trades=1500] [--show]
// Prints how many unique markets copy exactly, copy as "similar", or are skipped (and why).
const M = require('../api/_lib/match-us');
(async () => {
  const n = Number(process.argv[2]) || 1500, show = process.argv.includes('--show'), trades = [];
  for (let off = 0; off < n; off += 500) trades.push(...await fetch(`https://data-api.polymarket.com/trades?limit=500&offset=${off}`).then(r => r.json()).catch(() => []));
  const seen = new Set(), R = { exact: 0, similar: 0, skip: 0 }, why = {}; const t0 = Date.now();
  for (const t of trades) {
    const k = `${t.slug}|${t.outcome}`; if (seen.has(k)) continue; seen.add(k);
    const r = await M.resolve(t).catch(e => ({ reason: `error: ${e.message}` }));
    if (r.m) { R[r.similar ? 'similar' : 'exact']++; if (show) console.log(r.similar ? 'SIMILAR' : 'EXACT  ', `${t.title} | ${t.outcome} -> BUY ${r.side.toUpperCase()} ${r.m.slug} (${r.how})`); }
    else { R.skip++; const w = r.reason.replace(/\d+/g, 'N').slice(0, 80); (why[w] ||= []).push(t.title); }
  }
  console.log(`\n${seen.size} unique markets in ${((Date.now() - t0) / 1000).toFixed(0)}s:`, R);
  for (const [w, v] of Object.entries(why).sort((a, b) => b[1].length - a[1].length).slice(0, 15)) console.log(`  skip ${String(v.length).padStart(4)}  ${w}   e.g. ${v[0].slice(0, 70)}`);
})();
