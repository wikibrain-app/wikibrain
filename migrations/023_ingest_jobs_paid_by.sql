-- Who paid for a run: the user's own key, or the platform key the trial lends out. Until now the two were
-- indistinguishable, so the operator page's "model cost (paid by users)" quietly included every keyless trial run.
-- Existing rows are classified by the one thing that identifies a trial run today — the platform's trial model on
-- OpenRouter — which is a heuristic for history only; new rows are stamped at insert.
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS paid_by TEXT NOT NULL DEFAULT 'user';
UPDATE ingest_jobs SET paid_by = 'platform'
 WHERE paid_by = 'user' AND provider = 'openrouter' AND model IN ('google/gemini-2.5-flash-lite', 'google/gemini-flash-latest');
CREATE INDEX IF NOT EXISTS ingest_jobs_paid_by_created ON ingest_jobs (paid_by, created_at DESC);
