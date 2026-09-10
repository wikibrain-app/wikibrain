import { pool } from './db.js';

/* ── Product events (PRD §8 funnel) ──
   signup            once per user, from the better-auth create hook
   verified          once per workspace, the first time a verified user hits /api/me
   mcp_connected     once per workspace, the first successful MCP / API token or OAuth token use
   first_ai_write    once per workspace, the first note written by an agent or a token client
   upgrade / churn   every plan change (free → pro, pro → free) from the billing webhook
   page_view         one public page view by a signed-out, non-bot visitor (see src/analytics.ts)
   "Once" kinds are enforced by a partial unique index; duplicates are ignored, so callers just fire and forget. */
export type EventKind = 'signup' | 'verified' | 'mcp_connected' | 'first_ai_write' | 'upgrade' | 'churn' | 'email' | 'page_view';
const seen = new Set<string>(); // process-local cache so hot paths (/api/me, token auth) do not hit the DB every time

export function track(kind: EventKind, ids: { userId?: string | null; workspaceId?: string | null }, meta?: Record<string, unknown>): void {
  const key = `${kind}:${ids.workspaceId ?? ids.userId ?? ''}`;
  if (['verified', 'mcp_connected', 'first_ai_write'].includes(kind)) { if (seen.has(key)) return; seen.add(key); }
  pool.query(`INSERT INTO events (kind, user_id, workspace_id, meta) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [kind, ids.userId ?? null, ids.workspaceId ?? null, meta ? JSON.stringify(meta) : null]).catch(e => console.error('event insert failed:', e));
}

export interface Funnel { totals: Record<EventKind, number>; weekly: { week: string; signup: number; verified: number; mcp_connected: number; first_ai_write: number; upgrade: number; churn: number }[] }
export async function funnel(weeks = 8): Promise<Funnel> {
  const kinds: EventKind[] = ['page_view', 'signup', 'verified', 'mcp_connected', 'first_ai_write', 'upgrade', 'churn'];
  const t = await pool.query<{ kind: EventKind; n: string }>(`SELECT kind, count(*) AS n FROM events GROUP BY kind`);
  const totals = Object.fromEntries(kinds.map(k => [k, 0])) as Record<EventKind, number>;
  for (const r of t.rows) if (r.kind in totals) totals[r.kind] = Number(r.n);
  const w = await pool.query<{ week: string; kind: EventKind; n: string }>(
    `SELECT to_char(date_trunc('week', at), 'YYYY-MM-DD') AS week, kind, count(*) AS n FROM events
     WHERE at >= date_trunc('week', now()) - ($1 || ' weeks')::interval GROUP BY 1, 2 ORDER BY 1`, [String(weeks - 1)]);
  const byWeek = new Map<string, Funnel['weekly'][number]>();
  for (const r of w.rows) {
    const row = byWeek.get(r.week) ?? { week: r.week, signup: 0, verified: 0, mcp_connected: 0, first_ai_write: 0, upgrade: 0, churn: 0 };
    if (r.kind in row) (row as unknown as Record<string, number>)[r.kind] = Number(r.n);
    byWeek.set(r.week, row);
  }
  return { totals, weekly: [...byWeek.values()] };
}
