import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { createNote, listNotes, readNote, listVersions } from '../src/notes.js';
import { createShare, readShared } from '../src/shares.js';

/* Emptying a workspace: the middle ground between deleting one page and deleting the account. It has to leave the
   account usable, leave the history recoverable, and close anything that was published outward. */
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', ws = '', userId = '', wsName = '';
const email = `rs-${randomBytes(4).toString('hex')}@example.com`;
const actor = { kind: 'web' as const, name: email };
const post = (path: string, body: unknown) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: JSON.stringify(body) });

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'rs' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const login = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = login.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  const row = (await pool.query<{ id: string; ws: string; name: string }>(`SELECT u.id, w.id AS ws, w.name FROM "user" u JOIN workspaces w ON w.owner_user_id = u.id WHERE u.email = $1`, [email])).rows[0];
  userId = row.id; ws = row.ws; wsName = row.name;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE id = $1', [userId]); await pool.end(); });

test('the workspace name has to be typed, and a wrong one changes nothing', async () => {
  await createNote(ws, 'wiki/keep-me.md', '# 還在\n', actor);
  const before_ = (await listNotes(ws)).length;
  const bad = await post('/api/workspace/reset', { confirm: 'not the name' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, new RegExp(wsName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '訊息要告訴他該打什麼');
  assert.equal((await listNotes(ws)).length, before_, '一則都沒動');
  assert.equal((await post('/api/workspace/reset', {})).status, 400, '沒帶 confirm 也擋下');
});

test('emptying clears every note, revokes shares, and leaves the history recoverable', async () => {
  await createNote(ws, 'raw/sources/a-source.md', '# 來源\n\n內文。\n', actor);
  await createNote(ws, 'wiki/page.md', '# 一頁\n\n第一版。\n', actor);
  const share = await createShare(ws, 'wiki/page.md', userId);
  assert.ok(await readShared(share.token), '清空前分享看得到');
  assert.ok((await listNotes(ws)).length >= 3);

  const res = await post('/api/workspace/reset', { confirm: wsName });
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.ok(r.notes >= 3, `刪掉的則數：${r.notes}`);
  assert.equal((await listNotes(ws)).length, 0, '每一層都空了，raw/ 也在內');
  assert.equal(await readShared(share.token), null, '分享連結停掉——那是給外人的承諾');

  // 帳號本身仍然可用
  const me = await (await fetch(base + '/api/me', { headers: { cookie } })).json();
  assert.equal(me.workspace.id, ws, '工作區還在，只是空的');

  // 版本歷史沒被毀掉：在同一個路徑重建會接回原本的版本號
  await createNote(ws, 'wiki/page.md', '# 一頁\n\n重新開始。\n', actor);
  const revived = await readNote(ws, 'wiki/page.md');
  assert.equal(revived.version, 2, '接回原本的版本，不是從 1 重來');
  const history = await listVersions(ws, 'wiki/page.md');
  assert.ok(history.some(v => v.content_md.includes('第一版')), '清空之前的內容還在版本歷史裡');
});

test('an API token cannot empty a workspace', async () => {
  const tok = await (await fetch(base + '/api/tokens', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: JSON.stringify({ label: 'rs' }) })).json();
  const res = await fetch(base + '/api/workspace/reset', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok.token}` }, body: JSON.stringify({ confirm: wsName }) });
  assert.equal(res.status, 403, '只能在網頁登入後做，agent 拿到 token 也不行');
});
