import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createNote, searchNotes, searchTerms, updateNote, NoteError } from '../src/notes.js';
import { agentSteps, makeExec, writtenPaths } from '../src/ingest.js';
import type { AgentEvent } from '../src/ai/providers.js';

/* Three ways a real ingest run failed silently: the agent called update_note on a page that did not exist and read
   NOT_FOUND as a refusal, its English search found nothing in a Chinese-titled wiki, and the panel reported both as
   done. These cover the parts a test can hold still — what the tools say back, and how the log reads as pairs. */
let ws = '', userId = '';
const actor = { kind: 'agent' as const, name: 'test/model' };

before(async () => {
  await migrate();
  userId = `af-user-${randomBytes(4).toString('hex')}`;
  ws = `af-ws-${randomBytes(4).toString('hex')}`;
  await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, 'af', $2, true, now(), now())`, [userId, `${userId}@example.com`]);
  await pool.query(`INSERT INTO workspaces (id, owner_user_id, name) VALUES ($1, $2, 'af')`, [ws, userId]);
});
after(async () => { await pool.query('DELETE FROM "user" WHERE id = $1', [userId]); await pool.end(); });

test('update_note on a page that does not exist tells the agent to create it', async () => {
  await assert.rejects(
    () => updateNote(ws, 'wiki/concepts/沒有這一頁.md', '內容', 1, actor),
    (e: NoteError) => {
      assert.equal(e.code, 'NOT_FOUND');
      assert.match(e.localized('zh-TW'), /create_note/, '訊息要指出改用 create_note');
      assert.match(e.localized('en'), /create_note/);
      return true;
    },
  );
});

test('search matches every term separately, so word order and extra words do not lose the page', async () => {
  assert.deepEqual(searchTerms('Unconventional Water Resources'), ['Unconventional', 'Water', 'Resources']);
  assert.deepEqual(searchTerms('"water resources" desalination'), ['water resources', 'desalination']);
  assert.deepEqual(searchTerms('永續水資源管理'), ['永續水資源管理'], '中文沒有空格，維持單一詞');

  await createNote(ws, 'wiki/concepts/desal.md', '# Desalination\n\nUnconventional supply.\n\nWater in the Gulf. Renewable resources are scarce.\n', actor);
  const hits = await searchNotes(ws, { query: 'unconventional water resources', limit: 10 });
  assert.deepEqual(hits.map(h => h.path), ['wiki/concepts/desal.md'], '三個詞分散在不同句子也要找得到');
  assert.equal((await searchNotes(ws, { query: 'unconventional desalination missing-term', limit: 10 })).length, 0, '缺一個詞就不算命中');
  assert.equal((await searchNotes(ws, { query: '"Unconventional supply"', limit: 10 })).length, 1, '引號內維持整句比對');
  assert.equal((await searchNotes(ws, { query: '"supply unconventional"', limit: 10 })).length, 0);
});

test('a search that finds nothing says so in a way the agent can act on', async () => {
  const exec = makeExec(ws, actor);
  const miss = JSON.parse(await exec('search_notes', { query: 'nothing here at all' }));
  assert.deepEqual(miss.hits, []);
  assert.match(miss.hint, /index\.md/, '零命中要提示去讀目錄');
  const hit = JSON.parse(await exec('search_notes', { query: 'Desalination' }));
  assert.equal(hit.hits.length, 1);
  assert.equal(hit.hint, undefined, '有命中就不要多嘴');
});

test('the log reads as pairs: a refused write is not a written page', async () => {
  const exec = makeExec(ws, actor);
  const refused = await exec('update_note', { path: 'wiki/concepts/still-missing.md', content: 'x', if_version: 1 });
  assert.match(refused, /NOT_FOUND/);
  const log: AgentEvent[] = [
    { type: 'tool', tool: 'create_note', input: { path: 'wiki/sources/a.md' } },
    { type: 'result', tool: 'create_note', output: JSON.stringify({ created: true, version: 1 }) },
    { type: 'tool', tool: 'update_note', input: { path: 'wiki/concepts/still-missing.md' } },
    { type: 'result', tool: 'update_note', output: refused },
    { type: 'tool', tool: 'update_note', input: { path: 'wiki/index.md' } },
    { type: 'result', tool: 'update_note', output: JSON.stringify({ updated: true, version: 2 }) },
  ];
  const steps = agentSteps(log);
  assert.deepEqual(steps.map(s => s.failed), [false, true, false]);
  assert.match(steps[1].error!, /create_note/, '失敗的那一步要留下原因');
  assert.deepEqual(writtenPaths(log), ['wiki/sources/a.md', 'wiki/index.md'], '被拒絕的頁不算寫出來');
});

test('the researcher template no longer ships a citation nobody can follow', () => {
  const rules = readFileSync('templates/researcher/zh-TW/schema/researcher.md', 'utf8');
  const bare = rules.split('\n').filter(l => /\[@/.test(l.replace(/`[^`]*`/g, '')));
  assert.deepEqual(bare, [], '示範引用要包在反引號裡，否則每次健檢都報一條斷連結');
});
