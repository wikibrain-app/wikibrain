import { randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { pool } from './db.js';
import { hashToken } from './auth.js';
import { NoteError } from './notes.js';

/* ── OAuth 2.1 authorization server (for Claude.ai / ChatGPT / Cursor connectors) ──
   Flow: client registers via DCR → /authorize (SDK validates client, redirect_uri, PKCE) → we store the request in oauth_requests and redirect to the SPA /oauth/consent
   → the signed-in user approves (POST /api/oauth/approve) → we issue a code and redirect to redirect_uri → the client exchanges it at /token for access + refresh tokens.
   Access tokens live in mcp_tokens (kind=oauth), so bearerAuth on /mcp, rate limiting, usage and revocation from Settings all carry over. */

export const SCOPES = ['notes:read', 'notes:write'];
const ACCESS_TTL_S = 24 * 3600;           // access token 24 hours
const REFRESH_TTL_S = 90 * 24 * 3600;     // refresh token 90 days
const REQUEST_TTL_MS = 10 * 60 * 1000;    // authorization request / code 10 minutes

export const consentPath = (reqId: string) => `/oauth/consent?req=${encodeURIComponent(reqId)}`;

export const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    const { rows } = await pool.query<{ metadata: OAuthClientInformationFull }>(`SELECT metadata FROM oauth_clients WHERE client_id = $1`, [clientId]);
    return rows[0]?.metadata;
  },
  async registerClient(client) {
    if (JSON.stringify(client).length > 8 * 1024) throw new InvalidRequestError('client metadata too large (8 KB max)');
    if ((client.client_name ?? '').length > 100) throw new InvalidRequestError('client_name too long (100 chars max)');
    if (client.redirect_uris.length > 10) throw new InvalidRequestError('too many redirect_uris (10 max)');
    const full: OAuthClientInformationFull = { ...client, client_id: `wbc_${randomBytes(16).toString('hex')}`, client_id_issued_at: Math.floor(Date.now() / 1000) };
    await pool.query(`INSERT INTO oauth_clients (client_id, metadata) VALUES ($1, $2)`, [full.client_id, JSON.stringify(full)]);
    return full;
  },
};

export interface PendingRequest { id: string; client_id: string; client_name: string | null; client_uri: string | null; redirect_uri: string; scopes: string[]; state: string | null; expires_at: Date }

export async function getPendingRequest(id: string): Promise<PendingRequest | null> {
  const { rows } = await pool.query<PendingRequest & { metadata: OAuthClientInformationFull }>(
    `SELECT r.id, r.client_id, r.redirect_uri, r.scopes, r.state, r.expires_at, c.metadata FROM oauth_requests r JOIN oauth_clients c ON c.client_id = r.client_id
      WHERE r.id = $1 AND r.code_hash IS NULL AND r.expires_at > now()`, [id]);
  const r = rows[0]; if (!r) return null;
  return { id: r.id, client_id: r.client_id, client_name: r.metadata.client_name ?? null, client_uri: r.metadata.client_uri ?? null, redirect_uri: r.redirect_uri, scopes: r.scopes, state: r.state, expires_at: r.expires_at };
}

// User clicks "Allow": bind user / workspace, issue the code, return the redirect URL
export async function approveRequest(id: string, userId: string, workspaceId: string): Promise<string> {
  const code = `wbac_${randomBytes(24).toString('hex')}`;
  const { rows } = await pool.query<{ redirect_uri: string; state: string | null }>(
    `UPDATE oauth_requests SET user_id = $2, workspace_id = $3, code_hash = $4, expires_at = now() + interval '10 minutes'
      WHERE id = $1 AND code_hash IS NULL AND expires_at > now() RETURNING redirect_uri, state`, [id, userId, workspaceId, hashToken(code)]);
  const r = rows[0];
  if (!r) throw new NoteError('NOT_FOUND', { 'zh-TW': '授權請求不存在或已過期，請回到 client 重新連接', en: 'Authorization request not found or expired; reconnect from the client' });
  const u = new URL(r.redirect_uri); u.searchParams.set('code', code); if (r.state) u.searchParams.set('state', r.state);
  return u.href;
}
export async function denyRequest(id: string): Promise<string> {
  const { rows } = await pool.query<{ redirect_uri: string; state: string | null }>(`DELETE FROM oauth_requests WHERE id = $1 AND code_hash IS NULL RETURNING redirect_uri, state`, [id]);
  const r = rows[0];
  if (!r) throw new NoteError('NOT_FOUND', { 'zh-TW': '授權請求不存在或已過期', en: 'Authorization request not found or expired' });
  const u = new URL(r.redirect_uri); u.searchParams.set('error', 'access_denied'); if (r.state) u.searchParams.set('state', r.state);
  return u.href;
}

