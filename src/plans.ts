import { pool } from './db.js';
import { NoteError } from './notes.js';
import type { Provider } from './ai/providers.js';

/* ── Plan gating (decision 17) ──
   Pro trial (14 days from sign-up): unlimited agent jobs; the first TRIAL_FREE_RUNS runs work without the user's own key (platform OpenRouter key, cheap model).
   Free: FREE_RUNS agent jobs per month (ingest + chat + lint combined). Pro: unlimited.
   Billing integration (Q1) is Phase 2; for now the plan column is set manually in the database. */

export const FREE_RUNS = Number(process.env.FREE_RUNS_PER_MONTH ?? 20);
// Content limits per plan (PRD §7). Read lazily so tests and operators can override with environment variables.
const num = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
export interface PlanLimits { notes: number; bytes: number; tokens: number | null; retentionDays: number }
export const limitsFor = (plan: 'free' | 'pro'): PlanLimits => plan === 'pro'
  ? { notes: num('PRO_NOTES_LIMIT', 10_000), bytes: num('PRO_STORAGE_BYTES', 1024 ** 3), tokens: null, retentionDays: num('PRO_RETENTION_DAYS', 90) }
  : { notes: num('FREE_NOTES_LIMIT', 200), bytes: num('FREE_STORAGE_BYTES', 20 * 1024 ** 2), tokens: num('FREE_TOKENS_LIMIT', 1), retentionDays: num('FREE_RETENTION_DAYS', 7) };
export const TRIAL_FREE_RUNS = Number(process.env.TRIAL_FREE_RUNS ?? 50);
const platformKey = () => process.env.PLATFORM_OPENROUTER_KEY?.trim() || null;
const platformModel = () => process.env.PLATFORM_TRIAL_MODEL?.trim() || 'google/gemini-2.5-flash-lite';

export interface PlanStatus {
  plan: 'free' | 'pro';
  trial_ends_at: Date | null;
  trial_active: boolean;
  trial_days_left: number;
  trial_runs_used: number;
  trial_runs_free: number;         // total runs allowed on the platform key (0 = platform has no key)
  month: string;
  runs_this_month: number;
  runs_limit: number | null;       // null = unlimited
  can_run: boolean;
  effective: 'free' | 'pro';       // pro while the trial is active or the plan is pro
  notes_used: number; notes_limit: number;
  bytes_used: number; bytes_limit: number;
  tokens_limit: number | null;
  retention_days: number;
}

/* A run that never reached the model — the provider refused the first call — is not an agent run for quota purposes,
   for the same reason runJob() refunds its keyless credit: nothing was spent and nothing was delivered. Counting it
   would let a Free user with a broken key lock themselves out for the month by clicking. */
export async function planStatus(ws: string): Promise<PlanStatus> {
  const { rows } = await pool.query<{ plan: 'free' | 'pro'; trial_ends_at: Date | null; trial_runs_used: number; runs: string; notes: string; bytes: string }>(
    `SELECT w.plan, w.trial_ends_at, w.trial_runs_used,
            (SELECT count(*) FROM ingest_jobs j WHERE j.workspace_id = w.id AND j.created_at >= date_trunc('month', now())
                AND NOT (j.status = 'failed' AND j.tokens_in + j.tokens_out = 0)) AS runs,
            (SELECT count(*) FROM notes n WHERE n.workspace_id = w.id AND n.deleted_at IS NULL) AS notes,
            (SELECT coalesce(sum(octet_length(n.content_md)), 0) FROM notes n WHERE n.workspace_id = w.id AND n.deleted_at IS NULL) AS bytes
       FROM workspaces w WHERE w.id = $1`, [ws]);
  const w = rows[0];
  if (!w) throw new NoteError('NOT_FOUND', { 'zh-TW': '找不到工作區', en: 'Workspace not found' });
  const trialActive = !!w.trial_ends_at && w.trial_ends_at.getTime() > Date.now();
  const unlimited = w.plan === 'pro' || trialActive;
  const effective: 'free' | 'pro' = unlimited ? 'pro' : 'free';
  const lim = limitsFor(effective);
  const runs = Number(w.runs);
  return {
    effective, notes_used: Number(w.notes), notes_limit: lim.notes, bytes_used: Number(w.bytes), bytes_limit: lim.bytes, tokens_limit: lim.tokens, retention_days: lim.retentionDays,
    plan: w.plan, trial_ends_at: w.trial_ends_at, trial_active: trialActive,
    trial_days_left: trialActive ? Math.ceil((w.trial_ends_at!.getTime() - Date.now()) / 86_400_000) : 0,
    trial_runs_used: w.trial_runs_used, trial_runs_free: platformKey() ? TRIAL_FREE_RUNS : 0,
    month: new Date().toISOString().slice(0, 7), runs_this_month: runs, runs_limit: unlimited ? null : FREE_RUNS, can_run: unlimited || runs < FREE_RUNS,
  };
}

