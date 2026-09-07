import { pool } from './db.js';
import { encrypt, decrypt } from './crypto.js';
import { NoteError, type Actor } from './notes.js';
import { convertPdf, saveSource, citationKey, type Converted, type SourceMeta } from './import.js';
import type { PropValue } from './notes.js';
import { safeFetch } from './net-guard.js';

/* ── Zotero sync (Q10 academic 3) ──
   The user pastes a Zotero API key (zotero.org/settings/keys, read access suffices) → /keys/<key> yields the userID → pick a collection or the whole library
   → sync: pull items incrementally with since=<library_version>, one page per new item at raw/sources/<citekey>.md (deduplicated by zotero_key; modified items are not overwritten in v1)
   → PDF attachments are fetched and their text appended after the abstract (the PDF itself is not kept, decision 9). The raw page then goes through pending → Ingest as usual. */

const API = () => process.env.ZOTERO_API_BASE ?? 'https://api.zotero.org';
const HEADERS = (key: string) => ({ 'Zotero-API-Key': key, 'Zotero-API-Version': '3', accept: 'application/json' });
const PDF_MAX = 20 * 1024 * 1024;

export interface ZoteroLinkPublic { zotero_user_id: string; username: string | null; key_last4: string; collection_key: string | null; collection_name: string | null; library_version: number; with_pdf: boolean; last_sync_at: Date | null; last_result: SyncResult | null; last_error: string | null; updated_at: Date }
export interface SyncResult { added: string[]; skipped: number; pdfs: number; version: number; errors: string[] }
export interface ZoteroCollection { key: string; name: string; parent: string | null; count: number }

