// BTC Up or Down: how often the side that is ahead at a given moment really wins, measured on real minute-by-minute Bitcoin history (Bitstamp, free).
// The textbook chance Phi(ln(S/S0) / (vol * sqrt(minutes left))) is too confident in practice, because the price we see is not exactly the index Polymarket US settles on
// (BRTI), so the start and the live price each carry a few $10 of error. This builds the table the bot trusts instead: for every (window length, minutes left, how many
// volatilities ahead) the win rate of the favourite, measured with that feed error added, smoothed so it can only rise with the lead, and cut to a 95% lower bound.
const get = async u => { for (let i = 0; i < 4; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'mimic' }, signal: AbortSignal.timeout(25e3) }); if (r.ok) return r.json(); } catch (_) {} await new Promise(z => setTimeout(z, 700 * (i + 1))); } throw new Error('Bitstamp history unavailable'); };
const EDGES = [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 99], TLS = { '15m': [1, 2, 3, 4, 5, 6, 7, 8, 9], '1h': [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 36] }, LEN = { '15m': 15, '1h': 60 };
const NOISE = .00012, REPS = 3, SHOCK = 3; // feed error (a fraction of the price, for the start and for the live price each: about $10 at $83k; Coinbase and Bitstamp differ by about $7 minute to minute, so this is on the careful side), noise draws per sample, skip when the last 5 minutes are 3x as wild as the last hour
const Phi = x => { const t = 1 / (1 + .3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; };
const wilson = (w, n, z = 1.96) => { if (!(n > 0)) return 0; const p = w / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return (c - m) / d; };

// minute candles for the last `days` days: { ts: [unix s], px: [[o,h,l,c]] }, gap free
let MC = { at: 0, days: 0, v: null };
async function minutes(days) {
  if (MC.v && MC.days >= days && Date.now() - MC.at < 30 * 6e4) return MC.v.slice ? MC.v : cut(MC.v, days); const now = Math.floor(Date.now() / 1000), start = now - days * 86400, starts = []; for (let s = start; s < now; s += 60000) starts.push(s);
  const out = new Map(); let k = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (k < starts.length) { const s = starts[k++], j = await get(`https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=60&limit=1000&start=${s}`); for (const c of j.data.ohlc) out.set(+c.timestamp, [+c.open, +c.high, +c.low, +c.close]); } }));
  const ts = [...out.keys()].sort((a, b) => a - b); const v = { ts, px: ts.map(t => out.get(t)) }; MC = { at: Date.now(), days, v }; return cut(v, days);
}
const cut = (v, days) => { const from = v.ts[v.ts.length - 1] - days * 86400, i = v.ts.findIndex(t => t >= from); return i <= 0 ? v : { ts: v.ts.slice(i), px: v.px.slice(i) }; };

