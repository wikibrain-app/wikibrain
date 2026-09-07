import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

// Public surface for crawlers and AI search (SEO / AEO / GEO): robots, sitemap, llms.txt, pre-rendered /help.
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';
before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => { server.close(); await pool.end(); });

test('robots.txt allows the help page and blocks everything behind login; sitemap lists public URLs; llms.txt describes the product', async () => {
  const robots = await (await fetch(base + '/robots.txt')).text();
  assert.match(robots, /Allow: \/help/); assert.match(robots, /Disallow: \/n\//); assert.match(robots, /Disallow: \/api\//); assert.match(robots, /Disallow: \/mcp/); assert.match(robots, new RegExp(`Sitemap: ${config.appUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap.xml`));
  const sm = await fetch(base + '/sitemap.xml'); assert.match(sm.headers.get('content-type') ?? '', /xml/);
  const xml = await sm.text(); assert.match(xml, /<loc>[^<]*\/help<\/loc>/); assert.match(xml, /help\?lang=en/); assert.match(xml, /\/help\/plans/); assert.doesNotMatch(xml, /\/settings/);
  const llms = await (await fetch(base + '/llms.txt')).text();
  assert.match(llms, /^# WikiBrain/); assert.match(llms, /Karpathy/); assert.match(llms, /## Pricing/); assert.match(llms, /gist\.github\.com\/karpathy/);
});

test('pre-rendered /help serves full HTML with metadata (when web/dist exists)', async (t) => {
  const dist = join(process.cwd(), 'web', 'dist');
  if (!existsSync(join(dist, 'help.start.html'))) { t.skip('web/dist/help.html not built'); return; }
  const de = await (await fetch(base + '/help', { headers: { 'accept-language': 'de-DE,de;q=0.9' } })).text(); assert.match(de, /<html lang="en">/, 'non-Chinese browsers get English');
  const zh = await (await fetch(base + '/help')).text();
  assert.match(zh, /<html lang="zh-Hant-TW">/); assert.match(zh, /application\/ld\+json/); assert.match(zh, /hreflang="en"/); assert.match(zh, /data-help-page="start"/); assert.match(zh, /5 分鐘上手/);
  const plans = await (await fetch(base + '/help/plans')).text(); assert.match(plans, /id="plans"/); assert.match(plans, /方案與計價/); assert.match(plans, /"@type":"FAQPage"/);
  const landing = await (await fetch(base + '/')).text(); assert.match(landing, /data-testid="landing"/); assert.match(landing, /AI 替你把來源編成 wiki/);
  const spa = await (await fetch(base + '/', { headers: { cookie: 'better-auth.session_token=x' } })).text(); assert.doesNotMatch(spa, /data-testid="landing"/, 'signed-in visitors get the SPA shell');
  const en = await (await fetch(base + '/help?lang=en')).text();
  assert.match(en, /<html lang="en">/); assert.match(en, /Getting started/);
  const byHeader = await (await fetch(base + '/help', { headers: { 'accept-language': 'en-US,en;q=0.9' } })).text();
  assert.match(byHeader, /<html lang="en">/);
  const zhHeader = await (await fetch(base + '/help', { headers: { 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.5' } })).text();
  assert.match(zhHeader, /<html lang="zh-Hant-TW">/);
});

test('PWA: manifest, service worker, icons and offline page are served (when web/dist exists)', async (t) => {
  const dist = join(process.cwd(), 'web', 'dist');
  if (!existsSync(join(dist, 'manifest.webmanifest'))) { t.skip('web/dist not built'); return; }
  const m = await fetch(base + '/manifest.webmanifest'); assert.equal(m.status, 200); assert.match(m.headers.get('content-type') ?? '', /manifest\+json|application\/json/);
  const manifest = await m.json(); assert.equal(manifest.name, 'WikiBrain'); assert.equal(manifest.display, 'standalone'); assert.ok(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable'));
  for (const i of manifest.icons) assert.equal((await fetch(base + i.src)).status, 200, i.src);
  const sw = await fetch(base + '/sw.js'); assert.equal(sw.status, 200); assert.match(sw.headers.get('content-type') ?? '', /javascript/); assert.match(await sw.text(), /navigate/);
  assert.match(await (await fetch(base + '/offline.html')).text(), /離線/);
  const html = await (await fetch(base + '/help')).text(); assert.match(html, /rel="manifest"/); assert.match(html, /apple-touch-icon/);
});

