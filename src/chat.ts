import { pool } from './db.js';
import { langLine, type Lang } from './lang.js';
import { TRUST } from './ingest.js';
import { workspaceLang } from './workspaces.js';
import { assertCanRun, noKeyError, trialRunConfig } from './plans.js';
import { NoteError, createNote, type Actor } from './notes.js';
import { slugify } from './import.js';
import { loadKey, running, runJob, type IngestJob } from './ingest.js';
import type { Provider } from './ai/providers.js';

/* ── Chat (Karpathy's Query): ask the knowledge base or have the agent edit it; good answers can be filed as wiki pages ── */

export interface ChatMessage {
  failed?: boolean;
  role: 'user' | 'assistant';
  content: string;
  at: string;
  jobId?: number;
  steps?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number | null;
  tools?: { tool: string; path?: string; query?: string }[];
  filedTo?: string;
}
export interface ChatSession { id: number; workspace_id: string; title: string; messages: ChatMessage[]; created_at: Date; updated_at: Date }

export const chatSystem = (lang: Lang) => lang === 'en' ? `You are the assistant of a WikiBrain knowledge base, working in the Karpathy LLM Wiki pattern.
- Call get_instructions first (it includes the list of pending sources).
- To answer questions (Query): read_note wiki/index.md first to find relevant pages, then search_notes and read_note before answering; cite pages by path (e.g. "see wiki/concepts/xxx.md"). Say plainly when the knowledge base does not cover something; never make things up.
- When the user asks to change or add content, use create_note/update_note following the rules and append an entry to wiki/log.md; report which pages you touched.
- Choose the answer form by the question: Markdown tables for comparisons; \`\`\`mermaid diagrams for flows, relations, timelines; Marp slide pages (front-matter marp: true, --- between slides) when the user asks for a deck. Valuable answers can be filed into wiki/queries/ on request.
- When a source page has a citation_key in its front-matter, cite it in wiki pages as [@citation_key] ([@a; @b] for several, [@a, p. 12] with a locator); the system renders (Author, Year) and builds the reference list.
- ${TRUST.en}
- ${langLine(lang)} Conclusion first, then reasons; be concise.` : `你是 WikiBrain 知識庫的助理，依 Karpathy LLM Wiki 模式工作。
- 先呼叫 get_instructions 讀規則（含待編纂來源清單）。
- 回答問題（Query）：先 read_note wiki/index.md 找相關頁，再 search_notes、read_note 讀完內容後回答；回答要附引用，格式為頁面 path（例如「見 wiki/concepts/xxx.md」）。知識庫裡沒有的事要明說，不要編。
- 用戶要求修改或新增內容時，用 create_note／update_note 依規則動手，並在 wiki/log.md 追加一條；做完回報動到哪些頁。
- 回答形式依問題選：比較用 Markdown 表格；流程、關係、時間軸用 \`\`\`mermaid 圖表；用戶要簡報時寫成 Marp 投影片頁（front-matter 加 marp: true，以 --- 分頁）。有價值的回答可依用戶要求存成 wiki/queries/ 頁。
- 來源頁的 front-matter 有 citation_key 時，在 wiki 頁引用寫 [@citation_key]（多篇 [@a; @b]，頁碼 [@a, p. 12]），系統會渲染成（作者, 年份）並自動長參考文獻。
- ${TRUST['zh-TW']}
- ${langLine(lang)}先結論再理由、簡潔。`;
/** @deprecated use chatSystem(lang) */
export const CHAT_SYSTEM = chatSystem('zh-TW');

