import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertUrl, doiFromPii, europePmcMeta, fromIdentifiers, piiOf } from '../src/import.js';

/* Academic databases. Several large publishers answer a non-browser request with 403, and some pages carry the
   bibliography but keep the body behind the paywall. The same works are in open indexes, so a blocked URL should still
   become a usable source page instead of an error. No network here: every upstream is stubbed. */

const EPMC = {
  resultList: { result: [{
    title: 'Clinical features of patients infected with 2019 novel coronavirus in Wuhan, China.',
    authorString: 'Huang C, Wang Y, Li X',
    pubYear: '2020', doi: '10.1016/s0140-6736(20)30183-5',
    journalInfo: { journal: { title: 'Lancet (London, England)' } },
    abstractText: '<h4>Background</h4>A recent cluster of pneumonia cases.<h4>Methods</h4>All patients were laboratory confirmed.',
  }] },
};
const stub = (routes: Record<string, unknown>, blocked: string[] = []): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (blocked.some(b => url.includes(b))) return new Response('go away', { status: 403 });
    for (const [frag, body] of Object.entries(routes)) {
      if (url.includes(frag)) return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

test('Europe PMC: JATS headings in an abstract become readable text, not stripped or left as tags', async () => {
  const m = await europePmcMeta('DOI:"10.1016/s0140-6736(20)30183-5"', stub({ europepmc: EPMC }));
  assert.equal(m.year, 2020);
  assert.equal(m.venue, 'Lancet (London, England)');
  assert.deepEqual(m.authors, ['Huang C', 'Wang Y', 'Li X']);
  assert.ok(!/[<>]/.test(m.abstract ?? ''), '不留任何標籤');
  assert.match(m.abstract ?? '', /\*\*Background\*\*/, 'JATS 的小標題變成可讀的粗體而不是被丟掉');
  assert.match(m.abstract ?? '', /\*\*Methods\*\*/);
  assert.ok(!m.title?.endsWith('.'), '標題結尾的句點去掉');
});

test('ScienceDirect is identified by PII, which Crossref resolves to a DOI', async () => {
  assert.equal(piiOf('https://www.sciencedirect.com/science/article/pii/S0140673620301835'), 'S0140673620301835');
  assert.equal(piiOf('https://www.sciencedirect.com/science/article/abs/pii/S0140673620301835'), 'S0140673620301835');
  assert.equal(piiOf('https://example.com/whatever'), undefined);
  const doi = await doiFromPii('S0140673620301835', stub({ 'alternative-id': { message: { items: [{ DOI: '10.1016/s0140-6736(20)30183-5' }] } } }));
  assert.equal(doi, '10.1016/s0140-6736(20)30183-5');
});

test('a publisher that blocks us still yields a source page built from the open indexes', async () => {
  const url = 'https://www.sciencedirect.com/science/article/pii/S0140673620301835';
  const fetchImpl = stub({
    'alternative-id': { message: { items: [{ DOI: '10.1016/s0140-6736(20)30183-5' }] } },
    'api.crossref.org/works/10.1016': { message: { title: ['Clinical features of patients infected with 2019 novel coronavirus in Wuhan, China'], author: [{ family: 'Huang', given: 'Chaolin' }], issued: { 'date-parts': [[2020]] }, 'container-title': ['The Lancet'] } },
    europepmc: EPMC,
  }, ['sciencedirect.com']);

  const c = await convertUrl(url, { fetchImpl, headless: false, allowPrivate: true });
  assert.equal(c.meta.source_type, 'paper');
  assert.equal(c.meta.doi, '10.1016/s0140-6736(20)30183-5');
  assert.equal(c.meta.year, 2020);
  assert.equal(c.meta.citation_key, 'huang2020clinical', '有書目就給得出 citation key，[@key] 才引用得到');
  assert.match(c.markdown, /Background/, '摘要進了內文');
  assert.match(c.warning ?? '', /擋下自動抓取/, '要誠實說明全文不在裡面');
});

test('without any identifier there is nothing to fall back to, and the error still says what to do', async () => {
  const fetchImpl = stub({}, ['paywalled.example']);
  await assert.rejects(
    convertUrl('https://paywalled.example/article/12345', { fetchImpl, headless: false, allowPrivate: true }),
    /403|貼上文字/, '沒有 DOI、PII 或 PMC id 時照舊回可操作的錯誤');
  assert.equal(await fromIdentifiers('https://paywalled.example/article/12345', fetchImpl), null);
});
