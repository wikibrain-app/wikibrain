import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { createNote, normalizePath } from '../src/notes.js';
import { planStatus } from '../src/plans.js';
import { auth } from '../src/auth-web.js';
import { config } from '../src/config.js';

/* Fixes from the 2026-09-12 four-lens review, batch A. Each one is a thing a reviewer actually broke. */
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', ws = '', userId = '', cookie = '', email = '';
const api = (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie, ...(init.headers ?? {}) } });
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // A signed-in account (the create hook gives it a workspace); the plan is forced to expired-trial Free for A3.
  email = `ra-${randomBytes(4).toString('hex')}@example.com`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'ra' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const login = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = login.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  const row = (await pool.query<{ id: string; ws: string }>(`SELECT u.id, w.id AS ws FROM "user" u JOIN workspaces w ON w.owner_user_id = u.id WHERE u.email = $1`, [email])).rows[0];
  userId = row.id; ws = row.ws;
  await pool.query(`UPDATE workspaces SET plan = 'free', trial_ends_at = now() - interval '1 day' WHERE id = $1`, [ws]);
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE id = $1', [userId]); await pool.end(); });

test('A2: paths that could never be opened are refused at creation', () => {
  for (const bad of ['wiki/e2e-100%.md', 'wiki/what?.md', 'wiki/a#b.md', 'wiki/%2e%2e/x.md', 'wiki/.md', 'wiki/sub/.md'])
    assert.throws(() => normalizePath(bad), /BAD_PATH|路徑不合法|Invalid path/, `${bad} 應被拒絕`);
  assert.equal(normalizePath('wiki/中文 標題 (1).md'), 'wiki/中文 標題 (1).md', '空格、括號、非 ASCII 仍可以——它們會被 encode，不會被截斷');
});

test('A2: a malformed percent-sequence in the URL gets a 400, not an Express HTML stack page', async () => {
  // Route params are decoded by the router after requireSession, so the API branch is only reachable signed in.
  const r = await api('/api/ingest/100%');
  assert.equal(r.status, 400);
  assert.match(r.headers.get('content-type') ?? '', /json/);
  assert.equal((await r.json()).error, 'BAD_PATH');
  const page = await fetch(base + '/n/wiki/100%.md');
  assert.equal(page.status, 400);
  const body = await page.text();
  assert.ok(!/URIError|Failed to decode|node_modules/.test(body), '不可洩漏堆疊');
  assert.ok(/<div id="root">|Malformed URL/.test(body), '回的是 app 外殼（或建置前的純文字），不是 Express 的錯誤頁');
});

test('A3: a run that never reached the model does not count toward the monthly gate', async () => {
  const limit = Number(process.env.FREE_RUNS_PER_MONTH ?? 20);
  // limit 個「第一個呼叫就失敗」的工作：0 token、failed
  for (let i = 0; i < limit; i++)
    await pool.query(`INSERT INTO ingest_jobs (workspace_id, user_id, paths, provider, model, status, tokens_in, tokens_out, error) VALUES ($1, $2, '{}', 'openrouter', 'x', 'failed', 0, 0, '401')`, [ws, userId]);
  let s = await planStatus(ws);
  assert.equal(s.runs_this_month, 0, '零 token 的失敗工作不算');
  assert.equal(s.can_run, true, 'Free 用戶 key 壞掉多點幾下不會把自己鎖到下個月');
  // 真的跑過模型的失敗工作才算
  await pool.query(`INSERT INTO ingest_jobs (workspace_id, user_id, paths, provider, model, status, tokens_in, tokens_out, error) VALUES ($1, $2, '{}', 'openrouter', 'x', 'failed', 1200, 30, 'mid-run')`, [ws, userId]);
  s = await planStatus(ws);
  assert.equal(s.runs_this_month, 1, '有花 token 的照算，失敗也一樣——否則就是後門');
  await pool.query('DELETE FROM ingest_jobs WHERE workspace_id = $1', [ws]);
});

test('A4: inputs that used to reach Postgres and come back as 500s are refused with a 4xx', async () => {
  await createNote(ws, 'wiki/ra-a4.md', '# a4\n', { kind: 'web', name: email });
  // if_version that JS calls an integer and Postgres does not
  let r = await api('/api/notes', { method: 'PUT', body: JSON.stringify({ path: 'wiki/ra-a4.md', content: '# a4 v2\n', version: 1, if_version: 1e308 }) });
  assert.equal(r.status, 400, `1e308 → ${r.status}`);
  // ids beyond bigint
  for (const path of ['/api/ingest/99999999999999999999', '/api/chat/99999999999999999999']) {
    r = await api(path); assert.equal(r.status, 400, `${path} → ${r.status}`);
  }
  // NUL in a search term
  r = await api('/api/search?q=%00'); assert.notEqual(r.status, 500, `q=%00 → ${r.status}`);
  // NUL in content
  r = await api('/api/notes', { method: 'POST', body: JSON.stringify({ path: 'wiki/ra-nul.md', content: 'a\u0000b' }) });
  assert.equal(r.status, 400);
  // a body over the JSON limit is the client's problem, not a server error
  r = await api('/api/notes', { method: 'POST', body: JSON.stringify({ path: 'wiki/ra-big.md', content: 'x'.repeat(3 * 1024 * 1024) }) });
  assert.equal(r.status, 413, `3 MB body → ${r.status}`);
  assert.equal((await r.json()).error, 'TOO_LARGE');
});
