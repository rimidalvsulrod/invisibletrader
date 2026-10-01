// Vercel serverless proxy: /api/<path> -> Polymarket data API; /api/gamma/* and /api/clob/* -> those hosts
const HOSTS = { gamma: 'https://gamma-api.polymarket.com', clob: 'https://clob.polymarket.com' };
module.exports = async (req, res) => {
  const segs = [].concat(req.query.path);
  const base = HOSTS[segs[0]] ? HOSTS[segs.shift()] : 'https://data-api.polymarket.com';
  const qs = new URLSearchParams(req.query); qs.delete('path');
  try {
    const r = await fetch(`${base}/${segs.join('/')}?${qs}`);
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 's-maxage=10, stale-while-revalidate=60');
    res.status(r.status).send(await r.text());
  } catch (e) { res.status(502).json({ error: String(e) }); }
};
