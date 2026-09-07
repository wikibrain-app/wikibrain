import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { hashToken } from '../src/auth.js';

// End to end against real Postgres: a dedicated workspace, cleaned up at the end.
const ws = `test-${randomBytes(4).toString('hex')}`;
const user = `${ws}-user`;
const token = `wb_test_${randomBytes(16).toString('hex')}`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let url: string;

async function connect(bearer: string) {
  const client = new Client({ name: 'test', version: '0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  await client.connect(transport);
  return client;
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = await c.callTool({ name, arguments: args });
  const txt = (r.content as { type: string; text: string }[])[0].text;
  let data: any = txt;
  try { data = JSON.parse(txt); } catch { /* plain text */ }
  return { isError: !!r.isError, data };
};

before(async () => {
  await migrate();
  await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'test', $2, true)`, [user, `${user}@example.com`]);
  await pool.query(`INSERT INTO workspaces (id, owner_user_id, name) VALUES ($1, $2, 'test')`, [ws, user]);
  await pool.query(`INSERT INTO mcp_tokens (workspace_id, user_id, token_hash, label) VALUES ($1, $2, $3, 'test')`, [ws, user, hashToken(token)]);
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
after(async () => {
  server.close();
  await pool.query('DELETE FROM "user" WHERE id = $1', [user]); // cascade：workspaces → notes → versions/links/tags；mcp_tokens
  await pool.end();
});

test('missing or wrong token → 401', async () => {
  for (const auth of ['', 'Bearer nope']) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: auth }, body: '{}' });
    assert.equal(res.status, 401);
  }
});

test('all six tools are listed', async () => {
  const c = await connect(token);
  const names = (await c.listTools()).tools.map(t => t.name).sort();
  assert.deepEqual(names, ['create_note', 'get_instructions', 'list_folder', 'read_note', 'search_notes', 'update_note']);
  await c.close();
});

test('get_instructions: hint when schema/ is empty; returns page content once a schema page exists', async () => {
  const c = await connect(token);
  const empty = await call(c, 'get_instructions');
  assert.match(empty.data, /schema\/instructions\.md/);
  await call(c, 'create_note', { path: 'schema/instructions.md', content: '# 編纂規則\n\n一事一頁。' });
  const got = await call(c, 'get_instructions');
  assert.match(got.data, /一事一頁/);
  await c.close();
});

test('path rules: reject missing layer prefix, non-.md, and ..', async () => {
  const c = await connect(token);
  for (const path of ['notes/a.md', 'wiki/a.txt', 'wiki/../raw/x.md', 'wiki.md']) {
    const r = await call(c, 'create_note', { path, content: 'x' });
    assert.equal(r.isError, true, path);
    assert.equal(r.data.error, 'BAD_PATH', path);
  }
  await c.close();
});

test('create → read → update with optimistic lock → 409 carries current content', async () => {
  const c = await connect(token);
  const created = await call(c, 'create_note', { path: 'wiki/mcp.md', content: '# MCP\n\n見 [[LLM Wiki 模式]]。' });
  assert.equal(created.data.version, 1);
  const dup = await call(c, 'create_note', { path: 'wiki/mcp.md', content: 'x' });
  assert.equal(dup.data.error, 'CONFLICT');

  const read = await call(c, 'read_note', { path: 'wiki/mcp.md' });
  assert.equal(read.data.version, 1);
  assert.match(read.data.content, /MCP/);

  const upd = await call(c, 'update_note', { path: 'wiki/mcp.md', content: '# MCP\n\n第二版。', if_version: 1 });
  assert.equal(upd.data.version, 2);

  const stale = await call(c, 'update_note', { path: 'wiki/mcp.md', content: '過期寫入', if_version: 1 });
  assert.equal(stale.isError, true);
  assert.equal(stale.data.status, 409);
  assert.equal(stale.data.current.version, 2);
  assert.match(stale.data.current.content, /第二版/);

  const missing = await call(c, 'update_note', { path: 'wiki/nope.md', content: 'x', if_version: 1 });
  assert.equal(missing.data.error, 'NOT_FOUND');

  const { rows } = await pool.query('SELECT v.version, v.author FROM note_versions v JOIN notes n ON n.id = v.note_id WHERE n.workspace_id = $1 AND n.path = $2 ORDER BY v.version', [ws, 'wiki/mcp.md']);
  assert.deepEqual(rows.map(r => [r.version, r.author]), [[1, 'mcp:test'], [2, 'mcp:test']]);
  await c.close();
});

test('raw/ can be created but not updated', async () => {
  const c = await connect(token);
  const created = await call(c, 'create_note', { path: 'raw/papers/gist.md', content: '---\ntags: [source, karpathy]\n---\n# gist' });
  assert.equal(created.isError, false);
  const upd = await call(c, 'update_note', { path: 'raw/papers/gist.md', content: 'x', if_version: 1 });
  assert.equal(upd.data.error, 'FORBIDDEN');
  await c.close();
});

test('search: keyword, folder and tag filters', async () => {
  const c = await connect(token);
  const all = await call(c, 'search_notes', { query: 'MCP' });
  assert.ok(all.data.hits.some((h: any) => h.path === 'wiki/mcp.md'));
  const inRaw = await call(c, 'search_notes', { query: 'gist', folder: 'raw' });
  assert.equal(inRaw.data.count, 1);
  const byTag = await call(c, 'search_notes', { query: 'gist', tag: '#karpathy' });
  assert.equal(byTag.data.count, 1);
  const noTag = await call(c, 'search_notes', { query: 'gist', tag: 'nope' });
  assert.equal(noTag.data.count, 0);
  await c.close();
});

test('list_folder: root lists the three layers; sublevels list folders and notes', async () => {
  const c = await connect(token);
  const root = await call(c, 'list_folder');
  assert.deepEqual(root.data.folders, ['raw', 'wiki', 'schema']);
  const raw = await call(c, 'list_folder', { path: 'raw' });
  assert.deepEqual(raw.data.folders, ['raw/papers']);
  assert.equal(raw.data.notes.length, 0);
  const papers = await call(c, 'list_folder', { path: 'raw/papers/' });
  assert.equal(papers.data.notes[0].path, 'raw/papers/gist.md');
  await c.close();
});

test('links: [[target]] is written to the links table', async () => {
  const { rows } = await pool.query('SELECT target FROM links WHERE workspace_id = $1', [ws]);
  assert.deepEqual(rows.map(r => r.target), []);  // v2 content has no links; DELETE+INSERT took effect
  const c = await connect(token);
  await call(c, 'update_note', { path: 'wiki/mcp.md', content: '# MCP\n\n[[LLM Wiki 模式]] 與 [[raw/papers/gist|來源]]', if_version: 2 });
  const after = await pool.query('SELECT target FROM links WHERE workspace_id = $1 ORDER BY target', [ws]);
  assert.deepEqual(after.rows.map(r => r.target), ['LLM Wiki 模式', 'raw/papers/gist']);
  await c.close();
});

test('workspace isolation: another token cannot see this workspace', async () => {
  const otherWs = `${ws}-b`;
  const otherToken = `wb_test_${randomBytes(16).toString('hex')}`;
  await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'u2', $2, true)`, [`${otherWs}-user`, `${otherWs}@example.com`]);
  await pool.query(`INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)`, [otherWs, `${otherWs}-user`]);
  await pool.query(`INSERT INTO mcp_tokens (workspace_id, user_id, token_hash) VALUES ($1, $2, $3)`, [otherWs, `${otherWs}-user`, hashToken(otherToken)]);
  const c = await connect(otherToken);
  const r = await call(c, 'read_note', { path: 'wiki/mcp.md' });
  assert.equal(r.data.error, 'NOT_FOUND');
  const s = await call(c, 'search_notes', { query: 'MCP' });
  assert.equal(s.data.count, 0);
  await c.close();
  await pool.query('DELETE FROM "user" WHERE id = $1', [`${otherWs}-user`]);
});
