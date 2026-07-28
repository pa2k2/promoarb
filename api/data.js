// The paid dataset. Served only to callers with a valid, unexpired token
// AND an active Stripe subscription (checked live on every request).
// >>> THIS is the file you edit when offers change. <<<
// PROMOS = sportsbook signup offers (feeds the combo board)
// CASH_OFFERS = brokerage / bank / credit card / fintech signup bonuses
const crypto = require('crypto');

/* States with legal online sports betting (approximate — coverage differs
   slightly per operator; re-verify when a state flips). */
const OSB = ['AZ','CO','CT','DC','IA','IL','IN','KS','KY','LA','MA','MD','ME','MI','NC','NH','NJ','NY','OH','OR','PA','RI','TN','VA','VT','WV','WY'];

/* <auto:promos> — managed by tools/update-offers.mjs; edit by hand or via the tool */
const PROMOS = [
  { id: 1,  sportsbook: 'BetMGM',     bonusValue: 1500, minBet: 10, type: 'Loss protection', expiresDays: 7,  states: OSB, verified: '2026-07-12', note: 'First bet up to $1,500 back in bonus bets if it loses' },
  { id: 2,  sportsbook: 'Borgata',    bonusValue: 1500, minBet: 10, type: 'Loss protection', expiresDays: 7,  states: ['NJ','PA'], verified: '2026-07-12', note: 'Same structure as BetMGM (sister book) — separate signup' },
  { id: 3,  sportsbook: 'bet365',     bonusValue: 150,  minBet: 10, type: 'Bonus bets',      expiresDays: 7,  states: OSB, verified: '2026-07-14', added: '2026-07-14', note: 'Bet $10 → $150 in bonus bets, win or lose (headline offer switched from the safety net)' },
  { id: 4,  sportsbook: 'FanDuel',    bonusValue: 1000, minBet: 25, type: 'Bet tokens',      expiresDays: 14, states: OSB, verified: '2026-07-13', note: 'Bet $5/day for 5 days → five $200 reset tokens (refund if lose)' },
  { id: 5,  sportsbook: 'Fanatics',   bonusValue: 1000, minBet: 100,type: 'Deposit match',   expiresDays: 10, states: OSB, verified: '2026-07-13', note: 'Wager up to $100/day for 10 days, matched in FanCash' },
  { id: 6,  sportsbook: 'BetRivers',  bonusValue: 500,  minBet: 10, type: 'Loss protection', expiresDays: 30, states: OSB, verified: '2026-07-12', note: 'Up to $500 back if first bet loses; 30-day credit window' },
  { id: 7,  sportsbook: 'Caesars',    bonusValue: 250,  minBet: 1,  type: 'Profit boosts',   expiresDays: 14, states: OSB, verified: '2026-07-12', note: 'Bet $1 → ten 100% boosts, $25 max stake each (~$250 max upside)' },
  { id: 8,  sportsbook: 'DraftKings', bonusValue: 200,  minBet: 5,  type: 'Bonus bets',      expiresDays: 7,  states: OSB, verified: '2026-07-12', note: 'Bet $5, get $200 instantly in eight $25 bonus bets' },
  { id: 9,  sportsbook: 'Hard Rock',  bonusValue: 150,  minBet: 5,  type: 'Bonus if win',    expiresDays: 7,  states: ['AZ','FL','NJ','TN','VA'], verified: '2026-07-13', note: 'Bet $5, get $150 only if the bet wins — pick a heavy favorite' },
  { id: 10, sportsbook: 'Bally Bet',  bonusValue: 250,  minBet: 10, type: 'Loss protection', expiresDays: 7,  states: ['AZ','CO','IN','IA','OH','VA'], verified: '2026-07-13', note: 'Second-chance first bet' },
];
/* </auto:promos> */

