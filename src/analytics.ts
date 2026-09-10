import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { track } from './events.js';
import { encryptionSecretSource } from './crypto.js';

/* ── First-party page analytics ──
   The public pages are served by this process, so counting them needs no third-party script, no cookie and no consent
   banner: one row per view in the events table, which the operator page already reads.

   A visitor is identified by a salted hash of the address and user agent that changes every day. It cannot be reversed
   into an address, it is not stored anywhere else, and yesterday's visitor cannot be linked to today's — enough to
   count people rather than requests, and nothing more.

   Not counted: signed-in visitors (acquisition is about people who do not have an account yet), anyone who has opted
   out with /?noanalytics=1, obvious crawlers, and the addresses in ANALYTICS_IGNORE_IPS. */

export const OPT_OUT_COOKIE = 'wb_noanalytics';

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|preview|monitor|uptime|curl|wget|python-requests|node-fetch|axios|go-http-client|headlesschrome|lighthouse|pingdom|semrush|ahrefs|dataprovider|scrapy|postman/i;

const ignored = () => (process.env.ANALYTICS_IGNORE_IPS ?? '').split(',').map(s => s.trim()).filter(Boolean);

/** Rotates daily, so the same person on two days looks like two visitors and nothing links them. */
function visitorHash(req: Request): string {
  const day = new Date().toISOString().slice(0, 10);
  const ua = String(req.headers['user-agent'] ?? '');
  const salt = encryptionSecretSource().secret ?? process.env.BETTER_AUTH_SECRET ?? 'dev-analytics-salt';
  return createHmac('sha256', salt)
    .update(`${day}|${req.ip ?? ''}|${ua}`)
    .digest('base64url')
    .slice(0, 16);
}

export function shouldCount(req: Request): boolean {
  if (req.method !== 'GET') return false;
  const cookie = String(req.headers.cookie ?? '');
  if (cookie.includes('session_token')) return false;   // already a user
  if (cookie.includes(OPT_OUT_COOKIE)) return false;    // opted out on this browser
  const ua = String(req.headers['user-agent'] ?? '');
  if (!ua || BOT.test(ua)) return false;
  if (req.ip && ignored().includes(req.ip)) return false;
  return true;
}

/** Where the visit came from: the referring site, or the campaign tags if the link carried them. */
function source(req: Request): { ref: string | null; campaign: string | null } {
  const q = req.query as Record<string, unknown>;
  const utm = ['utm_source', 'utm_medium', 'utm_campaign']
    .map(k => (typeof q[k] === 'string' ? String(q[k]).slice(0, 40) : ''))
    .filter(Boolean).join('/');
  let ref: string | null = null;
  const raw = String(req.headers.referer ?? '');
  if (raw) {
    try {
      const h = new URL(raw).host.replace(/^www\./, '');
      ref = h && h !== new URL(process.env.APP_URL ?? 'http://localhost').host.replace(/^www\./, '') ? h : null;
    } catch { /* malformed referer */ }
  }
  return { ref, campaign: utm || null };
}

/** Record one page view. Safe to call on every public route; it decides for itself whether the view counts. */
export function pageView(req: Request, page: string): void {
  if (!shouldCount(req)) return;
  const { ref, campaign } = source(req);
  track('page_view', {}, { page, v: visitorHash(req), ref, campaign });
}

/** GET /?noanalytics=1 sets a long-lived cookie so this browser is never counted (used for the operator's own devices). */
export function handleOptOut(req: Request, res: Response): boolean {
  if (req.query.noanalytics === undefined) return false;
  const on = req.query.noanalytics !== '0';
  if (on) res.cookie(OPT_OUT_COOKIE, '1', { maxAge: 5 * 365 * 24 * 3600_000, httpOnly: true, sameSite: 'lax', path: '/' });
  else res.clearCookie(OPT_OUT_COOKIE, { path: '/' });
  res.type('text/plain').send(on ? '這個瀏覽器的瀏覽不會被計入分析。要恢復請加上 ?noanalytics=0\nThis browser is excluded from analytics.' : '已恢復計入。\nCounting restored.');
  return true;
}
