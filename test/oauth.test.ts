import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';

// OAuth 2.1 + DCR + PKCE: register client -> /authorize redirects to consent -> approve -> exchange code for token -> call /mcp -> refresh rotation -> revoke.
const email = `oauth-${randomBytes(4).toString('hex')}@example.com`;
const password = 'correct-horse-battery';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '';
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const form = (path: string, fields: Record<string, string>) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
const mcpList = (bearer: string) => fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${bearer}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password, name: 'oauth' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('metadata: authorization server and protected resource discoverable; /mcp without token returns 401 with resource_metadata', async () => {
  const as = await (await fetch(base + '/.well-known/oauth-authorization-server')).json();
  const noSlash = (u: string) => u.replace(/\/$/, '');
  assert.equal(noSlash(as.issuer), config.appUrl); assert.equal(as.authorization_endpoint, `${config.appUrl}/authorize`); assert.equal(as.token_endpoint, `${config.appUrl}/token`); assert.equal(as.registration_endpoint, `${config.appUrl}/register`);
  assert.ok(as.code_challenge_methods_supported.includes('S256')); assert.deepEqual(as.scopes_supported, ['notes:read', 'notes:write']);
  const rs = await (await fetch(base + '/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(rs.resource, `${config.appUrl}/mcp`); assert.deepEqual(rs.authorization_servers.map(noSlash), [config.appUrl]);
  const r = await mcpList('nope');
  assert.equal(r.status, 401); assert.match(r.headers.get('www-authenticate') ?? '', /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test('full flow: DCR -> authorize -> consent -> code for token -> /mcp works -> refresh rotation -> revoke', async () => {
  const reg = await (await fetch(base + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) })).json();
  assert.match(reg.client_id, /^wbc_/); assert.equal(reg.client_name, 'Claude');
  const verifier = b64url(randomBytes(32)); const challenge = b64url(createHash('sha256').update(verifier).digest());
  const authz = await fetch(base + `/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz&scope=notes:read%20notes:write`, { redirect: 'manual' });
  assert.equal(authz.status, 302);
  const loc = new URL(authz.headers.get('location')!, base); assert.equal(loc.pathname, '/oauth/consent'); const reqId = loc.searchParams.get('req')!;
  assert.equal((await api('GET', `/api/oauth/request?req=${reqId}`)).data.request.client_name, 'Claude');
  assert.equal((await fetch(base + `/api/oauth/request?req=${reqId}`)).status, 401, 'consent page requires login');
  const approved = (await api('POST', '/api/oauth/approve', { req: reqId })).data.redirect;
  const cb = new URL(approved); assert.equal(cb.origin + cb.pathname, 'https://claude.ai/api/mcp/auth_callback'); assert.equal(cb.searchParams.get('state'), 'xyz');
  const code = cb.searchParams.get('code')!; assert.match(code, /^wbac_/);
  assert.equal((await api('GET', `/api/oauth/request?req=${reqId}`)).status, 404, 'approved request can no longer be viewed');
  const bad = await form('/token', { grant_type: 'authorization_code', client_id: reg.client_id, code, code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier-1234', redirect_uri: 'https://claude.ai/api/mcp/auth_callback' });
  assert.equal(bad.status, 400, 'wrong PKCE verifier');
  const tok = await (await form('/token', { grant_type: 'authorization_code', client_id: reg.client_id, code, code_verifier: verifier, redirect_uri: 'https://claude.ai/api/mcp/auth_callback' })).json();
  assert.match(tok.access_token, /^wb_oauth_/); assert.match(tok.refresh_token, /^wb_refresh_/); assert.equal(tok.token_type, 'bearer'); assert.equal(tok.expires_in, 86400);
  const reuse = await form('/token', { grant_type: 'authorization_code', client_id: reg.client_id, code, code_verifier: verifier, redirect_uri: 'https://claude.ai/api/mcp/auth_callback' });
  assert.equal(reuse.status, 400, 'authorization code is single-use');
  const list = await mcpList(tok.access_token);
  assert.equal(list.status, 200); assert.match(await list.text(), /get_instructions/);
  const tokens = (await api('GET', '/api/tokens')).data.tokens;
  assert.ok(tokens.some((t: { label: string; kind: string }) => t.label === 'Claude' && t.kind === 'oauth'), 'OAuth connection visible in settings');
  const rt = await (await form('/token', { grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: tok.refresh_token })).json();
  assert.match(rt.access_token, /^wb_oauth_/); assert.notEqual(rt.access_token, tok.access_token);
  assert.equal((await mcpList(tok.access_token)).status, 401, 'old access token revoked'); assert.equal((await mcpList(rt.access_token)).status, 200);
  assert.equal((await form('/token', { grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: tok.refresh_token })).status, 400, 'old refresh token cannot be reused');
  assert.equal((await form('/revoke', { token: rt.access_token, client_id: reg.client_id })).status, 200);
  assert.equal((await mcpList(rt.access_token)).status, 401);
  // Deny: redirect back to the client with error=access_denied
  const authz2 = await fetch(base + `/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&code_challenge=${challenge}&code_challenge_method=S256&state=abc`, { redirect: 'manual' });
  const req2 = new URL(authz2.headers.get('location')!, base).searchParams.get('req')!;
  const denied = new URL((await api('POST', '/api/oauth/deny', { req: req2 })).data.redirect);
  assert.equal(denied.searchParams.get('error'), 'access_denied'); assert.equal(denied.searchParams.get('state'), 'abc');
  // An unregistered redirect_uri is rejected outright
  assert.equal((await fetch(base + `/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent('https://evil.example/cb')}&code_challenge=${challenge}&code_challenge_method=S256`, { redirect: 'manual' })).status, 400);
});

test('scope enforced: notes:read-only connection can read, write returns FORBIDDEN; refresh cannot escalate', async () => {
  const reg = await (await fetch(base + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'ReadOnly', redirect_uris: ['https://ro.example/cb'], token_endpoint_auth_method: 'none' }) })).json();
  const verifier = b64url(randomBytes(32)); const challenge = b64url(createHash('sha256').update(verifier).digest());
  const authz = await fetch(base + `/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent('https://ro.example/cb')}&code_challenge=${challenge}&code_challenge_method=S256&scope=notes:read`, { redirect: 'manual' });
  const reqId = new URL(authz.headers.get('location')!, base).searchParams.get('req')!;
  assert.deepEqual((await api('GET', `/api/oauth/request?req=${reqId}`)).data.request.scopes, ['notes:read']);
  const code = new URL((await api('POST', '/api/oauth/approve', { req: reqId })).data.redirect).searchParams.get('code')!;
  const tok = await (await form('/token', { grant_type: 'authorization_code', client_id: reg.client_id, code, code_verifier: verifier, redirect_uri: 'https://ro.example/cb' })).json();
  assert.equal(tok.scope, 'notes:read');
  const call = async (name: string, args: unknown) => { const r = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${tok.access_token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }); const txt = await r.text(); return JSON.parse((txt.split('\n').find(l => l.startsWith('data:')) ?? txt).replace(/^data:\s*/, '')).result; };
  assert.equal((await call('list_folder', { folder: 'wiki' })).isError, undefined);
  const w = await call('create_note', { path: 'wiki/ro.md', content: '# x' });
  assert.equal(w.isError, true); assert.match(w.content[0].text, /notes:read/);
  const rt = await (await form('/token', { grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: tok.refresh_token, scope: 'notes:read notes:write' })).json();
  assert.equal(rt.scope, 'notes:read', 'refresh cannot obtain more scope');
  const imp = await fetch(base + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${rt.access_token}` }, body: JSON.stringify({ kind: 'text', text: 'hello' }) });
  assert.equal(imp.status, 403, 'read-only OAuth token must not import via REST either');
  assert.equal((await fetch(base + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'x'.repeat(101), redirect_uris: ['https://a.example/cb'] }) })).status, 400, 'DCR client name too long');
});


test('GET /register is the sign-up page, not the client-registration endpoint', async () => {
  // The two share a path. POST must still register an OAuth client; GET must reach the app.
  const get = await fetch(base + '/register', { redirect: 'manual' });
  assert.notEqual(get.status, 405, '瀏覽器打開註冊頁不該拿到 method_not_allowed');
  assert.ok(get.status === 200 || get.status === 404, `SPA 或（未建置時）404，實際 ${get.status}`);
  assert.ok(!(get.headers.get('content-type') ?? '').includes('application/json'), '不是 OAuth 的 JSON 錯誤');

  const post = await fetch(base + '/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'path collision check', redirect_uris: ['https://example.com/cb'] }),
  });
  assert.equal(post.status, 201, 'DCR 照舊可用');
  assert.ok((await post.json()).client_id);
});
