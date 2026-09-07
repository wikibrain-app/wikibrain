import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { encrypt, decrypt } from '../src/crypto.js';
import { PROVIDERS, estimateCost, listModels, priceFor, registerRunner, runAgent, setPriceTableForTest, withRetry, type RunOptions } from '../src/ai/providers.js';
import { waitForJob } from '../src/ingest.js';

// Q9: API key encryption and settings API, server-side Ingest (mock runner follows the six Karpathy steps), OpenAI-compatible loop (fixture server).
const email = `ai-${randomBytes(4).toString('hex')}@example.com`;
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
  await auth.api.signUpEmail({ body: { email, password, name: 'ai' } });
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

test('crypto: encrypt/decrypt round-trip, ciphertext differs each time (IV), tampering rejected', () => {
  const a = encrypt('sk-ant-secret-123'), b = encrypt('sk-ant-secret-123');
  assert.notEqual(a, b); assert.equal(decrypt(a), 'sk-ant-secret-123');
  assert.throws(() => decrypt(a.slice(0, -2) + 'zz'));
});

test('/api/ai: only last four chars returned after save; changing model does not require re-entering key; config null after delete', async () => {
  const g0 = await api('GET', '/api/ai');
  assert.equal(g0.data.config, null); assert.deepEqual(g0.data.providers.map((p: any) => p.id), ['anthropic', 'openai', 'openrouter']);
  assert.equal((await api('PUT', '/api/ai', { provider: 'anthropic', model: '' })).status, 400, 'first save requires a key');
  const s1 = await api('PUT', '/api/ai', { provider: 'anthropic', model: '', apiKey: 'sk-ant-api03-abcdef1234' });
  assert.equal(s1.status, 200); assert.equal(s1.data.config.model, 'claude-sonnet-5'); assert.equal(s1.data.config.key_last4, '1234');
  assert.equal(JSON.stringify(s1.data).includes('abcdef'), false, 'must not return plaintext');
  const s2 = await api('PUT', '/api/ai', { provider: 'anthropic', model: 'claude-opus-5' });
  assert.equal(s2.data.config.model, 'claude-opus-5'); assert.equal(s2.data.config.key_last4, '1234');
  const { rows } = await pool.query(`SELECT key_cipher FROM ai_providers a JOIN "user" u ON u.id = a.user_id WHERE u.email = $1`, [email]);
  assert.match(rows[0].key_cipher, /^v[12]\./); assert.equal(rows[0].key_cipher.includes('abcdef'), false);
  assert.equal((await api('PUT', '/api/ai', { provider: 'nope', apiKey: 'x' })).status, 400);
  assert.equal((await api('DELETE', '/api/ai')).status, 200);
  assert.equal((await api('GET', '/api/ai')).data.config, null);
  assert.equal((await api('POST', '/api/ingest')).status, 403, 'cannot start without a key');
  await api('PUT', '/api/ai', { provider: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-api03-abcdef1234' });
});

test('pricing: model id maps to OpenRouter slug; cost estimate; unknown model → null', async () => {
  setPriceTableForTest(new Map([['anthropic/claude-opus-5', { input: 5, output: 25 }], ['openai/gpt-5', { input: 1.25, output: 10 }]]));
  assert.deepEqual(await priceFor('anthropic', 'claude-opus-5'), { input: 5, output: 25 });
  assert.deepEqual(await priceFor('openai', 'gpt-5'), { input: 1.25, output: 10 });
  assert.equal(await priceFor('openrouter', 'nope/x'), null);
  assert.equal(estimateCost(1_000_000, 100_000, { input: 5, output: 25 }), 7.5);
  assert.equal(estimateCost(10, 10, null), null);
});

test('server-side ingest: mock runner completes the six steps → pages created, pending cleared, author agent:, job record has steps and tokens', async () => {
  // 404 when there are no pending sources
  assert.equal((await api('POST', '/api/ingest')).status, 404);
  const imp = await api('POST', '/api/import', { kind: 'text', text: '訪談稿\n\n受訪者談到三個瓶頸。' });
  const src: string = imp.data.path;

  registerRunner('anthropic', async (o: RunOptions) => {
    assert.match(o.system, /Karpathy/); assert.match(o.user, new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.deepEqual(o.tools.map(t => t.name), ['get_instructions', 'search_notes', 'read_note', 'create_note', 'update_note', 'list_folder']);
    const call = async (name: string, input: Record<string, unknown>) => { o.onEvent({ type: 'tool', tool: name, input }); const out = await o.exec(name, input); o.onEvent({ type: 'result', tool: name, output: out }); return out; };
    const rules = await call('get_instructions', {});
    assert.match(rules, /待編纂的來源（1）/);
    const srcNote = JSON.parse(await call('read_note', { path: src }));
    assert.match(srcNote.content, /三個瓶頸/);
    await call('search_notes', { query: '瓶頸' });
    await call('create_note', { path: 'wiki/sources/訪談稿.md', content: `# 訪談稿摘要\n\n來源：[[${src}]]。三個瓶頸：……` });
    await call('create_note', { path: 'wiki/index.md', content: '# 目錄\n\n## 來源摘要\n\n- [[sources/訪談稿]]：三個瓶頸' });
    const dup = JSON.parse(await call('create_note', { path: 'wiki/index.md', content: 'x' }));
    assert.equal(dup.error, 'CONFLICT', 'duplicate create must return an error to the agent, not throw');
    const idx = JSON.parse(await call('read_note', { path: 'wiki/index.md' }));
    await call('update_note', { path: 'wiki/index.md', content: idx.content + '\n', if_version: idx.version });
    await call('create_note', { path: 'wiki/log.md', content: '# 紀錄\n\n## [2026-09-04] ingest | 訪談稿' });
    o.onEvent({ type: 'usage', tokens_in: 1200, tokens_out: 340 });
    o.onEvent({ type: 'text', text: '已建立摘要頁、目錄與紀錄。' });
    return { steps: 8, tokens_in: 1200, tokens_out: 340, finalText: '已建立摘要頁、目錄與紀錄。' };
  });

  const start = await api('POST', '/api/ingest', { paths: [src] });
  assert.equal(start.status, 202, JSON.stringify(start.data)); assert.equal(start.data.job.status, 'queued');
  const job = await waitForJob(wsId, start.data.job.id);
  assert.equal(job!.status, 'done', job!.error ?? '');
  assert.equal(job!.steps, 8); assert.equal(job!.tokens_in, 1200);
  assert.ok(job!.log.some(e => e.type === 'tool' && e.tool === 'create_note'));

  const tree = await api('GET', '/api/notes/tree');
  assert.ok(!tree.data.pendingSources.includes(src), 'no longer pending once summary page links back to source');
  const v = await api('GET', '/api/notes/versions?path=wiki/sources/訪談稿.md');
  assert.equal(v.data.versions[0].author, 'agent:anthropic/claude-opus-5');
  const via = await api('GET', `/api/ingest/${start.data.job.id}`);
  assert.equal(via.data.job.status, 'done');
  assert.equal(via.data.job.price_in, 5); assert.ok(Math.abs(via.data.job.cost_usd - (1200 / 1e6 * 5 + 340 / 1e6 * 25)) < 1e-9, 'cost = tokens_in × price_in + tokens_out × price_out');
  assert.equal((await api('GET', '/api/ingest')).data.jobs.length, 1);
  const st = await api('GET', '/api/ingest/stats');
  assert.equal(st.status, 200); assert.equal(st.data.thisMonth.jobs, 1); assert.equal(st.data.allTime.tokens_in, 1200);
  assert.ok(st.data.allTime.cost_usd > 0); assert.equal(st.data.byModel[0].model, 'claude-opus-5'); assert.equal(st.data.thisMonth.unpriced, 0);
  setPriceTableForTest(null);
});

test('Anthropic loop: fixture server returns tool_use → tool_result sent → end_turn', async () => {
  registerRunner('anthropic', undefined);
  const seen: any[] = [];
  const fx = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    seen.push(JSON.parse(body));
    assert.equal(req.headers['x-api-key'], 'sk-ant-test');
    res.setHeader('content-type', 'application/json');
    if (seen.length === 1) res.end(JSON.stringify({ id: 'm1', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: 'tool_use', stop_sequence: null, content: [{ type: 'text', text: '先看目錄。' }, { type: 'tool_use', id: 'tu1', name: 'list_folder', input: { path: 'wiki' } }], usage: { input_tokens: 11, output_tokens: 6 } }));
    else res.end(JSON.stringify({ id: 'm2', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: '完成' }], usage: { input_tokens: 25, output_tokens: 4 } }));
  }).listen(0, '127.0.0.1');
  await new Promise(r => fx.once('listening', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fx.address() as AddressInfo).port}`;
  try {
    const events: string[] = [];
    const r = await runAgent({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'sk-ant-test', system: 's', user: 'u', maxSteps: 5,
      tools: [{ name: 'list_folder', description: 'd', input_schema: { type: 'object', properties: { path: { type: 'string' } } } }],
      exec: async (name, input) => `${name}:${input.path}`, onEvent: e => events.push(e.type) });
    assert.equal(r.finalText, '完成'); assert.equal(r.steps, 1); assert.equal(r.tokens_in, 36); assert.equal(r.tokens_out, 10);
    assert.deepEqual(events, ['usage', 'text', 'tool', 'result', 'usage', 'text']);
    const last = seen[1].messages.at(-1);
    assert.equal(last.role, 'user'); assert.equal(last.content[0].type, 'tool_result'); assert.equal(last.content[0].tool_use_id, 'tu1'); assert.equal(last.content[0].content, 'list_folder:wiki');
    assert.equal(seen[0].system, 's'); assert.equal(seen[0].tools[0].name, 'list_folder');
  } finally { delete process.env.ANTHROPIC_BASE_URL; fx.close(); }
});

test('OpenAI-compatible loop: fixture server returns tool_call then final text; tool results sent as role=tool', async () => {
  const seen: any[] = [];
  const fx = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const j = JSON.parse(body); seen.push(j);
    assert.equal(req.headers.authorization, 'Bearer sk-test');
    res.setHeader('content-type', 'application/json');
    if (seen.length === 1) {
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_folder', arguments: '{"path":"wiki"}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    } else {
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '完成' } }], usage: { prompt_tokens: 20, completion_tokens: 3 } }));
    }
  }).listen(0, '127.0.0.1');
  await new Promise(r => fx.once('listening', r));
  const saved = PROVIDERS.openai.baseUrl;
  PROVIDERS.openai.baseUrl = `http://127.0.0.1:${(fx.address() as AddressInfo).port}/v1`;
  try {
    const events: string[] = [];
    const r = await runAgent({ provider: 'openai', model: 'gpt-5', apiKey: 'sk-test', system: 's', user: 'u', maxSteps: 5,
      tools: [{ name: 'list_folder', description: 'd', input_schema: { type: 'object', properties: { path: { type: 'string' } } } }],
      exec: async (name, input) => `${name}:${input.path}`, onEvent: e => events.push(e.type) });
    assert.equal(r.finalText, '完成'); assert.equal(r.steps, 1); assert.equal(r.tokens_in, 30); assert.equal(r.tokens_out, 8);
    assert.deepEqual(events, ['usage', 'tool', 'result', 'usage', 'text']);
    assert.equal(seen[1].messages.at(-1).role, 'tool'); assert.equal(seen[1].messages.at(-1).content, 'list_folder:wiki'); assert.equal(seen[1].messages.at(-1).tool_call_id, 'c1');
    assert.equal(seen[0].tools[0].function.name, 'list_folder');
  } finally { PROVIDERS.openai.baseUrl = saved; fx.close(); }
});

