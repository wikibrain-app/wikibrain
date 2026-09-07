import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { registerRunner, setPriceTableForTest, type RunOptions } from '../src/ai/providers.js';
import { waitForJob } from '../src/ingest.js';

// Chat (Query): message persistence, history passed to the agent, answers with tool trace and cost, archiving to a wiki page, failure written back.
const email = `chat-${randomBytes(4).toString('hex')}@example.com`;
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
  await auth.api.signUpEmail({ body: { email, password, name: 'chat' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  wsId = (await api('GET', '/api/me')).data.workspace.id;
  await api('POST', '/api/notes', { path: 'wiki/index.md', content: '# 目錄\n\n- [[concepts/kappa]]：一致性指標' });
  await api('POST', '/api/notes', { path: 'wiki/concepts/kappa.md', content: '# Cohen kappa\n\n標註一致性指標，0.81 屬高度一致。' });
  setPriceTableForTest(new Map([['anthropic/claude-opus-5', { input: 5, output: 25 }]]));
});
after(async () => {
  server.close();
  setPriceTableForTest(null);
  await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
  await pool.end();
});

test('sending a message without key → 403; create session and list', async () => {
  const s = await api('POST', '/api/chat', {});
  assert.equal(s.status, 201); assert.equal(s.data.session.title, '新對話');
  assert.equal((await api('POST', `/api/chat/${s.data.session.id}/messages`, { text: 'hi' })).status, 403);
  assert.equal((await api('POST', `/api/chat/${s.data.session.id}/messages`, { text: '' })).status, 400, 'empty message rejected first');
  assert.equal((await api('GET', '/api/chat')).data.sessions.length, 1);
});

test('Q&A: agent answers via index and read_note; second turn carries history; answer includes tool trace and cost; filed as wiki/queries page', async () => {
  await api('PUT', '/api/ai', { provider: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-test-key-0001' });
  const seenHistory: any[] = [];
  registerRunner('anthropic', async (o: RunOptions) => {
    seenHistory.push(o.history ?? []);
    assert.match(o.system, /Query/);
    const call = async (n: string, i: Record<string, unknown>) => { o.onEvent({ type: 'tool', tool: n, input: i }); const out = await o.exec(n, i); o.onEvent({ type: 'result', tool: n, output: out }); return out; };
    await call('get_instructions', {});
    const idx = JSON.parse(await call('read_note', { path: 'wiki/index.md' }));
    assert.match(idx.content, /kappa/);
    const page = JSON.parse(await call('read_note', { path: 'wiki/concepts/kappa.md' }));
    o.onEvent({ type: 'usage', tokens_in: 800, tokens_out: 120 });
    const text = o.user.includes('第二題') ? '第二題的回答（我記得你剛問過 kappa）。' : `kappa 是標註一致性指標，0.81 屬高度一致。見 wiki/concepts/kappa.md。（${page.title}）`;
    o.onEvent({ type: 'text', text });
    return { steps: 3, tokens_in: 800, tokens_out: 120, finalText: text };
  });
  const s = (await api('POST', '/api/chat', {})).data.session;
  const sent = await api('POST', `/api/chat/${s.id}/messages`, { text: '這座庫對 kappa 有什麼結論？' });
  assert.equal(sent.status, 202); assert.equal(sent.data.session.messages.length, 1); assert.equal(sent.data.session.title, '這座庫對 kappa 有什麼結論？');
  const job = await waitForJob(wsId, sent.data.job.id);
  assert.equal(job!.status, 'done', job!.error ?? ''); assert.equal(job!.kind, 'chat');
  await new Promise(r => setTimeout(r, 300));
  let sess = (await api('GET', `/api/chat/${s.id}`)).data.session;
  assert.equal(sess.messages.length, 2);
  const a = sess.messages[1];
  assert.equal(a.role, 'assistant'); assert.match(a.content, /wiki\/concepts\/kappa\.md/);
  assert.deepEqual(a.tools.map((t: any) => t.tool), ['get_instructions', 'read_note', 'read_note']);
  assert.equal(a.tokens_in, 800); assert.ok(Math.abs(a.cost_usd - (800 / 1e6 * 5 + 120 / 1e6 * 25)) < 1e-9);
  assert.deepEqual(seenHistory[0], [], 'first turn has no history');

  const sent2 = await api('POST', `/api/chat/${s.id}/messages`, { text: '第二題：再解釋一次' });
  await waitForJob(wsId, sent2.data.job.id); await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(seenHistory[1].map((h: any) => h.role), ['user', 'assistant'], 'second turn must carry the previous exchange');
  sess = (await api('GET', `/api/chat/${s.id}`)).data.session;
  assert.equal(sess.messages.length, 4);

  const filed = await api('POST', `/api/chat/${s.id}/file`, { index: 1 });
  assert.equal(filed.status, 201); assert.match(filed.data.path, /^wiki\/queries\//);
  const note = await api('GET', `/api/notes?path=${encodeURIComponent(filed.data.path)}`);
  assert.match(note.data.content, /source_type: query/); assert.match(note.data.content, /問：這座庫對 kappa/); assert.match(note.data.content, /高度一致/);
  sess = (await api('GET', `/api/chat/${s.id}`)).data.session;
  assert.equal(sess.messages[1].filedTo, filed.data.path);
  assert.equal((await api('POST', `/api/chat/${s.id}/file`, { index: 0 })).status, 400, 'only answers can be filed');
  assert.equal((await api('GET', '/api/ingest')).data.jobs.length, 0, 'chat jobs do not appear in the ingest list');
});

test('agent failure is written back as a message', async () => {
  registerRunner('anthropic', async () => { throw new Error('model exploded'); });
  const s = (await api('POST', '/api/chat', {})).data.session;
  const sent = await api('POST', `/api/chat/${s.id}/messages`, { text: '會失敗的問題' });
  const job = await waitForJob(wsId, sent.data.job.id);
  assert.equal(job!.status, 'failed');
  await new Promise(r => setTimeout(r, 1500));
  const sess = (await api('GET', `/api/chat/${s.id}`)).data.session;
  assert.equal(sess.messages.length, 2); assert.match(sess.messages[1].content, /執行失敗：model exploded/);
  registerRunner('anthropic', undefined);
  assert.equal((await api('DELETE', `/api/chat/${s.id}`)).data.deleted, true);
});
