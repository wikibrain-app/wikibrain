import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { zipSync, strToU8 } from 'fflate';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { convertUrl, assertPublicHttpUrl, renderSource, convertText, slugify, extractDoi, stripSiteSuffix, citationKey, rewriteGoogleDocs, arxivIdOf, pubmedIdOf, parsePubmedXml, isChallengePage, htmlToMarkdown } from '../src/import.js';

// Source import (decision 9): text/URL (incl. DOI bibliography)/file -> raw/sources/, SSRF protection, Bearer token also accepted.
const email = `im-${randomBytes(4).toString('hex')}@example.com`;
const password = 'correct-horse-battery';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let fixture: ReturnType<typeof createServer>;
let base = '', fixtureBase = '', cookie = '', token = '';

const PAPER_HTML = `<!doctype html><html><head><title>Ignored</title>
<meta name="citation_title" content="Keyword Assignment in Medical Libraries">
<meta name="citation_author" content="Chen, Amy"><meta name="citation_author" content="Lin, Bo">
<meta name="citation_publication_date" content="2024/03/01"><meta name="citation_journal_title" content="Journal of the Medical Library Association">
<meta name="citation_doi" content="10.5195/jmla.2024.1234"></head>
<body><nav>選單 選單 選單</nav><article><h1>Keyword Assignment in Medical Libraries</h1>
<p>本研究探討關鍵詞指派的一致性，並比較三種方法。這一段夠長，讓 Readability 認得出它是正文，所以再多寫一點文字來充數，確保有足夠的字元數被視為主要內容。</p>
<h2>方法</h2><p>我們收集了 1,200 篇文章，由兩位館員獨立標註，計算 Cohen's kappa。這一段同樣需要足夠長度，以免被當成雜訊而被移除。</p>
<table><tr><th>方法</th><th>kappa</th></tr><tr><td>人工</td><td>0.81</td></tr></table></article><footer>頁尾</footer></body></html>`;

const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = { cookie, origin: config.appUrl }) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};

before(async () => {
  await migrate();
  fixture = createServer((req, res) => {
    if (req.url?.startsWith('/paper')) { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(PAPER_HTML); return; }
    if (req.url?.startsWith('/spa')) { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<html><head><title>SPA 課程</title></head><body><div id="root"></div><script>document.getElementById("root").innerHTML = "<h1>Claude Cowork 簡介</h1><p>" + "這段內容是瀏覽器端用 JavaScript 產生的，伺服器端抓不到。".repeat(12) + "</p>";</script></body></html>'); return; }
    if (req.url?.startsWith('/thin')) { res.setHeader('content-type', 'text/html'); res.end('<html><head><title>App</title></head><body><div id="root"></div><script>/* SPA */</script></body></html>'); return; }
    if (req.url?.startsWith('/challenge')) { res.setHeader('content-type', 'text/html'); res.end('<html><head><title>Just a moment...</title><meta name="citation_doi" content="10.1016/j.test.2020.1"></head><body><p>Enable JavaScript and cookies to continue</p></body></html>'); return; }
    if (req.url?.startsWith('/crossref/')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: { title: ['Keyword Assignment in Medical Libraries'], author: [{ family: 'Chen', given: 'Amy' }, { family: 'Lin', given: 'Bo' }], issued: { 'date-parts': [[2024, 3]] }, 'container-title': ['Journal of the Medical Library Association'] } }));
      return;
    }
    res.statusCode = 404; res.end('nope');
  }).listen(0, '127.0.0.1');
  await new Promise(r => fixture.once('listening', r));
  fixtureBase = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
  process.env.IMPORT_ALLOW_PRIVATE = '1';   // the test fixture runs on localhost
  server = createApp({ ipRatePerMin: 1000 }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password, name: 'im' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  token = (await api('POST', '/api/tokens', { label: 'im' })).data.token;
});
after(async () => {
  server.close(); fixture.close();
  await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
  await pool.end();
});

