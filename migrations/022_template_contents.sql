-- Keep the text we delivered, not just its hash. With the delivered version as a base, an edited page can be merged
-- with a newer one instead of being left behind: regions only one side changed are taken automatically.
ALTER TABLE template_applied ADD COLUMN IF NOT EXISTS contents JSONB NOT NULL DEFAULT '{}'::jsonb;
