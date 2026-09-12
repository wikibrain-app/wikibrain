import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { outbox } from '../src/mail.js';

/* Review batch B, the server-side part: someone who signs up with an address that already has an account. better-auth
   answers with the same generic response either way (so the form cannot be used to probe for accounts), which meant
   the person saw "we sent you a verification e-mail" and nothing ever arrived. Now the existing account is told. */
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';
const email = `rb-${randomBytes(4).toString('hex')}@example.com`;
const signUp = () => fetch(base + '/api/auth/sign-up/email', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl },
  body: JSON.stringify({ email, password: 'correct-horse-battery', name: 'rb', callbackURL: '/' }),
});
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('B6: signing up again with an existing address e-mails that account instead of pretending to send a verification', async () => {
  assert.equal((await signUp()).status, 200);
  const verification = outbox.at(-1);
  assert.ok(verification && verification.to === email && /驗證/.test(verification.subject), 'first time: a verification mail');
  const n = outbox.length;

  const again = await signUp();
  assert.equal(again.status, 200, 'same response as the first time, so the form cannot probe for accounts');
  for (let i = 0; i < 40 && outbox.length === n; i++) await new Promise(r => setTimeout(r, 50));   // the notice is sent in the background
  const notice = outbox.at(-1);
  assert.ok(notice && notice.to === email, 'second time: the existing account is told');
  assert.ok(!/驗證/.test(notice!.subject) && /已有帳號|already/i.test(notice!.subject), `not a second verification mail: ${notice!.subject}`);
  assert.match(notice!.text, /\/forgot/, 'the mail gives the reset-password route');
  assert.equal(outbox.length, n + 1, 'exactly one extra mail');
});
