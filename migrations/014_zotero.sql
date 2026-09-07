-- Zotero sync (Q10 academic item 3): one Zotero link per workspace; Zotero stays the source of truth for bibliography, we only pull new items into raw/sources/ for the agent to ingest.
CREATE TABLE IF NOT EXISTS zotero_links (
  workspace_id    TEXT        PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  key_cipher      TEXT        NOT NULL,          -- Zotero API key（AES-256-GCM）
  key_last4       TEXT        NOT NULL,
  zotero_user_id  TEXT        NOT NULL,          -- looked up via /keys/<key>
  username        TEXT,
  collection_key  TEXT,                          -- NULL = the whole personal library
  collection_name TEXT,
  library_version INTEGER     NOT NULL DEFAULT 0, -- Last-Modified-Version reached by the previous sync (for incremental pulls)
  with_pdf        BOOLEAN     NOT NULL DEFAULT true,
  last_sync_at    TIMESTAMPTZ,
  last_result     JSONB,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
