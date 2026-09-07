import { LANGS, markChosen, useLang, type Lang } from '../i18n';
import { api } from '../lib/api';

// Language toggle: on public pages before sign-in it remembers the choice (carried into the workspace after login);
// when the user is signed in (footer, help) it also saves to the workspace right away, same as the settings page.
const label: Record<Lang, string> = { 'zh-TW': '中文', en: 'EN' };
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <span className={`inline-flex overflow-hidden rounded-lg border border-line text-[12px] ${className}`} role="group" aria-label="Language" data-testid="lang-switch">
      {LANGS.map(l => (
        <button key={l} type="button" lang={l === 'en' ? 'en' : 'zh-Hant'} aria-pressed={lang === l} onClick={() => { markChosen(); setLang(l); api.setLang(l).catch(() => {}); }}
          className={`px-2.5 py-[5px] ${lang === l ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft hover:bg-porcelain'}`}>{label[l]}</button>
      ))}
    </span>
  );
}
