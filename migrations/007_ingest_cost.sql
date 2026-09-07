-- Auto-ingest cost: computed on completion from reference prices (public OpenRouter price list) and stored for the settings-page stats.
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS price_in  NUMERIC(12,6);   -- USD per million tokens
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS price_out NUMERIC(12,6);
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS cost_usd  NUMERIC(12,6);
