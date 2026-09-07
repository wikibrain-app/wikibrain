import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { storeAsset } from '../src/assets.js';

// Public share links: create → anonymous read (note + embedded image) → revoke → 404; deleted note → 404; other
// workspaces cannot see or revoke; unknown / malformed tokens 404; nothing else in the workspace is reachable.
const email = `share-${randomBytes(4).toString('hex')}@example.com`, email2 = `share2-${randomBytes(4).toString('hex')}@example.com`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', cookie2 = '', wsId = '';
const login = async (em: string) => {
  await auth.api.signUpEmail({ body: { email: em, password: 'correct-horse-battery', name: 'share' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [em]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email: em, password: 'correct-horse-battery' }) });
  return r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
};
const api = async (method: string, path: string, body?: unknown, ck = cookie) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie: ck }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const anon = (path: string) => fetch(base + path);
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cookie = await login(email); cookie2 = await login(email2);
  wsId = (await api('GET', '/api/me')).data.workspace.id;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = ANY($1)', [[email, email2]]); await pool.end(); });

test('share link: create, anonymous read with embedded image, idempotent, revoke, re-share gives a new token', async () => {
  const img = await storeAsset(wsId, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000300b0fbe0b30000000049454e44ae426082', 'hex'), 'dot.png');
  const path = 'wiki/shared-page.md';
  assert.equal((await api('POST', '/api/notes', { path, content: `# Shared page\n\n公開內容 [[secret]]\n\n![dot](/api/assets/${img.id})` })).status, 201);
  assert.equal((await api('GET', `/api/share?path=${path}`)).data.share, null);
  const c = await api('POST', '/api/share', { path }); assert.equal(c.status, 201);
  const { token, url } = c.data.share; assert.match(token, /^wbs_[A-Za-z0-9_-]{20,}$/); assert.ok(url.endsWith('/s/' + token));
  assert.equal((await api('POST', '/api/share', { path })).data.share.token, token, 'sharing again returns the same live link');
  const pub = await anon(`/api/public/share/${token}`); assert.equal(pub.status, 200); assert.equal(pub.headers.get('x-robots-tag'), 'noindex, nofollow');
  const j = await pub.json(); assert.equal(j.title, 'Shared page'); assert.match(j.content, /公開內容/); assert.equal(j.layer, 'wiki');
  const asset = await anon(`/api/public/share/${token}/assets/${img.id}`); assert.equal(asset.status, 200); assert.equal(asset.headers.get('content-type'), 'image/png');
  // an asset the shared page does not embed stays private
  const other = await storeAsset(wsId, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000300b0fbe0b30000000049454e44ae426082', 'hex'), 'other.png');
  assert.equal((await anon(`/api/public/share/${token}/assets/${other.id}`)).status, 404);
  // the rest of the workspace is not reachable through the token
  assert.equal((await anon('/api/notes/tree')).status, 401);
  // another workspace can neither see nor revoke it
  assert.equal((await api('GET', `/api/share?path=${path}`, undefined, cookie2)).data.share, null);
  assert.equal((await api('DELETE', `/api/share?path=${path}`, undefined, cookie2)).data.revoked, false);
  assert.equal((await anon(`/api/public/share/${token}`)).status, 200);
  // revoke
  assert.equal((await api('DELETE', `/api/share?path=${path}`)).data.revoked, true);
  assert.equal((await anon(`/api/public/share/${token}`)).status, 404);
  assert.equal((await anon(`/api/public/share/${token}/assets/${img.id}`)).status, 404);
  const again = (await api('POST', '/api/share', { path })).data.share; assert.notEqual(again.token, token);
  // deleting the note kills the link; malformed / unknown tokens 404; missing note cannot be shared
  assert.equal((await api('DELETE', `/api/notes?path=${path}`)).status, 200);
  assert.equal((await anon(`/api/public/share/${again.token}`)).status, 404);
  assert.equal((await anon('/api/public/share/wbs_nope')).status, 404);
  assert.equal((await anon('/api/public/share/%3Cscript%3E')).status, 404);
  assert.equal((await api('POST', '/api/share', { path: 'wiki/does-not-exist.md' })).status, 404);
});
