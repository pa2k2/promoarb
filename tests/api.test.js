// API endpoint tests — the money paths: token signing/expiry, restore auth,
// portal, subscribe, affiliate report. Zero dependencies:
//   npm test   (node --test tests/)
// Stripe/Resend are mocked via global.fetch; no network calls are made.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.TOKEN_SECRET = 'test-secret';
process.env.ADMIN_KEY = 'admin-test-key';

const verify = require('../api/verify.js');
const dataHandler = require('../api/data.js');
const restore = require('../api/restore.js');
const portal = require('../api/portal.js');
const subscribe = require('../api/subscribe.js');
const affiliates = require('../api/affiliates.js');

/* ---------- helpers ---------- */
let ipCounter = 0;
const freshIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

const fakeReq = (over = {}) => ({
  method: 'GET',
  query: {},
  ...over,
  headers: { 'x-forwarded-for': freshIp(), host: 'test.local', ...(over.headers || {}) },
});

const fakeRes = () => {
  const r = { statusCode: 0, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

const sign = (payload, secret = process.env.TOKEN_SECRET) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
};
const validToken = (over = {}) =>
  sign({ c: 'cus_test123', iat: Date.now(), exp: Date.now() + 86400e3, ...over });

// Route-based fetch mock: pass { 'url substring': responseBody | fn }
const mockFetch = (routes) => {
  global.fetch = async (url, opts) => {
    for (const [frag, out] of Object.entries(routes)) {
      if (String(url).includes(frag)) {
        const body = typeof out === 'function' ? out(url, opts) : out;
        return { ok: !body.error, status: body.error ? 400 : 200, json: async () => body };
      }
    }
    throw new Error('unmocked fetch: ' + url);
  };
};

/* ---------- /api/verify ---------- */
test('verify: paid checkout session returns a 30-day token', async () => {
  mockFetch({ 'checkout/sessions/': { payment_status: 'paid', customer: 'cus_abc' } });
  const res = fakeRes();
  await verify(fakeReq({ query: { session_id: 'cs_123' } }), res);
  assert.equal(res.statusCode, 200);
  const [body] = res.body.token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  assert.equal(payload.c, 'cus_abc');
  const days = (payload.exp - Date.now()) / 86400e3;
  assert.ok(days > 29 && days < 31, `expiry ~30d, got ${days}`);
});

test('verify: unpaid session is rejected with 402', async () => {
  mockFetch({ 'checkout/sessions/': { payment_status: 'unpaid', customer: 'cus_abc' } });
  const res = fakeRes();
  await verify(fakeReq({ query: { session_id: 'cs_123' } }), res);
  assert.equal(res.statusCode, 402);
});

/* ---------- /api/data ---------- */
test('data: valid token + active subscription returns the paid dataset', async () => {
  mockFetch({ 'subscriptions?customer=': { data: [{ id: 'sub_1' }] } });
  const res = fakeRes();
  await dataHandler(fakeReq({ headers: { authorization: 'Bearer ' + validToken() } }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.promos) && res.body.promos.length >= 10);
  assert.ok(Array.isArray(res.body.cash) && res.body.cash.length >= 15);
  assert.ok(Array.isArray(res.body.guides) && res.body.guides.length >= 3);
});

test('data: expired token is rejected with 401', async () => {
  const res = fakeRes();
  await dataHandler(fakeReq({ headers: { authorization: 'Bearer ' + validToken({ exp: Date.now() - 1000 }) } }), res);
  assert.equal(res.statusCode, 401);
});

test('data: legacy token without exp is rejected', async () => {
  const legacy = sign({ c: 'cus_x', iat: Date.now() }); // pre-expiry format
  const res = fakeRes();
  await dataHandler(fakeReq({ headers: { authorization: 'Bearer ' + legacy } }), res);
  assert.equal(res.statusCode, 401);
});

test('data: token signed with the wrong secret is rejected', async () => {
  const forged = sign({ c: 'cus_x', iat: Date.now(), exp: Date.now() + 86400e3 }, 'wrong-secret');
  const res = fakeRes();
  await dataHandler(fakeReq({ headers: { authorization: 'Bearer ' + forged } }), res);
  assert.equal(res.statusCode, 401);
});

test('data: cancelled subscription loses access with 402', async () => {
  mockFetch({ 'subscriptions?customer=': { data: [] } });
  const res = fakeRes();
  await dataHandler(fakeReq({ headers: { authorization: 'Bearer ' + validToken() } }), res);
  assert.equal(res.statusCode, 402);
});

/* ---------- /api/restore ---------- */
const restoreRoutes = (last4 = '4242') => ({
  'customers?email=': { data: [{ id: 'cus_r1' }] },
  'subscriptions?customer=': { data: [{ id: 'sub_r1' }] },
  'payment_methods?customer=': { data: [{ card: { last4 } }] },
});

test('restore: correct email + card last4 issues a token', async () => {
  mockFetch(restoreRoutes('4242'));
  const res = fakeRes();
  await restore(fakeReq({ query: { email: 'a@b.com', last4: '4242' } }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
});

test('restore: wrong last4 gets the generic 404 (no subscriber enumeration)', async () => {
  mockFetch(restoreRoutes('4242'));
  const res = fakeRes();
  await restore(fakeReq({ query: { email: 'a@b.com', last4: '1111' } }), res);
  assert.equal(res.statusCode, 404);
  assert.ok(!/customer|found for/i.test(res.body.error), 'error must not confirm the email exists');
});

test('restore: malformed last4 is rejected with 400', async () => {
  const res = fakeRes();
  await restore(fakeReq({ query: { email: 'a@b.com', last4: '12ab' } }), res);
  assert.equal(res.statusCode, 400);
});

test('restore: per-IP rate limit trips on the 6th attempt', async () => {
  mockFetch(restoreRoutes('4242'));
  const ip = '10.99.99.99';
  let last;
  for (let i = 0; i < 6; i++) {
    last = fakeRes();
    await restore(fakeReq({ query: { email: 'a@b.com', last4: '4242' }, headers: { 'x-forwarded-for': ip } }), last);
  }
  assert.equal(last.statusCode, 429);
});

/* ---------- /api/portal ---------- */
test('portal: valid token returns a billing portal URL', async () => {
  mockFetch({ 'billing_portal/sessions': { url: 'https://billing.stripe.com/p/session/x' } });
  const res = fakeRes();
  await portal(fakeReq({ method: 'POST', headers: { authorization: 'Bearer ' + validToken() } }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.url, /billing\.stripe\.com/);
});

test('portal: missing token is rejected with 401', async () => {
  const res = fakeRes();
  await portal(fakeReq({ method: 'POST' }), res);
  assert.equal(res.statusCode, 401);
});

/* ---------- /api/subscribe ---------- */
test('subscribe: unconfigured (no Resend env) responds 503, not a crash', async () => {
  delete process.env.RESEND_API_KEY;
  const res = fakeRes();
  await subscribe(fakeReq({ method: 'POST', body: { email: 'a@b.com' } }), res);
  assert.equal(res.statusCode, 503);
});

test('subscribe: invalid email is rejected with 400', async () => {
  process.env.RESEND_API_KEY = 're_fake';
  process.env.RESEND_AUDIENCE_ID = 'aud_fake';
  const res = fakeRes();
  await subscribe(fakeReq({ method: 'POST', body: { email: 'not-an-email' } }), res);
  assert.equal(res.statusCode, 400);
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_AUDIENCE_ID;
});

/* ---------- /api/affiliates ---------- */
test('affiliates: wrong admin key is rejected with 401', async () => {
  const res = fakeRes();
  await affiliates(fakeReq({ query: { key: 'nope' } }), res);
  assert.equal(res.statusCode, 401);
});

test('affiliates: tallies paid sessions by referral code', async () => {
  mockFetch({
    'checkout/sessions?limit=': {
      has_more: false,
      data: [
        { client_reference_id: 'jane', payment_status: 'paid', amount_total: 9900 },
        { client_reference_id: 'jane', payment_status: 'paid', amount_total: 1999 },
        { client_reference_id: 'bob', payment_status: 'unpaid', amount_total: 1999 },
        { client_reference_id: null, payment_status: 'paid', amount_total: 1999 },
      ],
    },
  });
  const res = fakeRes();
  await affiliates(fakeReq({ query: { key: 'admin-test-key' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.affiliates.jane.signups, 2);
  assert.ok(Math.abs(res.body.affiliates.jane.revenue_usd - 118.99) < 1e-9);
  assert.ok(!res.body.affiliates.bob, 'unpaid sessions must not count');
});
