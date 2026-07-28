// Owner-only affiliate report. Visit:
//   /api/affiliates?key=YOUR_ADMIN_KEY
// Tallies recent Stripe Checkout sessions by client_reference_id (the ?ref=
// code captured on the site), so you can see signups and revenue per
// affiliate and pay commissions manually each month.
// Setup: add ADMIN_KEY (any long random string, different from TOKEN_SECRET)
// in Vercel env vars. Zero dependencies.

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
  const missing = ['STRIPE_SECRET_KEY', 'ADMIN_KEY'].filter(k => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: 'Missing env vars: ' + missing.join(', ') });

  const key = (req.query && req.query.key) || '';
  if (!key || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Walk up to 300 recent checkout sessions (plenty at launch scale)
    const byCode = {};
    let startingAfter = null;
    for (let page = 0; page < 3; page++) {
      const qs = 'limit=100' + (startingAfter ? '&starting_after=' + startingAfter : '');
      const batch = await stripeGet('checkout/sessions?' + qs);
      for (const s of batch.data || []) {
        if (!s.client_reference_id || s.payment_status !== 'paid') continue;
        const code = s.client_reference_id;
        byCode[code] = byCode[code] || { signups: 0, revenue_usd: 0 };
        byCode[code].signups += 1;
        byCode[code].revenue_usd += (s.amount_total || 0) / 100;
      }
      if (!batch.has_more || !batch.data.length) break;
      startingAfter = batch.data[batch.data.length - 1].id;
    }
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      note: 'Paid checkout sessions from the last ~300, grouped by referral code.',
      affiliates: byCode,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};
