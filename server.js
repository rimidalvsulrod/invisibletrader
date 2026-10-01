// Local dev server: serves public/ and runs the same proxy as api/[...path].js
const http = require('http'), fs = require('fs'), url = require('url');
const proxy = require('./api/[...path].js');
http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname.startsWith('/api/')) {
    req.query = { ...u.query, path: u.pathname.slice(5).split('/') };
    res.status = c => (res.statusCode = c, res);
    res.json = o => res.end(JSON.stringify(o));
    res.send = b => res.end(b);
    return proxy(req, res);
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(fs.readFileSync(__dirname + '/public/index.html'));
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
