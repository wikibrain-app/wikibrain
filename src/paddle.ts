import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SubscriptionEvent, SubscriptionStatus } from './billing.js';
import { isStatus } from './billing.js';

/* ── Paddle Billing (Q1 decided 2026-09-07: Paddle as merchant of record) ──
   Environment: PADDLE_API_KEY (server), PADDLE_WEBHOOK_SECRET (the notification destination's secret), optional
   PADDLE_ENV (sandbox|production, otherwise inferred from the key prefix), PADDLE_CLIENT_TOKEN (otherwise created via the
   API and cached), PADDLE_PRICE_MONTH / PADDLE_PRICE_YEAR (otherwise the catalog is created on first use), PADDLE_API_BASE
   (tests point it at a fixture server).
   Catalog: one product "WikiBrain Pro" with two prices (USD 6/month, USD 60/year), tagged with custom_data.wikibrain so
   repeated starts find them instead of creating duplicates. Checkout passes custom_data.workspace_id; webhooks map it back. */

export const PRO_MONTH_CENTS = 600, PRO_YEAR_CENTS = 6000;
export const paddleEnabled = () => !!process.env.PADDLE_API_KEY?.trim();
export function paddleEnv(): 'sandbox' | 'production' {
  const e = process.env.PADDLE_ENV;
  if (e === 'sandbox' || e === 'production') return e;
  return /sdbx/.test(process.env.PADDLE_API_KEY ?? '') ? 'sandbox' : 'production';
}
const apiBase = () => (process.env.PADDLE_API_BASE ?? (paddleEnv() === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com')).replace(/\/$/, '');

export class PaddleError extends Error { constructor(public status: number, message: string) { super(message); } }
async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method, headers: { authorization: `Bearer ${process.env.PADDLE_API_KEY}`, 'content-type': 'application/json', 'paddle-version': '1' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({})) as { data?: T; error?: { detail?: string; code?: string } };
  if (!res.ok) throw new PaddleError(res.status, json.error?.detail ?? json.error?.code ?? `Paddle API ${res.status}`);
  return json.data as T;
}

// ── Webhook signature (Paddle-Signature: ts=<unix>;h1=<hex>) ──
export function verifySignature(raw: string | Buffer, header: string | undefined, secret: string, now = Date.now(), maxSkewMs = 5 * 60_000): boolean {
  if (!header || !secret) return false;
  const parts = Object.create(null) as Record<string, string[]>;
  for (const kv of header.split(';')) {
    const i = kv.indexOf('='); if (i < 0) continue;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    (parts[k] ??= []).push(v);
  }
  const ts = Number(parts.ts?.[0]);
  if (!Number.isFinite(ts) || Math.abs(now - ts * 1000) > maxSkewMs) return false;
  const expected = createHmac('sha256', secret).update(`${ts}:`).update(raw).digest();
  return (parts.h1 ?? []).some(h => { const b = Buffer.from(h, 'hex'); return b.length === expected.length && timingSafeEqual(b, expected); });
}

// ── Catalog ──
export interface PriceInfo { id: string; amount: number; currency: string; interval: 'month' | 'year' }
export interface DiscountInfo { id: string; code: string; percent: number; usage_limit: number | null; times_used: number; remaining: number | null; expires_at: string | null }
export interface Catalog { product_id: string; month: PriceInfo; year: PriceInfo; discount: DiscountInfo | null }
interface PProduct { id: string; name: string; status: string; custom_data?: Record<string, unknown> | null }
interface PDiscount { id: string; status: string; code: string | null; amount: string; type: string; usage_limit: number | null; times_used: number; expires_at: string | null; custom_data?: Record<string, unknown> | null }
interface PPrice { id: string; product_id: string; status: string; unit_price: { amount: string; currency_code: string }; billing_cycle?: { interval: string; frequency: number } | null; custom_data?: Record<string, unknown> | null }
let catalogCache: { at: number; value: Catalog } | null = null;
const CATALOG_TTL = 10 * 60_000;
export function resetPaddleCache() { catalogCache = null; tokenCache = null; }

export async function ensureCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL) return catalogCache.value;
  const products = await call<PProduct[]>('GET', '/products?status=active&per_page=200');
  let product = products.find(p => p.custom_data?.wikibrain === 'pro') ?? products.find(p => p.name === 'WikiBrain Pro');
  if (!product) {
    product = await call<PProduct>('POST', '/products', {
      name: 'WikiBrain Pro', tax_category: 'saas', description: 'WikiBrain Pro: unlimited agent runs, 10,000 notes, 1 GB, 90-day version history, unlimited MCP tokens.',
      custom_data: { wikibrain: 'pro' },
    });
  }
  const prices = await call<PPrice[]>('GET', `/prices?product_id=${encodeURIComponent(product.id)}&status=active&per_page=200`);
  const pick = async (tag: 'pro-month' | 'pro-year', envId: string | undefined, interval: 'month' | 'year', cents: number, description: string): Promise<PriceInfo> => {
    let price = (envId && prices.find(p => p.id === envId)) || prices.find(p => p.custom_data?.wikibrain === tag)
      || prices.find(p => p.billing_cycle?.interval === interval && p.billing_cycle.frequency === 1 && p.unit_price.currency_code === 'USD');
    if (!price) {
      price = await call<PPrice>('POST', '/prices', {
        description, product_id: product!.id, unit_price: { amount: String(cents), currency_code: 'USD' },
        billing_cycle: { interval, frequency: 1 }, tax_mode: 'account_setting', quantity: { minimum: 1, maximum: 1 }, custom_data: { wikibrain: tag },
      });
    }
    return { id: price.id, amount: Number(price.unit_price.amount), currency: price.unit_price.currency_code, interval };
  };
  const month = await pick('pro-month', process.env.PADDLE_PRICE_MONTH, 'month', PRO_MONTH_CENTS, 'WikiBrain Pro, monthly');
  const year = await pick('pro-year', process.env.PADDLE_PRICE_YEAR, 'year', PRO_YEAR_CENTS, 'WikiBrain Pro, yearly');
  const value: Catalog = { product_id: product.id, month, year, discount: await ensureEarlyBird([month.id, year.id]) };
  catalogCache = { at: Date.now(), value };
  return value;
}

