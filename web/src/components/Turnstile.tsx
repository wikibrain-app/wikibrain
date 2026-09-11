import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { useResolvedTheme } from '../theme';

/* Cloudflare Turnstile, rendered explicitly so the widget matches the page's theme and language and so the token
   lands in React state rather than a hidden form field. Renders nothing when the deployment has no site key. */

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      remove(id: string): void;
    };
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;

/** Loads the script once per page, however many widgets ask for it. */
function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('turnstile script failed to load')); };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const { lang } = useT();
  const theme = useResolvedTheme();
  // The callback changes identity on every render; keep it in a ref so the widget is not torn down and rebuilt.
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    let id: string | undefined;
    let dead = false;
    load().then(() => {
      if (dead || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, {
        sitekey: siteKey,
        language: lang === 'zh-TW' ? 'zh-tw' : 'en',
        theme,
        callback: (token: string) => cb.current(token),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current(''),
      });
    }).catch(() => { /* offline or blocked: the server decides what to do with a missing token */ });
    return () => { dead = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey, lang, theme]);

  return <div ref={box} className="mt-3 min-h-[65px]" data-testid="turnstile" />;
}
