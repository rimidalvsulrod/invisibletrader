"""Kronos forecaster (https://github.com/shiyu-coder/Kronos, MIT licence): a worker the 24/7 runner talks to over stdin / stdout.
One JSON request per line in, one JSON reply per line out:
  in : { id, pred, n, jobs: [{ key, t: [epoch seconds], o, h, l, c, v }] }      (every job has the same number of candles)
  out: { id, ok, out: [{ key, last, mean: [pred closes], q10, q50, q90, pUp, hi, lo }] }  or  { id, ok: false, error }
It loads the model once, draws n sample paths per job (one batch) and keeps ALL of them, so the bot can read how much the paths agree
instead of only their average. Needs: torch, numpy, pandas, einops, huggingface_hub, safetensors, and the Kronos repo in KRONOS_DIR."""
import json, os, sys, numpy as np, pandas as pd

sys.path.insert(0, os.environ.get('KRONOS_DIR', 'Kronos'))
import torch  # noqa: E402
from model import Kronos, KronosTokenizer, KronosPredictor  # noqa: E402
import model.kronos as K  # noqa: E402

torch.set_num_threads(int(os.environ.get('KRONOS_THREADS', '2')))
NAME = os.environ.get('KRONOS_MODEL', 'Kronos-small')
# the exact published files (safetensors: weights only, nothing is executed on load); a later change on Hugging Face is not picked up
REV = {'Kronos-small': '901c26c1332695a2a8f243eb2f37243a37bea320', 'Kronos-mini': 'f4e68697d9d5aed55cef5c96aabc3376bcad9f81',
       'Kronos-Tokenizer-base': '0e0117387f39004a9016484a186a908917e22426', 'Kronos-Tokenizer-2k': '26966d0035065a0cae0ebad7af8ece35bc1fb51c'}
TOK = 'Kronos-Tokenizer-2k' if NAME == 'Kronos-mini' else 'Kronos-Tokenizer-base'
tok = KronosTokenizer.from_pretrained('NeoQuasar/' + TOK, revision=REV[TOK])
mdl = Kronos.from_pretrained('NeoQuasar/' + NAME, revision=REV[NAME])
CTX = 2048 if NAME == 'Kronos-mini' else 512
pred = KronosPredictor(mdl, tok, device='cpu', max_context=CTX)
torch.manual_seed(7)


def forecast(jobs, steps, n, T=1.0, top_p=0.9):
    """All jobs in one batch. Returns, per job, the n sampled paths [n, steps, 6] (open high low close volume amount) in price units."""
    xs, st, ys, mu, sd = [], [], [], [], []
    for j in jobs:
        df = pd.DataFrame({'open': j['o'], 'high': j['h'], 'low': j['l'], 'close': j['c'], 'volume': j['v']})
        df['amount'] = df['volume'] * df[['open', 'high', 'low', 'close']].mean(axis=1)
        # exchange-local clock (America/New_York): the model reads minute / hour / weekday from the stamps
        t = pd.to_datetime(pd.Series(j['t']), unit='s', utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
        y = pd.Series(pd.date_range(t.iloc[-1] + pd.Timedelta(minutes=5), periods=steps, freq='5min'))
        a = df[['open', 'high', 'low', 'close', 'volume', 'amount']].values.astype(np.float32)
        m, s = a.mean(axis=0), a.std(axis=0)
        xs.append(np.clip((a - m) / (s + 1e-5), -5, 5)); mu.append(m); sd.append(s)
        st.append(K.calc_time_stamps(t).values.astype(np.float32)); ys.append(K.calc_time_stamps(y).values.astype(np.float32))
    dev = pred.device
    x, xs_, ys_ = (torch.from_numpy(np.stack(v)).to(dev) for v in (xs, st, ys))
    orig = np.mean
    # the library averages the sampled paths at the very end; keep them instead (this call only)
    np.mean = lambda a, axis=None, **k: a if (axis == 1 and getattr(a, 'ndim', 0) == 4) else orig(a, axis=axis, **k)
    try:
        z = K.auto_regressive_inference(tok, mdl, x, xs_, ys_, CTX, steps, 5, T, 0, top_p, n, False)  # [jobs, n, ctx+steps, 6]
    finally:
        np.mean = orig
    out = []
    for i in range(len(jobs)):
        p = z[i][:, -steps:, :] * (sd[i] + 1e-5) + mu[i]
        out.append(p)
    return out


def summarize(job, p):
    c = p[:, :, 3]  # sampled closes [n, steps]
    fin = c[:, -1]
    last = float(job['c'][-1])
    return {'key': job['key'], 'last': last, 'mean': [round(float(v), 4) for v in c.mean(axis=0)],
            'q10': round(float(np.quantile(fin, .1)), 4), 'q50': round(float(np.quantile(fin, .5)), 4), 'q90': round(float(np.quantile(fin, .9)), 4),
            'pUp': round(float((fin > last).mean()), 4), 'hi': round(float(p[:, :, 1].max(axis=1).mean()), 4), 'lo': round(float(p[:, :, 2].min(axis=1).mean()), 4)}


def main():
    print(json.dumps({'ready': True, 'model': NAME}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = {}
        try:
            req = json.loads(line)
            jobs, steps, n = req['jobs'], int(req.get('pred', 12)), int(req.get('n', 8))
            res = []
            B = int(req.get('batch', 6))
            for k in range(0, len(jobs), B):
                part = jobs[k:k + B]
                with torch.no_grad():
                    ps = forecast(part, steps, n)
                res += [summarize(j, p) for j, p in zip(part, ps)]
            print(json.dumps({'id': req.get('id'), 'ok': True, 'out': res}), flush=True)
        except Exception as e:  # noqa: BLE001 - report to the caller, keep the worker alive
            print(json.dumps({'id': req.get('id'), 'ok': False, 'error': f'{type(e).__name__}: {e}'}), flush=True)


if __name__ == '__main__':
    main()
