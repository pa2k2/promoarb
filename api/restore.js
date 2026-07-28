// Restores access on a new device. Requires BOTH the subscription email
// AND the last 4 digits of the card on file — email alone is not proof of
// ownership (anyone could type a subscriber's address). All failures return
// the same generic message so the endpoint can't be used to test whether an
// email belongs to a paying customer.
const crypto = require('crypto');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days; /api/data re-checks the subscription live anyway

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

// Per-instance rate limit. Serverless instances don't share memory, so this
// resets on cold starts — it blunts scripted abuse rather than fully
// preventing it. Swap in Upstash/Redis if the site grows.
const hits = new Map();
function rateLimited(req, limit, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}

async function stripeGet(path) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY },
  });
  const body = await r.json();
  if (!r.ok) {
    const e = new Error((body.error && body.error.message) || 'Stripe request failed');
    e.status = r.status >= 500 ? 502 : 400;
    throw e;
  }
  return body;
}

const GENERIC_FAIL = 'No active subscription matches that email and card — check both and try again, or email promoarbs@gmail.com.';

module.exports = async (req, res) => {
  const missing = ['STRIPE_SECRET_KEY', 'TOKEN_SECRET'].filter(k => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: 'Server not configured — missing env vars: ' + missing.join(', ') + '. Add them in Vercel Settings and redeploy.' });

  if (rateLimited(req, 5, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many restore attempts — wait 10 minutes and try again.' });
  }

  const email = ((req.query && req.query.email) || '').trim().toLowerCase();
  const last4 = ((req.query && req.query.last4) || '').trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter the email you subscribed with' });
  if (!/^\d{4}$/.test(last4)) return res.status(400).json({ error: 'Enter the last 4 digits of the card you subscribed with' });

  try {
    const customers = await stripeGet('customers?email=' + encodeURIComponent(email) + '&limit=3');
    for (const cust of (customers.data || [])) {
      const subs = await stripeGet('subscriptions?customer=' + encodeURIComponent(cust.id) + '&status=active&limit=1');
      if (!subs.data || !subs.data.length) continue;
      const pms = await stripeGet('payment_methods?customer=' + encodeURIComponent(cust.id) + '&type=card&limit=10');
      const cardMatches = (pms.data || []).some(pm => pm.card && pm.card.last4 === last4);
      if (cardMatches) {
        const now = Date.now();
        return res.status(200).json({ token: sign({ c: cust.id, iat: now, exp: now + TOKEN_TTL_MS }) });
      }
    }
    return res.status(404).json({ error: GENERIC_FAIL });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};
