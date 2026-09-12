import type pg from 'pg';
import { track } from './events.js';
import { pool } from './db.js';
import { pick, type Bilingual, type Lang } from './lang.js';

export const LAYERS = ['raw', 'wiki', 'schema'] as const;
export type Layer = (typeof LAYERS)[number];

export interface NoteRow {
  id: number;
  path: string;
  title: string;
  content_md: string;
  version: number;
  updated_at: Date;
}
export interface NoteSummary {
  path: string;
  title: string;
  version: number;
  updated_at: Date;
}
export interface Actor {
  kind: 'mcp' | 'web' | 'system' | 'agent';
  name: string;
}
const authorOf = (a: Actor) => `${a.kind}:${a.name}`;

// Error messages may be a single string (same text for both languages) or { 'zh-TW', en }; the API layer picks one via localized() by workspace language.
export class NoteError extends Error {
  readonly messages: string | Bilingual;
  constructor(public code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_PATH' | 'FORBIDDEN' | 'BUSY', message: string | Bilingual) {
    super(pick(message));
    this.messages = message;
  }
  localized(lang: Lang): string { return pick(this.messages, lang); }
}
export class ConflictError extends NoteError {
  constructor(message: string | Bilingual, public current: { version: number; content: string; updated_at: Date }) {
    super('CONFLICT', message);
  }
}