// Typical/recent figures — offers rotate constantly, so re-verify each one
// on the issuer's site before publishing an update.
// category: 'Brokerage' | 'Bank' | 'Credit card' | 'Fintech'
// value = estimated cash value, capital = deposit/transfer/spend required,
// effortHrs = active work to capture, cooldownMonths = typical wait before
// the bonus can be earned again (omit for one-time offers),
// states = eligibility whitelist (omit = nationwide), verified = last check.
/* <auto:cash> — managed by tools/update-offers.mjs; edit by hand or via the tool */
const CASH_OFFERS = [
  /* Banks */
  { id: 'c1',  name: 'SoFi',            category: 'Bank',      value: 300,  capital: 5000,   effortHrs: 0.5,  verified: '2026-07-14', endsOn: '2026-12-31', requirement: 'Checking + savings; $5,000+ in direct deposits within 25 days pays the full $300 ($50 at $1k)', payout: '~2 weeks',           note: 'Stack a Rakuten signup on top for ~$675 total' },
  { id: 'c2',  name: 'Chase Checking',  category: 'Bank',      value: 400,  capital: 1000,   effortHrs: 0.75, verified: '2026-07-14', endsOn: '2026-07-15', cooldownMonths: 24, requirement: 'Total Checking: $1,000 direct deposit within 90 days; pair the savings bonus for $900 combined', payout: '~15 days',   note: 'Raised to $400 — the $900 savings combo ends Jul 15' },
  { id: 'c6',  name: 'Citi',            category: 'Bank',      value: 475,  capital: 1500,   effortHrs: 1,    verified: '2026-07-14', cooldownMonths: 24, requirement: '$1,500+ in direct deposits; $325 base, $475 in select markets',                                  payout: '~30 days',   note: 'Requirement dropped from balance-tiers to a simple DD' },
  { id: 'c7',  name: 'Capital One 360', category: 'Bank',      value: 250,  capital: 0,      effortHrs: 0.5,  verified: '2026-07-14', cooldownMonths: 48, requirement: 'Open with promo code + two direct deposits of $500+ within 75 days',                             payout: '~60 days',           note: 'No minimum balance, no fee' },
  { id: 'c8',  name: 'US Bank',         category: 'Bank',      value: 450,  capital: 8000,   effortHrs: 0.75, verified: '2026-07-13', cooldownMonths: 12, states: ['AZ','AR','CA','CO','ID','IL','IN','IA','KS','KY','MN','MO','MT','NE','NV','NM','NC','ND','OH','OR','SD','TN','UT','WA','WI','WY'], requirement: 'Smartly Checking; $2k–$8k in direct deposits within 90 days (tiered $250/$450)', payout: '~30 days', note: 'Branch-footprint states only' },
  { id: 'c17', name: 'Wells Fargo',     category: 'Bank',      value: 425,  capital: 1000,   effortHrs: 0.75, verified: '2026-07-14', added: '2026-07-14', cooldownMonths: 12, requirement: 'New checking + $1,000 in direct deposits within 90 days',                    payout: '~30 days',   note: '' },
  { id: 'c18', name: 'BMO',             category: 'Bank',      value: 400,  capital: 7500,   effortHrs: 0.75, verified: '2026-07-14', added: '2026-07-14', cooldownMonths: 12, requirement: 'Direct deposits totaling $4,000–$7,500 within 90 days',                      payout: '~30 days',   note: '' },
  { id: 'c19', name: 'BofA',            category: 'Bank',      value: 500,  capital: 10000,  effortHrs: 0.75, verified: '2026-07-14', added: '2026-07-14', cooldownMonths: 12, requirement: 'Tiered: $100 at $2k in DDs, $300 at $5k, $500 at $10k+ within 90 days',       payout: '~30 days',   note: '' },
  { id: 'c20', name: 'PNC',             category: 'Bank',      value: 400,  capital: 5000,   effortHrs: 0.75, verified: '2026-07-14', added: '2026-07-14', cooldownMonths: 12, requirement: '$200 base / $400 with $5,000 in direct deposits; higher tier in select regions', payout: '~30 days', note: 'Regional — confirm your ZIP qualifies' },
  /* Brokerages */
  { id: 'c3',  name: 'Webull',          category: 'Brokerage', value: 50,   capital: 500,    effortHrs: 0.25, verified: '2026-07-14', requirement: '75 mystery fractional shares + 30-day APY boost on idle cash; share values skew to the minimum', payout: '~1 week',           note: 'Lottery — realistic haul is usually $20–$75' },
  { id: 'c4',  name: 'Moomoo',          category: 'Brokerage', value: 300,  capital: 10000,  effortHrs: 0.5,  verified: '2026-07-14', endsOn: '2026-08-31', requirement: 'NVDA-stock tiers: $20 @ $100 · $50 @ $2k · $300 @ $10k (held 60 days) · $1,000 @ $100k (held 180 days)', payout: 'After hold periods', note: 'Holding requirements unlock the later chunks' },
  { id: 'c9',  name: 'Schwab',          category: 'Brokerage', value: 1000, capital: 500000, effortHrs: 1,    verified: '2026-07-14', requirement: 'Referred-friend offer, tiered: $100 at $25k up to $1,000 at $500k, funded within 45 days',       payout: '~1 month',           note: 'Needs a referral link; scale the deposit to the tier you want' },
  { id: 'c10', name: 'Merrill Edge',    category: 'Brokerage', value: 600,  capital: 200000, effortHrs: 1,    verified: '2026-07-14', requirement: 'Tiered: $100 at $20k up to $600 at $200k–$300k, held 90 days',                                   payout: '~2 wks after hold',  note: 'Stacks with BofA Preferred Rewards status' },
  { id: 'c11', name: 'Robinhood',       category: 'Brokerage', value: 10,   capital: 10,     effortHrs: 0.25, verified: '2026-07-14', requirement: 'Deposit $10 → one free stock valued $5–$200 (99% land at ~$5); 1% IRA match, 3% with Gold',      payout: '~1 week',            note: 'Watch for rotating 1–3% transfer-match windows — those change the math entirely' },
  { id: 'c13', name: 'tastytrade',      category: 'Brokerage', value: 100,  capital: 2000,   effortHrs: 0.5,  verified: '2026-07-14', requirement: 'Code MYNEWBONUS: deposit $2,000 within 60 days; hold ≥6 months (clawback inside a year)',        payout: 'After 6-mo hold',    note: 'The old $50–$5,000 tiered promo ended Jan 2026' },
  { id: 'c21', name: 'TradeStation',    category: 'Brokerage', value: 1000, capital: 250000, effortHrs: 1,    verified: '2026-07-14', added: '2026-07-14', requirement: 'Tiered: $150 @ $5k → $300 @ $25k → $500 @ $100k → $1,000 @ $250k → $3,500 @ $1M; fund in 45 days, hold 270 days', payout: 'After 270-day hold', note: 'Nine-month asset lockup — the real cost of this one' },
  /* Credit cards — hard credit pull; factor annual fees and 5/24-style rules */
  { id: 'c14', name: 'Chase Sapphire',        category: 'Credit card', value: 1250, capital: 5000, effortHrs: 0.5, verified: '2026-07-14', cooldownMonths: 48, requirement: '100,000 points after $5k spend in 3 months — $1,250 floor via portal, up to ~$2,000 via transfers; $95 AF', payout: 'Next statement', note: 'Subject to Chase 5/24 rule' },
  { id: 'c15', name: 'Amex Gold',             category: 'Credit card', value: 1000, capital: 8000, effortHrs: 0.5, verified: '2026-07-14', requirement: 'Up to 100k MR after $8k spend in 6 months — offers vary by targeting, check before applying; $325 AF', payout: '~8–12 weeks',  note: 'Amex bonuses are once per lifetime per card' },
  { id: 'c16', name: 'Capital One Venture',   category: 'Credit card', value: 750,  capital: 4000, effortHrs: 0.5, verified: '2026-07-14', requirement: '75k miles after $4k spend in 3 months; miles worth 1¢+ each; $95 AF',                              payout: 'Next statement', note: '' },
  /* Fintech */
  { id: 'c5',  name: 'Chime',           category: 'Fintech',   value: 425,  capital: 0,      effortHrs: 0.5,  verified: '2026-07-14', requirement: 'Open via a cashback portal (Swagbucks/MyPoints) + $200 direct deposit — the portal pays the bulk', payout: '~2 weeks',  note: 'Portal stack — direct signup pays far less' },
];
/* </auto:cash> */

