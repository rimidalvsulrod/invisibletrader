// 24/7 runner (used by .github/workflows/bot.yml). Needs DATABASE_URL.
// Live: listens to Polymarket's real-time trade stream and runs the engine the moment a tracked trader trades (~1s).
// Backup: every 15s the engine also polls each tracked trader, which catches anything missed while reconnecting
// and keeps US-account reconciliation current. Safe alongside other runners: the engine's database lock and
// seen-trade memory make sure each trade is handled once.
const E = require('./api/_lib/engine'), db = require('./api/_lib/db'), M = require('./api/_lib/match-us');
const end = Date.now() + (Number(process.env.RUN_MINUTES) || 130) * 6e4, POLL = 15e3;
const sleep = ms => new Promise(z => setTimeout(z, ms)), log = (...a) => console.log(new Date().toISOString(), ...a);
let stop = false; for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop = true; });

let watch = new Set(), enabled = false, pend = [], needPoll = true;
let ws = null, up = false, lastMsg = 0, lastTracked = 0, lastRun = 0, lastPoll = 0, bar = 0;
const bars = new Array(30).fill(0); // stream trades per 2s over the last minute

async function refresh() {
  const r = await db.one("SELECT enabled FROM bot WHERE id='me'"); enabled = !!r?.enabled;
  let w = (await db.q('SELECT wallet FROM follows')).map(x => x.wallet.toLowerCase());
  if (!w.length) w = (await fetch('https://data-api.polymarket.com/v1/leaderboard?timePeriod=ALL&orderBy=PNL&limit=10').then(x => x.json()).catch(() => [])).map(x => String(x.proxyWallet).toLowerCase());
  if (w.length) watch = new Set(w);
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
      const r = await E.run(ctx).catch(e => ({ error: String(e.message || e) }));
      lastRun = Date.now(); if (poll) lastPoll = lastRun;
      if (r.error || r.trades) log(poll ? 'poll' : 'live', JSON.stringify(r));
      if (!r.ran && !r.error && enabled && ++tries < 20) { pend = batch.concat(pend); needPoll ||= poll; await sleep(500); } // another runner holds the lock
      else tries = 0;
    }
  } finally { running = false; }
}

(async () => {
  await refresh(); connect();
  let beat = 0;
  while (!stop && Date.now() < end) {
    await sleep(1000); const now = Date.now();
    if (now - lastPoll >= POLL && !running) { needPoll = true; refresh().catch(e => log('refresh', e.message)).then(kick); lastPoll = now; }
    if (up && beat % 5 === 0) try { ws.send('ping'); } catch (x) {} // the stream goes quiet without keep-alive pings
    if (up && now - lastMsg > 30e3) { log('stream silent for 30s — reconnecting'); ws.close(); }
    if (++beat % 2 === 0) {
      const live = { t: now, up, watch: watch.size, rate: +(bars.reduce((a, b) => a + b, 0) / 60).toFixed(1),
        bars: [...bars.slice(bar + 1), ...bars.slice(0, bar + 1)], lastTracked, lastRun, lastPoll };
      bar = (bar + 1) % bars.length; bars[bar] = 0;
      db.q("UPDATE bot SET live=$1 WHERE id='me'", [JSON.stringify(live)]).catch(e => log('heartbeat', e.message));
    }
  }
  stop = true; try { ws.close(); } catch (x) {}
  while (running) await sleep(200);
  process.exit(0);
})();
