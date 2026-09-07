import { Shot, helpAsset, type HelpPage } from './common';
import { Mermaid } from '../../components/Mermaid';

// Traditional Chinese help content. Practice first (start → who ingests → daily loop → rules → views → data → how it works → plans → FAQ),
// Karpathy's pattern condensed at the end with the gist linked. Fully static, viewable before and after login.
// Wording of buttons and sections must match the UI strings in web/src/i18n exactly (QA checks this).
const GIST = 'https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f';

const ARCH = `flowchart TB
  subgraph C["用戶端"]
    direction LR
    B["瀏覽器"]
    CU["Cursor · Claude Code<br/>MCP + token"]
    CL["Claude.ai · ChatGPT<br/>MCP + OAuth 2.1"]
    SC["腳本 · hook<br/>REST + token"]
  end
  subgraph E["入口（每個請求先過）"]
    G["安全標頭 · 限流（每 IP／token／人）<br/>身分：session／token／OAuth"]
  end
  subgraph A["應用（單一 Node 服務）"]
    direction LR
    M["MCP server<br/>/mcp 六工具"]
    W["網頁 API<br/>/api"]
    O["OAuth 授權伺服器"]
  end
  subgraph D["領域模組"]
    direction LR
    N["筆記<br/>路徑 · 連結 · 版本 · 待編纂"]
    R["agent 執行器<br/>編纂／對話／健檢"]
    I["匯入 · 書目 · Zotero"]
    NG["對外連線防護"]
  end
  subgraph ST["儲存與外部"]
    direction LR
    P[("PostgreSQL")]
    LLM["模型供應商<br/>用你的 key"]
    X["Crossref · arXiv · PubMed<br/>Zotero · 你貼的網址"]
  end
  B --> G
  CU --> G
  CL --> G
  SC --> G
  G --> M
  G --> W
  G --> O
  M --> N
  W --> N
  W --> R
  W --> I
  R --> N
  I --> N
  R --> LLM
  I --> NG --> X
  N --> P`;

const FLOW = `flowchart TB
  RAW["raw/ 來源頁<br/>不可變，記來源與書目"] -->|"待編纂：還沒有 wiki 頁連回"| ING
  SCH["schema/ 規則<br/>agent 動筆前先讀"] -.->|"get_instructions"| ING
  SCH -.-> QRY
  SCH -.-> LNT
  subgraph OPS["三個操作（同一組六工具）"]
    direction LR
    ING["編纂（Ingest）"]
    QRY["對話（Query）"]
    LNT["健檢（Lint）"]
  end
  ING -->|"建頁 · 更新相關頁 · 連回來源"| PG["wiki/ 知識頁<br/>摘要 · 概念 · 實體 …"]
  ING --> IDX["wiki/index.md 目錄"]
  ING --> LOG["wiki/log.md 紀錄"]
  IDX -->|"先讀目錄再回答"| QRY
  QRY -->|"存成 wiki/queries/"| PG
  PG -->|"抽讀"| LNT
  LNT -->|"補連結 · wiki/lint/日期.md"| PG
  LNT --> LOG`;

export const faq: { q: string; a: string; href?: string; label?: string }[] = [
  { q: "貼網址說「抓不到正文」？", a: "那頁多半有機器人驗證或需要登入；需要 JavaScript 的頁伺服器已會用內建瀏覽器再試一次。還是不行就把內容複製後用「貼上文字」，或上傳 PDF。有 DOI 的論文頁即使正文抓不到，書目也會保留。Facebook 這類要登入的平台抓不到，請改貼文字。" },
  { q: "自動編纂失敗了？", a: "進度面板會顯示原因。最常見是模型被上游限流，系統會自動重試三次；免費共享額度的模型特別容易遇到，換付費模型會穩定很多。已經建好的頁不會消失。" },
  { q: "agent 會用哪種語言寫？", a: "跟工作區的語言設定走（設定頁可改），schema 規則可以覆寫，例如「摘要用英文、我的評論用中文」。內容語言不限。" },
  { q: "Cursor 和網頁會打架嗎？", a: "不會。同一頁同時被改時，後寫入的一方會拿到目前版本並被要求重新編輯，agent 也懂這個規則。" },
  { q: "agent 寫錯了怎麼辦？", a: "見使用指南的「規則與模版」：改頁或回滾、在對話裡糾正、把規則寫進 schema/。", href: "/help/guide#rules", label: "使用指南的「規則與模版」" },
  { q: "沒有 Cursor、也不想申請 API key？", a: "體驗期前 5 次由我們代跑；之後到 OpenRouter 建一把 key（幾分鐘），或用 Claude.ai／ChatGPT 的 connector 連進來。" },
];

