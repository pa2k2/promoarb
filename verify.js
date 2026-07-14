// Exchanges a Stripe Checkout session_id (from the payment success redirect)
// for a signed access token the frontend stores in localStorage.
import Stripe from 'stripe';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export default async function handler(req, res) {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid' || !session.customer) {
      return res.status(402).json({ error: 'Payment not completed' });
    }
    // Token carries only the Stripe customer id; subscription status is
    // re-checked live on every /api/data call, so cancellations cut access.
    const token = sign({ c: session.customer, iat: Date.now() });
    return res.status(200).json({ token });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid or expired session' });
  }
}
