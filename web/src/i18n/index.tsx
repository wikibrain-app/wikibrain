import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import common from './common';
import components from './components';
import pages from './pages';

/* ── i18n (Q10) ──
   Language only affects the UI, template defaults and agent prompts; content can be in any language.
   Precedence: workspace setting (from /api/me after login) > localStorage wb-lang (before login) > browser language.
   Usage: const { t, lang } = useT(); t('sidebar.expandAll'); t('note.version', { n: 3 }) substitutes {n}. */

export type Lang = 'zh-TW' | 'en';
export const LANGS: Lang[] = ['zh-TW', 'en'];
const KEY = 'wb-lang';

type Dict = Record<string, string>;
const dicts: Record<Lang, Dict> = {
  'zh-TW': { ...common['zh-TW'], ...components['zh-TW'], ...pages['zh-TW'] },
  en: { ...common.en, ...components.en, ...pages.en },
};

export function detectLang(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'zh-TW' || q === 'en') { rememberLang(q); return q; }
  } catch { /* ignore */ }
  try { const v = localStorage.getItem(KEY); if (v === 'zh-TW' || v === 'en') return v; } catch { /* ignore */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'zh-TW';
  return /^zh/i.test(nav) ? 'zh-TW' : 'en';
}
export function rememberLang(lang: Lang) { try { localStorage.setItem(KEY, lang); } catch { /* ignore */ } }

export type TFn = (key: string, params?: Record<string, string | number>) => string;
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? dicts['zh-TW'][key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'zh-TW', setLang: () => {} });

export function LangProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? detectLang());
  const setLang = useCallback((l: Lang) => { setLangState(l); rememberLang(l); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() { return useContext(Ctx); }
export function useT(): { t: TFn; lang: Lang; locale: string } {
  const { lang } = useContext(Ctx);
  const t = useCallback<TFn>((key, params) => translate(lang, key, params), [lang]);
  return { t, lang, locale: lang === 'en' ? 'en-US' : 'zh-TW' };
}
// Date/time formatting follows the UI language
export function fmtDateTime(lang: Lang, d: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', opts ?? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(lang: Lang, d: string | Date): string {
  return new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW');
}