export const pages: HelpPage[] = [
  { slug: 'start', title: '開始使用', lede: '五分鐘上手，以及決定誰來編纂', sections: [{ id: 'start', title: '5 分鐘上手' }, { id: 'ways', title: '誰來編纂：Cursor 或自帶 API key' }, { id: 'connectors', title: '用 Claude.ai 或 ChatGPT 連進來', sub: true }], Body: PageStart },
  { slug: 'guide', title: '使用指南', lede: '日常循環、規則與模版、每個檢視怎麼用', sections: [{ id: 'loop', title: '日常循環：三個操作' }, { id: 'discuss', title: '先討論再編纂', sub: true }, { id: 'rules', title: '規則與模版' }, { id: 'views', title: '檢視與工具' }], Body: PageGuide },
  { slug: 'data', title: '資料與系統', lede: '你的資料在哪、誰看得到、系統怎麼運作', sections: [{ id: 'data', title: '你的資料與安全' }, { id: 'system', title: '系統怎麼運作' }], Body: PageData },
  { slug: 'plans', title: '方案與支援', lede: '計價、常見問題、聯絡方式', sections: [{ id: 'plans', title: '方案與計價' }, { id: 'faq', title: '常見問題' }, { id: 'contact', title: '聯絡與回報問題' }], Body: PagePlans },
  { slug: 'karpathy', title: 'LLM Wiki 模式', lede: 'Karpathy 原文摘譯：這個做法從哪來', sections: [{ id: 'karpathy', title: '這個模式從哪來：Karpathy 的 LLM Wiki' }], Body: PageKarpathy },
];

