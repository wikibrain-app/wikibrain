import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';

// Decision 19: raw/ sources cannot be deleted from any client; archive moves them under raw/archive/ and out of the pending list.
const email = `arch-${randomBytes(4).toString('hex')}@example.com`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '';
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'arch' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('raw/ cannot be deleted; archive moves to raw/archive/ keeping versions and links; unarchive moves back; pending list excludes archived', async () => {
  await api('POST', '/api/notes', { path: 'raw/sources/paper-a.md', content: '# Paper A\n\nbody' });
  await api('POST', '/api/notes', { path: 'wiki/notes-a.md', content: '# Notes\n\nsee [[raw/sources/paper-a]]' });
  const del = await fetch(base + '/api/notes?path=raw/sources/paper-a.md', { method: 'DELETE', headers: { origin: config.appUrl, cookie } });
  assert.equal(del.status, 403); assert.match((await del.json()).message, /封存/);
  await api('POST', '/api/notes', { path: 'raw/sources/paper-b.md', content: '# Paper B\n\nbody' });
  let tree = (await api('GET', '/api/notes/tree')).data;
  assert.ok(tree.pendingSources.includes('raw/sources/paper-b.md'));
  const a = await api('POST', '/api/notes/archive', { path: 'raw/sources/paper-b.md' });
  assert.equal(a.status, 200); assert.equal(a.data.path, 'raw/archive/sources/paper-b.md');
  tree = (await api('GET', '/api/notes/tree')).data;
  assert.ok(!tree.pendingSources.includes('raw/sources/paper-b.md')); assert.ok(!tree.pendingSources.some((p: string) => p.startsWith('raw/archive/')));
  assert.ok(tree.notes.some((n: { path: string }) => n.path === 'raw/archive/sources/paper-b.md'));
  // links survive a move (to_note_id), versions stay
  await api('POST', '/api/notes/archive', { path: 'raw/sources/paper-a.md' });
  const back = (await api('GET', '/api/notes/backlinks?path=raw/archive/sources/paper-a.md')).data;
  assert.ok(back.backlinks.some((b: { path: string }) => b.path === 'wiki/notes-a.md'));
  const versions = (await api('GET', '/api/notes/versions?path=raw/archive/sources/paper-a.md')).data;
  assert.equal(versions.versions.length, 1);
  assert.equal((await api('POST', '/api/notes/archive', { path: 'raw/archive/sources/paper-a.md' })).status, 400, 'already archived');
  const u = await api('POST', '/api/notes/archive', { path: 'raw/archive/sources/paper-a.md', undo: true });
  assert.equal(u.data.path, 'raw/sources/paper-a.md');
  assert.equal((await api('POST', '/api/notes/archive', { path: 'wiki/notes-a.md' })).status, 400, 'only raw can be archived');
  assert.equal((await api('POST', '/api/notes/archive', { path: 'raw/sources/paper-a.md', undo: true })).status, 400, 'not archived');
});
