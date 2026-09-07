-- OAuth 2.1 + Dynamic Client Registration (PRD P1; step three of the decision 15 build order).
-- Access tokens still live in mcp_tokens (bearerAuth/rate limit/usage unchanged), plus kind/client_id/expires_at/refresh_token_hash.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id   TEXT        PRIMARY KEY,
  metadata    JSONB       NOT NULL,          -- OAuthClientInformationFull (includes client_secret; public DCR clients usually have none)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Authorization requests (awaiting user approval at /oauth/consent) and authorization codes (exchanged for tokens) share one table
CREATE TABLE IF NOT EXISTS oauth_requests (
  id             TEXT        PRIMARY KEY,     -- request id; code_hash is filled in on approval
  client_id      TEXT        NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri   TEXT        NOT NULL,
  code_challenge TEXT        NOT NULL,
  scopes         TEXT[]      NOT NULL DEFAULT '{}',
  state          TEXT,
  resource       TEXT,
  user_id        TEXT,
  workspace_id   TEXT,
  code_hash      TEXT        UNIQUE,
  code_used_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'pat';   -- pat｜oauth
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT UNIQUE;
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS oauth_requests_expires ON oauth_requests (expires_at);
