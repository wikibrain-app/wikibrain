import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { parseFrontMatter } from '../src/notes.js';
import { purgeOldVersions } from '../src/retention.js';

// Milestone 3 backend AC-1 to AC-7, AC-20 (/api/graph).
const email = `w-${randomBytes(4).toString('hex')}@example.com`;
const password = 'correct-horse-battery';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
let cookie = '';
let mcpToken = '';

const api = async (method: string, path: string, body?: unknown, useCookie = true) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', origin: config.appUrl, ...(useCookie && cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const mcpCall = (name: string, args: Record<string, unknown>) =>
  fetch(base + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${mcpToken}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });

before(async () => {
  await migrate();
  const webDist = mkdtempSync(join(tmpdir(), 'wb-web-'));
  writeFileSync(join(webDist, 'index.html'), '<!doctype html><title>WikiBrain SPA</title>');
  server = createApp({ webDist }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password, name: '網頁測試' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const signin = await fetch(base + '/api/auth/sign-in/email', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password }),
  });
  cookie = signin.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  mcpToken = (await api('POST', '/api/tokens', { label: 'cursor' })).data.token;
});
after(async () => {
  server.close();
  await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
  await pool.end();
});

test('AC-1 tree: 401 without session; signed in shows only own workspace (empty for new account)', async () => {
  assert.equal((await api('GET', '/api/notes/tree', undefined, false)).status, 401);
  const r = await api('GET', '/api/notes/tree');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.notes, []);
});

test('AC-3 create / read / update(409) / raw 403 / delete', async () => {
  const c = await api('POST', '/api/notes', { path: 'wiki/a.md', content: '# A\n\n連到 [[B]]。' });
  assert.equal(c.status, 201);
  assert.equal(c.data.version, 1);
  assert.equal((await api('POST', '/api/notes', { path: 'wiki/a.md', content: 'x' })).status, 409);
  assert.equal((await api('POST', '/api/notes', { path: 'nope/a.md', content: 'x' })).status, 400);

  const r = await api('GET', '/api/notes?path=wiki/a.md');
  assert.equal(r.status, 200);
  assert.equal(r.data.author, `web:${email}`);           // AC-2
  assert.match(r.data.content, /\[\[B\]\]/);
  assert.equal((await api('GET', '/api/notes?path=wiki/zzz.md')).status, 404);

  const u = await api('PUT', '/api/notes', { path: 'wiki/a.md', content: '# A\n\n第二版', if_version: 1 });
  assert.equal(u.status, 200); assert.equal(u.data.version, 2);
  const stale = await api('PUT', '/api/notes', { path: 'wiki/a.md', content: 'x', if_version: 1 });
  assert.equal(stale.status, 409); assert.equal(stale.data.current.version, 2);

  await api('POST', '/api/notes', { path: 'raw/src.md', content: '# 來源' });
  assert.equal((await api('PUT', '/api/notes', { path: 'raw/src.md', content: 'x', if_version: 1 })).status, 403);

  await api('POST', '/api/notes', { path: 'wiki/tmp.md', content: '# 暫存' });
  assert.equal((await api('DELETE', '/api/notes?path=wiki/tmp.md')).status, 200);
  assert.equal((await api('GET', '/api/notes?path=wiki/tmp.md')).status, 404);
  const tree = await api('GET', '/api/notes/tree');
  assert.deepEqual(tree.data.notes.map((n: any) => n.path), ['raw/src.md', 'wiki/a.md']);
});