function PageStart() {
  return (
    <>
      <p className="font-sans text-[13.5px] text-ink-soft">WikiBrain 是一座放在雲端的個人知識庫：你把文章、論文、PDF 丟進去，AI 替你讀完、寫成互相連結的 wiki 頁、更新目錄與紀錄。你負責找來源、提問、判斷；簿記交給 AI。這個做法來自 Andrej Karpathy 的「LLM Wiki」（<a className="text-celadon-deep underline" href={GIST} target="_blank" rel="noreferrer">原文</a>），<a className="text-celadon-deep underline" href="/help/karpathy">「LLM Wiki 模式」頁</a>有摘譯。</p>
      <figure className="my-5 font-sans">
        <video controls preload="metadata" playsInline poster={helpAsset('zh-TW', 'home.png')} className="w-full rounded-[10px] border border-line bg-ink shadow-sm" src={helpAsset('zh-TW', 'tour.webm')} aria-label="WikiBrain 20 秒導覽" data-testid="help-video" />
        <figcaption className="mt-1.5 text-[12px] text-ink-soft">20 秒導覽：從貼一個網址到 wiki 頁出現，再問它一個問題。</figcaption>
      </figure>
      <h2 id="start">5 分鐘上手</h2>
      <ol>
        <li>註冊後選一個模版（不確定就選「通用」）。它會建好 schema/ 的規則、wiki/index.md 與 wiki/log.md。</li>
        <li>頂欄「＋ 新增」→「貼網址」貼一個網址，或「上傳檔案」丟一份 PDF。它會進 raw/，頁面上方出現「這個來源還沒編進 wiki（待編纂 Ingest）」的橫幅。</li>
        <li>在橫幅上按「自動編纂（Ingest）這則」。體驗期的前 5 次不用填任何 key。</li>
        <li>等進度面板跑完（通常 30 到 90 秒），左欄 wiki/ 會多出摘要頁，index.md 與 log.md 也更新了。點進去讀，看看它抓的重點對不對。</li>
        <li>頂欄「對話（Query）」問一個問題，例如「這篇的主要論點是什麼」。答案會附頁面引用。</li>
        <li>第 5 次之後，決定誰來編纂：見下方「誰來編纂」。</li>
      </ol>
      <Shot src="pending.png" alt="待編纂橫幅" caption="來源進 raw/ 後的橫幅：自動編纂（Ingest）這則、全部 N 則、先討論再編纂（Ingest）、複製提示詞給 Cursor。" />
      <Shot src="home.png" alt="三欄主畫面" caption="編纂後的主畫面：左欄三層檔案樹（可收合、顯示筆記數），中欄是 wiki 頁，右欄是反向連結與版本紀錄。" />
      <h2 id="ways">誰來編纂：Cursor 或自帶 API key</h2>
      <p>agent 需要一個模型來跑。兩種方式寫出來的頁一模一樣，可以並用；設定頁的「兩種編纂（Ingest）方式，擇一或並用」區塊就是在說這件事。</p>
      <div className="not-prose my-4 overflow-x-auto rounded-[10px] border border-line font-sans text-[13px]">
        <table className="w-full border-collapse">
          <thead><tr className="bg-porcelain text-left text-[12px] text-ink-soft"><th className="px-3 py-2 font-medium">你有…</th><th className="px-3 py-2 font-medium">選</th><th className="px-3 py-2 font-medium">要準備</th><th className="px-3 py-2 font-medium">模型費</th></tr></thead>
          <tbody>
            <tr className="border-t border-line"><td className="px-3 py-2">Cursor、Claude Code，或 Claude.ai／ChatGPT</td><td className="px-3 py-2 font-semibold">方式一：在你自己的 AI client 裡編纂</td><td className="px-3 py-2">Cursor 與 Claude Code：設定頁「連接 Cursor（三步驟）」產生一把 token 貼進去。Claude.ai 與 ChatGPT：在它的 connector 設定貼 MCP 網址，登入按「允許」</td><td className="px-3 py-2">已含在你那個工具的方案裡</td></tr>
            <tr className="border-t border-line"><td className="px-3 py-2">只用瀏覽器</td><td className="px-3 py-2 font-semibold">方式二：網頁上自動編纂（自帶 API key）</td><td className="px-3 py-2">一把 Claude API、OpenAI 或 OpenRouter 的 key，填在設定頁「方式二」區塊</td><td className="px-3 py-2">走你的供應商帳單；flash 級模型一次編纂約數美分，Sonnet 級約十倍</td></tr>
          </tbody>
        </table>
      </div>
      <p>兩邊都沒有？體驗期前 5 次由我們代跑（用較便宜的模型），之後再選。沒有 API key 的話，到 OpenRouter 註冊、建一把 key、貼進設定頁即可。</p>
      <p><b>方式一怎麼用。</b>在來源頁按「複製提示詞給 Cursor」，貼到 Cursor 的對話裡送出；agent 會透過 MCP 讀規則、搜尋、建頁、更新目錄與紀錄。網頁上的「自動編纂」按鈕不會叫 Cursor 動起來，MCP 是由 client 端發起的。</p>
      <h3 id="connectors">用 Claude.ai 或 ChatGPT 連進來（connector）</h3>
      <p>不用 token、不用 API key：把 MCP 網址貼進 AI 工具的 connector 設定，用你的 WikiBrain 帳號登入並按「允許」就接上了。MCP 網址是你的 WikiBrain 網址加 <code>/mcp</code>，託管版是 <code>https://wikibrain.app/mcp</code>。</p>
      <ol>
        <li><b>Claude.ai</b>：設定 → 連接器（Connectors）→「新增自訂連接器」→ 名稱填 WikiBrain、網址貼 MCP 網址 → 新增。在對話的「+」或工具選單裡打開 WikiBrain，第一次會跳到 WikiBrain 的登入與同意頁，登入後按「允許」。回到對話就能看到六個工具（get_instructions、search_notes、read_note、create_note、update_note、list_folder）。</li>
        <li><b>ChatGPT</b>：設定 → 連接器（Connectors）→ 進階／開發者模式 → 建立 → MCP 伺服器網址貼 MCP 網址、驗證方式選 OAuth → 建立，之後流程同上。ChatGPT 的自訂 MCP 目前在部分方案才開放。</li>
        <li>接上之後直接用中文說「先讀 get_instructions，然後把 raw/sources/xxx.md 編纂進 wiki」或「在 wiki 裡搜尋 X 並整理成一頁」；agent 會用同一組工具讀寫這座 wiki。</li>
      </ol>
      <p>授權後的連線會列在設定頁「MCP token」的表格裡（標示 OAuth，記錄 client 名稱與到期時間），隨時可撤銷；存取 token 24 小時到期、client 會自動用 refresh token 續期 90 天，不用重新登入。一個 connector 對應你登入的那個帳號與工作區。</p>
      <p><b>方式二怎麼用。</b>來源頁按「自動編纂（Ingest）這則」或「自動編纂（Ingest）全部 N 則」，伺服器用你的 key 跑同一組工具，進度、工具軌跡、tokens 與費用即時顯示；一個工作最多 60 步，同一工作區一次只跑一個。版本紀錄會標示是哪個 agent 寫的。</p>
      <Shot src="paths.png" alt="兩種編纂方式" caption="設定頁先說明兩種方式，擇一或並用。" />
      <Shot src="ai.png" alt="AI 供應商設定" caption="方式二：選供應商、從清單挑模型、填自己的 key。" />
    </>
  );
}

