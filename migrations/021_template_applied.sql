-- Which template version a workspace received, and what the schema pages looked like as delivered.
-- Comparing the stored hash with the page's current content tells us whether the user has edited it, which is the
-- only safe way to offer an update: untouched pages can be replaced, edited ones must never be.
CREATE TABLE IF NOT EXISTS template_applied (
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id  TEXT        NOT NULL,
  lang         TEXT        NOT NULL,
  version      INTEGER     NOT NULL DEFAULT 1,
  files        JSONB       NOT NULL,              -- { "schema/instructions.md": "<sha256 as delivered>", … }
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, template_id)
);