test('AC-4 search / backlinks / versions', async () => {
  await api('POST', '/api/notes', { path: 'wiki/b.md', content: '# B\n\n回連 [[wiki/a]]。' });
  const s = await api('GET', '/api/search?q=第二版');
  assert.equal(s.data.count, 1);
  assert.deepEqual(Object.keys(s.data.hits[0]).sort(), ['path', 'snippet', 'title', 'version']);
  const bl = await api('GET', '/api/notes/backlinks?path=wiki/a.md');
  assert.deepEqual(bl.data.backlinks.map((b: any) => b.path), ['wiki/b.md']);
  // When a nested path is referenced as [[sub/deep]], the backlink rule must match the graph and the frontend
  await api('POST', '/api/notes', { path: 'wiki/sub/deep.md', content: '# Deep' });
  await api('POST', '/api/notes', { path: 'wiki/c.md', content: '# C\n\n見 [[sub/deep]]' });
  const bl2 = await api('GET', '/api/notes/backlinks?path=wiki/sub/deep.md');
  assert.deepEqual(bl2.data.backlinks.map((b: any) => b.path), ['wiki/c.md']);
  await api('DELETE', '/api/notes?path=wiki/sub/deep.md'); await api('DELETE', '/api/notes?path=wiki/c.md');
  const v = await api('GET', '/api/notes/versions?path=wiki/a.md');
  assert.deepEqual(v.data.versions.map((x: any) => x.version), [2, 1]);
  assert.match(v.data.versions[1].content_md, /\[\[B\]\]/);
});

test('AC-5 rollback: old content becomes a new version; mismatched if_version → 409', async () => {
  assert.equal((await api('POST', '/api/notes/rollback', { path: 'wiki/a.md', version: 1, if_version: 1 })).status, 409);
  const rb = await api('POST', '/api/notes/rollback', { path: 'wiki/a.md', version: 1, if_version: 2 });
  assert.equal(rb.status, 200); assert.equal(rb.data.version, 3);
  const r = await api('GET', '/api/notes?path=wiki/a.md');
  assert.match(r.data.content, /\[\[B\]\]/);
  assert.equal(r.data.author, `web:${email}`);
  assert.equal((await api('POST', '/api/notes/rollback', { path: 'wiki/a.md', version: 99, if_version: 3 })).status, 404);
});

test('AC-6 Web and MCP cross-writes: correct author on each side; both read the same', async () => {
  const m = await mcpCall('update_note', { path: 'wiki/a.md', content: '# A\n\nMCP 寫的', if_version: 3 });
  assert.equal(m.status, 200);
  const mt = await m.text();
  assert.doesNotMatch(mt, /isError/, mt);
  const r = await api('GET', '/api/notes?path=wiki/a.md');
  assert.equal(r.data.version, 4); assert.equal(r.data.author, 'mcp:cursor'); assert.match(r.data.content, /MCP 寫的/);
  const v = await api('GET', '/api/notes/versions?path=wiki/a.md');
  assert.deepEqual(v.data.versions.slice(0, 2).map((x: any) => x.author), ['mcp:cursor', `web:${email}`]);
});

test('AC-20 graph: nodes and resolvable edges', async () => {
  const g = await api('GET', '/api/graph');
  assert.deepEqual(g.data.nodes.map((n: any) => [n.path, n.layer]), [['raw/src.md', 'raw'], ['wiki/a.md', 'wiki'], ['wiki/b.md', 'wiki']]);
  assert.deepEqual(g.data.edges, [{ from: 'wiki/b.md', to: 'wiki/a.md' }]);  // a no longer contains [[B]]
});

