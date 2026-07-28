# Launch checklist

Work top to bottom. Everything below assumes the deploy guide in README.md
is done (repo on GitHub, Vercel project created).

## 1. Domain & pages
- [ ] Buy the domain, add it to the Vercel project
- [ ] Set `SITE` in `tools/build-pages.mjs` to the real domain, run
      `npm run build-pages`, commit (fixes canonicals + sitemap)
- [ ] After first deploy: submit `https://YOUR-DOMAIN/sitemap.xml` in
      Google Search Console (verify the domain there first)

## 2. Stripe (live mode)
- [ ] Create live product "PromoArb Pro": $19.99/mo + $99/yr prices
- [ ] Create both Payment Links; set after-payment redirect on BOTH to
      `https://YOUR-DOMAIN/?session_id={CHECKOUT_SESSION_ID}`
- [x] Replace `REPLACE_WITH_MONTHLY_LINK` / `REPLACE_WITH_ANNUAL_LINK` in
      `public/index.html` (done 2026-07-27)
- [ ] Vercel env vars: `STRIPE_SECRET_KEY` = sk_live_..., `TOKEN_SECRET` =
      long random string, `ADMIN_KEY` = different long random string
- [ ] Activate the Customer Portal: Stripe Dashboard -> Settings ->
      Billing -> Customer portal (powers "Manage subscription")
- [ ] Test end-to-end with a real card, then refund yourself:
      checkout -> "full board unlocked" -> restore on second browser
      (email + card last-4) -> Manage subscription -> cancel works
- [ ] `/api/health` shows LIVE mode

## 3. Email
- [ ] Resend account + audience; env vars `RESEND_API_KEY`,
      `RESEND_AUDIENCE_ID`; test the footer signup box
- [ ] Set up promoarbs@gmail.com (or a domain address) to actually be
      checked — restore/support/affiliate mail lands there

## 4. Data hygiene (your weekly job — this IS the product)
- [ ] Every offer verified within the last 7 days before launch day
      (run `npm run update-offers`, review, apply; or check by hand and
      bump `verified` dates)
- [ ] Add a CHANGELOG entry for launch week
- [ ] Re-run `npm run build-pages` whenever offers change

## 5. Analytics & monitoring
- [ ] Enable Web Analytics on the Vercel project (the script tag is
      already in index.html)
- [ ] Bookmark `/api/affiliates?key=ADMIN_KEY` for referral reporting

## 6. Legal sanity (30 minutes with a lawyer if possible)
- [ ] Read terms.html + privacy.html once yourself; they're solid
      templates but you're the one charging money
- [ ] NO sportsbook affiliate links without state licenses (plain links
      are fine); bank/brokerage/card affiliate programs are fine —
      FlexOffers/Impact/CJ
- [ ] The 21+/1-800-GAMBLER footer stays visible

## 7. Launch channels (first 100 subscribers)
- [ ] r/churning + r/sportsbetting adjacent subs: don't spam — post the
      free tools (planner, calculator, the audit-corrections changelog)
      where the rules allow; the free tier is the funnel
- [ ] Recruit 3–5 churning/betting creators as affiliates
      (`?ref=code`, 50% recurring) before public launch
- [ ] Product Hunt / HN "Show": the honest-data angle ("we publish our
      corrections") is the story, lead with it
- [ ] Set the email list expectation: one email per week, changes only

## Post-launch (first month)
- [ ] Watch /api/affiliates weekly, pay commissions monthly
- [ ] Move the tracker server-side (accounts) once ~50 paying subs —
      biggest retention lever
- [ ] Odds-API hedge finder when revenue supports ~$50/mo data cost
