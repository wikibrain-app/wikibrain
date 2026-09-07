-- Public share links (P1): one read-only link per note. The token is the whole secret (unguessable, 128-bit);
-- revoking sets revoked_at. Sharing again after revoking issues a new token.
CREATE TABLE IF NOT EXISTS shares (
  token        TEXT        PRIMARY KEY,
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  note_id      INTEGER     NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS shares_note ON shares (note_id) WHERE revoked_at IS NULL;
