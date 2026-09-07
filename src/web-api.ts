import { Router, type Request, type Response } from 'express';
import type { Session } from './auth-web.js';
import { pick, type Lang } from './lang.js';
import { listBibSources } from './bib.js';
import { assertCanWrite } from './plans.js';
import {
  ConflictError, NoteError, archiveNote, createNote, deleteNote, getBacklinks, getGraph, ingestPrompt, listNotes, listPendingSources, listVersions,
  listNoteProps, readNote, readNoteWithAuthor, rollbackNote, searchNotes, updateNote, type Actor,
} from './notes.js';

// Notes REST for the web UI; mounted after requireSession in api.ts, all data access goes through notes.ts.
export const webApi = Router();

const status: Record<NoteError['code'], number> = { BAD_PATH: 400, NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409 };
function sendError(res: Response, e: unknown) {
  const lang = langOf(res);
  if (e instanceof ConflictError) {
    res.status(409).json({ error: 'CONFLICT', message: e.localized(lang), current: e.current });
    return;
  }
  if (e instanceof NoteError) {
    res.status(status[e.code]).json({ error: e.code, message: e.localized(lang) });
    return;
  }
  throw e;
}
const langOf = (res: Response): Lang => (res.locals.workspace?.lang as Lang | undefined) ?? 'zh-TW';
const wsOf = (res: Response): string => res.locals.workspace.id;
const msg = (res: Response, zh: string, en: string) => pick({ 'zh-TW': zh, en }, langOf(res));
const actorOf = (res: Response): Actor => res.locals.actor ?? { kind: 'web', name: (res.locals.session as Session).user.email };
const q = (req: Request, key: string) => (typeof req.query[key] === 'string' ? (req.query[key] as string) : '');
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) =>
  fn(req, res).catch(e => sendError(res, e));

webApi.get('/notes/tree', wrap(async (_req, res) => {
  const [notes, pending] = await Promise.all([listNotes(wsOf(res)), listPendingSources(wsOf(res))]);
  const bib = (await listBibSources(wsOf(res))).map(b => ({ key: String(b.props.citation_key ?? ''), path: b.path, title: String(b.props.title ?? b.title), authors: Array.isArray(b.props.authors) ? b.props.authors : b.props.authors ? [String(b.props.authors)] : [], year: Number(b.props.year) || null, venue: b.props.venue ? String(b.props.venue) : null, doi: b.props.doi ? String(b.props.doi) : null, url: b.props.source_url ? String(b.props.source_url) : null })).filter(b => b.key);
  res.json({ notes, pendingSources: pending.map(p => p.path), ingestPrompt: pending.length ? ingestPrompt(pending.map(p => p.path), langOf(res)) : null, bib });
}));

// Properties table: notes + front-matter properties + system fields; keys are the property names seen (sorted by frequency)
webApi.get('/notes/props', wrap(async (req, res) => {
  const rows = await listNoteProps(wsOf(res), q(req, 'folder') || undefined);
  const count = new Map<string, number>();
  for (const r of rows) for (const k of Object.keys(r.props)) count.set(k, (count.get(k) ?? 0) + 1);
  const keys = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, count: n }));
  res.json({ rows, keys });
}));

webApi.get('/graph', wrap(async (_req, res) => {
  res.json(await getGraph(wsOf(res)));
}));

webApi.get('/notes/backlinks', wrap(async (req, res) => {
  const n = await readNote(wsOf(res), q(req, 'path'));
  res.json({ backlinks: await getBacklinks(wsOf(res), n) });
}));

webApi.get('/notes/versions', wrap(async (req, res) => {
  res.json({ versions: await listVersions(wsOf(res), q(req, 'path')) });
}));

webApi.post('/notes/rollback', wrap(async (req, res) => {
  const { path, version, if_version } = req.body ?? {};
  if (typeof path !== 'string' || !Number.isInteger(version) || !Number.isInteger(if_version)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '需要 path、version、if_version', 'path, version and if_version are required') });
    return;
  }
  res.json(await rollbackNote(wsOf(res), path, version, if_version, actorOf(res)));
}));

webApi.get('/notes', wrap(async (req, res) => {
  const n = await readNoteWithAuthor(wsOf(res), q(req, 'path'));
  res.json({ path: n.path, title: n.title, version: n.version, updated_at: n.updated_at, author: n.author, content: n.content_md });
}));

webApi.post('/notes', wrap(async (req, res) => {
  const { path, content } = req.body ?? {};
  if (typeof path !== 'string' || typeof content !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '需要 path 與 content', 'path and content are required') });
    return;
  }
  try { await assertCanWrite(wsOf(res), content); res.status(201).json(await createNote(wsOf(res), path, content, actorOf(res))); }
  catch (e) { if (e instanceof NoteError && e.code === 'CONFLICT') throw new NoteError('CONFLICT', { 'zh-TW': `已經有同路徑的筆記：${path}。請換個名稱，或直接開啟那一頁編輯。`, en: `A note with this path already exists: ${path}. Choose another name, or open that page to edit it.` }); throw e; }
}));

webApi.put('/notes', wrap(async (req, res) => {
  const { path, content, if_version } = req.body ?? {};
  if (typeof path !== 'string' || typeof content !== 'string' || !Number.isInteger(if_version)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '需要 path、content、if_version', 'path, content and if_version are required') });
    return;
  }
  await assertCanWrite(wsOf(res), content, path);
  res.json(await updateNote(wsOf(res), path, content, if_version, actorOf(res)));
}));

webApi.post('/notes/archive', wrap(async (req, res) => {
  const { path, undo } = req.body ?? {};
  if (typeof path !== 'string') { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '需要 path', 'path is required') }); return; }
  res.json(await archiveNote(wsOf(res), path, undo === true));
}));

webApi.delete('/notes', wrap(async (req, res) => {
  await deleteNote(wsOf(res), q(req, 'path'));
  res.json({ deleted: true });
}));

webApi.get('/search', wrap(async (req, res) => {
  const query = q(req, 'q').trim();
  if (!query) { res.json({ query, count: 0, hits: [] }); return; }
  const limit = Math.min(50, Math.max(1, Number(q(req, 'limit')) || 20));
  const hits = await searchNotes(wsOf(res), { query, folder: q(req, 'folder') || undefined, tag: q(req, 'tag') || undefined, limit });
  res.json({ query, count: hits.length, hits });
}));
