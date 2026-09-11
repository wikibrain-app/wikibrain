import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

/* Bot protection on registration. Cloudflare is not called for real: siteverify is stubbed so the suite stays
   offline and deterministic. What is exercised is the decision — no token, a rejected token, a good token, and a
   Cloudflare that cannot be reached (which must let the person through rather than close registration). */
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';
const realFetch = globalThis.fetch;
const emails: string[] = [];

const stub = (impl: (body: URLSearchParams) => Response) => {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (href.includes('challenges.cloudflare.com')) return impl(new URLSearchParams(String(init?.body ?? '')));
    return realFetch(url as string, init);
  }) as typeof fetch;
};
const signUp = (token?: string) => {
  const email = `ts-${randomBytes(4).toString('hex')}@example.com`;
  emails.push(email);
  return fetch(base + '/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: config.appUrl, ...(token ? { 'x-turnstile-token': token } : {}) },
    body: JSON.stringify({ email, password: 'correct-horse-battery', name: 'x', callbackURL: '/' }),
  });
};
const accounts = async () => Number((await pool.query<{ n: string }>(
  `SELECT count(*)::text AS n FROM "user" WHERE email = ANY($1)`, [emails])).rows[0].n);

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  globalThis.fetch = realFetch;
  delete process.env.TURNSTILE_SITE_KEY; delete process.env.TURNSTILE_SECRET_KEY;
  server.close();
  if (emails.length) await pool.query('DELETE FROM "user" WHERE email = ANY($1)', [emails]);
  await pool.end();
});

test('with no keys configured, registration is untouched', async () => {
  delete process.env.TURNSTILE_SITE_KEY; delete process.env.TURNSTILE_SECRET_KEY;
  const { turnstileOn } = await import('../src/turnstile.js');
  assert.equal(turnstileOn(), false, '自架與開發環境不需要 Cloudflare 帳號');
  assert.equal((await signUp()).status, 200, '沒設 key 時照常註冊');
  assert.equal((await (await fetch(base + '/api/config')).json()).turnstileSiteKey, null);
});

test('once configured, a sign-up without a valid token creates no account', async () => {
  process.env.TURNSTILE_SITE_KEY = '0x-site'; process.env.TURNSTILE_SECRET_KEY = '0x-secret';
  assert.equal((await (await fetch(base + '/api/config')).json()).turnstileSiteKey, '0x-site', '前端拿得到公開的 site key');

  const before_ = await accounts();
  assert.equal((await signUp()).status, 403, '沒有 token 直接擋下');

  stub(() => Response.json({ success: false, 'error-codes': ['invalid-input-response'] }));
  const bad = await signUp('a-token-cloudflare-rejects');
  assert.equal(bad.status, 403);
  assert.equal((await bad.json()).error, 'TURNSTILE');
  assert.equal(await accounts(), before_, '被擋下的請求沒有建立任何帳號');

  let sawSecret = '';
  stub(body => { sawSecret = body.get('secret') ?? ''; return Response.json({ success: true }); });
  assert.equal((await signUp('a-token-cloudflare-accepts')).status, 200, '通過驗證就照常註冊');
  assert.equal(sawSecret, '0x-secret', 'secret 只在伺服器端使用');
  assert.equal(await accounts(), before_ + 1);
});

test('a secret Cloudflare rejects is our bug: registration stays open and it is recorded', async () => {
  process.env.TURNSTILE_SITE_KEY = '0x-site'; process.env.TURNSTILE_SECRET_KEY = 'wrong-secret';
  const before_ = Number((await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM events WHERE kind = 'turnstile_misconfigured'`)).rows[0].n);

  stub(() => Response.json({ success: false, 'error-codes': ['invalid-input-secret'] }));
  assert.equal((await signUp('a-token')).status, 200, '打錯 secret 不該把所有人擋在門外');
  globalThis.fetch = realFetch;

  // track() 不 await，所以要等那一列真的寫進去
  const count = async () => Number((await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM events WHERE kind = 'turnstile_misconfigured'`)).rows[0].n);
  for (let i = 0; i < 100 && await count() <= before_; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(await count() - before_, 1, '記一筆，營運頁才看得到「註冊目前沒有防護」');
  await pool.query(`DELETE FROM events WHERE kind = 'turnstile_misconfigured'`);
});

test('an unreachable Cloudflare lets people register rather than closing the door', async () => {
  process.env.TURNSTILE_SITE_KEY = '0x-site'; process.env.TURNSTILE_SECRET_KEY = '0x-secret';
  stub(() => { throw new Error('network down'); });
  assert.equal((await signUp('any-token')).status, 200, '驗證服務掛掉時不能把所有人擋在門外');
  globalThis.fetch = realFetch;
});
