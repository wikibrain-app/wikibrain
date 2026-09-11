import { Router, type Request, type Response, type NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, type Session } from './auth-web.js';
import { config } from './config.js';
import { ensureWorkspaceFor, setWorkspaceLang } from './workspaces.js';
import { isLang, pick } from './lang.js';
import { createToken, listTokens, revokeToken } from './tokens.js';
import { authenticateToken } from './auth.js';
import { webApi } from './web-api.js';
import { originCheck, userLimiter } from './security.js';
import { getUsage } from './usage.js';
import { buildExportZip } from './export.js';
import { listBibSources, toBibtex, toCslJson } from './bib.js';
import { approveRequest, denyRequest, getPendingRequest } from './oauth.js';
import { assertCanCreateToken, planStatus } from './plans.js';
import { getSubscription } from './billing.js';
import { createShare, getShare, revokeShare } from './shares.js';
import { ops } from './ops.js';
/* Shape validated before it reaches the operator console (which owns the real type). */
interface RegistryEntry { service: string; plan: string; price: string; renews_on?: string | null; billing?: string; limits?: string; account?: string; manage_url?: string; notes?: string }
import { track } from './events.js';
import { clientToken, ensureCatalog, paddleEnabled, paddleEnv, portalSession, PaddleError } from './paddle.js';
import { deleteLink as deleteZotero, getLink as getZotero, inspectKey as inspectZoteroKey, listCollections as zoteroCollections, loadKey as loadZoteroKey, setLink as setZotero, syncZotero } from './zotero.js';
import { applyTemplate, applyCustomTemplate, createCustomTemplate, deleteCustomTemplate, duplicateBuiltin, getCustomTemplate, listCustomTemplates, listTemplates, pendingRuleUpdates, updateRules, snapshotSchemaAsTemplate, templateFiles, updateCustomTemplate, LANGS, type Lang } from './templates.js';
import { NoteError } from './notes.js';
import { PROVIDERS, type Provider } from './ai/providers.js';
import { deleteAiConfig, getAiConfig, getIngestStats, getJob, listJobs, modelsFor, setAiConfig, startIngest, startLint } from './ingest.js';
import { lintPrompt, lintSummary, lintWorkspace } from './lint.js';
import { kbStats } from './stats.js';
import multer from 'multer';
import { ASSET_LIMITS, assetUrl, deleteAsset, getAsset, listAssets, storeAsset } from './assets.js';
import { createSession, deleteSession, fileAnswer, getSession, listSessions, sendMessage } from './chat.js';
import { siteKey } from './turnstile.js';

// JSON API for the web UI; protected by better-auth's session cookie.
export const api = Router();
api.use(originCheck);

const noteStatus: Record<NoteError['code'], number> = { BAD_PATH: 400, NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409, BUSY: 429 };
const langOf = (res: Response): Lang => (res.locals.workspace?.lang as Lang | undefined) ?? 'zh-TW';
const msg = (res: Response, zh: string, en: string) => pick({ 'zh-TW': zh, en }, langOf(res));
// Path params must be positive integers, otherwise 400 (keeps NaN from reaching pg and becoming a 500)
const intParam = (v: string, res: Response): number | null => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, 'id 必須是正整數', 'id must be a positive integer') }); return null; } return n; };
const handle = (res: Response, e: unknown) => { if (e instanceof NoteError) { res.status(noteStatus[e.code]).json({ error: e.code, message: e.localized((res.locals.workspace?.lang as Lang | undefined) ?? 'zh-TW') }); return; } throw e; };

api.get('/config', (_req, res) => {
  res.json({ googleEnabled: !!config.google, mcpUrl: `${config.appUrl}/mcp`, version: config.version, commit: config.commit, turnstileSiteKey: siteKey() || null });
});

/* REST API with an API key (P1): the same MCP token works as `Authorization: Bearer <token>` on the notes REST
   (tree, read, create, update, delete, search, backlinks, versions, assets, import, export, plan). Account-level
   endpoints stay session-only. Read-only tokens (scopes without notes:write) get 403 on mutations. */
