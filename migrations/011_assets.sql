-- Image attachments (Karpathy tip: store article images locally so the LLM can see them and links do not rot).
-- Content lives in Postgres (no object storage in v1); isolated per workspace; notes reference /api/assets/<id>, rewritten to raw/assets/<filename> on export.
CREATE TABLE IF NOT EXISTS assets (
  id           TEXT        PRIMARY KEY,
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename     TEXT        NOT NULL,
  mime         TEXT        NOT NULL,
  size         INTEGER     NOT NULL,
  data         BYTEA       NOT NULL,
  source_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_ws ON assets (workspace_id, created_at DESC);
