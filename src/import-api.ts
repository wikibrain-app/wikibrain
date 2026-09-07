import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, type Session } from './auth-web.js';
import { authenticateToken, type AuthContext } from './auth.js';
import { ensureWorkspaceFor } from './workspaces.js';
import { originCheck } from './security.js';
import { pick } from './lang.js';
import { NoteError, ingestPrompt, type Actor } from './notes.js';
import { LIMITS, convertText, convertUpload, convertUrl, saveSource, type Converted } from './import.js';
import { localizeImages } from './assets.js';
import { convertBibliography, looksLikeBibliography } from './bib.js';
import { pool } from './db.js';

// Source import API. Accepts a web session (cookie + Origin check) or an MCP Bearer token (for Claude Code hooks / scripts).
export const importApi = Router();

async function sessionOrToken(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  if (header.startsWith('Bearer ')) {
    const a = await authenticateToken(header.slice(7).trim());
    if (!a) { res.status(401).json({ error: 'UNAUTHORIZED', message: 'token 無效 / invalid token' }); return; }
    if (!a.scopes.includes('notes:write')) { res.status(403).json({ error: 'FORBIDDEN', message: pick({ 'zh-TW': '這個連線只被授權讀取（notes:read），不能匯入來源', en: 'This connection was granted read-only access (notes:read) and cannot import sources' }, a.lang) }); return; }
    res.locals.workspaceId = a.workspaceId;
    res.locals.lang = a.lang;
    res.locals.actor = { kind: 'mcp', name: a.label } satisfies Actor;
    void (a as AuthContext);
    return next();
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) { res.status(401).json({ error: 'UNAUTHORIZED', message: '請先登入' }); return; }
  originCheck(req, res, () => {
    ensureWorkspaceFor(session.user.id).then(w => {
      res.locals.workspaceId = w.id;
      res.locals.lang = w.lang;
      res.locals.actor = { kind: 'web', name: (session as Session).user.email } satisfies Actor;
      next();
    }).catch(next);
  });
}
importApi.use(sessionOrToken);

const status: Record<NoteError['code'], number> = { BAD_PATH: 400, NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409 };
const msg = (res: Response, zh: string, en: string) => pick({ 'zh-TW': zh, en }, res.locals.lang ?? 'zh-TW');
const send = (res: Response, p: Promise<any>) => p.then(r => res.status(201).json({ ...r, ingestPrompt: ingestPrompt(r.paths ?? [r.path], res.locals.lang) })).catch(e => {
  if (e instanceof NoteError) { res.status(status[e.code]).json({ error: e.code, message: e.localized(res.locals.lang ?? 'zh-TW') }); return; }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') { res.status(504).json({ error: 'TIMEOUT', message: msg(res, '抓取逾時', 'Fetch timed out') }); return; }
  console.error('Import failed:', e);
  res.status(500).json({ error: 'IMPORT_FAILED', message: msg(res, '轉換失敗，請確認檔案或網址', 'Conversion failed. Check the file or URL.') });
});

// Bibliography files (BibTeX / CSL-JSON): one page per entry; entries whose citation_key already exists in raw/ are skipped (the source of truth may stay in Zotero; re-importing never duplicates)
async function importBibliography(ws: string, buf: Buffer, name: string, actor: Actor, folder?: string) {
  const items = convertBibliography(buf, name);
  const { rows } = await pool.query<{ key: string }>(`SELECT substring(content_md FROM '(?m)^citation_key:\\s*(\\S+)') AS key FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL AND path LIKE 'raw/%'`, [ws]);
  const existing = new Set(rows.map(r => r.key).filter(Boolean));
  const imported: Awaited<ReturnType<typeof saveSource>>[] = []; const skipped: string[] = [];
  for (const c of items) {
    const key = c.meta.citation_key;
    if (key && existing.has(key)) { skipped.push(key); continue; }
    const r = await saveSource(ws, c, actor, folder); imported.push(r); if (key) existing.add(key);
  }
  if (!imported.length) throw new NoteError('CONFLICT', { 'zh-TW': `書目裡的 ${skipped.length} 筆都已經在 raw/ 了（依 citation_key 判斷）`, en: `All ${skipped.length} entries are already in raw/ (matched by citation_key)` });
  const first = imported[0];
  return { ...first, imported: imported.map(r => ({ path: r.path, title: r.title, meta: r.meta })), skipped, paths: imported.map(r => r.path) };
}

const allowPrivate = () => process.env.IMPORT_ALLOW_PRIVATE === '1';
// Karpathy tip: download article images locally so links never break and the LLM can see them later. Failed downloads keep the original URL.
async function withLocalImages<T extends Converted>(ws: string, c: T): Promise<T> {
  const { markdown } = await localizeImages(ws, c.markdown, { allowPrivate: allowPrivate() });
  return { ...c, markdown };
}

// JSON：{ kind: 'url', url, folder? } | { kind: 'text', text, title?, folder? }
importApi.post('/', async (req, res) => {
  const { kind, url, text, title, folder } = req.body ?? {};
  const ws: string = res.locals.workspaceId, actor: Actor = res.locals.actor;
  if (kind === 'url' && typeof url === 'string') {
    return send(res, convertUrl(url, { allowPrivate: allowPrivate() }).then(c => withLocalImages(ws, c)).then(async c => ({ ...(await saveSource(ws, c, actor, folder)), warning: c.warning })));
  }
  if (kind === 'text' && typeof text === 'string' && text.trim()) {
    return send(res, saveSource(ws, convertText(text, { title }), actor, folder));
  }
  res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '需要 kind=url 加 url，或 kind=text 加 text', 'kind=url with url, or kind=text with text, is required') });
});

// multipart: file (PDF / Word / HTML / Markdown / plain text), folder?
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.uploadBytes, files: 1, fields: 5, parts: 8 } });
importApi.post('/file', (req, res, next) => upload.single('file')(req, res, (err: unknown) => {
  if (err) { res.status(400).json({ error: 'BAD_REQUEST', message: (err as Error).message.includes('File too large') ? msg(res, '檔案超過 20 MB 上限', 'File exceeds the 20 MB limit') : msg(res, '上傳失敗', 'Upload failed') }); return; }
  next();
}), async (req, res) => {
  const f = req.file;
  if (!f) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '沒有收到檔案', 'No file received') }); return; }
  const name = Buffer.from(f.originalname, 'latin1').toString('utf8'); // multer's known behaviour with non-ASCII filenames
  if (looksLikeBibliography(name, f.buffer)) return send(res, importBibliography(res.locals.workspaceId, f.buffer, name, res.locals.actor, req.body?.folder));
  send(res, convertUpload(f.buffer, name, f.mimetype).then(c => withLocalImages(res.locals.workspaceId, c)).then(c => saveSource(res.locals.workspaceId, c, res.locals.actor, req.body?.folder)));
});