test('model list: OpenRouter public list with prices (live network); OpenAI via fixture verifies key and filtering; missing key → 400', async (t) => {
  assert.equal((await api('POST', '/api/ai/models', { provider: 'openai', apiKey: '' })).status, 400, 'openai without a saved key must say a key is required');
  const fx = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer sk-good') { res.statusCode = 401; res.end('{"error":"bad key"}'); return; }
    res.end(JSON.stringify({ data: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }, { id: 'text-embedding-3-large' }, { id: 'o4-mini' }] }));
  }).listen(0, '127.0.0.1');
  await new Promise(r => fx.once('listening', r));
  const saved = PROVIDERS.openai.baseUrl;
  PROVIDERS.openai.baseUrl = `http://127.0.0.1:${(fx.address() as AddressInfo).port}/v1`;
  try {
    const ok = await api('POST', '/api/ai/models', { provider: 'openai', apiKey: 'sk-good' });
    assert.equal(ok.status, 200); assert.deepEqual(ok.data.models.map((m: any) => m.id), ['gpt-5', 'gpt-5-mini', 'o4-mini'], 'embedding models must be filtered out');
    const bad = await api('POST', '/api/ai/models', { provider: 'openai', apiKey: 'sk-bad-key-xyz' });
    assert.equal(bad.status, 400); assert.match(bad.data.message, /401/); assert.equal(bad.data.message.includes('sk-bad'), false, 'error message must not leak the key');
  } finally { PROVIDERS.openai.baseUrl = saved; fx.close(); }
  let or: any[] = [];
  try { or = await listModels('openrouter'); } catch (e) { t.diagnostic(`OpenRouter unreachable, skipping: ${(e as Error).message}`); return; }
  assert.ok(or.length > 50); assert.ok(or.some(m => /claude/i.test(m.id) && m.pricing && m.pricing.input >= 0));
});

