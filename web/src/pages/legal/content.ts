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
    'zh-TW': `生效日期：${UPDATED}　版本 1.0

## 1. 我們是誰

本服務由 ${OPERATOR} 提供，網址 wikibrain.app，聯絡信箱 ${CONTACT}。

## 2. 我們蒐集哪些資料

| 類別 | 內容 | 來源 |
|---|---|---|
| 帳號 | 電子郵件、密碼（雜湊）、顯示名稱；若用 Google 登入則有 Google 帳號識別碼 | 您註冊時提供 |
| 知識庫內容 | 筆記（raw／wiki／schema 三層）、每次儲存的版本快照、圖片附件、您匯入的網頁／PDF／Word 轉出的 Markdown | 您或您授權的 agent 建立 |
| 對話與工作紀錄 | 與 agent 的對話內容、每次自動編纂／對話／健檢工作的步驟紀錄（呼叫了哪些工具、tokens 數、估算費用、錯誤訊息） | 您使用對話或自動編纂時產生 |
| 金鑰 | 您選擇儲存的 AI 供應商 API key、Zotero API key，以 AES-256-GCM 加密後儲存，介面只顯示末四碼 | 您在設定頁填寫 |
| 存取憑證 | MCP token（只存雜湊）、OAuth 授權紀錄、登入 session | 您連接 Cursor、Claude 等客戶端時 |
| 訂閱 | 方案、訂閱狀態、金流商的客戶與訂閱編號、到期日（付費方案開放後） | 金流商以 webhook 通知；信用卡資料由金流商保管，我們不會取得 |
| 使用計量 | 每月 agent 工作次數、MCP 呼叫次數、筆記數與容量 | 系統自動計算，用於方案限制與防濫用 |
| 技術紀錄 | 伺服器存取日誌中的 IP、時間、路徑，用於速率限制與資安調查 | 自動產生 |

我們**不使用**任何分析、廣告或行為追蹤工具，不植入第三方追蹤程式。

## 3. 蒐集目的與法律依據

提供並維護服務（契約履行）、帳號安全與防濫用、依您的指示執行 AI 編纂與對話、計費與訂閱管理、寄送帳號相關通知（驗證信、重設密碼、訂閱異動）、法令遵循。目的編號參考：○六九契約管理、○九○消費者保護、一三五資（通）訊服務、一三六資（通）訊與資料庫管理、一八一其他經營合於營業登記項目或組織章程所定之業務。

## 4. 資料存放地與國際傳輸

資料儲存於**新加坡**的雲端主機（Railway）及其 PostgreSQL 資料庫；每日備份亦在同一區域。這構成個人資料的國際傳輸，我們以契約與加密控管；若主管機關依個資法第 21 條限制特定傳輸，我們將配合調整。

## 5. 哪些資料會離開我們的伺服器

只在您觸發對應功能時傳送，且以完成該功能為限：

1. **AI 模型供應商**（Anthropic、OpenAI、OpenRouter，依您在設定頁的選擇）：自動編纂、對話、健檢時，您的相關筆記內容、規則頁、對話文字會送到您指定的供應商，使用您自己的 API key；費用由該供應商直接向您收取，資料處理受該供應商條款規範。
2. **平台 OpenRouter 帳號（試用）**：試用期內前 5 次 agent 工作若您尚未填 key，會經由我們的 OpenRouter 帳號送到我們選定的模型；[OpenRouter 的隱私政策](https://openrouter.ai/privacy)適用。
3. **書目查詢**：匯入含 DOI／arXiv／PubMed 識別碼的來源時，我們會向 Crossref、arXiv、PubMed（NCBI）的公開 API 查詢書目，送出的只有該識別碼與您貼的網址。
4. **Zotero**：您主動連結後，我們用您的 Zotero API key 讀取您指定的文獻庫，並依您設定每小時同步。
5. **Resend**：寄送驗證、重設密碼、訂閱通知等交易型郵件，送出的是您的電子郵件與信件內容。
6. **金流商**：付費方案開放後，結帳時您直接與金流商互動，我們只收到訂閱狀態與識別碼。
7. **法律要求**：依法院命令或主管機關合法要求提供，我們會在法律允許範圍內通知您。

除上述外，我們不出售、不出租、不與任何第三方分享您的內容。

## 6. 保存期間

- 每則筆記的**最新版本**在您帳號存續期間永久保留；**較舊的版本快照**在 Pro 與體驗期保留 90 天、Free 保留 7 天，之後自動刪除。
- 對話紀錄、工作紀錄、匯入的來源頁、附件：帳號存續期間保留，您可自行刪除或封存。
- 金鑰：直到您刪除或替換。
- 伺服器技術日誌：最多 90 天。
- **刪除帳號**：您在設定頁刪除帳號後，工作區內所有筆記、版本、對話、工作紀錄、附件、金鑰、token 立即從主資料庫連鎖刪除；備份中的副本最多 30 天內失效。金流商保有的交易紀錄依其法定義務保留。

## 7. 您的權利

您可隨時：查詢或請求閱覽、複製（設定頁「匯出 zip」可下載全部筆記與附件，Obsidian 相容）、補充或更正、請求停止蒐集處理利用、刪除（設定頁刪除帳號，或寄信至 ${CONTACT}）。我們於收到請求後 15 日內處理（可延長 15 日）。若您不提供必要資料（電子郵件），將無法建立帳號。

## 8. Cookie

我們只使用一個登入 session cookie（必要性 cookie），沒有廣告或分析 cookie，因此不顯示 cookie 同意橫幅。

## 9. 資料安全

傳輸全程 HTTPS；密碼以雜湊儲存；API key 與 Zotero key 以 AES-256-GCM 加密，加密金鑰與登入簽章金鑰分開保管；MCP token 只存雜湊；所有查詢帶工作區隔離；每 IP、每 token、每人限流；對外連線有 SSRF 防護。若發生個資外洩，我們會在知悉後 72 小時內以電子郵件通知受影響的您，並說明影響與因應措施。

## 10. 年齡

本服務不以未滿 18 歲者為對象。未滿 18 歲者請由法定代理人同意後使用；我們知悉未經同意蒐集時將刪除資料。

## 11. 開源版本

本服務的核心程式以 AGPL-3.0 授權公開於 ${REPO}。自行架設者的資料由其自行負責，本政策只適用於我們營運的託管服務 wikibrain.app。

## 12. 變更與聯絡

重大變更會在生效前 14 天以電子郵件與網站公告通知。聯絡：${CONTACT}。本政策以中華民國法律為準據法。`,
    en: `Effective ${UPDATED} · version 1.0 · *The Traditional Chinese text is the binding version; this English text is a faithful summary.*

## 1. Who we are

The service is operated by ${OPERATOR_EN} at wikibrain.app; contact ${CONTACT}. We are the data controller under Taiwan's Personal Data Protection Act.

## 2. What we store

Account data (e-mail, hashed password, display name, Google account id if you sign in with Google); your knowledge base (notes in the raw / wiki / schema layers, version snapshots, image attachments, Markdown converted from pages, PDFs and Word files you import); chat transcripts with the agent and per-job logs (tools called, tokens, estimated cost, errors); API keys you choose to save (AI providers, Zotero), stored encrypted with AES-256-GCM and shown only by their last four characters; access credentials (MCP tokens stored as hashes, OAuth grants, login sessions); subscription state once paid plans open (card details stay with the payment processor); usage counters; and server access logs (IP, time, path) for rate limiting and security. We run **no analytics, advertising or tracking**.

## 3. Why

To provide and maintain the service, keep accounts secure, run AI ingest / query / lint on your instruction, manage billing, send account e-mails (verification, password reset, subscription changes) and comply with the law.

## 4. Where

Servers and database are in **Singapore** (Railway, PostgreSQL); daily backups stay in the same region.

## 5. What leaves our servers, and only when you trigger it

Your notes, rules and chat text go to the **AI provider you configured with your own key** (Anthropic, OpenAI or OpenRouter); during the trial, the first 5 runs without a key go through our OpenRouter account ([OpenRouter privacy](https://openrouter.ai/privacy)). Importing a paper sends the DOI / arXiv / PubMed id or the URL you pasted to Crossref, arXiv or PubMed. If you link Zotero we read the library you chose with your key, hourly. Account e-mails are delivered by Resend. Once paid plans open, checkout happens with the payment processor and we receive only subscription status and ids. We may disclose data when legally required and will tell you where the law allows. We never sell, rent or share your content otherwise.

## 6. Retention

The latest version of every note is kept while your account exists; older snapshots are kept 90 days on Pro and trial, 7 days on Free. Chats, job logs, imported sources and attachments stay until you delete or archive them. Server logs are kept at most 90 days. **Deleting your account** removes all notes, versions, chats, jobs, attachments, keys and tokens from the main database immediately; copies in backups expire within 30 days.

## 7. Your rights

Access, copy (Settings → Export zip gives you everything, Obsidian-compatible), correct, restrict, and delete (Settings → Delete account, or e-mail ${CONTACT}). We respond within 15 days (extendable by 15). An e-mail address is required to have an account.

## 8. Cookies

Only one essential login-session cookie; no advertising or analytics cookies, hence no cookie banner.

## 9. Security

HTTPS everywhere; hashed passwords; API keys encrypted with a key kept separate from the session-signing secret; MCP tokens stored as hashes; workspace isolation on every query; per-IP, per-token and per-user rate limits; SSRF protection on outbound requests. If a breach affects you we notify you by e-mail within 72 hours of learning of it.

## 10. Age

The service is not directed at people under 18; minors need a legal guardian's consent.

## 11. Open source

The core is published under AGPL-3.0 at ${REPO}. Self-hosters are responsible for their own data; this policy covers only the hosted service at wikibrain.app.

## 12. Changes and contact

Material changes are announced by e-mail and on the site 14 days before they take effect. Contact ${CONTACT}. Governing law: Taiwan (R.O.C.).`,
  },
};

