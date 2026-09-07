import { JSDOM, VirtualConsole } from 'jsdom';

// jsdom prints "Could not parse CSS stylesheet" for modern CSS; irrelevant to import, so silence it.
const quiet = new VirtualConsole();
quiet.on('jsdomError', () => {});
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { createNote, NoteError, normalizeFolder, parseFrontMatter, type Actor, type PropValue } from './notes.js';
import { assertCanWrite } from './plans.js';
import { pool } from './db.js';

/* ── Source import (PRD §5.2 "Source import", decision 9) ──
   URL / file / pasted text → Markdown (front-matter records source and bibliography) → raw/sources/. Original files are not kept in v1. */

export type SourceType = 'web' | 'paper' | 'pdf' | 'docx' | 'text' | 'markdown';
export interface SourceMeta {
  source_type: SourceType;
  title: string;
  source_url?: string;
  filename?: string;
  fetched_at: string;
  doi?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  citation_key?: string;
  excerpt?: string;
  extra?: Record<string, PropValue>;   // front-matter fields (other than title) carried by uploaded Markdown, preserved as-is
}
export interface Converted { meta: SourceMeta; markdown: string }
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export const LIMITS = { fetchBytes: 5 * 1024 * 1024, uploadBytes: 20 * 1024 * 1024, timeoutMs: 15_000, minContentChars: 200 };
// Ordinary browser UA (many sites return a stripped page to non-browser UAs); Accept-Language makes Wikipedia etc. return the Traditional Chinese variant.
export const FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 WikiBrain/0.1',
  'accept-language': 'zh-TW,zh-Hant;q=0.9,zh;q=0.8,en;q=0.7',
  accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5',
};
// Common titles of bot-check pages; getting one of these means no body text was fetched.
const CHALLENGE_TITLES = /^(client challenge|just a moment\.{0,3}|access denied|attention required!?|are you a robot\??|security check|verify you are human|403 forbidden|請稍候|請稍等|正在驗證)/i;
export const isChallengePage = (title: string, markdown: string) => CHALLENGE_TITLES.test(title.trim()) || /enable javascript and cookies to continue|checking your browser before accessing/i.test(markdown);

/* ── Security: SSRF protection is centralized in net-guard.ts (per-hop redirect checks, DNS pinning, size limits) ── */
export { assertPublicHttpUrl, isPrivateIp, safeFetch } from './net-guard.js';
import { assertPublicHttpUrl, safeFetch } from './net-guard.js';

/* ── HTML → Markdown ── */
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
turndown.use(gfm);
turndown.remove(['script', 'style', 'noscript', 'iframe']);

function metaOf(doc: Document, names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    doc.querySelectorAll(`meta[name="${n}"], meta[property="${n}"]`).forEach(m => {
      const c = m.getAttribute('content')?.trim();
      if (c) out.push(c);
    });
  }
  return out;
}
const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i;
export function extractDoi(s: string | undefined): string | undefined {
  const m = s?.match(DOI_RE);
  return m ? m[1].replace(/[.,;)]+$/, '') : undefined;
}

// "Article title - Site name" → "Article title" (common on Wikipedia and news sites).
const SITE_WORDS = /wikipedia|維基百科|维基百科|百科|報導者|新聞|News|Times|Post|Daily|Journal|Magazine|週刊|日報|電子報|Blog|Weblog|The Reporter|Medium|Substack|Help|說明中心|資料庫|Library|官方網站|首頁/i;
export function stripSiteSuffix(title: string, siteName?: string): string {
  title = title.replace(/^GitHub - /, '');
  // Strip at most two levels: "Article | Notion Help – Notion" → "Article"
  for (let i = 0; i < 2; i++) {
    const m = title.match(/^(.*\S)\s*[-–—|·]\s*([^-–—|·]+)$/);
    if (!m) break;
    const head = m[1].trim(), tail = m[2].trim();
    const spaced = /\s[-–—|·]\s/.test(title.slice(head.length, title.length - tail.length));
    const isSite = (siteName && (tail === siteName.trim() || siteName.includes(tail))) || (SITE_WORDS.test(tail) && tail.length <= 30);
    // Hyphens without spaces ("大學法-全國法規資料庫") are stripped only when the tail clearly looks like a site name, so titles like "AI-驅動" survive
    if (!isSite || (!spaced && !SITE_WORDS.test(tail))) break;
    if (head.length < 2) break;
    title = head;
  }
  return title;
}

