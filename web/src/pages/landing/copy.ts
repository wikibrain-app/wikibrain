import type { Lang } from '../../i18n';

/* Landing-page copy (PM brief 2026-09-12, docs in the redesign folder). Marketing text lives here rather than in the
   i18n dictionaries so it can change without touching app strings. Both languages must satisfy LandingCopy — a missing
   key is a type error, never a runtime fallback — and parallel arrays keep the same length so the prerendered HTML and
   the client render share one DOM shape. Every number traces to src/plans.ts or to the real 2026-09-04 16:22 run
   (ingest_jobs id 7: 18 steps, 51 s, cost US$0.075 at the reference price recorded on the job). */

export type LandingCopy = {
  nav: { docs: string; compare: string; login: string; signup: string };
  hero: { h1: string; lede: string; cta: string; trial: string; watch: string; caption: string; alt: string; sourceName: string; sourceUrl: string };
  karpathy: { before: string; gist: string; mid: string; impl: string; after: string };
  arrives: { title: string; body: string; log: { head: string; lines: { label: string; path: string }[]; run: string }; caption: string };
  second: { title: string; body: string; v1: string; v2: string; counts: string; alt1: string; alt2: string };
  graph: { title: string; body: string; alt: string };
  how: { title: string; steps: { title: string; body: string }[]; video: string };
  agents: { title: string; body: string; claude: string; claudeAlt: string; cursor: string; mcpUrl: string; tokenPh: string };
  research: { title: string; body: string; alt: string };
  plans: {
    title: string; trial: string;
    free: { name: string; price: string; lines: string[] };
    pro: { name: string; price: string; lines: string[]; cta: string };
    cost: string; selfHostBefore: string; selfHostLink: string;
  };
  open: { title: string; body: string };
  faq: { title: string; items: { q: string; a: string; link?: { text: string; href: string } }[] };
  final: { compare: { text: string; href: string }[] };
  footer: { line: string; privacy: string; terms: string; login: string; docs: string };
};

export const landingMeta: Record<Lang, { title: string; description: string }> = {
  'zh-TW': { title: 'WikiBrain — 來源你丟，wiki 讓 AI 寫', description: '託管的 Karpathy LLM Wiki：貼一份來源，AI agent 寫成互相連結的 wiki 頁，不是每次重新檢索。Cursor、Claude、ChatGPT 都能讀寫。' },
  en: { title: 'WikiBrain — you drop in sources, an agent writes the wiki', description: 'A hosted Karpathy LLM Wiki: drop in a source and an agent writes interlinked pages instead of retrieving fragments. Cursor and Claude can write it too.' },
};

export const GIST_URL = 'https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f';

const logLinesZh = [
  { label: '來源：', path: 'raw/sources/llm-wiki.md' },
  { label: '新建來源摘要頁：', path: 'wiki/sources/karpathy2026llmwiki.md' },
  { label: '新建概念頁：', path: 'wiki/concepts/llm-wiki-pattern.md' },
  { label: '更新概念索引：', path: 'wiki/concepts/README.md' },
  { label: '更新既有討論頁：', path: 'wiki/llm-wiki-pattern.md' },
  { label: '更新總覽索引：', path: 'wiki/index.md' },
];
const logLinesEn = [
  { label: 'Source: ', path: 'raw/sources/ten-simple-rules-structuring-papers.md' },
  { label: 'Added the source summary: ', path: 'wiki/sources/ten-simple-rules-structuring-papers.md' },
  { label: 'Added a concept page: ', path: 'wiki/concepts/scientific-writing.md' },
  { label: 'Updated the overview: ', path: 'wiki/index.md' },
  { label: 'Appended an entry: ', path: 'wiki/log.md' },
];

