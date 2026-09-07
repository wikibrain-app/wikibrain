import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { zoteroItemToConverted } from '../src/zotero.js';

// Academic item 3: Zotero sync -- the fixture mimics Zotero Web API v3 (/keys, collections, items/top since, children, file).
const KEY = 'AbCdEfGhIjKlMnOpQrStUvWx';
const item = (key: string, version: number, data: Record<string, unknown>) => ({ key, version, data: { key, ...data } });
const LIB = [
  item('AAAA1111', 10, { itemType: 'journalArticle', title: 'Zotero Paper One', creators: [{ creatorType: 'author', firstName: 'Amy', lastName: 'Chen' }, { creatorType: 'author', firstName: 'Bo', lastName: 'Lin' }], date: '2024-03-01', DOI: '10.1000/z1', publicationTitle: 'J. Zotero', abstractNote: 'Abstract one.', volume: '3', extra: 'Citation Key: chen2024zotero', tags: [{ tag: 'wiki' }] }),
  item('BBBB2222', 11, { itemType: 'book', title: 'A Zotero Book', creators: [{ creatorType: 'author', name: '王小明' }], date: '2020', publisher: 'Z Press', ISBN: '978-1' }),
  item('NOTE0001', 12, { itemType: 'note', note: '<p>skip me</p>' }),
];
const LATER = item('CCCC3333', 20, { itemType: 'conferencePaper', title: 'Late Arrival', creators: [{ creatorType: 'author', firstName: 'Cy', lastName: 'Wu' }], date: '2025', proceedingsTitle: 'Proc. Late' });
let libVersion = 12;
let fixture: ReturnType<typeof createServer>; let fixtureBase = '';
const email = `zot-${randomBytes(4).toString('hex')}@example.com`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '';
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};

