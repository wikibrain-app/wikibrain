// Privacy policy and terms of service for the hosted service (wikibrain.app), rendered by pages/Legal.tsx and
// pre-rendered by scripts/prerender-help.tsx. Markdown; the Traditional Chinese text is the binding version.
// Source drafts and the lawyer checklist live in docs/internal/q5-legal-drafts.md (not in the public repo).
import type { Lang } from '../../i18n';

export interface LegalDoc { slug: 'privacy' | 'terms'; updated: string; title: Record<Lang, string>; body: Record<Lang, string> }

const OPERATOR = 'Daniel Huang';
const OPERATOR_EN = 'Daniel Huang';
const CONTACT = 'hello@wikibrain.app';
const REPO = 'https://github.com/wikibrain-app/wikibrain';
const UPDATED = '2026-09-08';

export const privacy: LegalDoc = {
  slug: 'privacy',
  updated: UPDATED,
  title: { 'zh-TW': '隱私權政策', en: 'Privacy Policy' },
  body: {
    'zh-TW': `生效日期：${UPDATED}　版本 1.1

一句話版本：**你的筆記是你的。** 我們只在你按下按鈕時把內容送去你選的 AI 模型，不拿它做別的事，不追蹤你，不賣資料；帳號一刪，資料就從主資料庫連鎖刪掉。下面用問答把細節講清楚，這份文件同時也是個人資料保護法要求的告知事項（經營者、目的、資料類別、存放地、期間、你的權利）。

本服務由 ${OPERATOR} 提供，網址 wikibrain.app，有問題寫信到 ${CONTACT}。

## 我的筆記會被拿去訓練 AI 嗎？

不會。我們自己不訓練任何模型，也不會把你的內容拿去做產品以外的用途。當你按「自動編纂」「對話」或「健檢」時，相關筆記會送到**你在設定頁選的模型供應商**（Anthropic、OpenAI 或 OpenRouter），用你自己的 API key；那一段的處理方式依該供應商的條款，多數供應商對 API 流量預設不用來訓練，但請自行確認你選的那一家。

## 誰看得到我的筆記？

只有你，以及你授權的客戶端（Cursor、Claude Code、Claude.ai、ChatGPT 等，透過你自己建立的 MCP token 或 OAuth 授權）。每一筆查詢都帶工作區隔離，別的帳號看不到你的東西。我們的營運者不會主動閱讀你的內容；只有在你回報問題並同意時，或為了處理資安事件、法律要求時才會查看必要的部分。

## 你們會追蹤我嗎？

不會。沒有 Google Analytics，沒有廣告像素，沒有第三方追蹤程式。網站只用一個登入用的 session cookie（必要性 cookie），所以也不需要 cookie 同意橫幅。伺服器日誌會記 IP、時間與路徑，用來限流與查資安問題，最多保留 90 天。

## 資料放在哪裡？

新加坡。主機與 PostgreSQL 資料庫在 Railway 的新加坡機房，每日備份也在同一區域。這在法律上屬於個人資料的國際傳輸，我們以契約與加密控管；若主管機關依個資法第 21 條限制特定傳輸，我們會配合調整。

## 什麼時候內容會離開你們的伺服器？

只在你觸發對應功能時，而且只送完成那件事需要的部分：

1. **AI 模型供應商**：如上，用你的 key，送你相關的筆記、規則頁與對話文字。
2. **平台 OpenRouter 帳號（試用）**：體驗期前 10 次 agent 工作若你還沒填 key，會經由我們的 OpenRouter 帳號送到我們選的便宜模型；適用 [OpenRouter 的隱私政策](https://openrouter.ai/privacy)。
3. **書目查詢**：匯入含 DOI／arXiv／PubMed 識別碼的來源時，向 Crossref、arXiv、PubMed（NCBI）的公開 API 查書目，送出的只有識別碼與你貼的網址。
4. **貼網址匯入**：由我們的伺服器代你抓那個網頁，對方看到的是我們的伺服器。
5. **Zotero**：你主動連結後，我們用你的 Zotero API key 讀你指定的文獻庫，依你的設定每小時同步。
6. **Resend**：寄驗證信、重設密碼、訂閱通知這類交易型郵件，送出的是你的電子郵件地址與信件內容。
7. **Paddle（金流商）**：結帳時你直接和 Paddle 互動，信用卡資料由 Paddle 保管，我們只收到訂閱狀態、客戶與訂閱編號、到期日。
8. **法律要求**：依法院命令或主管機關的合法要求提供時，我們會在法律允許的範圍內通知你。

除了上面這些，我們不出售、不出租、不和任何第三方分享你的內容。

## 你們到底存了哪些資料？

| 類別 | 內容 | 從哪裡來 |
|---|---|---|
| 帳號 | 電子郵件、密碼（只存雜湊）、使用者名稱；用 Google 登入則有 Google 帳號識別碼 | 你註冊時提供 |
| 知識庫內容 | 筆記（raw／wiki／schema 三層）、每次儲存的版本快照、圖片附件、匯入的網頁／PDF／Word 轉成的 Markdown | 你或你授權的 agent 建立 |
| 對話與工作紀錄 | 與 agent 的對話、每次自動編纂／對話／健檢的步驟紀錄（呼叫了哪些工具、tokens 數、估算費用、錯誤訊息） | 你使用時產生 |
| 金鑰 | 你選擇儲存的 AI 供應商 API key、Zotero API key，以 AES-256-GCM 加密，介面只顯示末四碼 | 你在設定頁填寫 |
| 存取憑證 | MCP token（只存雜湊）、OAuth 授權紀錄、登入 session | 你連接客戶端時 |
| 訂閱 | 方案、訂閱狀態、Paddle 的客戶與訂閱編號、到期日 | Paddle 以 webhook 通知 |
| 使用計量 | 每月 agent 工作次數、MCP 呼叫次數、筆記數與容量 | 系統自動計算，用於方案上限與防濫用 |
| 技術紀錄 | 伺服器日誌裡的 IP、時間、路徑 | 自動產生 |

用途：提供並維護服務、帳號安全與防濫用、依你的指示執行 AI 編纂與對話、計費與訂閱管理、寄帳號相關通知、法令遵循。（個資法特定目的編號：○六九契約管理、○九○消費者保護、一三五資（通）訊服務、一三六資（通）訊與資料庫管理、一八一其他經營合於營業登記項目或組織章程所定之業務。）

## 會保留多久？

- 每則筆記的**最新版本**在帳號存續期間永久保留；**較舊的版本快照** Pro 與體驗期保留 90 天、Free 保留 7 天，之後自動刪除。
- 對話、工作紀錄、匯入的來源頁、附件：帳號存續期間保留，你隨時可以刪除或封存。
- 金鑰：直到你刪除或替換。
- 伺服器日誌：最多 90 天。

## 刪除帳號會發生什麼？

設定頁最下面有「刪除帳號」。按下去並確認後，工作區裡所有筆記、版本、對話、工作紀錄、附件、金鑰、token 會立刻從主資料庫連鎖刪除；備份裡的副本最多 30 天內失效。Paddle 保有的交易紀錄依它的法定義務保留。刪除前記得先「匯出 zip」把全部筆記與附件帶走（Obsidian 相容）。

## 我有哪些權利？

查詢或閱覽、複製（設定頁匯出 zip）、補充或更正、請求停止蒐集處理利用、刪除（設定頁刪除帳號，或寫信到 ${CONTACT}）。我們在收到請求後 15 日內處理，必要時可延長 15 日。要建立帳號一定得提供電子郵件，不提供就無法註冊。

## 你們怎麼保護資料？

全程 HTTPS；密碼只存雜湊；API key 與 Zotero key 用 AES-256-GCM 加密，加密金鑰和登入簽章金鑰分開保管；MCP token 只存雜湊；所有查詢帶工作區隔離；每 IP、每 token、每人限流；對外抓網頁有 SSRF 防護。真的發生外洩時，我們會在知悉後 72 小時內用電子郵件通知受影響的你，並說明影響與處理方式。

## 未滿 18 歲可以用嗎？

本服務不以未滿 18 歲者為對象。未滿 18 歲請經法定代理人同意後使用；我們知悉未經同意蒐集時會刪除資料。

## 自己架的版本也適用嗎？

不適用。核心程式以 AGPL-3.0 公開在 ${REPO}，自行架設者的資料由自己負責；本政策只適用於我們營運的 wikibrain.app。

## 政策會改嗎？

會，但重大變更會在生效前 14 天用電子郵件與網站公告通知。本政策以中華民國法律為準據法。有任何疑問：${CONTACT}。`,
    en: `Effective ${UPDATED} · version 1.1 · *The Traditional Chinese text is the binding version; this English text is a faithful summary.*

In one sentence: **your notes are yours.** We send content to the AI model you chose only when you press a button, do nothing else with it, do not track you, do not sell data, and deleting your account cascades through everything. The questions below spell out the details and double as the notice required by Taiwan's Personal Data Protection Act.

The service is operated by ${OPERATOR_EN} at wikibrain.app; contact ${CONTACT}.

## Are my notes used to train AI?

No. We train no models and use your content for nothing beyond the product. When you press ingest, chat or lint, the relevant notes go to **the model provider you picked in Settings** (Anthropic, OpenAI or OpenRouter) with your own API key; that leg is governed by the provider's terms. Most providers do not train on API traffic by default, but check the one you chose.

## Who can see my notes?

You, and the clients you authorise (Cursor, Claude Code, Claude.ai, ChatGPT, through MCP tokens or OAuth grants you create). Every query is scoped to your workspace. The operator does not read your content, except the minimum needed when you report a problem and agree, or to handle a security incident or a lawful request.

## Do you track me?

No. No Google Analytics, no ad pixels, no third-party trackers. The site uses one essential login-session cookie, so there is no cookie banner. Server logs record IP, time and path for rate limiting and security investigation, kept at most 90 days.

## Where is my data?

Singapore. Servers and PostgreSQL run in Railway's Singapore region; daily backups stay in the same region. Legally this is an international transfer, controlled by contract and encryption.

## When does content leave your servers?

Only when you trigger a feature, and only what that feature needs: the AI provider you configured (your key); during the trial, the first 10 runs without a key go through our OpenRouter account ([OpenRouter privacy](https://openrouter.ai/privacy)); Crossref, arXiv and PubMed public APIs receive only an identifier when you import a source with a DOI; URL imports are fetched by our server; Zotero is read with your key once you link it; Resend delivers transactional e-mails; Paddle handles checkout and card data, sending us only subscription status and ids; lawful requests, with notice to you where the law allows. Nothing else is sold, rented or shared.

## What exactly do you store?

Account data (e-mail, hashed password, username, Google account id if used); your knowledge base (notes in the raw / wiki / schema layers, version snapshots, image attachments, Markdown converted from imported pages, PDFs and Word files); chat and job logs (tool calls, tokens, estimated cost, errors); API keys you choose to save (AES-256-GCM, only the last four characters shown); MCP tokens (hashed), OAuth grants and sessions; subscription state from Paddle; usage counters; server logs. Purposes: providing the service, account security and abuse prevention, running AI jobs on your instruction, billing, account e-mails, legal compliance.

## How long do you keep it?

The latest version of every note while your account exists; older snapshots 90 days on Pro and trial, 7 days on Free. Chats, job logs, imported sources and attachments until you delete or archive them. Keys until you remove them. Server logs at most 90 days.

## What happens when I delete my account?

Settings → Delete account removes all notes, versions, chats, job logs, attachments, keys and tokens from the primary database immediately; copies in backups expire within 30 days. Paddle keeps transaction records as its legal obligations require. Export a zip first if you want to keep your notes.

## What are my rights?

Access, copy (Settings → Export zip, Obsidian-compatible), correct, restrict, and delete (Settings → Delete account, or e-mail ${CONTACT}). We respond within 15 days, extendable by 15. An e-mail address is required to have an account.

## How is it protected?

HTTPS throughout; hashed passwords; API and Zotero keys encrypted with AES-256-GCM using a key kept separate from the login signing secret; hashed MCP tokens; workspace isolation on every query; per-IP, per-token and per-user rate limits; SSRF protection on outbound fetches. If a breach affects you, we notify you by e-mail within 72 hours of learning about it.

## Under 18?

The service is not directed at people under 18; use it with a legal guardian's consent. We delete data collected without such consent once we learn of it.

## Does this apply to self-hosted copies?

No. The core is open source under AGPL-3.0 at ${REPO}; self-hosters are responsible for their own data. This policy covers only wikibrain.app as operated by us.

## Will this change?

Material changes are announced by e-mail and on the site 14 days before they take effect. Governing law: Taiwan (R.O.C.). Questions: ${CONTACT}.`,
  },
};

