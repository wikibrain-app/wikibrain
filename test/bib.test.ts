import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { parseBibtex, latexToText, splitAuthors, bibEntryToConverted, parseCslJson, toBibtex, toCslJson, listBibSources } from '../src/bib.js';

// Q10 academic item 1: BibTeX/CSL-JSON import (one page per entry, deduped by citation_key) and export.
const BIB = `@comment{Zotero export}
@string{jmla = "Journal of the Medical Library Association"}

@article{chen2024keyword,
  title = {Keyword {Assignment} in Medical Libraries: A {Study}},
  author = {Chen, Amy and Lin, Bo and M{\\"u}ller, Jos{\\'e}},
  journal = jmla,
  year = 2024, volume = {112}, number = {3}, pages = {201--210},
  doi = {https://doi.org/10.5195/jmla.2024.1234},
  abstract = "We study keyword assignment \\& retrieval."
}

@inproceedings{Wang2023LLM,
  title={Large Language Models for Wikis},
  author={Wang, Wei and Karpathy, Andrej},
  booktitle={Proc. of the Wiki Conf},
  year={2023},
  url={https://example.org/wang2023}
}
`;
const CSL = JSON.stringify([{ id: 'smith2020', type: 'article-journal', title: 'A CSL Paper', author: [{ family: 'Smith', given: 'Jane' }], issued: { 'date-parts': [[2020, 5]] }, 'container-title': 'Nature', DOI: '10.1000/xyz', volume: '5', page: '1-9', abstract: 'CSL abstract.' }]);

const email = `bib-${randomBytes(4).toString('hex')}@example.com`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', wsId = '';
const upload = async (name: string, body: string) => {
  const fd = new FormData(); fd.append('file', new Blob([body], { type: 'application/octet-stream' }), name);
  const res = await fetch(base + '/api/import/file', { method: 'POST', headers: { cookie, origin: config.appUrl }, body: fd });
  return { status: res.status, data: await res.json() };
};
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'bib' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  wsId = (await (await fetch(base + '/api/me', { headers: { cookie } })).json()).workspace.id;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('parseBibtex: skips @string/@comment, nested braces, string concatenation, LaTeX accents, author order', () => {
  const es = parseBibtex(BIB);
  assert.deepEqual(es.map(e => [e.type, e.key]), [['article', 'chen2024keyword'], ['inproceedings', 'Wang2023LLM']]);
  assert.equal(es[0].fields.journal, 'Journal of the Medical Library Association'); // @string macro expansion
  assert.equal(latexToText(es[0].fields.title), 'Keyword Assignment in Medical Libraries: A Study');
  assert.deepEqual(splitAuthors(es[0].fields.author), ['Amy Chen', 'Bo Lin', 'José Müller']);
  const c = bibEntryToConverted(es[0]);
  assert.equal(c.meta.doi, '10.5195/jmla.2024.1234'); assert.equal(c.meta.year, 2024); assert.equal(c.meta.citation_key, 'chen2024keyword');
  assert.equal(c.meta.extra?.pages, '201–210'); assert.match(c.markdown, /keyword assignment & retrieval/);
  const w = bibEntryToConverted(es[1]);
  assert.equal(w.meta.venue, 'Proc. of the Wiki Conf'); assert.equal(w.meta.extra?.bibtex_type, 'inproceedings'); assert.equal(w.meta.source_url, 'https://example.org/wang2023');
});

test('parseCslJson: Zotero CSL JSON -> Converted', () => {
  const [c] = parseCslJson(CSL);
  assert.equal(c.meta.title, 'A CSL Paper'); assert.deepEqual(c.meta.authors, ['Jane Smith']); assert.equal(c.meta.year, 2020);
  assert.equal(c.meta.venue, 'Nature'); assert.equal(c.meta.citation_key, 'smith2020csl'); assert.equal(c.meta.extra?.pages, '1-9');
  assert.throws(() => parseCslJson('{"a":1}'), /沒有書目項目/);
});

