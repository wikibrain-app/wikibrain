import { pool } from './db.js';
import type { Lang } from './lang.js';
import { readNote } from './notes.js';
import { listPendingSources } from './notes.js';

/* ── Lint (Karpathy's third operation) ──
   Deterministic checks are done by the system: orphan pages, broken links, pages missing from the index, log format, pending sources.
   Semantic checks (contradictions, stale claims, missing pages) are left to the agent (see startLint in ingest.ts). */

export interface LintReport {
  generated_at: string;
  counts: { wiki_pages: number; links: number };
  orphans: { path: string; title: string }[];                 // wiki pages with no inbound links
  dangling: { from: string; target: string }[];               // [[target]] resolves to no page
  not_in_index: { path: string; title: string }[];            // wiki pages not linked from index.md
  pending_sources: { path: string; title: string }[];         // raw sources not yet compiled into wiki
  log_issues: string[];                                       // log.md format problems
  missing_special: string[];                                  // index.md / log.md missing
}

const SKIP = new Set(['wiki/index.md', 'wiki/log.md']);
// README files describe folders and wiki/lint/ holds lint reports: both are system pages, never orphans and not required in the index.
const isSystem = (p: string) => /\/README\.md$/.test(p) || p.startsWith('wiki/lint/') || p.startsWith('wiki/queries/');

