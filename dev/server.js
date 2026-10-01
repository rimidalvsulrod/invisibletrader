// Local dev server: serves public/ and runs the same proxy as api/proxy.js
const http = require('http'), fs = require('fs'), url = require('url'), path = require('path');
const proxy = require('../api/proxy.js');
http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname.startsWith('/api/')) {
    req.query = u.query;
    res.status = c => (res.statusCode = c, res);
    res.json = o => res.end(JSON.stringify(o));
    res.send = b => res.end(b);
    return proxy(req, res);
  }
  const f = path.join(__dirname, '..', 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(path.join(__dirname, '..', 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
