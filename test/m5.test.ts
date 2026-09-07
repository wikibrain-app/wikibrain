import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { listTemplates } from '../src/templates.js';

// Milestone 5: template listing, apply (add without overwrite), stacking, get_instructions can read the rules.
const email = `m5-${randomBytes(4).toString('hex')}@example.com`;
const password = 'correct-horse-battery';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
let cookie = '';
let token = '';
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password, name: 'm5' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  token = (await api('POST', '/api/tokens', { label: 'm5' })).data.token;
});
after(async () => {
  server.close();
  await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
  await pool.end();
});

test('template preview: returns all files with content; unknown template → 404', async () => {
  const r = await api('GET', '/api/templates/researcher/files?lang=zh-TW');
  assert.equal(r.status, 200);
  const paths = r.data.files.map((f: any) => f.path);
  assert.ok(paths.includes('schema/instructions.md') && paths.includes('schema/researcher.md') && paths.includes('wiki/log.md'));
  assert.match(r.data.files.find((f: any) => f.path === 'schema/researcher.md').content, /研究者規則/);
  assert.equal((await api('GET', '/api/templates/nope/files')).status, 404);
});

test('template list: four templates, general first, both languages complete', async () => {
  const r = await api('GET', '/api/templates');
  assert.deepEqual(r.data.templates.map((t: any) => t.id), ['general', 'book', 'pm', 'researcher']);
  assert.deepEqual(r.data.langs, ['zh-TW', 'en']);
  for (const t of await listTemplates()) for (const l of ['zh-TW', 'en']) {
    assert.ok(t.name[l as 'zh-TW'] && t.description[l as 'zh-TW'] && t.prompt[l as 'zh-TW'], `${t.id} missing ${l}`);
  }
});