/* Playbooks served to subscribers (the two free ones live in index.html). */
const GUIDES = [
  {
    id: 'g3', title: 'Credit card sequencing & the 5/24 map', minutes: 6,
    body: `<p><b>The rule that shapes everything:</b> Chase auto-denies most applications if you've opened 5+ personal cards across all issuers in 24 months ("5/24"). Amex, Capital One, and Citi have softer rules. That means order matters more than raw bonus size.</p>
<ol>
<li><b>Start under 5/24 with Chase.</b> Sapphire Preferred's 100k is the anchor — take it first while you still qualify.</li>
<li><b>Amex next, but check targeting first.</b> Amex bonuses are once per lifetime per card — never take a 60k offer when 90–100k targeted offers exist. Use incognito + the "check my offer" flow before applying.</li>
<li><b>Capital One anytime</b> — their model scores holistically; Venture's 75k is a steady filler between Chase slots.</li>
<li><b>Space applications ~3 months apart</b> to keep approval odds high and let inquiries age.</li>
<li><b>Never carry a balance.</b> One month of interest can eat a month of bonus value — this whole game assumes you pay in full.</li>
</ol>
<p>Hard pulls cost ~5–10 FICO points each and recover in months; the payoff per application above is $750–$1,250.</p>`
  },
  {
    id: 'g4', title: 'The optimal signup order by state', minutes: 5,
    body: `<p>Your state decides your menu. The sequencing principle is the same everywhere: <b>capital-light guaranteed offers first, protection offers when you have hedge bankroll, big-capital brokerage tiers last.</b></p>
<ol>
<li><b>Everyone, everywhere:</b> bank bonuses (Chase/SoFi/Wells) and fintech portals need no state luck and no bankroll beyond the DD cycle. Do these while anything else is pending.</li>
<li><b>Legal-betting states:</b> run DraftKings + bet365 (guaranteed, ~$15 total stake) first for instant bankroll, then use that bankroll to hedge BetMGM/Borgata's $1,500 protection offers. NJ/PA residents: Borgata is a separate signup from BetMGM — same structure, double dip.</li>
<li><b>Big-capital moves:</b> Schwab/Merrill/TradeStation tiers want $200k+ moved — do these once, when you can park the money for the full hold period, and time them with a card's spend requirement (the deposit doesn't help, but the calendar discipline does).</li>
<li><b>Track cooldowns.</b> Bank bonuses repeat every 12–24 months — the board's tracker shows your "eligible again" dates; a mature rotation is worth $1,500–$2,500/yr in repeatables alone.</li>
</ol>`
  },
  {
    id: 'g5', title: 'Deposit-match grinding: the Fanatics loop', minutes: 4,
    body: `<p>Deposit matches (Fanatics' $100/day × 10 days is the big one) pay in site credit matched to your wagers — the trick is cycling the same bankroll through low-vig markets so the match is earned with minimal bleed.</p>
<ol>
<li><b>Wager the daily max on lowest-vig markets</b> — spreads/totals at -105 to -110, never parlays or props. Expected loss per $100 cycled ≈ $2–3.</li>
<li><b>Hedge across books when lines allow</b> — if you're cycling $100/day anyway, put it on one side of a game you're hedging elsewhere (a combo leg, a boost, another book's qualifying wager). The wager does double duty.</li>
<li><b>Convert FanCash promptly</b> — it decays in value if it nudges you into bets you wouldn't otherwise make. Treat it like bonus bets: hedge it out at ~70%.</li>
<li><b>Math check:</b> $1,000 cycled at ~2.5% vig costs ~$25 to earn ~$550 of convertible match value — one of the best $/hr plays on the board, but only if you stay disciplined on market selection.</li>
</ol>`
  },
];

function verifyToken(token) {
  try {
    const [body, sig] = (token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || Date.now() > payload.exp) return null; // expired (or legacy no-expiry) token
    return payload;
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
    return res.status(200).json({ promos: PROMOS, cash: CASH_OFFERS, guides: GUIDES });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};

// Exposed for local dev tooling (the endpoint above still guards all access).
module.exports.PROMOS = PROMOS;
module.exports.CASH_OFFERS = CASH_OFFERS;
module.exports.GUIDES = GUIDES;