test('withRetry: 429/5xx/timeout back off then succeed; 401 etc. not retried; throws past max attempts', async () => {
  let n = 0; const notes: string[] = [];
  const r = await withRetry(async () => { n++; if (n < 3) { const e: any = new Error('openrouter API 429：rate-limited'); e.status = 429; throw e; } return 'ok'; }, m => notes.push(m), [1, 1, 1]);
  assert.equal(r, 'ok'); assert.equal(n, 3); assert.equal(notes.length, 2);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; const e: any = new Error('401 invalid key'); e.status = 401; throw e; }, () => {}, [1, 1]), /401/);
  assert.equal(n, 1, 'non-transient errors are not retried');
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw Object.assign(new Error('fetch failed'), { name: 'TypeError' }); }, () => {}, [1, 1]), /fetch failed/);
  assert.equal(n, 3, 'connection errors retried up to the limit');
});

test('OpenAI-compatible loop: first 429 is retried and noted in the log', async () => {
  let hits = 0;
  const fx = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    hits++;
    res.setHeader('content-type', 'application/json');
    if (hits === 1) { res.statusCode = 429; res.end('{"error":{"message":"rate-limited upstream"}}'); return; }
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '完成' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  }).listen(0, '127.0.0.1');
  await new Promise(r => fx.once('listening', r));
  const saved = PROVIDERS.openai.baseUrl; PROVIDERS.openai.baseUrl = `http://127.0.0.1:${(fx.address() as AddressInfo).port}/v1`;
  try {
    const events: any[] = [];
    const r = await runAgent({ provider: 'openai', model: 'gpt-5', apiKey: 'k', system: 's', user: 'u', maxSteps: 3, tools: [], exec: async () => '', onEvent: e => events.push(e) });
    assert.equal(r.finalText, '完成'); assert.equal(hits, 2);
    assert.ok(events.some(e => e.type === 'text' && /重試/.test(e.text)), 'retry must be visible in the log');
  } finally { PROVIDERS.openai.baseUrl = saved; fx.close(); }
});