test('apply researcher template (zh-TW): everything created in empty workspace; all three layers; get_instructions includes researcher rules', async () => {
  const r = await api('POST', '/api/templates/apply', { id: 'researcher', lang: 'zh-TW' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.skipped, []);
  assert.ok(r.data.created.includes('schema/instructions.md') && r.data.created.includes('schema/researcher.md'));
  assert.ok(r.data.created.some((p: string) => p.startsWith('raw/sources/')) && r.data.created.some((p: string) => p.startsWith('wiki/')));
  assert.match(r.data.prompt, /get_instructions/);
  const v = await api('GET', '/api/notes/versions?path=schema/researcher.md');
  assert.equal(v.data.versions[0].author, 'system:template:researcher');

  const mcp = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_instructions', arguments: {} } }) });
  const txt = await mcp.text();
  assert.match(txt, /研究者規則/); assert.match(txt, /編纂規則（基礎）/);
});

test('re-apply same template: all skipped; stack pm template: only missing pages added', async () => {
  const again = await api('POST', '/api/templates/apply', { id: 'researcher', lang: 'zh-TW' });
  assert.deepEqual(again.data.created, []);
  assert.ok(again.data.skipped.length > 0);
  const pm = await api('POST', '/api/templates/apply', { id: 'pm', lang: 'zh-TW' });
  assert.ok(pm.data.created.includes('schema/pm.md') && pm.data.created.includes('wiki/todo.md'));
  assert.ok(pm.data.skipped.includes('schema/instructions.md') && pm.data.skipped.includes('wiki/index.md'), 'shared pages should be skipped, not overwritten');
  assert.equal((await api('POST', '/api/templates/apply', { id: 'nope', lang: 'en' })).status, 404);
  assert.equal((await api('POST', '/api/templates/apply', { id: 'general', lang: 'fr' })).status, 400);
});

test('Karpathy ingest state: raw source with no wiki backlink is pending; get_instructions lists pending first; cleared once wiki links back', async () => {
  const imp = await api('POST', '/api/import', { kind: 'text', text: '訪談稿\n\n受訪者談到知識管理的三個瓶頸。' });
  assert.equal(imp.status, 201); assert.match(imp.data.ingestPrompt, /Ingest 六步/);
  let tree = await api('GET', '/api/notes/tree');
  assert.ok(tree.data.pendingSources.includes(imp.data.path)); assert.match(tree.data.ingestPrompt, new RegExp(imp.data.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(!tree.data.pendingSources.some((p: string) => p.endsWith('/README.md')), 'README does not count as a source');
  const mcp = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_instructions', arguments: {} } }) });
  const txt = await mcp.text();
  assert.match(txt, /待編纂的來源（1）/); assert.match(txt, /訪談稿/);
  assert.ok(txt.indexOf('待編纂') < txt.indexOf('編纂規則（基礎）'), 'pending list must come before the rules');
  await api('POST', '/api/notes', { path: 'wiki/sources/訪談稿.md', content: `# 訪談稿摘要\n\n來源：[[${imp.data.path}]]。三個瓶頸是……` });
  tree = await api('GET', '/api/notes/tree');
  assert.ok(!tree.data.pendingSources.includes(imp.data.path), 'no longer pending once wiki links back');
  assert.equal(tree.data.ingestPrompt, null);
});

test('custom templates: copy built-in → edit → apply (add, no overwrite) → snapshot schema → delete; path validation', async () => {
  const dup = await api('POST', '/api/templates/custom', { from: 'researcher', lang: 'zh-TW' });
  assert.equal(dup.status, 201); const t = dup.data.template;
  assert.equal(t.name, '研究者（自訂）'); assert.equal(t.base_id, 'researcher'); assert.ok(t.files.some((f: any) => f.path === 'schema/researcher.md'));
  const list = await api('GET', '/api/templates');
  assert.equal(list.data.custom.length, 1); assert.equal('files' in list.data.custom[0], false, 'list omits file contents');
  const edited = await api('PUT', `/api/templates/custom/${t.id}`, { name: '我的研究規則', files: [...t.files, { path: 'schema/my-extra.md', content: '# 額外規則\n\n引用要附頁碼。' }] });
  assert.equal(edited.status, 200); assert.equal(edited.data.template.name, '我的研究規則'); assert.equal(edited.data.template.files.length, t.files.length + 1);
  assert.equal((await api('PUT', `/api/templates/custom/${t.id}`, { files: [{ path: 'notes/x.md', content: 'x' }] })).status, 400, 'path must be valid');
  assert.equal((await api('PUT', `/api/templates/custom/${t.id}`, { files: [] })).status, 400, 'at least one file required');
  const applied = await api('POST', '/api/templates/apply', { id: `custom:${t.id}` });
  assert.equal(applied.status, 200); assert.ok(applied.data.created.includes('schema/my-extra.md')); assert.ok(applied.data.skipped.includes('schema/instructions.md'), 'existing pages skipped');
  const v = await api('GET', '/api/notes/versions?path=schema/my-extra.md');
  assert.equal(v.data.versions[0].author, `system:template:custom:${t.id}`);
  const snap = await api('POST', '/api/templates/custom', { fromSchema: true, name: '快照' });
  assert.equal(snap.status, 201); assert.ok(snap.data.template.files.some((f: any) => f.path === 'schema/my-extra.md')); assert.ok(snap.data.template.files.some((f: any) => f.path === 'wiki/index.md'));
  assert.equal((await api('DELETE', `/api/templates/custom/${t.id}`)).data.deleted, true);
  assert.equal((await api('GET', `/api/templates/custom/${t.id}`)).status, 404);
  assert.equal((await api('POST', '/api/templates/apply', { id: `custom:${t.id}` })).status, 404);
});

test('[[links]] inside templates resolve after apply (index pages interlink)', async () => {
  const bl = await api('GET', '/api/notes/backlinks?path=wiki/open-questions.md');
  assert.ok(bl.data.backlinks.some((b: any) => b.path === 'wiki/index.md'), 'index linking to open-questions should show as a backlink');
});
