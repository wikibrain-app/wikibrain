import { LANGS, markChosen, useLang, type Lang } from '../i18n';

// Language toggle for public pages (landing, help, legal) before sign-in. After sign-in the workspace language
// (settings page) is the source of truth, so this control is only rendered for signed-out visitors.
const label: Record<Lang, string> = { 'zh-TW': '中文', en: 'EN' };
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <span className={`inline-flex overflow-hidden rounded-lg border border-line text-[12px] ${className}`} role="group" aria-label="Language" data-testid="lang-switch">
      {LANGS.map(l => (
        <button key={l} type="button" lang={l === 'en' ? 'en' : 'zh-Hant'} aria-pressed={lang === l} onClick={() => { markChosen(); setLang(l); }}
          className={`px-2.5 py-[5px] ${lang === l ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft hover:bg-porcelain'}`}>{label[l]}</button>
      ))}
    </span>
  );
}
