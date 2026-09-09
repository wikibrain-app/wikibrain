import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dir = fileURLToPath(new URL('../migrations/', import.meta.url));

// Plain SQL migrations: sorted by filename; unapplied ones run inside a transaction and are recorded.
// Serialized with an advisory lock when several processes start at once (a watch-mode restart, a rolling redeploy) to avoid double-applying.
const MIGRATE_LOCK_KEY = 7_281_942_001;

export async function migrate(): Promise<string[]> {
  const lock = await pool.connect();
  await lock.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK_KEY]);
  try {
    await lock.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
    const { rows } = await lock.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map(r => r.name));
    const applied: string[] = [];
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(dir + f, 'utf8');
      try {
        await lock.query('BEGIN');
        await lock.query(sql);
        await lock.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await lock.query('COMMIT');
        applied.push(f);
      } catch (e) {
        await lock.query('ROLLBACK');
        throw e;
      }
    }
    return applied;
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK_KEY]).catch(() => {});
    lock.release();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const applied = await migrate();
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No new migrations');
  await pool.end();
}
