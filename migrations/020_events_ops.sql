-- Product events for the PRD §8 funnel (signup → verified → mcp_connected → first_ai_write → upgrade / churn) and a small
-- key/value table the backup cron writes into (latest dump, latest restore drill) so the admin page can show them.
CREATE TABLE IF NOT EXISTS events (
  id           BIGSERIAL   PRIMARY KEY,
  kind         TEXT        NOT NULL,
  user_id      TEXT,
  workspace_id TEXT,
  meta         JSONB,
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_kind_at ON events (kind, at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS events_once_per_ws ON events (kind, workspace_id) WHERE kind IN ('verified', 'mcp_connected', 'first_ai_write');

CREATE TABLE IF NOT EXISTS ops_status (
  key   TEXT        PRIMARY KEY,
  value JSONB       NOT NULL,
  at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
