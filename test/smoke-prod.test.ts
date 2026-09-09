import { test } from 'node:test';
import assert from 'node:assert/strict';

/* Production smoke test (ops check). Skipped unless SMOKE_URL is set:
     SMOKE_URL=https://example.com npm run smoke:prod
   Optional SMOKE_MCP_TOKEN (a real MCP token) also exercises the MCP transport end to end (initialize → tools/list →
   get_instructions), which is what breaks first when a proxy (e.g. Cloudflare orange cloud) buffers streams.
   Run it after every infrastructure change: DNS, proxy, Railway settings, secrets. */
const URL_ = process.env.SMOKE_URL?.replace(/\/$/, '');
const skip = !URL_;
const get = (path: string, init?: RequestInit) => fetch(URL_ + path, { redirect: 'manual', ...init });

test('healthz: ok, encryption v2, commit present, fast', { skip }, async () => {
  const t0 = Date.now(); const r = await get('/healthz'); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.ok, true); assert.equal(j.encryption, 'v2'); assert.match(String(j.commit), /^[0-9a-f]{7,}$/);
  assert.ok(Date.now() - t0 < 3000, 'healthz slower than 3 s');
});

test('security headers and HTTPS/www redirects', { skip }, async () => {
  const r = await get('/help'); assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-frame-options'), 'DENY'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const host = new URL(URL_!).host;
  const www = await fetch(`https://www.${host}/help?x=1`, { redirect: 'manual' });
  assert.ok([301, 302, 308].includes(www.status), `www should redirect, got ${www.status}`);
  assert.match(www.headers.get('location') ?? '', new RegExp(`^https://${host.replace('.', '\\.')}/help`));
  const http = await fetch(`http://${host}/healthz`, { redirect: 'manual' });
  assert.ok([301, 302, 308].includes(http.status) || http.status === 200, `http should redirect or serve, got ${http.status}`);
});

test('OAuth metadata and MCP 401 challenge point at this origin', { skip }, async () => {
  const as = await (await get('/.well-known/oauth-authorization-server')).json();
  assert.equal(as.issuer.replace(/\/$/, ''), URL_); assert.equal(as.token_endpoint, URL_ + '/token'); assert.ok(as.code_challenge_methods_supported.includes('S256'));
  const pr = await (await get('/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(pr.resource, URL_ + '/mcp');
  const mcp = await get('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
  assert.equal(mcp.status, 401); assert.match(mcp.headers.get('www-authenticate') ?? '', /resource_metadata=/);
});

test('public pages: landing, help (zh/en), legal, robots, sitemap, llms.txt', { skip }, async () => {
  const landing = await get('/'); assert.equal(landing.status, 200); assert.match(await landing.text(), /data-testid="landing"/);
  const zh = await (await get('/help')).text(); assert.match(zh, /lang="zh-Hant-TW"/);
  const en = await (await get('/help', { headers: { 'accept-language': 'en' } })).text(); assert.match(en, /lang="en"/);
  for (const p of ['/privacy', '/terms', '/help/plans']) assert.equal((await get(p)).status, 200, p);
  assert.match(await (await get('/robots.txt')).text(), /Disallow: \/api\//);
  assert.match(await (await get('/sitemap.xml')).text(), new RegExp(`<loc>${URL_}/help</loc>`));
  assert.match(await (await get('/llms.txt')).text(), /^# WikiBrain/);
});

test('billing webhook rejects unsigned posts; API requires login', { skip }, async () => {
  const wh = await get('/api/billing/webhook/paddle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.ok([401, 503].includes(wh.status), `expected 401 (or 503 when not configured), got ${wh.status}`);
  assert.equal((await get('/api/me')).status, 401);
  assert.equal((await get('/api/notes/tree')).status, 401);
});

test('MCP transport end to end with SMOKE_MCP_TOKEN', { skip: skip || !process.env.SMOKE_MCP_TOKEN }, async () => {
  const call = async (body: unknown) => {
    const r = await get('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${process.env.SMOKE_MCP_TOKEN}` }, body: JSON.stringify(body) });
    const text = await r.text();
    const data = text.startsWith('event:') || text.startsWith('data:') ? text.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5))).pop() : JSON.parse(text);
    return { status: r.status, data };
  };
  const init = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } });
  assert.equal(init.status, 200); assert.ok(init.data.result?.serverInfo);
  const tools = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.ok(tools.data.result.tools.some((t: { name: string }) => t.name === 'get_instructions'));
  const t0 = Date.now();
  const ins = await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_instructions', arguments: {} } });
  assert.equal(ins.status, 200); assert.ok(ins.data.result?.content?.length); assert.ok(Date.now() - t0 < 10_000, 'get_instructions slower than 10 s');
});