test('helpers: DOI extraction, slug, front-matter output', () => {
  assert.equal(extractDoi('see https://doi.org/10.1000/abc.123, ok'), '10.1000/abc.123');
  assert.equal(citationKey({ authors: ['Hsiao-Yuan Su', 'Zong-Shian Tsai'], year: 2026, title: 'Under-Reporting of Drug Use' }), 'su2026under');
  assert.equal(citationKey({ authors: ['Chen, Amy'], year: 2024, title: 'Keyword Assignment' }), 'chen2024keyword');
  assert.equal(citationKey({ authors: ['王小明'], year: 2025, title: '知識管理與圖書館' }), '王小明2025知識管理與圖書館');
  assert.equal(slugify('  Keyword Assignment: 醫學圖書館!! '), 'keyword-assignment-醫學圖書館');
  const md = renderSource(convertText('# 會議紀錄\n\n決定改用 Express。', {}));
  assert.match(md, /^---\nsource_type: text\ntitle: "會議紀錄"\n/);
  assert.match(md, /fetched_at: \d{4}-/);
  assert.match(md, /\n# 會議紀錄\n/);
});

test('site helpers: title suffix, Google Docs rewrite, arXiv/PubMed detection, bot-challenge page, heading wrapper div', () => {
  assert.equal(stripSiteSuffix('知識管理 - 維基百科，自由的百科全書'), '知識管理');
  assert.equal(stripSiteSuffix('Knowledge management - Wikipedia'), 'Knowledge management');
  assert.equal(stripSiteSuffix('Things we learned - Simon Willison', 'Simon Willison’s Weblog'), 'Things we learned');
  assert.equal(stripSiteSuffix('A - B - C'), 'A - B - C', 'unchanged without site_name and not an encyclopedia');
  assert.equal(stripSiteSuffix('專訪林孝庭 - 報導者 The Reporter'), '專訪林孝庭');
  assert.equal(stripSiteSuffix('Ten simple rules - part 2'), 'Ten simple rules - part 2');
  assert.equal(stripSiteSuffix('What is a database in Notion? | Notion Help – Notion', 'Notion'), 'What is a database in Notion?');
  assert.equal(stripSiteSuffix('大學法-全國法規資料庫'), '大學法');
  assert.equal(stripSiteSuffix('AI-驅動的知識管理'), 'AI-驅動的知識管理');
  assert.equal(rewriteGoogleDocs('https://docs.google.com/document/d/ABC123/edit?usp=sharing'), 'https://docs.google.com/document/d/ABC123/export?format=html');
  assert.equal(rewriteGoogleDocs('https://example.com/x'), 'https://example.com/x');
  assert.equal(arxivIdOf('https://arxiv.org/abs/2005.11401v4'), '2005.11401v4');
  assert.equal(arxivIdOf('https://arxiv.org/pdf/2005.11401'), '2005.11401');
  assert.equal(arxivIdOf('https://arxiv.org/list/cs.AI/recent'), undefined);
  assert.equal(pubmedIdOf('https://pubmed.ncbi.nlm.nih.gov/31452104/'), '31452104');
  assert.equal(isChallengePage('Just a moment...', ''), true);
  assert.equal(isChallengePage('Client Challenge', ''), true);
  assert.equal(isChallengePage('正常文章', 'enable javascript and cookies to continue'), true);
  assert.equal(isChallengePage('正常文章', '內文'), false);
  const wiki = '<html><head><title>測試 - 維基百科</title></head><body><div id="c"><p>' + '前言內容。'.repeat(40) + '</p><div class="mw-heading mw-heading2"><h2 id="h">歷史<span class="mw-editsection">[編輯]</span></h2></div><p>' + '歷史段落。'.repeat(40) + '</p><div class="mw-heading"><h2>方法</h2></div><p>' + '方法段落。'.repeat(40) + '</p></div></body></html>';
  const out = htmlToMarkdown(wiki, 'https://zh.wikipedia.org/wiki/x');
  assert.equal(out.title, '測試');
  assert.match(out.markdown, /## 歷史/); assert.match(out.markdown, /## 方法/);
  assert.doesNotMatch(out.markdown, /編輯/);
});

test('news page: JSON-LD headline/author/datePublished win over og:title; no citation_key for non-papers', async () => {
  const html = `<html><head><title>標題 | 產經 | 中央社</title><meta property="og:title" content="標題 | 產經"><meta property="og:site_name" content="中央社 CNA">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"輝達收購 Hugging Face","datePublished":"2026-09-04T10:00:00+08:00","author":{"@type":"Organization","name":"中央通訊社"},"publisher":{"@type":"Organization","name":"中央社 CNA"}}</script></head>
    <body><article><p>${'新聞內文段落。'.repeat(60)}</p></article></body></html>`;
  const out = htmlToMarkdown(html, 'https://www.cna.com.tw/news/afe/1.aspx');
  assert.equal(out.title, '輝達收購 Hugging Face');
  const wiki = htmlToMarkdown('<html><head><title>Memex - 維基百科</title><meta property="og:title" content="Memex - 維基百科"><script type="application/ld+json">{"@type":"Article","headline":"' + 'hypothetical proto-hypertext system that was first described by Vannevar Bush in 1945 and more words'.replace(/"/g,'') + '"}</script></head><body><p>' + '內文。'.repeat(80) + '</p></body></html>', 'https://zh.wikipedia.org/wiki/Memex');
  assert.equal(wiki.title, 'Memex', 'overlong JSON-LD headline is not used as title');
  assert.deepEqual(out.meta.authors, ['中央通訊社']); assert.equal(out.meta.year, 2026); assert.equal(out.meta.venue, '中央社 CNA');
  const md = renderSource({ meta: { source_type: 'web', title: out.title, fetched_at: 'x', ...out.meta }, markdown: out.markdown });
  assert.doesNotMatch(md, /citation_key/);
});

test('PubMed efetch XML → bibliography, structured abstract, keywords', () => {
  const xml = `<?xml version="1.0"?><PubmedArticleSet><PubmedArticle><MedlineCitation><Article>
    <Journal><Title>Journal of the Medical Library Association</Title><JournalIssue><PubDate><Year>2019</Year></PubDate></JournalIssue></Journal>
    <ArticleTitle>Keyword indexing consistency.</ArticleTitle>
    <ELocationID EIdType="doi" ValidYN="Y">10.5195/jmla.2019.100</ELocationID>
    <Abstract><AbstractText Label="OBJECTIVE">To measure agreement.</AbstractText><AbstractText Label="RESULTS">Kappa was 0.81.</AbstractText></Abstract>
    <AuthorList><Author><LastName>Chen</LastName><ForeName>Amy</ForeName></Author><Author><CollectiveName>JMLA Group</CollectiveName></Author></AuthorList>
    </Article><KeywordList><Keyword>Indexing</Keyword><Keyword>MeSH</Keyword></KeywordList></MedlineCitation>
    <PubmedData><ArticleIdList><ArticleId IdType="pubmed">31452104</ArticleId><ArticleId IdType="doi">10.5195/jmla.2019.100</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;
  const c = parsePubmedXml(xml, '31452104', 'https://pubmed.ncbi.nlm.nih.gov/31452104/');
  assert.equal(c.meta.source_type, 'paper'); assert.equal(c.meta.title, 'Keyword indexing consistency');
  assert.deepEqual(c.meta.authors, ['Chen, Amy', 'JMLA Group']); assert.equal(c.meta.year, 2019);
  assert.equal(c.meta.doi, '10.5195/jmla.2019.100'); assert.equal(c.meta.citation_key, 'chen2019keyword');
  assert.match(c.markdown, /\*\*OBJECTIVE\*\*：To measure agreement/); assert.match(c.markdown, /Indexing、MeSH/); assert.match(c.markdown, /PMID: 31452104/);
  assert.throws(() => parsePubmedXml('<PubmedArticleSet/>', '1', 'u'), /找不到/);
});

test('SPA: fall back to headless browser when static fetch has no body; social platforms explain login required', async (t) => {
  await assert.rejects(convertUrl('https://www.facebook.com/share/p/1Dqxo2hYpt/'), /需要登入/);
  await assert.rejects(convertUrl('https://x.com/someone/status/1'), /需要登入/);
  const { renderWithBrowser, closeBrowser } = await import('../src/headless.js');
  try { await renderWithBrowser('about:blank', { allowPrivate: true }); }
  catch (e) { await closeBrowser(); t.skip(`no usable headless browser on this machine: ${(e as Error).message.split('\n')[0]}`); return; }
  const c = await convertUrl(`${fixtureBase}/spa`, { allowPrivate: true });
  assert.match(c.markdown, /瀏覽器端用 JavaScript 產生/); assert.equal(c.meta.title, 'SPA 課程'); assert.match(c.markdown, /Claude Cowork 簡介/); assert.match(c.warning!, /headless/);
  // reviewer B2: in strict mode the browser cannot reach private networks through the filtering proxy (origin is 127.0.0.1 -> proxy refuses)
  await assert.rejects(renderWithBrowser(`${fixtureBase}/spa`, { allowPrivate: false, timeoutMs: 8000 }));
  await closeBrowser();
});

test('thin content: empty SPA page (headless off) → 400 suggesting paste; bot challenge with DOI → import bibliography with warning', async () => {
  await assert.rejects(convertUrl(`${fixtureBase}/thin`, { allowPrivate: true, headless: false }), /需要 JavaScript/);
  const fetchImpl = (u: string, init?: RequestInit) => fetch(u.startsWith('https://api.crossref.org/works/') ? `${fixtureBase}/crossref/x` : u, init);
  const c = await convertUrl(`${fixtureBase}/challenge`, { fetchImpl, allowPrivate: true });
  assert.match(c.warning!, /機器人驟證|機器人驗證/); assert.equal(c.meta.source_type, 'paper'); assert.equal(c.meta.doi, '10.1016/j.test.2020.1');
  assert.deepEqual(c.meta.authors, ['Chen, Amy', 'Lin, Bo']); assert.match(c.markdown, /無法自動擷取/);
  process.env.IMPORT_HEADLESS = '0';
  const r = await api('POST', '/api/import', { kind: 'url', url: `${fixtureBase}/thin` });
  delete process.env.IMPORT_HEADLESS;
  assert.equal(r.status, 400); assert.match(r.data.message, /貼上文字/);
});

test('SSRF: non-http, localhost and private IPs are all rejected', async () => {
  for (const u of ['file:///etc/passwd', 'http://localhost/x', 'http://127.0.0.1/x', 'http://10.0.0.5/x', 'http://192.168.1.1/x', 'http://169.254.169.254/latest', 'http://[::1]/x']) {
    await assert.rejects(assertPublicHttpUrl(u), /內部網址|只支援|格式/, u);
  }
  await assert.doesNotReject(assertPublicHttpUrl('http://127.0.0.1/x', { allowPrivate: true }));
});

test('pasted text → raw/sources/, title from first line; duplicate title gets -2', async () => {
  const a = await api('POST', '/api/import', { kind: 'text', text: '訪談筆記\n\n受訪者說……' });
  assert.equal(a.status, 201); assert.equal(a.data.path, 'raw/sources/訪談筆記.md'); assert.equal(a.data.meta.source_type, 'text');
  const b = await api('POST', '/api/import', { kind: 'text', text: '訪談筆記\n\n第二位受訪者' });
  assert.equal(b.data.path, 'raw/sources/訪談筆記-2.md');
  const n = await api('GET', '/api/notes?path=raw/sources/訪談筆記.md');
  assert.match(n.data.content, /^---\nsource_type: text/);
  assert.equal(n.data.author, `web:${email}`);
  assert.equal((await api('POST', '/api/import', { kind: 'text', text: 'x', folder: 'wiki' })).status, 400, 'only raw/ is allowed');
});

test('URL (paper page) → body to Markdown, Crossref fills bibliography, citation_key as filename', async () => {
  // call convertUrl directly with an injected fetch: Crossref goes to the fixture
  const fetchImpl = (u: string, init?: RequestInit) => fetch(u.startsWith('https://api.crossref.org/works/') ? `${fixtureBase}/crossref/${u.split('/works/')[1]}` : u, init);
  const c = await convertUrl(`${fixtureBase}/paper`, { fetchImpl, allowPrivate: true });
  assert.equal(c.meta.source_type, 'paper');
  assert.equal(c.meta.doi, '10.5195/jmla.2024.1234');
  assert.deepEqual(c.meta.authors, ['Chen, Amy', 'Lin, Bo']);
  assert.equal(c.meta.year, 2024);
  assert.match(c.meta.venue!, /Medical Library/);
  assert.equal(c.meta.citation_key, 'chen2024keyword');
  assert.match(c.markdown, /## 方法/);
  assert.match(c.markdown, /\| 方法 \| kappa \|/, 'table should be converted to GFM');
  assert.doesNotMatch(c.markdown, /選單 選單/, 'nav should be stripped by Readability');
  const md = renderSource(c);
  assert.match(md, /doi: "10.5195\/jmla.2024.1234"\nauthors: \["Chen, Amy", "Lin, Bo"\]\nyear: 2024\n/);

  // via the API (if Crossref is unreachable in tests the bibliography enrichment is skipped, but the DOI from the meta tag remains)
  const r = await api('POST', '/api/import', { kind: 'url', url: `${fixtureBase}/paper` });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.meta.doi, '10.5195/jmla.2024.1234');
  assert.match(r.data.path, /^raw\/sources\/chen2024keyword/);
});

test('upload Markdown and minimal docx; unsupported extension → 400; Bearer token can import too', async () => {
  const up = async (name: string, bytes: Uint8Array | string, type: string, headers: Record<string, string> = { cookie, origin: config.appUrl }) => {
    const fd = new FormData();
    fd.append('file', new Blob([bytes as BlobPart], { type }), name);
    const res = await fetch(base + '/api/import/file', { method: 'POST', headers, body: fd });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const md = await up('筆記.md', '# 讀書筆記\n\n重點一。', 'text/markdown');
  assert.equal(md.status, 201, JSON.stringify(md.data)); assert.equal(md.data.meta.source_type, 'markdown'); assert.equal(md.data.title, '讀書筆記');

  const docx = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>投稿須知</w:t></w:r></w:p><w:p><w:r><w:t>稿件請以 Word 檔投遞。</w:t></w:r></w:p></w:body></w:document>'),
  });
  const dx = await up('投稿須知.docx', docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(dx.status, 201, JSON.stringify(dx.data)); assert.equal(dx.data.meta.source_type, 'docx');
  const note = await api('GET', `/api/notes?path=${encodeURIComponent(dx.data.path)}`);
  assert.match(note.data.content, /稿件請以 Word 檔投遞/);

  assert.equal((await up('x.exe', 'MZ', 'application/octet-stream')).status, 400);

  const viaToken = await up('hook.txt', 'Claude Code hook 寫進來的。', 'text/plain', { authorization: `Bearer ${token}` });
  assert.equal(viaToken.status, 201, JSON.stringify(viaToken.data));
  const v = await api('GET', `/api/notes/versions?path=${encodeURIComponent(viaToken.data.path)}`);
  assert.equal(v.data.versions[0].author, 'mcp:im');
  assert.equal((await up('nope.txt', 'x', 'text/plain', { authorization: 'Bearer wb_live_nope' })).status, 401);
});

test('QA fixes: uploaded Markdown front-matter split into title and fields, first line not duplicated, trailing punctuation stripped from title; [[…]] inside code is not a link', async () => {
  const { parseLinks } = await import('../src/notes.js');
  const c = convertText('---\ntitle: 我的讀書筆記\ntags: [qa, test]\n---\n# 我的讀書筆記\n\n第一段。', { filename: 'qa-upload.md', markdown: true });
  assert.equal(c.meta.title, '我的讀書筆記');
  assert.deepEqual(c.meta.extra, { tags: ['qa', 'test'] });
  assert.equal(c.markdown, '第一段。');
  const md = renderSource(c);
  assert.match(md, /^---\nsource_type: markdown\ntitle: "我的讀書筆記"\n/); assert.match(md, /\ntags: \["qa", "test"\]\n/);
  assert.equal((md.match(/我的讀書筆記/g) ?? []).length, 2, 'front-matter title + H1 only; body does not repeat it');
  const t = convertText('2026-09-04 與指導教授討論：\n重點一。', {});
  assert.equal(t.meta.title, '2026-09-04 與指導教授討論'); assert.equal(t.markdown, '重點一。');
  assert.deepEqual(parseLinks('用 `[[raw/sources/<檔名>]]` 連回來源，例如 [[wiki/a]]。\n```\n[[wiki/in-code]]\n```'), ['wiki/a']);
});

test('security review: parseLinks/citations are linear on hostile input; front-matter JSON quoted values round-trip; 1 MB per-page cap', async () => {
  const { parseLinks, parseFrontMatter, MAX_CONTENT_BYTES } = await import('../src/notes.js');
  for (const s of ['[['.repeat(200_000), '[@a '.repeat(200_000), '[[a|'.repeat(100_000)]) {
    const t0 = Date.now(); parseLinks(s); assert.ok(Date.now() - t0 < 500, `parseLinks took ${Date.now() - t0} ms`);
  }
  assert.deepEqual(parseLinks('[[a]] [[b|alias]] [[c#h]] [@k1; @k2, p. 3]'), ['a', 'b', 'c', 'k1', 'k2']);
  const fm = parseFrontMatter('---\ntitle: "He said \\"hi\\", ok"\nauthors: ["Bad, \\"Guy\\"", "Other"]\n---\nbody');
  assert.equal(fm.title, 'He said "hi", ok'); assert.deepEqual(fm.authors, ['Bad, "Guy"', 'Other']);
  assert.equal(MAX_CONTENT_BYTES, 1024 * 1024);
});
