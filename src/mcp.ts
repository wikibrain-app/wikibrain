import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { AuthContext } from './auth.js';
import type { Lang } from './lang.js';
import { assertCanWrite } from './plans.js';
import { ConflictError, NoteError, createNote, getInstructions, listFolder, readNote, searchNotes, updateNote } from './notes.js';

const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const fail = (v: unknown) => ({ ...(typeof v === 'string' ? text(v) : json(v)), isError: true });

function handleError(e: unknown, lang: Lang) {
  if (e instanceof ConflictError) {
    return fail({ error: 'CONFLICT', status: 409, message: e.localized(lang), current: e.current });
  }
  if (e instanceof NoteError) return fail({ error: e.code, message: e.localized(lang) });
  throw e;
}

// One McpServer per request (stateless mode); auth determines the workspace and every tool operates within it.
export function createMcpServer(auth: AuthContext): McpServer {
  const server = new McpServer({ name: 'wikibrain', version: '0.1.0' });
  const ws = auth.workspaceId;
  const lang = auth.lang;
  const needWrite = () => { if (!auth.scopes.includes('notes:write')) throw new NoteError('FORBIDDEN', { 'zh-TW': '這個連線只被授權讀取（notes:read），不能建立或更新筆記', en: 'This connection was granted read-only access (notes:read) and cannot create or update notes' }); };
  const actor = { kind: 'mcp' as const, name: auth.label };

  server.registerTool(
    'get_instructions',
    {
      title: '讀取編纂規則',
      description: '回傳 schema/ 層的 AI 編纂指令全文（等同知識庫的 CLAUDE.md）。動筆前先呼叫本工具。',
      inputSchema: {},
    },
    async () => text(await getInstructions(ws, lang)),
  );

  server.registerTool(
    'search_notes',
    {
      title: '搜尋筆記',
      description: '以關鍵字搜尋標題與內文，可限定資料夾或標籤。回傳 path、title、version 與片段。',
      inputSchema: {
        query: z.string().min(1).describe('搜尋關鍵字（子字串比對）'),
        folder: z.string().optional().describe('限定資料夾，例如 wiki 或 raw/papers'),
        tag: z.string().optional().describe('限定 front-matter 標籤'),
        limit: z.number().int().min(1).max(50).default(10).describe('最多回傳幾筆'),
      },
    },
    async ({ query, folder, tag, limit }) => {
      try {
        const hits = await searchNotes(ws, { query, folder, tag, limit });
        return json({ query, count: hits.length, hits });
      } catch (e) { return handleError(e, lang); }
    },
  );

  server.registerTool(
    'read_note',
    {
      title: '讀取筆記',
      description: '依 path 讀取一則筆記的完整 Markdown 與 version（update_note 時作為 if_version）。',
      inputSchema: { path: z.string().describe('筆記路徑，例如 wiki/llm-wiki-pattern.md') },
    },
    async ({ path }) => {
      try {
        const n = await readNote(ws, path);
        return json({ path: n.path, title: n.title, version: n.version, updated_at: n.updated_at, content: n.content_md });
      } catch (e) { return handleError(e, lang); }
    },
  );

  server.registerTool(
    'create_note',
    {
      title: '建立筆記',
      description: '在指定 path 建立新筆記。path 須以 raw/、wiki/ 或 schema/ 開頭並以 .md 結尾；已存在則回錯誤（不覆蓋）。',
      inputSchema: {
        path: z.string().describe('相對路徑，例如 wiki/mcp.md'),
        content: z.string().describe('Markdown 全文；第一個 # 標題作為 title；可含 [[wiki-link]] 與 front-matter tags'),
      },
    },
    async ({ path, content }) => {
      needWrite();
      try { await assertCanWrite(ws, content); return json({ created: true, ...(await createNote(ws, path, content, actor)) }); }
      catch (e) { return handleError(e, lang); }
    },
  );

  server.registerTool(
    'update_note',
    {
      title: '更新筆記',
      description: '以樂觀鎖更新筆記全文。if_version 須等於 read_note 回傳的 version；不符回 409 與目前內容。raw/ 層不可更新。',
      inputSchema: {
        path: z.string().describe('筆記路徑'),
        content: z.string().describe('新的 Markdown 全文'),
        if_version: z.number().int().min(1).describe('預期的目前版本號'),
      },
    },
    async ({ path, content, if_version }) => {
      needWrite();
      try { await assertCanWrite(ws, content, path); return json({ updated: true, ...(await updateNote(ws, path, content, if_version, actor)) }); }
      catch (e) { return handleError(e, lang); }
    },
  );

  server.registerTool(
    'list_folder',
    {
      title: '列出資料夾',
      description: '列出資料夾內的子資料夾與筆記。不帶 path 則列出三層：raw、wiki、schema。',
      inputSchema: { path: z.string().optional().describe('資料夾路徑，例如 wiki 或 raw/papers') },
    },
    async ({ path }) => {
      try { return json(await listFolder(ws, path)); }
      catch (e) { return handleError(e, lang); }
    },
  );

  return server;
}
