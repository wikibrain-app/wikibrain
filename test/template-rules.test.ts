import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createNote, listVersions, readNote, updateNote } from '../src/notes.js';
import { applyTemplate, pendingRuleUpdates, updateRules } from '../src/templates.js';

/* Shipping better rules to a workspace that already has the old ones.
   The rule that matters: a page the user edited is never overwritten, and one they never touched can be replaced
   safely because we recorded exactly what we delivered. */
const actor = { kind: 'system' as const, name: 'test' };
let ws = '', userId = '';

before(async () => {
  await migrate();
  userId = `tpl-user-${randomBytes(4).toString('hex')}`;
  ws = `tpl-ws-${randomBytes(4).toString('hex')}`;
  await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
                    VALUES ($1, 'tpl', $2, true, now(), now())`, [userId, `${userId}@example.com`]);
  await pool.query(`INSERT INTO workspaces (id, owner_user_id, name) VALUES ($1, $2, 'tpl')`, [ws, userId]);
});
after(async () => {
  await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
  await pool.end();
});

test('an untouched rule page can be updated; an edited one is kept and only reported', async () => {
  // A template that ships one rule page, applied at version 1.
  const root = await mkdtemp(join(tmpdir(), 'tpl-'));
  const dir = join(root, 'demo', 'zh-TW', 'schema');
  await mkdir(dir, { recursive: true });
  await writeFile(join(root, 'demo', 'template.json'), JSON.stringify({
    id: 'demo', version: 1, name: { 'zh-TW': '示範', en: 'Demo' },
    description: { 'zh-TW': 'd', en: 'd' }, prompt: { 'zh-TW': 'p', en: 'p' },
  }));
  await writeFile(join(dir, 'demo-rules.md'), '# 規則 v1\n\n第一版。\n');
  await writeFile(join(dir, 'demo-style.md'), '# 用語 v1\n\n第一版。\n');

  process.env.TEMPLATES_DIR = root;                       // point the module at the fixture
  await applyTemplate(ws, 'demo', 'zh-TW', actor);

  assert.deepEqual(await pendingRuleUpdates(ws), [], '版本相同時沒有待更新');

  // The user edits one of the two pages, then a better version ships.
  const styled = await readNote(ws, 'schema/demo-style.md');
  await updateNote(ws, 'schema/demo-style.md', '# 用語 v1\n\n我自己改過的規則。\n', styled.version, actor);
  await writeFile(join(root, 'demo', 'template.json'), JSON.stringify({
    id: 'demo', version: 2, name: { 'zh-TW': '示範', en: 'Demo' },
    description: { 'zh-TW': 'd', en: 'd' }, prompt: { 'zh-TW': 'p', en: 'p' },
  }));
  await writeFile(join(dir, 'demo-rules.md'), '# 規則 v2\n\n第二版，補了三層說明。\n');
  await writeFile(join(dir, 'demo-style.md'), '# 用語 v2\n\n第二版。\n');

  const updates = await pendingRuleUpdates(ws);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].appliedVersion, 1);
  assert.equal(updates[0].currentVersion, 2);
  const byPath = Object.fromEntries(updates[0].pages.map(p => [p.path, p]));
  assert.equal(byPath['schema/demo-rules.md'].state, 'untouched', '沒動過的頁可以安全更新');
  assert.equal(byPath['schema/demo-style.md'].state, 'edited', '同一段兩邊都改過，判定衝突，不自動合併');
  assert.match(byPath['schema/demo-rules.md'].next, /第二版/);

  const res = await updateRules(ws, 'demo', actor);
  assert.deepEqual(res.updated, ['schema/demo-rules.md']);
  assert.deepEqual(res.kept, ['schema/demo-style.md']);

  assert.match((await readNote(ws, 'schema/demo-rules.md')).content_md, /規則 v2/, '沒動過的頁已換成新版');
  assert.match((await readNote(ws, 'schema/demo-style.md')).content_md, /我自己改過的規則/, '改過的頁一個字都沒變');

  // Version is recorded, so the same update is not offered twice; the edited page is still reported as different.
  // 還有一頁沒處理，所以版本不前進，提示仍在，但只剩那一頁
  const after2 = await pendingRuleUpdates(ws);
  assert.equal(after2.length, 1);
  assert.deepEqual(after2[0].pages.map(p => p.path), ['schema/demo-style.md']);

  // 明確選擇覆蓋：舊內容留在版本歷史裡，可以復原
  const forced = await updateRules(ws, 'demo', actor, 'overwrite');
  assert.deepEqual(forced.overwritten, ['schema/demo-style.md']);
  assert.match((await readNote(ws, 'schema/demo-style.md')).content_md, /用語 v2/);
  const history = await listVersions(ws, 'schema/demo-style.md');
  assert.ok(history.some(v => v.content_md.includes('我自己改過的規則')), '被覆蓋的內容還在版本歷史裡');
  assert.deepEqual(await pendingRuleUpdates(ws), [], '全部處理完就不再提示');

  delete process.env.TEMPLATES_DIR;
  await rm(root, { recursive: true, force: true });
});

test('a workspace that never had a template applied is never asked to update', async () => {
  const other = `tpl-ws2-${randomBytes(4).toString('hex')}`;
  await pool.query(`INSERT INTO workspaces (id, owner_user_id, name) VALUES ($1, $2, 'own')`, [other, userId]);
  await createNote(other, 'schema/instructions.md', '# 我自己寫的規則\n', actor);
  assert.deepEqual(await pendingRuleUpdates(other), []);
});

test('edits in a different section are merged, keeping both sides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tpl2-'));
  const dir = join(root, 'demo2', 'zh-TW', 'schema');
  await mkdir(dir, { recursive: true });
  const json = (v: number) => JSON.stringify({ id: 'demo2', version: v, name: { 'zh-TW': '示範2', en: 'Demo2' }, description: { 'zh-TW': 'd', en: 'd' }, prompt: { 'zh-TW': 'p', en: 'p' } });
  await writeFile(join(root, 'demo2', 'template.json'), json(1));
  await writeFile(join(dir, 'r.md'), '# 規則\n\n## 三層\n\nraw 唯讀。\n\n## 用語\n\n一律用繁體。\n');

  process.env.TEMPLATES_DIR = root;
  const ws2 = `tpl-ws3-${randomBytes(4).toString('hex')}`;
  await pool.query(`INSERT INTO workspaces (id, owner_user_id, name) VALUES ($1, $2, 'm')`, [ws2, userId]);
  await applyTemplate(ws2, 'demo2', 'zh-TW', actor);

  // 使用者改「用語」那段，新版改「三層」那段
  const n = await readNote(ws2, 'schema/r.md');
  await updateNote(ws2, 'schema/r.md', '# 規則\n\n## 三層\n\nraw 唯讀。\n\n## 用語\n\n一律用繁體，專有名詞保留英文。\n', n.version, actor);
  await writeFile(join(root, 'demo2', 'template.json'), json(2));
  await writeFile(join(dir, 'r.md'), '# 規則\n\n## 三層\n\nraw 唯讀，只能封存不能刪除。\n\n## 用語\n\n一律用繁體。\n');

  const [u] = await pendingRuleUpdates(ws2);
  assert.equal(u.pages[0].state, 'merged', '改的是不同段落，可以自動合併');

  const res = await updateRules(ws2, 'demo2', actor);
  assert.deepEqual(res.merged, ['schema/r.md']);
  const after = (await readNote(ws2, 'schema/r.md')).content_md;
  assert.match(after, /只能封存不能刪除/, '新版的修改進來了');
  assert.match(after, /專有名詞保留英文/, '使用者的修改也留著');

  delete process.env.TEMPLATES_DIR;
  await rm(root, { recursive: true, force: true });
});
