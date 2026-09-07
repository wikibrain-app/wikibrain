import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { hashToken } from './auth.js';

export interface TokenInfo {
  id: number;
  label: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  kind: 'pat' | 'oauth';
  expires_at: Date | null;
}

export const generateToken = () => `wb_live_${randomBytes(24).toString('hex')}`;

// The plaintext is returned once, at creation; the database stores only the sha256.
export async function createToken(workspaceId: string, userId: string, label: string) {
  const token = generateToken();
  const { rows } = await pool.query<TokenInfo>(
    `INSERT INTO mcp_tokens (workspace_id, user_id, token_hash, label) VALUES ($1, $2, $3, $4)
     RETURNING id, label, created_at, last_used_at, revoked_at, kind, expires_at`,
    [workspaceId, userId, hashToken(token), label.trim() || 'default'],
  );
  return { ...rows[0], token };
}

export async function listTokens(workspaceId: string): Promise<TokenInfo[]> {
  const { rows } = await pool.query<TokenInfo>(
    `SELECT id, label, created_at, last_used_at, revoked_at, kind, expires_at FROM mcp_tokens
      WHERE workspace_id = $1 AND NOT (kind = 'oauth' AND revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days') ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows;
}

export async function revokeToken(workspaceId: string, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE mcp_tokens SET revoked_at = now() WHERE workspace_id = $1 AND id = $2 AND revoked_at IS NULL`,
    [workspaceId, id],
  );
  return (rowCount ?? 0) > 0;
}
