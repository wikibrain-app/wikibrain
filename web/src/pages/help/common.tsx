import { useState, type JSX, type ReactNode } from 'react';
import { useT, type Lang } from '../../i18n';

// Small pieces shared by both language versions of the help page: section type, screenshot component, shell strings.
// The shell has only three strings; they live here rather than in the i18n dictionaries so the help page and the dictionaries stay decoupled.
export type HelpSection = { id: string; title: string; sub?: boolean };
export type HelpPage = { slug: string; title: string; lede: string; sections: HelpSection[]; Body: () => JSX.Element };

export const frame: Record<Lang, { title: string; login: string; nav: string; onThisPage: string; prev: string; next: string; allPages: string }> = {
  'zh-TW': { title: '說明', login: '登入', nav: '說明目錄', onThisPage: '本頁內容', prev: '上一頁', next: '下一頁', allPages: '說明分頁' },
  en: { title: 'Help', login: 'Sign in', nav: 'Help contents', onThisPage: 'On this page', prev: 'Previous', next: 'Next', allPages: 'Help pages' },
};

// Screenshots are captured per interface language (web/public/help/<lang>/), so the English page shows the English UI.
export const helpAsset = (lang: Lang, file: string) => `/help/${lang}/${file}`;
export function Shot({ src, alt, caption, shared }: { src: string; alt: string; caption: string; shared?: boolean }) {
  const { lang } = useT();
  // shared: third-party UI screenshots; a language-specific copy under /help/shared/<lang>/ wins, else the common one
  const [state, setState] = useState<'lang' | 'common' | 'missing'>(shared ? 'lang' : 'common');
  if (state === 'missing') return null;
  const url = shared ? (state === 'lang' ? `/help/shared/${lang}/${src}` : `/help/shared/${src}`) : helpAsset(lang, src);
  return (
    <figure className="my-4 min-w-0 font-sans">
      <img src={url} alt={alt} loading="lazy" onError={() => setState(s => (s === 'lang' ? 'common' : 'missing'))} className="w-full rounded-[10px] border border-line shadow-sm" />
      <figcaption className="mt-1.5 text-[12px] text-ink-soft">{caption}</figcaption>
    </figure>
  );
}
// Two screenshots side by side on wide screens (stacked on phones)
export function Gallery({ children }: { children: ReactNode }) {
  return <div className="not-prose grid gap-4 sm:grid-cols-2">{children}</div>;
}
// Collapsible FAQ (details/summary), styled in styles.css .help-faq
export function Faq({ items }: { items: { q: string; a: string; href?: string; label?: string }[] }) {
  return (
    <div className="help-faq not-prose my-4" data-testid="help-faq">
      {items.map(f => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <div>{f.href && f.label ? <>{f.a.split(f.label)[0]}<a className="text-celadon-deep underline" href={f.href}>{f.label}</a>{f.a.split(f.label).slice(1).join(f.label)}</> : f.a}</div>
        </details>
      ))}
    </div>
  );
}
