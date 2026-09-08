import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { resetPaddleCache, translateWebhook, verifySignature } from '../src/paddle.js';

// Paddle billing: signature check, webhook → workspaces.plan (unordered retries ignored), checkout config from a fixture API.
const SECRET = 'pdl_ntfset_test_secret';
process.env.PADDLE_WEBHOOK_SECRET = SECRET; process.env.PADDLE_API_KEY = 'pdl_sdbx_apikey_test';
const email = `paddle-${randomBytes(4).toString('hex')}@example.com`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>, fixture: ReturnType<typeof createServer>;
let base = '', cookie = '', wsId = '';
const created: string[] = [];
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const sign = (raw: string, ts = Math.floor(Date.now() / 1000)) => `ts=${ts};h1=${createHmac('sha256', SECRET).update(`${ts}:${raw}`).digest('hex')}`;
const hook = (body: unknown, sig?: string) => {
  const raw = JSON.stringify(body);
  return fetch(base + '/api/billing/webhook/paddle', { method: 'POST', headers: { 'content-type': 'application/json', 'paddle-signature': sig ?? sign(raw) }, body: raw });
};
const subEvent = (type: string, status: string, occurred: string, extra: Record<string, unknown> = {}) => ({
  event_id: `evt_${randomBytes(4).toString('hex')}`, event_type: type, occurred_at: occurred,
  data: { id: 'sub_test1', customer_id: 'ctm_test1', status, custom_data: { workspace_id: wsId }, current_billing_period: { starts_at: '2026-09-07T00:00:00Z', ends_at: '2026-10-07T00:00:00Z' }, items: [{ price: { id: 'pri_month' } }], ...extra },
});

