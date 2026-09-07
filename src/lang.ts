// Language (Q10): only the UI, templates and agent system prompts carry a language; content language is unrestricted.
export const LANGS = ['zh-TW', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);
export type Bilingual = { 'zh-TW': string; en: string };
// Pick a bilingual message; a plain string means the same text for both languages
export const pick = (m: string | Bilingual, lang: Lang = 'zh-TW'): string => (typeof m === 'string' ? m : m[lang] ?? m['zh-TW']);
// One-line language instruction for agent system prompts (schema rules may override it)
export const langLine = (lang: Lang): string =>
  lang === 'en' ? 'Write all output in English unless the schema rules specify another language.' : '所有輸出繁體中文（台灣用語），除非 schema 規則另有指定。';