export async function listSessions(ws: string, limit = 20): Promise<Omit<ChatSession, 'messages'>[]> {
  const { rows } = await pool.query(`SELECT id, workspace_id, title, created_at, updated_at FROM chat_sessions WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT $2`, [ws, limit]);
  return rows;
}
export async function getSession(ws: string, id: number): Promise<ChatSession | null> {
  const { rows } = await pool.query<ChatSession>(`SELECT * FROM chat_sessions WHERE workspace_id = $1 AND id = $2`, [ws, id]);
  return rows[0] ?? null;
}
export async function createSession(ws: string, userId: string): Promise<ChatSession> {
  const { rows } = await pool.query<ChatSession>(`INSERT INTO chat_sessions (workspace_id, user_id) VALUES ($1, $2) RETURNING *`, [ws, userId]);
  return rows[0];
}
export async function deleteSession(ws: string, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM chat_sessions WHERE workspace_id = $1 AND id = $2`, [ws, id]);
  return (rowCount ?? 0) > 0;
}

// Send a user message: store it in the session, start a chat job running the agent, and append the answer to the session when done.
export async function sendMessage(ws: string, userId: string, sessionId: number, text: string): Promise<{ session: ChatSession; job: IngestJob }> {
  const session = await getSession(ws, sessionId);
  if (!session) throw new NoteError('NOT_FOUND', { 'zh-TW': '找不到對話', en: 'Conversation not found' });
  await assertCanRun(ws);
  const cfg = (await loadKey(userId)) ?? (await trialRunConfig(ws));
  if (!cfg) throw noKeyError(!!process.env.PLATFORM_OPENROUTER_KEY);
  if (running.has(ws)) throw new NoteError('CONFLICT', { 'zh-TW': '這個工作區已有 agent 在執行（編纂或對話），請等它完成。', en: 'An agent (ingest or chat) is already running in this workspace. Please wait for it to finish.' });
  running.add(ws);
  try { return await sendMessageLocked(ws, userId, session, cfg, text); }
  catch (e) { running.delete(ws); throw e; }
}

async function sendMessageLocked(ws: string, userId: string, session: ChatSession, cfg: { provider: Provider; model: string; apiKey: string }, text: string): Promise<{ session: ChatSession; job: IngestJob }> {
  const sessionId = session.id;
  const userMsg: ChatMessage = { role: 'user', content: text.trim(), at: new Date().toISOString() };
  const history = session.messages.map(m => ({ role: m.role, content: m.content }));
  const title = session.messages.length ? session.title : text.trim().slice(0, 40);
  const { rows } = await pool.query<IngestJob>(
    `INSERT INTO ingest_jobs (workspace_id, user_id, paths, provider, model, kind, session_id) VALUES ($1, $2, '{}', $3, $4, 'chat', $5) RETURNING *`,
    [ws, userId, cfg.provider, cfg.model, sessionId],
  );
  const job = rows[0];
  const messages = [...session.messages, { ...userMsg, jobId: job.id }];
  await pool.query(`UPDATE chat_sessions SET messages = $2, title = $3, updated_at = now() WHERE id = $1`, [sessionId, JSON.stringify(messages), title]);
  void runJob(job, ws, cfg, {
    system: chatSystem(await workspaceLang(ws)), user: text.trim(), history, maxSteps: 30,
    actor: { kind: 'agent', name: `${cfg.provider}/${cfg.model}` } satisfies Actor,
    onDone: async ({ finalText, job: done }) => {
      const cur = await getSession(ws, sessionId);
      if (!cur) return;
      const logRow = await pool.query<{ log: any[] }>(`SELECT log FROM ingest_jobs WHERE id = $1`, [job.id]);
      const tools = (logRow.rows[0]?.log ?? []).filter((e: any) => e.type === 'tool').map((e: any) => ({ tool: e.tool, path: e.input?.path, query: e.input?.query }));
      const reply: ChatMessage = { role: 'assistant', content: finalText || '（agent 沒有回覆文字）', at: new Date().toISOString(), jobId: job.id, steps: done.steps, tokens_in: done.tokens_in, tokens_out: done.tokens_out, cost_usd: done.cost_usd, tools };
      await pool.query(`UPDATE chat_sessions SET messages = $2, updated_at = now() WHERE id = $1`, [sessionId, JSON.stringify([...cur.messages, reply])]);
    },
  }).finally(() => running.delete(ws));
  // On failure, append the error to the session too so the user can see it
  void (async () => {
    for (;;) {
      await new Promise(r => setTimeout(r, 1000));
      const j = (await pool.query<IngestJob>(`SELECT status, error FROM ingest_jobs WHERE id = $1`, [job.id])).rows[0];
      if (!j || j.status === 'done') return;
      if (j.status === 'failed') {
        const cur = await getSession(ws, sessionId);
        if (cur && !cur.messages.some(m => m.jobId === job.id && m.role === 'assistant')) {
          await pool.query(`UPDATE chat_sessions SET messages = $2, updated_at = now() WHERE id = $1`, [sessionId, JSON.stringify([...cur.messages, { role: 'assistant', content: (await workspaceLang(ws)) === 'en' ? `(Run failed: ${j.error ?? 'unknown error'})` : `（執行失敗：${j.error ?? '未知錯誤'}）`, at: new Date().toISOString(), jobId: job.id, failed: true } satisfies ChatMessage])]);
        }
        return;
      }
    }
  })();
  return { session: { ...session, messages, title }, job };
}

// File an answer as a wiki page (Karpathy: good answers shouldn't vanish in the chat).
export async function fileAnswer(ws: string, sessionId: number, index: number, actor: Actor, opts: { title?: string } = {}) {
  const session = await getSession(ws, sessionId);
  if (!session) throw new NoteError('NOT_FOUND', { 'zh-TW': '找不到對話', en: 'Conversation not found' });
  const msg = session.messages[index];
  if (!msg || msg.role !== 'assistant') throw new NoteError('BAD_PATH', { 'zh-TW': '只能歸檔 agent 的回答', en: 'Only agent answers can be filed as pages' });
  const question = [...session.messages.slice(0, index)].reverse().find(m => m.role === 'user')?.content ?? session.title;
  const title = (opts.title?.trim() || question).slice(0, 80);
  const base = slugify(title);
  const { rows } = await pool.query<{ path: string }>(`SELECT path FROM notes WHERE workspace_id = $1 AND (path = $2 OR path LIKE $3)`, [ws, `wiki/queries/${base}.md`, `wiki/queries/${base}-%.md`]);
  const taken = new Set(rows.map(r => r.path));
  let path = `wiki/queries/${base}.md`;
  for (let i = 2; taken.has(path); i++) path = `wiki/queries/${base}-${i}.md`;
  const content = `---\nsource_type: query\nasked_at: ${msg.at}\n---\n# ${title}\n\n> 問：${question}\n\n${msg.content}\n`;
  const r = await createNote(ws, path, content, actor);
  const messages = session.messages.map((m, i) => (i === index ? { ...m, filedTo: r.path } : m));
  await pool.query(`UPDATE chat_sessions SET messages = $2 WHERE id = $1`, [sessionId, JSON.stringify(messages)]);
  return r;
}
