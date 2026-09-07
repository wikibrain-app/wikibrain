import { pool } from './db.js';
import { limitsFor } from './plans.js';

// Version snapshot cleanup (PRD R5 retention policy): delete snapshots past the retention window that are not the page's current version.
// Once Phase 2 adds the plan column this becomes 7 days free / 90 days paid; for now always 90 days.
export const DEFAULT_RETENTION_DAYS = 90;

// Per plan: Free keeps 7 days of old snapshots, Pro (and active trials) 90 days; the current version is never deleted.
export async function purgeOldVersions(): Promise<number> {
  const free = limitsFor('free').retentionDays, pro = limitsFor('pro').retentionDays;
  const { rowCount } = await pool.query(
    `DELETE FROM note_versions v
      USING notes n, workspaces w
      WHERE n.id = v.note_id AND w.id = n.workspace_id
        AND v.version <> n.version
        AND v.created_at < now() - (CASE WHEN w.plan = 'pro' OR (w.trial_ends_at IS NOT NULL AND w.trial_ends_at > now()) THEN $2::int ELSE $1::int END * interval '1 day')`,
    [free, pro],
  );
  return rowCount ?? 0;
}

// Runs daily, plus once at startup. Returns the timer so tests or shutdown can clear it.
export function scheduleVersionPurge(): NodeJS.Timeout {
  const run = () => purgeOldVersions()
    .then(n => { if (n) console.log(`Version cleanup: deleted ${n} old snapshots (7 days free / 90 days pro)`); })
    .catch(err => console.error('Version cleanup failed:', err));
  void run();
  const t = setInterval(run, 24 * 60 * 60 * 1000);
  t.unref();
  return t;
}
