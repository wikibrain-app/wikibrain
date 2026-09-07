import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { unzipSync, strFromU8 } from 'fflate';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { auth } from '../src/auth-web.js';
import { sniffImageMime, localizeImages, storeAsset } from '../src/assets.js';

// Image attachments (Karpathy tip): upload, type sniffing, downloading external images on import, rewriting links and bundling on export.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const email = `as-${randomBytes(4).toString('hex')}@example.com`;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '', cookie = '', wsId = '';
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: config.appUrl, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null), res };
};
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'as' } });
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  const r = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.appUrl }, body: JSON.stringify({ email, password: 'correct-horse-battery' }) });
  cookie = r.headers.getSetCookie().find(c => c.includes('session_token'))!.split(';')[0];
  wsId = (await api('GET', '/api/me')).data.workspace.id;
});
after(async () => { server.close(); await pool.query('DELETE FROM "user" WHERE email = $1', [email]); await pool.end(); });

test('sniffing: PNG/JPEG/SVG recognized; exe rejected; script stripped from SVG', async () => {
  assert.equal(sniffImageMime(PNG), 'image/png');
  assert.equal(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>')), 'image/svg+xml');
  assert.equal(sniffImageMime(Buffer.from('MZ\u0000\u0000'), 'image/png'), null, 'spoofed mime does not count');
  const svg = await storeAsset(wsId, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>alert(1)</script><rect/></svg>'), 'bad.svg');
  const { rows } = await pool.query('SELECT data FROM assets WHERE id = $1', [svg.id]);
  assert.doesNotMatch(rows[0].data.toString(), /<script|onload/);
});

test('upload -> fetch -> isolation -> delete', async () => {
  const fd = new FormData(); fd.append('file', new Blob([PNG as BlobPart], { type: 'image/png' }), '圖 1.png');
  const up = await fetch(base + '/api/assets', { method: 'POST', headers: { cookie, origin: config.appUrl }, body: fd });
  const upText = await up.text();
  assert.equal(up.status, 201, upText);
  const a = JSON.parse(upText);
  assert.match(a.url, /^\/api\/assets\/[0-9a-f]{24}$/); assert.equal(a.filename, '圖-1.png'); assert.equal(a.mime, 'image/png');
  const get = await fetch(base + a.url, { headers: { cookie } });
  assert.equal(get.status, 200); assert.equal(get.headers.get('content-type'), 'image/png'); assert.equal((await get.arrayBuffer()).byteLength, PNG.length);
  assert.equal((await fetch(base + a.url)).status, 401, 'not viewable without login');
  const bad = new FormData(); bad.append('file', new Blob([Buffer.from('MZ') as BlobPart], { type: 'image/png' }), 'x.png');
  assert.equal((await fetch(base + '/api/assets', { method: 'POST', headers: { cookie, origin: config.appUrl }, body: bad })).status, 400);
  assert.equal((await api('DELETE', a.url)).data.deleted, true);
  assert.equal((await fetch(base + a.url, { headers: { cookie } })).status, 404);
});

test('import downloads external images and rewrites links; export bundles assets under raw/assets and rewrites links', async () => {
  const fx = createServer((req, res) => {
    if (req.url === '/pic.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); return; }
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1'); await new Promise(r => fx.once('listening', r));
  const fb = `http://127.0.0.1:${(fx.address() as AddressInfo).port}`;
  try {
    const { markdown, downloaded } = await localizeImages(wsId, `# 文\n\n![圖](${fb}/pic.png) 與 ![壞](${fb}/nope.png) 與 ![相對](images/x.png)`, { allowPrivate: true });
    assert.equal(downloaded, 1);
    assert.match(markdown, /!\[圖\]\(\/api\/assets\/[0-9a-f]{24}\)/); assert.match(markdown, new RegExp(`!\\[壞\\]\\(${fb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/nope\\.png\\)`)); assert.match(markdown, /!\[相對\]\(images\/x\.png\)/);
    await api('POST', '/api/notes', { path: 'raw/sources/with-image.md', content: markdown });
    const zip = await fetch(base + '/api/export', { headers: { cookie } });
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    const asset = Object.keys(files).find(k => k.startsWith('raw/assets/') && k.endsWith('.png'));
    assert.ok(asset, 'asset must be bundled under raw/assets/');
    assert.match(strFromU8(files['raw/sources/with-image.md']), new RegExp(`!\\[圖\\]\\(${asset!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`), 'exported Markdown link rewritten to a relative path');
  } finally { fx.close(); }
});
