import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { unzipSync, strFromU8 } from 'fflate';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { outbox } from '../src/mail.js';

// Milestone 4 (c)-(g): rate limit, Origin check, usage counting, zip export, password reset.
const email = `m4-${randomBytes(4).toString('hex')}@example.com`;
let password = 'correct-horse-battery';
const MCP_LIMIT = 5;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
let cookie = '';
let token = '';

const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = { origin: config.appUrl }) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return res;
};
const mcp = () => fetch(base + '/mcp', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
async function signIn(pw: string) {
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: pw }) });
  return r;
}

before(async () => {
  await migrate();
  server = createApp({ mcpRatePerMin: MCP_LIMIT, ipRatePerMin: 1000 }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password, name: 'm4' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await signIn(password);
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  token = (await (await api('POST', '/api/tokens', { label: 'm4' })).json()).token;
});
after(async () => {
  server.close();
  await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
  await pool.end();
});

test('(g) Origin check: state-changing custom API with missing or untrusted Origin → 403; GET unaffected', async () => {
  assert.equal((await api('POST', '/api/notes', { path: 'wiki/o.md', content: 'x' }, {})).status, 403);
  assert.equal((await api('POST', '/api/notes', { path: 'wiki/o.md', content: 'x' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await api('DELETE', '/api/notes?path=wiki/o.md', undefined, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await api('GET', '/api/notes/tree', undefined, {})).status, 200);
  assert.equal((await api('POST', '/api/notes', { path: 'wiki/o.md', content: '# O' })).status, 201);
});

test('(c)(d) MCP token rate limit 429 and usage counting', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < MCP_LIMIT + 2; i++) statuses.push((await mcp()).status);
  assert.deepEqual(statuses.slice(0, MCP_LIMIT), Array(MCP_LIMIT).fill(200));
  assert.deepEqual(statuses.slice(MCP_LIMIT), [429, 429]);
  await new Promise(r => setTimeout(r, 200));           // counting is fire-and-forget
  const u = await (await api('GET', '/api/usage')).json();
  assert.equal(u.mcp_calls, MCP_LIMIT, 'only requests that passed the rate limit are counted');
  assert.equal(u.note_count, 1);
  assert.ok(u.storage_bytes > 0);
  assert.match(u.month, /^\d{4}-\d{2}$/);
});

test('(e) export zip: contains all non-deleted notes plus README', async () => {
  await api('POST', '/api/notes', { path: 'schema/rules.md', content: '# 規則\n\n一事一頁。' });
  await api('POST', '/api/notes', { path: 'wiki/gone.md', content: '# 會被刪' });
  await api('DELETE', '/api/notes?path=wiki/gone.md');
  const res = await api('GET', '/api/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') ?? '', /wikibrain-\d{4}-\d{2}-\d{2}\.zip/);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  assert.deepEqual(Object.keys(files).sort(), ['README.md', 'schema/rules.md', 'wiki/o.md']);
  assert.match(strFromU8(files['schema/rules.md']), /一事一頁/);
});

test('(f) password reset: request → token in email → set new password → old rejected, new signs in', async () => {
  const req = await fetch(base + '/api/auth/request-password-reset', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, redirectTo: `${config.appUrl}/reset-password` }) });
  assert.equal(req.status, 200, await req.text());
  const mail = outbox.findLast(m => m.to === email && /重設/.test(m.subject));
  assert.ok(mail, 'reset email should be sent');
  const tok = mail!.text.match(/reset-password\/([^?\s]+)/)?.[1];
  assert.ok(tok, `email should contain a token: ${mail!.text}`);
  const newPw = 'brand-new-password-9';
  const reset = await fetch(base + '/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ token: tok, newPassword: newPw }) });
  assert.equal(reset.status, 200, await reset.text());
  assert.equal((await signIn(password)).status, 401, 'old password should be rejected');
  assert.equal((await signIn(newPw)).status, 200);
  password = newPw;
});
