import type { JSX } from 'react';
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
export function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  const { lang } = useT();
  return (
    <figure className="my-4 font-sans">
      <img src={helpAsset(lang, src)} alt={alt} loading="lazy" className="w-full rounded-[10px] border border-line shadow-sm" />
      <figcaption className="mt-1.5 text-[12px] text-ink-soft">{caption}</figcaption>
    </figure>
  );
}