function PageGuide() {
  return (
    <>
      <h2 id="loop">日常循環：三個操作</h2>
      <p>Karpathy 把知識庫的日常歸納成三個操作，WikiBrain 的介面就照這三個做：</p>
      <ul>
        <li><b>編纂（Ingest）。</b>來源進 raw/ 之後由 agent 讀完、寫摘要頁、更新相關頁與 index.md、在 log.md 記一筆。一份來源可能動到十幾頁。什麼叫「待編纂」？一個 raw/ 來源還沒有任何 wiki 頁連回它，就是待編纂；橫幅、健檢頁、統計頁都會列出。</li>
        <li><b>對話（Query）。</b>頂欄「對話（Query）」開右側面板。agent 先讀 index.md 找相關頁，再讀內容回答，並附頁面路徑當引用；回答可以是表格、Mermaid 圖或 Marp 投影片。有價值的回答按「存成 wiki 頁」，會變成 wiki/queries/ 的一頁，探索的成果留在知識庫裡。在 1280 px 寬度下，對話面板會暫時取代右欄。</li>
        <li><b>健檢（Lint）。</b>頂欄「健檢（Lint）」。先做確定性檢查：孤兒頁、斷連結、未進目錄、待編纂、log 格式、缺 index.md 或 log.md；再可按「請 agent 深度健檢（Lint）」找矛盾、過期說法、該有自己頁面的概念，寫成 wiki/lint/日期.md。確定性檢查不算 agent 次數。</li>
      </ul>
      <Shot src="chat.png" alt="對話面板" caption="對話（Query）面板：回答附頁面引用與工具軌跡，「存成 wiki 頁」把答案歸檔。" />

      <h3 id="discuss">先討論再編纂（Karpathy 偏好的做法）</h3>
      <p>Karpathy 說他偏好一次一份來源、全程參與：agent 先講重點、和他討論該強調什麼，再動筆。WikiBrain 把這個流程做成四步：</p>
      <ol>
        <li>打開一個待編纂的來源頁，橫幅上按<b>「先討論再編纂（Ingest）」</b>。對話面板會開啟，輸入框已帶好一段提示詞：請 agent 讀完來源、用條列講重點、說明它和既有 wiki 頁的關係、以及打算怎麼歸檔。</li>
        <li>按「送出」。agent 讀來源與 index.md 後回覆。接著糾正它：「第三點不重要」「這篇要跟 X 頁對照」「用論點頁的格式」。多來回幾次都可以。</li>
        <li>agent 回覆之後，輸入框上方那條淡青色的列會出現<b>「依討論結果編纂（Ingest）」</b>。按下去會開一個編纂工作，把整段討論當成指示交給 agent；它依結論建摘要頁、更新相關頁、index.md 與 log.md，進度在來源頁上方顯示。</li>
        <li>不想討論也可以直接按「自動編纂（Ingest）這則」，agent 會照 schema 規則一次做完。兩條路的結果一樣會出現在 wiki/、index.md 與 log.md。</li>
      </ol>
      <h2 id="rules">規則與模版</h2>
      <p><b>模版。</b>第一次進入空工作區會請你選一個：通用、研究者、專案管理者、讀書。模版 = schema/ 的規則頁 + 起始資料夾 + 給 agent 的起手提示詞，只影響內容不改介面。設定頁的「情境模版」可以再疊加（加不覆蓋）、「預覽內容」看每一頁、「複製為自訂模版」改成自己的、「把目前規則存成模版」把調好的 schema/ 存起來。</p>
      <Shot src="templates.png" alt="模版預覽" caption="套用前可預覽模版的每一頁；自訂模版可編輯每個檔案。" />
      <p><b>index.md 與 log.md。</b>在 WikiBrain 裡它們是 wiki/index.md 與 wiki/log.md，模版會建好，agent 每次編纂都更新，你不必手動維護；健檢會檢查它們有沒有漏。index.md 是內容目錄，每頁一行含連結與一句摘要；log.md 只追加，每條以「## [日期] ingest | 標題」開頭，記每次編纂、對話歸檔、健檢。</p>
      <p><b>怎麼寫規則。</b>schema/instructions.md 是給 agent 的規則，用一般中文寫就好，改完存檔即生效，下一次編纂就會遵守。常見的規則：</p>
      <ul>
        <li>「wiki 頁一律用繁體中文，術語第一次出現時附英文。」</li>
        <li>「論文摘要頁放 wiki/sources/，檔名用 citation_key；每頁最後列『與哪些頁有關』。」</li>
        <li>「有矛盾就在兩頁都標『⚠ 與 X 頁矛盾』，不要自己選一邊。」</li>
      </ul>
      <p><b>agent 抓錯重點或寫錯了？</b>三個層次：小錯直接改頁，右欄「版本紀錄」可以回到任何舊版；在對話面板告訴它哪裡錯，請它修正並更新 index.md；同一種錯一再發生，就把規則寫進 schema/instructions.md。</p>
      <h2 id="views">檢視與工具</h2>
      <ul>
        <li><b>筆記。</b>閱讀與編輯（Markdown，即時預覽，Ctrl／⌘+S 儲存，可插入或貼上圖片）；右欄有反向連結與版本紀錄，任何舊版都能檢視與回滾。同一頁被兩邊同時改時，後儲存的一方會拿到目前版本並保留自己的草稿。</li>
        <li><b>圖譜。</b>raw 灰、wiki 青瓷、schema 琥珀；連結是編纂時 agent 寫出來的，不是從來源自動抓的。可拖曳、縮放、播放時間軸看知識庫怎麼長大；「篩選」可以只看某一層、某個資料夾、搜尋標題、隱藏孤立頁，或以目前頁為中心只看一兩層鄰居。</li>
        <li><b>資料表。</b>把每頁 front-matter（每頁開頭的屬性欄，例如作者、年份、tags）列成表，可篩選、排序、分組、複製 CSV。研究者模版套用後預設是文獻表。</li>
        <li><b>搜尋。</b>頂欄搜尋框對標題與內文做子字串比對，也是 MCP 的 search_notes。</li>
        <li><b>匯入。</b>「＋ 新增」四個分頁：寫筆記、貼網址、上傳檔案（PDF、Word、HTML、Markdown、純文字，以及 .bib／CSL-JSON 書目檔，一筆一頁）、貼上文字。論文網址會自動補齊作者、年份、期刊與 DOI；一般網頁只留標題、網址與擷取時間；網頁裡的圖片會存成附件。需要 JavaScript 才顯示內容的網頁會改用內建的瀏覽器擷取；有機器人驗證或需要登入的站仍抓不到，請貼文字或上傳 PDF。</li>
        <li><b>書目與引用。</b>wiki 頁裡寫 [@citation_key]，會渲染成（作者, 年份）連到來源頁，頁尾自動列參考文獻，匯出的 Markdown 與 .bib 可直接給 pandoc。設定頁可連 Zotero：唯讀 key、每小時把新項目拉進 raw/sources/（含 PDF 全文），不寫回 Zotero。</li>
        <li><b>統計。</b>各層頁數、來源型別、每日新增、編輯熱度圖、agent 每日 tokens 與費用。</li>
      </ul>
      <Shot src="graph.png" alt="知識圖譜" caption="圖譜：篩選面板與時間軸；連結是編纂時 agent 寫出來的。" />
      <Shot src="add.png" alt="新增對話框" caption="「＋ 新增」對話框：四個分頁共用同一個入口。" />
    </>
  );
}

