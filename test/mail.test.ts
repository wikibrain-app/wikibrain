import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

/* A verification or reset link that never arrives leaves someone with an account they cannot use and no way to ask
   for another one. The failure has to be visible to the operator, so it is recorded as an event and shown on the
   status page rather than only logged. */
const marker = randomBytes(4).toString('hex');
const realFetch = globalThis.fetch;
const failures = async () => Number((await pool.query<{ n: string }>(
  `SELECT count(*)::text AS n FROM events WHERE kind = 'email_failed' AND meta->>'subject' = $1`, [marker])).rows[0].n);
/* track() inserts without being awaited, so the row can land just after the call returns. Poll instead of assuming:
   a fixed sleep is either too short on a slow runner or wasted time on a fast one. */
const failuresReach = async (n: number) => {
  for (let i = 0; i < 100 && await failures() < n; i++) await new Promise(r => setTimeout(r, 50));
  return failures();
};

before(async () => { await migrate(); });
after(async () => {
  globalThis.fetch = realFetch;
  await pool.query(`DELETE FROM events WHERE kind IN ('email', 'email_failed') AND meta->>'subject' = $1`, [marker]);
  await pool.end();
});

test('a rejected send is recorded as email_failed and shows up on the operator page', async () => {
  const { sendMail } = await import('../src/mail.js');
  const { ops } = await import('../src/ops.js');
  const before_ = await failures();

  config.resendApiKey = 'test-key-not-used';                                   // take the Resend branch
  globalThis.fetch = (async () => new Response('domain is not verified', { status: 403 })) as typeof fetch;
  await assert.rejects(sendMail({ to: 'nobody@example.com', subject: marker, text: 'x' }), /403/,
    'the caller is told the message did not go out');
  globalThis.fetch = realFetch;
  config.resendApiKey = '';

  assert.equal(await failuresReach(before_ + 1) - before_, 1, 'the failure is recorded');
  const { rows } = await pool.query<{ detail: string }>(
    `SELECT meta->>'detail' AS detail FROM events WHERE kind = 'email_failed' AND meta->>'subject' = $1`, [marker]);
  assert.match(rows[0].detail, /403 .*not verified/, 'the provider reason is kept, so the cause is diagnosable');

  /* The operator console is hosted-only; the open-source build has no such module and simply does not report. */
  const console_ = ops();
  if (console_) {
    const status = await console_.status() as { issues: { kind: string; detail: string }[] };
    assert.ok(status.issues.some(i => i.kind === 'email 未送達' && i.detail.includes('nobody@example.com')),
      'the operator page lists it');
    assert.ok((await console_.degraded()).includes('email_delivery'), 'a recent failure marks the service degraded');
  }
});

test('a send that succeeds is not reported as a failure', async () => {
  const { sendMail } = await import('../src/mail.js');
  const before_ = await failures();
  config.resendApiKey = 'test-key-not-used';
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: 'ok' }), { status: 200 })) as typeof fetch;
  await sendMail({ to: 'somebody@example.com', subject: marker, text: 'x' });
  globalThis.fetch = realFetch;
  config.resendApiKey = '';
  await new Promise(r => setTimeout(r, 300));   // 給背景寫入機會出現，才證明得了它沒有出現
  assert.equal(await failures() - before_, 0);
});