// News sites and blogs often embed schema.org Article / NewsArticle JSON-LD: headline is cleaner than og:title, and author / datePublished live here too.
function readJsonLd(doc: Document): { headline?: string; authors?: string[]; year?: number; publisher?: string } {
  const out: { headline?: string; authors?: string[]; year?: number; publisher?: string } = {};
  const nodes: any[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try { const j = JSON.parse(s.textContent ?? ''); nodes.push(...(Array.isArray(j) ? j : j?.['@graph'] ? j['@graph'] : [j])); } catch { /* skip broken JSON-LD */ }
  });
  const art = nodes.find(n => /Article|NewsArticle|BlogPosting|ScholarlyArticle|Report/i.test(String(n?.['@type'])));
  if (!art) return out;
  if (typeof art.headline === 'string') out.headline = art.headline.trim();
  const authors = (Array.isArray(art.author) ? art.author : art.author ? [art.author] : []).map((a: any) => (typeof a === 'string' ? a : a?.name)).filter((x: unknown) => typeof x === 'string' && x.trim());
  if (authors.length) out.authors = [...new Set(authors as string[])];
  const y = String(art.datePublished ?? art.dateCreated ?? '').match(/\d{4}/)?.[0];
  if (y) out.year = Number(y);
  const pub = typeof art.publisher === 'string' ? art.publisher : art.publisher?.name;
  if (typeof pub === 'string') out.publisher = pub.trim();
  return out;
}

export function htmlToMarkdown(html: string, url?: string): { title: string; markdown: string; meta: Partial<SourceMeta>; article: boolean; pdfUrl?: string } {
  const dom = new JSDOM(html, { ...(url ? { url } : {}), virtualConsole: quiet });
  const doc = dom.window.document;
  const meta: Partial<SourceMeta> = {};
  const doi = extractDoi(metaOf(doc, ['citation_doi', 'DC.Identifier.DOI', 'dc.identifier', 'DC.Identifier', 'prism.doi'])[0]) ?? extractDoi(url);
  if (doi) meta.doi = doi;
  const authors = metaOf(doc, ['citation_author', 'DC.Creator.PersonalName', 'dc.creator', 'DC.Creator', 'author']);
  if (authors.length) meta.authors = [...new Set(authors)];
  const date = metaOf(doc, ['citation_publication_date', 'citation_date', 'DC.Date.issued', 'DC.Date.created', 'dc.date', 'DC.Date', 'article:published_time'])[0];
  const year = date?.match(/\d{4}/)?.[0];
  if (year) meta.year = Number(year);
  const venue = metaOf(doc, ['citation_journal_title', 'citation_conference_title', 'DC.Source', 'og:site_name'])[0];
  const pdfUrl = metaOf(doc, ['citation_pdf_url'])[0];
  if (venue) meta.venue = venue;
  const ld = readJsonLd(doc);
  // Some sites (Wikipedia) put a long description in the JSON-LD headline; over 80 chars it is not used as the title
  const ldHeadline = ld.headline && ld.headline.length <= 80 ? ld.headline : undefined;
  const metaTitle = metaOf(doc, ['citation_title', 'dc.title', 'DC.Title'])[0] || ldHeadline || metaOf(doc, ['og:title'])[0];
  const siteName = metaOf(doc, ['og:site_name'])[0] || ld.publisher;
  if (!meta.authors?.length && ld.authors?.length) meta.authors = ld.authors;
  if (!meta.year && ld.year) meta.year = ld.year;
  if (!meta.venue && ld.publisher) meta.venue = ld.publisher;

  // Readability drops headings wrapped in a <div> (Wikipedia's div.mw-heading etc.); unwrap divs that contain only a single heading first.
  doc.querySelectorAll('div').forEach(d => {
    if (d.children.length === 1 && /^H[1-6]$/.test(d.children[0].tagName) && d.textContent?.trim() === d.children[0].textContent?.trim()) d.replaceWith(d.children[0]);
  });
  doc.querySelectorAll('.mw-editsection, [role="navigation"]').forEach(e => e.remove());

  const article = new Readability(doc).parse();
  const title = stripSiteSuffix((metaTitle || article?.title || doc.title || url || '未命名來源').trim(), siteName);
  const body = article?.content ?? doc.body?.innerHTML ?? '';
  const markdown = turndown.turndown(body).trim();
  const excerpt = article?.excerpt?.trim();
  if (excerpt && excerpt.length >= 40) meta.excerpt = excerpt; // very short excerpts are usually noise like "Loading metrics"
  return { title, markdown, meta, article: !!article, pdfUrl: pdfUrl ? new URL(pdfUrl, url).href : undefined };
}