/* ── Early-bird discount (decision 17: US$4/month for the first 100 subscribers, public deadline, kept on renewal) ──
   A recurring 33.34% discount (6 → 4.00, 60 → 40.00), usage_limit 100, restricted to the two Pro prices, expiring at
   PADDLE_EARLYBIRD_UNTIL (default 2026-12-31). Created once (custom_data.wikibrain=earlybird) and applied automatically
   at checkout while it is active and has uses left. Opt-in with PADDLE_EARLYBIRD=1 (decision 2026-09-08: off by default,
   because a visible "spots left" counter reveals how few paying users there are); when off, a leftover discount is archived. */
export const EARLYBIRD_PERCENT = 33.34, EARLYBIRD_LIMIT = 100;
async function ensureEarlyBird(priceIds: string[]): Promise<DiscountInfo | null> {
  const enabled = process.env.PADDLE_EARLYBIRD === '1';
  const until = process.env.PADDLE_EARLYBIRD_UNTIL ?? '2026-12-31T23:59:59Z';
  const list = await call<PDiscount[]>('GET', '/discounts?status=active&per_page=200').catch(() => [] as PDiscount[]);
  let d = list.find(x => x.custom_data?.wikibrain === 'earlybird');
  if (!enabled) {
    if (d) await call('PATCH', `/discounts/${encodeURIComponent(d.id)}`, { status: 'archived' }).catch(e => console.error('could not archive early-bird discount:', e));
    return null;
  }
  if (!d) {
    d = await call<PDiscount>('POST', '/discounts', {
      description: 'WikiBrain early bird', type: 'percentage', amount: String(EARLYBIRD_PERCENT), code: 'EARLYBIRD', enabled_for_checkout: true,
      recur: true, maximum_recurring_intervals: null, usage_limit: EARLYBIRD_LIMIT, restrict_to: priceIds, expires_at: until, custom_data: { wikibrain: 'earlybird' },
    });
  }
  const remaining = d.usage_limit === null ? null : Math.max(0, d.usage_limit - (d.times_used ?? 0));
  const expired = !!d.expires_at && new Date(d.expires_at).getTime() < Date.now();
  if (d.status !== 'active' || expired || remaining === 0) return null;
  return { id: d.id, code: d.code ?? 'EARLYBIRD', percent: Number(d.amount), usage_limit: d.usage_limit, times_used: d.times_used ?? 0, remaining, expires_at: d.expires_at };
}