function PageData() {
  return (
    <>
      <h2 id="data">你的資料與安全</h2>
      <ul>
        <li><b>工作區。</b>你的帳號有一座知識庫，我們叫它工作區；raw/、wiki/、schema/ 都在裡面，別人看不到，agent 也碰不到別的工作區。</li>
        <li><b>什麼會離開伺服器。</b>你按自動編纂、送出對話或深度健檢時，agent 讀到的筆記全文會送到你選的模型供應商（用 OpenRouter 時會再轉給模型提供者）；體驗期的 5 次免 key 則經平台帳號送出。貼網址時由伺服器代抓（對方看到的是伺服器）；有 DOI 時會向 Crossref 查書目。Zotero 同步用你的 key 讀 Zotero。除此之外不會把內容送到任何第三方，也沒有遙測。</li>
        <li><b>agent 能做什麼、不能做什麼。</b>只有六個工具：讀規則、搜尋、讀頁、建頁、更新頁、列資料夾。不能更新或刪除 raw/、不能刪任何頁、不能上網、看不到你的 API key。每次寫入都留版本，作者標 agent 與模型名稱，隨時可回滾。要注意的是 agent 可以改 schema/ 規則，而來源內容會進到它的提示裡；版本歷史是你的復原手段。</li>
        <li><b>API key。</b>用與登入密鑰分開的金鑰加密保存，畫面只顯示末四碼，只在啟動工作或測試連線時解密，隨時可刪。</li>
        <li><b>匯出。</b>設定頁隨時可下載整座庫的 Markdown zip（含圖片附件，Obsidian 直接開）、.bib 與 CSL-JSON。zip 不含版本歷史、已封存來源以外的已刪除頁、對話紀錄與 agent 工作紀錄。</li>
        <li><b>來源不可刪。</b>raw/ 是不可變的來源層：網頁與 agent 都不能刪。不想再看到的來源按「封存」，它會搬到 raw/archive/，不再列為待編纂，版本與連結都保留，隨時可「取消封存」。</li>
        <li><b>保留。</b>每頁最新版永久保留，較舊的版本快照保留 90 天；刪除帳號會連同工作區與所有資料一起刪除。</li>
        <li><b>存放地與開源。</b>託管版的資料規劃存放於新加坡，正式上線時以隱私政策為準。程式碼將以 AGPL-3.0 開源，可用 docker compose 自架。</li>
      </ul>
      <h2 id="system">系統怎麼運作</h2>
      <p>單一 Node 服務同時提供 MCP server、網頁 API、OAuth 授權伺服器與網頁介面；所有資料在 PostgreSQL；沒有向量資料庫，也不做 RAG。方案閘門在啟動 agent 工作時檢查，限流在每個請求檢查。</p>
      <Mermaid code={ARCH} />
      <p>知識怎麼在三層之間流動（三個操作由 Cursor／Claude 經 MCP 執行，或由網頁 agent 用你的 key 執行）：</p>
      <Mermaid code={FLOW} />
    </>
  );
}