/* ── Crossref: fill in bibliography by DOI (skipped on failure) ── */
export async function lookupCrossref(doi: string, fetchImpl: Fetcher = fetch): Promise<Partial<SourceMeta>> {
  try {
    const res = await fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'user-agent': 'WikiBrain/0.1 (mailto:hello@wikibrain.example)' }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const m = (await res.json())?.message ?? {};
    const out: Partial<SourceMeta> = { doi };
    if (m.title?.[0]) out.title = m.title[0];
    if (Array.isArray(m.author) && m.author.length) out.authors = m.author.map((a: any) => [a.family, a.given].filter(Boolean).join(', ') || a.name).filter(Boolean);
    const y = m.issued?.['date-parts']?.[0]?.[0] ?? m.published?.['date-parts']?.[0]?.[0];
    if (y) out.year = Number(y);
    if (m['container-title']?.[0]) out.venue = m['container-title'][0];
    return out;
  } catch { return {}; }
}

// First author surname: "Chen, Amy" → before the comma; "Hsiao-Yuan Su" → last word; Chinese names without spaces are used whole.
export function familyName(author: string): string {
  const a = author.trim();
  if (a.includes(',')) return a.split(',')[0].trim();
  const parts = a.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : a;
}
export function citationKey(meta: Partial<SourceMeta>): string | undefined {
  if (!meta.authors?.length || !meta.year) return undefined;
  const family = familyName(meta.authors[0]).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const word = (meta.title ?? '').toLowerCase().match(/[\p{L}\p{N}]{3,}/u)?.[0] ?? '';
  return `${family}${meta.year}${word}`.slice(0, 60) || undefined;
}

/* ── Per-type converters ── */
export interface ConvertedWithWarning extends Converted { warning?: string }

const YT_RE = /^(?:www\.|m\.)?(?:youtube\.com|youtu\.be)$/i;
const GDOC_RE = /^https:\/\/docs\.google\.com\/document\/d\/([^/]+)/;
const ARXIV_RE = /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7})(?:\.pdf)?/i;
const PUBMED_RE = /^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i;
// Platforms that require sign-in to view content: explain up front instead of a futile fetch.
const LOGIN_WALLED = /(^|\.)(facebook\.com|fb\.com|instagram\.com|threads\.net|x\.com|twitter\.com|linkedin\.com|line\.me)$/i;

// Public Google Docs link → anonymously readable HTML export endpoint.
export function rewriteGoogleDocs(url: string): string {
  const m = url.match(GDOC_RE);
  return m ? `https://docs.google.com/document/d/${m[1]}/export?format=html` : url;
}
export const arxivIdOf = (url: string) => url.match(ARXIV_RE)?.[1];
export const pubmedIdOf = (url: string) => url.match(PUBMED_RE)?.[1];

