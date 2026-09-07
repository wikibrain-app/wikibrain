-- Phase 1 data model (PRD 6.2). users/session/account are created by better-auth in milestone 2.
-- workspace_id is TEXT to match the type of better-auth user.id.

CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT        PRIMARY KEY,
  owner_user_id TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT '我的知識庫',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id           BIGSERIAL   PRIMARY KEY,
  workspace_id TEXT        NOT NULL,
  path         TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  content_md   TEXT        NOT NULL,
  version      INTEGER     NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, path)
);
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS note_versions (
  id         BIGSERIAL   PRIMARY KEY,
  note_id    BIGINT      NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  version    INTEGER     NOT NULL,
  title      TEXT        NOT NULL,
  content_md TEXT        NOT NULL,
  author     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (note_id, version)
);

-- [[wiki-link]] targets are stored verbatim (target) and resolved on read; links to pages that do not exist yet are allowed.
CREATE TABLE IF NOT EXISTS links (
  from_note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  workspace_id TEXT   NOT NULL,
  target       TEXT   NOT NULL,
  PRIMARY KEY (from_note_id, target)
);
CREATE INDEX IF NOT EXISTS links_ws_target ON links (workspace_id, target);

CREATE TABLE IF NOT EXISTS tags (
  note_id      BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  workspace_id TEXT   NOT NULL,
  tag          TEXT   NOT NULL,
  PRIMARY KEY (note_id, tag)
);
CREATE INDEX IF NOT EXISTS tags_ws_tag ON tags (workspace_id, tag);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id           BIGSERIAL   PRIMARY KEY,
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL,
  token_hash   TEXT        NOT NULL UNIQUE,
  label        TEXT        NOT NULL DEFAULT 'default',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

-- Backfill a v1 snapshot for existing Phase 0 notes.
INSERT INTO note_versions (note_id, version, title, content_md, author)
SELECT id, version, title, content_md, 'phase0' FROM notes
ON CONFLICT DO NOTHING;