async function zfetch(key: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(API() + path, { ...init, headers: { ...HEADERS(key), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 403 || res.status === 401) throw new NoteError('FORBIDDEN', { 'zh-TW': 'Zotero API key 無效或沒有讀取權限', en: 'Zotero API key is invalid or lacks read access' });
  if (res.status === 429) throw new NoteError('BAD_PATH', { 'zh-TW': 'Zotero 暫時限流，請稍後再試', en: 'Zotero is rate-limiting; try again later' });
  if (!res.ok) throw new NoteError('BAD_PATH', { 'zh-TW': `Zotero 回應 ${res.status}`, en: `Zotero responded ${res.status}` });
  return res;
}

// Validate the key: returns userID, username and read access
export async function inspectKey(key: string): Promise<{ userID: string; username: string | null }> {
  const k = key.trim();
  if (!/^[A-Za-z0-9]{16,64}$/.test(k)) throw new NoteError('BAD_PATH', { 'zh-TW': 'Zotero API key 格式不對（應為一串英數字）', en: 'Malformed Zotero API key (expected alphanumeric)' });
  const info = await (await zfetch(k, `/keys/${encodeURIComponent(k)}`)).json() as { userID?: number; username?: string; access?: { user?: { library?: boolean } } };
  if (!info.userID) throw new NoteError('FORBIDDEN', { 'zh-TW': '這把 key 查不到使用者', en: 'No user found for this key' });
  if (info.access?.user && info.access.user.library === false) throw new NoteError('FORBIDDEN', { 'zh-TW': '這把 key 沒有個人文獻庫的讀取權限', en: 'This key has no read access to the personal library' });
  return { userID: String(info.userID), username: info.username ?? null };
}
export async function listCollections(key: string, userID: string): Promise<ZoteroCollection[]> {
  const out: ZoteroCollection[] = [];
  for (let start = 0; ; start += 100) {
    const res = await zfetch(key, `/users/${userID}/collections?limit=100&start=${start}`);
    const arr = await res.json() as { key: string; data: { name: string; parentCollection?: string | false }; meta?: { numItems?: number } }[];
    out.push(...arr.map(c => ({ key: c.key, name: c.data.name, parent: c.data.parentCollection || null, count: c.meta?.numItems ?? 0 })));
    if (arr.length < 100) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLink(ws: string): Promise<ZoteroLinkPublic | null> {
  const { rows } = await pool.query<ZoteroLinkPublic>(`SELECT zotero_user_id, username, key_last4, collection_key, collection_name, library_version, with_pdf, last_sync_at, last_result, last_error, updated_at FROM zotero_links WHERE workspace_id = $1`, [ws]);
  return rows[0] ?? null;
}
export async function setLink(ws: string, opts: { apiKey?: string; collectionKey?: string | null; collectionName?: string | null; withPdf?: boolean }): Promise<ZoteroLinkPublic> {
  const cur = await getLink(ws);
  let key = opts.apiKey?.trim();
  let userID = cur?.zotero_user_id, username = cur?.username ?? null;
  if (key) { const info = await inspectKey(key); userID = info.userID; username = info.username; }
  else if (!cur) throw new NoteError('BAD_PATH', { 'zh-TW': '第一次設定需要填 Zotero API key', en: 'A Zotero API key is required for the first setup' });
  const { rows } = await pool.query<{ key_cipher: string }>(`SELECT key_cipher FROM zotero_links WHERE workspace_id = $1`, [ws]);
  const cipher = key ? encrypt(key) : rows[0].key_cipher;
  const last4 = key ? key.slice(-4) : cur!.key_last4;
  if (opts.collectionKey && !/^[A-Z0-9]{8}$/.test(opts.collectionKey)) throw new NoteError('BAD_PATH', { 'zh-TW': 'collection key 格式不正確', en: 'Malformed collection key' });
  const collKey = opts.collectionKey === undefined ? cur?.collection_key ?? null : opts.collectionKey;
  const collName = opts.collectionKey === undefined ? cur?.collection_name ?? null : opts.collectionName ?? null;
  const resetVersion = key !== undefined || (opts.collectionKey !== undefined && opts.collectionKey !== cur?.collection_key);
  await pool.query(
    `INSERT INTO zotero_links (workspace_id, key_cipher, key_last4, zotero_user_id, username, collection_key, collection_name, with_pdf)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (workspace_id) DO UPDATE SET key_cipher = $2, key_last4 = $3, zotero_user_id = $4, username = $5, collection_key = $6, collection_name = $7, with_pdf = $8,
       library_version = CASE WHEN $9 THEN 0 ELSE zotero_links.library_version END, last_error = NULL, updated_at = now()`,
    [ws, cipher, last4, userID, username, collKey, collName, opts.withPdf ?? cur?.with_pdf ?? true, resetVersion]);
  return (await getLink(ws))!;
}
export async function deleteLink(ws: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM zotero_links WHERE workspace_id = $1`, [ws]);
  return (rowCount ?? 0) > 0;
}
export async function loadKey(ws: string): Promise<string> {
  const { rows } = await pool.query<{ key_cipher: string }>(`SELECT key_cipher FROM zotero_links WHERE workspace_id = $1`, [ws]);
  if (!rows[0]) throw new NoteError('NOT_FOUND', { 'zh-TW': '尚未連接 Zotero', en: 'Zotero is not connected' });
  return decrypt(rows[0].key_cipher);
}

/* ── Zotero item → Converted ── */
interface ZItem { key: string; version: number; data: { key: string; itemType: string; title?: string; creators?: { creatorType?: string; firstName?: string; lastName?: string; name?: string }[]; date?: string; DOI?: string; url?: string; publicationTitle?: string; bookTitle?: string; proceedingsTitle?: string; publisher?: string; university?: string; institution?: string; abstractNote?: string; volume?: string; issue?: string; pages?: string; ISBN?: string; ISSN?: string; language?: string; extra?: string; tags?: { tag: string }[]; parentItem?: string; contentType?: string; linkMode?: string; filename?: string; dateModified?: string } }
const TYPE_MAP: Record<string, string> = { journalArticle: 'article', conferencePaper: 'inproceedings', book: 'book', bookSection: 'incollection', thesis: 'phdthesis', report: 'techreport', preprint: 'misc', webpage: 'misc', blogPost: 'misc', magazineArticle: 'article', newspaperArticle: 'article', manuscript: 'unpublished' };
const SKIP_TYPES = new Set(['attachment', 'note', 'annotation']);

export function zoteroItemToConverted(it: ZItem): Converted {
  const d = it.data;
  const authors = (d.creators ?? []).filter(c => !c.creatorType || c.creatorType === 'author' || c.creatorType === 'editor' && !(d.creators ?? []).some(x => x.creatorType === 'author'))
    .map(c => c.name ?? [c.firstName, c.lastName].filter(Boolean).join(' ')).filter(Boolean);
  const year = Number(d.date?.match(/\d{4}/)?.[0]) || undefined;
  const doi = d.DOI?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim() || undefined;
  const venue = d.publicationTitle || d.proceedingsTitle || d.bookTitle || d.publisher || d.university || d.institution || undefined;
  const bbtKey = d.extra?.match(/^\s*Citation Key:\s*(\S+)/mi)?.[1];
  const extra: Record<string, PropValue> = { bibtex_type: TYPE_MAP[d.itemType] ?? 'misc', zotero_key: it.key, zotero_item_type: d.itemType };
  if (d.volume) extra.volume = d.volume; if (d.issue) extra.number = d.issue; if (d.pages) extra.pages = d.pages;
  if (d.publisher && venue !== d.publisher) extra.publisher = d.publisher; if (d.ISBN) extra.isbn = d.ISBN; if (d.ISSN) extra.issn = d.ISSN; if (d.language) extra.language = d.language;
  if (d.tags?.length) extra.tags = d.tags.map(t => t.tag);
  const meta: SourceMeta = {
    source_type: 'paper', title: d.title?.trim() || `(untitled ${it.key})`, fetched_at: new Date().toISOString(), doi, authors: authors.length ? authors : undefined, year, venue,
    source_url: d.url || (doi ? `https://doi.org/${doi}` : undefined), citation_key: bbtKey?.replace(/[^\p{L}\p{N}_:.-]/gu, '') || citationKey({ authors, year, title: d.title }) || `zotero${it.key.toLowerCase()}`, extra,
  };
  return { meta, markdown: d.abstractNote?.trim() ? `## 摘要 / Abstract\n\n${d.abstractNote.trim()}` : '' };
}

async function existingZoteroKeys(ws: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ k: string }>(`SELECT substring(content_md FROM '(?m)^zotero_key:\\s*"?([A-Za-z0-9]+)') AS k FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL AND path LIKE 'raw/%'`, [ws]);
  return new Set(rows.map(r => r.k).filter(Boolean));
}

const syncing = new Set<string>();           // one sync round at a time per workspace (manual and scheduled both go through here)
const ITEMS_PER_RUN = Number(process.env.ZOTERO_ITEMS_PER_RUN ?? 200);
// Sync: incremental via since=library_version; new items become pages (PDF text extracted when present); at most ITEMS_PER_RUN per round with the version written back progressively, so large libraries finish over several rounds
export async function syncZotero(ws: string, actor: Actor = { kind: 'system', name: 'zotero' }): Promise<SyncResult> {
  if (syncing.has(ws)) throw new NoteError('CONFLICT', { 'zh-TW': 'Zotero 同步正在進行中，請稍候', en: 'A Zotero sync is already running; please wait' });
  syncing.add(ws);
  try { return await syncZoteroLocked(ws, actor); } finally { syncing.delete(ws); }
}
async function syncZoteroLocked(ws: string, actor: Actor): Promise<SyncResult> {
  const link = await getLink(ws); if (!link) throw new NoteError('NOT_FOUND', { 'zh-TW': '尚未連接 Zotero', en: 'Zotero is not connected' });
  const key = await loadKey(ws);
  const base = `/users/${link.zotero_user_id}` + (link.collection_key ? `/collections/${link.collection_key}` : '');
  const result: SyncResult = { added: [], skipped: 0, pdfs: 0, version: link.library_version, errors: [] };
  try {
    const seen = await existingZoteroKeys(ws);
    const items: ZItem[] = []; let libraryVersion = link.library_version; let truncated = false;
    for (let start = 0; ; start += 100) {
      // Zotero has no "version" sort (400 Invalid 'sort' value); sort by dateModified ascending so a truncated run resumes in a stable order.
      const res = await zfetch(key, `${base}/items/top?format=json&limit=100&start=${start}&since=${link.library_version}&sort=dateModified&direction=asc`);
      libraryVersion = Math.max(libraryVersion, Number(res.headers.get('Last-Modified-Version')) || 0);
      const arr = await res.json() as ZItem[]; items.push(...arr);
      if (arr.length < 100) break;
      if (items.length >= ITEMS_PER_RUN) { truncated = true; break; }
    }
    let done = 0;
    for (const it of items) {
      if (done >= ITEMS_PER_RUN) { truncated = true; break; }
      done++;
      // No progressive version write-back: items are not ordered by version, so bumping library_version mid-run could skip items.
      // The version is written once at the end (or kept as-is when the run is truncated; already-imported items are skipped by zotero_key).
      if (SKIP_TYPES.has(it.data.itemType) || it.data.parentItem) continue;
      if (seen.has(it.key)) { result.skipped++; continue; } // v1: modified items are not overwritten (raw/ is read-only), just counted as skipped
      const c = zoteroItemToConverted(it);
      if (link.with_pdf) {
        try {
          const kids = await (await zfetch(key, `/users/${link.zotero_user_id}/items/${it.key}/children?format=json&limit=50`)).json() as ZItem[];
          const pdf = kids.find(k => k.data.itemType === 'attachment' && k.data.contentType === 'application/pdf' && (k.data.linkMode === 'imported_file' || k.data.linkMode === 'imported_url'));
          if (pdf) {
            // First hop carries the key but does not follow redirects (Zotero 302s to S3; following would leak the key to S3); the second hop uses safeFetch without the key, with size limit and SSRF checks
            const first = await fetch(`${API()}/users/${link.zotero_user_id}/items/${pdf.key}/file`, { headers: HEADERS(key), redirect: 'manual', signal: AbortSignal.timeout(30_000) });
            let buf: Buffer | null = null;
            if (first.status >= 300 && first.status < 400 && first.headers.get('location')) {
              await first.body?.cancel().catch(() => {});
              const r = await safeFetch(new URL(first.headers.get('location')!, API()).href, { maxBytes: PDF_MAX, timeoutMs: 60_000, allowPrivate: process.env.ZOTERO_API_BASE !== undefined });
              if (r.ok) buf = r.body;
            } else if (first.ok) {
              const len = Number(first.headers.get('content-length'));
              if (!(len && len > PDF_MAX)) { const b = Buffer.from(await first.arrayBuffer()); if (b.length <= PDF_MAX) buf = b; }
            }
            if (buf) {
              const text = await convertPdf(buf, pdf.data.filename ?? 'attachment.pdf');
              if (text.markdown.trim()) { c.markdown = `${c.markdown}\n\n## 全文 / Full text（${pdf.data.filename ?? 'PDF'}）\n\n${text.markdown}`.trim(); result.pdfs++; }
            }
          }
        } catch (e) { result.errors.push(`${it.key}: PDF ${(e as Error).message}`); }
      }
      try { const r = await saveSource(ws, c, actor); result.added.push(r.path); seen.add(it.key); }
      catch (e) { result.errors.push(`${it.key}: ${(e as Error).message}`); }
    }
    // Not truncated: the whole library is synced up to Last-Modified-Version; truncated: keep the old version so the next round re-lists (already-imported items are skipped by zotero_key)
    result.version = truncated ? link.library_version : libraryVersion;
    if (truncated) result.errors.push(`truncated: ${items.length - done}+ items left for the next run`);
    await pool.query(`UPDATE zotero_links SET library_version = greatest(library_version, $2), last_sync_at = now(), last_result = $3, last_error = NULL, updated_at = now() WHERE workspace_id = $1`, [ws, result.version, JSON.stringify(result)]);
    return result;
  } catch (e) {
    await pool.query(`UPDATE zotero_links SET last_error = $2, last_sync_at = now(), updated_at = now() WHERE workspace_id = $1`, [ws, String((e as Error).message).slice(0, 500)]).catch(() => {});
    throw e;
  }
}

// Sync every linked workspace hourly (scheduled at server start); one failure does not affect the others
export function scheduleZoteroSync(intervalMs = 3600_000): NodeJS.Timeout {
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true; try { await runAll(); } finally { busy = false; }
  };
  const runAll = async () => {
    const { rows } = await pool.query<{ workspace_id: string }>(`SELECT workspace_id FROM zotero_links WHERE last_error IS NULL OR last_sync_at < now() - interval '6 hours'`);
    for (const r of rows) await syncZotero(r.workspace_id).catch(err => console.error(`Zotero scheduled sync failed (${r.workspace_id}):`, (err as Error).message));
  };
  const t = setInterval(() => { run().catch(err => console.error('Zotero schedule failed:', err)); }, intervalMs); t.unref(); return t;
}
