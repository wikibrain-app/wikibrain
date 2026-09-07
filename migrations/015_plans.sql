-- Plans and trial (decision 17): three tiers = 14-day Pro trial -> Free (20 agent jobs/month) -> Pro. Billing integration is Phase 2; this adds the columns and gates.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';            -- free | pro
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;                      -- 14 days from sign-up; NULL = no trial
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS trial_runs_used INTEGER NOT NULL DEFAULT 0;     -- key-free runs made with the platform key (max 5)
UPDATE workspaces SET trial_ends_at = now() + interval '14 days' WHERE trial_ends_at IS NULL;   -- existing workspaces start counting from now
ALTER TABLE workspaces ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');
