import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNote, NoteError, type Actor } from './notes.js';

// Scenario templates (PRD R9, Q7): a template = schema/ rule pages + starter folders + onboarding prompt; it affects content only, never the UI.
// Applying is "add without overwriting": existing paths are always skipped, so a template can be re-applied or stacked with a second one.
const root = fileURLToPath(new URL('../templates/', import.meta.url));
export type Lang = 'zh-TW' | 'en';
export const LANGS: Lang[] = ['zh-TW', 'en'];

export interface TemplateInfo {
  id: string;
  name: Record<Lang, string>;
  description: Record<Lang, string>;
  prompt: Record<Lang, string>;
}

export async function listTemplates(): Promise<TemplateInfo[]> {
  const ids = (await readdir(root)).filter(d => !d.startsWith('.'));
  const out: TemplateInfo[] = [];
  for (const id of ids.sort()) {
    try { out.push(JSON.parse(await readFile(join(root, id, 'template.json'), 'utf8')) as TemplateInfo); }
    catch { /* not a template directory */ }
  }
  // general goes first
  return out.sort((a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : a.id.localeCompare(b.id)));
}

async function walk(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir);
  const files: string[] = [];
  for (const e of entries.sort()) {
    const full = join(dir, e);
    if ((await stat(full)).isDirectory()) files.push(...await walk(full, `${prefix}${e}/`));
    else if (e.endsWith('.md')) files.push(`${prefix}${e}`);
  }
  return files;
}

export async function applyTemplate(workspaceId: string, id: string, lang: Lang, actor: Actor) {
  const templates = await listTemplates();
  const info = templates.find(t => t.id === id);
  if (!info) throw new NoteError('NOT_FOUND', { 'zh-TW': `找不到模版：${id}`, en: `Template not found: ${id}` });
  const dir = join(root, id, lang);
  const files = await walk(dir);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const path of files) {
    const content = await readFile(join(dir, path), 'utf8');
    try {
      await createNote(workspaceId, path, content, actor);
      created.push(path);
    } catch (e) {
      if (e instanceof NoteError && e.code === 'CONFLICT') skipped.push(path);
      else throw e;
    }
  }
  return { id, lang, created, skipped, prompt: info.prompt[lang] };
}

// Preview: return all files of a template (path + content) to inspect before applying.
export async function templateFiles(id: string, lang: Lang): Promise<{ path: string; content: string }[]> {
  const templates = await listTemplates();
  if (!templates.find(t => t.id === id)) throw new NoteError('NOT_FOUND', { 'zh-TW': `找不到模版：${id}`, en: `Template not found: ${id}` });
  const dir = join(root, id, lang);
  const files = await walk(dir);
  return Promise.all(files.map(async path => ({ path, content: await readFile(join(dir, path), 'utf8') })));
}

/* ── Custom templates: copy from built-in, snapshot the current schema/, edit, apply, delete ── */
import { pool } from './db.js';
import { normalizePath } from './notes.js';

export interface CustomTemplate { id: number; workspace_id: string; name: string; description: string; prompt: string; base_id: string | null; files: { path: string; content: string }[]; created_at: Date; updated_at: Date }

