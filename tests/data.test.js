// Offer-data integrity tests. These are the guards that fire when a late-night
// data edit breaks an invariant: duplicate ids, free/Pro tier drift, bad dates,
// or teaser counts that no longer match reality.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_fake';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const { PROMOS, CASH_OFFERS, GUIDES } = require('../api/data.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const CATEGORIES = new Set(['Bank', 'Brokerage', 'Credit card', 'Fintech']);
const PROMO_TYPES = new Set(['Bonus bets', 'Bet tokens', 'Loss protection', 'Deposit match', 'Profit boosts', 'Bonus if win']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATE_RE = /^[A-Z]{2}$/;

test('ids are unique across promos and cash offers', () => {
  const ids = [...PROMOS.map(p => p.id), ...CASH_OFFERS.map(o => o.id)];
  assert.equal(new Set(ids).size, ids.length);
});

test('every promo is well-formed', () => {
  for (const p of PROMOS) {
    assert.ok(p.sportsbook && typeof p.sportsbook === 'string', `${p.id}: sportsbook`);
    assert.ok(p.bonusValue > 0, `${p.sportsbook}: bonusValue`);
    assert.ok(p.minBet >= 0, `${p.sportsbook}: minBet`);
    assert.ok(PROMO_TYPES.has(p.type), `${p.sportsbook}: unknown type "${p.type}"`);
    assert.ok(p.expiresDays > 0, `${p.sportsbook}: expiresDays`);
    assert.match(p.verified, DATE_RE, `${p.sportsbook}: verified date`);
    assert.ok(Array.isArray(p.states) && p.states.every(s => STATE_RE.test(s)), `${p.sportsbook}: states`);
  }
});

test('every cash offer is well-formed', () => {
  for (const o of CASH_OFFERS) {
    assert.ok(o.name && typeof o.name === 'string', `${o.id}: name`);
    assert.ok(o.value > 0, `${o.name}: value`);
    assert.ok(CATEGORIES.has(o.category), `${o.name}: unknown category "${o.category}"`);
    assert.ok(typeof o.requirement === 'string' && o.requirement.length > 10, `${o.name}: requirement`);
    assert.ok(o.effortHrs > 0, `${o.name}: effortHrs (drives $/hr sort)`);
    assert.match(o.verified, DATE_RE, `${o.name}: verified date`);
    if (o.endsOn) assert.match(o.endsOn, DATE_RE, `${o.name}: endsOn`);
    if (o.states) assert.ok(o.states.every(s => STATE_RE.test(s)), `${o.name}: states`);
    if (o.cooldownMonths) assert.ok(o.cooldownMonths >= 1, `${o.name}: cooldownMonths`);
  }
});

test('guides have unique ids and non-trivial bodies', () => {
  assert.ok(GUIDES.length >= 3);
  assert.equal(new Set(GUIDES.map(g => g.id)).size, GUIDES.length);
  for (const g of GUIDES) assert.ok(g.title && g.body.length > 200, `${g.id}: body too thin`);
});

/* ---- consistency between api/data.js and the free tier in index.html ---- */

const sliceArray = (marker) => {
  const start = html.indexOf(`const ${marker} = [`);
  assert.ok(start > -1, `${marker} not found in index.html`);
  return html.slice(start, html.indexOf('];', start));
};

test('teaser counts in index.html match the real dataset', () => {
  const hiddenCash = Number(html.match(/const HIDDEN_CASH = (\d+)/)[1]);
  const hiddenBooks = Number(html.match(/const HIDDEN_BOOKS = (\d+)/)[1]);
  const freeCash = (sliceArray('BASE_CASH').match(/\{ id:/g) || []).length;
  const freePromos = (sliceArray('BASE_PROMOS').match(/\{ id:/g) || []).length;
  assert.equal(hiddenCash, CASH_OFFERS.length - freeCash,
    `HIDDEN_CASH says ${hiddenCash} but dataset has ${CASH_OFFERS.length} - ${freeCash} free`);
  assert.equal(hiddenBooks, PROMOS.length - freePromos,
    `HIDDEN_BOOKS says ${hiddenBooks} but dataset has ${PROMOS.length} - ${freePromos} free`);
});

test('free-tier cash values in index.html match api/data.js (no tier drift)', () => {
  const base = sliceArray('BASE_CASH');
  for (const m of base.matchAll(/id: '(c\d+)',.*?value: (\d+)/g)) {
    const [, id, value] = m;
    const pro = CASH_OFFERS.find(o => o.id === id);
    assert.ok(pro, `free offer ${id} missing from api/data.js`);
    assert.equal(Number(value), pro.value,
      `${pro.name} (${id}): free tier says $${value}, api/data.js says $${pro.value}`);
  }
});

test('free-tier promo values in index.html match api/data.js', () => {
  const base = sliceArray('BASE_PROMOS');
  for (const m of base.matchAll(/id: (\d+),.*?bonusValue: (\d+)/g)) {
    const [, id, value] = m;
    const pro = PROMOS.find(p => p.id === Number(id));
    assert.ok(pro, `free promo ${id} missing from api/data.js`);
    assert.equal(Number(value), pro.bonusValue,
      `${pro.sportsbook} (${id}): free tier says $${value}, api/data.js says $${pro.bonusValue}`);
  }
});
