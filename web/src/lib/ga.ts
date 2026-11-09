/* Google Analytics 4, public pages only.

   The hosted site sets GA_MEASUREMENT_ID; self-hosted builds leave it unset and nothing here ever loads. Rules:
   - Only the public routes below are measured. Anywhere else (the workspace, settings, shared pages, password reset
     links) and for any signed-in visitor, GA's own kill switch `window['ga-disable-<id>']` is set, which it checks on
     every hit. Note paths and share tokens live in those URLs and must never reach Google.
   - Page views are sent by hand with a cleaned URL (only ?lang and utm_* survive). The property's enhanced
     measurement option "page changes based on browser history events" must be OFF, or GA would record the first app
     URL on its own before this module gets the chance to disable it.
   - Consent Mode v2: ad signals are always denied; analytics storage (the GA cookie) only after the visitor accepts.
     Until they choose, GA sends cookieless pings. "Decline" stops GA entirely in this browser.
   - /?noanalytics=1 excludes this browser here too (the server-side counter has its own httpOnly cookie). */

const CONSENT_KEY = 'wb-ga-consent';
const OPT_OUT_KEY = 'wb-noanalytics';
const PUBLIC = /^\/(help(\/[^/]+)?|compare(\/[^/]+)?|privacy|terms|login|register)?$/;

type Consent = 'granted' | 'denied' | null;
type W = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void } & Record<string, unknown>;
const w = window as unknown as W;

const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let gaId: string | null = null;
let loaded = false;
let everSignedIn = false;
let lastSent = '';
const listeners = new Set<() => void>();

export const consent = (): Consent => (store.get(CONSENT_KEY) as Consent) ?? null;
const optedOut = () => store.get(OPT_OUT_KEY) === '1';
export const isPublicPath = (path: string) => PUBLIC.test(path.replace(/\/+$/, '') || '/');

/** Mirror the server's ?noanalytics switch into this browser. */
function readOptOutParam(search: string) {
  const v = new URLSearchParams(search).get('noanalytics');
  if (v === null) return;
  store.set(OPT_OUT_KEY, v === '0' ? null : '1');
}

function cleanUrl(path: string, search: string): string {
  const keep = new URLSearchParams();
  new URLSearchParams(search).forEach((v, k) => { if (k === 'lang' || k.startsWith('utm_')) keep.set(k, v); });
  const q = keep.toString();
  return `${location.origin}${path}${q ? `?${q}` : ''}`;
}

function load(id: string) {
  if (loaded) return;
  loaded = true;
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = function gtag() { (w.dataLayer as unknown[]).push(arguments); }; // gtag.js expects the arguments object
  w.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: consent() === 'granted' ? 'granted' : 'denied' });
  w.gtag('js', new Date());
  w.gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

/** Banner visibility: GA configured, still undecided, on a public page, not signed in. */
export function bannerWanted(path: string, signedIn: boolean): boolean {
  return !!gaId && consent() === null && !optedOut() && !signedIn && !everSignedIn && isPublicPath(path);
}

/** Called on every route change. */
export async function syncGa(path: string, search: string, signedIn: boolean, fetchId: () => Promise<string | null | undefined>) {
  readOptOutParam(search);
  if (signedIn) everSignedIn = true;
  const active = !signedIn && !everSignedIn && !optedOut() && consent() !== 'denied' && isPublicPath(path);
  if (gaId) w[`ga-disable-${gaId}`] = !active;
  if (!active) return;
  if (!gaId) {
    gaId = (await fetchId().catch(() => null)) ?? null;
    if (!gaId) return;
    listeners.forEach(f => f());
  }
  w[`ga-disable-${gaId}`] = false;
  load(gaId);
  const url = cleanUrl(path, search);
  if (url === lastSent) return;
  lastSent = url;
  // 'set' so GA's own events (user_engagement on page hide) also carry the cleaned URL, not the raw address bar
  w.gtag?.('set', { page_location: url, page_title: document.title });
  w.gtag?.('event', 'page_view');
}

export function setConsent(c: 'granted' | 'denied') {
  store.set(CONSENT_KEY, c);
  if (gaId) {
    if (c === 'granted') w.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    else w[`ga-disable-${gaId}`] = true;
  }
  listeners.forEach(f => f());
}

/** Re-render hook for the banner (the ID arrives asynchronously; the choice changes it). */
export function onGaChange(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }
