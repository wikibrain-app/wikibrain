import { randomUUID } from 'node:crypto';
import { pool } from './db.js';

import { isLang, type Lang } from './lang.js';
import { NoteError } from './notes.js';

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

/* ── Several knowledge bases per account ──
   The isolation was always there — every query carries workspace_id and every token is bound to one — so what was
   missing is only the ability to say which one. How many you may have is a plan question: one is enough to use the
   product, and keeping separate bases is the kind of thing that comes with using it seriously. */

export const workspaceLimitFor = (plan: 'free' | 'pro'): number =>
  plan === 'pro' ? Number(process.env.PRO_WORKSPACES ?? 10) : Number(process.env.FREE_WORKSPACES ?? 1);

export async function listWorkspacesFor(userId: string): Promise<Workspace[]> {
  const { rows } = await pool.query<Workspace>(
    `SELECT * FROM workspaces WHERE owner_user_id = $1 ORDER BY created_at`, [userId]);
  return rows;
}

/** The workspace a request acts on: the one asked for if it is really theirs, otherwise their first. */
export async function resolveWorkspace(userId: string, wanted?: string | null): Promise<Workspace> {
  if (wanted) {
    const { rows } = await pool.query<Workspace>(
      `SELECT * FROM workspaces WHERE id = $1 AND owner_user_id = $2`, [wanted, userId]);
    if (rows[0]) return rows[0];
  }
  return ensureWorkspaceFor(userId);
}

export async function renameWorkspace(ws: string, userId: string, name: string): Promise<Workspace | null> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new NoteError('BAD_PATH', { 'zh-TW': '名稱不能是空的', en: 'The name cannot be empty' });
  const { rows } = await pool.query<Workspace>(
    `UPDATE workspaces SET name = $3 WHERE id = $1 AND owner_user_id = $2 RETURNING *`, [ws, userId, clean]);
  return rows[0] ?? null;
}

/* Deleting a workspace is the one place where data really goes: its notes, versions, jobs, chats and tokens go with
   it. The last one cannot be deleted — an account with no workspace has nowhere to land — and emptying is offered
   instead, which keeps the history. */
export async function deleteWorkspace(ws: string, userId: string): Promise<boolean> {
  const mine = await listWorkspacesFor(userId);
  if (mine.length <= 1) throw new NoteError('FORBIDDEN', {
    'zh-TW': '這是你唯一的知識庫，不能刪除。想重新開始請用「清空知識庫」，歷史會留著。',
    en: 'This is your only knowledge base, so it cannot be deleted. To start over, empty it instead — the history is kept.',
  });
  const { rowCount } = await pool.query(`DELETE FROM workspaces WHERE id = $1 AND owner_user_id = $2`, [ws, userId]);
  return !!rowCount;
}