/* ── Path rules: three-layer prefix, .md suffix, no .. or control characters ── */
export function normalizePath(raw: string): string {
  const p = raw.trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  const segs = p.split('/');
  const bad = (why: Bilingual) => new NoteError('BAD_PATH', { 'zh-TW': `路徑不合法：${raw}（${why['zh-TW']}）`, en: `Invalid path: ${raw} (${why.en})` });
  if (!(LAYERS as readonly string[]).includes(segs[0])) throw bad({ 'zh-TW': '須以 raw/、wiki/ 或 schema/ 開頭', en: 'must start with raw/, wiki/ or schema/' });
  if (segs.length < 2 || !p.endsWith('.md')) throw bad({ 'zh-TW': '須為層內檔案且以 .md 結尾', en: 'must be a file inside a layer and end with .md' });
  if (segs.some(s => s === '' || s === '.' || s === '..')) throw bad({ 'zh-TW': '不得含空段或 ..', en: 'must not contain empty segments or ..' });
  if (/[\\\x00-\x1f]/.test(p) || p.length > 512) throw bad({ 'zh-TW': '含不允許的字元或過長', en: 'contains disallowed characters or is too long' });
  // These are URL delimiters: a path holding one can be stored but never opened, and % breaks decoding on the way back.
  if (/[%?#]/.test(p)) throw bad({ 'zh-TW': '不得含 %、? 或 #', en: 'must not contain %, ? or #' });
  if (segs[segs.length - 1] === '.md') throw bad({ 'zh-TW': '檔名不得為空', en: 'file name must not be empty' });
  return p;
}
export function normalizeFolder(raw: string | undefined): string {
  const p = (raw ?? '').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (p === '') return '';
  const segs = p.split('/');
  if (!(LAYERS as readonly string[]).includes(segs[0]) || segs.some(s => s === '' || s === '.' || s === '..') || /[\\\x00-\x1f%_]/.test(p)) {
    throw new NoteError('BAD_PATH', { 'zh-TW': `資料夾不合法：${raw}`, en: `Invalid folder: ${raw}` });
  }
  return p;
}
export const layerOf = (path: string): Layer => path.split('/')[0] as Layer;
/** A note title rendered inside a prompt: single line, no structural markers, truncated. */
export const safeTitle = (title: string): string => {
  const flat = (title ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[`<>#*_[\]|]/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat || '(untitled)';
};

/* ── Content parsing: title, [[wiki-link]], front-matter tags ── */
function titleFrom(path: string, content: string): string {
  const body = stripFrontMatter(content);
  const h1 = body.match(/^#\s+(.+?)\s*$/m);
  return h1 ? h1[1] : path.split('/').pop()!.replace(/\.md$/, '');
}
function stripFrontMatter(content: string): string {
  return content.startsWith('---\n') ? content.replace(/^---\n[\s\S]*?\n---\n?/, '') : content;
}
export function parseLinks(content: string): string[] {
  const out = new Set<string>();
  const prose = content.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of prose.matchAll(/\[\[([^\[\]|#\n]+)(?:[#|][^\[\]\n]*)?\]\]/g)) {
    const t = m[1].trim();
    if (t) out.add(t);
  }
  // Academic 2: pandoc-style citations [@key], [@a; @b, p. 12] → target is the citation_key (the source page filename, resolved by basename)
  // The character class excludes [ ] and newlines: otherwise every [[ would scan to the end of the text (O(n²); 1 MB of malicious input could stall the whole VM)
  for (const m of prose.matchAll(/\[(@[^\[\]\n]+)\]/g)) for (const k of m[1].matchAll(/@([\p{L}\p{N}_:.-]+)/gu)) out.add(k[1].replace(/[.:]+$/, ''));
  return [...out];
}
export function parseTags(content: string): string[] {
  if (!content.startsWith('---\n')) return [];
  const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m);
  let raw: string[] = [];
  if (inline) raw = inline[1].split(',');
  else {
    const block = fm.match(/^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
    if (block) raw = block[1].split('\n').map(l => l.replace(/^[ \t]+-\s*/, ''));
  }
  return [...new Set(raw.map(t => t.trim().replace(/^["']|["']$/g, '').replace(/^#/, '').toLowerCase()).filter(Boolean))];
}

function snippet(raw: string, query: string, width = 160): string {
  const content = stripFrontMatter(raw);
  const i = content.toLowerCase().indexOf(query.toLowerCase());
  const start = i < 0 ? 0 : Math.max(0, i - Math.floor(width / 3));
  return content.slice(start, start + width).replace(/\s+/g, ' ');
}
const likeEscape = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`);

/* ── [[wiki-link]] resolution rules (the single source of truth; the frontend's resolveLink mirrors it) ──
   Precedence: full path > with .md > layer prefix plus .md > basename > title. */
const LINK_RESOLVE_SQL = `
  SELECT t.target, (
    SELECT n.id FROM notes n
     WHERE n.workspace_id = $1 AND n.deleted_at IS NULL
       AND (n.path = t.target OR n.path = t.target || '.md'
            OR n.path IN ('raw/' || t.target || '.md', 'wiki/' || t.target || '.md', 'schema/' || t.target || '.md')
            OR n.basename = t.target OR n.title = t.target)
     ORDER BY (n.path = t.target) DESC, (n.path = t.target || '.md') DESC,
              (n.path IN ('raw/' || t.target || '.md', 'wiki/' || t.target || '.md', 'schema/' || t.target || '.md')) DESC,
              (n.basename = t.target) DESC, n.path
     LIMIT 1) AS id
  FROM unnest($2::text[]) AS t(target)`;

async function resolveTargets(c: pg.PoolClient, ws: string, targets: string[]): Promise<Map<string, number>> {
  if (!targets.length) return new Map();
  const { rows } = await c.query<{ target: string; id: number | null }>(LINK_RESOLVE_SQL, [ws, targets]);
  return new Map(rows.filter(r => r.id !== null).map(r => [r.target, r.id!]));
}

// After a page is created / revived / retitled, repoint dangling links in the workspace whose target matches it (so linking before creating still connects).
async function repointDanglingLinks(c: pg.PoolClient, ws: string, noteId: number): Promise<void> {
  const { rows } = await c.query<{ path: string; title: string; basename: string }>(
    'SELECT path, title, basename FROM notes WHERE id = $1', [noteId]);
  const n = rows[0];
  if (!n) return;
  const noMd = n.path.replace(/\.md$/, '');
  const candidates = [...new Set([n.path, noMd, noMd.replace(/^[^/]+\//, ''), n.basename, n.title])];
  await c.query(
    `UPDATE links SET to_note_id = $1
      WHERE workspace_id = $2 AND to_note_id IS NULL AND from_note_id <> $1 AND target = ANY($3::text[])`,
    [noteId, ws, candidates],
  );
}

/* ── Save side effects: version snapshot, links, tags (in the same transaction) ── */
async function writeDerived(c: pg.PoolClient, ws: string, noteId: number, version: number, title: string, content: string, actor: Actor) {
  await c.query(
    `INSERT INTO note_versions (note_id, version, title, content_md, author) VALUES ($1, $2, $3, $4, $5)`,
    [noteId, version, title, content, authorOf(actor)],
  );
  await c.query('DELETE FROM links WHERE from_note_id = $1', [noteId]);
  const targets = parseLinks(content);
  const resolved = await resolveTargets(c, ws, targets);
  for (const target of targets) {
    await c.query('INSERT INTO links (from_note_id, workspace_id, target, to_note_id) VALUES ($1, $2, $3, $4)', [noteId, ws, target, resolved.get(target) ?? null]);
  }
  await repointDanglingLinks(c, ws, noteId);
  await c.query('DELETE FROM tags WHERE note_id = $1', [noteId]);
  for (const tag of parseTags(content)) {
    await c.query('INSERT INTO tags (note_id, workspace_id, tag) VALUES ($1, $2, $3)', [noteId, ws, tag]);
  }
}
async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/* ── Queries (every query filters by workspace_id and deleted_at IS NULL) ── */
export async function searchNotes(ws: string, opts: { query: string; folder?: string; tag?: string; limit: number }) {
  const folder = normalizeFolder(opts.folder);
  const query = opts.query.replace(/\x00/g, '');   // Postgres rejects NUL in a text parameter with a 500-shaped error
  const params: unknown[] = [ws, `%${likeEscape(query)}%`];
  let where = `n.workspace_id = $1 AND n.deleted_at IS NULL AND (n.title ILIKE $2 OR n.content_md ILIKE $2)`;
  if (folder) { params.push(`${folder}/%`); where += ` AND n.path LIKE $${params.length}`; }
  if (opts.tag) { params.push(opts.tag.replace(/^#/, '').toLowerCase()); where += ` AND EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.tag = $${params.length})`; }
  params.push(opts.limit);
  const { rows } = await pool.query<NoteRow>(
    `SELECT n.id, n.path, n.title, n.content_md, n.version, n.updated_at FROM notes n
      WHERE ${where} ORDER BY n.updated_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(r => ({ path: r.path, title: r.title, version: r.version, snippet: snippet(r.content_md, opts.query) }));
}

export async function readNote(ws: string, rawPath: string): Promise<NoteRow> {
  const path = normalizePath(rawPath);
  const { rows } = await pool.query<NoteRow>(
    `SELECT id, path, title, content_md, version, updated_at FROM notes
      WHERE workspace_id = $1 AND path = $2 AND deleted_at IS NULL`,
    [ws, path],
  );
  if (!rows[0]) throw new NoteError('NOT_FOUND', { 'zh-TW': `找不到筆記：${path}`, en: `Note not found: ${path}` });
  return rows[0];
}

export const MAX_CONTENT_BYTES = 1024 * 1024; // 1 MB per page
function assertContentSize(content: string) {
  if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) throw new NoteError('BAD_PATH', { 'zh-TW': '單頁內容超過 1 MB 上限，請拆頁或改為附件', en: 'Page content exceeds the 1 MB limit; split the page or use an attachment' });
  if (content.includes('\x00')) throw new NoteError('BAD_PATH', { 'zh-TW': '內容含 NUL 字元', en: 'Content contains a NUL character' });   // text columns cannot hold it
}
export async function createNote(ws: string, rawPath: string, content: string, actor: Actor) {
  if (actor.kind === 'mcp' || actor.kind === 'agent') track('first_ai_write', { workspaceId: ws }, { actor: actor.kind, path: rawPath });
  assertContentSize(content);
  const path = normalizePath(rawPath);
  const title = titleFrom(path, content);
  return tx(async c => {
    // Revive a soft-deleted note at the same path (version numbering continues), otherwise insert; a live note at the same path → CONFLICT.
    const { rows } = await c.query<{ id: number; version: number; revived: boolean }>(
      `INSERT INTO notes (workspace_id, path, title, content_md)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, path) DO UPDATE
         SET title = EXCLUDED.title, content_md = EXCLUDED.content_md,
             version = notes.version + 1, updated_at = now(), deleted_at = NULL
         WHERE notes.deleted_at IS NOT NULL
       RETURNING id, version, (xmax <> 0) AS revived`,
      [ws, path, title, content],
    );
    if (!rows[0]) throw new NoteError('CONFLICT', { 'zh-TW': `筆記已存在：${path}（請改用 update_note 並帶 if_version）`, en: `Note already exists: ${path} (use update_note with if_version instead)` });
    await writeDerived(c, ws, rows[0].id, rows[0].version, title, content, actor);
    return { path, title, version: rows[0].version };
  });
}

export async function updateNote(ws: string, rawPath: string, content: string, ifVersion: number, actor: Actor) {
  // Number.isInteger(1e308) is true; Postgres disagrees. Reject before the query does, with a message the caller can act on.
  if (!Number.isSafeInteger(ifVersion) || ifVersion < 1) throw new NoteError('BAD_PATH', { 'zh-TW': `if_version 必須是正整數：${ifVersion}`, en: `if_version must be a positive integer: ${ifVersion}` });
  if (actor.kind === 'mcp' || actor.kind === 'agent') track('first_ai_write', { workspaceId: ws }, { actor: actor.kind, path: rawPath });
  assertContentSize(content);
  const path = normalizePath(rawPath);
  if (layerOf(path) === 'raw') throw new NoteError('FORBIDDEN', { 'zh-TW': `raw/ 為唯讀來源層，不可更新：${path}`, en: `raw/ is the read-only source layer and cannot be updated: ${path}` });
  const title = titleFrom(path, content);
  return tx(async c => {
    const { rows } = await c.query<{ id: number; version: number }>(
      `UPDATE notes SET title = $3, content_md = $4, version = version + 1, updated_at = now()
        WHERE workspace_id = $1 AND path = $2 AND deleted_at IS NULL AND version = $5
        RETURNING id, version`,
      [ws, path, title, content, ifVersion],
    );
    if (!rows[0]) {
      const cur = await c.query<NoteRow>(
        `SELECT id, path, title, content_md, version, updated_at FROM notes
          WHERE workspace_id = $1 AND path = $2 AND deleted_at IS NULL`,
        [ws, path],
      );
      if (!cur.rows[0]) throw new NoteError('NOT_FOUND', { 'zh-TW': `找不到筆記：${path}`, en: `Note not found: ${path}` });
      const n = cur.rows[0];
      throw new ConflictError(
        { 'zh-TW': `版本衝突：${path} 目前為 v${n.version}，你帶的 if_version=${ifVersion}。請以目前內容為基礎重新編輯後再送。`,
          en: `Version conflict: ${path} is currently v${n.version}, but you sent if_version=${ifVersion}. Re-edit from the current content and submit again.` },
        { version: n.version, content: n.content_md, updated_at: n.updated_at },
      );
    }
    await writeDerived(c, ws, rows[0].id, rows[0].version, title, content, actor);
    return { path, title, version: rows[0].version };
  });
}

export async function listFolder(ws: string, rawFolder?: string) {
  const folder = normalizeFolder(rawFolder);
  if (folder === '') {
    return { folder: '', folders: [...LAYERS], notes: [] as NoteSummary[] };
  }
  const prefix = `${folder}/`;
  const { rows } = await pool.query<NoteSummary>(
    `SELECT path, title, version, updated_at FROM notes
      WHERE workspace_id = $1 AND deleted_at IS NULL AND path LIKE $2 ORDER BY path`,
    [ws, `${likeEscape(prefix)}%`],
  );
  const folders = new Set<string>();
  const notes: NoteSummary[] = [];
  for (const r of rows) {
    const rest = r.path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash < 0) notes.push(r);
    else folders.add(prefix + rest.slice(0, slash));
  }
  return { folder, folders: [...folders].sort(), notes };
}

// All schema/ pages concatenated in path order; effectively the knowledge base's CLAUDE.md.
export async function getInstructions(ws: string, lang: Lang = 'zh-TW'): Promise<string> {
  const { rows } = await pool.query<{ path: string; content_md: string }>(
    `SELECT path, content_md FROM notes
      WHERE workspace_id = $1 AND deleted_at IS NULL AND path LIKE 'schema/%' ORDER BY path`,
    [ws],
  );
  // Karpathy: before starting, the agent sees which sources are in raw/ but not yet compiled into wiki/.
  const pending = await listPendingSources(ws);
  /* A pending source's title comes from the page that was imported, so it is attacker-controlled text being placed
     inside the document the agent treats as its rules — the shortest path in, reached before the agent has even read
     the page. Keep it to one harmless line: no newlines to open a new section, no markers that could pass for
     structure, and short enough that it cannot carry a paragraph of instructions. */
  const list = pending.map(p => `- ${p.path}（${safeTitle(p.title)}）`).join('\n');
  const head = !pending.length ? '' : lang === 'en'
    ? `<!-- pending sources -->\n## Pending sources (${pending.length})\n\nThese raw/ sources have no wiki/ page linking back to them yet. Ingest each one following the schema rules, and append a log.md entry after each:\n${list}\n\n---\n\n`
    : `<!-- 待編纂來源 -->\n## 待編纂的來源（${pending.length}）\n\n以下 raw/ 來源還沒有任何 wiki/ 頁連回它，請依規則的 Ingest 步驟處理，做完每一則都要在 wiki/log.md 追加紀錄：\n${list}\n\n---\n\n`;
  if (!rows.length) {
    return head + (lang === 'en' ? [
      '(No rule pages in schema/ yet.)',
      '',
      'This knowledge base has three layers: raw/ holds read-only sources, wiki/ holds AI-compiled pages, schema/ holds the compilation rules.',
      'Start by calling create_note to write schema/instructions.md with the rules you want the agent to follow; get_instructions will return it from then on.',
    ] : [
      '（schema/ 層尚無任何規則頁。）',
      '',
      '這座知識庫採三層架構：raw/ 為唯讀原始來源，wiki/ 為 AI 編纂的知識頁，schema/ 為編纂規則。',
      '建議先用 create_note 建立 schema/instructions.md，寫下你希望 agent 遵守的編纂規則；之後每次 get_instructions 都會回傳它。',
    ]).join('\n');
  }
  return head + rows.map(r => `<!-- ${r.path} -->\n${r.content_md.trim()}`).join('\n\n---\n\n');
}

// Backlinks: non-deleted notes whose links.to_note_id points at this page, O(k).
export async function getBacklinks(ws: string, note: Pick<NoteRow, 'id'>): Promise<NoteSummary[]> {
  const { rows } = await pool.query<NoteSummary>(
    `SELECT DISTINCT n.path, n.title, n.version, n.updated_at FROM links l
       JOIN notes n ON n.id = l.from_note_id
      WHERE l.workspace_id = $1 AND l.to_note_id = $2 AND n.deleted_at IS NULL AND n.id <> $2
      ORDER BY n.path`,
    [ws, note.id],
  );
  return rows;
}

/* ── Extra queries for the web UI (milestone 3) ── */
export async function listNotes(ws: string): Promise<NoteSummary[]> {
  const { rows } = await pool.query<NoteSummary>(
    `SELECT path, title, version, updated_at FROM notes
      WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY path`,
    [ws],
  );
  return rows;
}

export async function readNoteWithAuthor(ws: string, rawPath: string): Promise<NoteRow & { author: string }> {
  const n = await readNote(ws, rawPath);
  const { rows } = await pool.query<{ author: string }>(
    `SELECT author FROM note_versions WHERE note_id = $1 AND version = $2`,
    [n.id, n.version],
  );
  return { ...n, author: rows[0]?.author ?? '' };
}

export interface VersionRow {
  version: number;
  title: string;
  author: string;
  created_at: Date;
  content_md: string;
}
export async function listVersions(ws: string, rawPath: string): Promise<VersionRow[]> {
  const n = await readNote(ws, rawPath);
  const { rows } = await pool.query<VersionRow>(
    `SELECT version, title, author, created_at, content_md FROM note_versions
      WHERE note_id = $1 ORDER BY version DESC`,
    [n.id],
  );
  return rows;
}

// Soft delete: set deleted_at; version snapshots are kept, and a later create at the same path revives it with continued version numbering.
export async function deleteNote(ws: string, rawPath: string): Promise<void> {
  const path = normalizePath(rawPath);
  // Decision 19: raw/ sources are immutable and cannot be deleted from any client; archive them instead (archiveNote).
  if (layerOf(path) === 'raw') throw new NoteError('FORBIDDEN', { 'zh-TW': `raw/ 為不可變的來源層，不能刪除：${path}。要收起來請用「封存」`, en: `raw/ is the immutable source layer and cannot be deleted: ${path}. Use "Archive" instead` });
  const { rowCount } = await pool.query(
    `UPDATE notes SET deleted_at = now(), updated_at = now()
      WHERE workspace_id = $1 AND path = $2 AND deleted_at IS NULL`,
    [ws, path],
  );
  if (!rowCount) throw new NoteError('NOT_FOUND', { 'zh-TW': `找不到筆記：${path}`, en: `Note not found: ${path}` });
}

// Archive a raw source: move it under raw/archive/ (same note id, versions and links stay); archived sources are not pending.
export const ARCHIVE_PREFIX = 'raw/archive/';
export async function archiveNote(ws: string, rawPath: string, undo = false): Promise<{ path: string }> {
  const path = normalizePath(rawPath);
  if (layerOf(path) !== 'raw') throw new NoteError('BAD_PATH', { 'zh-TW': '只有 raw/ 來源可以封存', en: 'Only raw/ sources can be archived' });
  const archived = path.startsWith(ARCHIVE_PREFIX);
  if (undo && !archived) throw new NoteError('BAD_PATH', { 'zh-TW': '這頁沒有封存', en: 'This page is not archived' });
  if (!undo && archived) throw new NoteError('BAD_PATH', { 'zh-TW': '這頁已經封存', en: 'This page is already archived' });
  let target = undo ? `raw/sources/${path.slice(ARCHIVE_PREFIX.length).split('/').pop()}` : ARCHIVE_PREFIX + path.slice('raw/'.length);
  const taken = async (p: string) => (await pool.query(`SELECT 1 FROM notes WHERE workspace_id = $1 AND path = $2`, [ws, p])).rowCount;
  if (await taken(target)) { const base = target.replace(/\.md$/, ''); let i = 2; while (await taken(`${base}-${i}.md`)) i++; target = `${base}-${i}.md`; }
  const { rowCount } = await pool.query(`UPDATE notes SET path = $3, updated_at = now() WHERE workspace_id = $1 AND path = $2 AND deleted_at IS NULL`, [ws, path, target]);
  if (!rowCount) throw new NoteError('NOT_FOUND', { 'zh-TW': `找不到筆記：${path}`, en: `Note not found: ${path}` });
  return { path: target };
}

// Rollback = create a new version with the old content (history stays linear), still guarded by the optimistic lock.
export async function rollbackNote(ws: string, rawPath: string, version: number, ifVersion: number, actor: Actor) {
  const n = await readNote(ws, rawPath);
  const { rows } = await pool.query<{ content_md: string }>(
    `SELECT content_md FROM note_versions WHERE note_id = $1 AND version = $2`,
    [n.id, version],
  );
  if (!rows[0]) throw new NoteError('NOT_FOUND', { 'zh-TW': `找不到版本：${n.path} v${version}`, en: `Version not found: ${n.path} v${version}` });
  return updateNote(ws, n.path, rows[0].content_md, ifVersion, actor);
}

// Graph: nodes = non-deleted notes; edges = resolved links (to_note_id), O(E).
export async function getGraph(ws: string) {
  const { rows: created } = await pool.query<{ path: string; created_at: Date }>(`SELECT path, created_at FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL`, [ws]);
  const createdAt = new Map(created.map(r => [r.path, r.created_at.toISOString()]));
  const nodes = (await listNotes(ws)).map(n => ({ path: n.path, title: n.title, layer: layerOf(n.path), created_at: createdAt.get(n.path) ?? n.updated_at.toISOString() }));
  const { rows } = await pool.query<{ from: string; to: string }>(
    `SELECT DISTINCT f.path AS "from", t.path AS "to"
       FROM links l
       JOIN notes f ON f.id = l.from_note_id AND f.deleted_at IS NULL
       JOIN notes t ON t.id = l.to_note_id  AND t.deleted_at IS NULL
      WHERE l.workspace_id = $1 AND f.id <> t.id`,
    [ws],
  );
  return { nodes, edges: rows };
}

/* ── Karpathy Ingest state: a raw/ source with no wiki/ page linking back to it is "pending" ── */
export interface PendingSource { path: string; title: string; updated_at: Date }
export async function listPendingSources(ws: string): Promise<PendingSource[]> {
  const { rows } = await pool.query<PendingSource>(
    `SELECT n.path, n.title, n.updated_at FROM notes n
      WHERE n.workspace_id = $1 AND n.deleted_at IS NULL AND n.path LIKE 'raw/%' AND n.path NOT LIKE 'raw/archive/%'
        AND n.basename <> 'README'
        AND NOT EXISTS (
          SELECT 1 FROM links l JOIN notes f ON f.id = l.from_note_id
           WHERE l.to_note_id = n.id AND f.deleted_at IS NULL AND f.path LIKE 'wiki/%')
      ORDER BY n.updated_at DESC`,
    [ws],
  );
  return rows;
}

// Ingest prompt for the agent (or for a person to paste to one); matches the six Ingest steps in schema/instructions.md.
export function ingestPrompt(paths: string[], lang: Lang = 'zh-TW'): string {
  const list = paths.map(p => `- ${p}`).join('\n');
  if (lang === 'en') return `Call get_instructions first to read the compilation rules. Then ingest the following sources following the rules' Ingest steps:\n${list}\nFor each source: read it in full, search_notes for related pages, create a wiki/sources/ summary page linking back to the source, update related entity and concept pages, update wiki/index.md, and append an ingest entry to wiki/log.md. Finish by reporting which pages you touched.`;
  return `先呼叫 get_instructions 讀編纂規則。然後依規則的 Ingest 六步處理下列來源：\n${list}\n每個來源都要：讀完整篇、search_notes 找相關頁、建 wiki/sources/ 摘要頁並連回來源、更新相關實體與概念頁、更新 wiki/index.md、在 wiki/log.md 追加 ingest 條目。做完回報動到哪些頁。`;
}

/* ── front-matter properties (for the Obsidian Bases / Dataview-style table) ── */
export type PropValue = string | number | boolean | string[] | null;
// Quoted values: JSON-style (renderSource writes with JSON.stringify) → JSON.parse to restore escapes; otherwise just strip the outer quotes
const unq = (v: string): string => {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) { try { const j = JSON.parse(v); if (typeof j === 'string') return j; } catch { /* not JSON */ } }
  return v.replace(/^["']|["']$/g, '');
};
export function parseFrontMatter(content: string): Record<string, PropValue> {
  if (!content.startsWith('---\n')) return {};
  const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!fm) return {};
  const out: Record<string, PropValue> = {};
  const lines = fm.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_\-\u4e00-\u9fff]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]; let raw = m[2].trim();
    if (raw === '') { // block list
      const items: string[] = [];
      while (i + 1 < lines.length && /^[ \t]+-\s*/.test(lines[i + 1])) { items.push(lines[++i].replace(/^[ \t]+-\s*/, '').trim().replace(/^["']|["']$/g, '')); }
      out[key] = items.length ? items : null; continue;
    }
    if (raw.startsWith('[') && raw.endsWith(']')) { // inline list: quoted items may contain commas
      const items = [...raw.slice(1, -1).matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|([^,"']+)/g)].map(m => (m[1] !== undefined ? unq(`"${m[1]}"`) : (m[2] ?? m[3])).trim()).filter(Boolean);
      out[key] = items; continue;
    }
    raw = unq(raw);
    if (raw === 'true' || raw === 'false') out[key] = raw === 'true';
    else if (/^-?\d+(\.\d+)?$/.test(raw)) out[key] = Number(raw);
    else out[key] = raw;
  }
  return out;
}

export interface NoteProps { path: string; title: string; version: number; created_at: Date; updated_at: Date; author: string; inbound: number; props: Record<string, PropValue> }
// List notes in a folder with their properties (including system fields); the caller aggregates the key set.
export async function listNoteProps(ws: string, folder?: string): Promise<NoteProps[]> {
  const f = normalizeFolder(folder);
  const { rows } = await pool.query<{ path: string; title: string; version: number; created_at: Date; updated_at: Date; content_md: string; author: string; inbound: string }>(
    `SELECT n.path, n.title, n.version, n.created_at, n.updated_at, n.content_md,
            coalesce((SELECT v.author FROM note_versions v WHERE v.note_id = n.id ORDER BY v.version DESC LIMIT 1), '') AS author,
            (SELECT count(DISTINCT l.from_note_id) FROM links l JOIN notes f ON f.id = l.from_note_id WHERE l.to_note_id = n.id AND f.deleted_at IS NULL AND f.id <> n.id) AS inbound
       FROM notes n WHERE n.workspace_id = $1 AND n.deleted_at IS NULL ${f ? 'AND n.path LIKE $2' : ''} ORDER BY n.path`,
    f ? [ws, `${likeEscape(f)}/%`] : [ws],
  );
  return rows.map(r => ({ path: r.path, title: r.title, version: r.version, created_at: r.created_at, updated_at: r.updated_at, author: r.author, inbound: Number(r.inbound), props: parseFrontMatter(r.content_md) }));
}
