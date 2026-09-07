import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';

// REST API with an MCP token as API key (P1): no cookie, no Origin; notes CRUD / search / export work; account endpoints
// are session-only; read-only scopes block writes; revocation returns 401; writes are attributed to the token label.
const email = `rest-${randomBytes(4).toString('hex')}@example.com`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', token = '', tokenId = 0;
const withCookie = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const withToken = async (method: string, path: string, body?: unknown, tk = token) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tk}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null), res };
};
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'rest' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  const t = await withCookie('POST', '/api/tokens', { label: 'my-script' }); token = t.data.token; tokenId = t.data.id;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('token as API key: tree, create, read, update (409 on stale), search, export; author is the token label', async () => {
  assert.equal((await withToken('GET', '/api/notes/tree')).status, 200);
  const c = await withToken('POST', '/api/notes', { path: 'wiki/rest-page.md', content: '# REST page\n\n由腳本建立。' });
  assert.equal(c.status, 201, JSON.stringify(c.data)); assert.equal(c.data.version, 1);
  const r = await withToken('GET', '/api/notes?path=wiki/rest-page.md'); assert.equal(r.status, 200); assert.equal(r.data.author, 'mcp:my-script');
  assert.equal((await withToken('PUT', '/api/notes', { path: 'wiki/rest-page.md', content: '# REST page\n\n第二版', if_version: 1 })).data.version, 2);
  assert.equal((await withToken('PUT', '/api/notes', { path: 'wiki/rest-page.md', content: 'x', if_version: 1 })).status, 409);
  const s = await withToken('GET', '/api/search?q=' + encodeURIComponent('第二版')); assert.equal(s.status, 200); assert.ok(JSON.stringify(s.data).includes('rest-page'));
  const ex = await fetch(base + '/api/export', { headers: { authorization: `Bearer ${token}` } }); assert.equal(ex.status, 200); assert.match(ex.headers.get('content-type') ?? '', /zip/);
  assert.equal((await withToken('GET', '/api/plan')).status, 200);
});

test('session-only endpoints refuse tokens; bad / revoked tokens 401; read-only scope blocks writes', async () => {
  for (const p of ['/api/tokens', '/api/ai', '/api/zotero', '/api/billing']) assert.equal((await withToken('GET', p)).status, 403, p);
  assert.equal((await withToken('POST', '/api/chat', {})).status, 403);
  assert.equal((await withToken('GET', '/api/notes/tree', undefined, 'wb_nope')).status, 401);
  await pool.query(`UPDATE mcp_tokens SET scopes = ARRAY['notes:read'] WHERE id = $1`, [tokenId]);
  assert.equal((await withToken('GET', '/api/notes?path=wiki/rest-page.md')).status, 200);
  assert.equal((await withToken('POST', '/api/notes', { path: 'wiki/nope.md', content: 'x' })).status, 403);
  await pool.query(`UPDATE mcp_tokens SET scopes = ARRAY['notes:read','notes:write'] WHERE id = $1`, [tokenId]);
  assert.equal((await withCookie('DELETE', `/api/tokens/${tokenId}`)).status, 200);
  assert.equal((await withToken('GET', '/api/notes/tree')).status, 401);
});