const xmlText = (root: ParentNode, sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';

// PubMed: the page has a bot check, so use NCBI E-utilities (efetch XML) instead.
export function parsePubmedXml(xml: string, pmid: string, url: string): ConvertedWithWarning {
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  const art = doc.querySelector('PubmedArticle');
  if (!art) throw new NoteError('NOT_FOUND', { 'zh-TW': `PubMed 找不到 PMID ${pmid}`, en: `PubMed has no record for PMID ${pmid}` });
  const title = xmlText(art, 'ArticleTitle').replace(/\.$/, '');
  const authors = [...art.querySelectorAll('AuthorList > Author')].map(a => [xmlText(a, 'LastName'), xmlText(a, 'ForeName')].filter(Boolean).join(', ') || xmlText(a, 'CollectiveName')).filter(Boolean);
  const year = Number(xmlText(art, 'Journal PubDate Year') || xmlText(art, 'ArticleDate Year')) || undefined;
  const venue = xmlText(art, 'Journal > Title') || undefined;
  const doi = [...art.querySelectorAll('ArticleId')].find(e => e.getAttribute('IdType') === 'doi')?.textContent?.trim() || xmlText(art, 'ELocationID[EIdType="doi"]') || undefined;
  const abstractParts = [...art.querySelectorAll('Abstract > AbstractText')].map(a => { const label = a.getAttribute('Label'); return (label ? `**${label}**：` : '') + (a.textContent?.trim() ?? ''); });
  const keywords = [...art.querySelectorAll('KeywordList > Keyword')].map(k => k.textContent?.trim()).filter(Boolean);
  const md = [abstractParts.length ? `## 摘要\n\n${abstractParts.join('\n\n')}` : '', keywords.length ? `## 關鍵詞\n\n${keywords.join('、')}` : '', `PMID: ${pmid}`].filter(Boolean).join('\n\n');
  const meta: SourceMeta = { source_type: 'paper', title, source_url: url, fetched_at: new Date().toISOString(), authors, year, venue, doi };
  meta.citation_key = citationKey(meta);
  return { meta, markdown: md };
}

// arXiv: use the export API for bibliography and abstract (the abs page lacks citation_doi meta; the PDF lacks title metadata).
export async function arxivMeta(id: string, fetchImpl: Fetcher): Promise<Partial<SourceMeta> & { summary?: string }> {
  try {
    const res = await fetchImpl(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const doc = new JSDOM(await res.text(), { contentType: 'text/xml' }).window.document;
    const entry = doc.querySelector('entry');
    if (!entry) return {};
    const title = xmlText(entry, 'title').replace(/\s+/g, ' ');
    if (!title || /^Error/i.test(title)) return {};
    const authors = [...entry.querySelectorAll('author > name')].map(n => n.textContent!.trim());
    const year = Number(xmlText(entry, 'published').slice(0, 4)) || undefined;
    const doi = [...entry.getElementsByTagName('*')].find(e => e.localName === 'doi')?.textContent?.trim() || undefined;
    return { title, authors, year, venue: 'arXiv', doi, summary: xmlText(entry, 'summary').replace(/\s+/g, ' ') };
  } catch { return {}; }
}

async function renderSpa(url: string, allowPrivate?: boolean): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const { renderWithBrowser } = await import('./headless.js');
    return await renderWithBrowser(url, { allowPrivate });
  } catch (e) {
    console.warn('Headless rendering failed (skipped):', (e as Error).message.split('\n')[0]);
    return null;
  }
}

async function toSafe(r: Response): Promise<{ status: number; ok: boolean; headers: Headers; url: string; body: Buffer }> {
  return { status: r.status, ok: r.ok, headers: r.headers, url: r.url, body: Buffer.from(await r.arrayBuffer()) };
}

