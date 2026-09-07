-- Custom templates (Daniel: the three built-ins must be duplicable and customizable): files stored as JSONB [{path, content}].
CREATE TABLE IF NOT EXISTS user_templates (
  id           BIGSERIAL   PRIMARY KEY,
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  prompt       TEXT        NOT NULL DEFAULT '',
  base_id      TEXT,
  files        JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_templates_ws ON user_templates (workspace_id, updated_at DESC);
