-- Links are now resolved at write time (PRD 6.3 item 5): links.to_note_id points at the resolved note;
-- the notes.basename generated column + index let the "filename" and "title" rules use an index.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS basename TEXT
  GENERATED ALWAYS AS (regexp_replace(regexp_replace(path, '^.*/', ''), '\.md$', '')) STORED;
CREATE INDEX IF NOT EXISTS notes_ws_basename ON notes (workspace_id, basename);
CREATE INDEX IF NOT EXISTS notes_ws_title    ON notes (workspace_id, title);
CREATE INDEX IF NOT EXISTS notes_ws_updated  ON notes (workspace_id, updated_at);

ALTER TABLE links ADD COLUMN IF NOT EXISTS to_note_id BIGINT REFERENCES notes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS links_to_note ON links (to_note_id);

-- Backfill existing links. Rule precedence: full path > with .md > layer prefix + .md > filename > title.
UPDATE links l SET to_note_id = (
  SELECT n.id FROM notes n
   WHERE n.workspace_id = l.workspace_id AND n.deleted_at IS NULL
     AND (n.path = l.target OR n.path = l.target || '.md'
          OR n.path IN ('raw/' || l.target || '.md', 'wiki/' || l.target || '.md', 'schema/' || l.target || '.md')
          OR n.basename = l.target OR n.title = l.target)
   ORDER BY (n.path = l.target) DESC, (n.path = l.target || '.md') DESC,
            (n.path IN ('raw/' || l.target || '.md', 'wiki/' || l.target || '.md', 'schema/' || l.target || '.md')) DESC,
            (n.basename = l.target) DESC, n.path
   LIMIT 1)
WHERE l.to_note_id IS NULL;