function PagePlans() {
  return (
    <>
      <h2 id="plans">方案與計價</h2>
      <p>目前尚未開始收費；體驗期結束會轉 Free，Pro 由我們手動開通。訂閱買的是這座隨時在線、任何 agent 都能讀寫的知識庫：託管、匯入、書目、版本、OAuth 連接、Zotero，手機瀏覽器可用；離線副本與備份鏡像規劃中。<b>模型費用不包含在內</b>：你用自己的 API key，費用直接走你的供應商帳單；設定頁與統計頁會顯示每個工作的實際 tokens 與估算費用（以 OpenRouter 價目表估，實際以供應商帳單為準）。用 Cursor 的人連 key 都不用填。</p>
      <p>一次「agent 工作」＝一次編纂、一則對話回覆或一次深度健檢。</p>
      <div className="not-prose my-4 overflow-x-auto rounded-[10px] border border-line font-sans text-[13px]">
        <table className="w-full border-collapse">
          <thead><tr className="bg-porcelain text-left text-[12px] text-ink-soft"><th className="px-3 py-2 font-medium">方案</th><th className="px-3 py-2 font-medium">期限與價格</th><th className="px-3 py-2 font-medium">內容</th></tr></thead>
          <tbody>
            <tr className="border-t border-line"><td className="px-3 py-2 font-semibold">Pro 體驗</td><td className="px-3 py-2">註冊起 14 天，免費，不用信用卡</td><td className="px-3 py-2">Pro 全功能；agent 工作不限次；前 5 次由我們代跑（較便宜的模型，內容會經平台帳號送到 OpenRouter），不必先申請 API key</td></tr>
            <tr className="border-t border-line"><td className="px-3 py-2 font-semibold">Free</td><td className="px-3 py-2">永久免費</td><td className="px-3 py-2">每月 20 次 agent 工作；200 則筆記、20 MB、1 把 token、版本保留 7 天；自帶 key</td></tr>
            <tr className="border-t border-line"><td className="px-3 py-2 font-semibold">Pro</td><td className="px-3 py-2">每月 6 美元，或每年 60 美元</td><td className="px-3 py-2">agent 工作不限；10,000 則、1 GB、版本保留 90 天；多 token</td></tr>
            <tr className="border-t border-line"><td className="px-3 py-2 font-semibold">自架</td><td className="px-3 py-2">免費（AGPL-3.0）</td><td className="px-3 py-2">docker compose 起 Postgres 與服務，同一份程式碼（含內建瀏覽器）；要自備加密金鑰，Google 登入、寄信、免 key 試用可不設；方案上限可用環境變數調整</td></tr>
          </tbody>
        </table>
      </div>
      <p>上限只擋新增：到了筆記數或容量上限時不能再新增或加長頁面，但閱讀、縮短、封存、匯出都照常，既有內容不會被刪除或改動。版本快照 Free 保留 7 天、Pro 與體驗期 90 天，每頁最新版永久保留。設定頁的方案卡會顯示目前用量。</p>
      <h2 id="faq">常見問題</h2>
      {faq.map(f => <p key={f.q}><b>{f.q}</b>{f.href ? <>{f.a.split(f.label!)[0]}<a className="text-celadon-deep underline" href={f.href}>{f.label}</a>{f.a.split(f.label!).slice(1).join(f.label!)}</> : f.a}</p>)}
      <h2 id="contact">聯絡與回報問題</h2>
      <p>支援信箱：<a className="text-celadon-deep underline" href="mailto:hello@wikibrain.app">hello@wikibrain.app</a>（一般一到兩個工作天回覆）。程式問題與功能建議也可以到 <a className="text-celadon-deep underline" href="https://github.com/wikibrain-app/wikibrain">GitHub</a> 開 issue。法律文件：<a className="text-celadon-deep underline" href="/privacy">隱私權政策</a>、<a className="text-celadon-deep underline" href="/terms">服務條款</a>。資料存放於新加坡（Railway），細節見隱私權政策第 4 條。</p>
    
    </>
  );
}

