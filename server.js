// Zero-dependency server: serves index.html and proxies Polymarket data API.
const http = require('http'), fs = require('fs');
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const r = await fetch('https://data-api.polymarket.com' + req.url.slice(4));
      res.writeHead(r.status, { 'content-type': 'application/json' });
      return res.end(await r.text());
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(__dirname + '/public/index.html'));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, () => console.log('Whale tracker: http://localhost:' + PORT));