// ── Client-side token for Paddle.js (safe to expose) ──
let tokenCache: string | null = null;
export async function clientToken(): Promise<string> {
  const env = process.env.PADDLE_CLIENT_TOKEN?.trim(); if (env) return env;
  if (tokenCache) return tokenCache;
  interface PToken { id: string; name: string; token: string; status: string }
  const list = await call<PToken[]>('GET', '/client-tokens?status=active&per_page=200').catch(() => [] as PToken[]);
  const found = list.find(t => t.name === 'WikiBrain web') ?? list[0];
  const tok = found ?? await call<PToken>('POST', '/client-tokens', { name: 'WikiBrain web', description: 'Created by the WikiBrain server for Paddle.js checkout' });
  tokenCache = tok.token;
  return tokenCache;
}

// ── Customer portal (manage / cancel / update payment method) ──
export interface PortalUrls { overview: string; cancel?: string; update_payment_method?: string }
export async function portalSession(customerId: string, subscriptionId?: string | null): Promise<PortalUrls> {
  interface PSession { urls: { general: { overview: string }; subscriptions?: { id: string; cancel_subscription: string; update_subscription_payment_method: string }[] } }
  const s = await call<PSession>('POST', `/customers/${encodeURIComponent(customerId)}/portal-sessions`, subscriptionId ? { subscription_ids: [subscriptionId] } : {});
  const sub = s.urls.subscriptions?.find(x => x.id === subscriptionId) ?? s.urls.subscriptions?.[0];
  return { overview: s.urls.general.overview, cancel: sub?.cancel_subscription, update_payment_method: sub?.update_subscription_payment_method };
}

// ── Webhook payload → generic subscription event ──
export interface PaddleWebhook { event_id: string; event_type: string; occurred_at: string; data: Record<string, unknown> }
const PADDLE_STATUS: Record<string, SubscriptionStatus> = { active: 'active', trialing: 'trialing', past_due: 'past_due', paused: 'paused', canceled: 'canceled' };
/** Returns null for events we deliberately ignore (transactions, customers, subscriptions without our workspace tag). */
export function translateWebhook(evt: PaddleWebhook): SubscriptionEvent | null {
  if (!evt.event_type.startsWith('subscription.')) return null;
  const d = evt.data;
  const custom = (d.custom_data ?? {}) as Record<string, unknown>;
  const workspace = typeof custom.workspace_id === 'string' ? custom.workspace_id : null;
  if (!workspace) return null;
  const status = PADDLE_STATUS[String(d.status)];
  if (!status || !isStatus(status)) return null;
  const period = d.current_billing_period as { ends_at?: string } | null | undefined;
  const scheduled = d.scheduled_change as { action?: string; effective_at?: string } | null | undefined;
  return {
    provider: 'paddle', workspace_id: workspace, status, plan: 'pro',
    provider_customer_id: typeof d.customer_id === 'string' ? d.customer_id : undefined,
    provider_subscription_id: typeof d.id === 'string' ? d.id : undefined,
    current_period_end: period?.ends_at ?? null,
    event_at: evt.occurred_at,
    raw: { event_id: evt.event_id, event_type: evt.event_type, occurred_at: evt.occurred_at, scheduled_change: scheduled ?? null, status: d.status, items: d.items },
  };
}
