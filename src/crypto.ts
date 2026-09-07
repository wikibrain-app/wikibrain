import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from './config.js';
import { pool } from './db.js';

/* ── Secret encryption (API keys, Zotero keys) ──
   v2: the key is derived via HKDF from KEY_ENCRYPTION_SECRET (or the file named by KEY_ENCRYPTION_SECRET_FILE). This secret is kept separate from BETTER_AUTH_SECRET,
       so if the whole environment leaks (like the Zeabur 2026-08 incident) user keys still cannot be decrypted without the second secret; a file mount keeps it out of env vars entirely.
   v1: legacy, derived from BETTER_AUTH_SECRET, used only to decrypt old ciphertexts; `npm run keys:rotate` re-encrypts all v1 ciphertexts in the database to v2.
   Production (NODE_ENV=production) refuses to start without a v2 secret. */

const derive = (secret: string, info: string) => Buffer.from(hkdfSync('sha256', secret, 'wikibrain', info, 32));
let cache: { sig: string; v1: Buffer; v2: Buffer | null } | null = null;

export function encryptionSecretSource(): { source: 'file' | 'env' | 'none'; secret: string | null } {
  const file = process.env.KEY_ENCRYPTION_SECRET_FILE?.trim();
  if (file) { try { const s = readFileSync(file, 'utf8').trim(); if (s) return { source: 'file', secret: s }; } catch (e) { throw new Error(`讀不到 KEY_ENCRYPTION_SECRET_FILE（${file}）：${(e as Error).message}`); } }
  const env = process.env.KEY_ENCRYPTION_SECRET?.trim();
  if (env) return { source: 'env', secret: env };
  return { source: 'none', secret: null };
}
function keys() {
  const src = encryptionSecretSource();
  const sig = `${src.source}:${src.secret ?? ''}:${config.authSecret}`;
  if (!cache || cache.sig !== sig) {
    if (src.secret && src.secret.length < 32) throw new Error('KEY_ENCRYPTION_SECRET 至少 32 字元（建議 openssl rand -hex 32）');
    if (src.secret && src.secret === config.authSecret) throw new Error('KEY_ENCRYPTION_SECRET 不可與 BETTER_AUTH_SECRET 相同');
    cache = { sig, v1: derive(config.authSecret, 'api-key-encryption'), v2: src.secret ? derive(src.secret, 'api-key-encryption-v2') : null };
  }
  return cache;
}
export const encryptionVersion = (): 'v2' | 'v1' => (keys().v2 ? 'v2' : 'v1');

// Production requires a dedicated encryption secret; development falls back to v1 with a warning
export function assertEncryptionReady(): void {
  const v = encryptionVersion();
  if (v === 'v1') {
    const msg = 'KEY_ENCRYPTION_SECRET 未設定：用戶 API key 目前只靠 BETTER_AUTH_SECRET 保護。請設 KEY_ENCRYPTION_SECRET（或 KEY_ENCRYPTION_SECRET_FILE）後執行 npm run keys:rotate。';
    if (process.env.NODE_ENV === 'production') throw new Error(`拒絕啟動：${msg}`);
    console.warn(`⚠ ${msg}`);
  }
}

export function encrypt(plain: string): string {
  const k = keys(); const v = k.v2 ? 'v2' : 'v1'; const key = k.v2 ?? k.v1;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${v}.${iv.toString('base64url')}.${ct.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
}

export function decrypt(token: string): string {
  const [v, iv, ct, tag] = token.split('.');
  if ((v !== 'v1' && v !== 'v2') || !iv || !ct || !tag) throw new Error('密文格式不正確');
  const k = keys();
  const key = v === 'v2' ? k.v2 : k.v1;
  if (!key) throw new Error('這筆密文是 v2 加密，但目前沒有 KEY_ENCRYPTION_SECRET');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

// Re-encrypt every ciphertext in the database that is not the current version (ai_providers.key_cipher, zotero_links.key_cipher). Returns the row count changed per table.
// scope: only rotate these users / workspaces (for tests, to avoid touching others' data in a shared database); omit for the whole database
export async function reencryptAll(scope?: { userIds?: string[]; workspaceIds?: string[] }): Promise<{ ai_providers: number; zotero_links: number; version: 'v1' | 'v2' }> {
  const target = encryptionVersion();
  const out = { ai_providers: 0, zotero_links: 0, version: target };
  for (const [table, idCol] of [['ai_providers', 'user_id'], ['zotero_links', 'workspace_id']] as const) {
    const ids = table === 'ai_providers' ? scope?.userIds : scope?.workspaceIds;
    if (scope && !ids?.length) continue;
    const { rows } = await pool.query<{ id: string; key_cipher: string }>(`SELECT ${idCol} AS id, key_cipher FROM ${table}${scope ? ` WHERE ${idCol} = ANY($1::text[])` : ''}`, scope ? [ids] : []);
    for (const r of rows) {
      if (r.key_cipher.startsWith(`${target}.`)) continue;
      const plain = decrypt(r.key_cipher);
      await pool.query(`UPDATE ${table} SET key_cipher = $2 WHERE ${idCol} = $1 AND key_cipher = $3`, [r.id, encrypt(plain), r.key_cipher]);
      out[table]++;
    }
  }
  return out;
}
