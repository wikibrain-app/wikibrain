import { createContext, useContext } from 'react';
import type { BibEntry } from './api';

/* ── Academic (2): pandoc-style citations [@key] ──
   Rendering: [@a; @b, p. 12] -> (Chen, 2024; Wang & Lee, 2023, p. 12), each citation links to its source page; unknown keys are dimmed.
   Data: the bib index returned by /api/notes/tree (citation_key -> source page and bibliography), supplied via BibProvider. */

export const BibContext = createContext<Map<string, BibEntry>>(new Map());
export const BibProvider = BibContext.Provider;
export const useBib = () => useContext(BibContext);
export const bibMap = (list: BibEntry[] | undefined) => new Map((list ?? []).map(b => [b.key, b]));

export function familyName(author: string): string {
  const a = author.trim();
  if (a.includes(',')) return a.split(',')[0].trim();
  const parts = a.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : a;
}
// (author, year): one author Chen; two Chen & Lin; three or more Chen et al.
export function citeLabel(e: BibEntry): string {
  const fam = e.authors.map(familyName);
  const who = fam.length === 0 ? e.title.slice(0, 24) : fam.length === 1 ? fam[0] : fam.length === 2 ? `${fam[0]} & ${fam[1]}` : `${fam[0]} et al.`;
  return e.year ? `${who}, ${e.year}` : who;
}
const CITE_RE = /\[(@[^\[\]\n]*)\]/g;
const KEY_RE = /@([\p{L}\p{N}_:.-]+)([^;]*)/gu;
export function citationKeys(md: string): string[] {
  const prose = md.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '');
  const out: string[] = [];
  for (const m of prose.matchAll(CITE_RE)) for (const k of m[1].matchAll(KEY_RE)) { const key = k[1].replace(/[.:]+$/, ''); if (!out.includes(key)) out.push(key); }
  return out;
}
// Rewrites [@...] into Markdown links (wiki:path or cite-missing:key) rendered by the Markdown component's a element; code blocks and inline code are left alone
export function rewriteCitations(md: string, bib: Map<string, BibEntry>): string {
  if (!md.includes('[@')) return md;
  const parts = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/);
  return parts.map((seg, i) => (i % 2 === 1 ? seg : seg.replace(CITE_RE, (_whole, inner: string) => {
    const items = [...inner.matchAll(KEY_RE)].map(k => {
      const key = k[1].replace(/[.:]+$/, ''); const locator = k[2].replace(/^[,\s]+|[\s,]+$/g, '');
      const e = bib.get(key);
      const label = (e ? citeLabel(e) : `@${key}`) + (locator ? `, ${locator}` : '');
      return e ? `[${label}](wiki:${encodeURIComponent(e.path)})` : `[${label}](cite-missing:${encodeURIComponent(key)})`;
    });
    return items.length ? `(${items.join('; ')})` : _whole;
  }))).join('');
}
