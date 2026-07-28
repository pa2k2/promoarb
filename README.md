# PromoArb v2 — deploy guide

Zero-dependency build: the API calls Stripe directly, nothing to install,
nothing to break at build time. Structure:

```
api/health.js    <- visit /api/health to check server config (start here when debugging)
api/verify.js    <- turns a Stripe checkout into an access token (30-day expiry, rate limited)
api/data.js      <- the paid data: sportsbook PROMOS + brokerage/bank/card CASH_OFFERS (EDIT THIS when offers change)
api/restore.js   <- restore access by subscriber email + card last-4 (rate limited)
api/subscribe.js <- new-offer email alerts via Resend (optional, env-gated)
api/portal.js    <- Stripe Customer Portal session (self-serve cancel/manage)
api/affiliates.js<- owner-only referral report (?key=ADMIN_KEY)
public/index.html<- the site
public/terms.html, public/privacy.html <- legal pages (review before going live)
vercel.json      <- pins public/ as the static output
package.json
```

## Deploy

1. **GitHub**: create/empty your repo, upload these files so `api/` and
   `public/` sit at the TOP LEVEL of the repo (not inside a wrapper folder).
2. **Vercel**: Add New Project -> import the repo -> deploy with defaults.
3. **Env vars** (Vercel -> Settings -> Environment Variables), then REDEPLOY:
   - `STRIPE_SECRET_KEY` = sk_test_... (from Stripe -> Developers -> API keys)
   - `TOKEN_SECRET` = any long random string
   - Optional, for the email-alert signup box: `RESEND_API_KEY` and
     `RESEND_AUDIENCE_ID` (create a free resend.com account + audience).
     Without them the signup box shows a friendly "not set up yet" message.
4. **Sanity check**: visit `https://YOUR-SITE.vercel.app/api/health`
   You want: `{"ok":true,"stripe_key":"set (TEST mode)","token_secret":"set",...}`
   Anything says MISSING -> fix the env var, redeploy, check again.
5. **Stripe**: product "PromoArb Pro" with two prices ($19.99/mo, $99/yr),
   a Payment Link for each, and BOTH links' after-payment redirect set to:
   `https://YOUR-SITE.vercel.app/?session_id={CHECKOUT_SESSION_ID}`
   (type the curly braces literally).
6. **Wire links**: in `public/index.html` replace
   `REPLACE_WITH_MONTHLY_LINK` and `REPLACE_WITH_ANNUAL_LINK` with the two
   Payment Link URLs. Commit -> auto-redeploys.
7. **Test**: from the .vercel.app URL, subscribe with card 4242 4242 4242 4242.
   You should see "Verifying your payment..." then
   "Payment verified — full board unlocked." Any failure shows an orange
   banner saying exactly what went wrong.

## Going live
Swap to live mode: live Payment Links in the HTML, `sk_live_...` key in
Vercel, redeploy. /api/health will confirm "LIVE mode".

## Updating offers with live research (recommended)

`tools/update-offers.mjs` researches every tracked offer on the live web
(Claude API + web search) and proposes an update you review before it touches
anything:

1. Auth: `export ANTHROPIC_API_KEY=sk-ant-...` (or `ant auth login`).
   Get a key at console.anthropic.com. Each run costs roughly a few dollars.
2. `npm run update-offers` — researches, prints a field-by-field diff with
   sources, and saves `tools/offers-proposal.json`. Nothing is modified yet.
3. **Review the diff and spot-check the cited sources** — these numbers are
   what subscribers pay for.
4. `npm run apply-offers` — rewrites the marker-fenced blocks in
   `api/data.js` and `public/index.html` (full arrays, free tiers, changelog,
   hidden-count constants), keeping ids stable. Then commit and deploy.

The `/* <auto:...> */` markers in those files are what the tool rewrites —
don't delete them. Manual edits inside the blocks are fine; the next apply
will reformat them. To automate fully later: push the repo to GitHub and run
this on a weekly schedule (GitHub Action or a scheduled Claude agent) that
opens a PR with the proposal — keeping the human review step.

## Updating offers by hand
- Sportsbook promos: the PROMOS array in `api/data.js` (and the 3 free books
  in BASE_PROMOS in `public/index.html`).
- Brokerage/bank/card bonuses: the CASH_OFFERS array in `api/data.js` (and
  the 5 free ones in BASE_CASH in `public/index.html`). If you add or remove
  Pro-only cash offers, update HIDDEN_CASH in `public/index.html` to match.
- Cash-offer values are typical figures — re-verify each on the issuer's
  site before publishing.
- When you re-check an offer, bump its `verified` date — the site renders
  it as "checked Nd ago", which is your freshness signal to users.
- `states` arrays gate the state filter (omit = shown in every state);
  the OSB list at the top of both files approximates legal betting states.
- `effortHrs` drives the $/hr sort; `cooldownMonths` drives the
  "eligible again" dates for users who mark an offer done.
Commit, done.

## Subscriptions: self-serve cancel
Pro users get a "Manage subscription" link in the footer that opens Stripe's
Customer Portal (update card, view invoices, cancel). One-time setup:
Stripe Dashboard -> Settings -> Billing -> Customer portal -> Activate.

## Affiliate / referral program
- Give a creator a code (e.g. `janedoe`) and the link `https://YOUR-SITE/?ref=janedoe`.
- The code persists in the visitor's browser for 90 days and rides into
  Stripe Checkout as `client_reference_id`.
- Report: visit `/api/affiliates?key=ADMIN_KEY` (set `ADMIN_KEY` env var in
  Vercel — a long random string) to see signups + revenue per code. Pay
  commissions manually (we pitch 50% recurring — above the 30% niche
  standard, to make recruiting creators easier pre-launch).
- Promoters must disclose the relationship (FTC). When volume justifies it,
  move to Rewardful/Tolt for automated tracking and payouts.
- Outbound offer links live in OFFER_URLS in `public/index.html` — swap them
  for your own affiliate deep links (FlexOffers/Impact/CJ) as you join
  programs. Do NOT use sportsbook affiliate links without state licenses.

## Tests
`npm test` — 24 zero-dependency tests (node --test) covering token
signing/expiry, restore auth + rate limiting, the portal, affiliate
tallies, and offer-data integrity (including free-tier/Pro drift and
teaser-count consistency). Run before every deploy; Stripe is mocked,
no network needed. Local dev server: `node tools/dev-server.js`
(serves public/ on :4173 with mocked APIs).

## Security notes
- Tokens expire after 30 days; `/api/data` also re-checks the Stripe
  subscription on every request, so cancelled subs lose access immediately.
- Restore requires email + card last-4 (verified against Stripe payment
  methods) and returns the same generic error for every failure, so it
  can't be used to enumerate subscribers.
- `/api/verify` and `/api/restore` have per-IP rate limits. They're
  per-serverless-instance (reset on cold start) — good enough to blunt
  abuse; move to Upstash/Redis if traffic grows.

## Debug order when anything misbehaves
1. `/api/health` — env vars set? right key mode?
2. `/api/data` in a browser — should say {"error":"Sign in required"}
3. Run a checkout and read the on-page banner — it reports the exact
   server error, including test/live key mismatches.
