import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { toNodeHandler } from 'better-auth/node';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { auth } from './auth-web.js';
import { requireTurnstile } from './turnstile.js';
import { handleOptOut, pageView } from './analytics.js';
import { api } from './api.js';
import { importApi } from './import-api.js';
import { bearerAuth, type AuthContext } from './auth.js';
import { ipLimiter, tokenLimiter } from './security.js';
import { recordMcpCall } from './usage.js';
import { config } from './config.js';
import { createMcpServer } from './mcp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { oauthProvider, SCOPES } from './oauth.js';
import { encryptionVersion } from './crypto.js';
import { applySubscriptionEvent, isStatus, webhookSecretOk, type SubscriptionEvent } from './billing.js';
import { translateWebhook, verifySignature, type PaddleWebhook } from './paddle.js';
import { readShared, readSharedAsset } from './shares.js';
import { ops } from './ops.js';

// Frontend build output (web/dist); served only if present. Vite serves it in development.
export const defaultWebDist = fileURLToPath(new URL('../web/dist', import.meta.url));

export function createApp(opts: { webDist?: string; mcpRatePerMin?: number; ipRatePerMin?: number; apiRatePerMin?: number } = {}): Express {
  const app = express();
  app.set('trust proxy', 1); // Behind a TLS-terminating reverse proxy, so https and secure cookies are detected correctly
  app.use((_req, res, next) => { res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Content-Security-Policy', "frame-ancestors 'none'"); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next(); }); // The consent page etc. must not be embeddable
  const byIp = ipLimiter(opts.ipRatePerMin ?? config.ipRatePerMin);
  const byToken = tokenLimiter(opts.mcpRatePerMin ?? config.mcpRatePerMin);
  // Per-IP limit for the web API must be generous (one SPA navigation fires several calls; many users may share a NAT); agent operations have a separate per-user limit
  const byIpApi = ipLimiter(opts.apiRatePerMin ?? config.apiRatePerMin);

  // better-auth must be mounted before express.json() (it reads the body itself).
  // Turnstile only inspects a header, so it can run first without touching the body better-auth is about to read.
  app.post('/api/auth/sign-up/email', requireTurnstile);   // byIp is applied by the catch-all below
  app.all('/api/auth/*splat', byIp, toNodeHandler(auth));
  // Paddle webhook: needs the raw body for the HMAC check, so it is mounted before express.json(). Only a 2xx counts as
  // delivered (Paddle retries anything else), so signature failures return 401 and unexpected errors 500.
  app.post('/api/billing/webhook/paddle', byIp, express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
    if (!secret) { res.status(503).json({ error: 'NOT_CONFIGURED', message: 'PADDLE_WEBHOOK_SECRET is not set' }); return; }
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifySignature(raw, req.header('paddle-signature'), secret)) { ops()?.noteSigFail(); res.status(401).json({ error: 'UNAUTHORIZED', message: 'bad signature' }); return; }
    let evt: PaddleWebhook;
    try { evt = JSON.parse(raw.toString('utf8')); } catch { res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid JSON' }); return; }
    const c = ops()?.counters; if (c) c.paddleLastWebhook = { at: new Date().toISOString(), type: evt.event_type };
    const ev = translateWebhook(evt);
    if (!ev) { res.json({ ok: true, ignored: evt.event_type }); return; }
    try {
      const sub = await applySubscriptionEvent(ev);
      console.log(`paddle webhook ${evt.event_type} ${evt.event_id}: workspace ${ev.workspace_id} → ${sub.status}`);
      res.json({ ok: true, status: sub.status });
    } catch (e) { console.error('paddle webhook failed:', e); res.status(500).json({ error: 'INTERNAL', message: 'could not apply event' }); }
  });
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', async (_req, res) => {
    const d = await (ops()?.degraded() ?? Promise.resolve([])).catch(() => ['db']);
    res.json({ ok: true, service: 'wikibrain', version: config.version, commit: config.commit, encryption: encryptionVersion(), degraded: d, status: d.length ? 'degraded' : 'healthy' });
  });
  // OAuth 2.1 authorization server (/.well-known/*, /authorize, /token, /register, /revoke): for Claude.ai / ChatGPT / Cursor connectors
  app.use(['/authorize', '/token', '/register', '/revoke', '/.well-known'], byIp);
  app.use(mcpAuthRouter({ provider: oauthProvider, issuerUrl: new URL(config.appUrl), resourceServerUrl: new URL('/mcp', config.appUrl), scopesSupported: SCOPES, resourceName: 'WikiBrain', serviceDocumentationUrl: new URL('/help', config.appUrl) }));
  // Billing webhook (scaffold until Q1 is decided): shared-secret header, generic event shape → workspaces.plan.
  app.post('/api/billing/webhook/:provider', byIp, async (req, res) => {
    if (!webhookSecretOk(req.header('x-wikibrain-billing-secret'))) { res.status(401).json({ error: 'UNAUTHORIZED', message: 'bad webhook secret' }); return; }
    const provider = req.params.provider as string; const b = req.body ?? {};
    if (!['paddle', 'lemonsqueezy', 'manual'].includes(provider) || typeof b.workspace_id !== 'string' || !isStatus(b.status)) { res.status(400).json({ error: 'BAD_REQUEST', message: 'need workspace_id and a known status' }); return; }
    try {
      const sub = await applySubscriptionEvent({ provider: provider as SubscriptionEvent['provider'], workspace_id: b.workspace_id, status: b.status, provider_customer_id: typeof b.provider_customer_id === 'string' ? b.provider_customer_id : undefined, provider_subscription_id: typeof b.provider_subscription_id === 'string' ? b.provider_subscription_id : undefined, current_period_end: typeof b.current_period_end === 'string' ? b.current_period_end : null, raw: b });
      res.json({ ok: true, subscription: sub });
    } catch (e) { console.error('billing webhook failed:', e); res.status(400).json({ error: 'BAD_REQUEST', message: 'unknown workspace' }); }
  });
  app.use('/api/import', byIp, importApi);
  // Public share links (read-only, unlisted): the token is the credential; never indexed, never cached by proxies.
  app.get('/api/public/share/:token', byIpApi, async (req, res) => {
    const s = await readShared(String(req.params.token));
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!s) { res.status(404).json({ error: 'NOT_FOUND', message: 'This link is no longer available' }); return; }
    res.json({ path: s.path, title: s.title, content: s.content, updated_at: s.updated_at, layer: s.layer });
  });
  app.get('/api/public/share/:token/assets/:id', byIpApi, async (req, res) => {
    const id = String(req.params.id); if (!/^[0-9a-f]{24}$/.test(id)) { res.status(400).end(); return; }
    const a = await readSharedAsset(String(req.params.token), id);
    if (!a) { res.status(404).end(); return; }
    res.setHeader('Content-Type', a.mime); res.setHeader('Content-Length', String(a.size)); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600'); res.setHeader('X-Robots-Tag', 'noindex');
    if (a.mime === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.send(a.data);
  });
  app.use('/api', byIpApi, api);

  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  };

  // Stateless Streamable HTTP: one transport per POST, so a VM restart loses no sessions (PRD 6.3 risk 2).
  app.post('/mcp', byIp, bearerAuth, byToken, async (req, res) => {
    const auth = res.locals.auth as AuthContext;
    recordMcpCall(auth.userId);
    const server = createMcpServer(auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('MCP request failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });
  app.get('/mcp', bearerAuth, methodNotAllowed);
  app.delete('/mcp', bearerAuth, methodNotAllowed);

  // Unexpected errors (not caught by a route): log and return JSON instead of Express's default HTML stack page
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(`Unhandled error ${req.method} ${req.path}:`, err);
    if (res.headersSent) return;
    const isMcp = req.path.startsWith('/mcp');
    res.status(500).json(isMcp ? { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null } : { error: 'INTERNAL', message: process.env.NODE_ENV === 'production' ? 'Internal server error' : String((err as Error)?.message ?? err) });
  });

  // Public-surface files for crawlers and AI search (SEO / AEO / GEO): robots, sitemap, llms.txt. Everything behind login is disallowed.
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /help\nAllow: /compare\nAllow: /privacy\nAllow: /terms\nAllow: /login\nAllow: /register\nAllow: /llms.txt\nDisallow: /n/\nDisallow: /s/\nDisallow: /graph\nDisallow: /table\nDisallow: /settings\nDisallow: /stats\nDisallow: /lint\nDisallow: /oauth/\nDisallow: /api/\nDisallow: /mcp\nSitemap: ${config.appUrl}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (_req, res) => {
    const helpPages = ['', '/guide', '/data', '/plans', '/karpathy'];
    const urls = [`${config.appUrl}/`, `${config.appUrl}/?lang=en`, ...helpPages.flatMap(p => [`${config.appUrl}/help${p}`, `${config.appUrl}/help${p}?lang=en`]), `${config.appUrl}/compare`, `${config.appUrl}/compare?lang=en`, ...['notebooklm', 'obsidian', 'hjarni'].flatMap(c => [`${config.appUrl}/compare/${c}`, `${config.appUrl}/compare/${c}?lang=en`]), `${config.appUrl}/privacy`, `${config.appUrl}/privacy?lang=en`, `${config.appUrl}/terms`, `${config.appUrl}/terms?lang=en`, `${config.appUrl}/login`, `${config.appUrl}/register`];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u.replace(/&/g, '&amp;')}</loc></url>`).join('\n')}\n</urlset>\n`);
  });
  app.get('/llms.txt', (_req, res) => {
    res.type('text/plain').send([
      '# WikiBrain — personal knowledge base',
      '',
      '> Personal knowledge base. A hosted implementation of Andrej Karpathy\'s "LLM Wiki" pattern: you curate sources, an AI agent compiles them into a persistent, interlinked Markdown wiki, and every AI client you already use (Cursor, Claude, ChatGPT, Claude Code) reads and writes the same wiki through MCP. Open-source core (AGPL-3.0), self-hostable with docker compose.',
      '> 個人知識庫（personal knowledge base）。託管的 Karpathy「LLM Wiki 模式」：你策展來源，AI agent 把來源編纂成持久、互相連結的 Markdown wiki；Cursor、Claude、ChatGPT 透過 MCP 讀寫同一座 wiki。開源核心（AGPL-3.0），可用 docker compose 自架。',
      '',
      '## What it does',
      '- Three layers: raw/ (immutable sources), wiki/ (AI-compiled pages with index.md and log.md), schema/ (rules the agent reads before writing).',
      '- Three operations: Ingest (pending sources are compiled into the wiki, in Cursor via MCP or on the web with your own API key), Query (chat with citations; answers can be filed as wiki pages), Lint (orphans, broken links, contradictions).',
      '- For researchers: bibliographic front-matter, BibTeX / CSL-JSON import and export, pandoc-style [@citekey] citations with an automatic reference list, Zotero sync.',
      '- MCP server with six tools; Bearer tokens for Cursor, OAuth 2.1 with dynamic client registration for Claude.ai and ChatGPT connectors.',
      '- Traditional Chinese and English interface; write the wiki in any language. One-click export as an Obsidian-compatible Markdown zip.',
      '',
      '## Pricing',
      '- 14-day Pro trial (no card), then Free forever (200 notes, 20 agent runs per month, bring your own API key), Pro USD 6/month or 60/year (unlimited agent runs). Model costs are not included; typical use is USD 1–3/month on your own provider bill. Self-hosting is free.',
      '',
      '## Docs',
      `- Help (zh-TW): ${config.appUrl}/help`,
      `- Help (en): ${config.appUrl}/help?lang=en`,
      `- Comparisons (NotebookLM, Obsidian, Hjarni): ${config.appUrl}/compare?lang=en`,
      '- Karpathy\'s original note: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f',
      '',
    ].join('\n'));
  });

  // SPA: static files, and every non-API path falls back to index.html.
  const webDist = opts.webDist ?? defaultWebDist;
  if (existsSync(join(webDist, 'index.html'))) {
    // Pre-rendered help page (scripts/prerender-help.tsx) for crawlers and no-JS readers; the SPA takes over in the browser.
    // Landing for signed-out visitors: pre-rendered HTML when no session cookie; signed-in users get the SPA (which shows the workspace).
    app.get('/', (req, res, next) => {
      if (handleOptOut(req, res)) return;
      if ((req.headers.cookie ?? '').includes('session_token')) return next();
      const al = String(req.headers['accept-language'] ?? '');
      const wantEn = req.query.lang === 'en' || (req.query.lang === undefined && /[a-z]{2}/i.test(al) && !/zh/i.test(al)); // any non-Chinese language → English; no header or '*' (bots, Node fetch) keeps zh-TW
      const file = join(webDist, `landing${wantEn ? '.en' : ''}.html`);
      if (!existsSync(file)) return next();
      res.setHeader('Vary', 'Accept-Language, Cookie');
      pageView(req, 'landing');
      res.sendFile(file);
    });
    app.get(['/help', '/help/:page'], (req, res, next) => {
      const al = String(req.headers['accept-language'] ?? '');
      const wantEn = req.query.lang === 'en' || (req.query.lang === undefined && /[a-z]{2}/i.test(al) && !/zh/i.test(al)); // any non-Chinese language → English; no header or '*' (bots, Node fetch) keeps zh-TW
      const slug = typeof req.params.page === 'string' && /^[a-z]+$/.test(req.params.page) ? req.params.page : 'start';
      const file = join(webDist, `help.${slug}${wantEn ? '.en' : ''}.html`);
      if (!existsSync(file)) return next();
      res.setHeader('Vary', 'Accept-Language');
      pageView(req, `help/${slug}`);
      res.sendFile(file);
    });
    app.get(['/compare', '/compare/:slug'], (req, res, next) => {
      const al = String(req.headers['accept-language'] ?? '');
      const wantEn = req.query.lang === 'en' || (req.query.lang === undefined && /[a-z]{2}/i.test(al) && !/zh/i.test(al));
      const slug = typeof req.params.slug === 'string' && /^[a-z]+$/.test(req.params.slug) ? '.' + req.params.slug : '';
      const file = join(webDist, `compare${slug}${wantEn ? '.en' : ''}.html`);
      if (!existsSync(file)) return next();
      res.setHeader('Vary', 'Accept-Language');
      pageView(req, `compare${slug}`);
      res.sendFile(file);
    });
    app.get(['/privacy', '/terms'], (req, res, next) => {
      const al = String(req.headers['accept-language'] ?? '');
      const wantEn = req.query.lang === 'en' || (req.query.lang === undefined && /[a-z]{2}/i.test(al) && !/zh/i.test(al)); // any non-Chinese language → English; no header or '*' (bots, Node fetch) keeps zh-TW
      const slug = req.path.slice(1);
      const file = join(webDist, `legal.${slug}${wantEn ? '.en' : ''}.html`);
      if (!existsSync(file)) return next();
      res.setHeader('Vary', 'Accept-Language');
      pageView(req, slug);
      res.sendFile(file);
    });
    app.use(express.static(webDist, { index: false, redirect: false }));
    app.get('*splat', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/mcp')) return next();
      res.sendFile(join(webDist, 'index.html'));
    });
  }

  return app;
}
