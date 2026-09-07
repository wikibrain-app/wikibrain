import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { encrypt, decrypt, encryptionVersion, encryptionSecretSource, assertEncryptionReady, reencryptAll } from '../src/crypto.js';
import { auth } from '../src/auth-web.js';
import { randomBytes } from 'node:crypto';

delete process.env.KEY_ENCRYPTION_SECRET; delete process.env.KEY_ENCRYPTION_SECRET_FILE; // the test controls the secret itself; ignore .env
// Secret encryption v2: dedicated secret, readable from a file, legacy v1 ciphertext still decrypts, rotate re-encrypts, production refuses to start without a secret.
const email = `crypto-${randomBytes(4).toString('hex')}@example.com`;
after(async () => { delete process.env.KEY_ENCRYPTION_SECRET; delete process.env.KEY_ENCRYPTION_SECRET_FILE; await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('no v2 secret: falls back to v1; production refuses to start, development only warns', () => {
  delete process.env.KEY_ENCRYPTION_SECRET; delete process.env.KEY_ENCRYPTION_SECRET_FILE;
  assert.equal(encryptionVersion(), 'v1'); assert.equal(encryptionSecretSource().source, 'none');
  const v1 = encrypt('sk-legacy'); assert.match(v1, /^v1\./); assert.equal(decrypt(v1), 'sk-legacy');
  const prev = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  assert.throws(() => assertEncryptionReady(), /拒絕啟動/);
  process.env.NODE_ENV = prev; assertEncryptionReady();
});

test('v2 secret (env var or file): new ciphertext is v2, legacy v1 still decrypts; too short or equal to BETTER_AUTH_SECRET is rejected', () => {
  const legacy = encrypt('sk-old');
  process.env.KEY_ENCRYPTION_SECRET = 'a'.repeat(64);
  assert.equal(encryptionVersion(), 'v2'); const v2 = encrypt('sk-new'); assert.match(v2, /^v2\./); assert.equal(decrypt(v2), 'sk-new'); assert.equal(decrypt(legacy), 'sk-old');
  const dir = mkdtempSync(join(tmpdir(), 'wbkey-')); writeFileSync(join(dir, 'k'), 'b'.repeat(64) + '\n');
  process.env.KEY_ENCRYPTION_SECRET_FILE = join(dir, 'k');
  assert.equal(encryptionSecretSource().source, 'file'); const v2b = encrypt('sk-file'); assert.equal(decrypt(v2b), 'sk-file');
  assert.throws(() => decrypt(v2), /bad decrypt|Unsupported state|unable to authenticate/i, 'ciphertext from a different secret does not decrypt');
  delete process.env.KEY_ENCRYPTION_SECRET_FILE;
  process.env.KEY_ENCRYPTION_SECRET = 'short'; assert.throws(() => encrypt('x'), /至少 32 字元/);
  process.env.KEY_ENCRYPTION_SECRET = process.env.BETTER_AUTH_SECRET!; if (process.env.BETTER_AUTH_SECRET!.length >= 32) assert.throws(() => encrypt('x'), /不可與 BETTER_AUTH_SECRET 相同/);
  delete process.env.KEY_ENCRYPTION_SECRET;
});

test('keys:rotate: v1 ciphertext in the database re-encrypted as v2, plaintext unchanged', async () => {
  await migrate();
  delete process.env.KEY_ENCRYPTION_SECRET;
  const u = await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'c' } });
  const userId = u.user.id;
  await pool.query(`INSERT INTO ai_providers (user_id, provider, model, key_cipher, key_last4) VALUES ($1, 'openrouter', 'm', $2, '1234')`, [userId, encrypt('sk-or-rotate-1234')]);
  process.env.KEY_ENCRYPTION_SECRET = 'c'.repeat(64);
  const r = await reencryptAll({ userIds: [userId] }); // only touch this test's data: the shared dev database also holds Daniel's key
  assert.equal(r.version, 'v2'); assert.equal(r.ai_providers, 1);
  const { rows } = await pool.query<{ key_cipher: string }>(`SELECT key_cipher FROM ai_providers WHERE user_id = $1`, [userId]);
  assert.match(rows[0].key_cipher, /^v2\./); assert.equal(decrypt(rows[0].key_cipher), 'sk-or-rotate-1234');
  const again = await reencryptAll({ userIds: [userId] }); assert.equal(again.ai_providers, 0, 'second run has nothing to convert');
});