test('links resolved at write time: link-before-create connects; edge disappears on delete and returns on revive', async () => {
  await api('POST', '/api/notes', { path: 'wiki/x.md', content: '# X\n\n先連 [[Y 頁]] 與 [[wiki/z]]。' });
  let g = await api('GET', '/api/graph');
  assert.equal(g.data.edges.some((e: any) => e.from === 'wiki/x.md'), false, 'no edge while target does not exist yet');
  await api('POST', '/api/notes', { path: 'wiki/y.md', content: '# Y 頁' });       // resolved by title
  await api('POST', '/api/notes', { path: 'wiki/z.md', content: '# Z' });          // resolved by path
  g = await api('GET', '/api/graph');
  assert.deepEqual(g.data.edges.filter((e: any) => e.from === 'wiki/x.md').map((e: any) => e.to).sort(), ['wiki/y.md', 'wiki/z.md']);
  const bl = await api('GET', '/api/notes/backlinks?path=wiki/y.md');
  assert.deepEqual(bl.data.backlinks.map((b: any) => b.path), ['wiki/x.md']);
  await api('DELETE', '/api/notes?path=wiki/y.md');
  g = await api('GET', '/api/graph');
  assert.equal(g.data.edges.some((e: any) => e.to === 'wiki/y.md'), false, 'edge should disappear after soft delete');
  await api('POST', '/api/notes', { path: 'wiki/y.md', content: '# Y 頁（復活）' });
  g = await api('GET', '/api/graph');
  assert.equal(g.data.edges.some((e: any) => e.to === 'wiki/y.md'), true, 'same id after revive, edge should return');
  for (const p of ['wiki/x.md', 'wiki/y.md', 'wiki/z.md']) await api('DELETE', `/api/notes?path=${p}`);
});

test('version retention: delete snapshots past retention, always keep the current version', async () => {
  await api('POST', '/api/notes', { path: 'wiki/old.md', content: '# Old v1' });
  await api('PUT', '/api/notes', { path: 'wiki/old.md', content: '# Old v2', if_version: 1 });
  await pool.query(`UPDATE note_versions v SET created_at = now() - interval '100 days'
                      FROM notes n WHERE n.id = v.note_id AND n.path = 'wiki/old.md'`);   // both versions become old
  const purged = await purgeOldVersions();
  assert.ok(purged >= 1);
  const v = await api('GET', '/api/notes/versions?path=wiki/old.md');
  assert.deepEqual(v.data.versions.map((x: any) => x.version), [2], 'only the current version remains');
  await api('DELETE', '/api/notes?path=wiki/old.md');
});

test('props table: parseFrontMatter handles each type; /api/notes/props returns rows and column stats, folder filter', async () => {
  assert.deepEqual(parseFrontMatter('---\nsource_type: paper\nyear: 2024\nauthors: ["Chen, Amy", "Lin, Bo"]\ntags:\n  - a\n  - b\nverified: true\ntitle: "有引號"\n---\n# x'), { source_type: 'paper', year: 2024, authors: ['Chen, Amy', 'Lin, Bo'], tags: ['a', 'b'], verified: true, title: '有引號' });
  assert.deepEqual(parseFrontMatter('# 沒有 front-matter'), {});
  await api('POST', '/api/notes', { path: 'raw/sources/p1.md', content: '---\nsource_type: paper\nyear: 2021\n---\n# P1' });
  await api('POST', '/api/notes', { path: 'raw/sources/p2.md', content: '---\nsource_type: web\n---\n# P2' });
  const all = await api('GET', '/api/notes/props');
  assert.equal(all.status, 200); assert.ok(all.data.rows.length >= 2);
  const k = Object.fromEntries(all.data.keys.map((x: any) => [x.key, x.count]));
  assert.ok(k.source_type >= 2 && k.year >= 1);
  const raw = await api('GET', '/api/notes/props?folder=raw/sources');
  assert.ok(raw.data.rows.every((r: any) => r.path.startsWith('raw/sources/')));
  const p1 = raw.data.rows.find((r: any) => r.path === 'raw/sources/p1.md');
  assert.equal(p1.props.year, 2021); assert.equal(typeof p1.inbound, 'number'); assert.match(p1.author, /^web:/);
  await api('DELETE', '/api/notes?path=raw/sources/p1.md'); await api('DELETE', '/api/notes?path=raw/sources/p2.md');
});

test('AC-7 SPA fallback: non-API paths get index.html; /healthz and /api unaffected', async () => {
  const page = await fetch(base + '/settings');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /WikiBrain SPA/);
  assert.equal((await fetch(base + '/healthz')).headers.get('content-type')?.includes('json'), true);
  assert.equal((await fetch(base + '/api/nope')).status, 401);
});
