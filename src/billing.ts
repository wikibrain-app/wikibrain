import { timingSafeEqual } from 'node:crypto';
import { pool } from './db.js';
import { setPlan } from './plans.js';

/* ── Billing scaffold ──
   Merchant-of-record choice (Q1) is still open, so this module only knows the generic shape: a subscription for a workspace with a
   status. `applySubscriptionEvent` maps the status to workspaces.plan; the webhook route verifies a shared secret header.
   When Q1 is decided, add the provider's signature check and a translator from its event payload to SubscriptionEvent. */

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'paused';
export interface SubscriptionEvent {
  provider: 'paddle' | 'lemonsqueezy' | 'manual';
  workspace_id: string;
  status: SubscriptionStatus;
  plan?: 'pro';
  provider_customer_id?: string;
  provider_subscription_id?: string;
  current_period_end?: string | null;
  raw?: unknown;
}
export interface Subscription { workspace_id: string; provider: string; status: SubscriptionStatus; plan: string; current_period_end: Date | null; provider_subscription_id: string | null; updated_at: Date }

// Statuses that keep the paid plan on; past_due keeps it briefly (grace), canceled/expired/paused drop to free.
const PAID = new Set<SubscriptionStatus>(['active', 'trialing', 'past_due']);

export async function applySubscriptionEvent(ev: SubscriptionEvent): Promise<Subscription> {
  const { rows } = await pool.query<Subscription>(
    `INSERT INTO subscriptions (workspace_id, provider, provider_customer_id, provider_subscription_id, status, plan, current_period_end, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (workspace_id) DO UPDATE SET provider = $2, provider_customer_id = coalesce($3, subscriptions.provider_customer_id),
       provider_subscription_id = coalesce($4, subscriptions.provider_subscription_id), status = $5, plan = $6, current_period_end = $7, raw = $8, updated_at = now()
     RETURNING workspace_id, provider, status, plan, current_period_end, provider_subscription_id, updated_at`,
    [ev.workspace_id, ev.provider, ev.provider_customer_id ?? null, ev.provider_subscription_id ?? null, ev.status, ev.plan ?? 'pro', ev.current_period_end ?? null, ev.raw === undefined ? null : JSON.stringify(ev.raw)]);
  await setPlan(ev.workspace_id, PAID.has(ev.status) ? 'pro' : 'free');
  return rows[0];
}
export async function getSubscription(ws: string): Promise<Subscription | null> {
  const { rows } = await pool.query<Subscription>(`SELECT workspace_id, provider, status, plan, current_period_end, provider_subscription_id, updated_at FROM subscriptions WHERE workspace_id = $1`, [ws]);
  return rows[0] ?? null;
}
export function webhookSecretOk(header: string | undefined): boolean {
  const secret = process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
const STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'expired', 'paused'];
export const isStatus = (v: unknown): v is SubscriptionStatus => typeof v === 'string' && (STATUSES as string[]).includes(v);
