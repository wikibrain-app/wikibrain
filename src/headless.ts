import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect as netConnect, type Socket } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Browser } from 'playwright-core';
import { assertPublicHttpUrl, isPrivateIp } from './net-guard.js';

/* ── Headless browser rendering (fallback for SPA pages) ──
   Chromium always goes out through a local "filtering proxy": every request (including each hop after a 302, WebSockets, subresources)
   has its destination host validated at the proxy and connects to a pinned IP, so the browser itself never reaches the internal network.
   One shared browser, closed automatically after 60 s idle, with a bounded pool of concurrent pages (see the scheduler
   below). */

let browser: Browser | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const proxies: Record<'strict' | 'open', { port: number } | null> = { strict: null, open: null };

// Resolve and validate the destination host; return a connectable IP (allowPrivate admits internal networks, for test fixtures)
async function resolveTarget(host: string, allowPrivate: boolean): Promise<string> {
  const h = host.replace(/^\[|\]$/g, '');
  if (!allowPrivate) await assertPublicHttpUrl(`http://${host}/`);
  if (isIP(h)) return h;
  const addrs = await dnsLookup(h, { all: true });
  const ok = allowPrivate ? addrs : addrs.filter(a => !isPrivateIp(a.address));
  if (!ok.length) throw new Error('blocked');
  return ok[0].address;
}

function startProxy(allowPrivate: boolean): Promise<number> {
  return new Promise(resolve => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Plain http request (absolute URL)
      try {
        const url = new URL(req.url ?? '');
        if (url.protocol !== 'http:') { res.writeHead(400); res.end(); return; }
        const ip = await resolveTarget(url.hostname, allowPrivate);
        const up = httpRequest({ host: ip, port: url.port || 80, method: req.method, path: url.pathname + url.search, headers: { ...req.headers, host: url.host } }, upRes => {
          res.writeHead(upRes.statusCode ?? 502, upRes.headers);
          upRes.pipe(res);
        });
        up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
        req.pipe(up);
      } catch { res.writeHead(403); res.end('blocked'); }
    });
    server.on('connect', async (req, socket: Socket, head) => {
      // https／wss：CONNECT host:port
      try {
        const [host, portStr] = (req.url ?? '').split(':');
        const port = Number(portStr || 443);
        if (!host || !port) throw new Error('bad');
        const ip = await resolveTarget(host, allowPrivate);
        const up = netConnect(port, ip, () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head?.length) up.write(head); up.pipe(socket); socket.pipe(up); });
        up.on('error', () => socket.destroy());
        socket.on('error', () => up.destroy());
      } catch { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); }
    });
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
    server.unref();
  });
}

async function proxyFor(allowPrivate: boolean): Promise<string> {
  const key = allowPrivate ? 'open' : 'strict';
  if (!proxies[key]) proxies[key] = { port: await startProxy(allowPrivate) };
  return `http://127.0.0.1:${proxies[key]!.port}`;
}

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ headless: true, timeout: 20_000, proxy: { server: 'per-context' } });
  return browser;
}
function touchIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { browser?.close().catch(() => {}); browser = null; }, 60_000);
  idleTimer.unref();
}

/* ── Scheduler ──
   Rendering is the slowest part of an import (about two seconds a page), so it runs a few pages at a time instead of
   one. Two rules keep one busy workspace from starving everyone else:
     - at most HEADLESS_CONCURRENCY pages across the whole server (memory and CPU bound), and
     - at most HEADLESS_PER_KEY of those for any single workspace, so a bulk import always leaves slots for others.
   Waiting work is picked in arrival order, skipping anyone already at their per-workspace limit, and the queue is
   bounded: beyond HEADLESS_QUEUE_MAX the request is rejected straight away rather than left to time out upstream. */
const MAX_CONCURRENT = Math.max(1, Number(process.env.HEADLESS_CONCURRENCY ?? 3));
const MAX_PER_KEY = Math.max(1, Number(process.env.HEADLESS_PER_KEY ?? 1));
const MAX_QUEUE = Math.max(1, Number(process.env.HEADLESS_QUEUE_MAX ?? 24));

export class RenderBusyError extends Error {
  constructor(public readonly queued: number) { super(`Too many pages are waiting to be rendered (${queued})`); }
}
interface Waiter { key: string; run: () => Promise<unknown>; resolve: (v: never) => void; reject: (e: unknown) => void }
const waiting: Waiter[] = [];
const inFlight = new Map<string, number>();
let running = 0;

export const renderStats = () => ({ running, waiting: waiting.length, maxConcurrent: MAX_CONCURRENT, maxPerKey: MAX_PER_KEY, maxQueue: MAX_QUEUE });

function pump(): void {
  while (running < MAX_CONCURRENT && waiting.length > 0) {
    // Prefer a workspace that is still under its share. If every waiting page belongs to a workspace already at its
    // share, take the oldest anyway: an idle slot helps nobody, and a workspace that arrives later still gets picked
    // first as soon as the next slot frees up.
    const under = waiting.findIndex(w => (inFlight.get(w.key) ?? 0) < MAX_PER_KEY);
    const [w] = waiting.splice(under < 0 ? 0 : under, 1);
    running++; inFlight.set(w.key, (inFlight.get(w.key) ?? 0) + 1);
    void w.run().then(w.resolve as (v: unknown) => void, w.reject).finally(() => {
      running--;
      const n = (inFlight.get(w.key) ?? 1) - 1;
      if (n > 0) inFlight.set(w.key, n); else inFlight.delete(w.key);
      pump();
    });
  }
}
function schedule<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (waiting.length >= MAX_QUEUE) return Promise.reject(new RenderBusyError(waiting.length));
  return new Promise<T>((resolve, reject) => {
    waiting.push({ key, run: run as () => Promise<unknown>, resolve: resolve as (v: never) => void, reject });
    pump();
  });
}

export async function renderWithBrowser(url: string, opts: { timeoutMs?: number; settleMs?: number; allowPrivate?: boolean; key?: string } = {}): Promise<{ html: string; finalUrl: string }> {
  const run = async () => {
    const b = await getBrowser();
    const ctx = await b.newContext({
      proxy: { server: await proxyFor(!!opts.allowPrivate) },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 WikiBrain/0.1',
      locale: 'zh-TW', viewport: { width: 1280, height: 900 }, javaScriptEnabled: true, acceptDownloads: false,
    });
    try {
      await ctx.route('**/*', route => (/^https?:/.test(route.request().url()) ? route.continue() : route.abort()));
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs ?? 20_000 });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(opts.settleMs ?? 1_500);
      const finalUrl = page.url();
      if (!opts.allowPrivate) await assertPublicHttpUrl(finalUrl); // belt and braces
      return { html: await page.content(), finalUrl };
    } finally {
      await ctx.close().catch(() => {});
      touchIdle();
    }
  };
  return schedule(opts.key ?? 'anonymous', run);
}

export async function closeBrowser(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  await browser?.close().catch(() => {});
  browser = null;
}
