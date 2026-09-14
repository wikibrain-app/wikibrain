-- Plan and trial belong to the account, not to a workspace.
--
-- They were put on `workspaces` when a person could only ever have one. Once someone can open a second, keeping them
-- there would mean a second trial period and a second batch of key-free runs per workspace — an unlimited supply of
-- both, for the price of pressing "new workspace". Quotas are a property of who is paying, so they move to the user
-- and every workspace they own reads from there.
--
-- The workspace columns are dropped rather than left in place: a stale copy that some query still reads is worse than
-- a query that fails loudly.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan            TEXT        NOT NULL DEFAULT 'free';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMPTZ;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS trial_runs_used INTEGER     NOT NULL DEFAULT 0;

-- Backfill from the oldest workspace, which today is the only one anybody has.
UPDATE "user" u
   SET plan = w.plan, trial_ends_at = w.trial_ends_at, trial_runs_used = w.trial_runs_used
  FROM (SELECT DISTINCT ON (owner_user_id) owner_user_id, plan, trial_ends_at, trial_runs_used
          FROM workspaces ORDER BY owner_user_id, created_at) w
 WHERE w.owner_user_id = u.id;

ALTER TABLE workspaces DROP COLUMN IF EXISTS plan;
ALTER TABLE workspaces DROP COLUMN IF EXISTS trial_ends_at;
ALTER TABLE workspaces DROP COLUMN IF EXISTS trial_runs_used;

CREATE INDEX IF NOT EXISTS user_trial_idx ON "user" (trial_ends_at);

-- New accounts start their 14 days at sign-up (the workspace column carried this default before).
ALTER TABLE "user" ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');
UPDATE "user" SET trial_ends_at = now() + interval '14 days' WHERE trial_ends_at IS NULL;
