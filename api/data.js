// The paid dataset. Served only to callers with a valid token AND an
// active Stripe subscription (checked live on every request).
// >>> THIS is the file you edit when promo offers change. <<<
const crypto = require('crypto');

const PROMOS = [
  { id: 1,  sportsbook: 'BetMGM',     bonusValue: 1500, minBet: 10, type: 'Loss protection', expiresDays: 7,  note: 'First bet up to $1,500 back in bonus bets if it loses' },
  { id: 2,  sportsbook: 'Borgata',    bonusValue: 1500, minBet: 10, type: 'Loss protection', expiresDays: 7,  note: 'Same structure as BetMGM (sister book) — separate signup' },
  { id: 3,  sportsbook: 'bet365',     bonusValue: 1000, minBet: 10, type: 'Loss protection', expiresDays: 7,  note: 'First bet safety net (or take the $150 guaranteed instead)' },
  { id: 4,  sportsbook: 'FanDuel',    bonusValue: 1000, minBet: 25, type: 'Bet tokens',      expiresDays: 14, note: 'Bet $5/day for 5 days → five $200 reset tokens (refund if lose)' },
  { id: 5,  sportsbook: 'Fanatics',   bonusValue: 1000, minBet: 100,type: 'Deposit match',   expiresDays: 10, note: 'Wager up to $100/day for 10 days, matched in FanCash' },
  { id: 6,  sportsbook: 'BetRivers',  bonusValue: 500,  minBet: 10, type: 'Loss protection', expiresDays: 30, note: 'Up to $500 back if first bet loses; 30-day credit window' },
  { id: 7,  sportsbook: 'Caesars',    bonusValue: 250,  minBet: 1,  type: 'Profit boosts',   expiresDays: 14, note: 'Bet $1 → ten 100% boosts, $25 max stake each (~$250 max upside)' },
  { id: 8,  sportsbook: 'DraftKings', bonusValue: 200,  minBet: 5,  type: 'Bonus bets',      expiresDays: 7,  note: 'Bet $5, get $200 instantly in eight $25 bonus bets' },
  { id: 9,  sportsbook: 'Hard Rock',  bonusValue: 150,  minBet: 5,  type: 'Bonus if win',    expiresDays: 7,  note: 'Bet $5, get $150 only if the bet wins — pick a heavy favorite' },
  { id: 10, sportsbook: 'Bally Bet',  bonusValue: 250,  minBet: 10, type: 'Loss protection', expiresDays: 7,  note: 'Second-chance first bet' },
];

function verifyToken(token) {
  try {
    const [body, sig] = (token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch (e) { return null; }
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

  const token = ((req.headers && req.headers.authorization) || '').replace('Bearer ', '');
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Sign in required' });

  try {
    const subs = await stripeGet('subscriptions?customer=' + encodeURIComponent(payload.c) + '&status=active&limit=1');
    if (!subs.data || !subs.data.length) return res.status(402).json({ error: 'Subscription inactive' });
    return res.status(200).json({ promos: PROMOS });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};
