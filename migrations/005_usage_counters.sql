-- Usage counters (PRD 6.2 usage_counters): only MCP call counts for now; note_count/storage_bytes are computed on read.
CREATE TABLE IF NOT EXISTS usage_counters (
  user_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  month     TEXT NOT NULL,                -- 'YYYY-MM'（UTC）
  mcp_calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
