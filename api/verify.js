// Exchanges a Stripe Checkout session_id (from the payment redirect)
// for a signed access token. Zero dependencies — calls Stripe's REST API
// directly, so there is nothing for Vercel to install.
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
    let msg = (body.error && body.error.message) || 'Stripe request failed';
    if (/No such/i.test(msg)) msg += ' — this usually means the STRIPE_SECRET_KEY mode (test vs live) does not match the payment.';
    const e = new Error(msg);
    e.status = r.status >= 500 ? 502 : 400;
    throw e;
  }
  return body;
}

module.exports = async (req, res) => {
  const missing = ['STRIPE_SECRET_KEY', 'TOKEN_SECRET'].filter(k => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: 'Server not configured — missing env vars: ' + missing.join(', ') + '. Add them in Vercel Settings and redeploy.' });

  const sessionId = (req.query && req.query.session_id) || '';
  if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const session = await stripeGet('checkout/sessions/' + encodeURIComponent(sessionId));
    if (session.payment_status !== 'paid' || !session.customer) {
      return res.status(402).json({ error: 'Payment not completed (status: ' + session.payment_status + ')' });
    }
    return res.status(200).json({ token: sign({ c: session.customer, iat: Date.now() }) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};
