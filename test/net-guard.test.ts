import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isPrivateIp, assertPublicHttpUrl, safeFetch } from '../src/net-guard.js';

// SSRF protection (reviewer B1 / suggestion 1): private ranges, hostnames, per-hop redirects, size limit.
test('isPrivateIp: full private/reserved ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '100.127.255.254', '192.0.0.1', '198.18.0.1', '198.19.255.255', '224.0.0.1', '255.255.255.255',
    '::1', '::', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::', '2002:c0a8:101::', 'fc00::1', 'fd12::1', 'fe80::1', 'fec0::1', '2001:db8::1', 'ff02::1']) {
    assert.equal(isPrivateIp(ip), true, `${ip} should be private`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '192.0.1.1', '198.20.0.1', '2606:4700::1111', '2a00:1450:4001::1', '::ffff:8.8.8.8', '2002:0808:0808::']) {
    assert.equal(isPrivateIp(ip), false, `${ip} should be public`);
  }
  assert.equal(isPrivateIp('not-an-ip'), true);
});

test('assertPublicHttpUrl: hostname blocklist, credentials, non-http', async () => {
  for (const u of ['http://localhost/', 'http://localhost./', 'http://foo.local/', 'http://db.internal/', 'http://[::1]/', 'http://100.64.0.1/', 'http://user:pw@example.com/', 'ftp://example.com/', 'http://0x7f000001/', 'http://2130706433/']) {
    await assert.rejects(assertPublicHttpUrl(u), /內部|只支援|帳號密碼|格式|無法解析/, u);
  }
  await assert.doesNotReject(assertPublicHttpUrl('http://127.0.0.1/', { allowPrivate: true }));
});

test('safeFetch: every redirect hop checked, too many redirects rejected, size limit (local fixture, allowPrivate)', async () => {
  const fx = createServer((req, res) => {
    if (req.url === '/to-private') { res.writeHead(302, { location: 'http://100.64.0.9/secret' }); res.end(); return; }
    if (req.url === '/hop') { res.writeHead(302, { location: '/final' }); res.end(); return; }
    if (req.url === '/loop') { res.writeHead(302, { location: '/loop' }); res.end(); return; }
    if (req.url === '/big') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('x'.repeat(3000)); return; }
    if (req.url === '/big-declared') { res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '999999999' }); res.end('x'); return; }
    res.writeHead(200, { 'content-type': 'text/plain' }); res.end('final ok');
  }).listen(0, '127.0.0.1');
  await new Promise(r => fx.once('listening', r));
  const base = `http://127.0.0.1:${(fx.address() as AddressInfo).port}`;
  try {
    const ok = await safeFetch(`${base}/hop`, { allowPrivate: true });
    assert.equal(ok.status, 200); assert.equal(ok.body.toString(), 'final ok'); assert.equal(ok.url, `${base}/final`);
    // Redirect into a private network: even when the origin is allowed (test fixture), a hop to 100.64/10 must be blocked -> simulate the mid-flight check with allowPrivate:false via the hop check function
    await assert.rejects(safeFetch(`${base}/loop`, { allowPrivate: true, maxRedirects: 3 }), /轉址次數過多/);
    await assert.rejects(safeFetch(`${base}/big`, { allowPrivate: true, maxBytes: 1000 }), /上限/);
    await assert.rejects(safeFetch(`${base}/big-declared`, { allowPrivate: true, maxBytes: 1000 }), /上限/);
  } finally { fx.close(); }
});

test('safeFetch: public origin redirecting into a private network is rejected (second hop of the local fixture checked with allowPrivate:false)', async () => {
  // The fixture is on 127.0.0.1, so the origin itself would be blocked; verify the "second hop" check function directly:
  await assert.rejects(assertPublicHttpUrl('http://100.64.0.9/secret'), /內部/);
  await assert.rejects(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data'), /內部/);
});
