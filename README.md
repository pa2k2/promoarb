# PromoArb — Vercel + Stripe backend

The paid promo data lives in `api/data.js` on the server. Free visitors get
3 books baked into the page; subscribers get the full board after a live
Stripe subscription check. Nothing to bypass in dev tools — the data simply
isn't in the browser until Stripe says the caller has paid.

## How the flow works

1. Visitor clicks **Subscribe** → your Stripe Payment Link ($19.99/mo monthly + $99/yr annual — make BOTH as separate Payment Links).
2. Stripe redirects back to `https://YOUR-SITE.vercel.app/?session_id={CHECKOUT_SESSION_ID}`.
3. The page calls `/api/verify`, which confirms the session with Stripe and
   returns a signed token (stored in localStorage).
4. Every page load with a token calls `/api/data`, which re-checks the
   subscription is still **active** before returning the full dataset —
   so cancellations lose access at next load, automatically.
5. New device? "Restore access" looks up the subscriber's email via
   `/api/restore` and re-issues a token.

## Deploy (15 minutes)

### 1. Stripe (dashboard.stripe.com)
- **Products → Add product**: "PromoArb Pro": add two prices — $19.99/month recurring AND $99/year recurring. Create a Payment Link for each.
- **Payment Links → New**: select the product.
- In the Payment Link settings → **After payment → redirect customers to
  your website** and set the URL to:
  `https://YOUR-SITE.vercel.app/?session_id={CHECKOUT_SESSION_ID}`
  (the `{CHECKOUT_SESSION_ID}` placeholder is literal — Stripe fills it in).
- Copy the payment link URL.
- **Developers → API keys**: copy the **Secret key** (starts `sk_live_` /
  `sk_test_`). Use test mode first — test card 4242 4242 4242 4242.

### 2. This project
- In `public/index.html`, replace `REPLACE_WITH_MONTHLY_LINK` and `REPLACE_WITH_ANNUAL_LINK`
  with the two Payment Link URLs (the `STRIPE_LINK_MONTHLY` / `STRIPE_LINK_ANNUAL` constants).

### 3. Vercel (vercel.com — free tier is fine)
- Push this folder to a GitHub repo, then **Vercel → Add New Project →
  Import** that repo. Defaults are fine (it auto-detects the `api/` folder
  and serves `public/` as the site).
- Or from a terminal: `npm i -g vercel && vercel` in this folder.
- **Project → Settings → Environment Variables**, add:
  - `STRIPE_SECRET_KEY` = your Stripe secret key
  - `TOKEN_SECRET` = any long random string (e.g. run
    `openssl rand -hex 32`); changing it later logs everyone out
- Redeploy after adding env vars.

### 4. Point Stripe back at the real URL
Once you know your Vercel URL (or custom domain), update the Payment Link's
redirect URL to match it exactly.

### 5. Retire GitHub Pages
This project replaces the GitHub Pages deployment — Pages can't run the API.
Vercel serves both the site and the functions from one URL. If you have a
custom domain, add it in Vercel → Settings → Domains.

## Updating promo data
Edit the `PROMOS` array in `api/data.js` and the 3-book free-tier list in
`public/index.html`, commit, push — Vercel redeploys automatically.

## Known limitations (fine for v1, fix when it matters)
- **Email restore** (`api/restore.js`): anyone who knows a subscriber's
  email could restore access with it. Upgrade path: email a magic link
  instead of returning the token directly (needs an email provider like
  Resend — ~20 lines).
- Tokens don't expire; access is enforced by the live subscription check
  on `/api/data`, which is the check that matters.
- The free-tier books are duplicated in two places (page + API). Keep them
  in sync when offers change.