export async function listCustomTemplates(ws: string): Promise<Omit<CustomTemplate, 'files'>[]> {
  const { rows } = await pool.query(`SELECT id, workspace_id, name, description, prompt, base_id, created_at, updated_at FROM user_templates WHERE workspace_id = $1 ORDER BY updated_at DESC`, [ws]);
  return rows;
}
export async function getCustomTemplate(ws: string, id: number): Promise<CustomTemplate | null> {
  const { rows } = await pool.query<CustomTemplate>(`SELECT * FROM user_templates WHERE workspace_id = $1 AND id = $2`, [ws, id]);
  return rows[0] ?? null;
}
function checkFiles(files: unknown): { path: string; content: string }[] {
  if (!Array.isArray(files) || files.length === 0) throw new NoteError('BAD_PATH', { 'zh-TW': '模版至少要有一個檔案', en: 'A template needs at least one file' });
  const seen = new Set<string>();
  return files.map((f: any) => {
    if (typeof f?.path !== 'string' || typeof f?.content !== 'string') throw new NoteError('BAD_PATH', { 'zh-TW': '檔案需要 path 與 content', en: 'Each file needs path and content' });
    const path = normalizePath(f.path);
    if (seen.has(path)) throw new NoteError('BAD_PATH', { 'zh-TW': `重複的路徑：${path}`, en: `Duplicate path: ${path}` });
    seen.add(path);
    return { path, content: f.content };
  });
}
export async function createCustomTemplate(ws: string, userId: string, t: { name: string; description?: string; prompt?: string; base_id?: string | null; files: unknown }): Promise<CustomTemplate> {
  const files = checkFiles(t.files);
  const { rows } = await pool.query<CustomTemplate>(
    `INSERT INTO user_templates (workspace_id, user_id, name, description, prompt, base_id, files) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [ws, userId, t.name.trim() || '未命名模版', t.description ?? '', t.prompt ?? '', t.base_id ?? null, JSON.stringify(files)],
  );
  return rows[0];
}
// Copy from a built-in template
export async function duplicateBuiltin(ws: string, userId: string, id: string, lang: Lang): Promise<CustomTemplate> {
  const info = (await listTemplates()).find(t => t.id === id);
  if (!info) throw new NoteError('NOT_FOUND', { 'zh-TW': `找不到模版：${id}`, en: `Template not found: ${id}` });
  const files = await templateFiles(id, lang);
  return createCustomTemplate(ws, userId, { name: `${info.name[lang]}（自訂）`, description: info.description[lang], prompt: info.prompt[lang], base_id: id, files });
}
// Save all schema/ pages of the current workspace (plus index / log if present) as a template
export async function snapshotSchemaAsTemplate(ws: string, userId: string, name: string): Promise<CustomTemplate> {
  const { rows } = await pool.query<{ path: string; content_md: string }>(
    `SELECT path, content_md FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL AND (path LIKE 'schema/%' OR path IN ('wiki/index.md', 'wiki/log.md')) ORDER BY path`, [ws]);
  if (!rows.some(r => r.path.startsWith('schema/'))) throw new NoteError('NOT_FOUND', { 'zh-TW': 'schema/ 還沒有任何規則頁', en: 'schema/ has no rule pages yet' });
  const files = rows.map(r => ({ path: r.path, content: r.path === 'wiki/log.md' ? '# 紀錄（log）\n\n依時間順序、只追加不修改的紀錄。\n' : r.content_md }));
  return createCustomTemplate(ws, userId, { name: name.trim() || '我的規則', description: '從目前工作區的 schema/ 存成的模版', prompt: '先呼叫 get_instructions 讀編纂規則，再依規則處理我接下來給你的來源。', base_id: null, files });
}
export async function updateCustomTemplate(ws: string, id: number, t: { name?: string; description?: string; prompt?: string; files?: unknown }): Promise<CustomTemplate> {
  const cur = await getCustomTemplate(ws, id);
  if (!cur) throw new NoteError('NOT_FOUND', { 'zh-TW': '找不到模版', en: 'Template not found' });
  const files = t.files === undefined ? cur.files : checkFiles(t.files);
  const { rows } = await pool.query<CustomTemplate>(
    `UPDATE user_templates SET name = $3, description = $4, prompt = $5, files = $6, updated_at = now() WHERE workspace_id = $1 AND id = $2 RETURNING *`,
    [ws, id, (t.name ?? cur.name).trim() || cur.name, t.description ?? cur.description, t.prompt ?? cur.prompt, JSON.stringify(files)],
  );
  return rows[0];
}
export async function deleteCustomTemplate(ws: string, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM user_templates WHERE workspace_id = $1 AND id = $2`, [ws, id]);
  return (rowCount ?? 0) > 0;
}
// Apply a custom template: add without overwriting, same as built-ins
export async function applyCustomTemplate(ws: string, id: number, actor: Actor) {
  const t = await getCustomTemplate(ws, id);
  if (!t) throw new NoteError('NOT_FOUND', { 'zh-TW': '找不到模版', en: 'Template not found' });
  const created: string[] = [], skipped: string[] = [];
  for (const f of t.files) {
    try { await createNote(ws, f.path, f.content, actor); created.push(f.path); }
    catch (e) { if (e instanceof NoteError && e.code === 'CONFLICT') skipped.push(f.path); else throw e; }
  }
  return { id: `custom:${t.id}`, lang: 'zh-TW' as Lang, created, skipped, prompt: t.prompt };
}
