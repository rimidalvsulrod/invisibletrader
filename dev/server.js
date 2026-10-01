// Local dev server: serves public/ and runs the files in api/ like Vercel does.
// Optional: DEV_PGMEM=1 runs with an in-memory Postgres so you can try accounts/bot locally without a database.
if (process.env.DEV_PGMEM && !process.env.DATABASE_URL) {
  const { newDb } = require('pg-mem'); require.cache[require.resolve('pg')] = { exports: newDb().adapters.createPg(), loaded: true, id: 'pg' };
  process.env.DATABASE_URL = 'postgres://memory';
}
const http = require('http'), fs = require('fs'), url = require('url'), path = require('path');
http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5).replace(/[^a-z]/g, '');
    if (!fs.existsSync(path.join(__dirname, '..', 'api', name + '.js'))) { res.writeHead(404); return res.end('no such api'); }
    let raw = ''; for await (const ch of req) raw += ch;
    req.query = u.query; try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
    res.status = c => (res.statusCode = c, res);
    res.json = o => (res.setHeader('content-type', 'application/json'), res.end(JSON.stringify(o)));
    res.send = b => res.end(b);
    return require('../api/' + name + '.js')(req, res);
  }
  const f = path.join(__dirname, '..', 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(path.join(__dirname, '..', 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