export async function convertUrl(rawUrl: string, opts: { fetchImpl?: Fetcher; allowPrivate?: boolean; headless?: boolean } = {}): Promise<ConvertedWithWarning> {
  const url = await assertPublicHttpUrl(rewriteGoogleDocs(rawUrl), { allowPrivate: opts.allowPrivate });
  const fetchImpl = opts.fetchImpl ?? fetch;
  const fetched_at = new Date().toISOString();

  if (LOGIN_WALLED.test(url.hostname)) {
    throw new NoteError('FORBIDDEN', { 'zh-TW': '這個平台需要登入才看得到內容，無法自動抓取。請把貼文內容複製後用「貼上文字」匯入。', en: 'This platform requires signing in to view content, so it cannot be fetched automatically. Copy the post and import it with "Paste text".' });
  }
  const pmid = pubmedIdOf(url.href);
  if (pmid) {
    const res = await fetchImpl(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(LIMITS.timeoutMs) });
    if (!res.ok) throw new NoteError('BAD_PATH', { 'zh-TW': `PubMed API 失敗：HTTP ${res.status}`, en: `PubMed API failed: HTTP ${res.status}` });
    return parsePubmedXml(await res.text(), pmid, url.href);
  }

  const res = opts.fetchImpl
    ? await toSafe(await fetchImpl(url.href, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(LIMITS.timeoutMs) }))
    : await safeFetch(url.href, { headers: FETCH_HEADERS, allowPrivate: opts.allowPrivate, maxBytes: LIMITS.fetchBytes, timeoutMs: LIMITS.timeoutMs });
  const headlessOn = opts.headless !== false && process.env.IMPORT_HEADLESS !== '0';
  if (!res.ok) {
    // 403 / 5xx is usually a WAF blocking non-browser connections; a real browser often gets through.
    if ((res.status === 403 || res.status >= 500) && headlessOn) {
      const rendered = await renderSpa(url.href, opts.allowPrivate);
      if (rendered) {
        const r2 = htmlToMarkdown(rendered.html, rendered.finalUrl);
        const viaBrowser = await finishHtml(r2, url, rendered.finalUrl, fetched_at, fetchImpl, rawUrl, { html: rendered.html, headlessOn: false, secondPass: true });
        if (viaBrowser) return { ...viaBrowser, warning: viaBrowser.warning ?? '網站擋自動抓取，已改用 headless 瀏覽器擷取。' };
      }
    }
    throw new NoteError('BAD_PATH', { 'zh-TW': `抓取失敗：HTTP ${res.status}${res.status === 403 ? '（網站拒絕自動抓取，請改用貼上文字或上傳 PDF）' : ''}`, en: `Fetch failed: HTTP ${res.status}${res.status === 403 ? ' (the site refuses automated fetching; paste the text or upload a PDF instead)' : ''}` });
  }
  const buf = res.body;
  if (buf.length > LIMITS.fetchBytes) throw new NoteError('BAD_PATH', { 'zh-TW': '網頁超過 5 MB 上限', en: 'Page exceeds the 5 MB limit' });
  const ctype = res.headers.get('content-type') ?? '';
  const arxivId = arxivIdOf(rawUrl) ?? arxivIdOf(res.url || url.href);

  if (ctype.includes('application/pdf') || buf.subarray(0, 5).toString() === '%PDF-') {
    const c: ConvertedWithWarning = await convertPdf(buf, url.pathname.split('/').pop() || 'document.pdf');
    c.meta.source_url = url.href;
    if (arxivId) {
      const ax = await arxivMeta(arxivId, fetchImpl);
      if (ax.title) c.meta = { ...c.meta, source_type: 'paper', title: ax.title, authors: ax.authors, year: ax.year, venue: ax.venue, doi: ax.doi ?? c.meta.doi, citation_key: citationKey({ ...c.meta, ...ax }) };
    }
    return c;
  }

  const html = buf.toString('utf8');
  const r1 = htmlToMarkdown(html, url.href);
  const out = await finishHtml(r1, url, res.url || url.href, fetched_at, fetchImpl, rawUrl, { html, headlessOn, allowPrivate: opts.allowPrivate });
  if (!out) throw new NoteError('BAD_PATH', { 'zh-TW': '抓不到正文。請改用「貼上文字」或上傳 PDF。', en: 'Could not extract the main text. Use "Paste text" or upload a PDF instead.' });
  return out;
}