test('upload .bib -> two pages in raw/sources; re-import skips all with 409; CSL upload adds one more; .bib and CSL exports contain all three', async () => {
  const r1 = await upload('refs.bib', BIB);
  assert.equal(r1.status, 201, JSON.stringify(r1.data));
  assert.deepEqual(r1.data.imported.map((x: { path: string }) => x.path), ['raw/sources/chen2024keyword.md', 'raw/sources/Wang2023LLM.md']);
  assert.deepEqual(r1.data.skipped, []); assert.match(r1.data.ingestPrompt, /chen2024keyword\.md[\s\S]*Wang2023LLM\.md/);
  const note = await (await fetch(base + '/api/notes?path=raw/sources/chen2024keyword.md', { headers: { cookie } })).json();
  assert.match(note.content, /^---\nsource_type: paper\ntitle: "Keyword Assignment in Medical Libraries: A Study"\n/);
  assert.match(note.content, /\nauthors: \["Amy Chen", "Bo Lin", "José Müller"\]\n/); assert.match(note.content, /\ncitation_key: chen2024keyword\n/); assert.match(note.content, /\nbibtex_type: "article"\n/); assert.match(note.content, /\nvolume: "112"\n/);
  const r2 = await upload('refs.bib', BIB);
  assert.equal(r2.status, 409); assert.match(r2.data.message, /2 筆都已經在 raw\//);
  const r3 = await upload('zotero.json', CSL);
  assert.equal(r3.status, 201); assert.equal(r3.data.imported.length, 1);
  const srcs = await listBibSources(wsId);
  assert.equal(srcs.length, 3);
  const bib = await (await fetch(base + '/api/export/bibtex', { headers: { cookie } })).text();
  assert.match(bib, /@article\{chen2024keyword,\n  title = \{Keyword Assignment in Medical Libraries: A Study\},\n  author = \{Amy Chen and Bo Lin and José Müller\},\n  year = \{2024\},\n  journal = \{Journal of the Medical Library Association\}/);
  assert.match(bib, /@inproceedings\{Wang2023LLM,[\s\S]*booktitle = \{Proc\. of the Wiki Conf\}/); assert.match(bib, /@article\{smith2020csl,[\s\S]*doi = \{10\.1000\/xyz\}/);
  assert.match(bib, /pages = \{201–210\}/);
  const csl = JSON.parse(await (await fetch(base + '/api/export/csl', { headers: { cookie } })).text());
  assert.equal(csl.length, 3);
  const chen = csl.find((x: { id: string }) => x.id === 'chen2024keyword');
  assert.deepEqual(chen.author[0], { given: 'Amy', family: 'Chen' }); assert.deepEqual(chen.issued, { 'date-parts': [[2024]] }); assert.equal(chen['container-title'], 'Journal of the Medical Library Association');
  // Plain JSON (not a bibliography) must not be treated as CSL and blow up: respond 400 with an explanation
  const r4 = await upload('data.json', '{"hello": 1}');
  assert.equal(r4.status, 400);
});

test('academic item 2: [@key] in a wiki page counts as a link -> source no longer pending, backlink present, tree returns bib index; unknown key is a dangling link', async () => {
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  let tree = (await api('GET', '/api/notes/tree')).data;
  assert.ok(tree.pendingSources.includes('raw/sources/chen2024keyword.md'), 'imported bibliography starts as pending');
  assert.ok(tree.bib.some((b: { key: string; path: string; year: number }) => b.key === 'chen2024keyword' && b.path === 'raw/sources/chen2024keyword.md' && b.year === 2024));
  await api('POST', '/api/notes', { path: 'wiki/concepts/keyword.md', content: '# 關鍵詞\n\n有實證 [@chen2024keyword; @Wang2023LLM, p. 3]。程式碼裡的 `[@ignored]` 不算。缺的 [@nobody2099]。' });
  tree = (await api('GET', '/api/notes/tree')).data;
  assert.ok(!tree.pendingSources.includes('raw/sources/chen2024keyword.md')); assert.ok(!tree.pendingSources.includes('raw/sources/Wang2023LLM.md'));
  const back = (await api('GET', '/api/notes/backlinks?path=raw/sources/chen2024keyword.md')).data;
  assert.ok(back.backlinks.some((b: { path: string }) => b.path === 'wiki/concepts/keyword.md'));
  const { lintWorkspace } = await import('../src/lint.js');
  const r = await lintWorkspace(wsId);
  assert.ok(r.dangling.some(d => d.from === 'wiki/concepts/keyword.md' && d.target === 'nobody2099')); assert.ok(!r.dangling.some(d => d.target === 'ignored'));
});

test('security review: BibTeX export escaping (braces, backslashes, newlines, key and url sanitizing); non-string CSL fields do not crash', async () => {
  const { toBibtex } = await import('../src/bib.js');
  const evil = toBibtex([{ path: 'raw/sources/x.md', title: 'x', props: { title: 'Title}, note={x}} @preamble{"\\input{/etc/passwd}"} @article{y', citation_key: 'bad key{}', authors: ['A\nB'], year: 2020, source_url: 'https://e.x/a}b c', bibtex_type: 'article}' } }]);
  assert.match(evil, /@preamble\\\{/, 'braces escaped; preamble is literal text'); assert.match(evil, /@misc\{badkey,/); assert.match(evil, /\\\{x\\\}\\\}/); assert.match(evil, /\\textbackslash\{\}input\\\{/); assert.match(evil, /url = \{https:\/\/e\.x\/abc\}/); assert.doesNotMatch(evil, /A\nB/);
  const csl = parseCslJson(JSON.stringify([{ id: 'o1', type: 'article-journal', title: { weird: 1 }, author: [{ family: 'X' }, null], page: { a: 1 }, keyword: ['k'], issued: { 'date-parts': [[2021]] } }]));
  assert.equal(csl[0].meta.title, 'o1'); assert.deepEqual(csl[0].meta.authors, ['X']); assert.equal(csl[0].meta.extra?.pages, undefined);
});
