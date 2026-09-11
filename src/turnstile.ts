import type { Request, Response, NextFunction } from 'express';

/* ── Bot protection on registration (Cloudflare Turnstile) ──
   Off unless both keys are set, so development and self-hosted installs are unaffected and need no Cloudflare account.
   The widget gives the browser a token; this verifies it with Cloudflare before the request reaches better-auth, so a
   script that posts straight to the sign-up endpoint never creates an account.

   Only registration is protected. Sign-in is not: a password is already a secret, and a challenge there would stand
   between a legitimate user and their own data every single time. */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const siteKey = (): string => process.env.TURNSTILE_SITE_KEY ?? '';
export const turnstileOn = (): boolean => !!siteKey() && !!process.env.TURNSTILE_SECRET_KEY;

/** Cloudflare's verdict for one token. Never throws: a Cloudflare outage must not take registration down with it. */
async function verify(token: string, ip: string | undefined): Promise<{ ok: boolean; detail: string }> {
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY ?? '', response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST', body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: true, detail: `siteverify ${res.status}, allowed` };   // fail open, see below
    const data = await res.json() as { success?: boolean; 'error-codes'?: string[] };
    if (data.success) return { ok: true, detail: 'ok' };
    return { ok: false, detail: (data['error-codes'] ?? []).join(',') || 'rejected' };
  } catch (e) {
    /* Failing open is deliberate. A token we cannot check is a maybe-bot; a verifier we cannot reach turns every
       real person away. The first costs a junk account, the second costs every signup for the duration. */
    return { ok: true, detail: `siteverify unreachable (${(e as Error).message}), allowed` };
  }
}

/** Mount on the sign-up route, ahead of better-auth. A missing or bad token answers 403 without creating anything. */
export async function requireTurnstile(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!turnstileOn()) return next();
  const token = String(req.headers['x-turnstile-token'] ?? '').slice(0, 4096);
  const fail = (detail: string) => {
    console.warn(`turnstile: rejected a sign-up (${detail})`);
    res.status(403).json({ error: 'TURNSTILE', message: '請先完成「我不是機器人」驗證再送出。 / Please complete the verification and try again.' });
  };
  if (!token) return fail('no token');
  const { ok, detail } = await verify(token, req.ip);
  if (!ok) return fail(detail);
  if (detail !== 'ok') console.warn(`turnstile: ${detail}`);
  next();
}
