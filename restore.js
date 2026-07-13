// Restores access on a new device: looks up the Stripe customer by the
// email they paid with and re-issues a token if their subscription is active.
//
// Caveat (documented in README): anyone who knows a subscriber's email could
// restore access with it. Acceptable for a v1; the fix later is emailing a
// magic link instead of returning the token directly.
import Stripe from 'stripe';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export default async function handler(req, res) {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter the email you subscribed with' });

  const customers = await stripe.customers.list({ email, limit: 3 });
  for (const cust of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: cust.id, status: 'active', limit: 1 });
    if (subs.data.length) {
      return res.status(200).json({ token: sign({ c: cust.id, iat: Date.now() }) });
    }
  }
  return res.status(404).json({ error: 'No active subscription found for that email' });
}
