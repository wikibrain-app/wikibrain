-- Billing scaffold (decision 6 / Q1 pending): one subscription row per workspace, written by the provider webhook.
-- Provider-specific signature verification is added when Q1 (Paddle vs Lemon Squeezy) is decided; until then the endpoint
-- accepts a shared-secret header (BILLING_WEBHOOK_SECRET) so plan changes can be driven by an operator script.
CREATE TABLE IF NOT EXISTS subscriptions (
  workspace_id             TEXT        PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  provider                 TEXT        NOT NULL,              -- paddle | lemonsqueezy | manual
  provider_customer_id     TEXT,
  provider_subscription_id TEXT,
  status                   TEXT        NOT NULL,              -- active | trialing | past_due | canceled | expired | paused
  plan                     TEXT        NOT NULL DEFAULT 'pro',
  current_period_end       TIMESTAMPTZ,
  raw                      JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