const SESSION_ONLY = /^\/(tokens|ai|zotero|billing|oauth|me\/lang|templates\/custom|chat|ingest|lint\/run)(\/|$)/;
async function requireSession(req: Request, res: Response, next: NextFunction) {
  const authz = req.header('authorization');
  if (authz?.startsWith('Bearer ')) {
    const ctx = await authenticateToken(authz.slice(7).trim());
    if (!ctx) { res.status(401).json({ error: 'UNAUTHORIZED', message: msg(res, 'token 無效或已撤銷', 'Invalid or revoked token') }); return; }
    if (SESSION_ONLY.test(req.path)) { res.status(403).json({ error: 'FORBIDDEN', message: msg(res, '這個端點只能在網頁登入後使用', 'This endpoint needs a browser session') }); return; }
    if (!['GET', 'HEAD'].includes(req.method) && !ctx.scopes.includes('notes:write')) { res.status(403).json({ error: 'FORBIDDEN', message: msg(res, '這把 token 只有讀取權限', 'This token is read-only') }); return; }
    res.locals.session = { user: { id: ctx.userId, email: `token:${ctx.label}`, name: ctx.label } };
    res.locals.workspace = await ensureWorkspaceFor(ctx.userId);
    res.locals.actor = { kind: 'mcp', name: ctx.label };
    res.locals.viaToken = true;
    next();
    return;
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: msg(res, '請先登入', 'Please sign in first') });
    return;
  }
  res.locals.session = session;
  res.locals.workspace = await ensureWorkspaceFor(session.user.id);
  next();
}
api.use(requireSession);
const strict = userLimiter(30);
api.use(['/ai/models', '/ingest', '/lint/run', '/chat', '/zotero/sync', '/zotero/collections'], (req, res, next) => (req.method === 'GET' ? next() : strict(req, res, next)));
api.use(webApi);

api.get('/me', (_req, res) => {
  const s = res.locals.session as Session;
  if (!res.locals.viaToken && s.user.emailVerified) track('verified', { userId: s.user.id, workspaceId: res.locals.workspace.id });
  res.json({ user: { id: s.user.id, email: s.user.email, name: s.user.name }, workspace: res.locals.workspace, mcpUrl: `${config.appUrl}/mcp`, isAdmin: !res.locals.viaToken && (ops()?.isAdmin(s.user.email) ?? false) });
});

// Workspace language (Q10): affects only the UI, template defaults and agent prompts
api.put('/me/lang', async (req, res) => {
  const lang = req.body?.lang;
  if (!isLang(lang)) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, 'lang 必須是 zh-TW 或 en', 'lang must be zh-TW or en') }); return; }
  await setWorkspaceLang(res.locals.workspace.id, lang);
  res.json({ lang });
});

api.get('/templates', async (_req, res) => {
  res.json({
    templates: await listTemplates(), langs: LANGS,
    custom: await listCustomTemplates(res.locals.workspace.id),
    ruleUpdates: await pendingRuleUpdates(res.locals.workspace.id),
  });
});

/* Take the newer rule pages for one template. Pages the user edited are never touched; they come back in `kept` so the
   UI can show the difference instead. */
api.post('/templates/update-rules', async (req, res) => {
  const id = req.body?.id;
  const mode = req.body?.mode === 'overwrite' ? 'overwrite' as const : 'safe' as const;
  if (typeof id !== 'string') { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '需要 id', 'id is required') }); return; }
  try { res.json(await updateRules(res.locals.workspace.id, id, { kind: 'system', name: `template:${id}` }, mode)); }
  catch (e) { handle(res, e); }
});

/* ── Custom templates ── */
api.post('/templates/custom', async (req, res) => {
  const s = res.locals.session as Session; const ws = res.locals.workspace.id;
  const b = req.body ?? {};
  try {
    if (typeof b.from === 'string') { res.status(201).json({ template: await duplicateBuiltin(ws, s.user.id, b.from, LANGS.includes(b.lang) ? b.lang : 'zh-TW') }); return; }
    if (b.fromSchema) { res.status(201).json({ template: await snapshotSchemaAsTemplate(ws, s.user.id, typeof b.name === 'string' ? b.name : '') }); return; }
    res.status(201).json({ template: await createCustomTemplate(ws, s.user.id, { name: String(b.name ?? ''), description: b.description, prompt: b.prompt, files: b.files }) });
  } catch (e) { handle(res, e); }
});
api.get('/templates/custom/:id', async (req, res) => {
  const id = intParam(req.params.id, res); if (id === null) return;
  const t = await getCustomTemplate(res.locals.workspace.id, id);
  if (!t) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json({ template: t });
});
api.put('/templates/custom/:id', async (req, res) => {
  const id = intParam(req.params.id, res); if (id === null) return;
  try { res.json({ template: await updateCustomTemplate(res.locals.workspace.id, id, req.body ?? {}) }); }
  catch (e) { handle(res, e); }
});
api.delete('/templates/custom/:id', async (req, res) => {
  const id = intParam(req.params.id, res); if (id === null) return;
  res.json({ deleted: await deleteCustomTemplate(res.locals.workspace.id, id) });
});