export const terms: LegalDoc = {
  slug: 'terms',
  updated: UPDATED,
  title: { 'zh-TW': '服務條款', en: 'Terms of Service' },
  body: {
    'zh-TW': `生效日期：${UPDATED}　版本 1.0

## 1. 契約當事人與適用範圍

本條款規範您與 ${OPERATOR}（「我們」）之間就託管服務 wikibrain.app 的使用。付費方案開放後，賣方（Merchant of Record）為我們委託的金流商，您購買訂閱時同時受其買方條款約束，我們會在定價頁載明。註冊即表示您同意本條款與[隱私權政策](/privacy)。

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
4. 試用期前 5 次免 key 的工作使用我們的 OpenRouter 帳號與我們選定的模型，不保證模型品質。

## 6. 方案、費用與試用

- 註冊起 14 天 Pro 體驗，不需信用卡，到期自動轉為 Free，不會自動扣款。
- Free：永久免費，受筆記數、容量、每月 agent 工作次數、版本保留天數等限制（限制數字以說明頁「方案與計價」為準）。到達上限時服務轉唯讀，不刪除資料。
- Pro：每月 6 美元或每年 60 美元（含稅價由金流商依您所在地計算並顯示），自動續約，可隨時於「管理訂閱」取消，取消於當期結束生效，已付費期間不按比例退還（法定退款除外）。**付費方案開放前，Pro 由我們手動開通，不收費。**
- 早鳥價限前 100 位且有公開截止日，續約沿用早鳥價直到取消。
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

These terms govern your use of the hosted service at wikibrain.app, operated by ${OPERATOR_EN}. Once paid plans open, the seller of record is our payment processor and its buyer terms also apply; the pricing page will say so. Registering means you accept these terms and the [privacy policy](/privacy).

## 2. The service

A hosted Markdown knowledge base (raw / wiki / schema layers), an MCP server for clients such as Cursor and Claude (token or OAuth), a web UI, source import, bibliography and Zotero sync, server-side AI agents (ingest, query, lint) and export. Features may change; material reductions are announced 30 days ahead.

## 3. Accounts

Keep your password, MCP tokens and OAuth grants safe; actions taken with your credentials count as yours. One account per person; abuse may lead to suspension or termination. Age limits are in the privacy policy, section 10.

## 4. Your content

You keep all rights to your notes, attachments and chats and grant us only the licence needed to store, back up, index and transmit them on your instruction. We do not train models on your content or use it for marketing. You are responsible for the copyright of what you import (the import feature is for personal research; respect the source site's terms).

## 5. AI features and bring-your-own-key

AI features run on a provider you configure with your own API key; **model fees are billed to you by that provider and are not part of our subscription**. Cost figures in the app are estimates. Agent output may contain errors; review what it writes. Keys are stored encrypted, but set spending limits at your provider and revoke a key you suspect is exposed; if an incident on our side exposes keys we will notify you and help you revoke them. The first 5 trial runs without a key use our OpenRouter account and a model of our choosing, with no quality guarantee.

## 6. Plans, fees and trial

14-day Pro trial from sign-up, no card, then Free automatically with no charge. Free is permanently free with limits on notes, storage, monthly agent runs and version retention (numbers on the help page); at a limit the service becomes read-only and nothing is deleted. Pro is USD 6 per month or 60 per year (tax shown at checkout), renews automatically, can be cancelled any time effective at period end, no pro-rata refunds beyond what the law requires. **Until paid plans open, Pro is enabled manually and free of charge.** Early-bird pricing is limited to the first 100 subscribers with a public end date. Price changes are announced at least 30 days before the next billing cycle.

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