function PageKarpathy() {
  return (
    <>
      <h2 id="karpathy">這個模式從哪來：Karpathy 的 LLM Wiki</h2>
      <p>以下是 Andrej Karpathy 原文（<a className="text-celadon-deep underline" href={GIST} target="_blank" rel="noreferrer">gist</a>）的摘譯；WikiBrain 的介面就照這個模式做。</p>
      <h3 id="idea">核心想法</h3>
      <p>多數人用 LLM 讀文件的方式是 RAG：上傳一堆檔案，提問時 LLM 撈出相關片段來回答。能用，但每次提問都在從頭重新發現知識，什麼都沒累積。LLM Wiki 的做法不同：<b>LLM 逐步建立並維護一座持久的 wiki</b>，坐在你和原始來源之間。每加一份來源，LLM 不只索引它，而是讀完、抽出重點、整合進既有的 wiki：更新實體頁、修訂主題摘要、標記新資料與舊說法的矛盾。知識編譯一次，之後持續維護。你幾乎不自己寫 wiki，LLM 寫；你負責找來源、探索、問對的問題。</p>
      <p>適用情境：研究（數週到數月的深讀，累積文獻綜述）、專案管理（會議紀錄與決策的追蹤）、讀一本書（人物、主題、情節線）、個人（目標、健康、日記）、團隊內部 wiki、競品分析、課程筆記。</p>
      <h3 id="layers">三層架構</h3>
      <ul>
        <li><b>原始來源 raw/</b>：你策展的來源集合，不可變，LLM 只讀不改。</li>
        <li><b>wiki/</b>：LLM 生成的 Markdown 頁面。這一層完全由 LLM 擁有：建頁、更新、維護交叉引用。你讀，LLM 寫。</li>
        <li><b>schema/</b>：告訴 LLM「wiki 怎麼組織、慣例是什麼、該走什麼流程」的文件（如果你用過 Cursor 的規則檔，就是那個角色）。你和 LLM 一起隨時間演化它。</li>
      </ul>
      <p>三個操作是編纂（Ingest）、對話（Query）、健檢（Lint），兩個特殊頁是 index.md 與 log.md；見<a className="text-celadon-deep underline" href="/help/guide">使用指南</a>。Obsidian 的圖譜、Dataview 資料表、Marp 投影片、把圖片下載到本地、wiki 就是一個 git repo，這些 Karpathy 提到的技巧在 WikiBrain 裡分別對應圖譜、資料表、投影片頁、圖片附件與版本快照加匯出。</p>
      <h3 id="why">為什麼有效</h3>
      <p>維護知識庫最累的不是讀和想，是簿記：更新交叉引用、讓摘要跟上、標記矛盾、跨幾十頁保持一致。人放棄 wiki 是因為維護成本長得比價值快。LLM 不會無聊、不會忘記更新交叉引用、一次可以動十幾頁；維護成本趨近於零，wiki 就能一直維護下去。人的工作是策展來源、引導分析、問好問題、思考這一切的意義；其餘交給 LLM。</p>
    </>
  );
}

