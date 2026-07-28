#!/usr/bin/env node
/**
 * Live-promo updater for PromoArb.
 *
 * Researches every tracked offer on the live web (Claude + web search),
 * proposes an updated dataset as a reviewable diff, and — only on --apply —
 * rewrites the marker-fenced data blocks in api/data.js and public/index.html
 * (full arrays, free tiers, changelog, HIDDEN_* counts).
 *
 * Usage:
 *   node tools/update-offers.mjs              # research → print diff → save tools/offers-proposal.json
 *   node tools/update-offers.mjs --apply      # apply the saved (reviewed!) proposal to the site files
 *   node tools/update-offers.mjs --apply my.json   # apply a specific proposal file
 *
 * Auth: ANTHROPIC_API_KEY env var, or an `ant auth login` profile.
 * Always review the diff (and spot-check the cited sources) before --apply —
 * this writes the numbers your subscribers pay for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_JS = path.join(ROOT, 'api', 'data.js');
const INDEX_HTML = path.join(ROOT, 'public', 'index.html');
const PROPOSAL = path.join(ROOT, 'tools', 'offers-proposal.json');

// Which offers appear on the free tier (regenerated from the full arrays on apply)
const FREE_PROMO_IDS = [1, 7, 8];
const FREE_CASH_IDS = ['c1', 'c2', 'c3', 'c4', 'c5'];

const PROMO_TYPES = ['Bonus bets', 'Bet tokens', 'Loss protection', 'Deposit match', 'Profit boosts', 'Bonus if win'];
const CASH_CATEGORIES = ['Brokerage', 'Bank', 'Credit card', 'Fintech'];

const today = new Date().toISOString().slice(0, 10);

/* ---------------- current data ---------------- */
function loadCurrent() {
  delete require.cache[require.resolve(DATA_JS)];
  const mod = require(DATA_JS);
  if (!Array.isArray(mod.PROMOS) || !Array.isArray(mod.CASH_OFFERS)) {
    throw new Error('api/data.js does not export PROMOS and CASH_OFFERS');
  }
  return { promos: mod.PROMOS, cash: mod.CASH_OFFERS };
}

/* ---------------- research via Claude + web search ---------------- */
async function research(current) {
  const client = new Anthropic(); // resolves ANTHROPIC_API_KEY or `ant auth login` profile

  const system = `You are the data maintainer for PromoArb, a tracker of US signup bonuses
(sportsbooks, brokerages, banks, credit cards, fintech). Your job: verify every tracked
offer against the live web today (${today}) and propose an updated dataset.

Rules — follow all of them:
- Research with web search. Prefer issuer landing pages; aggregators (Doctor of Credit,
  Legal Sports Report, The Points Guy, Bankrate) are acceptable corroboration.
- Keep every existing offer id stable. Never renumber or reuse ids.
- Only change a field when research supports the change. If you cannot verify an offer,
  keep it unchanged but do NOT bump its "verified" date.
- Set "verified": "${today}" on every offer you did confirm.
- Add "added": "${today}" to any NEW offer you introduce; new promo ids continue the
  integer sequence, new cash ids continue the cN sequence.
- Mark dead offers by adding "removed": true rather than deleting them.
- Values are conservative realistic cash values, not marketing maximums.
- effortHrs = active hours to capture; cooldownMonths only where re-earnable;
  states array only when genuinely geo-restricted (omit = nationwide);
  endsOn (YYYY-MM-DD) only when a real deadline is published.
- Promo "type" must be one of: ${PROMO_TYPES.join(', ')}.
- Cash "category" must be one of: ${CASH_CATEGORIES.join(', ')}.
- Changelog entries are short, concrete, user-facing (may contain <b> tags).

Return ONLY a JSON object (in a \`\`\`json fence) with this exact shape:
{
  "promos": [ ...full updated array, same field names as input... ],
  "cash": [ ...full updated array... ],
  "changelog": [ { "date": "${today}", "text": "..." } ],
  "changes": [ { "id": "...", "field": "...", "old": ..., "new": ..., "source": "https://..." } ],
  "unverified": [ "ids you could not confirm" ]
}`;

  const userMsg = `Current dataset:\n\nPROMOS = ${JSON.stringify(current.promos, null, 2)}\n\nCASH_OFFERS = ${JSON.stringify(current.cash, null, 2)}\n\nVerify each offer, hunt for up to 3 notable new offers worth adding, and return the JSON.`;

  const messages = [{ role: 'user', content: userMsg }];
  let final;
  for (let i = 0; i < 6; i++) {
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      system,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 20 }],
      messages,
    });
    stream.on('text', (t) => process.stderr.write(t));
    final = await stream.finalMessage();
    if (final.stop_reason === 'pause_turn') {
      // server-side tool loop paused — append the turn and resume
      messages.push({ role: 'assistant', content: final.content });
      continue;
    }
    break;
  }
  if (final.stop_reason === 'refusal') throw new Error('Model refused the request');
  if (final.stop_reason === 'max_tokens') throw new Error('Response truncated (max_tokens) — retry');

  const text = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return extractJson(text);
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