// Shared pipeline after fetching HTML: site special cases, bibliography enrichment, thin-content detection (re-fetch headless if needed).
async function finishHtml(
  r: ReturnType<typeof htmlToMarkdown>, url: URL, finalUrl: string, fetched_at: string, fetchImpl: Fetcher, rawUrl: string,
  ctx: { html?: string; headlessOn?: boolean; allowPrivate?: boolean; secondPass?: boolean } = {},
): Promise<ConvertedWithWarning | null> {
  const { title, markdown, meta } = r;
  let m: SourceMeta = { source_type: 'web', title, source_url: url.href, fetched_at, ...meta };
  let body = markdown;
  const arxivId = arxivIdOf(rawUrl) ?? arxivIdOf(finalUrl);

  if (YT_RE.test(url.hostname) && ctx.html) {
    // Video pages are just a player; keeping title, channel and description is enough.
    const doc = new JSDOM(ctx.html).window.document;
    const desc = metaOf(doc, ['og:description', 'description'])[0] ?? '';
    const channel = doc.querySelector('link[itemprop="name"]')?.getAttribute('content') ?? metaOf(doc, ['author'])[0];
    m = { ...m, source_type: 'web', title: metaOf(doc, ['og:title'])[0] ?? title, authors: channel ? [channel] : undefined };
    body = [desc, '', `影片連結：${url.href}`].join('\n');
  }
  if (arxivId) {
    const ax = await arxivMeta(arxivId, fetchImpl);
    if (ax.title) { m = { ...m, source_type: 'paper', title: ax.title, authors: ax.authors ?? m.authors, year: ax.year ?? m.year, venue: ax.venue, doi: ax.doi ?? m.doi }; if (ax.summary) body = `## 摘要\n\n${ax.summary}\n\n${body}`; }
  }
  if (m.doi) {
    const cr = await lookupCrossref(m.doi, fetchImpl);
    m = { ...m, ...cr, source_type: 'paper', title: cr.title ?? m.title };
  }
  if (m.source_type === 'paper') m.citation_key ??= citationKey(m);

  // Journal article pages (OJS, MDPI, Frontiers…) often show only the abstract with the full text at citation_pdf_url; append it when fetchable.
  if (r.pdfUrl && body.replace(/\s+/g, '').length < 3000 && !ctx.secondPass) {
    try {
      const pres = await safeFetch(r.pdfUrl, { headers: { ...FETCH_HEADERS, accept: 'application/pdf,*/*;q=0.5' }, allowPrivate: ctx.allowPrivate, maxBytes: 3 * LIMITS.fetchBytes, timeoutMs: LIMITS.timeoutMs });
      const pbuf = pres.ok ? pres.body : null;
      if (pbuf && pbuf.length <= 3 * LIMITS.fetchBytes && pbuf.subarray(0, 5).toString() === '%PDF-') {
        const pdf = await convertPdf(pbuf, 'fulltext.pdf');
        if (pdf.markdown.length > body.length) { body = `${body}\n\n## 全文（取自 PDF）\n\n${pdf.markdown}`; m.source_type = m.doi ? 'paper' : m.source_type; }
      }
    } catch { /* keep only the abstract if the full text cannot be fetched */ }
  }

  const out: ConvertedWithWarning = { meta: m, markdown: body };
  const challenge = isChallengePage(title, body);
  const chars = body.replace(/\s+/g, '').length;
  // Too short, or Readability never recognized an article body (SPA shells often leave only nav text), both count as thin.
  const thin = !YT_RE.test(url.hostname) && (chars < LIMITS.minContentChars || (!r.article && chars < 3000));
  const hasBiblio = !!(m.doi || (m.authors?.length && m.year));

  if ((thin || challenge) && !hasBiblio && ctx.headlessOn) {
    const rendered = await renderSpa(url.href, ctx.allowPrivate);
    if (rendered) {
      const r2 = htmlToMarkdown(rendered.html, rendered.finalUrl);
      const c2 = r2.markdown.replace(/\s+/g, '').length;
      if (c2 >= LIMITS.minContentChars && (r2.article || c2 >= 3000) && !isChallengePage(r2.title, r2.markdown)) {
        const again = await finishHtml(r2, url, rendered.finalUrl, fetched_at, fetchImpl, rawUrl, { html: rendered.html, headlessOn: false, secondPass: true });
        if (again) return { ...again, warning: '此頁由瀏覽器端產生內容，已用 headless 瀏覽器擷取；版面可能與原頁略有差異。' };
      }
    }
  }
  if (challenge || thin) {
    if (!hasBiblio) {
      if (ctx.secondPass) return null; // second attempt from headless; hand back to the caller to decide
      throw new NoteError('BAD_PATH', challenge
        ? { 'zh-TW': '網站有機器人驗證，抓不到正文。請改用「貼上文字」或上傳 PDF。', en: 'The site has a bot check and the main text could not be fetched. Use "Paste text" or upload a PDF instead.' }
        : { 'zh-TW': '抓不到正文（網頁可能需要 JavaScript 才會顯示內容）。請改用「貼上文字」或上傳 PDF。', en: 'Could not extract the main text (the page may need JavaScript to show its content). Use "Paste text" or upload a PDF instead.' });
    }
    out.warning = challenge ? '出版社網站有機器人驗證，只保留書目，正文請另行貼上或上傳 PDF。' : '正文極短，只保留書目與摘要。';
    if (challenge) { out.markdown = `（正文無法自動擷取：${m.source_url}）`; delete out.meta.excerpt; if (CHALLENGE_TITLES.test(out.meta.title)) out.meta.title = m.doi ?? url.href; }
  }
  return out;
}