// Call before starting an agent job: blocks once the free limit is exceeded
export async function assertCanRun(ws: string): Promise<PlanStatus> {
  const s = await planStatus(ws);
  if (!s.can_run) throw new NoteError('FORBIDDEN', {
    'zh-TW': `免費方案每月 ${FREE_RUNS} 次 agent 工作已用完（${s.month}）。升級 Pro 不限次數，或下個月再繼續。`,
    en: `The free plan's ${FREE_RUNS} agent runs for ${s.month} are used up. Upgrade to Pro for unlimited runs, or continue next month.`,
  });
  return s;
}

const mb = (b: number) => `${Math.round(b / 1024 / 1024)} MB`;
// Called before any write that adds content. New notes count against the note limit; growth counts against storage.
// Reads, deletes, archiving and edits that do not grow a page are always allowed (over-limit workspaces are read-only, never destroyed).
export async function assertCanWrite(ws: string, content: string, path?: string): Promise<void> {
  const s = await planStatus(ws);
  const newBytes = Buffer.byteLength(content, 'utf8');
  let isNew = true, delta = newBytes;
  if (path) {
    const { rows } = await pool.query<{ len: number }>(`SELECT octet_length(content_md) AS len FROM notes WHERE workspace_id = $1 AND path = $2 AND deleted_at IS NULL`, [ws, path]);
    if (rows[0]) { isNew = false; delta = newBytes - Number(rows[0].len); }
  }
  if (isNew && s.notes_used >= s.notes_limit) throw new NoteError('FORBIDDEN', {
    'zh-TW': `已達 ${s.effective === 'pro' ? 'Pro' : 'Free'} 方案的筆記上限（${s.notes_limit} 則），無法新增。可以封存或刪除不需要的頁${s.effective === 'free' ? '，或升級 Pro' : ''}。`,
    en: `The ${s.effective === 'pro' ? 'Pro' : 'Free'} plan's note limit (${s.notes_limit}) is reached; nothing new can be added. Archive or delete pages you no longer need${s.effective === 'free' ? ', or upgrade to Pro' : ''}.`,
  });
  if (delta > 0 && s.bytes_used + delta > s.bytes_limit) throw new NoteError('FORBIDDEN', {
    'zh-TW': `已達 ${s.effective === 'pro' ? 'Pro' : 'Free'} 方案的容量上限（${mb(s.bytes_limit)}），這次寫入會超過。既有內容不受影響${s.effective === 'free' ? '；升級 Pro 可到 1 GB' : ''}。`,
    en: `The ${s.effective === 'pro' ? 'Pro' : 'Free'} plan's storage limit (${mb(s.bytes_limit)}) would be exceeded by this write. Existing content is unaffected${s.effective === 'free' ? '; Pro allows 1 GB' : ''}.`,
  });
}
export async function assertCanCreateToken(ws: string): Promise<void> {
  const s = await planStatus(ws);
  if (s.tokens_limit === null) return;
  const { rows } = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM mcp_tokens WHERE workspace_id = $1 AND kind = 'pat' AND revoked_at IS NULL`, [ws]);
  if (Number(rows[0].n) >= s.tokens_limit) throw new NoteError('FORBIDDEN', {
    'zh-TW': `Free 方案只能有 ${s.tokens_limit} 把有效的 MCP token。撤銷舊的再產生，或升級 Pro。`,
    en: `The Free plan allows ${s.tokens_limit} active MCP token. Revoke the old one first, or upgrade to Pro.`,
  });
}

export interface RunConfig { provider: Provider; model: string; apiKey: string; trial?: boolean }

/* ── The trial's keyless runs ──
   A workspace in its trial gets TRIAL_FREE_RUNS runs on the platform's own key, so someone can see what the product
   does before going to fetch an API key. There are only ten of them, so when one is spent matters:

   - Offering and charging are separate calls. Deciding which key a run will use happens early, but the count only
     moves once the job row exists — otherwise clicking Lint while an ingest is running, or asking to compile when
     nothing is pending, would cost a run for work that never started.
   - A run that finishes without having consumed a single token cost the platform nothing and gave the user nothing
     (an upstream 401 or 429 on the first call), so it is given back. Anything that reached the model is kept: the
     tokens were really spent, and refunding on failure would be an invitation. */

/** Which key a run would use, without charging for it. Null when the user must bring their own. */
export async function trialRunConfig(ws: string): Promise<RunConfig | null> {
  const key = platformKey(); if (!key) return null;
  const s = await planStatus(ws);
  if (!s.trial_active || s.trial_runs_used >= TRIAL_FREE_RUNS) return null;
  return { provider: 'openrouter', model: platformModel(), apiKey: key, trial: true };
}

/** Spend one keyless run. False when they ran out between the offer and here (two clicks at once). */
export async function claimTrialRun(ws: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE workspaces SET trial_runs_used = trial_runs_used + 1 WHERE id = $1 AND trial_runs_used < $2`, [ws, TRIAL_FREE_RUNS]);
  return !!rowCount;
}

