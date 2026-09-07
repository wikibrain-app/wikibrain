import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { outbox } from '../src/mail.js';
import { config } from '../src/config.js';

// Account flow end to end: sign up -> verification email -> log in -> create token -> call MCP with it -> revoke -> 401.
const email = `t-${randomBytes(4).toString('hex')}@example.com`;
const password = 'correct-horse-battery';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
let cookie = '';
let mcpToken = '';
let tokenId = 0;

const json = (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) =>
  fetch(base + path, {
    method,
    // better-auth CSRF checks require Origin to be in trustedOrigins; the test server is on a random port, so send APP_URL.
    headers: { 'content-type': 'application/json', origin: config.appUrl, ...(cookie ? { cookie } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
// better-auth builds verification links from APP_URL; the test server is on a random port, so just rewrite the host.
const localize = (url: string) => base + new URL(url).pathname + new URL(url).search;
const mcp = (bearer: string, payload: unknown) =>
  fetch(base + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${bearer}` },
    body: JSON.stringify(payload),
  });

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
  await pool.end();
});

test('/api/me without session → 401', async () => {
  assert.equal((await json('GET', '/api/me')).status, 401);
});

test('sign-up → verification email sent; login blocked until verified', async () => {
  const res = await json('POST', '/api/auth/sign-up/email', { email, password, name: '測試' });
  assert.equal(res.status, 200, await res.text());
  const mail = outbox.findLast(m => m.to === email);
  assert.ok(mail, 'verification email should be sent');
  assert.match(mail!.subject, /驗證/);
  const signin = await json('POST', '/api/auth/sign-in/email', { email, password });
  assert.equal(signin.status, 403);
});

test('follow verification link → sign in → /api/me has a workspace', async () => {
  const mail = outbox.findLast(m => m.to === email)!;
  const url = mail.text.match(/https?:\/\/\S+/)![0];
  const verify = await fetch(localize(url), { redirect: 'manual' });
  assert.ok([200, 302].includes(verify.status), `verify status ${verify.status}`);

  const signin = await json('POST', '/api/auth/sign-in/email', { email, password });
  assert.equal(signin.status, 200, await signin.text());
  const setCookie = signin.headers.getSetCookie().find(c => c.includes('session_token'));
  assert.ok(setCookie, 'session cookie should be set');
  cookie = setCookie!.split(';')[0];

  const me = await (await json('GET', '/api/me')).json();
  assert.equal(me.user.email, email);
  assert.ok(me.workspace?.id, 'sign-up hook should auto-create a workspace');
  assert.match(me.mcpUrl, /\/mcp$/);
});

test('create token → plaintext returned once; mcp.json snippet correct', async () => {
  const res = await json('POST', '/api/tokens', { label: 'cursor' });
  assert.equal(res.status, 201);
  const t = await res.json();
  assert.match(t.token, /^wb_live_[0-9a-f]{48}$/);
  assert.equal(t.mcpJson.mcpServers.wikibrain.headers.Authorization, `Bearer ${t.token}`);
  mcpToken = t.token; tokenId = t.id;

  const list = await (await json('GET', '/api/tokens')).json();
  assert.equal(list.tokens.length, 1);
  assert.equal(list.tokens[0].label, 'cursor');
  assert.equal('token' in list.tokens[0], false, 'list must not contain plaintext');
});

test('token works for MCP; 401 after revoke', async () => {
  const list = await mcp(mcpToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(list.status, 200);
  assert.match(await list.text(), /"get_instructions"/);

  const del = await json('DELETE', `/api/tokens/${tokenId}`);
  assert.equal(del.status, 200);
  const again = await mcp(mcpToken, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(again.status, 401);
  const twice = await json('DELETE', `/api/tokens/${tokenId}`);
  assert.equal(twice.status, 404);
});

test('/api/config reports whether Google login is enabled', async () => {
  const c = await (await fetch(base + '/api/config')).json();
  assert.equal(typeof c.googleEnabled, 'boolean');
});
