// Self-serve subscription management (update card, cancel, invoices).
// Verifies the caller's access token, then creates a Stripe Customer Portal
// session and returns its URL. One-time setup: activate the Customer Portal
// in Stripe Dashboard -> Settings -> Billing -> Customer portal.
const crypto = require('crypto');

function verifyToken(token) {
  try {
    const [body, sig] = (token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}

// Per-instance rate limit (resets on cold start — see note in restore.js).
const hits = new Map();
function rateLimited(req, limit, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}

module.exports = async (req, res) => {
  const missing = ['STRIPE_SECRET_KEY', 'TOKEN_SECRET'].filter(k => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: 'Missing env vars: ' + missing.join(', ') });

  if (rateLimited(req, 10, 60 * 1000)) return res.status(429).json({ error: 'Too many attempts — wait a minute.' });

  const token = ((req.headers && req.headers.authorization) || '').replace('Bearer ', '');
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Sign in required — restore access first.' });

  const returnUrl = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'example.com');
  try {
    const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ customer: payload.c, return_url: returnUrl }),
    });
    const body = await r.json();
    if (!r.ok) {
      let msg = (body.error && body.error.message) || 'Stripe request failed';
      if (/configuration/i.test(msg)) msg += ' — activate the Customer Portal in Stripe Dashboard -> Settings -> Billing.';
      return res.status(r.status >= 500 ? 502 : 400).json({ error: msg });
    }
    return res.status(200).json({ url: body.url });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