/** Give one back, for a run that never reached the model. Never goes below zero. */
export async function refundTrialRun(ws: string): Promise<void> {
  await pool.query(`UPDATE workspaces SET trial_runs_used = greatest(trial_runs_used - 1, 0) WHERE id = $1`, [ws])
    .catch(e => console.error('trial refund failed:', e));
}

export const trialExhausted = new NoteError('FORBIDDEN', {
  'zh-TW': '免 key 的試用次數剛好被用完了，請到設定頁填自己的 API key。',
  en: 'The keyless trial runs just ran out. Add your own API key on the Settings page.',
});

/** Why this run cannot start without the user's own key — the three reasons read very differently to the person. */
export async function noKeyError(ws: string): Promise<NoteError> {
  if (!platformKey()) return new NoteError('FORBIDDEN', { 'zh-TW': '尚未設定 AI 供應商與 API key，請先到設定頁填寫。', en: 'No AI provider or API key configured yet. Please fill them in on the Settings page.' });
  const s = await planStatus(ws).catch(() => null);
  if (s && !s.trial_active) return new NoteError('FORBIDDEN', {
    'zh-TW': '體驗期已結束，之後要用自己的 API key。請到設定頁填寫（一般用戶每月約 1–3 美元）。',
    en: 'Your trial has ended, so runs now use your own API key. Add one on the Settings page (typically US$1–3 a month).',
  });
  return new NoteError('FORBIDDEN', {
    'zh-TW': `免 key 的試用次數已用完（共 ${TRIAL_FREE_RUNS} 次）。請到設定頁填自己的 API key，體驗期的其他功能不受影響。`,
    en: `The ${TRIAL_FREE_RUNS} keyless trial runs are used up. Add your own API key on the Settings page; the rest of the trial is unaffected.`,
  });
}

export async function setPlan(ws: string, plan: 'free' | 'pro'): Promise<void> {
  await pool.query(`UPDATE workspaces SET plan = $2 WHERE id = $1`, [ws, plan]);
}
