import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { NoteError, readNote } from './notes.js';
import { getAsset } from './assets.js';

/* ── Public share links (P1 "公開分享") ──
   A share is a read-only, unlisted URL /s/<token> for one note. The token is the only credential: 16 random bytes,
   base64url, prefixed wbs_. Anyone with the link can read the note's current content and the images it embeds
   (served through /api/public/share/<token>/assets/<id>, scoped to the share's workspace). Nothing else in the
   workspace is reachable. Revoking invalidates the link immediately; sharing again issues a new token. */

export interface ShareInfo { token: string; url: string; created_at: Date }
const newToken = () => 'wbs_' + randomBytes(16).toString('base64url');

export async function getShare(ws: string, path: string): Promise<ShareInfo | null> {
  const { rows } = await pool.query<{ token: string; created_at: Date }>(
    `SELECT s.token, s.created_at FROM shares s JOIN notes n ON n.id = s.note_id
     WHERE s.workspace_id = $1 AND n.workspace_id = $1 AND n.path = $2 AND n.deleted_at IS NULL AND s.revoked_at IS NULL
     ORDER BY s.created_at DESC LIMIT 1`, [ws, path]);
  return rows[0] ? { ...rows[0], url: shareUrl(rows[0].token) } : null;
}
export async function createShare(ws: string, path: string, userId: string): Promise<ShareInfo> {
  const existing = await getShare(ws, path); if (existing) return existing;
  const note = await readNote(ws, path); // throws NOT_FOUND for missing / deleted notes
  const token = newToken();
  const { rows } = await pool.query<{ created_at: Date }>(`INSERT INTO shares (token, workspace_id, note_id, created_by) VALUES ($1, $2, $3, $4) RETURNING created_at`, [token, ws, note.id, userId]);
  return { token, url: shareUrl(token), created_at: rows[0].created_at };
}
export async function revokeShare(ws: string, path: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE shares s SET revoked_at = now() FROM notes n
     WHERE n.id = s.note_id AND s.workspace_id = $1 AND n.workspace_id = $1 AND n.path = $2 AND s.revoked_at IS NULL`, [ws, path]);
  return (rowCount ?? 0) > 0;
}
export interface SharedNote { path: string; title: string; content: string; updated_at: Date; layer: 'raw' | 'wiki' | 'schema' }
/** Public read: the token alone authorises. Returns null when unknown, revoked, or the note was deleted. */
export async function readShared(token: string): Promise<(SharedNote & { workspace_id: string }) | null> {
  if (!/^wbs_[A-Za-z0-9_-]{16,32}$/.test(token)) return null;
  const { rows } = await pool.query<{ workspace_id: string; path: string; title: string; content_md: string; updated_at: Date }>(
    `SELECT n.workspace_id, n.path, n.title, n.content_md, n.updated_at FROM shares s JOIN notes n ON n.id = s.note_id
     WHERE s.token = $1 AND s.revoked_at IS NULL AND n.deleted_at IS NULL`, [token]);
  const r = rows[0]; if (!r) return null;
  return { workspace_id: r.workspace_id, path: r.path, title: r.title, content: r.content_md, updated_at: r.updated_at, layer: r.path.split('/')[0] as SharedNote['layer'] };
}
/** An image embedded in a shared note: only assets of the share's own workspace, and only while the share is live. */
export async function readSharedAsset(token: string, assetId: string) {
  const s = await readShared(token); if (!s) return null;
  if (!s.content.includes(`/api/assets/${assetId}`)) return null; // only images the shared page actually embeds
  return getAsset(s.workspace_id, assetId);
}
export const shareUrl = (token: string) => `${(process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/s/${token}`;
export { NoteError };
