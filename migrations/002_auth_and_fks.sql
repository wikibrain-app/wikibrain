-- The four core better-auth 1.7 tables (generated from getSchema(authOptions); account.issuer is new in 1.7).
CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT        NOT NULL PRIMARY KEY,
  "name"          TEXT        NOT NULL,
  "email"         TEXT        NOT NULL UNIQUE,
  "emailVerified" BOOLEAN     NOT NULL,
  "image"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "session" (
  "id"        TEXT        NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token"     TEXT        NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId"    TEXT        NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "account" (
  "id"                    TEXT        NOT NULL PRIMARY KEY,
  "issuer"                TEXT        NOT NULL,
  "accountId"             TEXT        NOT NULL,
  "providerId"            TEXT        NOT NULL,
  "userId"                TEXT        NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "identifier" TEXT        NOT NULL,
  "value"      TEXT        NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

-- Foreign keys deliberately deferred from milestone 1. Those pointing at user use NOT VALID: only new rows are constrained,
-- so local Phase 0 dev-user orphan rows can stay until db:seed moves them to a real dev account and cleans up.
CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON workspaces (owner_user_id);
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_owner_fk FOREIGN KEY (owner_user_id) REFERENCES "user" ("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE mcp_tokens
  ADD CONSTRAINT mcp_tokens_user_fk FOREIGN KEY (user_id) REFERENCES "user" ("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE notes
  ADD CONSTRAINT notes_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE;
