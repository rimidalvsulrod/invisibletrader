// Vercel serverless proxy to Polymarket data API
module.exports = async (req, res) => {
  const p = [].concat(req.query.path).join('/');
  const qs = new URLSearchParams(req.query); qs.delete('path');
  const r = await fetch(`https://data-api.polymarket.com/${p}?${qs}`);
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 's-maxage=5');
  res.status(r.status).send(await r.text());
};
