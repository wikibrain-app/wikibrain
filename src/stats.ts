import { pool } from './db.js';
import { listPendingSources } from './notes.js';

/* ── Knowledge base stats (for the stats page charts): all isolated per workspace ── */
export interface KbStats {
  generated_at: string;
  totals: { notes: number; links: number; pending: number; versions: number; raw: number; wiki: number; schema: number };
  layers: { layer: string; count: number }[];
  sourceTypes: { type: string; count: number }[];
  notesPerDay: { day: string; count: number }[];          // pages created in the last 30 days
  activity: { day: string; count: number; by: Record<string, number> }[]; // versions per day over the last 182 days (by actor kind)
  topInbound: { path: string; title: string; inbound: number }[];
  agentPerDay: { day: string; jobs: number; tokens: number; cost: number | null }[]; // last 30 days
  agentMonth: { jobs: number; tokens: number; cost: number | null };
}

export async function kbStats(ws: string): Promise<KbStats> {
  const [layers, types, perDay, act, top, agent, month, totals, pending] = await Promise.all([
    pool.query<{ layer: string; count: string }>(`SELECT split_part(path, '/', 1) AS layer, count(*) FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL GROUP BY 1`, [ws]),
    pool.query<{ type: string; count: string }>(
      `SELECT coalesce(substring(content_md FROM '(?m)^source_type:\\s*([a-z]+)'), 'untyped') AS type, count(*)
         FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL AND path LIKE 'raw/%' AND basename <> 'README' GROUP BY 1 ORDER BY 2 DESC`, [ws]),
    pool.query<{ day: string; count: string }>(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day, coalesce(n.c, 0) AS count
         FROM generate_series((now() AT TIME ZONE 'UTC')::date - 29, (now() AT TIME ZONE 'UTC')::date, '1 day') d
         LEFT JOIN (SELECT (created_at AT TIME ZONE 'UTC')::date AS dd, count(*) AS c FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL GROUP BY 1) n ON n.dd = d
         ORDER BY d`, [ws]),
    pool.query<{ day: string; kind: string; count: string }>(
      `SELECT to_char((v.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, split_part(v.author, ':', 1) AS kind, count(*)
         FROM note_versions v JOIN notes n ON n.id = v.note_id
        WHERE n.workspace_id = $1 AND v.created_at >= (now() AT TIME ZONE 'UTC')::date - 181
        GROUP BY 1, 2 ORDER BY 1`, [ws]),
    pool.query<{ path: string; title: string; inbound: string }>(
      `SELECT n.path, n.title, count(DISTINCT l.from_note_id) AS inbound
         FROM notes n JOIN links l ON l.to_note_id = n.id JOIN notes f ON f.id = l.from_note_id AND f.deleted_at IS NULL
        WHERE n.workspace_id = $1 AND n.deleted_at IS NULL AND f.id <> n.id
        GROUP BY n.id ORDER BY inbound DESC, n.path LIMIT 10`, [ws]),
    pool.query<{ day: string; jobs: string; tokens: string; cost: string | null }>(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day, coalesce(j.jobs, 0) AS jobs, coalesce(j.tokens, 0) AS tokens, j.cost
         FROM generate_series((now() AT TIME ZONE 'UTC')::date - 29, (now() AT TIME ZONE 'UTC')::date, '1 day') d
         LEFT JOIN (SELECT (created_at AT TIME ZONE 'UTC')::date AS dd, count(*) AS jobs, sum(tokens_in + tokens_out) AS tokens, sum(cost_usd)::float AS cost
                      FROM ingest_jobs WHERE workspace_id = $1 GROUP BY 1) j ON j.dd = d
         ORDER BY d`, [ws]),
    pool.query<{ jobs: string; tokens: string; cost: string | null }>(
      `SELECT count(*) AS jobs, coalesce(sum(tokens_in + tokens_out), 0) AS tokens, sum(cost_usd)::float AS cost
         FROM ingest_jobs WHERE workspace_id = $1 AND to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')`, [ws]),
    pool.query<{ notes: string; links: string; versions: string }>(
      `SELECT (SELECT count(*) FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL) AS notes,
              (SELECT count(*) FROM links l JOIN notes f ON f.id = l.from_note_id WHERE l.workspace_id = $1 AND l.to_note_id IS NOT NULL AND f.deleted_at IS NULL) AS links,
              (SELECT count(*) FROM note_versions v JOIN notes n ON n.id = v.note_id WHERE n.workspace_id = $1) AS versions`, [ws]),
    listPendingSources(ws),
  ]);
  const layerCount = (l: string) => Number(layers.rows.find(r => r.layer === l)?.count ?? 0);
  const actByDay = new Map<string, { count: number; by: Record<string, number> }>();
  for (const r of act.rows) {
    const e = actByDay.get(r.day) ?? { count: 0, by: {} };
    e.count += Number(r.count); e.by[r.kind] = (e.by[r.kind] ?? 0) + Number(r.count);
    actByDay.set(r.day, e);
  }
  const activity: KbStats['activity'] = [];
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  for (let i = 181; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    const e = actByDay.get(day);
    activity.push({ day, count: e?.count ?? 0, by: e?.by ?? {} });
  }
  return {
    generated_at: new Date().toISOString(),
    totals: { notes: Number(totals.rows[0].notes), links: Number(totals.rows[0].links), pending: pending.length, versions: Number(totals.rows[0].versions), raw: layerCount('raw'), wiki: layerCount('wiki'), schema: layerCount('schema') },
    layers: ['raw', 'wiki', 'schema'].map(l => ({ layer: l, count: layerCount(l) })),
    sourceTypes: types.rows.map(r => ({ type: r.type, count: Number(r.count) })),
    notesPerDay: perDay.rows.map(r => ({ day: r.day, count: Number(r.count) })),
    activity,
    topInbound: top.rows.map(r => ({ path: r.path, title: r.title, inbound: Number(r.inbound) })),
    agentPerDay: agent.rows.map(r => ({ day: r.day, jobs: Number(r.jobs), tokens: Number(r.tokens), cost: r.cost === null ? null : Number(r.cost) })),
    agentMonth: { jobs: Number(month.rows[0].jobs), tokens: Number(month.rows[0].tokens), cost: month.rows[0].cost === null ? null : Number(month.rows[0].cost) },
  };
}
