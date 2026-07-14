# PromoArb v2 — deploy guide

Zero-dependency build: the API calls Stripe directly, nothing to install,
nothing to break at build time. Structure:

```
api/health.js    <- visit /api/health to check server config (start here when debugging)
api/verify.js    <- turns a Stripe checkout into an access token
api/data.js      <- the paid promo data (EDIT THIS when offers change)
api/restore.js   <- restore access by subscriber email
public/index.html<- the site
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

## Updating promos later
Edit the PROMOS array in `api/data.js` (and the 3 free books at the top of
the script in `public/index.html`), commit, done.

## Debug order when anything misbehaves
1. `/api/health` — env vars set? right key mode?
2. `/api/data` in a browser — should say {"error":"Sign in required"}
3. Run a checkout and read the on-page banner — it reports the exact
   server error, including test/live key mismatches.
