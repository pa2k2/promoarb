// Restores access on a new device: looks up the Stripe customer by email
// and re-issues a token if any subscription is active.
const crypto = require('crypto');

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
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

module.exports = async (req, res) => {
  const missing = ['STRIPE_SECRET_KEY', 'TOKEN_SECRET'].filter(k => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: 'Server not configured — missing env vars: ' + missing.join(', ') + '. Add them in Vercel Settings and redeploy.' });

  const email = ((req.query && req.query.email) || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter the email you subscribed with' });

  try {
    const customers = await stripeGet('customers?email=' + encodeURIComponent(email) + '&limit=3');
    for (const cust of (customers.data || [])) {
      const subs = await stripeGet('subscriptions?customer=' + encodeURIComponent(cust.id) + '&status=active&limit=1');
      if (subs.data && subs.data.length) {
        return res.status(200).json({ token: sign({ c: cust.id, iat: Date.now() }) });
      }
    }
    return res.status(404).json({ error: 'No active subscription found for that email' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};