async function issueTokens(client: OAuthClientInformationFull, userId: string, workspaceId: string, scopes: string[]): Promise<OAuthTokens> {
  const access = `wb_oauth_${randomBytes(24).toString('hex')}`, refresh = `wb_refresh_${randomBytes(24).toString('hex')}`;
  await pool.query(
    `INSERT INTO mcp_tokens (workspace_id, user_id, token_hash, label, kind, client_id, expires_at, refresh_token_hash, refresh_expires_at, scopes)
     VALUES ($1, $2, $3, $4, 'oauth', $5, now() + ($6 || ' seconds')::interval, $7, now() + ($8 || ' seconds')::interval, $9)`,
    [workspaceId, userId, hashToken(access), (client.client_name ?? 'OAuth client').slice(0, 60), client.client_id, String(ACCESS_TTL_S), hashToken(refresh), String(REFRESH_TTL_S), scopes.length ? scopes : SCOPES]);
  return { access_token: access, token_type: 'bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(' ') };
}

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() { return clientsStore; },
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    const id = randomUUID();
    const scopes = (params.scopes?.length ? params.scopes : SCOPES).filter(s => SCOPES.includes(s));
    await pool.query(
      `INSERT INTO oauth_requests (id, client_id, redirect_uri, code_challenge, scopes, state, resource, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, client.client_id, params.redirectUri, params.codeChallenge, scopes, params.state ?? null, params.resource?.href ?? null, new Date(Date.now() + REQUEST_TTL_MS)]);
    res.redirect(302, consentPath(id)); // relative path: same origin in production; stays on 5173 via the Vite proxy in development
  },
  async challengeForAuthorizationCode(client, code) {
    const { rows } = await pool.query<{ code_challenge: string }>(`SELECT code_challenge FROM oauth_requests WHERE code_hash = $1 AND client_id = $2 AND code_used_at IS NULL AND expires_at > now()`, [hashToken(code), client.client_id]);
    if (!rows[0]) throw new InvalidGrantError('Invalid or expired authorization code');
    return rows[0].code_challenge;
  },
  async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
    const { rows } = await pool.query<{ user_id: string; workspace_id: string; scopes: string[]; redirect_uri: string }>(
      `UPDATE oauth_requests SET code_used_at = now() WHERE code_hash = $1 AND client_id = $2 AND code_used_at IS NULL AND expires_at > now() AND user_id IS NOT NULL RETURNING user_id, workspace_id, scopes, redirect_uri`,
      [hashToken(code), client.client_id]);
    const r = rows[0];
    if (!r) throw new InvalidGrantError('Invalid or expired authorization code');
    if (redirectUri && redirectUri !== r.redirect_uri) throw new InvalidRequestError('redirect_uri does not match');
    return issueTokens(client, r.user_id, r.workspace_id, r.scopes);
  },
  async exchangeRefreshToken(client, refreshToken, scopes) {
    // Rotation: revoke the old access / refresh pair together and issue a new one
    const { rows } = await pool.query<{ user_id: string; workspace_id: string; scopes: string[] }>(
      `UPDATE mcp_tokens SET revoked_at = now() WHERE refresh_token_hash = $1 AND client_id = $2 AND revoked_at IS NULL AND (refresh_expires_at IS NULL OR refresh_expires_at > now()) RETURNING user_id, workspace_id, scopes`,
      [hashToken(refreshToken), client.client_id]);
    const r = rows[0];
    if (!r) throw new InvalidGrantError('Invalid or expired refresh token');
    const granted = r.scopes ?? SCOPES;
    return issueTokens(client, r.user_id, r.workspace_id, (scopes?.length ? scopes : granted).filter(s => granted.includes(s))); // may narrow, never widen
  },
  async verifyAccessToken(token): Promise<AuthInfo> {
    const { rows } = await pool.query<{ client_id: string | null; expires_at: Date | null }>(`SELECT client_id, expires_at FROM mcp_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, [hashToken(token)]);
    if (!rows[0]) throw new InvalidGrantError('Invalid token');
    return { token, clientId: rows[0].client_id ?? 'pat', scopes: SCOPES, expiresAt: rows[0].expires_at ? Math.floor(rows[0].expires_at.getTime() / 1000) : undefined };
  },
  async revokeToken(client, request: OAuthTokenRevocationRequest) {
    const h = hashToken(request.token);
    await pool.query(`UPDATE mcp_tokens SET revoked_at = now() WHERE client_id = $1 AND revoked_at IS NULL AND (token_hash = $2 OR refresh_token_hash = $2)`, [client.client_id, h]);
  },
};

// Expired authorization requests are purged hourly (scheduled at server start)
export function scheduleOAuthCleanup(): NodeJS.Timeout {
  const run = () => pool.query(`DELETE FROM oauth_requests WHERE expires_at < now() - interval '1 day'`)
    // DCR is public: clients that registered but never obtained a token and have no pending request are removed after 30 days
    .then(() => pool.query(`DELETE FROM oauth_clients c WHERE c.created_at < now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM mcp_tokens t WHERE t.client_id = c.client_id) AND NOT EXISTS (SELECT 1 FROM oauth_requests r WHERE r.client_id = c.client_id)`))
    .catch(err => console.error('OAuth cleanup failed:', err));
  const t = setInterval(run, 3600_000); t.unref(); return t;
}