export const terms: LegalDoc = {
  slug: 'terms',
  updated: UPDATED,
  title: { 'zh-TW': '服務條款', en: 'Terms of Service' },
  body: {
    'zh-TW': `生效日期：${UPDATED}　版本 1.0

## 1. 契約當事人與適用範圍

本條款規範您與 ${OPERATOR}（「我們」）之間就託管服務 wikibrain.app 的使用。付費方案的賣方（Merchant of Record）為 Paddle.com Market Ltd（「Paddle」），您購買訂閱時同時受 [Paddle 的買方條款](https://www.paddle.com/legal/checkout-buyer-terms)約束；發票與收據由 Paddle 開立。註冊即表示您同意本條款與[隱私權政策](/privacy)。

## 2. 服務內容

託管 Markdown 知識庫（raw／wiki／schema 三層）、MCP server（供 Cursor、Claude 等客戶端以 token 或 OAuth 連接）、網頁介面、來源匯入、書目與 Zotero 同步、伺服器端 AI agent（自動編纂、對話、健檢）、匯出。功能可能增修；重大縮減會提前 30 天通知。

## 3. 帳號

您須提供正確的電子郵件並妥善保管密碼、MCP token、OAuth 授權；經您憑證發出的操作視為您本人所為。一人一帳號；發現濫用時我們可暫停或終止帳號。年齡限制見隱私權政策第 10 條。

## 4. 您的內容與授權

您保有對筆記、附件、對話等內容的全部權利。您授予我們為提供服務所必要的非專屬授權（儲存、備份、索引、依您指示傳送給您選擇的第三方）。我們不會用您的內容訓練模型，也不會用於行銷。您保證您的內容不侵害他人權利，並對匯入之來源負著作權責任（匯入功能為個人研究之用，請遵守來源網站條款）。

## 5. AI 功能與自帶金鑰（BYOK）聲明

1. AI 功能需您在設定頁提供自己的 API key 並選擇供應商與模型；**模型費用由該供應商直接向您收取，不含在本服務訂閱費內**。統計頁的費用是依公開價目的估算，實際帳單以供應商為準。
2. agent 產出可能有錯誤或遺漏；由 agent 寫入的頁面請自行審核。我們不對模型輸出的正確性負責。
3. 您的 key 加密儲存，但您應自行在供應商端設定用量上限並在懷疑洩露時撤銷。若我們的系統發生事故導致 key 外洩，我們將依隱私權政策通知並協助您撤銷。
4. 試用期前 10 次免 key 的工作使用我們的 OpenRouter 帳號與我們選定的模型，不保證模型品質。

## 6. 方案、費用與試用

- 註冊起 14 天 Pro 體驗，不需信用卡，到期自動轉為 Free，不會自動扣款。
- Free：永久免費，受筆記數、容量、每月 agent 工作次數、版本保留天數等限制（限制數字以說明頁「方案與計價」為準）。到達上限時服務轉唯讀，不刪除資料。
- Pro：每月 6 美元或每年 60 美元（含稅價由金流商依您所在地計算並顯示），自動續約，可隨時於「管理訂閱」取消，取消於當期結束生效，已付費期間不按比例退還（法定退款除外）。結帳與付款資料由 Paddle 處理，我們不會取得您的信用卡資料。
- 價格變動會在下一個計費週期至少 30 天前通知。

## 7. 退款與解除權

本服務屬「一經提供即為完成之線上服務」，您勾選同意立即開始服務後，消費者保護法第 19 條的七日解除權依「通訊交易解除權合理例外情事適用準則」第 2 條第 5 款不適用。惟我們承諾：**首次付費 14 天內**寄信至 ${CONTACT} 或透過金流商請求，可全額退款；其後的退款依金流商政策個案處理。退款由金流商執行，退回原付款方式。

## 8. 可接受使用

禁止：攻擊或探測系統、規避速率與方案限制、以服務散布違法或侵權內容、將帳號或 token 轉售、用匯入功能大量抓取第三方網站、對我們的伺服器端 agent 進行提示注入以取得他人資料。違反者我們得警告、限流、暫停或終止，情節重大者不退費。

## 9. 服務水準與變更

Free 與 Pro 均無 SLA 承諾；我們以合理努力維持可用性，計畫性維護會提前公告。資料每日備份；我們建議您定期匯出 zip 自存副本（產品設計上您隨時可完整帶走資料）。

## 10. 終止

您可隨時刪除帳號（效果見隱私權政策第 6 條）。我們若停止提供託管服務，將提前至少 60 天通知並保留匯出功能至停止日。因您違約而終止時，我們仍會提供 14 天匯出窗口，除非法律禁止。

## 11. 免責與責任上限

服務依「現狀」提供，不擔保無中斷或無錯誤。在法律允許範圍內，我們對間接損失、資料損失、利潤損失不負責；任何情況下我們的總責任以您在請求前 12 個月支付給我們的費用為上限（Free 用戶為 0）。本條不排除故意或重大過失責任及消保法不得預先排除之責任。

## 12. 開源與商標

核心程式以 AGPL-3.0 授權公開於 ${REPO}，您可依該授權自架；AGPL 規範程式碼，本條款規範我們的託管服務，兩者獨立。「WikiBrain」名稱與標誌為我們所有，自架版本不得使用我們的名稱與標誌對外提供服務。

## 13. 準據法與管轄

本條款以中華民國法律為準據法。因本條款涉訟時，雙方合意以台灣台北地方法院為第一審管轄法院；消費者依消保法得向其住居所地法院起訴之權利不受影響。

## 14. 其他

條款變更會在生效前 14 天通知，變更後繼續使用視為同意。若部分條款無效，其餘仍有效。中文版為準，英文版僅供參考。聯絡：${CONTACT}。`,
    en: `Effective ${UPDATED} · version 1.0 · *The Traditional Chinese text is the binding version; this English text is a faithful summary.*

## 1. Parties and scope

These terms govern your use of the hosted service at wikibrain.app, operated by ${OPERATOR_EN}. The seller of record for paid plans is Paddle.com Market Ltd ("Paddle"); [Paddle's buyer terms](https://www.paddle.com/legal/checkout-buyer-terms) also apply and Paddle issues the invoices. Registering means you accept these terms and the [privacy policy](/privacy).

## 2. The service

A hosted Markdown knowledge base (raw / wiki / schema layers), an MCP server for clients such as Cursor and Claude (token or OAuth), a web UI, source import, bibliography and Zotero sync, server-side AI agents (ingest, query, lint) and export. Features may change; material reductions are announced 30 days ahead.

## 3. Accounts

Keep your password, MCP tokens and OAuth grants safe; actions taken with your credentials count as yours. One account per person; abuse may lead to suspension or termination. Age limits are in the privacy policy, section 10.

## 4. Your content

You keep all rights to your notes, attachments and chats and grant us only the licence needed to store, back up, index and transmit them on your instruction. We do not train models on your content or use it for marketing. You are responsible for the copyright of what you import (the import feature is for personal research; respect the source site's terms).

## 5. AI features and bring-your-own-key

AI features run on a provider you configure with your own API key; **model fees are billed to you by that provider and are not part of our subscription**. Cost figures in the app are estimates. Agent output may contain errors; review what it writes. Keys are stored encrypted, but set spending limits at your provider and revoke a key you suspect is exposed; if an incident on our side exposes keys we will notify you and help you revoke them. The first 10 trial runs without a key use our OpenRouter account and a model of our choosing, with no quality guarantee.

## 6. Plans, fees and trial

14-day Pro trial from sign-up, no card, then Free automatically with no charge. Free is permanently free with limits on notes, storage, monthly agent runs and version retention (numbers on the help page); at a limit the service becomes read-only and nothing is deleted. Pro is USD 6 per month or 60 per year (tax shown at checkout), renews automatically, can be cancelled any time effective at period end, no pro-rata refunds beyond what the law requires. Checkout and payment data are handled by Paddle; we never see your card details. Price changes are announced at least 30 days before the next billing cycle.

## 7. Refunds and withdrawal

Because the service starts immediately with your consent, the statutory 7-day withdrawal right for distance contracts does not apply; nevertheless we refund in full on request within 14 days of your first payment (e-mail ${CONTACT} or ask the payment processor). Later refunds follow the processor's policy.

## 8. Acceptable use

No attacking or probing the system, circumventing rate or plan limits, distributing illegal or infringing content, reselling accounts or tokens, mass-scraping third-party sites through the importer, or prompt-injecting the server-side agent to reach other people's data. We may warn, throttle, suspend or terminate; serious cases are not refunded.

## 9. Service level and changes

No SLA on Free or Pro; we make reasonable efforts to keep the service up and announce planned maintenance. Data is backed up daily; we recommend exporting a zip regularly.

## 10. Termination

You can delete your account at any time (effects in the privacy policy, section 6). If we discontinue the hosted service we give at least 60 days' notice and keep export available until the end. On termination for breach we still provide a 14-day export window unless the law forbids it.

## 11. Disclaimer and liability cap

The service is provided "as is". To the extent the law allows, we are not liable for indirect losses, data loss or lost profits, and our total liability is capped at the fees you paid in the 12 months before the claim (zero for Free users). This does not exclude liability for intent, gross negligence or anything consumer law does not allow us to exclude.

## 12. Open source and trademark

The core is licensed AGPL-3.0 at ${REPO}; the licence covers the code, these terms cover our hosted service. The "WikiBrain" name and logo are ours; self-hosted instances may not offer a service under our name.

## 13. Governing law

Taiwan (R.O.C.) law; disputes go to the Taipei District Court, without limiting consumers' statutory right to sue where they live.

## 14. Other

Changes are announced 14 days before they take effect; continued use is acceptance. If a clause is invalid the rest stands. Chinese prevails; this English text is for reference. Contact ${CONTACT}.`,
  },
};

export const legalDocs: LegalDoc[] = [privacy, terms];
