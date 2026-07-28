#!/usr/bin/env node
/**
 * Programmatic SEO page generator.
 *
 *   node tools/build-pages.mjs
 *
 * Generates from the offer data in api/data.js:
 *   public/offers/<slug>.html   one landing page per offer (30+)
 *   public/offers/index.html    the hub page linking them all
 *   public/sitemap.xml
 *   public/robots.txt
 *
 * Free-tier offers show their full requirement; Pro-only offers show the
 * value + an honest teaser (the exact terms live on the Pro board).
 * Re-run whenever offers change (after the update-offers tool, ideally).
 *
 * BEFORE LAUNCH: set SITE to your real domain and re-run.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = require(join(root, 'api', 'data.js'));

const SITE = 'https://promoarb.com';
const FREE_IDS = new Set([1, 7, 8, 'c1', 'c2', 'c3', 'c4', 'c5']);
const MONTH = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const money = (n) => '$' + Math.round(n).toLocaleString();
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const RATES = { 'Bonus bets': 0.7, 'Bet tokens': 0.5, 'Loss protection': 0.5, 'Deposit match': 0.55, 'Profit boosts': 0.45, 'Bonus if win': 0.55 };

const offers = [
  ...data.PROMOS.map((p) => ({
    id: p.id, name: p.sportsbook, category: 'Sportsbook',
    value: Math.round(p.bonusValue * (RATES[p.type] ?? 0.6)),
    face: p.bonusValue, type: p.type, requirement: p.note || '',
    verified: p.verified, states: p.states, gambling: true,
  })),
  ...data.CASH_OFFERS.map((o) => ({
    id: o.id, name: o.name, category: o.category, value: o.value,
    requirement: o.requirement, verified: o.verified, states: o.states,
    endsOn: o.endsOn, gambling: false,
  })),
];

const css = `
  :root { --paper:#f4f6f4; --card:#fff; --ink:#0c1a18; --ink-soft:#47605c; --teal:#0f766e; --teal-deep:#0a3d38; --teal-wash:#e7f2f0; --line:#dbe3df; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'IBM Plex Sans',-apple-system,sans-serif; font-size:15px; color:var(--ink); background:var(--paper); line-height:1.6; }
  .wrap { max-width:680px; margin:0 auto; padding:2.5rem 1.5rem 4rem; }
  a { color:var(--teal); }
  h1 { font-family:'Space Grotesk',sans-serif; font-size:26px; letter-spacing:-0.02em; line-height:1.15; margin:0.5rem 0 1rem; }
  .crumb, .meta { font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-soft); }
  .crumb a { text-decoration:none; color:var(--teal); }
  .value-card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1.5rem; margin:1.5rem 0; }
  .value-big { font-family:'IBM Plex Mono',monospace; font-size:34px; font-weight:600; color:var(--teal); }
  p { color:var(--ink-soft); font-size:14.5px; margin-bottom:0.8rem; }
  .btn { display:inline-block; font-weight:600; font-size:14px; padding:11px 20px; border-radius:6px; text-decoration:none; margin:0.25rem 0.5rem 0.25rem 0; }
  .btn-solid { background:var(--teal); color:#fff; } .btn-ghost { border:1px solid var(--line); color:var(--ink); }
  .foot { font-size:11.5px; color:var(--ink-soft); margin-top:2.5rem; border-top:1px solid var(--line); padding-top:1rem; }
  ul.hub { list-style:none; display:grid; gap:8px; margin:1.5rem 0; }
  ul.hub a { font-weight:600; text-decoration:none; }
  ul.hub span { color:var(--ink-soft); font-size:13px; }
`;

const head = (title, desc, path) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article"><meta property="og:image" content="${SITE}/og.png">
<meta name="theme-color" content="#0f766e">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f766e'/%3E%3Ctext x='32' y='45' font-size='40' text-anchor='middle' fill='white' font-family='monospace'%3E%C2%B1%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/fonts.css">
<style>${css}</style>
</head><body><div class="wrap">`;

const foot = (gambling) => `
<div class="foot">
  PromoArb is an independent tracker, not affiliated with any institution listed. Offers change without
  notice — always confirm current terms on the issuer's site. Estimated values are realistic post-hedge
  or post-requirement figures, not marketing maximums. Bonuses may be taxable.
  ${gambling ? '<b>21+ only where legal. Gambling problem? Call 1-800-GAMBLER.</b>' : ''}
  Nothing here is financial advice. <a href="/terms.html">Terms</a> &middot; <a href="/privacy.html">Privacy</a>
</div></div></body></html>`;

mkdirSync(join(root, 'public', 'offers'), { recursive: true });
const pages = [];

for (const o of offers) {
  const slug = slugify(o.name) + (o.gambling ? '-sportsbook' : '') + '-bonus';
  const path = `/offers/${slug}.html`;
  const isFree = FREE_IDS.has(o.id);
  const title = `${o.name} ${o.gambling ? 'sportsbook ' : ''}signup bonus — ${money(o.value)} realistic value (${MONTH})`;
  const desc = `${o.name}'s current new-customer offer is worth about ${money(o.value)} in real terms${o.gambling ? ' after hedging' : ''}. Last verified ${o.verified || 'recently'}. See requirements, state availability, and the exact playbook.`;
  const states = o.states ? `${o.states.length} states` : 'Nationwide';

  const detail = isFree
    ? `<p><b>What it takes:</b> ${esc(o.requirement)}</p>
       <p>The step-by-step capture playbook — including ${o.gambling ? 'the exact hedge sizing' : 'fee traps and cooldown timing'} — is on the live board, free.</p>`
    : `<p>The exact current requirement, terms notes, and the step-by-step playbook for this offer live on the
       Pro board, alongside ${offers.length - 1} other tracked offers — each with a realistic value, a
       last-checked date, and public corrections when we get one wrong.</p>`;

  const body = `${head(title, desc, path)}
<div class="crumb"><a href="/">PromoArb</a> / <a href="/offers/">Offers</a> / ${esc(o.name)}</div>
<h1>${esc(o.name)} signup bonus <span style="color:var(--teal)">&mdash; ${money(o.value)} realistic value</span></h1>
<div class="meta">${esc(o.category)} &middot; ${states} &middot; verified ${esc(o.verified || 'recently')}${o.endsOn ? ' &middot; ends ' + esc(o.endsOn) : ''}</div>
<div class="value-card">
  <div class="meta" style="margin-bottom:6px">Realistic cash value${o.gambling ? ' after hedging' : ''}</div>
  <div class="value-big">${money(o.value)}</div>
  ${o.face && o.face !== o.value ? `<p style="margin:6px 0 0">Advertised as "up to ${money(o.face)}" — our estimate reflects what a careful ${o.gambling ? 'hedged execution' : 'signup'} actually nets.</p>` : ''}
</div>
${detail}
<p>
  <a class="btn btn-solid" href="/#board">See the live board</a>
  <a class="btn btn-ghost" href="/#pricing">Go Pro &mdash; $19.99/mo</a>
</p>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc,
    url: SITE + path, dateModified: o.verified || undefined,
  })}</script>
${foot(o.gambling)}`;

  writeFileSync(join(root, 'public', 'offers', `${slug}.html`), body);
  pages.push({ path, name: o.name, value: o.value, category: o.category });
}

// Hub page
const hub = `${head(`Every tracked signup bonus, ranked by realistic value (${MONTH})`,
  `All ${offers.length} sportsbook, bank, brokerage, and card signup bonuses PromoArb tracks — each with a realistic post-hedge value and a last-verified date.`, '/offers/')}
<div class="crumb"><a href="/">PromoArb</a> / Offers</div>
<h1>Every offer we track <span style="color:var(--teal)">(${MONTH})</span></h1>
<p>Ranked by realistic value — what careful execution actually nets, not the marketing number.</p>
<ul class="hub">
${pages.sort((a, b) => b.value - a.value).map((p) => `  <li><a href="${p.path}">${esc(p.name)}</a> <span>&mdash; ~${money(p.value)} &middot; ${esc(p.category)}</span></li>`).join('\n')}
</ul>
<p><a class="btn btn-solid" href="/#board">See the live board</a></p>
${foot(true)}`;
writeFileSync(join(root, 'public', 'offers', 'index.html'), hub);

// Sitemap + robots
const urls = ['/', '/offers/', ...pages.map((p) => p.path), '/terms.html', '/privacy.html'];
writeFileSync(join(root, 'public', 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>`).join('\n') +
  `\n</urlset>\n`);
writeFileSync(join(root, 'public', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Built ${pages.length} offer pages + hub + sitemap + robots.txt`);
console.log(SITE.includes('YOUR-DOMAIN') ? '⚠️  SITE is still the placeholder — set your domain in tools/build-pages.mjs and re-run before launch.' : `Site: ${SITE}`);
