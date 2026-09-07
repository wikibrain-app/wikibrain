// npm run keys:rotate: run once after setting KEY_ENCRYPTION_SECRET to re-encrypt all v1 ciphertexts as v2. Safe to re-run (v2 rows are skipped).
import 'dotenv/config';
import { encryptionVersion, reencryptAll } from './crypto.js';
import { pool } from './db.js';

if (encryptionVersion() !== 'v2') { console.error('KEY_ENCRYPTION_SECRET (or KEY_ENCRYPTION_SECRET_FILE) is not set; nothing to rotate.'); process.exit(1); }
const r = await reencryptAll();
console.log(`Re-encrypted to v2: ai_providers ${r.ai_providers} rows, zotero_links ${r.zotero_links} rows`);
await pool.end();
