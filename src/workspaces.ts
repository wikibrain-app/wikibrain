import { randomUUID } from 'node:crypto';
import { pool } from './db.js';

import { isLang, type Lang } from './lang.js';

export interface Workspace { id: string; owner_user_id: string; name: string; lang: Lang; created_at: Date }

export async function workspaceLang(workspaceId: string): Promise<Lang> {
  const { rows } = await pool.query<{ lang: string }>(`SELECT lang FROM workspaces WHERE id = $1`, [workspaceId]);
  return isLang(rows[0]?.lang) ? rows[0].lang : 'zh-TW';
}
export async function setWorkspaceLang(workspaceId: string, lang: Lang): Promise<void> {
  if (!isLang(lang)) throw new Error('bad lang');
  // If the name is still the default, switch it with the language; leave user-chosen names alone
  await pool.query(`UPDATE workspaces SET lang = $2, name = CASE WHEN name = ANY($3::text[]) THEN $4 ELSE name END WHERE id = $1`,
    [workspaceId, lang, Object.values(DEFAULT_NAME), DEFAULT_NAME[lang]]);
}

// One workspace per user in v1; the schema is reserved for the P2 team edition (non-owner membership will get its own table).
const DEFAULT_NAME: Record<Lang, string> = { 'zh-TW': '我的知識庫', en: 'My knowledge base' };
export async function createWorkspaceFor(userId: string, lang: Lang = 'zh-TW', name?: string): Promise<Workspace> {
  const l: Lang = isLang(lang) ? lang : 'zh-TW';
  const { rows } = await pool.query<Workspace>(
    `INSERT INTO workspaces (id, owner_user_id, name, lang) VALUES ($1, $2, $3, $4) RETURNING *`,
    [randomUUID(), userId, name ?? DEFAULT_NAME[l], l],
  );
  return rows[0];
}

export async function getWorkspaceFor(userId: string): Promise<Workspace | null> {
  const { rows } = await pool.query<Workspace>(
    `SELECT * FROM workspaces WHERE owner_user_id = $1 ORDER BY created_at LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function ensureWorkspaceFor(userId: string, lang: Lang = 'zh-TW'): Promise<Workspace> {
  return (await getWorkspaceFor(userId)) ?? createWorkspaceFor(userId, lang);
}

/* ── Start over without losing the account ──
   Between "delete one page" and "delete the whole account" there was nothing, so anyone who filled a workspace while
   trying the product out had no way back to an empty one. This empties it the same way deleting a page does — the row
   keeps its deleted_at and every version snapshot stays — so the knowledge base is gone from every view but the text
   is still in the database, and creating a page at the same path revives it with its history intact. Anything that is
   really destructive stays with account deletion.

   Shares are revoked because a public link is a promise to someone outside: `readShared` would already 404 on a
   deleted page, but leaving live tokens pointing at emptied pages is not a state worth keeping. Conversations, agent
   job history and the stored API key are not the knowledge base and survive. */
export async function resetWorkspace(ws: string): Promise<{ notes: number; shares: number }> {
  const notes = await pool.query(`UPDATE notes SET deleted_at = now() WHERE workspace_id = $1 AND deleted_at IS NULL`, [ws]);
  const shares = await pool.query(
    `UPDATE shares SET revoked_at = now() WHERE revoked_at IS NULL AND note_id IN (SELECT id FROM notes WHERE workspace_id = $1)`, [ws]);
  return { notes: notes.rowCount ?? 0, shares: shares.rowCount ?? 0 };
}
