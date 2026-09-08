import type { Lang } from '../../i18n';

/* Comparison pages (/compare/<slug>): honest, dated side-by-side notes for people choosing between WikiBrain and a tool
   they already know. Facts about other products come from their public pricing/docs pages as of the `checked` date;
   every page says so and links to the other product. Keep each comparison short: who it is for, a table, the trade-offs. */
export interface CompareRow { feature: Record<Lang, string>; them: Record<Lang, string>; us: Record<Lang, string> }
export interface CompareDoc {
  slug: string;
  name: string;                       // the other product's name
  url: string;                        // its official site
  checked: string;                    // date the facts were checked
  title: Record<Lang, string>;
  lede: Record<Lang, string>;
  themFor: Record<Lang, string>;      // "choose them if…"
  usFor: Record<Lang, string>;        // "choose WikiBrain if…"
  rows: CompareRow[];
  caveats: Record<Lang, string[]>;    // things we are honest about
}

const CHECKED = '2026-09-04';
const r = (feature: [string, string], them: [string, string], us: [string, string]): CompareRow => ({
  feature: { 'zh-TW': feature[0], en: feature[1] }, them: { 'zh-TW': them[0], en: them[1] }, us: { 'zh-TW': us[0], en: us[1] },
});

export const compareDocs: CompareDoc[] = [
  {
    slug: 'notebooklm', name: 'Google NotebookLM', url: 'https://notebooklm.google', checked: CHECKED,
    title: { 'zh-TW': 'WikiBrain 與 NotebookLM 的差別', en: 'WikiBrain vs NotebookLM' },
    lede: { 'zh-TW': '兩個都是「把來源丟進去問問題」，差在問完之後留不留下東西。', en: 'Both let you drop in sources and ask questions. The difference is what is left behind afterwards.' },
    themFor: { 'zh-TW': '你只想針對一批文件快速問答、聽 AI 播客式摘要，不打算長期累積，也不需要讓 Cursor 或 Claude 這類 agent 讀寫。', en: 'You want quick Q&A and audio overviews over one batch of documents, are not building something that accumulates, and do not need agents like Cursor or Claude to read and write it.' },
    usFor: { 'zh-TW': '你希望每份來源讀完都變成一頁可連結、可修正的 wiki，知識越用越厚；而且要讓 Cursor、Claude、ChatGPT 透過 MCP 直接讀寫同一座庫。', en: 'You want every source compiled into a linked, editable wiki page that compounds over time, and you want Cursor, Claude and ChatGPT to read and write the same knowledge base through MCP.' },
    rows: [
      r(['機制', 'Mechanism'], ['檢索式：每次提問重新從來源檢索，引用到段落', 'Retrieval: each question re-reads the sources and cites passages'], ['編纂式：AI 把來源編成持久的 wiki 頁、目錄與紀錄（Karpathy LLM Wiki）', 'Compilation: the AI writes persistent wiki pages, an index and a log (Karpathy’s LLM Wiki)']),
      r(['問完留下什麼', 'What remains'], ['對話與筆記；來源本身不變', 'The chat and notes; the sources stay as they were'], ['互相連結的 Markdown 頁，可編輯、有版本、可匯出', 'Interlinked Markdown pages you can edit, version and export']),
      r(['agent 存取', 'Agent access'], ['消費版沒有公開 API 或官方 MCP', 'No public API or official MCP for the consumer version'], ['內建 MCP server：token 或 OAuth，Cursor／Claude Code／Claude.ai／ChatGPT 皆可', 'Built-in MCP server: token or OAuth, for Cursor, Claude Code, Claude.ai and ChatGPT']),
      r(['模型', 'Model'], ['Gemini，費用含在方案內', 'Gemini, included in the plan'], ['自帶 key（Anthropic／OpenAI／OpenRouter），模型費另計；體驗期前 10 次免 key', 'Bring your own key (Anthropic, OpenAI, OpenRouter); model cost is separate; the first 10 trial runs need no key']),
      r(['書目與引用', 'Bibliography'], ['引用到來源段落', 'Citations point to source passages'], ['DOI／Crossref 書目、BibTeX／CSL 匯入匯出、[@citekey] 引用、Zotero 同步', 'DOI/Crossref metadata, BibTeX/CSL import and export, [@citekey] citations, Zotero sync']),
      r(['匯出', 'Export'], ['整本 Markdown 匯出：未查到', 'Whole-notebook Markdown export: not found'], ['一鍵 zip，Obsidian 相容', 'One-click zip, Obsidian-compatible']),
      r(['價格（個人）', 'Price (personal)'], ['免費 50 來源／本；Plus 約 US$4.99；Pro 約 US$19.99', 'Free 50 sources per notebook; Plus about US$4.99; Pro about US$19.99'], ['Free 永久（200 則、每月 20 次 agent 工作）；Pro US$6／月或 60／年', 'Free forever (200 notes, 20 agent runs a month); Pro US$6/month or 60/year']),
      r(['開源', 'Open source'], ['否', 'No'], ['AGPL-3.0，可自架', 'AGPL-3.0, self-hostable']),
    ],
    caveats: {
      'zh-TW': ['NotebookLM 的問答與播客摘要做得很好，如果你只需要這個，它比較省事。', 'WikiBrain 的模型費由你自己付（一般用量每月約 1 到 3 美元），這是明擺著的取捨。', '價格與功能以對方官網為準；本頁查證日期見頁尾。'],
      en: ['NotebookLM’s Q&A and audio overviews are excellent; if that is all you need, it is less work.', 'With WikiBrain you pay the model provider yourself (typically US$1–3 a month), an explicit trade-off.', 'Prices and features are as published on the other product’s site; the check date is in the footer.'],
    },
  },
  {
    slug: 'obsidian', name: 'Obsidian', url: 'https://obsidian.md', checked: CHECKED,
    title: { 'zh-TW': 'WikiBrain 與 Obsidian 的差別', en: 'WikiBrain vs Obsidian' },
    lede: { 'zh-TW': 'WikiBrain 匯出的就是 Obsidian vault；問題是誰來寫、放在哪、誰能讀。', en: 'What WikiBrain exports is an Obsidian vault. The question is who writes it, where it lives, and who can read it.' },
    themFor: { 'zh-TW': '你喜歡本機檔案、外掛生態與自己動手整理，已經有一套 Obsidian 工作流，AI 只是輔助。', en: 'You like local files, the plugin ecosystem and organising by hand; you already have an Obsidian workflow and AI is an assistant.' },
    usFor: { 'zh-TW': '你要的是「丟來源進去，AI 替你編成 wiki」，而且要在手機、Cursor、Claude 之間共用同一座庫，不想自己維護同步與外掛。', en: 'You want to drop sources in and have the AI compile the wiki, shared between your phone, Cursor and Claude, without maintaining sync and plugins yourself.' },
    rows: [
      r(['誰來寫', 'Who writes'], ['你，或社群外掛（例如以 Karpathy 模式編纂的 LLM Wiki 外掛）', 'You, or community plugins (including LLM-Wiki style compilers)'], ['內建：來源進 raw/ 後一鍵自動編纂，或交給你的 agent', 'Built in: one click after a source lands in raw/, or hand it to your agent']),
      r(['資料在哪', 'Where the data lives'], ['本機 vault；Sync 付費同步', 'Local vault; Sync is a paid add-on'], ['雲端（新加坡），瀏覽器與手機即用；隨時整庫匯出', 'Cloud (Singapore), usable from any browser or phone; export the whole vault any time']),
      r(['agent 存取', 'Agent access'], ['無官方 MCP；社群 MCP 需桌面 app 開著', 'No official MCP; community MCPs need the desktop app running'], ['內建 MCP server，token 或 OAuth，24 小時在線', 'Built-in MCP server, token or OAuth, always on']),
      r(['圖譜、反向連結、版本', 'Graph, backlinks, versions'], ['圖譜與反向連結原生；版本靠 Sync 或 git', 'Graph and backlinks are native; versions via Sync or git'], ['都有：圖譜（篩選、時間軸）、反向連結、每次儲存的版本與復原', 'All included: graph (filters, timeline), backlinks, a version per save with rollback']),
      r(['書目', 'Bibliography'], ['靠 Zotero 外掛', 'Via Zotero plugins'], ['DOI／BibTeX／CSL 進出、[@citekey] 引用、Zotero 同步', 'DOI/BibTeX/CSL in and out, [@citekey] citations, Zotero sync']),
      r(['價格', 'Price'], ['App 免費；Sync 約 US$4–8／月；AI 外掛另計', 'App free; Sync about US$4–8/month; AI plugins extra'], ['Free 永久；Pro US$6／月或 60／年；模型費自付', 'Free forever; Pro US$6/month or 60/year; model cost is yours']),
      r(['鎖定', 'Lock-in'], ['無', 'None'], ['無：Markdown zip 匯出，開源可自架', 'None: Markdown zip export, open source, self-hostable']),
    ],
    caveats: {
      'zh-TW': ['如果你的整套流程都在 Obsidian，離線、外掛與客製化它更強；WikiBrain 目前離線只有殼，完整離線副本還在規劃。', '兩者不衝突：很多人用 WikiBrain 編纂，定期匯出 zip 放進 Obsidian 讀。', '價格以對方官網為準。'],
      en: ['If your whole workflow lives in Obsidian, it wins on offline use, plugins and customisation; WikiBrain’s offline mode is a shell only for now, a full offline copy is planned.', 'They are not exclusive: many people compile in WikiBrain and export a zip into Obsidian to read.', 'Prices are as published on Obsidian’s site.'],
    },
  },
  {
    slug: 'hjarni', name: 'Hjarni', url: 'https://hjarni.com', checked: CHECKED,
    title: { 'zh-TW': 'WikiBrain 與 Hjarni 的差別', en: 'WikiBrain vs Hjarni' },
    lede: { 'zh-TW': '最接近的同類：都是託管 Markdown 知識庫加 MCP。差在有沒有人替你編纂，以及價格。', en: 'The closest neighbour: both are hosted Markdown knowledge bases with MCP. The differences are whether anything compiles for you, and price.' },
    themFor: { 'zh-TW': '你想要一個乾淨的雲端筆記庫讓各種 AI client 讀寫，自己（或你的 agent）決定每一則怎麼寫，也需要 email 進筆記與原生手機 app。', en: 'You want a clean hosted note store that many AI clients read and write, decide yourself (or via your agent) how each note is written, and need email-to-note and native mobile apps.' },
    usFor: { 'zh-TW': '你要的是來源進來就有 AI 依規則編成 wiki、更新目錄與紀錄，還有書目、圖譜與健檢；而且預算是 6 美元而不是 12。', en: 'You want sources compiled into a wiki by rules, with the index and log kept current, plus bibliography, graph and lint, at US$6 rather than 12.' },
    rows: [
      r(['機制', 'Mechanism'], ['儲存式：官方說明「沒有任何事是自動的」，由你或你的 AI 刻意寫筆記', 'Storage: “nothing is automatic”, you or your AI write notes deliberately'], ['編纂式：raw／wiki／schema 三層，來源進來即可自動編纂（Ingest）、對話（Query）、健檢（Lint）', 'Compilation: raw/wiki/schema layers with Ingest, Query and Lint built in']),
      r(['agent 存取', 'Agent access'], ['MCP，OAuth 或 token；已在 Claude 與 ChatGPT connector 目錄', 'MCP with OAuth or token; listed in the Claude and ChatGPT connector directories'], ['MCP，OAuth 2.1 + DCR 或 token；貼網址即可接 Claude.ai／ChatGPT（目錄上架進行中）', 'MCP with OAuth 2.1 + DCR or token; paste the URL into Claude.ai/ChatGPT (directory listing in progress)']),
      r(['書目與學術', 'Bibliography'], ['未見', 'Not offered'], ['DOI／Crossref、BibTeX／CSL、[@citekey]、Zotero 同步、研究者模版', 'DOI/Crossref, BibTeX/CSL, [@citekey], Zotero sync, researcher template']),
      r(['圖譜與版本', 'Graph and versions'], ['無圖譜；30 天垃圾桶版本', 'No graph; 30-day trash versions'], ['圖譜（篩選、時間軸）、每次儲存的版本、復原', 'Graph (filters, timeline), a version per save, rollback']),
      r(['手機', 'Mobile'], ['iOS／Android app', 'iOS and Android apps'], ['PWA（加到主畫面）；原生 app 規劃中', 'PWA (add to home screen); native apps planned']),
      r(['介面語言', 'Interface language'], ['未查到繁中', 'Traditional Chinese not found'], ['繁體中文與英文', 'Traditional Chinese and English']),
      r(['價格', 'Price'], ['Free 25 則；Pro 約 US$12／月或 120／年', 'Free 25 notes; Pro about US$12/month or 120/year'], ['Free 200 則；Pro US$6／月或 60／年', 'Free 200 notes; Pro US$6/month or 60/year']),
      r(['匯出與開源', 'Export and source'], ['可匯出 Markdown bundle；非開源', 'Markdown bundle export; not open source'], ['Markdown zip；AGPL-3.0 開源可自架', 'Markdown zip; AGPL-3.0, self-hostable']),
    ],
    caveats: {
      'zh-TW': ['Hjarni 上線較早，connector 目錄曝光、email 進筆記與原生 app 是我們還沒有的。', 'WikiBrain 的自動編纂要自帶模型 key（或體驗期前 10 次免 key）；Hjarni 不跑模型所以沒這筆費用。', '對方功能與價格以其官網為準；「未查到」表示查證當日沒找到，不代表沒有。'],
      en: ['Hjarni launched earlier; directory listings, email-to-note and native apps are things we do not have yet.', 'WikiBrain’s auto-ingest needs your own model key (or the first 10 trial runs); Hjarni runs no model, so it has no such cost.', 'The other product’s features and prices are as published on its site; “not found” means not found on the check date, not necessarily absent.'],
    },
  },
];
