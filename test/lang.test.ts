import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { NoteError, getInstructions, ingestPrompt } from '../src/notes.js';
import { ingestSystem, lintSystem } from '../src/ingest.js';
import { chatSystem } from '../src/chat.js';
import { lintSummary } from '../src/lint.js';

// Q10 i18n: workspace language affects only the UI, template defaults, agent prompts and error messages; content is untouched.
const email = `lang-${randomBytes(4).toString('hex')}@example.com`;
const password = 'correct-horse-battery';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string, cookie = '', token = '', wsId = '';
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const mcpCall = async (name: string, args: Record<string, unknown>) => {
  const res = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  const txt = await res.text();
  const line = txt.split('\n').find(l => l.startsWith('data:')) ?? txt;
  return JSON.parse(line.replace(/^data:\s*/, '')).result;
};

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password, name: 'lang' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  token = (await api('POST', '/api/tokens', { label: 'lang' })).data.token;
  wsId = (await api('GET', '/api/me')).data.workspace.id;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('NoteError bilingual: string is the same in both languages, object picks by language', () => {
  const a = new NoteError('BAD_PATH', '只有一種');
  assert.equal(a.localized('en'), '只有一種');
  const b = new NoteError('NOT_FOUND', { 'zh-TW': '找不到', en: 'Not found' });
  assert.equal(b.message, '找不到'); assert.equal(b.localized('en'), 'Not found'); assert.equal(b.localized('zh-TW'), '找不到');
});

test('prompts by language: system prompts, ingestPrompt, lintSummary, pending section of get_instructions', async () => {
  assert.match(ingestSystem('zh-TW'), /繁體中文/); assert.match(ingestSystem('en'), /Write all output in English/);
  assert.match(lintSystem('en'), /lint agent/); assert.match(chatSystem('en'), /Call get_instructions first/); assert.match(chatSystem('zh-TW'), /先呼叫 get_instructions/);
  assert.match(ingestPrompt(['raw/sources/a.md'], 'en'), /^Call get_instructions first/); assert.match(ingestPrompt(['raw/sources/a.md']), /^先呼叫 get_instructions/);
  const empty = { orphans: [], dangling: [], not_in_index: [], pending_sources: [], log_issues: [], missing_special: [] } as never;
  assert.equal(lintSummary(empty, 'en'), 'No structural issues found'); assert.equal(lintSummary(empty), '沒有發現結構問題');
  await api('POST', '/api/notes', { path: 'raw/sources/pending.md', content: '# Pending\n\nbody' });
  assert.match(await getInstructions(wsId, 'en'), /## Pending sources \(1\)/); assert.match(await getInstructions(wsId), /## 待編纂的來源（1）/);
});

test('workspace language API: default zh-TW -> set en -> /api/me, MCP error messages and get_instructions follow; invalid value 400', async () => {
  assert.equal((await api('GET', '/api/me')).data.workspace.lang, 'zh-TW');
  assert.equal((await api('PUT', '/api/me/lang', { lang: 'fr' })).status, 400);
  const zh = await mcpCall('read_note', { path: 'wiki/nope.md' });
  assert.equal(zh.isError, true); assert.match(zh.content[0].text, /找不到/);
  assert.equal((await api('PUT', '/api/me/lang', { lang: 'en' })).data.lang, 'en');
  assert.equal((await api('GET', '/api/me')).data.workspace.lang, 'en');
  const en = await mcpCall('read_note', { path: 'wiki/nope.md' });
  assert.equal(en.isError, true); assert.doesNotMatch(en.content[0].text, /[一-鿿]/, `MCP error in an English workspace must not contain Chinese: ${en.content[0].text}`);
  const ins = await mcpCall('get_instructions', {});
  assert.match(ins.content[0].text, /Pending sources/);
  const tree = await api('GET', '/api/notes/tree');
  assert.match(tree.data.ingestPrompt, /^Call get_instructions first/);
  const conflict = await api('PUT', '/api/notes', { path: 'raw/sources/pending.md', content: 'x', if_version: 1 });
  assert.equal(conflict.status, 403); assert.doesNotMatch(conflict.data.message, /[一-鿿]/, `raw read-only message in an English workspace must not contain Chinese: ${conflict.data.message}`);
});

test('sign-up picks workspace language and default name from Accept-Language; default name follows a language switch', async () => {
  const e2 = `lang-en-${randomBytes(4).toString('hex')}@example.com`;
  try {
    const r = await fetch(base + '/api/auth/sign-up/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl, 'accept-language': 'en-US,en;q=0.9,zh-TW;q=0.8' }, body: JSON.stringify({ email: e2, password, name: 'en' }) });
    assert.ok(r.ok, String(r.status));
    const { rows } = await pool.query(`SELECT w.lang, w.name FROM workspaces w JOIN "user" u ON u.id = w.owner_user_id WHERE u.email = $1`, [e2]);
    assert.equal(rows[0].lang, 'en'); assert.equal(rows[0].name, 'My knowledge base');
    // this test account (signed up without a header -> zh-TW) was switched to en earlier: the default name should now be English
    const me = (await api('GET', '/api/me')).data;
    assert.equal(me.workspace.name, 'My knowledge base');
    await api('PUT', '/api/me/lang', { lang: 'zh-TW' });
    assert.equal((await api('GET', '/api/me')).data.workspace.name, '我的知識庫');
  } finally { await pool.query('DELETE FROM "user" WHERE email = $1', [e2]); }
});