// every (window, minutes-left) sample: how many vols ahead was the favourite (with feed error), and did it win?
function samples(M, tf, o = {}) {
  const L = LEN[tf], tls = TLS[tf], n = M.ts.length, avg = i => (M.px[i][0] + M.px[i][1] + M.px[i][2] + M.px[i][3]) / 4, out = [], reps = o.reps ?? REPS; let seed = o.seed || 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const r = new Float64Array(n), P1 = new Float64Array(n + 1), P2 = new Float64Array(n + 1); for (let i = 0; i + 1 < n; i++) r[i] = Math.log(M.px[i + 1][3] / M.px[i][3]); for (let i = 0; i < n; i++) { P1[i + 1] = P1[i] + r[i]; P2[i + 1] = P2[i] + r[i] * r[i]; }
  const sdOf = (i0, i1) => { const k = i1 - i0, m = (P1[i1] - P1[i0]) / k; return Math.sqrt(Math.max(0, (P2[i1] - P2[i0] - k * m * m) / (k - 1))); }; // sample sd of returns i0..i1-1
  for (let a = 61; a + L + 1 < n; a++) { if ((M.ts[a] / 60) % L !== 0) continue; const b = a + L, S0 = avg(a - 1), up = avg(b - 1) >= S0;
    for (const tl of tls) { const c = b - tl; if (c - 61 < 0) continue; const sd = Math.max(sdOf(c - 60, c - 1), 2e-4), sd5 = sdOf(c - 6, c - 1); if (sd5 / sd > SHOCK) continue; const S1 = avg(c - 1);
      for (let k = 0; k < reps; k++) { const S = S1 + gauss() * NOISE * S0, B = S0 + gauss() * NOISE * S0, z = Math.log(S / B) / (sd * Math.sqrt(tl)); out.push({ t: M.ts[a], tl, z: Math.abs(z), win: (S >= B) === up }); } } }
  return out;
}
const bin = z => { let i = 0; while (i < EDGES.length - 2 && z >= EDGES[i + 1]) i++; return i; };
// the table: tf -> tl -> [ { n, w, p, lb } per lead bin]. A row pools every sample with at least that many minutes left (more time left is never less risky at the same lead), is made
// monotone in the lead (pool adjacent violators), and n is discounted for the repeated noise draws; lb is a 95% one-sided lower bound.
function table(S, tf, reps = REPS) {
  const T = {}, nb = EDGES.length - 1, tls = TLS[tf], N = {}, W = {}; for (const tl of tls) { N[tl] = new Array(nb).fill(0); W[tl] = new Array(nb).fill(0); }
  for (const s of S) { const b = bin(s.z); N[s.tl][b]++; if (s.win) W[s.tl][b]++; }
  tls.forEach((tl, ti) => { const n = new Array(nb).fill(0), w = new Array(nb).fill(0); for (const t2 of tls.slice(ti)) for (let i = 0; i < nb; i++) { n[i] += N[t2][i]; w[i] += W[t2][i]; }
    const blocks = []; for (let i = 0; i < nb; i++) { blocks.push({ n: n[i] / reps, w: w[i] / reps, from: i, to: i }); while (blocks.length > 1) { const a = blocks[blocks.length - 2], b = blocks[blocks.length - 1]; if (a.n > 0 && b.n > 0 && a.w / a.n > b.w / b.n) blocks.splice(blocks.length - 2, 2, { n: a.n + b.n, w: a.w + b.w, from: a.from, to: b.to }); else break; } }
    const cells = new Array(nb); for (const bl of blocks) for (let i = bl.from; i <= bl.to; i++) cells[i] = { n: Math.round(bl.n), w: Math.round(bl.w * 10) / 10, p: bl.n ? bl.w / bl.n : 0, lb: wilson(bl.w, bl.n, 1.645) }; T[tl] = cells; });
  return T;
}
function build(M, o = {}) { const t = { t: Date.now(), days: Math.round((M.ts[M.ts.length - 1] - M.ts[0]) / 86400), noise: NOISE, edges: EDGES, tables: {} }; for (const tf of Object.keys(TLS)) t.tables[tf] = table(samples(M, tf, o), tf); return t; }
// what the bot asks: the favourite's chance of winning, given `secs` left, how far the price is from the start (lnRatio = |ln(price / start)|) and the per-minute volatility
// -> { p, lb, n, tl, z }. It uses the nearest table row with at least as much time left, and the lead is measured on that row's minutes, so it is never optimistic.
function lookup(cal, tf, secs, lnRatio, sig) {
  const T = cal?.tables?.[tf]; if (!T || !(lnRatio >= 0) || !(sig > 0)) return null; const need = Math.max(1, Math.ceil(secs / 60)), tl = TLS[tf].find(x => x >= need); if (tl == null) return null;
  const z = lnRatio / (sig * Math.sqrt(tl)), c = T[tl]?.[bin(z)]; return c && c.n >= 8 ? { p: c.p, lb: c.lb, n: c.n, tl, z } : null;
}

// the backtest: calibrate on the first part of the history, then judge on the rest it has never seen.
//  rows   = for each confidence the table claims (its 95% lower bound), what really happened on days the table never saw
//  lead   = at one moment in the window (minutes left), per size of lead: what the textbook model claimed, what the table claims, what really happened
const cellOf = (cal, tf, tl, z) => { const c = cal.tables[tf]?.[tl]?.[bin(z)]; return c && c.n >= 8 ? c : null; };
function walkForward(M, tf, testFrac = .35) {
  const tcut = M.ts[Math.floor(M.ts.length * (1 - testFrac))], train = samples(M, tf, { seed: 111 }).filter(s => s.t < tcut), test = samples(M, tf, { seed: 999, reps: 1 }).filter(s => s.t >= tcut), cal = { tables: { [tf]: table(train, tf) } };
  const rows = [.9, .95, .97, .99].map(thr => { let n = 0, w = 0, lbs = 0; for (const s of test) { const c = cellOf(cal, tf, s.tl, s.z); if (c && c.lb >= thr) { n++; if (s.win) w++; lbs += c.lb; } } return { thr, n, win: n ? w / n : null, claimed: n ? lbs / n : null }; });
  const focus = tf === '15m' ? 2 : 5, lead = []; for (let i = 0; i < EDGES.length - 2; i++) { let n = 0, w = 0, ph = 0, lbs = 0; for (const s of test) if (s.tl === focus && bin(s.z) === i) { n++; if (s.win) w++; ph += Phi(s.z); const c = cellOf(cal, tf, focus, s.z); lbs += c ? c.lb : 0; } if (n >= 15) lead.push({ from: EDGES[i], to: EDGES[i + 1], n, win: w / n, textbook: ph / n, table: lbs / n }); }
  return { tf, trainDays: Math.round((tcut - M.ts[0]) / 86400), testDays: Math.round((M.ts[M.ts.length - 1] - tcut) / 86400), testSamples: test.length, rows, focus, lead };
}
module.exports = { cutDays: cut, minutes, samples, table, build, lookup, walkForward, EDGES, TLS, LEN, NOISE, SHOCK, Phi, wilson };
