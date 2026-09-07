import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../i18n';

// Site-wide footer: help, legal pages, source, contact, version. Used by the workspace frame, PageShell and the landing page.
const s = {
  'zh-TW': { help: '說明', privacy: '隱私權政策', terms: '服務條款', source: '原始碼', contact: '聯絡' },
  en: { help: 'Help', privacy: 'Privacy', terms: 'Terms', source: 'Source', contact: 'Contact' },
};
export const CONTACT_EMAIL = 'hello@wikibrain.app';
export const SOURCE_URL = 'https://github.com/wikibrain-app/wikibrain';

export function Footer({ className = '' }: { className?: string }) {
  const { lang } = useT();
  const l = s[lang];
  const [v, setV] = useState<{ version: string; commit: string } | null>(null);
  useEffect(() => { api.config().then(c => setV({ version: c.version, commit: c.commit })).catch(() => {}); }, []);
  const link = 'hover:text-celadon-deep hover:underline';
  return (
    <footer className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 sb:px-5 py-2.5 font-sans text-[11.5px] text-ink-faint ${className}`} data-testid="site-footer">
      <span className="font-serif font-semibold text-ink-soft">WikiBrain</span>
      <Link to="/help" className={link}>{l.help}</Link>
      <Link to="/privacy" className={link}>{l.privacy}</Link>
      <Link to="/terms" className={link}>{l.terms}</Link>
      <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={link}>{l.source}</a>
      <a href={`mailto:${CONTACT_EMAIL}`} className={link}>{l.contact} · {CONTACT_EMAIL}</a>
      {v && <span className="ml-auto" data-testid="app-version">WikiBrain v{v.version}{v.commit && v.commit !== 'unknown' ? ` · ${v.commit}` : ''}</span>}
    </footer>
  );
}
