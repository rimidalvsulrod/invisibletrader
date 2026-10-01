// Vercel serverless proxy: /api/proxy?u=<path>&<query> -> Polymarket APIs.
// u starting with gamma/ or clob/ goes to those hosts; anything else goes to the data API.
const HOSTS = { gamma: 'https://gamma-api.polymarket.com', clob: 'https://clob.polymarket.com' };
module.exports = async (req, res) => {
  const segs = String(req.query.u || '').split('/').filter(s => s && s !== '..' && s !== '.');
  if (!segs.length) return res.status(400).json({ error: 'missing u' });
  const base = HOSTS[segs[0]] ? HOSTS[segs.shift()] : 'https://data-api.polymarket.com';
  const qs = new URLSearchParams(req.query); qs.delete('u');
  try {
    const r = await fetch(`${base}/${segs.join('/')}?${qs}`);
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 's-maxage=10, stale-while-revalidate=60');
    res.status(r.status).send(await r.text());
  } catch (e) { res.status(502).json({ error: String(e) }); }
};