export const copy: Record<Lang, LandingCopy> = {
  'zh-TW': {
    nav: { docs: '說明', compare: '比較', login: '登入', signup: '註冊' },
    hero: {
      h1: '來源你丟，wiki 讓 AI 寫。',
      lede: '貼一個網址或上傳一份 PDF，agent 讀完就寫一頁重點整理，連回相關的頁，順手更新總覽。Cursor、Claude、ChatGPT 讀寫的都是同一座 wiki，知識不再散在對話裡。',
      cta: '免費開始',
      trial: '14 天 Pro 體驗，不用信用卡。前 50 次編纂連 API key 都不用。',
      watch: '先看 15 秒影片',
      caption: '這一頁是 agent 寫的。來源：一則網路文章；寫成頁面、4 頁連回它、更新總覽，51 秒。',
      alt: '一頁由 agent 編纂出來的 wiki 頁：標題、由 agent 署名的最後編纂行、內文，以及連回來源的連結。',
      sourceName: 'raw/sources/llm-wiki.md', sourceUrl: 'gist.github.com/karpathy/442a6bf…',
    },
    karpathy: { before: '這是 Andrej Karpathy 在 2026 年提出的 LLM Wiki 模式——三層資料夾、三個操作、由 AI 維護的 Markdown wiki——我們把它託管起來，並讓你現有的 agent 直接接上。', gist: '〈讀他的原文〉', mid: '　與　', impl: '〈我們怎麼實作〉', after: '' },
    arrives: {
      title: '一份來源進來，agent 做了什麼',
      body: '這不是把筆記放上雲端、讓 AI 每次提問時撈幾段回來。來源一進來，agent 就把它讀完，寫成一頁摘要，把新的概念與人物各開一頁，把矛盾的地方標出來，再更新總覽與紀錄。之後每一個問題，都站在已經整理好的頁上回答，而且附上是哪一頁。',
      log: { head: '[2026-09-04] ingest | Andrej Karpathy: llm-wiki', lines: logLinesZh, run: '18 步 · 51 秒 · 約 US$0.08' },
      caption: '真實工作紀錄，模型 google/gemini-flash。上面是 wiki/log.md 裡 agent 自己寫的那一條。',
    },
    second: {
      title: '第二份來源進來時，它不重寫，它疊上去',
      body: '第一篇文章寫出了〈Google 台灣〉這一頁。九分鐘後丟進另一篇報導，agent 先找到這一頁，補上兩節與七條項目，加了 16 條連結——版本從 v1 變 v2，舊版還在。來源越多，每一頁越厚，這就是為什麼它會複利，而每次重新檢索的工具不會。',
      v1: '第一篇來源之後，9/5 23:02', v2: '第二篇來源之後，9/5 23:11',
      counts: '這座示範 wiki：11 份來源 → 39 頁 → 216 條連結。',
      alt1: '〈Google 台灣〉第 1 版：簡介與一節「重大佈局與設施」', alt2: '〈Google 台灣〉第 2 版：同一頁多了彰化資料中心與水資源的一節',
    },
    graph: {
      title: '知識會長成一張圖',
      body: '每一頁的 [[連結]] 與 [@引用] 都是圖譜上的一條邊。來源越多，樞紐頁越明顯——哪些主題已經被反覆佐證、哪些還孤零零掛在旁邊，一眼就看得出來。時間軸可以回放這座 wiki 是怎麼長出來的。',
      alt: '這座示範 wiki 的圖譜：五十多個節點分成幾個群聚，連線密的是被多份來源引用的樞紐頁。',
    },
    how: {
      title: '三步，第一次就能跑完',
      steps: [
        { title: '丟來源', body: '貼網址、上傳 PDF 或 Word、貼文字、匯入 .bib，或連上 Zotero。來源放在 raw/，原文不會被改。' },
        { title: '讓 AI 編纂（Ingest）', body: '按「自動編纂這則」，約一分鐘。想先討論再寫也可以。用 Cursor 的人在 Cursor 裡下指令，結果一樣。' },
        { title: '問它、查它、健檢它', body: '對話（Query）回答會附上是哪一頁，好答案可以存回 wiki；健檢（Lint）找出孤兒頁、斷掉的連結與互相矛盾的地方。' },
      ],
      video: '15 秒：貼一份來源，頁出現，問它一個問題。',
    },
    agents: {
      title: '你現在用的 agent，直接讀寫這座 wiki',
      body: '內建 MCP server。Cursor 與 Claude Code 貼一把 token；Claude.ai 與 ChatGPT 用登入授權接上。六個工具在每個 agent 裡都一樣：讀規則、搜尋、閱讀、建立、更新、列資料夾。兩邊同時改同一頁也不會打架——後寫的一方會拿到目前版本。',
      claude: 'Claude.ai：在對話裡交代，工具自己呼叫。', cursor: 'Cursor：設定頁複製一段 mcp.json 即可。',
      claudeAlt: 'Claude.ai 的對話視窗，顯示一次 get_instructions 工具呼叫與它回傳的規則。',
      mcpUrl: 'https://wikibrain.app/mcp', tokenPh: 'wb_live_…（設定頁產生）',
    },
    research: {
      title: '給研究者：引用會自己長出參考文獻',
      body: '貼論文網址或 DOI，書目自動補齊（Crossref、arXiv、PubMed）。wiki 頁裡寫 [@citekey]，畫面顯示（作者, 年份）並連到來源頁，頁尾自動長出參考文獻。BibTeX 與 CSL-JSON 進出，Zotero 收藏夾每小時同步。研究者模版的規則會要求 agent 用這種方式引用。（下圖是英文示範庫的頁面——目前只有那裡有完整的引用鏈；介面仍是繁中。）',
      alt: '一頁 wiki：內文的 [@fauchie2023the] 顯示成（Fauchié, 2023），頁尾自動列出參考文獻',
    },
    plans: {
      title: '方案',
      trial: '註冊即開始 14 天 Pro 體驗：全部功能、agent 工作不限次、前 50 次不用 API key。不用信用卡，到期自動轉 Free，資料留著。',
      free: { name: 'Free', price: '永久免費', lines: ['200 則筆記', '每月 20 次 agent 工作', '自帶 API key，或用 Cursor', '隨時匯出'] },
      pro: { name: 'Pro', price: 'US$6／月，或 US$60／年', lines: ['agent 工作不限次', '10,000 則、1 GB', '多把 token、REST API', '版本保留 90 天', '隨時取消'], cta: '開始 14 天體驗' },
      cost: '模型費用另計：你用自己的 API key，一般用量每月約 US$1–3，費用走你自己的供應商帳單；用 Cursor 的人不需要 key。結帳由 Paddle 處理。',
      selfHostBefore: '想自己架？程式碼開源，docker compose 一個指令。', selfHostLink: 'GitHub',
    },
    open: { title: '開源，資料在你手上', body: '程式碼以 AGPL-3.0 開源在 GitHub。託管版的資料放在新加坡，整座 wiki 隨時匯出成 Obsidian 打得開的 Markdown zip，書目匯出 .bib。介面有繁體中文與英文，內容用什麼語言都可以。' },
    faq: {
      title: '註冊前常問的',
      items: [
        { q: '我需要 API key 嗎？', a: '體驗期前 50 次不用。之後三選一：用 Cursor（不用 key）、在 Claude.ai 或 ChatGPT 接上（不用 key）、或到設定頁貼一把 OpenAI／Anthropic／OpenRouter 的 key，在網頁上一鍵編纂。' },
        { q: 'agent 寫錯了怎麼辦？', a: '每次寫入都留版本，一鍵復原。也可以直接改頁、在對話裡糾正，或把規則寫進 schema/，之後它就照規則寫。' },
        { q: '跟 NotebookLM 差在哪？', a: 'NotebookLM 每次提問重新從來源檢索；WikiBrain 把來源編成會留下來的頁，而且 Cursor 與 Claude 讀寫得到。', link: { text: '完整比較', href: '/compare/notebooklm' } },
        { q: '資料能拿走嗎？', a: '隨時。設定頁一鍵匯出 Markdown zip 與 .bib；帳號可自行刪除；程式碼開源，可以自架。' },
      ],
    },
    final: { compare: [{ text: '和 NotebookLM 比', href: '/compare/notebooklm' }, { text: '和 Obsidian 比', href: '/compare/obsidian' }, { text: '和 Hjarni 比', href: '/compare/hjarni' }] },
    footer: { line: 'WikiBrain · personal knowledge base · 靈感來自 Andrej Karpathy 的 LLM Wiki', privacy: '隱私權政策', terms: '服務條款', login: '登入', docs: '說明' },
  },
  en: {
    nav: { docs: 'Docs', compare: 'Compare', login: 'Sign in', signup: 'Sign up' },
    hero: {
      h1: 'You drop in the sources. An agent writes the wiki.',
      lede: 'Paste a URL or upload a PDF. The agent reads it, writes a page of what matters, links it to the pages it touches, and updates the overview. Cursor, Claude and ChatGPT read and write the same wiki, so nothing stays buried in a chat thread.',
      cta: 'Start free',
      trial: '14-day Pro trial, no card. Your first 50 agent runs need no API key.',
      watch: 'Watch the short tour',
      caption: 'An agent wrote this page from one source, nine steps and sixteen seconds after it landed — plus a page for the concept it introduced, and the overview updated.',
      alt: 'A wiki page compiled by an agent: its title, a byline naming the model that wrote it, the body, and links back to the source.',
      sourceName: 'raw/sources/ten-simple-rules-structuring-papers.md', sourceUrl: 'journals.plos.org/…/pcbi.1005619',
    },
    karpathy: { before: 'This is Andrej Karpathy’s LLM Wiki pattern — three folders, three operations, a Markdown wiki maintained by an AI — hosted, and wired to the agents you already use. ', gist: 'Read his note', mid: ' · ', impl: 'How we implement it', after: '' },
    arrives: {
      title: 'What happens when a source lands',
      body: 'This is not notes in the cloud that an AI fishes through at question time. When a source arrives, the agent reads all of it, writes a summary page, opens a page for each new concept or person, flags where it contradicts what is already there, and updates the overview and the log. Every later question is answered from pages that already exist — with the page named.',
      log: { head: '[2026-09-05] ingest | Ten simple rules for structuring papers', lines: logLinesEn, run: '9 steps · 16 s · about US$0.01' },
      caption: 'A real run, model google/gemini-flash. The entry above is what the agent itself wrote into wiki/log.md.',
    },
    second: {
      title: 'When the second source lands, it doesn’t start over',
      body: 'The first article produced the page “Google Taiwan”. Nine minutes later a second report went in; the agent found that page, added two sections and seven items, and 16 links — v1 became v2, and v1 is still there. The more sources, the richer every page. That is why a compiled wiki compounds and a retrieval tool does not.',
      v1: 'after the first source, 9/5 23:02', v2: 'after the second source, 9/5 23:11',
      counts: 'This demo wiki: 11 sources → 39 pages → 216 links. (The pair above is from our Traditional Chinese demo — what to look at is the page growing, not the words.)',
      alt1: '“Google Taiwan” version 1: an introduction and one section on facilities', alt2: '“Google Taiwan” version 2: the same page with the Changhua data centre and a water section added',
    },
    graph: {
      title: 'Knowledge grows into a graph',
      body: 'Every [[link]] and [@citation] on a page is an edge. The more sources arrive, the more obvious the hub pages become — which topics several sources already support, and which ones are still hanging off to one side. The timeline replays how the wiki grew.',
      alt: 'The graph of this demo wiki: a couple of dozen nodes in a few clusters, the densely connected ones being the pages several sources cite.',
    },
    how: {
      title: 'Three steps, done on day one',
      steps: [
        { title: 'Add a source', body: 'Paste a URL, upload a PDF or Word file, paste text, import a .bib, or connect Zotero. Sources live in raw/ and are never edited.' },
        { title: 'Let the agent compile (Ingest)', body: 'Press Compile this source; about a minute. Discuss first if you want to steer. Cursor users give the instruction in Cursor instead; the result is the same.' },
        { title: 'Ask, browse, lint', body: 'Ask (Query) and every answer names its pages; keep a good answer as a wiki page. Lint finds orphan pages, broken links and contradictions.' },
      ],
      video: '15 s: paste a source, a page appears, ask it a question.',
    },
    agents: {
      title: 'The agents you already use read and write this wiki',
      body: 'There is an MCP server built in. Cursor and Claude Code paste a token; Claude.ai and ChatGPT connect by signing in. The same six tools in every agent: read the rules, search, read, create, update, list a folder. Two agents editing the same page won’t clobber each other — the later writer gets the current version back.',
      claude: 'Claude.ai: ask in the chat; the tools are called for you.', cursor: 'Cursor: copy one mcp.json block from Settings.',
      claudeAlt: 'A Claude.ai conversation showing a get_instructions tool call and the rules it returned.',
      mcpUrl: 'https://wikibrain.app/mcp', tokenPh: 'wb_live_… (generated in Settings)',
    },
    research: {
      title: 'For researchers: citations that build their own reference list',
      body: 'Paste a paper’s URL or DOI and the bibliography fills itself in (Crossref, arXiv, PubMed). Write [@citekey] on a wiki page; it renders as (Author, Year), links to the source, and a reference list grows at the bottom. BibTeX and CSL-JSON in and out; a Zotero collection syncs hourly. The researcher template tells the agent to cite this way.',
      alt: 'A wiki page: [@fauchie2023the] in the text renders as (Fauchié, 2023) and a reference list is generated at the bottom',
    },
    plans: {
      title: 'Plans',
      trial: 'Every account starts with a 14-day Pro trial: everything, unlimited agent runs, the first 50 without an API key. No card; it drops to Free when it ends and your data stays.',
      free: { name: 'Free', price: 'Free forever', lines: ['200 notes', '20 agent runs a month', 'Bring your own key, or use Cursor', 'Export any time'] },
      pro: { name: 'Pro', price: 'US$6 a month, or US$60 a year', lines: ['Unlimited agent runs', '10,000 notes, 1 GB', 'Multiple tokens, REST API', '90-day version history', 'Cancel any time'], cta: 'Start the 14-day trial' },
      cost: 'Model usage is billed by your provider, not us: with your own API key, typical use is about US$1–3 a month. Cursor users need no key. Checkout is handled by Paddle.',
      selfHostBefore: 'Prefer to self-host? The code is open source; one docker compose command. ', selfHostLink: 'GitHub',
    },
    open: { title: 'Open source. Your data stays yours.', body: 'The code is on GitHub under AGPL-3.0. Hosted data lives in Singapore; export the whole wiki any time as a Markdown zip that Obsidian opens, and the bibliography as .bib. The interface is in Traditional Chinese and English; write in any language.' },
    faq: {
      title: 'Before you sign up',
      items: [
        { q: 'Do I need an API key?', a: 'Not for the first 50 runs of the trial. After that, one of three: use Cursor (no key), connect Claude.ai or ChatGPT (no key), or paste an OpenAI, Anthropic or OpenRouter key in Settings and compile from the web with one click.' },
        { q: 'What if the agent gets it wrong?', a: 'Every write keeps a version; restore with one click. You can also edit the page, correct it in chat, or write the rule into schema/ so it follows it next time.' },
        { q: 'How is this different from NotebookLM?', a: 'NotebookLM re-reads your sources every time you ask; WikiBrain compiles them into pages that stay, and Cursor and Claude can read and write them.', link: { text: 'Full comparison', href: '/compare/notebooklm' } },
        { q: 'Can I take my data out?', a: 'Any time. One click in Settings exports a Markdown zip and a .bib; you can delete the account yourself; the code is open source and self-hostable.' },
      ],
    },
    final: { compare: [{ text: 'vs NotebookLM', href: '/compare/notebooklm' }, { text: 'vs Obsidian', href: '/compare/obsidian' }, { text: 'vs Hjarni', href: '/compare/hjarni' }] },
    footer: { line: 'WikiBrain · personal knowledge base · inspired by Andrej Karpathy’s LLM Wiki', privacy: 'Privacy', terms: 'Terms', login: 'Sign in', docs: 'Docs' },
  },
};