/* ---------------- validation ---------------- */
function validate(p) {
  const fail = (m) => { throw new Error('Proposal rejected: ' + m); };
  if (!Array.isArray(p.promos) || !Array.isArray(p.cash)) fail('missing promos/cash arrays');
  const ids = new Set();
  for (const o of p.promos) {
    if (typeof o.id !== 'number' || !o.sportsbook) fail(`bad promo: ${JSON.stringify(o).slice(0, 80)}`);
    if (typeof o.bonusValue !== 'number' || typeof o.minBet !== 'number') fail(`non-numeric values on promo ${o.id}`);
    if (!PROMO_TYPES.includes(o.type)) fail(`unknown promo type "${o.type}" on ${o.id}`);
    if (ids.has(o.id)) fail(`duplicate id ${o.id}`);
    ids.add(o.id);
  }
  for (const o of p.cash) {
    if (typeof o.id !== 'string' || !o.name) fail(`bad cash offer: ${JSON.stringify(o).slice(0, 80)}`);
    if (typeof o.value !== 'number') fail(`non-numeric value on ${o.id}`);
    if (!CASH_CATEGORIES.includes(o.category)) fail(`unknown category "${o.category}" on ${o.id}`);
    if (ids.has(o.id)) fail(`duplicate id ${o.id}`);
    ids.add(o.id);
  }
  for (const id of FREE_PROMO_IDS) if (!p.promos.some((o) => o.id === id)) fail(`free-tier promo ${id} missing`);
  for (const id of FREE_CASH_IDS) if (!p.cash.some((o) => o.id === id)) fail(`free-tier offer ${id} missing`);
  if (p.changelog && !Array.isArray(p.changelog)) fail('changelog must be an array');
}

/* ---------------- diff ---------------- */
function printDiff(current, proposal) {
  const byId = (arr) => Object.fromEntries(arr.map((o) => [o.id, o]));
  let changes = 0;
  for (const [label, oldArr, newArr] of [['PROMO', current.promos, proposal.promos], ['CASH', current.cash, proposal.cash]]) {
    const oldMap = byId(oldArr), newMap = byId(newArr);
    for (const id of new Set([...Object.keys(oldMap), ...Object.keys(newMap)])) {
      const o = oldMap[id], n = newMap[id];
      const name = (n || o).sportsbook || (n || o).name;
      if (!o) { console.log(`  + ${label} ${id} ${name} — ADDED ($${n.value ?? n.bonusValue})`); changes++; continue; }
      if (!n) { console.log(`  - ${label} ${id} ${name} — MISSING FROM PROPOSAL`); changes++; continue; }
      for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
        if (k === 'verified') continue;
        if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) {
          console.log(`  ~ ${label} ${id} ${name}.${k}: ${JSON.stringify(o[k])} -> ${JSON.stringify(n[k])}`);
          changes++;
        }
      }
    }
  }
  if (!changes) console.log('  (no material changes — verified dates only)');
  for (const c of proposal.changes || []) if (c.source) console.log(`    source [${c.id}.${c.field}]: ${c.source}`);
  if (proposal.unverified?.length) console.log(`  ! could not verify: ${proposal.unverified.join(', ')}`);
  return changes;
}

