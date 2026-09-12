import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { FREE_RUNS, TRIAL_FREE_RUNS, claimTrialRun, planStatus, trialRunConfig } from '../src/plans.js';
import { purgeOldVersions } from '../src/retention.js';
process.env.FREE_NOTES_LIMIT = '3'; process.env.FREE_STORAGE_BYTES = '600'; process.env.FREE_TOKENS_LIMIT = '1'; process.env.BILLING_WEBHOOK_SECRET = 'whsec-test';

// Decision 17: 14-day Pro trial -> Free with 20 agent jobs/month -> Pro unlimited; the first 5 runs during the trial may use the platform key.
const email = `plan-${randomBytes(4).toString('hex')}@example.com`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', wsId = '', userId = '';
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'plan' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  const me = (await api('GET', '/api/me')).data; wsId = me.workspace.id; userId = me.user.id;
});
after(async () => { server.close(); delete process.env.PLATFORM_OPENROUTER_KEY; await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('new workspace: 14-day Pro trial, unlimited runs; key-free quota is 0 without a platform key', async () => {
  delete process.env.PLATFORM_OPENROUTER_KEY;
  const p = (await api('GET', '/api/plan')).data;
  assert.equal(p.plan, 'free'); assert.equal(p.trial_active, true); assert.ok(p.trial_days_left >= 13 && p.trial_days_left <= 14); assert.equal(p.runs_limit, null); assert.equal(p.can_run, true); assert.equal(p.trial_runs_free, 0);
  assert.equal(await trialRunConfig(wsId), null);
  // during the trial, no key, no platform key -> ingest is blocked by "please enter a key", not by the plan
  const r = await api('POST', '/api/ingest', {});
  assert.equal(r.status, 403); assert.match(r.data.message, /尚未設定 AI 供應商/);
});

test('with platform key: N trial runs on the platform config, counted when claimed, then null', async () => {
  process.env.PLATFORM_OPENROUTER_KEY = 'sk-or-platform-test';
  for (let i = 1; i <= TRIAL_FREE_RUNS; i++) {
    const c = await trialRunConfig(wsId);
    assert.ok(c && c.trial && c.provider === 'openrouter' && c.apiKey === 'sk-or-platform-test', `run ${i} should get the platform config`);
    assert.equal(await claimTrialRun(wsId), true, `run ${i} should be claimable`);   // offering and charging are separate
    assert.equal((await planStatus(wsId)).trial_runs_used, i);
  }
  assert.equal(await trialRunConfig(wsId), null);
  const p = (await api('GET', '/api/plan')).data; assert.equal(p.trial_runs_free, TRIAL_FREE_RUNS); assert.equal(p.trial_runs_used, TRIAL_FREE_RUNS);
  const r = await api('POST', '/api/ingest', {}); assert.equal(r.status, 403); assert.match(r.data.message, /次數已用完/);
});

test('trial over -> Free monthly cap; 403 with explanation when full; Pro unlimited', async () => {
  await pool.query(`UPDATE workspaces SET trial_ends_at = now() - interval '1 day' WHERE id = $1`, [wsId]);
  let p = (await api('GET', '/api/plan')).data; assert.equal(p.trial_active, false); assert.equal(p.runs_limit, FREE_RUNS); assert.equal(p.can_run, true);
  const vals = Array.from({ length: FREE_RUNS }, (_, i) => `('${wsId}', '${userId}', '{}', 'openrouter', 'x', 'done', now() - interval '${i} minutes')`).join(',');
  await pool.query(`INSERT INTO ingest_jobs (workspace_id, user_id, paths, provider, model, status, created_at) VALUES ${vals}`);
  p = (await api('GET', '/api/plan')).data; assert.equal(p.runs_this_month, FREE_RUNS); assert.equal(p.can_run, false);
  const r = await api('POST', '/api/ingest', {}); assert.equal(r.status, 403); assert.match(r.data.message, new RegExp(`每月 ${FREE_RUNS} 次 agent 工作已用完`));
  const chat = await api('POST', '/api/chat', {}); const sid = chat.data?.session?.id ?? chat.data?.id;
  if (sid) { const m = await api('POST', `/api/chat/${sid}/messages`, { text: 'hi' }); assert.equal(m.status, 403); }
  await pool.query(`UPDATE workspaces SET plan = 'pro' WHERE id = $1`, [wsId]);
  p = (await api('GET', '/api/plan')).data; assert.equal(p.plan, 'pro'); assert.equal(p.runs_limit, null); assert.equal(p.can_run, true);
});

test('content limits: Free blocks the 4th note and growth past storage; shrinking edits, reads and archiving still work; Pro lifts limits', async () => {
  await pool.query(`UPDATE workspaces SET plan = 'free', trial_ends_at = now() - interval '1 day' WHERE id = $1`, [wsId]);
  await pool.query(`DELETE FROM ingest_jobs WHERE workspace_id = $1`, [wsId]);
  const p0 = (await api('GET', '/api/plan')).data; assert.equal(p0.effective, 'free'); assert.equal(p0.notes_limit, 3); assert.equal(p0.bytes_limit, 600); assert.equal(p0.tokens_limit, 1); assert.equal(p0.retention_days, 7);
  for (let i = 1; i <= 3; i++) assert.equal((await api('POST', '/api/notes', { path: `wiki/n${i}.md`, content: `# n${i}\n\nx` })).status, 201);
  const fourth = await api('POST', '/api/notes', { path: 'wiki/n4.md', content: '# n4' });
  assert.equal(fourth.status, 403); assert.match(fourth.data.message, /筆記上限（3 則）/);
  const big = await api('PUT', '/api/notes', { path: 'wiki/n1.md', content: '# n1\n\n' + 'y'.repeat(700), if_version: 1 });
  assert.equal(big.status, 403); assert.match(big.data.message, /容量上限/);
  assert.equal((await api('PUT', '/api/notes', { path: 'wiki/n1.md', content: '# n1', if_version: 1 })).status, 200, 'shrinking is fine');
  assert.equal((await api('GET', '/api/notes?path=wiki/n1.md')).status, 200);
  // token limit: one active PAT on Free
  assert.equal((await api('POST', '/api/tokens', { label: 'a' })).status, 201);
  const second = await api('POST', '/api/tokens', { label: 'b' }); assert.equal(second.status, 403); assert.match(second.data.message, /1 把/);
  await pool.query(`UPDATE workspaces SET plan = 'pro' WHERE id = $1`, [wsId]);
  assert.equal((await api('POST', '/api/notes', { path: 'wiki/n4.md', content: '# n4' })).status, 201);
  assert.equal((await api('POST', '/api/tokens', { label: 'b' })).status, 201);
  await pool.query(`UPDATE workspaces SET plan = 'free' WHERE id = $1`, [wsId]);
});

test('retention by plan: Free purges snapshots older than 7 days, Pro keeps 90', async () => {
  await pool.query(`UPDATE workspaces SET plan = 'pro' WHERE id = $1`, [wsId]); // Pro first: the Free note limit from the previous test is already reached
  assert.equal((await api('POST', '/api/notes', { path: 'wiki/r.md', content: '# r v1' })).status, 201);
  const cur = (await api('GET', '/api/notes?path=wiki/r.md')).data;
  await api('PUT', '/api/notes', { path: 'wiki/r.md', content: '# r v2', if_version: cur.version });
  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM notes WHERE workspace_id = $1 AND path = 'wiki/r.md'`, [wsId]);
  await pool.query(`UPDATE note_versions SET created_at = now() - interval '30 days' WHERE note_id = $1 AND version = $2`, [rows[0].id, cur.version]);
  await purgeOldVersions();
  let n = await pool.query(`SELECT count(*) FROM note_versions WHERE note_id = $1`, [rows[0].id]); assert.equal(Number(n.rows[0].count), 2, 'Pro keeps a 30-day-old snapshot');
  await pool.query(`UPDATE workspaces SET plan = 'free' WHERE id = $1`, [wsId]);
  await purgeOldVersions();
  n = await pool.query(`SELECT count(*) FROM note_versions WHERE note_id = $1`, [rows[0].id]); assert.equal(Number(n.rows[0].count), 1, 'Free drops it after 7 days; current version stays');
});

test('billing webhook: bad secret 401, unknown status 400, active → pro, canceled → free; GET /api/billing shows it', async () => {
  const hook = (body: unknown, secret = 'whsec-test') => fetch(base + '/api/billing/webhook/manual', { method: 'POST', headers: { 'content-type': 'application/json', 'x-wikibrain-billing-secret': secret }, body: JSON.stringify(body) });
  assert.equal((await hook({ workspace_id: wsId, status: 'active' }, 'nope')).status, 401);
  assert.equal((await hook({ workspace_id: wsId, status: 'weird' })).status, 400);
  assert.equal((await hook({ workspace_id: wsId, status: 'active', provider_subscription_id: 'sub_1', current_period_end: '2030-01-01T00:00:00Z' })).status, 200);
  assert.equal((await api('GET', '/api/plan')).data.plan, 'pro');
  const b = (await api('GET', '/api/billing')).data.subscription; assert.equal(b.status, 'active'); assert.equal(b.provider_subscription_id, 'sub_1');
  assert.equal((await hook({ workspace_id: wsId, status: 'canceled' })).status, 200);
  assert.equal((await api('GET', '/api/plan')).data.plan, 'free');
});

