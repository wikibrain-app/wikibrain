import { pool } from './db.js';

export const currentMonth = (d = new Date()) => d.toISOString().slice(0, 7);

// Count once per authenticated MCP request; never blocks the request (failures are only logged). Gating is Phase 2 R6.
export function recordMcpCall(userId: string): void {
  void pool.query(
    `INSERT INTO usage_counters (user_id, month, mcp_calls) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, month) DO UPDATE SET mcp_calls = usage_counters.mcp_calls + 1`,
    [userId, currentMonth()],
  ).catch(err => console.error('Usage counter failed:', err));
}

export async function getUsage(userId: string, workspaceId: string) {
  const month = currentMonth();
  const [calls, notes] = await Promise.all([
    pool.query<{ mcp_calls: number }>(`SELECT mcp_calls FROM usage_counters WHERE user_id = $1 AND month = $2`, [userId, month]),
    pool.query<{ note_count: string; storage_bytes: string }>(
      `SELECT count(*) AS note_count, coalesce(sum(octet_length(content_md)), 0) AS storage_bytes
         FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL`, [workspaceId]),
  ]);
  return {
    month,
    mcp_calls: calls.rows[0]?.mcp_calls ?? 0,
    note_count: Number(notes.rows[0].note_count),
    storage_bytes: Number(notes.rows[0].storage_bytes),
  };
}