/* ---------------- apply ---------------- */
function replaceBlock(src, tag, body, file) {
  const open = src.match(new RegExp(`/\\* <auto:${tag}>[\\s\\S]*?\\*/`));
  const close = `/* </auto:${tag}> */`;
  if (!open) throw new Error(`marker <auto:${tag}> not found in ${file}`);
  const start = src.indexOf(open[0]) + open[0].length;
  const end = src.indexOf(close, start);
  if (end === -1) throw new Error(`marker </auto:${tag}> not found in ${file}`);
  return src.slice(0, start) + '\n' + body + '\n' + src.slice(end);
}

function apply(proposal) {
  const live = (arr) => arr.filter((o) => !o.removed);
  const promos = live(proposal.promos);
  const cash = live(proposal.cash);

  let dataJs = fs.readFileSync(DATA_JS, 'utf8');
  dataJs = replaceBlock(dataJs, 'promos', `const PROMOS = ${JSON.stringify(promos, null, 2)};`, 'api/data.js');
  dataJs = replaceBlock(dataJs, 'cash', `const CASH_OFFERS = ${JSON.stringify(cash, null, 2)};`, 'api/data.js');
  fs.writeFileSync(DATA_JS, dataJs);

  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  const basePromos = promos.filter((o) => FREE_PROMO_IDS.includes(o.id));
  const baseCash = cash.filter((o) => FREE_CASH_IDS.includes(o.id));
  html = replaceBlock(html, 'base-promos', `const BASE_PROMOS = ${JSON.stringify(basePromos, null, 2)};`, 'index.html');
  html = replaceBlock(html, 'base-cash', `const BASE_CASH = ${JSON.stringify(baseCash, null, 2)};`, 'index.html');

  // merge changelog: new entries first, dedupe, keep 8
  let log = [];
  try {
    const m = html.match(/const CHANGELOG = ([\s\S]*?);\s*\n\/\* <\/auto:changelog> \*\//);
    log = (0, eval)(m[1]); // trusted local file: a JS array literal
  } catch { log = []; }
  const merged = [...(proposal.changelog || []), ...log]
    .filter((e, i, a) => a.findIndex((x) => x.date === e.date && x.text === e.text) === i)
    .slice(0, 8);
  html = replaceBlock(html, 'changelog', `const CHANGELOG = ${JSON.stringify(merged, null, 2)};`, 'index.html');

  // keep the hidden-count constants honest
  html = html.replace(/const HIDDEN_BOOKS = \d+;/, `const HIDDEN_BOOKS = ${promos.length - FREE_PROMO_IDS.length};`);
  html = html.replace(/const HIDDEN_CASH = \d+;/, `const HIDDEN_CASH = ${cash.length - FREE_CASH_IDS.length};`);
  fs.writeFileSync(INDEX_HTML, html);

  console.log(`\nApplied: ${promos.length} promos, ${cash.length} cash offers -> api/data.js + public/index.html`);
  console.log('Remember: restart the dev server (it caches data.js), review with git diff, deploy.');
}

/* ---------------- main ---------------- */
const args = process.argv.slice(2);
const current = loadCurrent();

if (args[0] === '--apply') {
  const file = args[1] || PROPOSAL;
  const proposal = JSON.parse(fs.readFileSync(file, 'utf8'));
  validate(proposal);
  console.log(`Applying ${file}:`);
  printDiff(current, proposal);
  apply(proposal);
} else {
  console.log(`Researching ${current.promos.length} promos + ${current.cash.length} cash offers (this calls the Claude API with web search)...\n`);
  const proposal = await research(current);
  validate(proposal);
  fs.writeFileSync(PROPOSAL, JSON.stringify(proposal, null, 2));
  console.log('\n\nProposed changes:');
  printDiff(current, proposal);
  console.log(`\nProposal saved to ${path.relative(ROOT, PROPOSAL)}.`);
  console.log('Review it (check the cited sources!), then run: node tools/update-offers.mjs --apply');
}
