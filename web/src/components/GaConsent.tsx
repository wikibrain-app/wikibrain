import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useLang } from '../i18n';
import { bannerWanted, onGaChange, setConsent } from '../lib/ga';

// Small, non-blocking consent bar for GA on the public pages (see lib/ga.ts). Copy is inline like the landing page's.
const copy = {
  'zh-TW': { text: '我們用 Google Analytics 了解哪些公開頁面有用。接受才會設定分析 cookie；登入後的知識庫一律不追蹤。', more: '隱私政策', yes: '接受', no: '拒絕' },
  en: { text: 'We use Google Analytics to learn which public pages help. The analytics cookie is set only if you accept; your workspace is never tracked.', more: 'Privacy policy', yes: 'Accept', no: 'Decline' },
};

export function GaConsent({ signedIn }: { signedIn: boolean }) {
  const { pathname } = useLocation();
  const { lang } = useLang();
  const [, bump] = useState(0);
  useEffect(() => onGaChange(() => bump(n => n + 1)), []);
  if (!bannerWanted(pathname, signedIn)) return null;
  const c = copy[lang];
  return (
    <div role="region" aria-label={lang === 'en' ? 'Analytics consent' : '分析同意'} data-testid="ga-consent"
      className="fixed inset-x-0 bottom-0 z-40 px-4" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-paper px-4 py-3 text-[13px] text-ink shadow-lg">
        <p className="min-w-0 flex-1 basis-64">{c.text} <Link to="/privacy" className="text-celadon-deep underline">{c.more}</Link></p>
        <span className="flex gap-2">
          <button type="button" onClick={() => setConsent('denied')} className="rounded-lg border border-line px-3 py-1.5 text-ink-soft hover:bg-porcelain" data-testid="ga-decline">{c.no}</button>
          <button type="button" onClick={() => setConsent('granted')} className="rounded-lg bg-celadon px-3 py-1.5 font-semibold text-white hover:bg-celadon-deep" data-testid="ga-accept">{c.yes}</button>
        </span>
      </div>
    </div>
  );
}