export async function lintWorkspace(ws: string): Promise<LintReport> {
  const [pages, orphans, dangling, indexNote, logNote, pending, linkCount] = await Promise.all([
    pool.query<{ path: string; title: string; id: number }>(`SELECT id, path, title FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL AND path LIKE 'wiki/%' ORDER BY path`, [ws]),
    pool.query<{ path: string; title: string }>(
      `SELECT n.path, n.title FROM notes n
        WHERE n.workspace_id = $1 AND n.deleted_at IS NULL AND n.path LIKE 'wiki/%'
          AND NOT EXISTS (SELECT 1 FROM links l JOIN notes f ON f.id = l.from_note_id WHERE l.to_note_id = n.id AND f.deleted_at IS NULL AND f.id <> n.id)
        ORDER BY n.path`, [ws]),
    pool.query<{ from: string; target: string }>(
      `SELECT DISTINCT f.path AS "from", l.target FROM links l JOIN notes f ON f.id = l.from_note_id
        WHERE l.workspace_id = $1 AND l.to_note_id IS NULL AND f.deleted_at IS NULL ORDER BY f.path, l.target`, [ws]),
    readNote(ws, 'wiki/index.md').catch(() => null),
    readNote(ws, 'wiki/log.md').catch(() => null),
    listPendingSources(ws),
    pool.query<{ n: string }>(`SELECT count(*) AS n FROM links WHERE workspace_id = $1`, [ws]),
  ]);

  const missing_special: string[] = [];
  if (!indexNote) missing_special.push('wiki/index.md');
  if (!logNote) missing_special.push('wiki/log.md');

  // Not in index: which pages the [[links]] in index.md resolve to
  let not_in_index: { path: string; title: string }[] = [];
  if (indexNote) {
    const { rows } = await pool.query<{ to_note_id: number }>(`SELECT to_note_id FROM links WHERE from_note_id = $1 AND to_note_id IS NOT NULL`, [indexNote.id]);
    const linked = new Set(rows.map(r => r.to_note_id));
    not_in_index = pages.rows.filter(p => !SKIP.has(p.path) && !isSystem(p.path) && !linked.has(p.id)).map(p => ({ path: p.path, title: p.title }));
  }

  // Log format: every ## heading should be `## [YYYY-MM-DD] operation | title`
  const log_issues: string[] = [];
  if (logNote) {
    const heads = logNote.content_md.split('\n').filter(l => /^## /.test(l));
    const bad = heads.filter(h => !/^## \[\d{4}-\d{2}-\d{2}\] \S+ \| .+/.test(h));
    if (bad.length) log_issues.push(`有 ${bad.length} 條紀錄不符合「## [YYYY-MM-DD] 操作 | 標題」格式，例如：${bad[0].slice(0, 60)}`);
    if (!heads.length) log_issues.push('log.md 還沒有任何紀錄');
  }

  return {
    generated_at: new Date().toISOString(),
    counts: { wiki_pages: pages.rows.length, links: Number(linkCount.rows[0].n) },
    orphans: orphans.rows.filter(o => !SKIP.has(o.path) && !isSystem(o.path)),
    dangling: dangling.rows,
    not_in_index,
    pending_sources: pending.map(p => ({ path: p.path, title: p.title })),
    log_issues,
    missing_special,
  };
}

export function lintSummary(r: LintReport, lang: Lang = 'zh-TW'): string {
  const en = lang === 'en';
  const parts = [
    r.orphans.length ? `${en ? 'orphans' : '孤兒頁'} ${r.orphans.length}` : '',
    r.dangling.length ? `${en ? 'broken links' : '斷連結'} ${r.dangling.length}` : '',
    r.not_in_index.length ? `${en ? 'not in index' : '未進目錄'} ${r.not_in_index.length}` : '',
    r.pending_sources.length ? `${en ? 'pending sources' : '待編纂來源'} ${r.pending_sources.length}` : '',
    r.log_issues.length ? `${en ? 'log format' : 'log 格式'} ${r.log_issues.length}` : '',
    r.missing_special.length ? `${en ? 'missing special pages' : '缺特殊頁'} ${r.missing_special.length}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(en ? ', ' : '、') : (en ? 'No structural issues found' : '沒有發現結構問題');
}

// Lint prompt for the agent (or to paste into Cursor): includes the deterministic results and asks for a semantic check plus a report page.
export function lintPrompt(r: LintReport, lang: Lang = 'zh-TW', date = new Date().toISOString().slice(0, 10)): string {
  const none = lang === 'en' ? '- (none)' : '- （無）';
  const list = (xs: { path: string }[]) => xs.slice(0, 30).map(x => `- ${x.path}`).join('\n') || none;
  if (lang === 'en') return `Call get_instructions first to read the rules. Then lint (health-check) this knowledge base.
The system has already run structural checks (${lintSummary(r, lang)}):
Orphan pages (no inbound links):
${list(r.orphans)}
Broken links ([[target]] has no page):
${r.dangling.slice(0, 30).map(d => `- ${d.from} → [[${d.target}]]`).join('\n') || none}
Pages missing from wiki/index.md:
${list(r.not_in_index)}
Pending raw sources:
${list(r.pending_sources)}
${r.log_issues.length ? `log.md format issues: ${r.log_issues.join('; ')}\n` : ''}
Now do the semantic checks: read_note wiki/index.md first, then sample related pages and look for (1) contradictions between pages; (2) stale claims superseded by newer sources; (3) concepts mentioned repeatedly without their own page; (4) cross-references worth adding; (5) data gaps that more sources could fill.
Fix what you can directly with update_note (add links, add pages to index.md, repoint broken links); list judgement calls as suggestions.
Finally create the report page wiki/lint/${date}.md with create_note (update_note if it exists) containing: structural results, the fixes you made, and the suggestion list; and append \"## [${date}] lint | health check\" to wiki/log.md. Finish with a short summary.`;
  return `先呼叫 get_instructions 讀規則。請對這座知識庫做 Lint（健檢）。
系統已做完結構檢查（${lintSummary(r)}）：
孤兒頁（沒有任何頁連入）：
${list(r.orphans)}
斷掉的連結（[[目標]] 找不到頁）：
${r.dangling.slice(0, 30).map(d => `- ${d.from} → [[${d.target}]]`).join('\n') || '- （無）'}
未列入 wiki/index.md 的頁：
${list(r.not_in_index)}
待編纂的 raw 來源：
${list(r.pending_sources)}
${r.log_issues.length ? `log.md 格式問題：${r.log_issues.join('；')}\n` : ''}
請你接著做語意檢查：先 read_note wiki/index.md，再抽讀相關頁，找出（1）頁面之間互相矛盾的說法；（2）被新來源推翻卻沒更新的舊說法；（3）被多次提到卻沒有自己頁面的概念；（4）值得補的交叉連結；（5）可以再找來源補的資料缺口。
可以直接修的（補連結、把頁加進 index.md、把斷連結改成正確頁名）就用 update_note 修；需要判斷的列成建議。
最後用 create_note 建立報告頁 wiki/lint/${date}.md（已存在就用 update_note 更新），內容包含：結構檢查結果、你做了哪些修正、建議清單；並在 wiki/log.md 追加「## [${date}] lint | 健檢」。做完回報摘要。`;
}