api.get('/templates/:id/files', async (req, res) => {
  const lang = (typeof req.query.lang === 'string' && LANGS.includes(req.query.lang as Lang) ? req.query.lang : 'zh-TW') as Lang;
  try { res.json({ files: await templateFiles(req.params.id, lang) }); }
  catch (e) { if (e instanceof NoteError) { res.status(404).json({ error: 'NOT_FOUND', message: e.localized(langOf(res)) }); return; } throw e; }
});

// Apply a template: add without overwriting. Returns created and skipped paths plus the starter prompt for the agent.
api.post('/templates/apply', async (req, res) => {
  const { id, lang } = req.body ?? {};
  const s = res.locals.session as Session;
  if (typeof id === 'string' && id.startsWith('custom:')) {
    try { res.json(await applyCustomTemplate(res.locals.workspace.id, Number(id.slice(7)), { kind: 'system', name: `template:${id}` })); }
    catch (e) { handle(res, e); }
    return;
  }
  if (typeof id !== 'string' || !LANGS.includes(lang)) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '需要 id 與 lang（zh-TW｜en）', 'id and lang (zh-TW | en) are required') }); return; }
  try {
    res.json(await applyTemplate(res.locals.workspace.id, id, lang as Lang, { kind: 'system', name: `template:${id}` }));
  } catch (e) {
    if (e instanceof NoteError && e.code === 'NOT_FOUND') { res.status(404).json({ error: 'NOT_FOUND', message: e.localized(langOf(res)) }); return; }
    throw e;
  }
  void s;
});

/* ── AI provider settings and server-side Ingest (Q9) ── */

api.get('/ai', async (_req, res) => {
  const s = res.locals.session as Session;
  res.json({ config: await getAiConfig(s.user.id), providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, defaultModel: p.defaultModel, keyHint: p.keyHint })) });
});
api.put('/ai', async (req, res) => {
  const s = res.locals.session as Session;
  const { provider, model, apiKey } = req.body ?? {};
  if (typeof provider !== 'string' || !(provider in PROVIDERS)) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '請選擇供應商', 'Please choose a provider') }); return; }
  try { res.json({ config: await setAiConfig(s.user.id, provider as Provider, typeof model === 'string' ? model : '', typeof apiKey === 'string' ? apiKey : undefined) }); }
  catch (e) { handle(res, e); }
});
// Model list / connection test: body { provider, apiKey? }. Returning models means the key is valid (OpenRouter doesn't check the key).
api.post('/ai/models', async (req, res) => {
  const s = res.locals.session as Session;
  const { provider, apiKey } = req.body ?? {};
  if (typeof provider !== 'string' || !(provider in PROVIDERS)) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '請選擇供應商', 'Please choose a provider') }); return; }
  try { res.json({ models: await modelsFor(s.user.id, provider as Provider, typeof apiKey === 'string' ? apiKey : undefined) }); }
  catch (e) { res.status(400).json({ error: 'PROVIDER_ERROR', message: (e as Error).message.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-…') }); }
});
api.delete('/ai', async (_req, res) => {
  await deleteAiConfig((res.locals.session as Session).user.id);
  res.json({ deleted: true });
});
api.post('/ingest', async (req, res) => {
  const s = res.locals.session as Session;
  const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter((p: unknown) => typeof p === 'string') : undefined;
  const guidance = typeof req.body?.guidance === 'string' ? req.body.guidance : undefined;
  try { res.status(202).json({ job: await startIngest(res.locals.workspace.id, s.user.id, paths, guidance) }); }
  catch (e) { handle(res, e); }
});
api.get('/ingest', async (_req, res) => {
  res.json({ jobs: await listJobs(res.locals.workspace.id) });
});
api.get('/ingest/stats', async (_req, res) => {
  res.json(await getIngestStats(res.locals.workspace.id));
});
api.get('/ingest/:id', async (req, res) => {
  const id = intParam(req.params.id, res); if (id === null) return;
  const job = await getJob(res.locals.workspace.id, id);
  if (!job) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json({ job });
});

api.get('/stats', async (_req, res) => { res.json(await kbStats(res.locals.workspace.id)); });

/* ── Lint (health check) ── */
api.get('/lint', async (_req, res) => {
  const report = await lintWorkspace(res.locals.workspace.id);
  res.json({ report, summary: lintSummary(report, res.locals.workspace.lang), prompt: lintPrompt(report, res.locals.workspace.lang) });
});
api.post('/lint/run', async (_req, res) => {
  const s = res.locals.session as Session;
  try { res.status(202).json({ job: await startLint(res.locals.workspace.id, s.user.id) }); }
  catch (e) { handle(res, e); }
});

/* ── Chat (Query) ── */
api.get('/chat', async (_req, res) => { res.json({ sessions: await listSessions(res.locals.workspace.id) }); });
api.post('/chat', async (_req, res) => {
  const s = res.locals.session as Session;
  res.status(201).json({ session: await createSession(res.locals.workspace.id, s.user.id) });
});
api.get('/chat/:id', async (req, res) => {
  const id = intParam(req.params.id, res); if (id === null) return;
  const sess = await getSession(res.locals.workspace.id, id);
  if (!sess) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json({ session: sess });
});
api.delete('/chat/:id', async (req, res) => {
  const id = intParam(req.params.id, res); if (id === null) return;
  res.json({ deleted: await deleteSession(res.locals.workspace.id, id) });
});
api.post('/chat/:id/messages', async (req, res) => {
  const s = res.locals.session as Session;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '訊息不能是空的', 'Message cannot be empty') }); return; }
  const id = intParam(req.params.id, res); if (id === null) return;
  try { res.status(202).json(await sendMessage(res.locals.workspace.id, s.user.id, id, text)); }
  catch (e) { handle(res, e); }
});
api.post('/chat/:id/file', async (req, res) => {
  const s = res.locals.session as Session;
  const index = Number(req.body?.index);
  if (!Number.isInteger(index)) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '需要 index', 'index is required') }); return; }
  const id = intParam(req.params.id, res); if (id === null) return;
  try { res.status(201).json(await fileAnswer(res.locals.workspace.id, id, index, { kind: 'web', name: s.user.email }, { title: typeof req.body?.title === 'string' ? req.body.title : undefined })); }
  catch (e) { handle(res, e); }
});

