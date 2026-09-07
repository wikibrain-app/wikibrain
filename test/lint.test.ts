import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { registerRunner, type RunOptions } from '../src/ai/providers.js';
import { waitForJob } from '../src/ingest.js';
import { lintWorkspace, lintSummary } from '../src/lint.js';

// Lint: deterministic checks (orphans, broken links, not indexed, pending ingest, log format, missing special pages) and the agent health-check job.
const email = `lint-${randomBytes(4).toString('hex')}@example.com`;
const password = 'correct-horse-battery';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', wsId = '';
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password, name: 'lint' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  wsId = (await api('GET', '/api/me')).data.workspace.id;
});
after(async () => {
  server.close();
  await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
  await pool.end();
});

test('empty workspace: index/log missing', async () => {
  const r = await api('GET', '/api/lint');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.report.missing_special, ['wiki/index.md', 'wiki/log.md']);
  assert.match(r.data.summary, /缺特殊頁 2/);
});

test('structural checks: orphans, dangling links, not indexed, pending, log format', async () => {
  await api('POST', '/api/import', { kind: 'text', text: '來源 A\n\n內容' });
  await api('POST', '/api/notes', { path: 'wiki/index.md', content: '# 目錄\n\n- [[concepts/kappa]]' });
  await api('POST', '/api/notes', { path: 'wiki/log.md', content: '# 紀錄\n\n## [2026-09-04] ingest | 來源 A\n\n## 沒有日期的條目' });
  await api('POST', '/api/notes', { path: 'wiki/concepts/kappa.md', content: '# kappa\n\n見 [[不存在的頁]] 與 [[orphan]]。' });
  await api('POST', '/api/notes', { path: 'wiki/orphan.md', content: '# 孤兒\n\n沒人連我。' });   // linked from kappa -> not an orphan
  await api('POST', '/api/notes', { path: 'wiki/lonely.md', content: '# 真孤兒' });
  await api('POST', '/api/notes', { path: 'wiki/concepts/README.md', content: '# 索引' });    // README counts as neither orphan nor unindexed
  const r = await lintWorkspace(wsId);
  assert.deepEqual(r.missing_special, []);
  assert.deepEqual(r.orphans.map(o => o.path), ['wiki/lonely.md']);
  assert.deepEqual(r.dangling, [{ from: 'wiki/concepts/kappa.md', target: '不存在的頁' }]);
  assert.deepEqual(r.not_in_index.map(x => x.path).sort(), ['wiki/lonely.md', 'wiki/orphan.md']);
  assert.equal(r.pending_sources.length, 1);
  assert.equal(r.log_issues.length, 1); assert.match(r.log_issues[0], /1 條/);
  assert.equal(r.counts.wiki_pages, 6);
  assert.match(lintSummary(r), /孤兒頁 1、斷連結 1、未進目錄 2、待編纂來源 1、log 格式 1/);
  const viaApi = await api('GET', '/api/lint');
  assert.match(viaApi.data.prompt, /wiki\/lonely\.md/); assert.match(viaApi.data.prompt, /\[\[不存在的頁\]\]/); assert.match(viaApi.data.prompt, /wiki\/lint\/\d{4}-\d{2}-\d{2}\.md/);
});

test('agent health-check job: mock runner receives structural results, writes report page and log; 403 without key', async () => {
  assert.equal((await api('POST', '/api/lint/run', {})).status, 403);
  await api('PUT', '/api/ai', { provider: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-test-lint' });
  registerRunner('anthropic', async (o: RunOptions) => {
    assert.match(o.system, /Lint/); assert.match(o.user, /孤兒頁/); assert.match(o.user, /wiki\/lonely\.md/);
    const call = async (n: string, i: Record<string, unknown>) => { o.onEvent({ type: 'tool', tool: n, input: i }); return o.exec(n, i); };
    await call('get_instructions', {});
    const idx = JSON.parse(await call('read_note', { path: 'wiki/index.md' }));
    await call('update_note', { path: 'wiki/index.md', content: idx.content + '\n- [[lonely]]', if_version: idx.version });
    const date = new Date().toISOString().slice(0, 10);
    await call('create_note', { path: `wiki/lint/${date}.md`, content: `# 健檢 ${date}\n\n已把 lonely 加進目錄。` });
    const log = JSON.parse(await call('read_note', { path: 'wiki/log.md' }));
    await call('update_note', { path: 'wiki/log.md', content: log.content + `\n\n## [${date}] lint | 健檢`, if_version: log.version });
    o.onEvent({ type: 'usage', tokens_in: 500, tokens_out: 100 });
    return { steps: 5, tokens_in: 500, tokens_out: 100, finalText: '健檢完成' };
  });
  const run = await api('POST', '/api/lint/run', {});
  assert.equal(run.status, 202); assert.equal(run.data.job.kind, 'lint');
  const job = await waitForJob(wsId, run.data.job.id);
  assert.equal(job!.status, 'done', job!.error ?? '');
  const r = await lintWorkspace(wsId);
  assert.deepEqual(r.not_in_index.map(x => x.path), ['wiki/orphan.md'], 'lonely is now indexed');
  assert.ok((await api('GET', '/api/notes/tree')).data.notes.some((n: any) => n.path.startsWith('wiki/lint/')));
  registerRunner('anthropic', undefined);
});