before(async () => {
  await migrate();
  // Fixture Paddle API: empty catalog at first, then remembers what the server creates.
  const products: Record<string, unknown>[] = [], prices: Record<string, unknown>[] = [], discounts: Record<string, unknown>[] = [{ id: 'dsc_old', status: 'active', code: 'EARLYBIRD', amount: '33.34', type: 'percentage', usage_limit: 100, times_used: 3, expires_at: null, custom_data: { wikibrain: 'earlybird' } }];
  fixture = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x'); let body = ''; for await (const c of req) body += c;
    const json = (code: number, data: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data })); };
    if (req.headers.authorization !== 'Bearer pdl_sdbx_apikey_test') return json(403, { error: 'forbidden' });
    if (req.method === 'GET' && url.pathname === '/products') return json(200, products);
    if (req.method === 'POST' && url.pathname === '/products') { const p = { id: 'pro_fx1', status: 'active', ...JSON.parse(body) }; products.push(p); created.push('product'); return json(201, p); }
    if (req.method === 'GET' && url.pathname === '/prices') return json(200, prices.filter(p => p.product_id === url.searchParams.get('product_id')));
    if (req.method === 'POST' && url.pathname === '/prices') { const p = { id: `pri_fx${prices.length + 1}`, status: 'active', ...JSON.parse(body) }; prices.push(p); created.push('price'); return json(201, p); }
    if (req.method === 'GET' && url.pathname === '/discounts') return json(200, discounts);
    if (req.method === 'POST' && url.pathname === '/discounts') { const d = { id: 'dsc_fx1', status: 'active', times_used: 3, ...JSON.parse(body) }; discounts.push(d); created.push('discount'); return json(201, d); }
    if (req.method === 'PATCH' && url.pathname.startsWith('/discounts/')) { created.push('archive'); return json(200, { id: url.pathname.split('/')[2], status: 'archived' }); }
    if (req.method === 'GET' && url.pathname === '/client-tokens') return json(200, []);
    if (req.method === 'POST' && url.pathname === '/client-tokens') { created.push('token'); return json(201, { id: 'ctkn_1', name: 'WikiBrain web', token: 'test_client_token', status: 'active' }); }
    if (req.method === 'POST' && url.pathname === '/customers/ctm_test1/portal-sessions') return json(201, { urls: { general: { overview: 'https://sandbox-customer-portal.paddle.com/cpl_x' }, subscriptions: [{ id: 'sub_test1', cancel_subscription: 'https://portal/cancel', update_subscription_payment_method: 'https://portal/pay' }] } });
    json(404, { error: 'no route ' + url.pathname });
  }).listen(0, '127.0.0.1'); await new Promise(r => fixture.once('listening', r));
  process.env.PADDLE_API_BASE = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`; resetPaddleCache();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'paddle' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  wsId = (await api('GET', '/api/me')).data.workspace.id;
});
after(async () => { server.close(); fixture.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('verifySignature: valid, tampered body, wrong secret, stale timestamp, malformed header', () => {
  const raw = '{"a":1}'; const ts = 1_800_000_000;
  const good = `ts=${ts};h1=${createHmac('sha256', SECRET).update(`${ts}:${raw}`).digest('hex')}`;
  assert.equal(verifySignature(raw, good, SECRET, ts * 1000 + 1000), true);
  assert.equal(verifySignature(raw + ' ', good, SECRET, ts * 1000), false);
  assert.equal(verifySignature(raw, good, 'other', ts * 1000), false);
  assert.equal(verifySignature(raw, good, SECRET, ts * 1000 + 10 * 60_000), false, 'older than 5 minutes');
  assert.equal(verifySignature(raw, 'garbage', SECRET, ts * 1000), false);
  assert.equal(verifySignature(raw, undefined, SECRET, ts * 1000), false);
  // a second h1 (secret rotation) is accepted when either matches
  assert.equal(verifySignature(raw, `ts=${ts};h1=deadbeef;h1=${good.split('h1=')[1]}`, SECRET, ts * 1000), true);
});

test('translateWebhook: subscription events with our workspace tag; others ignored', () => {
  const ev = translateWebhook(subEvent('subscription.activated', 'active', '2026-09-07T10:00:00Z') as never);
  assert.ok(ev); assert.equal(ev.provider, 'paddle'); assert.equal(ev.status, 'active'); assert.equal(ev.workspace_id, wsId);
  assert.equal(ev.provider_customer_id, 'ctm_test1'); assert.equal(ev.current_period_end, '2026-10-07T00:00:00Z'); assert.equal(ev.event_at, '2026-09-07T10:00:00Z');
  assert.equal(translateWebhook({ event_id: 'e', event_type: 'transaction.completed', occurred_at: 'x', data: { custom_data: { workspace_id: wsId } } }), null);
  assert.equal(translateWebhook({ event_id: 'e', event_type: 'subscription.created', occurred_at: 'x', data: { status: 'active' } }), null, 'no workspace tag');
});

test('webhook: bad signature 401, activated → pro, cancel scheduled keeps pro, canceled → free, stale retry ignored, non-subscription event 200 ignored', async () => {
  assert.equal((await hook(subEvent('subscription.activated', 'active', '2026-09-07T10:00:00Z'), 'ts=1;h1=00')).status, 401);
  assert.equal((await api('GET', '/api/plan')).data.plan, 'free');
  assert.equal((await hook(subEvent('subscription.activated', 'active', '2026-09-07T10:00:00Z'))).status, 200);
  assert.equal((await api('GET', '/api/plan')).data.plan, 'pro');
  // user pressed cancel: still active until period end
  assert.equal((await hook(subEvent('subscription.updated', 'active', '2026-09-08T10:00:00Z', { scheduled_change: { action: 'cancel', effective_at: '2026-10-07T00:00:00Z' } }))).status, 200);
  let b = (await api('GET', '/api/billing')).data;
  assert.equal(b.subscription.status, 'active'); assert.equal(b.subscription.raw.scheduled_change.action, 'cancel'); assert.equal((await api('GET', '/api/plan')).data.plan, 'pro');
  // period ended
  assert.equal((await hook(subEvent('subscription.canceled', 'canceled', '2026-10-07T00:00:01Z', { scheduled_change: null }))).status, 200);
  assert.equal((await api('GET', '/api/plan')).data.plan, 'free');
  // a late retry of the older "active" event must not resurrect Pro
  assert.equal((await hook(subEvent('subscription.updated', 'active', '2026-09-08T10:00:00Z'))).status, 200);
  b = (await api('GET', '/api/billing')).data; assert.equal(b.subscription.status, 'canceled'); assert.equal((await api('GET', '/api/plan')).data.plan, 'free');
  const r = await hook({ event_id: 'evt_x', event_type: 'transaction.completed', occurred_at: '2026-10-08T00:00:00Z', data: { id: 'txn_1' } });
  assert.equal(r.status, 200); assert.equal((await r.json()).ignored, 'transaction.completed');
});

test('GET /api/billing creates the catalog once and returns checkout config; POST /api/billing/portal returns portal urls', async () => {
  const b = (await api('GET', '/api/billing')).data;
  assert.equal(b.error, null); assert.equal(b.paddle.environment, 'sandbox'); assert.equal(b.paddle.client_token, 'test_client_token');
  assert.equal(b.paddle.prices.month.amount, 600); assert.equal(b.paddle.prices.year.amount, 6000); assert.equal(b.paddle.prices.year.interval, 'year');
  assert.equal(b.paddle.workspace_id, wsId); assert.equal(b.paddle.email, email);
  assert.deepEqual([...created].sort(), ['archive', 'price', 'price', 'product', 'token'], 'early bird is off by default: a leftover discount is archived, none created');
  assert.equal(b.paddle.prices.discount, null);
  await api('GET', '/api/billing');
  assert.equal(created.length, 5, 'second call is served from the cache');
  const p = await api('POST', '/api/billing/portal');
  assert.equal(p.status, 200); assert.match(p.data.overview, /customer-portal/); assert.equal(p.data.cancel, 'https://portal/cancel');
});
