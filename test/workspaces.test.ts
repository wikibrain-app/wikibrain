import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { createNote, listNotes } from '../src/notes.js';
import { planStatus } from '../src/plans.js';

/* Several knowledge bases per account. The isolation was always there; what is new is choosing one, and the rules
   about how many and who pays. */
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', userId = '', firstWs = '';
const email = `ws-${randomBytes(4).toString('hex')}@example.com`;
const actor = { kind: 'web' as const, name: email };
const req = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = r.headers.getSetCookie().find(c => c.startsWith('wb_ws='));
  if (set) cookie = `${cookie.split('; ').filter(c => !c.startsWith('wb_ws=')).join('; ')}; ${set.split(';')[0]}`;
  return { status: r.status, data: await r.json().catch(() => null) };
};
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'ws' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const login = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = login.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  const row = (await pool.query<{ id: string; ws: string }>(`SELECT u.id, w.id AS ws FROM "user" u JOIN workspaces w ON w.owner_user_id = u.id WHERE u.email = $1`, [email])).rows[0];
  userId = row.id; firstWs = row.ws;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE id = $1', [userId]); await pool.end(); });

test('the trial gets Pro\'s allowance; Free gets one, and the refusal says what would change that', async () => {
  // A new account is inside its 14 days, so it sees Pro limits — including being able to open a second knowledge base.
  const trial = await req('GET', '/api/workspaces');
  assert.equal(trial.data.limit, 10, '體驗期就是 Pro 的額度');
  assert.equal(trial.data.workspaces.length, 1);
  assert.equal(trial.data.current, firstWs);

  await pool.query(`UPDATE "user" SET plan = 'free', trial_ends_at = now() - interval '1 day' WHERE id = $1`, [userId]);
  assert.equal((await req('GET', '/api/workspaces')).data.limit, 1, '體驗期結束回到 1 個');
  const refused = await req('POST', '/api/workspaces', { name: '第二座' });
  assert.equal(refused.status, 403);
  assert.match(refused.data.message, /Pro/, '擋下來時要說升級能得到什麼');

  await pool.query(`UPDATE "user" SET plan = 'pro' WHERE id = $1`, [userId]);
  assert.equal((await req('GET', '/api/workspaces')).data.limit, 10);
});

test('creating one lands you in it, and each keeps its own notes', async () => {
  const made = await req('POST', '/api/workspaces', { name: '研究用' });
  assert.equal(made.status, 201);
  const second = made.data.id;
  assert.notEqual(second, firstWs);

  // the cookie moved with it: writes now land in the new workspace
  const me = await req('GET', '/api/me');
  assert.equal(me.data.workspace.id, second, '建完就切過去');

  await createNote(firstWs, 'wiki/only-in-first.md', '# 第一座\n', actor);
  await createNote(second, 'wiki/only-in-second.md', '# 第二座\n', actor);
  assert.deepEqual((await listNotes(second)).map(n => n.path).filter(p => p.startsWith('wiki/only')), ['wiki/only-in-second.md']);
  assert.deepEqual((await listNotes(firstWs)).map(n => n.path).filter(p => p.startsWith('wiki/only')), ['wiki/only-in-first.md']);

  // switching back
  assert.equal((await req('PUT', '/api/me/workspace', { id: firstWs })).status, 200);
  assert.equal((await req('GET', '/api/me')).data.workspace.id, firstWs);
});

test('quotas are the account\'s, so a second workspace is not a way around the limit', async () => {
  const s = await planStatus(firstWs);
  const both = (await req('GET', '/api/workspaces')).data.workspaces.length;
  assert.ok(both >= 2);
  assert.equal(s.notes_used, (await planStatus((await req('GET', '/api/workspaces')).data.workspaces[1].id)).notes_used,
    '兩座庫看到的是同一個帳號總量');
  assert.ok(s.notes_used >= 2, '兩座庫的筆記都算進去');
});

test('another account cannot reach, rename or delete my workspace', async () => {
  const other = `ws2-${randomBytes(4).toString('hex')}@example.com`;
  await auth.api.signUpEmail({ body: { email: other, password: 'correct-horse-battery', name: 'o' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [other]);
  const lg = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email: other, password: 'correct-horse-battery' }) });
  const theirs = lg.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  const call = (m: string, p: string, b?: unknown) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie: `${theirs}; wb_ws=${firstWs}` }, body: b === undefined ? undefined : JSON.stringify(b) });

  // a forged cookie does not grant access: they land in their own workspace
  const me = await (await call('GET', '/api/me')).json();
  assert.notEqual(me.workspace.id, firstWs, '偽造 cookie 只會落回自己的庫');
  assert.equal((await call('PATCH', `/api/workspaces/${firstWs}`, { name: 'hacked' })).status, 404);
  assert.equal((await call('DELETE', `/api/workspaces/${firstWs}?confirm=x`)).status, 404);
  await pool.query('DELETE FROM "user" WHERE email = $1', [other]);
});

test('deleting needs the name typed, and the last one cannot be deleted', async () => {
  const list = (await req('GET', '/api/workspaces')).data.workspaces;
  const victim = list.find((w: { id: string }) => w.id !== firstWs)!;
  assert.equal((await req('DELETE', `/api/workspaces/${victim.id}?confirm=wrong`)).status, 400, '名稱打錯不刪');
  assert.equal((await req('DELETE', `/api/workspaces/${victim.id}?confirm=${encodeURIComponent(victim.name)}`)).status, 200);
  assert.equal((await req('GET', '/api/workspaces')).data.workspaces.length, list.length - 1);

  const last = (await req('GET', '/api/workspaces')).data.workspaces[0];
  const refused = await req('DELETE', `/api/workspaces/${last.id}?confirm=${encodeURIComponent(last.name)}`);
  assert.equal(refused.status, 403);
  assert.match(refused.data.message, /清空|empty/i, '拒絕時要指向「清空」這個保留歷史的選項');
});