export async function convertPdf(buf: Buffer, filename: string): Promise<Converted> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  const info = await pdf.getMetadata().catch(() => null) as any;
  const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length >= 8 && l.length <= 160 && !/^(arXiv|doi|https?:)/i.test(l));
  const title = (info?.info?.Title as string | undefined)?.trim() || firstLine || filename.replace(/\.pdf$/i, '');
  const doi = extractDoi(text.slice(0, 5000));
  const meta: SourceMeta = { source_type: doi ? 'paper' : 'pdf', title, filename, fetched_at: new Date().toISOString(), ...(doi ? { doi } : {}) };
  if (info?.info?.Author) meta.authors = String(info.info.Author).split(/;|,\s(?=[A-Z])/).map((s: string) => s.trim()).filter(Boolean);
  return { meta, markdown: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() };
}

export async function convertDocx(buf: Buffer, filename: string): Promise<Converted> {
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const { title, markdown } = htmlToMarkdown(`<html><body>${html}</body></html>`);
  const t = title === '未命名來源' ? filename.replace(/\.docx?$/i, '') : title;
  return { meta: { source_type: 'docx', title: t, filename, fetched_at: new Date().toISOString() }, markdown };
}

// Pasted text / uploaded Markdown: split off any front-matter first (title becomes the title, other fields are kept); a first line that is the title is not repeated in the body; trailing punctuation is stripped from the title.
export function convertText(text: string, opts: { title?: string; filename?: string; markdown?: boolean }): Converted {
  let body = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let extra: Record<string, PropValue> | undefined;
  if (body.startsWith('---\n') && /\n---(\n|$)/.test(body)) {
    const fm = parseFrontMatter(body);
    body = body.replace(/^---\n[\s\S]*?\n---(\n|$)/, '');
    const { title: _t, ...rest } = fm; void _t;
    if (Object.keys(rest).length) extra = rest;
    if (!opts.title && typeof fm.title === 'string' && fm.title.trim()) opts = { ...opts, title: fm.title };
  }
  const lines = body.split('\n');
  const firstIdx = lines.findIndex(l => l.trim());
  const firstLine = firstIdx >= 0 ? lines[firstIdx].replace(/^#+\s*/, '').trim() : undefined;
  const cleanTitle = (s: string) => s.replace(/[\s：:，,。．.！!？?；;、]+$/u, '').trim();
  const title = cleanTitle(opts.title?.trim() || firstLine?.slice(0, 80) || opts.filename?.replace(/\.(md|markdown|txt)$/i, '') || '') || '未命名來源';
  if (firstIdx >= 0 && firstLine && (lines[firstIdx].trim().startsWith('#') || cleanTitle(firstLine) === title)) lines.splice(firstIdx, 1); // first line is the title: renderSource adds the H1 again
  return { meta: { source_type: opts.markdown ? 'markdown' : 'text', title, filename: opts.filename, fetched_at: new Date().toISOString(), extra }, markdown: lines.join('\n').trim() };
}

export async function convertUpload(buf: Buffer, filename: string, mimetype: string): Promise<Converted> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' || mimetype === 'application/pdf') return convertPdf(buf, filename);
  if (ext === 'docx' || mimetype.includes('officedocument.wordprocessingml')) return convertDocx(buf, filename);
  if (ext === 'html' || ext === 'htm' || mimetype.includes('text/html')) {
    const { title, markdown, meta } = htmlToMarkdown(buf.toString('utf8'));
    return { meta: { source_type: 'web', title: title === '未命名來源' ? filename : title, filename, fetched_at: new Date().toISOString(), ...meta }, markdown };
  }
  if (ext === 'md' || ext === 'markdown') return convertText(buf.toString('utf8'), { filename, markdown: true });
  if (ext === 'txt' || mimetype.startsWith('text/')) return convertText(buf.toString('utf8'), { filename });
  throw new NoteError('BAD_PATH', { 'zh-TW': `不支援的檔案類型：${filename}（支援 PDF、Word、HTML、Markdown、純文字）`, en: `Unsupported file type: ${filename} (PDF, Word, HTML, Markdown and plain text are supported)` });
}

