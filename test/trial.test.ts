import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { claimTrialRun, noKeyError, planStatus, refundTrialRun, trialRunConfig, TRIAL_FREE_RUNS } from '../src/plans.js';
import { startIngest } from '../src/ingest.js';
import { createNote } from '../src/notes.js';

/* The trial's keyless runs. There are only ten, so what matters is that one is spent when work actually starts and
   not when a click is refused, and that the three ways of running out read differently to the person. */
let ws = '', userId = '';
const used = async () => Number((await pool.query<{ n: number }>(
  `SELECT trial_runs_used AS n FROM workspaces WHERE id = $1`, [ws])).rows[0].n);
const setTrial = (days: number) => pool.query(
  `UPDATE workspaces SET trial_ends_at = now() + ($2 || ' days')::interval WHERE id = $1`, [ws, String(days)]);

before(async () => {
  await migrate();
  process.env.PLATFORM_OPENROUTER_KEY = 'sk-test-platform-key';
  userId = `tr-user-${randomBytes(4).toString('hex')}`;
  ws = `tr-ws-${randomBytes(4).toString('hex')}`;
  await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
                    VALUES ($1, 'tr', $2, true, now(), now())`, [userId, `${userId}@example.com`]);
  await pool.query(`INSERT INTO workspaces (id, owner_user_id, name, trial_ends_at) VALUES ($1, $2, 'tr', now() + interval '14 days')`, [ws, userId]);
});
after(async () => {
  delete process.env.PLATFORM_OPENROUTER_KEY;
  await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
  await pool.end();
});

test('asking which key a run would use does not spend one', async () => {
  const before_ = await used();
  assert.ok(await trialRunConfig(ws), '體驗中且平台有 key，可以用免 key 的額度');
  assert.ok(await trialRunConfig(ws));
  assert.equal(await used(), before_, '只是查詢，不扣次數');

  assert.equal(await claimTrialRun(ws), true, '真的要跑才扣');
  assert.equal(await used(), before_ + 1);
  await refundTrialRun(ws);
  assert.equal(await used(), before_, '退還回到原點');
});

test('a run that is refused before it starts costs nothing', async () => {
  const before_ = await used();
  // 沒有任何待編纂來源 → startIngest 會拒絕；這一次點擊不該花掉額度
  await assert.rejects(startIngest(ws, userId), /沒有待編纂的來源|No sources are pending/);
  assert.equal(await used(), before_, '被拒絕的點擊不扣次數');
});

test('running out stops at the limit and never goes negative', async () => {
  await pool.query(`UPDATE workspaces SET trial_runs_used = $2 WHERE id = $1`, [ws, TRIAL_FREE_RUNS - 1]);
  assert.equal(await claimTrialRun(ws), true, '最後一次可以用');
  assert.equal(await claimTrialRun(ws), false, '用完就不給了');
  assert.equal(await used(), TRIAL_FREE_RUNS, '不會超扣');
  assert.equal(await trialRunConfig(ws), null, '用完之後不再提供平台 key');

  await pool.query(`UPDATE workspaces SET trial_runs_used = 0 WHERE id = $1`, [ws]);
  await refundTrialRun(ws);
  assert.equal(await used(), 0, '退還不會退成負數');
});

test('the three ways of running out say different things', async () => {
  await pool.query(`UPDATE workspaces SET trial_runs_used = $2 WHERE id = $1`, [ws, TRIAL_FREE_RUNS]);
  await setTrial(7);
  assert.match((await noKeyError(ws)).localized('zh-TW'), /次數已用完/, '體驗中但次數用完');

  await pool.query(`UPDATE workspaces SET trial_runs_used = 0 WHERE id = $1`, [ws]);
  await setTrial(-1);
  assert.match((await noKeyError(ws)).localized('zh-TW'), /體驗期已結束/, '次數還在但期限到了，不能說「次數用完」');
  assert.equal(await trialRunConfig(ws), null, '期限到了就不給平台 key');

  const saved = process.env.PLATFORM_OPENROUTER_KEY;
  delete process.env.PLATFORM_OPENROUTER_KEY;
  assert.match((await noKeyError(ws)).localized('zh-TW'), /尚未設定/, '平台根本沒 key 時是另一回事');
  process.env.PLATFORM_OPENROUTER_KEY = saved;

  await setTrial(14);
});

test('an expired trial falls back to Free, keeping its notes', async () => {
  await createNote(ws, 'wiki/kept.md', '# 體驗期結束後仍在\n', { kind: 'web', name: 'test' });
  await setTrial(-1);
  const s = await planStatus(ws);
  assert.equal(s.trial_active, false);
  assert.equal(s.effective, 'free', '自動變成 Free');
  assert.equal(s.runs_limit, Number(process.env.FREE_RUNS_PER_MONTH ?? 20), 'Free 有每月上限');
  assert.ok(s.notes_used >= 1, '資料不會因為體驗結束而消失');
  await setTrial(14);
});
