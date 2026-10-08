// 24/7 runner (used by .github/workflows/bot.yml). Needs DATABASE_URL.
// Live: listens to Polymarket's real-time trade stream and runs the engine the moment a tracked trader trades (~1s).
// Backup: every 15s the engine also polls each tracked trader, which catches anything missed while reconnecting
// and keeps US-account reconciliation current. Safe alongside other runners: the engine's database lock and
// seen-trade memory make sure each trade is handled once.
process.env.MIMIC_RUNNER = '1'; // lets the BTC bot hold a live WebSocket price feed open
const E = require('./api/_lib/engine'), db = require('./api/_lib/db'), M = require('./api/_lib/match-us'), B = require('./api/_lib/btc'), N = require('./api/_lib/news');
const end = Date.now() + (Number(process.env.RUN_MINUTES) || 130) * 6e4, POLL = 15e3;
const sleep = ms => new Promise(z => setTimeout(z, ms)), log = (...a) => console.log(new Date().toISOString(), ...a);
let stop = false; for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop = true; });

let watch = new Set(), enabled = false, pend = [], needPoll = true;
let ws = null, up = false, lastMsg = 0, lastTracked = 0, lastRun = 0, lastPoll = 0, bar = 0;
const bars = new Array(30).fill(0); // stream trades per 2s over the last minute

// every account whose bot is on: watch the union of their tracked traders (+ the top 10 for anyone tracking nobody)
async function refresh() {
  const on = await db.q('SELECT b.id, (SELECT count(*)::int FROM ufollows f WHERE f.uid=b.id) AS n FROM bot b JOIN users u ON u.id=b.id WHERE b.enabled=true AND u.verified=true');
  enabled = on.length > 0;
  const w = new Set((await db.q('SELECT DISTINCT f.wallet FROM ufollows f JOIN bot b ON b.id=f.uid WHERE b.enabled=true')).map(x => x.wallet.toLowerCase()));
  if (on.some(x => !x.n)) (await fetch('https://data-api.polymarket.com/v1/leaderboard?timePeriod=ALL&orderBy=PNL&limit=10').then(x => x.json()).catch(() => [])).forEach(x => w.add(String(x.proxyWallet).toLowerCase()));
  if (w.size || !enabled) watch = w;
  M.index().catch(e => log('Polymarket US index', e.message)); // keep the strict matcher warm
}

function connect() {
  ws = new WebSocket('wss://ws-live-data.polymarket.com');
  ws.onopen = () => { up = true; lastMsg = Date.now(); ws.send(JSON.stringify({ action: 'subscribe', subscriptions: [{ topic: 'activity', type: 'trades' }] })); log('stream connected'); };
  ws.onmessage = e => {
    if (typeof e.data !== 'string' || e.data[0] !== '{') return; let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    const t = m.payload; if (!t?.proxyWallet || !t.transactionHash) return; lastMsg = Date.now(); bars[bar]++;
    if (enabled && watch.has(t.proxyWallet.toLowerCase())) { pend.push(t); lastTracked = Date.now(); kick(); }
  };
  ws.onclose = () => { if (up) log('stream closed — reconnecting'); up = false; if (!stop) setTimeout(connect, 1000); };
  ws.onerror = () => { try { ws.close(); } catch (x) {} };
}

let running = false;
async function kick() {
  if (running) return; running = true;
  try {
    for (let tries = 0; !stop && (pend.length || needPoll); ) {
      const poll = needPoll, batch = pend; needPoll = false; pend = [];
      const ctx = poll ? undefined : { trades: async a => batch.filter(t => t.proxyWallet.toLowerCase() === a.toLowerCase()), top: async () => [...watch] };
      const r = await E.runAll(ctx).catch(e => ({ error: String(e.message || e) }));
      lastRun = Date.now(); if (poll) lastPoll = lastRun;
      if (r.error || r.errors || r.trades) log(poll ? 'poll' : 'live', JSON.stringify(r));
      if (!r.ran && !r.error && enabled && ++tries < 20) { pend = batch.concat(pend); needPoll ||= poll; await sleep(500); } // another runner holds the lock
      else tries = 0;
    }
  } finally { running = false; }
}

(async () => {
  await refresh(); connect(); B.start(); // BTC bot: live price streams, re-checks on every move
  N.start(); // Newsflash: trades each headline the moment it lands
  let beat = 0;
  while (!stop && Date.now() < end) {
    await sleep(1000); const now = Date.now();
    if (now - lastPoll >= POLL && !running) { needPoll = true; refresh().catch(e => log('refresh', e.message)).then(kick); lastPoll = now; }
    if (up && beat % 5 === 0) try { ws.send('ping'); } catch (x) {} // the stream goes quiet without keep-alive pings
    if (beat % 3 === 0) N.tick().catch(e => log('news', e.message)); // Newsflash: news feed + exits every 3s
    B.tick().catch(e => log('btc', e.message)); // BTC bot heartbeat (price moves trigger extra checks, up to 4 a second)
    if (up && now - lastMsg > 30e3) { log('stream silent for 30s — reconnecting'); ws.close(); }
    if (++beat % 2 === 0) {
      const live = { t: now, up, watch: watch.size, rate: +(bars.reduce((a, b) => a + b, 0) / 60).toFixed(1),
        bars: [...bars.slice(bar + 1), ...bars.slice(0, bar + 1)], lastTracked, lastRun, lastPoll };
      bar = (bar + 1) % bars.length; bars[bar] = 0;
      db.q("INSERT INTO settings (k, v) VALUES ('live', $1) ON CONFLICT (k) DO UPDATE SET v=$1", [JSON.stringify(live)]).catch(e => log('heartbeat', e.message));
    }
  }
  stop = true; try { ws.close(); } catch (x) {}
  while (running) await sleep(200);
  process.exit(0);
})();