/* ── Build Markdown, pick a path, write into raw/ ── */
const yamlStr = (s: string) => JSON.stringify(s);
export function renderSource(c: Converted): string {
  const m = c.meta;
  const lines = ['---', `source_type: ${m.source_type}`, `title: ${yamlStr(m.title)}`];
  if (m.source_url) lines.push(`source_url: ${yamlStr(m.source_url)}`);
  if (m.filename) lines.push(`filename: ${yamlStr(m.filename)}`);
  lines.push(`fetched_at: ${m.fetched_at}`);
  if (m.doi) lines.push(`doi: ${yamlStr(m.doi)}`);
  if (m.authors?.length) lines.push(`authors: [${m.authors.map(yamlStr).join(', ')}]`);
  if (m.year) lines.push(`year: ${m.year}`);
  if (m.venue) lines.push(`venue: ${yamlStr(m.venue)}`);
  if (m.citation_key) lines.push(`citation_key: ${m.citation_key}`);
  const reserved = new Set(['source_type', 'title', 'source_url', 'filename', 'fetched_at', 'doi', 'authors', 'year', 'venue', 'citation_key']);
  for (const [k, v] of Object.entries(m.extra ?? {})) {
    if (reserved.has(k) || !/^[A-Za-z_][\w-]*$/.test(k) || v === null) continue;
    lines.push(Array.isArray(v) ? `${k}: [${v.map(yamlStr).join(', ')}]` : typeof v === 'string' ? `${k}: ${yamlStr(v)}` : `${k}: ${v}`);
  }
  lines.push('---', '', `# ${m.title}`, '');
  if (m.excerpt) lines.push(`> ${m.excerpt}`, '');
  lines.push(c.markdown, '');
  return lines.join('\n');
}

export function slugify(s: string): string {
  const base = s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return base || 'source';
}

async function uniquePath(ws: string, folder: string, slug: string): Promise<string> {
  const { rows } = await pool.query<{ path: string }>(
    `SELECT path FROM notes WHERE workspace_id = $1 AND (path = $2 OR path LIKE $3)`,
    [ws, `${folder}/${slug}.md`, `${folder}/${slug}-%.md`],
  );
  const taken = new Set(rows.map(r => r.path));
  if (!taken.has(`${folder}/${slug}.md`)) return `${folder}/${slug}.md`;
  for (let i = 2; ; i++) if (!taken.has(`${folder}/${slug}-${i}.md`)) return `${folder}/${slug}-${i}.md`;
}

export async function saveSource(ws: string, c: Converted, actor: Actor, folder = 'raw/sources') {
  const f = normalizeFolder(folder);
  if (!f.startsWith('raw')) throw new NoteError('BAD_PATH', { 'zh-TW': '來源只能匯入 raw/ 層', en: 'Sources can only be imported into the raw/ layer' });
  const slug = c.meta.citation_key ?? slugify(c.meta.title);
  const path = await uniquePath(ws, f, slug);
  const body = renderSource(c);
  await assertCanWrite(ws, body);
  const r = await createNote(ws, path, body, actor);
  return { ...r, meta: c.meta };
}
