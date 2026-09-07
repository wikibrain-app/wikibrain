import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { NoteError } from './notes.js';

/* ── Baseline safety for outbound connections (SSRF) ──
   1. isPrivateIp: the full set of private / reserved ranges (including CGNAT, NAT64, 6to4, link-local, metadata).
   2. assertPublicHttpUrl: protocol, hostname and DNS resolution must all pass.
   3. safeFetch: follows redirects manually (re-checking every hop), re-validates at connect time via a pinned lookup (against DNS rebinding), caps the response size. */

function v4ToInt(ip: string): number | null {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3], // 224/4 multicast + 240/4 reserved + 255.255.255.255
];
function v4Private(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return true;
  return V4_BLOCKS.some(([base, bits]) => ((n ^ v4ToInt(base)!) >>> (32 - bits)) === 0);
}
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/); // trailing IPv4 as in ::ffff:1.2.3.4
  if (m) { const n = v4ToInt(m[2]); if (n === null) return null; s = `${m[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`; }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [], tail = halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
  const parts = [...head, ...Array(fill).fill('0'), ...tail].map(h => parseInt(h || '0', 16));
  return parts.some(n => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : parts;
}
function v6Private(ip: string): boolean {
  const p = expandV6(ip);
  if (!p) return true;
  const zeroHead = p[0] === 0 && p[1] === 0 && p[2] === 0 && p[3] === 0 && p[4] === 0;
  if (zeroHead && (p[5] === 0xffff || p[5] === 0)) { // ::ffff:a.b.c.d、::a.b.c.d、::1、::
    if (p[5] === 0 && p[6] === 0 && (p[7] === 0 || p[7] === 1)) return true;
    return v4Private(`${p[6] >> 8}.${p[6] & 255}.${p[7] >> 8}.${p[7] & 255}`);
  }
  if (p[0] === 0x64 && p[1] === 0xff9b) return true;          // 64:ff9b::/96 NAT64
  if (p[0] === 0x2002) return v4Private(`${p[1] >> 8}.${p[1] & 255}.${p[2] >> 8}.${p[2] & 255}`); // 6to4
  if ((p[0] & 0xfe00) === 0xfc00) return true;                // fc00::/7 ULA
  if ((p[0] & 0xffc0) === 0xfe80) return true;                // fe80::/10 link-local
  if ((p[0] & 0xffc0) === 0xfec0) return true;                // fec0::/10 site-local
  if (p[0] === 0x2001 && (p[1] === 0xdb8 || p[1] === 0)) return true; // documentation, Teredo
  if ((p[0] & 0xff00) === 0xff00) return true;                // multicast
  return false;
}
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return v4Private(ip);
  if (v === 6) return v6Private(ip);
  return true;
}
export interface GuardOpts { allowPrivate?: boolean }

const BAD_HOST = /(^|\.)(localhost|local|internal|localdomain|home|lan|corp|intranet)$/i;
export async function assertPublicHttpUrl(raw: string, opts: GuardOpts = {}): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new NoteError('BAD_PATH', { 'zh-TW': `網址格式不正確：${raw}`, en: `Invalid URL: ${raw}` }); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new NoteError('BAD_PATH', { 'zh-TW': '只支援 http 與 https 網址', en: 'Only http and https URLs are supported' });
  if (url.username || url.password) throw new NoteError('BAD_PATH', { 'zh-TW': '網址不可含帳號密碼', en: 'URLs must not contain credentials' });
  if (opts.allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || BAD_HOST.test(host)) throw new NoteError('FORBIDDEN', { 'zh-TW': '不允許匯入內部網址', en: 'Importing from internal addresses is not allowed' });
  if (isIP(host)) { if (isPrivateIp(host)) throw new NoteError('FORBIDDEN', { 'zh-TW': '不允許匯入內部網址', en: 'Importing from internal addresses is not allowed' }); return url; }
  const addrs = await dnsLookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new NoteError('BAD_PATH', { 'zh-TW': `無法解析主機：${host}`, en: `Cannot resolve host: ${host}` });
  if (addrs.some(a => isPrivateIp(a.address))) throw new NoteError('FORBIDDEN', { 'zh-TW': '不允許匯入內部網址', en: 'Importing from internal addresses is not allowed' });
  return url;
}

// Re-validate the resolved address at connect time (DNS pinning): undici's connect.lookup sees the address actually being dialed.
type LookupCb = (err: NodeJS.ErrnoException | null, address: { address: string; family: number }[]) => void;
const strictAgent = new Agent({
  connect: {
    lookup: ((hostname: string, options: object, callback: LookupCb) => {
      dnsLookup(hostname, { all: true }).then(addrs => {
        const ok = addrs.filter(a => !isPrivateIp(a.address));
        if (!ok.length) { callback(Object.assign(new Error(`不允許連線到內部位址：${hostname}`), { code: 'EPRIVATE' }), []); return; }
        callback(null, ok.map(a => ({ address: a.address, family: a.family })));
      }).catch(err => callback(err, []));
      void options;
    }) as never,
  },
});
const openAgent = new Agent();

export interface SafeFetchOpts extends GuardOpts { maxBytes?: number; maxRedirects?: number; timeoutMs?: number; headers?: Record<string, string> }
export interface SafeResponse { status: number; ok: boolean; headers: { get(name: string): string | null }; url: string; body: Buffer }

// Follow redirects manually: every hop goes through assertPublicHttpUrl; bytes are counted while reading and the fetch aborts past the limit.
export async function safeFetch(raw: string, opts: SafeFetchOpts = {}): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024, maxRedirects = opts.maxRedirects ?? 5;
  let url = await assertPublicHttpUrl(raw, opts);
  for (let hop = 0; ; hop++) {
    // Use undici's own fetch with its Agent (Node's built-in fetch and the separately installed undici differ in version and cannot be mixed)
    const res = await undiciFetch(url.href, {
      headers: opts.headers, redirect: 'manual', signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      dispatcher: opts.allowPrivate ? openAgent : strictAgent,
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel().catch(() => {});
      if (hop >= maxRedirects) throw new NoteError('BAD_PATH', { 'zh-TW': '轉址次數過多', en: 'Too many redirects' });
      url = await assertPublicHttpUrl(new URL(res.headers.get('location')!, url).href, opts);
      continue;
    }
    const len = Number(res.headers.get('content-length'));
    if (len && len > maxBytes) { await res.body?.cancel().catch(() => {}); throw new NoteError('BAD_PATH', { 'zh-TW': `內容超過 ${Math.round(maxBytes / 1024 / 1024)} MB 上限`, en: `Content exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit` }); }
    const chunks: Uint8Array[] = []; let total = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new NoteError('BAD_PATH', { 'zh-TW': `內容超過 ${Math.round(maxBytes / 1024 / 1024)} MB 上限`, en: `Content exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit` }); }
        chunks.push(value);
      }
    }
    return { status: res.status, ok: res.ok, headers: res.headers, url: url.href, body: Buffer.concat(chunks) };
  }
}