api.get('/usage', async (_req, res) => {
  const s = res.locals.session as Session;
  res.json(await getUsage(s.user.id, res.locals.workspace.id));
});

api.get('/export', async (_req, res) => {
  const zip = await buildExportZip(res.locals.workspace.id);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="wikibrain-${stamp}.zip"`);
  res.send(zip);
});

/* ── Image attachments (Karpathy: download images locally) ── */
const assetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ASSET_LIMITS.bytes, files: 1, fields: 2, parts: 4 } });
const assetId = (v: string, res: Response): string | null => { if (!/^[0-9a-f]{24}$/.test(v)) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '附件 id 格式不正確', 'Invalid attachment id') }); return null; } return v; };
api.get('/assets', async (_req, res) => {
  res.json({ assets: (await listAssets(res.locals.workspace.id)).map(a => ({ ...a, url: assetUrl(a.id) })) });
});
api.post('/assets', (req, res, next) => assetUpload.single('file')(req, res, (err: unknown) => {
  if (err) { res.status(400).json({ error: 'BAD_REQUEST', message: (err as Error).message.includes('File too large') ? msg(res, `圖片超過 ${ASSET_LIMITS.bytes / 1024 / 1024} MB 上限`, `Image exceeds the ${ASSET_LIMITS.bytes / 1024 / 1024} MB limit`) : msg(res, '上傳失敗', 'Upload failed') }); return; }
  next();
}), async (req, res) => {
  const f = req.file;
  if (!f) { res.status(400).json({ error: 'BAD_REQUEST', message: msg(res, '沒有收到檔案', 'No file received') }); return; }
  const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
  try {
    const a = await storeAsset(res.locals.workspace.id, f.buffer, name, f.mimetype);
    res.status(201).json({ ...a, url: assetUrl(a.id) });
  } catch (e) { handle(res, e); }
});
api.get('/assets/:id', async (req, res) => {
  const id = assetId(req.params.id as string, res); if (!id) return;
  const a = await getAsset(res.locals.workspace.id, id);
  if (!a) { res.status(404).json({ error: 'NOT_FOUND', message: msg(res, '找不到附件', 'Attachment not found') }); return; }
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Length', String(a.size));
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (a.mime === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:"); // SVG must not run scripts / load external resources
  res.send(a.data);
});
api.delete('/assets/:id', async (req, res) => {
  const id = assetId(req.params.id as string, res); if (!id) return;
  res.json({ deleted: await deleteAsset(res.locals.workspace.id, id) });
});

// Bibliography export (Q10 academic 1): raw/ pages that have citation_key / doi / authors
api.get('/export/bibtex', async (_req, res) => {
  const bib = toBibtex(await listBibSources(res.locals.workspace.id));
  res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="wikibrain-${new Date().toISOString().slice(0, 10)}.bib"`);
  res.send(bib);
});
api.get('/export/csl', async (_req, res) => {
  const json = toCslJson(await listBibSources(res.locals.workspace.id));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="wikibrain-${new Date().toISOString().slice(0, 10)}.csl.json"`);
  res.send(json);
});

/* ── OAuth consent page (for the SPA /oauth/consent; requires sign-in) ── */
api.get('/oauth/request', async (req, res) => {
  const id = typeof req.query.req === 'string' ? req.query.req : '';
  const r = id ? await getPendingRequest(id) : null;
  if (!r) { res.status(404).json({ error: 'NOT_FOUND', message: msg(res, '授權請求不存在或已過期，請回到 client 重新連接', 'Authorization request not found or expired; reconnect from the client') }); return; }
  res.json({ request: r });
});
api.post('/oauth/approve', async (req, res) => {
  const s = res.locals.session as Session;
  try { res.json({ redirect: await approveRequest(String(req.body?.req ?? ''), s.user.id, res.locals.workspace.id) }); } catch (e) { handle(res, e); }
});
api.post('/oauth/deny', async (req, res) => {
  try { res.json({ redirect: await denyRequest(String(req.body?.req ?? '')) }); } catch (e) { handle(res, e); }
});

/* ── Zotero sync (academic 3): key stored encrypted, choose a collection, manual or hourly sync ── */
api.get('/zotero', async (_req, res) => { res.json({ link: await getZotero(res.locals.workspace.id) }); });
api.post('/zotero/collections', async (req, res) => {
  const ws = res.locals.workspace.id;
  try {
    const key = typeof req.body?.apiKey === 'string' && req.body.apiKey.trim() ? req.body.apiKey.trim() : await loadZoteroKey(ws);
    const info = await inspectZoteroKey(key);
    res.json({ user: info, collections: await zoteroCollections(key, info.userID) });
  } catch (e) { handle(res, e); }
});
api.put('/zotero', async (req, res) => {
  const b = req.body ?? {};
  try {
    res.json({ link: await setZotero(res.locals.workspace.id, { apiKey: typeof b.apiKey === 'string' ? b.apiKey : undefined, collectionKey: b.collectionKey === undefined ? undefined : (b.collectionKey || null), collectionName: typeof b.collectionName === 'string' ? b.collectionName : null, withPdf: typeof b.withPdf === 'boolean' ? b.withPdf : undefined }) });
  } catch (e) { handle(res, e); }
});
api.delete('/zotero', async (_req, res) => { res.json({ deleted: await deleteZotero(res.locals.workspace.id) }); });
api.post('/zotero/sync', async (_req, res) => {
  const s = res.locals.session as Session;
  try { res.json({ result: await syncZotero(res.locals.workspace.id, { kind: 'web', name: s.user.email }), link: await getZotero(res.locals.workspace.id) }); } catch (e) { handle(res, e); }
});

// Plan status (decision 17): trial days left, agent jobs this month, key-free quota
api.get('/plan', async (_req, res) => { res.json(await planStatus(res.locals.workspace.id)); });
// Operator console (hosted deployments only): 404 for everyone else so the endpoints do not advertise themselves
api.get('/admin/status', async (_req, res) => {
  if (res.locals.viaToken || !ops()?.isAdmin((res.locals.session as Session).user.email)) { res.status(404).json({ error: 'NOT_FOUND', message: 'not found' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.json(await ops()!.status());
});
api.put('/admin/capacity', async (req, res) => {
  if (res.locals.viaToken || !ops()?.isAdmin((res.locals.session as Session).user.email)) { res.status(404).json({ error: 'NOT_FOUND', message: 'not found' }); return; }
  const cfg = await ops()!.capacity.setConfig(req.body && typeof req.body === 'object' ? req.body : {});
  ops()!.capacity.resetCache();
  res.json({ ok: true, config: cfg, capacity: await ops()!.capacity.assess() });
});
api.put('/admin/registry', async (req, res) => {
  if (res.locals.viaToken || !ops()?.isAdmin((res.locals.session as Session).user.email)) { res.status(404).json({ error: 'NOT_FOUND', message: 'not found' }); return; }
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length > 50 || !items.every((x: RegistryEntry) => x && typeof x.service === 'string' && typeof x.plan === 'string' && typeof x.price === 'string')) { res.status(400).json({ error: 'BAD_REQUEST', message: 'items[] with service, plan, price' }); return; }
  await ops()!.setRegistry(items.map((x: RegistryEntry) => ({ service: x.service.slice(0, 120), plan: x.plan.slice(0, 120), price: x.price.slice(0, 120), renews_on: typeof x.renews_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.renews_on) ? x.renews_on : null, billing: x.billing?.slice(0, 200), limits: x.limits?.slice(0, 300), account: x.account?.slice(0, 120), manage_url: typeof x.manage_url === 'string' && /^https:\/\//.test(x.manage_url) ? x.manage_url.slice(0, 300) : undefined, notes: x.notes?.slice(0, 300) })));
  res.json({ ok: true });
});

// Public share links: one read-only URL per note (see src/shares.ts)
api.get('/share', async (req, res) => {
  const path = String(req.query.path ?? ''); if (!path) { res.status(400).json({ error: 'BAD_REQUEST', message: 'path' }); return; }
  res.json({ share: await getShare(res.locals.workspace.id, path) });
});
api.post('/share', strict, async (req, res) => {
  const path = typeof req.body?.path === 'string' ? req.body.path : ''; if (!path) { res.status(400).json({ error: 'BAD_REQUEST', message: 'path' }); return; }
  try { res.status(201).json({ share: await createShare(res.locals.workspace.id, path, res.locals.session.user.id) }); } catch (e) { handle(res, e); }
});
api.delete('/share', async (req, res) => {
  const path = String(req.query.path ?? ''); if (!path) { res.status(400).json({ error: 'BAD_REQUEST', message: 'path' }); return; }
  res.json({ revoked: await revokeShare(res.locals.workspace.id, path) });
});

// Billing: mirrored subscription state plus what the browser needs to open a Paddle checkout (client token, price ids).
api.get('/billing', async (_req, res) => {
  const subscription = await getSubscription(res.locals.workspace.id);
  let paddle: { environment: string; client_token: string; prices: Awaited<ReturnType<typeof ensureCatalog>>; email: string; workspace_id: string } | null = null;
  let error: string | null = null;
  if (paddleEnabled()) {
    try { paddle = { environment: paddleEnv(), client_token: await clientToken(), prices: await ensureCatalog(), email: res.locals.session.user.email, workspace_id: res.locals.workspace.id }; }
    catch (e) { error = e instanceof PaddleError ? `Paddle ${e.status}: ${e.message}` : String((e as Error).message ?? e); console.error('paddle config failed:', e); }
  }
  res.json({ subscription, paddle, error });
});
// Customer portal link (manage payment method, cancel): only for workspaces that already have a Paddle customer.
api.post('/billing/portal', strict, async (_req, res) => {
  const sub = await getSubscription(res.locals.workspace.id);
  if (!paddleEnabled() || !sub?.provider_customer_id) { res.status(404).json({ error: 'NOT_FOUND', message: msg(res, '這個工作區還沒有訂閱。', 'This workspace has no subscription yet.') }); return; }
  try { res.json(await portalSession(sub.provider_customer_id, sub.provider_subscription_id)); }
  catch (e) { res.status(502).json({ error: 'UPSTREAM', message: e instanceof PaddleError ? `Paddle ${e.status}: ${e.message}` : String((e as Error).message ?? e) }); }
});

api.get('/tokens', async (_req, res) => {
  res.json({ tokens: await listTokens(res.locals.workspace.id) });
});

api.post('/tokens', async (req, res) => {
  const label = typeof req.body?.label === 'string' ? req.body.label : 'default';
  const s = res.locals.session as Session;
  try { await assertCanCreateToken(res.locals.workspace.id); } catch (e) { handle(res, e); return; }
  const t = await createToken(res.locals.workspace.id, s.user.id, label);
  res.status(201).json({
    ...t,
    mcpJson: { mcpServers: { wikibrain: { url: `${config.appUrl}/mcp`, headers: { Authorization: `Bearer ${t.token}` } } } },
  });
});

api.delete('/tokens/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'BAD_REQUEST' }); return; }
  const ok = await revokeToken(res.locals.workspace.id, id);
  if (!ok) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json({ revoked: true, id });
});
