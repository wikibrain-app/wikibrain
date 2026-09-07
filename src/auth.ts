import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { pool } from './db.js';
import { isLang, type Lang } from './lang.js';
import { config } from './config.js';

export interface AuthContext {
  workspaceId: string;
  lang: Lang;
  userId: string;
  tokenId: number;
  label: string;
  scopes: string[];
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Only the token hash is stored; lookup compares hashes for equality (PRD R8).
export async function authenticateToken(token: string): Promise<AuthContext | null> {
  const { rows } = await pool.query<{ id: number; workspace_id: string; user_id: string; label: string; lang: string; scopes: string[] }>(
    `SELECT t.id, t.workspace_id, t.user_id, t.label, t.scopes, w.lang FROM mcp_tokens t JOIN workspaces w ON w.id = t.workspace_id
      WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())`,
    [hashToken(token)],
  );
  const t = rows[0];
  if (!t) return null;
  // last_used_at is updated at most once per minute and never blocks the request.
  void pool.query(
    `UPDATE mcp_tokens SET last_used_at = now()
      WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
    [t.id],
  ).catch(err => console.error('Failed to update last_used_at:', err));
  return { workspaceId: t.workspace_id, userId: t.user_id, tokenId: t.id, label: t.label, lang: isLang(t.lang) ? t.lang : 'zh-TW', scopes: t.scopes ?? ['notes:read', 'notes:write'] };
}

export async function bearerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const auth = token ? await authenticateToken(token) : null;
  if (auth) {
    res.locals.auth = auth;
    next();
    return;
  }
  res
    .status(401)
    .set('WWW-Authenticate', `Bearer realm="wikibrain", resource_metadata="${config.appUrl}/.well-known/oauth-protected-resource/mcp"`)
    .json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
}
