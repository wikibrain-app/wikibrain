import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';

// First-party page analytics: what gets counted, what does not, and how unique visitors are derived.
// Views land in the shared events table, so the assertions compare before/after counts rather than absolutes.
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const marker = randomBytes(4).toString('hex');

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(base + path, { headers: { 'user-agent': BROWSER, ...headers }, redirect: 'manual' });
const views = async () => Number((await pool.query<{ n: string }>(
  `SELECT count(*)::text AS n FROM events WHERE kind = 'page_view' AND at >= now() - interval '2 minutes'`)).rows[0].n);
const visitors = async () => Number((await pool.query<{ n: string }>(
  `SELECT count(DISTINCT meta->>'v')::text AS n FROM events WHERE kind = 'page_view' AND at >= now() - interval '2 minutes'`)).rows[0].n);

before(async () => {
  await migrate();
  await pool.query(`DELETE FROM events WHERE kind = 'page_view' AND at >= now() - interval '2 minutes'`);
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await pool.query(`DELETE FROM events WHERE kind = 'page_view' AND at >= now() - interval '5 minutes'`);
  await pool.end();
});

const settle = () => new Promise(r => setTimeout(r, 250)); // the insert is fire-and-forget

test('counts a signed-out browser once per page, and keeps the referrer and campaign', async () => {
  const before = await views();
  await get('/help', { referer: `https://ithelp.ithome.com.tw/articles/${marker}` });
  await get(`/help/guide?utm_source=ironman&utm_medium=article&utm_campaign=${marker}`);
  await settle();
  assert.equal(await views() - before, 2);

  const { rows } = await pool.query<{ page: string; ref: string | null; campaign: string | null }>(
    `SELECT meta->>'page' AS page, meta->>'ref' AS ref, meta->>'campaign' AS campaign
       FROM events WHERE kind = 'page_view' AND at >= now() - interval '2 minutes' ORDER BY id DESC LIMIT 2`);
  const byPage = Object.fromEntries(rows.map(r => [r.page, r]));
  assert.equal(byPage['help/start'].ref, 'ithelp.ithome.com.tw', 'referring site is kept without the path');
  assert.equal(byPage['help/guide'].campaign, `ironman/article/${marker}`);
});

test('does not count crawlers, signed-in visitors, or a browser that opted out', async () => {
  const before = await views();
  await get('/help', { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
  await get('/help', { 'user-agent': 'curl/8.4.0' });
  await get('/help', { 'user-agent': '' });
  await get('/help', { cookie: 'session_token=whatever' });
  await get('/help', { cookie: 'wb_noanalytics=1' });
  await settle();
  assert.equal(await views() - before, 0);

  // the opt-out link sets the cookie itself
  const res = await get('/?noanalytics=1');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') ?? '', /wb_noanalytics=1/);
});

test('the same browser is one visitor across pages; a different one is another', async () => {
  await pool.query(`DELETE FROM events WHERE kind = 'page_view' AND at >= now() - interval '2 minutes'`);
  await get('/help'); await get('/help/guide'); await get('/compare');
  await get('/help', { 'user-agent': BROWSER.replace('Chrome/128.0', 'Firefox/131.0') });
  await settle();
  assert.equal(await views(), 4, 'four page views');
  assert.equal(await visitors(), 2, 'two distinct visitors');
});
