import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import type { AuthContext } from './auth.js';
import { pick, type Lang } from './lang.js';

// Pick the message by whatever language source is known: workspace (session routes), token (MCP), import routes; always zh-TW before authentication.
const msg = (res: Response, zh: string, en: string) => pick({ 'zh-TW': zh, en }, (res.locals.workspace?.lang ?? res.locals.auth?.lang ?? res.locals.lang ?? 'zh-TW') as Lang);

export const trustedOrigins = () => new Set([config.appUrl, ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173']), ...config.trustedOrigins]);

// CSRF: for the cookie-session custom API, state-changing methods require an Origin that is present and in the trusted list.
// better-auth's own endpoints already do this check; this covers custom routes like /api/notes* (reviewer suggestion).
export function originCheck(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.header('authorization')?.startsWith('Bearer ')) return next(); // token auth: no cookies, no CSRF surface
  const origin = req.header('origin');
  if (origin && trustedOrigins().has(origin)) return next();
  res.status(403).json({ error: 'INVALID_ORIGIN', message: msg(res, '請求來源不被信任', 'Request origin is not trusted') });
}

const jsonRpc429 = (_req: Request, res: Response) => {
  res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: msg(res, '請求過於頻繁，請稍後再試', 'Too many requests, please try again later') }, id: null });
};

// By source IP: protects unauthenticated paths (token lookup on /mcp, sign-in attempts on /api/auth).
export const ipLimiter = (limitPerMin: number) => rateLimit({
  windowMs: 60_000, limit: limitPerMin, standardHeaders: 'draft-8', legacyHeaders: false, handler: jsonRpc429,
});

// By MCP token: per-token per-minute limit after authentication (single-VM in-memory version; monthly quotas are Phase 2 R6).
export const tokenLimiter = (limitPerMin: number) => rateLimit({
  windowMs: 60_000, limit: limitPerMin, standardHeaders: 'draft-8', legacyHeaders: false, handler: jsonRpc429,
  keyGenerator: (_req, res) => `tok:${(res.locals.auth as AuthContext).tokenId}`,
});

// Rate limit counted per signed-in user (session): per-minute cap on agent operations
export const userLimiter = (limitPerMin: number) => rateLimit({
  windowMs: 60_000, limit: limitPerMin, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => { res.status(429).json({ error: 'RATE_LIMITED', message: msg(res, '操作過於頻繁，請稍後再試', 'Too many operations, please try again later') }); },
  keyGenerator: (req, res) => { const id = (res.locals.session as { user?: { id?: string } } | undefined)?.user?.id; return id ? `user:${id}` : ipKeyGenerator(req.ip ?? ''); },
});
