import { pool } from './db.js';
import { NoteError, parseFrontMatter, type PropValue } from './notes.js';
import { citationKey, type Converted, type SourceMeta } from './import.js';

/* ── Bibliography import/export (Q10 academic 1) ──
   Import: BibTeX (.bib) and CSL-JSON (.json exported from Zotero / Mendeley) → one page per entry at raw/sources/<citekey>.md; bibliographic data goes into front-matter, the abstract becomes the body.
   Export: raw/ pages with bibliographic data → .bib or CSL-JSON. The source of truth may stay in Zotero; this is only for interoperability. */

export interface BibEntry { type: string; key: string; fields: Record<string, string> }

// Minimal map of LaTeX accents and symbols (common in Zotero / Google Scholar exports)
const ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', c: 'ć', n: 'ń', s: 'ś', z: 'ź', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' },
  '~': { a: 'ã', o: 'õ', n: 'ñ', N: 'Ñ' },
  c: { c: 'ç', C: 'Ç' }, v: { c: 'č', s: 'š', z: 'ž', C: 'Č', S: 'Š', Z: 'Ž', r: 'ř', e: 'ě' }, u: { a: 'ă' }, k: { a: 'ą', e: 'ę' },
};
export function latexToText(s: string): string {
  let out = s.replace(/\\([`'^"~cvuk])\{?([A-Za-z])\}?/g, (m, acc: string, ch: string) => ACCENTS[acc]?.[ch] ?? m);
  out = out.replace(/\\ss\b/g, 'ß').replace(/\\o\b/g, 'ø').replace(/\\O\b/g, 'Ø').replace(/\\ae\b/g, 'æ').replace(/\\l\b/g, 'ł').replace(/\\&/g, '&').replace(/\\%/g, '%').replace(/\\_/g, '_').replace(/\\#/g, '#').replace(/---/g, '—').replace(/--/g, '–');
  out = out.replace(/\\(?:emph|textit|textbf|textsc|url)\{([^}]*)\}/g, '$1');
  return out.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}
// Export escaping: backslashes, braces and & % # _ must all be handled, otherwise a source title could smuggle macros like \input; newlines are always removed
const LATEX_ESC: Record<string, string> = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%', '#': '\\#', '_': '\\_' };
const textToLatex = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/[\\{}&%#_]/g, ch => LATEX_ESC[ch]);
const safeBibKey = (k: string) => k.replace(/[^\p{L}\p{N}_:-]/gu, '') || 'key';
const safeUrl = (u: string) => u.replace(/[{}\s\\]/g, '');

// Parse .bib: @type{key, field = {…} | "…" | 123, …}; @string / @comment / @preamble are skipped; braces may nest.
export function parseBibtex(text: string): BibEntry[] {
  const out: BibEntry[] = [];
  const strings = new Map<string, string>([['jan', 'January'], ['feb', 'February'], ['mar', 'March'], ['apr', 'April'], ['may', 'May'], ['jun', 'June'], ['jul', 'July'], ['aug', 'August'], ['sep', 'September'], ['oct', 'October'], ['nov', 'November'], ['dec', 'December']]);
  const src = text.replace(/\r\n?/g, '\n');
  let i = 0;
  const skipWs = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const readValue = (): string => {
    skipWs();
    const parts: string[] = [];
    for (;;) {
      skipWs();
      const ch = src[i];
      if (ch === '{') {
        let depth = 0, start = i;
        for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } } }
        parts.push(src.slice(start + 1, i - 1));
      } else if (ch === '"') {
        let start = ++i, depth = 0;
        for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; else if (src[i] === '"' && depth === 0) break; }
        parts.push(src.slice(start, i)); i++;
      } else {
        const m = src.slice(i).match(/^[^,}\s#]+/); if (!m) break;
        parts.push(strings.get(m[0].toLowerCase()) ?? m[0]); i += m[0].length; // bare token: @string macro or number
      }
      skipWs();
      if (src[i] === '#') { i++; continue; } // string concatenation
      break;
    }
    return parts.join('');
  };
  while (i < src.length) {
    const at = src.indexOf('@', i); if (at < 0) break;
    i = at + 1;
    const tm = src.slice(i).match(/^([A-Za-z]+)\s*[{(]/); if (!tm) continue;
    const type = tm[1].toLowerCase(); i += tm[0].length;
    if (type === 'string') { // @string{name = "value"}: later bare tokens expand to it
      skipWs(); const sm = src.slice(i).match(/^([^=\s]+)\s*=/); if (sm) { i += sm[0].length; strings.set(sm[1].toLowerCase(), readValue()); }
      const close = src.indexOf('\n@', i); i = close < 0 ? src.length : close + 1; continue;
    }
    if (type === 'comment' || type === 'preamble') { const close = src.indexOf('\n@', i); i = close < 0 ? src.length : close + 1; continue; }
    skipWs();
    const km = src.slice(i).match(/^([^,\s}]+)\s*,?/); if (!km) continue;
    const key = km[1]; i += km[0].length;
    const fields: Record<string, string> = {};
    for (;;) {
      skipWs();
      if (i >= src.length || src[i] === '}' || src[i] === ')') { i++; break; }
      const fm = src.slice(i).match(/^([A-Za-z][\w-]*)\s*=/); if (!fm) { i++; continue; }
      i += fm[0].length;
      fields[fm[1].toLowerCase()] = readValue();
      skipWs(); if (src[i] === ',') i++;
    }
    if (key) out.push({ type, key, fields });
  }
  return out;
}

// Authors: BibTeX "Last, First and Last, First" → "First Last"; CJK names or those without a comma stay as-is
export function splitAuthors(s: string): string[] {
  return s.split(/\s+and\s+/i).map(a => latexToText(a)).map(a => {
    if (a.includes(',')) { const [last, first] = a.split(',').map(x => x.trim()); return first ? `${first} ${last}` : last; }
    return a.trim();
  }).filter(Boolean);
}

const EXTRA_FIELDS = ['volume', 'number', 'pages', 'publisher', 'address', 'edition', 'isbn', 'issn', 'series', 'editor', 'institution', 'school', 'note', 'keywords', 'language', 'month', 'chapter', 'howpublished'];
export function bibEntryToConverted(e: BibEntry): Converted {
  const f = Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, latexToText(v)]));
  const year = Number((f.year ?? f.date ?? '').match(/\d{4}/)?.[0]) || undefined;
  const venue = f.journal ?? f.journaltitle ?? f.booktitle ?? f.publisher ?? f.institution ?? f.school ?? undefined;
  const doi = f.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') || undefined;
  const authors = f.author ? splitAuthors(e.fields.author) : undefined;
  const extra: Record<string, PropValue> = { bibtex_type: e.type };
  for (const k of EXTRA_FIELDS) if (f[k]) extra[k] = f[k];
  const meta: SourceMeta = {
    source_type: 'paper', title: f.title || e.key, fetched_at: new Date().toISOString(), doi, authors, year, venue,
    source_url: f.url || (doi ? `https://doi.org/${doi}` : undefined), citation_key: e.key.replace(/[^\p{L}\p{N}_-]/gu, '') || citationKey({ authors, year, title: f.title }), extra,
  };
  const body = f.abstract ? `## 摘要 / Abstract\n\n${f.abstract}` : '';
  return { meta, markdown: body };
}

// CSL-JSON (Zotero "CSL JSON" export)
type Csl = { id?: string; type?: string; title?: string; author?: { family?: string; given?: string; literal?: string }[]; issued?: { 'date-parts'?: number[][] }; 'container-title'?: string; DOI?: string; URL?: string; volume?: string | number; issue?: string | number; page?: string; publisher?: string; abstract?: string; ISBN?: string; ISSN?: string; keyword?: string; language?: string; 'citation-key'?: string };
const CSL_TO_BIB: Record<string, string> = { 'article-journal': 'article', 'paper-conference': 'inproceedings', book: 'book', chapter: 'incollection', thesis: 'phdthesis', report: 'techreport', webpage: 'misc', 'post-weblog': 'misc' };
const BIB_TO_CSL: Record<string, string> = Object.fromEntries(Object.entries(CSL_TO_BIB).map(([a, b]) => [b, a]));
export function parseCslJson(text: string): Converted[] {
  let arr: unknown;
  try { arr = JSON.parse(text); } catch { throw new NoteError('BAD_PATH', { 'zh-TW': 'CSL-JSON 格式不正確', en: 'Invalid CSL-JSON' }); }
  const items = (Array.isArray(arr) ? arr : (arr as { items?: unknown[] })?.items ?? []) as Csl[];
  if (!items.length || !items.every(x => x && typeof x === 'object')) throw new NoteError('BAD_PATH', { 'zh-TW': 'CSL-JSON 裡沒有書目項目', en: 'No bibliographic items in the CSL-JSON' });
  const sv = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
  return items.map(raw => {
    const it: Csl = { ...raw, title: sv(raw.title), 'container-title': sv(raw['container-title']), DOI: sv(raw.DOI), URL: sv(raw.URL), volume: sv(raw.volume), issue: sv(raw.issue), page: sv(raw.page), publisher: sv(raw.publisher), abstract: sv(raw.abstract), ISBN: sv(raw.ISBN), ISSN: sv(raw.ISSN), keyword: sv(raw.keyword), language: sv(raw.language), 'citation-key': sv(raw['citation-key']), id: sv(raw.id), type: sv(raw.type) };
    const authors = (Array.isArray(it.author) ? it.author : []).filter(a => a && typeof a === 'object').map(a => sv(a.literal) ?? [sv(a.given), sv(a.family)].filter(Boolean).join(' ')).filter(Boolean);
    const year = it.issued?.['date-parts']?.[0]?.[0] || undefined;
    const doi = it.DOI?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') || undefined;
    const extra: Record<string, PropValue> = { bibtex_type: CSL_TO_BIB[it.type ?? ''] ?? 'misc' };
    if (it.volume) extra.volume = String(it.volume); if (it.issue) extra.number = String(it.issue); if (it.page) extra.pages = it.page;
    if (it.publisher) extra.publisher = it.publisher; if (it.ISBN) extra.isbn = it.ISBN; if (it.ISSN) extra.issn = it.ISSN; if (it.keyword) extra.keywords = it.keyword; if (it.language) extra.language = it.language;
    const meta: SourceMeta = {
      source_type: 'paper', title: it.title || it.id || 'untitled', fetched_at: new Date().toISOString(), doi, authors, year, venue: it['container-title'] || it.publisher || undefined,
      source_url: it.URL || (doi ? `https://doi.org/${doi}` : undefined), citation_key: (it['citation-key'] ?? '').replace(/[^\p{L}\p{N}_-]/gu, '') || citationKey({ authors, year, title: it.title }) || (it.id ? String(it.id).replace(/[^\p{L}\p{N}_-]/gu, '') : undefined), extra,
    };
    return { meta, markdown: it.abstract ? `## 摘要 / Abstract\n\n${it.abstract}` : '' };
  });
}

// Decide from extension / content whether this is a bibliography file
export function looksLikeBibliography(filename: string, buf: Buffer): 'bibtex' | 'csl' | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const head = buf.subarray(0, 4096).toString('utf8').trimStart();
  if (ext === 'bib' || ext === 'bibtex') return 'bibtex';
  if (ext === 'json' && (head.startsWith('[') || head.startsWith('{'))) return 'csl';
  if (/^@[A-Za-z]+\s*[{(]/.test(head)) return 'bibtex';
  return null;
}
export function convertBibliography(buf: Buffer, filename: string): Converted[] {
  const kind = looksLikeBibliography(filename, buf);
  const text = buf.toString('utf8').replace(/^﻿/, '');
  if (kind === 'csl') return parseCslJson(text);
  const entries = parseBibtex(text);
  if (!entries.length) throw new NoteError('BAD_PATH', { 'zh-TW': 'BibTeX 裡沒有解析到任何條目', en: 'No entries found in the BibTeX file' });
  return entries.map(bibEntryToConverted);
}

/* ── Export ── */
export interface BibSource { path: string; title: string; props: Record<string, PropValue> }
export async function listBibSources(ws: string): Promise<BibSource[]> {
  const { rows } = await pool.query<{ path: string; title: string; content_md: string }>(
    `SELECT path, title, content_md FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL AND path LIKE 'raw/%' AND content_md LIKE '---\n%' ORDER BY path`, [ws]);
  return rows.map(r => ({ path: r.path, title: r.title, props: parseFrontMatter(r.content_md) }))
    .filter(r => r.props.citation_key || r.props.doi || (Array.isArray(r.props.authors) && r.props.authors.length));
}
const str = (v: PropValue | undefined) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));
const keyFor = (s: BibSource) => str(s.props.citation_key) || citationKey({ authors: Array.isArray(s.props.authors) ? s.props.authors : undefined, year: Number(s.props.year) || undefined, title: str(s.props.title) || s.title }) || s.path.split('/').pop()!.replace(/\.md$/, '');
export function toBibtex(sources: BibSource[]): string {
  const used = new Set<string>();
  return sources.map(s => {
    const p = s.props; let key = safeBibKey(keyFor(s)); for (let n = 2; used.has(key); n++) key = `${safeBibKey(keyFor(s))}-${n}`; used.add(key);
    const type = (str(p.bibtex_type).match(/^[a-z]+$/i)?.[0]) || (p.venue ? 'article' : 'misc');
    const authors = Array.isArray(p.authors) ? p.authors : p.authors ? [String(p.authors)] : [];
    const f: [string, string][] = [['title', str(p.title) || s.title]];
    if (authors.length) f.push(['author', authors.join(' and ')]);
    if (p.year) f.push(['year', str(p.year)]);
    if (p.venue) f.push([type === 'inproceedings' || type === 'incollection' ? 'booktitle' : type === 'book' || type === 'techreport' ? 'publisher' : 'journal', str(p.venue)]);
    for (const k of EXTRA_FIELDS) if (p[k] && !(k === 'publisher' && f.some(x => x[0] === 'publisher'))) f.push([k, str(p[k])]);
    if (p.doi) f.push(['doi', str(p.doi)]);
    if (p.source_url) f.push(['url', str(p.source_url)]);
    f.push(['note', `WikiBrain: ${s.path}`]);
    return `@${type}{${key},\n${f.map(([k, v]) => `  ${k} = {${k === 'url' || k === 'doi' ? safeUrl(v) : textToLatex(v)}}`).join(',\n')}\n}`;
  }).join('\n\n') + '\n';
}
export function toCslJson(sources: BibSource[]): string {
  const items = sources.map(s => {
    const p = s.props; const authors = Array.isArray(p.authors) ? p.authors : p.authors ? [String(p.authors)] : [];
    const item: Record<string, unknown> = { id: keyFor(s), 'citation-key': keyFor(s), type: BIB_TO_CSL[str(p.bibtex_type)] ?? (p.venue ? 'article-journal' : 'document'), title: str(p.title) || s.title };
    if (authors.length) item.author = authors.map(a => { const parts = a.trim().split(/\s+/); return parts.length > 1 && /^[A-Za-z]/.test(a) ? { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] } : { literal: a }; });
    if (p.year) item.issued = { 'date-parts': [[Number(p.year)]] };
    if (p.venue) item['container-title'] = str(p.venue);
    if (p.doi) item.DOI = str(p.doi); if (p.source_url) item.URL = str(p.source_url);
    if (p.volume) item.volume = str(p.volume); if (p.number) item.issue = str(p.number); if (p.pages) item.page = str(p.pages);
    if (p.publisher) item.publisher = str(p.publisher); if (p.isbn) item.ISBN = str(p.isbn); if (p.issn) item.ISSN = str(p.issn);
    item.note = `WikiBrain: ${s.path}`;
    return item;
  });
  return JSON.stringify(items, null, 2) + '\n';
}
