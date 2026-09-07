-- Chat (the Karpathy Query operation): server-side agent, conversations stored as JSONB; the jobs table gains kind to distinguish ingest/chat.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id           BIGSERIAL   PRIMARY KEY,
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL DEFAULT '新對話',
  messages     JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_sessions_ws ON chat_sessions (workspace_id, updated_at DESC);
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'ingest';
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS session_id BIGINT;
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS result TEXT;
