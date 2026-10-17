// AI family (Strategy Lab): Kronos AI. The rules read forecasts from Kronos, an open-source foundation model for candlesticks (api/_lib/kronos.js), and trade them on
// 5-minute NQ / ES candles, America/New_York. The engine, chart and backtest are the same as the ICT bots'; the only extra input is the stored forecast for each decision candle.
const L = require('../lab'), { fut } = require('./ictfam');
const TICK = .25, snap = x => Math.round(x / TICK) * TICK, f2 = x => Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const K = () => require('../kronos'); // loaded on use: kronos.js needs lab.js, which loads this file

const kronos = fut({ id: 'kronos', name: 'Kronos AI', group: 'AI', icon: 'spark',
  blurb: 'Asks Kronos, an open-source AI model trained on candlesticks from 45+ exchanges, to draw 8 possible paths for the next hour. Trades only when almost all of them agree on a direction.',
  how: ['Every 15 minutes between 9:45 and 15:30 ET, when a 5-minute candle closes, Kronos (the small model) reads the last 256 candles and writes 8 possible paths for the next 12 candles (one hour).',
    'Signal: at least the set share of the 8 paths end above (below) the current price, AND the median path ends at least the set number of ATRs away in that direction.',
    'Entry at the next open. Stop: the set number of ATRs from the entry (kept between 0.04% and 0.4% of price). No profit target: the trade is closed at the end of the forecast hour (12 candles), the horizon the model was asked about.',
    'The forecast is stored under the candle it was made on and uses only candles up to and including that one. The bot, the chart and the backtest all read the same stored numbers. Flat by 15:55.'],
  defaults: { conf: .75, move: .5, stop: 1.5, max: 2 }, dataNote: 'Free Yahoo Finance 5-minute NQ and ES futures candles plus the Kronos forecasts stored by the 24/7 runner (Kronos-small on a CPU). The backtest covers only the times a forecast exists for, 3 decision times a session.',
  honest: 'Kronos is a forecasting model, not a trading system: its published results measure forecast error, not trading profit, and it came with no entry or exit rules (these rules are mine, fixed before testing). Tested on 294 forecasts (147 each on NQ and ES, 3 decision times a session, about 50 sessions, Aug-Oct 2026): the median path called the next hour\'s direction right 49% of the time (a coin flip is 50%; always-up got 52%). With the default settings the rules made -2.9R on NQ (68 trades) and -3.2R on ES (69 trades): break-even before real-world costs, no edge found. Requiring all 8 paths to agree looked better (+6R on each, 40 and 35 trades), but I only found that setting after seeing the results, so it is a lead to test on new data, not evidence. In 73% of forecasts the 8 paths already agreed 75% or more, so agreement tells little about confidence. A study of the idea, not a money-maker.',
  params: [{ k: 'conf', label: 'Agreement', min: .5, max: 1, step: .125, unit: 'share of paths that must agree' }, { k: 'move', label: 'Median move', min: 0, max: 3, step: .25, unit: '× ATR minimum' }, { k: 'stop', label: 'Stop', min: .5, max: 4, step: .25, unit: '× ATR from the entry' }],
  idle: 'Waiting for the next Kronos forecast (one every 15 minutes from 9:45 to 15:30 ET).',
  setup({ b, S, atr }, cfg) {
    const fc = K().cache(cfg.sym), levels = [];
    return { i0: S.first, win: x => x.m >= 580 && x.m <= 925, draw: { levels }, gen(i) {
      const x = b[i], f = fc.get(x.t); if (!f || !(atr[i] > 0)) return null;
      const dir = f.p >= cfg.conf ? 1 : f.p <= 1 - cfg.conf ? -1 : 0, move = (f.q50 - f.c) * dir; if (!dir || move < cfg.move * atr[i]) return null;
      levels.push({ y: f.q50, name: 'Kronos median', color: '#b04dff', t0: x.t, dash: '3 3' });
      const dist = Math.min(Math.max(cfg.stop * atr[i], .0004 * x.c), .004 * x.c), agree = Math.round((dir === 1 ? f.p : 1 - f.p) * K().SAMPLES);
      return { dir, entry: null, stop: snap(x.c - dir * dist), target: null, hold: K().PRED - 1,
        why: `Kronos: ${agree} of ${K().SAMPLES} paths end ${dir === 1 ? 'higher' : 'lower'}; median ${f2(f.q50)} (${move >= 0 ? '+' : ''}${f2(move)} pts in an hour)` };
    } };
  } });
for (const m of ['view', 'backtest', 'live']) { const f = kronos[m]; kronos[m] = async (...a) => { await K().warm(); return f(...a); }; } // forecasts are loaded before the (synchronous) rules run
module.exports = { STRATS: [kronos] };
