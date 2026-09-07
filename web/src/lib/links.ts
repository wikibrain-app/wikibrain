import type { NoteSummary } from './api';

// [[target]] resolution rules match LINK_RESOLVE_SQL in the backend notes.ts:
// full path > with .md > layer prefix plus .md > basename > title.
const LAYERS = ['raw', 'wiki', 'schema'];
const basename = (p: string) => p.split('/').pop()!.replace(/\.md$/, '');
export function resolveLink(target: string, notes: NoteSummary[]): NoteSummary | undefined {
  const t = target.trim();
  return (
    notes.find(n => n.path === t) ??
    notes.find(n => n.path === `${t}.md`) ??
    notes.find(n => LAYERS.some(l => n.path === `${l}/${t}.md`)) ??
    notes.find(n => basename(n.path) === t) ??
    notes.find(n => n.title === t)
  );
}

// Rewrites [[target|label]] into Markdown links handled by react-markdown's a component.
// Skips fenced and inline code so rule pages can explain the link syntax in backticks.
export function rewriteWikiLinks(md: string): string {
  return md
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/)
    .map((chunk, i) => (i % 2 === 1 ? chunk : chunk
      .split(/(`[^`\n]*`)/)
      .map((piece, j) => (j % 2 === 1 ? piece : piece.replace(
        /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
        (_m, target: string, label?: string) => {
          const t = target.trim();
          return `[${(label ?? t).trim() || t}](<wiki:${t}>)`;
        },
      )))
      .join('')))
    .join('');
}

export function stripFrontMatter(md: string): string {
  return md.startsWith('---\n') ? md.replace(/^---\n[\s\S]*?\n---\n?/, '') : md;
}

// Reading mode: the leading # heading is already shown as the page title, so don't render it twice.
export function stripLeadingH1(md: string): string {
  const body = stripFrontMatter(md);
  return body.replace(/^\s*#\s+[^\n]*\n?/, '');
}

// Same rules as slugify in the backend import.ts: title -> filename (slashes, colons etc. become hyphens; CJK is kept).
export function slugify(s: string): string {
  const base = s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return base || 'note';
}
