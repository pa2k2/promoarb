// Minimal static server for local preview of promoarb-v2/public (dev only).
// Also mocks the /api/* endpoints so the subscribed (Pro) experience can be
// previewed locally: /api/data serves the real paid dataset from api/data.js
// to any caller with a token — auth is NOT checked here, dev only.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'public');
const data = require(path.join(__dirname, '..', 'api', 'data.js'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);

  /* ----- mock API (dev only) ----- */
  if (p === '/api/data')   return json(res, 200, { promos: data.PROMOS, cash: data.CASH_OFFERS, guides: data.GUIDES });
  if (p === '/api/verify') return json(res, 200, { token: 'dev.dev' });
  if (p === '/api/restore') return json(res, 200, { token: 'dev.dev' });
  if (p === '/api/subscribe') return json(res, 200, { ok: true });
  if (p === '/api/portal') return json(res, 200, { url: 'https://billing.stripe.com/p/session/test_mock' });
  if (p === '/api/affiliates') return json(res, 200, { generated_at: new Date().toISOString(), affiliates: { demo_creator: { signups: 3, revenue_usd: 139 } } });
  if (p === '/api/health') return json(res, 200, { ok: true, stripe_key: 'mocked (local dev)', token_secret: 'mocked (local dev)', node: process.version });

  /* ----- static files ----- */
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, body) => {
    if (err) {
      // Serve the branded 404 (matches Vercel's public/404.html behavior)
      return fs.readFile(path.join(root, '404.html'), (e2, page) => {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(e2 ? 'not found' : page);
      });
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
}).listen(4173, () => console.log('serving on http://localhost:4173 (Pro mocks on)'));
