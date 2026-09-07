-- Paddle webhooks are delivered at-least-once and unordered: keep the latest event time so an older retry cannot
-- overwrite a newer state (billing.ts applies an event only when event_at is newer or absent).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ;
