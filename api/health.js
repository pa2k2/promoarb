// Visit /api/health in a browser to see whether the server is configured.
// Safe to expose: reports only whether secrets exist, never their values.
module.exports = (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY || '';
  res.status(200).json({
    ok: Boolean(key && process.env.TOKEN_SECRET),
    stripe_key: key ? (key.startsWith('sk_test_') ? 'set (TEST mode)' : key.startsWith('sk_live_') ? 'set (LIVE mode)' : 'set (unrecognized format — should start with sk_test_ or sk_live_)') : 'MISSING',
    token_secret: process.env.TOKEN_SECRET ? 'set' : 'MISSING',
    node: process.version,
  });
};
