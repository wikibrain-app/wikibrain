import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';

// Account deletion (privacy policy requirement): the user deletes their own account with their password; FKs cascade to everything.
const email = `del-${randomBytes(4).toString('hex')}@example.com`;
const password = 'correct-horse-battery';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', userId = '', wsId = '';
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password, name: 'del' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  const me = await (await fetch(base + '/api/me', { headers: { cookie } })).json(); userId = me.user.id; wsId = me.workspace.id;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('wrong password is refused; correct password deletes user, workspace, notes and tokens', async () => {
  await fetch(base + '/api/notes', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: JSON.stringify({ path: 'wiki/a.md', content: '# a' }) });
  await fetch(base + '/api/tokens', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: JSON.stringify({ label: 't' }) });
  const bad = await fetch(base + '/api/auth/delete-user', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: JSON.stringify({ password: 'wrong-password-123' }) });
  assert.ok(bad.status >= 400, `wrong password should fail, got ${bad.status}`);
  assert.equal((await pool.query('SELECT 1 FROM "user" WHERE id = $1', [userId])).rowCount, 1);
  const ok = await fetch(base + '/api/auth/delete-user', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: JSON.stringify({ password }) });
  assert.equal(ok.status, 200, await ok.text());
  assert.equal((await pool.query('SELECT 1 FROM "user" WHERE id = $1', [userId])).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM workspaces WHERE id = $1', [wsId])).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM notes WHERE workspace_id = $1', [wsId])).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM mcp_tokens WHERE workspace_id = $1', [wsId])).rowCount, 0);
  assert.equal((await fetch(base + '/api/me', { headers: { cookie } })).status, 401);
});
