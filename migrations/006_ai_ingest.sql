-- Q9: user-supplied API key, server-side automatic Ingest.
CREATE TABLE IF NOT EXISTS ai_providers (
  user_id     TEXT        PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  provider    TEXT        NOT NULL,            -- anthropic | openai | openrouter
  model       TEXT        NOT NULL,
  key_cipher  TEXT        NOT NULL,            -- AES-256-GCM (see src/crypto.ts)
  key_last4   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id           BIGSERIAL   PRIMARY KEY,
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  paths        TEXT[]      NOT NULL,
  provider     TEXT        NOT NULL,
  model        TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'queued',   -- queued | running | done | failed
  log          JSONB       NOT NULL DEFAULT '[]',
  tokens_in    INTEGER     NOT NULL DEFAULT 0,
  tokens_out   INTEGER     NOT NULL DEFAULT 0,
  steps        INTEGER     NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ingest_jobs_ws ON ingest_jobs (workspace_id, created_at DESC);
