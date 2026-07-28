// Collects emails for new-offer alerts. Zero dependencies — stores contacts
// in a Resend audience (https://resend.com, free tier is plenty to start).
// Setup: create a Resend account + audience, then add env vars in Vercel:
//   RESEND_API_KEY     = re_...
//   RESEND_AUDIENCE_ID = the audience UUID
// Until those are set, this endpoint returns a friendly "not configured" error.

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

function readBody(req) {
  if (req.body !== undefined) {
    return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}));
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 10_000) reject(new Error('Body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (rateLimited(req, 5, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts — wait a few minutes and try again.' });
  }

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_AUDIENCE_ID) {
    return res.status(503).json({ error: 'Email alerts are not set up yet — email promoarbs@gmail.com and we will add you by hand.' });
  }

  let email = '';
  try { email = String((await readBody(req)).email || '').trim().toLowerCase(); } catch (e) {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  try {
    const r = await fetch(`https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      // Resend returns 409 for duplicates — that's a success from the user's view
      if (r.status === 409) return res.status(200).json({ ok: true });
      return res.status(502).json({ error: (body.message) || 'Signup failed — try again later.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Signup failed — try again later.' });
  }
};
