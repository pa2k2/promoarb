// Returns the full promo dataset — but only after verifying the caller's
// token AND confirming their Stripe subscription is still active.
// This is the file you edit when offers change.
import Stripe from 'stripe';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ============ THE PAID DATA ============
   This never ships to the browser for free users. */
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

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Sign in required' });

  const subs = await stripe.subscriptions.list({ customer: payload.c, status: 'active', limit: 1 });
  if (!subs.data.length) return res.status(402).json({ error: 'Subscription inactive' });

  return res.status(200).json({ promos: PROMOS });
}