before(async () => {
  fixture = createServer((req, res) => {
    const u = new URL(req.url!, 'http://x'); const json = (v: unknown, h: Record<string, string> = {}) => { res.writeHead(200, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(v)); };
    if (u.pathname === '/blob.pdf') { if (req.headers['zotero-api-key']) { res.writeHead(500); res.end('key leaked to blob host'); return; } res.writeHead(200, { 'content-type': 'application/pdf' }); res.end(MINI_PDF); return; }
    if (req.headers['zotero-api-key'] !== KEY) { res.writeHead(403); res.end('Forbidden'); return; }
    if (u.pathname === `/keys/${KEY}`) return json({ key: KEY, userID: 4242, username: 'daniel', access: { user: { library: true, files: true } } });
    if (u.pathname === '/users/4242/collections') return json([{ key: 'COLL0001', data: { name: 'Thesis', parentCollection: false }, meta: { numItems: 2 } }, { key: 'COLL0002', data: { name: 'Chapter 1', parentCollection: 'COLL0001' }, meta: { numItems: 1 } }]);
    if (u.pathname === '/users/4242/items/top' || u.pathname === '/users/4242/collections/COLL0001/items/top') {
      const since = Number(u.searchParams.get('since') ?? 0);
      const all = [...LIB, ...(libVersion >= 20 ? [LATER] : [])].filter(i => i.version > since);
      return json(all, { 'Last-Modified-Version': String(libVersion) });
    }
    if (u.pathname === '/users/4242/items/AAAA1111/children') return json([item('ATT00001', 10, { itemType: 'attachment', contentType: 'application/pdf', linkMode: 'imported_file', filename: 'one.pdf', parentItem: 'AAAA1111' })]);
    if (u.pathname.endsWith('/children')) return json([]);
    if (u.pathname === '/users/4242/items/ATT00001/file') { res.writeHead(302, { location: `${fixtureBase}/blob.pdf` }); res.end(); return; }
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1'); await new Promise(r => fixture.once('listening', r));
  fixtureBase = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
  process.env.ZOTERO_API_BASE = fixtureBase;
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'zot' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
});
after(async () => { server.close(); fixture.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

// Minimal parseable PDF (one page, one line of text)
const MINI_PDF = Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 18 Tf 10 50 Td (Hello Zotero PDF) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>`);

test('zoteroItemToConverted: authors, year, DOI, venue, Better BibTeX key, tags, type mapping', () => {
  const c = zoteroItemToConverted(LIB[0] as never);
  assert.equal(c.meta.title, 'Zotero Paper One'); assert.deepEqual(c.meta.authors, ['Amy Chen', 'Bo Lin']); assert.equal(c.meta.year, 2024); assert.equal(c.meta.doi, '10.1000/z1');
  assert.equal(c.meta.venue, 'J. Zotero'); assert.equal(c.meta.citation_key, 'chen2024zotero'); assert.equal(c.meta.extra?.zotero_key, 'AAAA1111'); assert.deepEqual(c.meta.extra?.tags, ['wiki']); assert.equal(c.meta.extra?.bibtex_type, 'article');
  const b = zoteroItemToConverted(LIB[1] as never);
  assert.deepEqual(b.meta.authors, ['王小明']); assert.equal(b.meta.venue, 'Z Press'); assert.equal(b.meta.citation_key, '王小明2020zotero'); assert.equal(b.meta.extra?.bibtex_type, 'book');
});

test('connect: bad key 403; good key returns user and collections (with children); saved link returns only the last 4 chars', async () => {
  assert.equal((await api('POST', '/api/zotero/collections', { apiKey: 'WRONGWRONGWRONGWRONG' })).status, 403);
  const r = await api('POST', '/api/zotero/collections', { apiKey: KEY });
  assert.equal(r.status, 200); assert.equal(r.data.user.username, 'daniel'); assert.equal(r.data.collections.length, 2); assert.equal(r.data.collections.find((c: { key: string }) => c.key === 'COLL0002').parent, 'COLL0001');
  assert.equal((await api('PUT', '/api/zotero', { apiKey: KEY, collectionKey: '../../groups/1' })).status, 400, 'collection key format');
  const s = await api('PUT', '/api/zotero', { apiKey: KEY, collectionKey: 'COLL0001', collectionName: 'Thesis', withPdf: true });
  assert.equal(s.status, 200, JSON.stringify(s.data)); assert.equal(s.data.link.key_last4, 'UvWx'); assert.equal(s.data.link.zotero_user_id, '4242'); assert.equal(s.data.link.collection_name, 'Thesis'); assert.equal(s.data.link.library_version, 0);
  assert.equal(JSON.stringify(s.data.link).includes(KEY), false, 'plaintext key not returned');
});

test('sync: new items create pages (notes skipped, PDF full text appended, zotero_key/citation_key in front-matter) -> resync adds 0 -> new library items fetched incrementally', async () => {
  const r1 = await api('POST', '/api/zotero/sync');
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.deepEqual(r1.data.result.added, ['raw/sources/chen2024zotero.md', 'raw/sources/王小明2020zotero.md']); assert.equal(r1.data.result.pdfs, 1); assert.equal(r1.data.result.version, 12); assert.deepEqual(r1.data.result.errors, []);
  const note = await (await fetch(base + '/api/notes?path=raw/sources/chen2024zotero.md', { headers: { cookie } })).json();
  assert.match(note.content, /\nzotero_key: "AAAA1111"\n/); assert.match(note.content, /\ncitation_key: chen2024zotero\n/); assert.match(note.content, /\ntags: \["wiki"\]\n/); assert.match(note.content, /## 摘要 \/ Abstract\n\nAbstract one\./); assert.match(note.content, /## 全文 \/ Full text（one\.pdf）\n\n[\s\S]*Hello Zotero PDF/);
  assert.equal(r1.data.link.library_version, 12); assert.ok(r1.data.link.last_sync_at);
  const r2 = await api('POST', '/api/zotero/sync');
  assert.deepEqual(r2.data.result.added, []); assert.equal(r2.data.result.skipped, 0, 'nothing after since=12, not even skips');
  libVersion = 20;
  const r3 = await api('POST', '/api/zotero/sync');
  assert.deepEqual(r3.data.result.added, ['raw/sources/wu2025late.md']); assert.equal(r3.data.result.version, 20);
  // they appear in the pending list; the tree bib index has the citation_key
  const tree = (await api('GET', '/api/notes/tree')).data;
  assert.ok(tree.pendingSources.includes('raw/sources/chen2024zotero.md')); assert.ok(tree.bib.some((b: { key: string }) => b.key === 'chen2024zotero'));
  // Disconnect
  assert.equal((await api('DELETE', '/api/zotero')).data.deleted, true); assert.equal((await api('GET', '/api/zotero')).data.link, null);
  assert.equal((await api('POST', '/api/zotero/sync')).status, 404);
});
