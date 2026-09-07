import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';

const email = `st-${randomBytes(4).toString('hex')}@example.com`;
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
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'st' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('stats: empty workspace all zero with fixed series lengths; after creating pages layers, source types, inbound and activity are right; version in config and healthz', async () => {
  const z = (await api('GET', '/api/stats')).data;
  assert.equal(z.totals.notes, 0); assert.equal(z.activity.length, 182); assert.equal(z.notesPerDay.length, 30); assert.equal(z.agentPerDay.length, 30);
  await api('POST', '/api/import', { kind: 'text', text: '訪談\n\n內容' });
  await api('POST', '/api/notes', { path: 'wiki/a.md', content: '# A\n\n連 [[b]] 與 [[b]]' });
  await api('POST', '/api/notes', { path: 'wiki/b.md', content: '# B' });
  await api('POST', '/api/notes', { path: 'wiki/c.md', content: '# C\n\n也連 [[b]]' });
  await api('POST', '/api/notes', { path: 'schema/x.md', content: '# X' });
  const s = (await api('GET', '/api/stats')).data;
  assert.deepEqual(s.layers, [{ layer: 'raw', count: 1 }, { layer: 'wiki', count: 3 }, { layer: 'schema', count: 1 }]);
  assert.deepEqual(s.sourceTypes, [{ type: 'text', count: 1 }]);
  assert.equal(s.totals.links, 2, 'duplicate links on one page count once; two pages link to b = 2');
  assert.deepEqual(s.topInbound[0], { path: 'wiki/b.md', title: 'B', inbound: 2 });
  assert.equal(s.notesPerDay.at(-1).count, 5);
  const today = s.activity.at(-1);
  assert.equal(today.count, 5); assert.equal(today.by.web, 5);
  assert.equal(s.totals.pending, 1);
  const cfg = (await api('GET', '/api/config')).data;
  assert.match(cfg.version, /^\d+\.\d+\.\d+$/); assert.ok(cfg.commit);
  const h = await (await fetch(base + '/healthz')).json();
  assert.equal(h.version, cfg.version);
});
