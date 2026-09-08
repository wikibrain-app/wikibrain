import { Link } from 'react-router';
import { useT, type Lang } from '../i18n';
import { Brand, btnGhost, btnPrimary } from '../components/ui';
import { LangSwitch } from '../components/LangSwitch';
import { helpAsset } from './help/common';
import { Version } from '../components/Version';
import { CONTACT_EMAIL, SOURCE_URL } from '../components/Footer';

// Public landing page for signed-out visitors (prerendered by scripts/prerender-help.tsx for crawlers).
// Copy lives here (not in the i18n dictionaries) so marketing text can change without touching the app strings.
const copy: Record<Lang, {
  eyebrow: string; h1: string; lede: string; cta: string; login: string; help: string;
  props: { title: string; body: string }[];
  howTitle: string; how: { title: string; body: string }[];
  audienceTitle: string; audience: { title: string; body: string }[];
  plansTitle: string; plans: { name: string; price: string; body: string }[]; plansNote: string;
  agentsTitle: string; agentsBody: string; agentsCaptions: [string, string];
  graphTitle: string; graphBody: string; heroCaption: string;
  openTitle: string; openBody: string; footer: string;
}> = {
  'zh-TW': {
    eyebrow: 'Karpathy「LLM Wiki」模式的託管實作',
    h1: '把來源丟進去，AI 替你編成一座會複利的 wiki',
    lede: '你策展文章、論文與 PDF；AI agent 讀完、寫成互相連結的 Markdown 頁、更新目錄與紀錄。Cursor、Claude、ChatGPT 透過 MCP 讀寫同一座 wiki，知識不再散在對話裡。',
    cta: '免費開始（14 天 Pro 體驗，不用信用卡）', login: '登入', help: '看說明',
    props: [
      { title: '編纂，不是檢索', body: '不是把筆記放上雲端給 AI 撈片段；來源一進來就被讀完、摘要、交叉引用、標記矛盾。每問一次都站在已經整理好的知識上。' },
      { title: '任何 agent 都能讀寫', body: '內建 MCP server：Cursor 與 Claude Code 貼一把 token，Claude.ai 與 ChatGPT 走 OAuth 登入授權。網頁上也能用自己的 API key 一鍵編纂。' },
      { title: '為研究者做深', body: '書目自動補齊（DOI、Crossref、arXiv、PubMed）、BibTeX 與 CSL-JSON 進出、[@citekey] 引用自動長參考文獻、Zotero 同步。' },
    ],
    howTitle: '怎麼運作', how: [
      { title: '1. 丟來源', body: '貼網址、上傳 PDF 或 Word、貼文字、匯入 .bib 或連 Zotero。來源進 raw/，標為待編纂。' },
      { title: '2. 讓 agent 編纂', body: '在網頁按一下，或在 Cursor 貼提示詞。agent 先讀 schema/ 的規則，再寫摘要頁、更新相關頁、index.md 與 log.md。想參與就先討論再編纂。' },
      { title: '3. 問、查、健檢', body: '對話面板附引用回答，好答案存成 wiki 頁；健檢找孤兒頁、斷連結與矛盾。圖譜、資料表、版本歷史隨時看。' },
    ],
    audienceTitle: '適合誰', audience: [
      { title: '研究者', body: '數週到數月的文獻深讀，累積成有引用的綜述草稿。' },
      { title: '知識工作者', body: '會議紀錄、決策、專案文件進來就被整理，團隊不用再翻對話。' },
      { title: 'Cursor 與 Claude 的重度用戶', body: '跨專案、跨對話的持久記憶，而且是一座你打得開、隨時能匯出的 Markdown 庫。' },
    ],
    plansTitle: '方案', plans: [
      { name: 'Pro 體驗', price: '14 天免費', body: '不用信用卡。全部功能，agent 工作不限；前 10 次連 API key 都不用。' },
      { name: 'Free', price: '永久免費', body: '200 則筆記、每月 20 次 agent 工作、自帶 API key。' },
      { name: 'Pro', price: 'US$6／月 或 60／年', body: '10,000 則、1 GB、agent 工作不限、多把 token、90 天版本歷史。' },
    ],
    plansNote: '模型費用不包含在內：你用自己的 key，一般用法每月約幾十美分到幾美元；用 Cursor 的人不需要 key。結帳由 Paddle 處理，隨時可取消。',
    agentsTitle: '你已經在用的 agent，直接讀寫這座 wiki', agentsBody: 'Cursor 與 Claude Code 貼一把 token；Claude.ai 與 ChatGPT 用 OAuth 登入即可。同一組六個工具：讀規則、搜尋、閱讀、建立、更新、列資料夾。', agentsCaptions: ['Cursor：agent 透過 MCP 讀三層、寫回 wiki', 'Claude.ai：對話裡直接交代，工具自己呼叫'],
    graphTitle: '知識會長成一張圖', graphBody: '每一頁的 [[連結]] 與 [@引用] 都是圖譜上的一條邊。來源越多，樞紐頁越明顯；時間軸可以回放這座 wiki 是怎麼長出來的。', heroCaption: '20 秒：貼一個網址，wiki 頁出現，再問它一個問題。',
    openTitle: '開源核心，資料在你手上', openBody: '程式碼以 AGPL-3.0 開源，可以用 docker compose 自架；託管版由我們維運。整座 wiki 隨時匯出成 Obsidian 相容的 Markdown zip，書目匯出 .bib。介面繁中與英文，內容語言不限。',
    footer: 'WikiBrain · personal knowledge base · 靈感來自 Andrej Karpathy 的 LLM Wiki 筆記',
  },
  en: {
    eyebrow: "A hosted implementation of Karpathy's “LLM Wiki” pattern",
    h1: 'Drop in your sources. An AI compiles them into a wiki that compounds.',
    lede: 'You curate articles, papers and PDFs; an AI agent reads them, writes interlinked Markdown pages, and keeps the index and log current. Cursor, Claude and ChatGPT read and write the same wiki through MCP, so knowledge stops evaporating in chat threads.',
    cta: 'Start free (14-day Pro trial, no card)', login: 'Sign in', help: 'Read the docs',
    props: [
      { title: 'Compiled, not retrieved', body: 'Not notes in the cloud for an AI to fish chunks from: every source is read, summarised, cross-referenced and checked for contradictions as it arrives. Every question stands on knowledge that is already organised.' },
      { title: 'Any agent can read and write', body: 'Built-in MCP server: Cursor and Claude Code paste a token; Claude.ai and ChatGPT sign in with OAuth. On the web, one click ingests with your own API key.' },
      { title: 'Built for researchers', body: 'Bibliography filled in automatically (DOI, Crossref, arXiv, PubMed), BibTeX and CSL-JSON in and out, [@citekey] citations with an automatic reference list, Zotero sync.' },
    ],
    howTitle: 'How it works', how: [
      { title: '1. Add sources', body: 'Paste a URL, upload a PDF or Word file, paste text, import a .bib, or connect Zotero. Sources land in raw/ as pending.' },
      { title: '2. Let the agent ingest', body: 'One click on the web, or paste the prompt into Cursor. The agent reads the rules in schema/, then writes the summary page and updates related pages, index.md and log.md. Discuss first if you want to steer.' },
      { title: '3. Ask, browse, lint', body: 'The chat panel answers with citations and files good answers as wiki pages; Lint finds orphans, broken links and contradictions. Graph, table view and version history are always there.' },
    ],
    audienceTitle: 'Who it is for', audience: [
      { title: 'Researchers', body: 'Weeks or months of deep reading that accumulate into a cited review draft.' },
      { title: 'Knowledge workers', body: 'Meeting notes, decisions and project documents get organised on arrival, so nobody digs through chat history.' },
      { title: 'Heavy Cursor and Claude users', body: 'Persistent memory across projects and conversations, in a Markdown base you can open and export any time.' },
    ],
    plansTitle: 'Plans', plans: [
      { name: 'Pro trial', price: '14 days free', body: 'No card. Everything, unlimited agent runs; the first 10 runs need no API key at all.' },
      { name: 'Free', price: 'Free forever', body: '200 notes, 20 agent runs a month, bring your own API key.' },
      { name: 'Pro', price: 'US$6 / month or 60 / year', body: '10,000 notes, 1 GB, unlimited agent runs, multiple tokens, 90-day version history.' },
    ],
    plansNote: 'Model costs are not included: you use your own key, typically a few cents to a few dollars a month; Cursor users need no key. Checkout by Paddle; cancel any time.',
    agentsTitle: 'The agents you already use read and write this wiki', agentsBody: 'Cursor and Claude Code paste a token; Claude.ai and ChatGPT sign in with OAuth. The same six tools everywhere: read rules, search, read, create, update, list.', agentsCaptions: ['Cursor: the agent reads the layers over MCP and writes back', 'Claude.ai: just ask in the chat; the tools are called for you'],
    graphTitle: 'Knowledge grows into a graph', graphBody: 'Every [[link]] and [@citation] on a page is an edge. The more sources, the clearer the hub pages; the timeline replays how the wiki grew.', heroCaption: '20 seconds: paste a URL, a wiki page appears, then ask it a question.',
    openTitle: 'Open-source core, your data in your hands', openBody: 'The code is released under AGPL-3.0 and self-hosts with docker compose; the hosted version is run by us. Export the whole wiki any time as an Obsidian-compatible Markdown zip, and the bibliography as .bib. Interface in Traditional Chinese and English; write in any language.',
    footer: "WikiBrain · personal knowledge base · inspired by Andrej Karpathy's LLM Wiki note",
  },
};

export default function Landing() {
  const { lang } = useT();
  const c = copy[lang];
  return (
    <div className="min-h-full bg-porcelain font-sans text-ink" data-testid="landing">
      <header className="mx-auto flex max-w-[1080px] items-center gap-3 px-5 py-4 sb:px-8">
        <Brand tag />
        <span className="ml-auto flex items-center gap-2">
          <LangSwitch />
          <Link to="/help" className={btnGhost}>{c.help}</Link>
          <Link to="/login" className={btnGhost} data-testid="landing-login">{c.login}</Link>
        </span>
      </header>
      <main className="mx-auto max-w-[1080px] px-5 pb-20 sb:px-8">
        <section className="grid items-center gap-8 py-10 sb:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] sb:py-14">
          <div>
          <div className="text-[12px] uppercase tracking-[.08em] text-ink-faint">{c.eyebrow}</div>
          <h1 className="mt-3 max-w-[22ch] font-serif text-[34px] font-bold leading-[1.2] sb:text-[44px]" style={{ textWrap: 'balance' }}>{c.h1}</h1>
          <p className="mt-5 max-w-[60ch] text-[16px] leading-relaxed text-ink-soft">{c.lede}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/register" className={`${btnPrimary} px-5 py-2.5 text-[14px]`} data-testid="landing-cta">{c.cta}</Link>
            <Link to="/help" className="text-[13.5px] text-celadon-deep hover:underline">{c.help} →</Link>
          </div>
          </div>
          <figure className="min-w-0">
            <video autoPlay muted loop playsInline preload="metadata" poster={helpAsset(lang, 'home.png')} src={helpAsset(lang, 'tour.webm')} className="w-full rounded-[12px] border border-line bg-ink shadow-[0_12px_40px_-16px_rgba(34,49,58,.35)]" aria-label={c.heroCaption} />
            <figcaption className="mt-2 text-[12px] text-ink-faint">{c.heroCaption}</figcaption>
          </figure>
        </section>
        <section className="grid gap-4 sb:grid-cols-3">
          {c.props.map(p => <div key={p.title} className="rounded-[12px] border border-line bg-paper p-5"><h2 className="font-serif text-[18px] font-bold">{p.title}</h2><p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{p.body}</p></div>)}
        </section>
        <section className="mt-16">
          <h2 className="font-serif text-[24px] font-bold">{c.howTitle}</h2>
          <ol className="mt-5 grid gap-4 sb:grid-cols-3">
            {c.how.map((s, i) => <li key={s.title} className="overflow-hidden rounded-[12px] border border-line bg-paper"><img src={helpAsset(lang, ['add.png', 'pending.png', 'chat.png'][i])} alt="" loading="lazy" className="aspect-[16/10] w-full border-b border-line object-cover object-top" /><div className="border-l-[3px] border-celadon px-5 py-4"><h3 className="text-[15px] font-semibold">{s.title}</h3><p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{s.body}</p></div></li>)}
          </ol>
        </section>
        <section className="mt-16">
          <h2 className="font-serif text-[24px] font-bold">{c.agentsTitle}</h2>
          <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-ink-soft">{c.agentsBody}</p>
          <div className="mt-5 grid gap-4 sb:grid-cols-2">
            <figure className="min-w-0"><img src={helpAsset(lang, 'cursor-chat.png')} alt={c.agentsCaptions[0]} loading="lazy" className="aspect-[4/3] w-full rounded-[12px] border border-line bg-paper object-cover object-top" /><figcaption className="mt-2 text-[12px] text-ink-faint">{c.agentsCaptions[0]}</figcaption></figure>
            <figure className="min-w-0"><img src="/help/shared/claude-chat.png" alt={c.agentsCaptions[1]} loading="lazy" className="aspect-[4/3] w-full rounded-[12px] border border-line bg-paper object-cover object-top" /><figcaption className="mt-2 text-[12px] text-ink-faint">{c.agentsCaptions[1]}</figcaption></figure>
          </div>
        </section>
        <section className="mt-16 grid items-center gap-8 sb:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div><h2 className="font-serif text-[24px] font-bold">{c.graphTitle}</h2><p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{c.graphBody}</p></div>
          <img src={helpAsset(lang, 'graph.png')} alt={c.graphTitle} loading="lazy" className="w-full rounded-[12px] border border-line bg-paper" />
        </section>
        <section className="mt-16 grid gap-4 sb:grid-cols-3">
          <h2 className="font-serif text-[24px] font-bold sb:col-span-3">{c.audienceTitle}</h2>
          {c.audience.map(a => <div key={a.title}><h3 className="text-[15px] font-semibold text-celadon-deep">{a.title}</h3><p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{a.body}</p></div>)}
        </section>
        <section className="mt-16" id="plans">
          <h2 className="font-serif text-[24px] font-bold">{c.plansTitle}</h2>
          <div className="mt-5 grid gap-4 sb:grid-cols-3">
            {c.plans.map(p => <div key={p.name} className={`rounded-[12px] border bg-paper p-5 ${p.name === 'Pro' ? 'border-celadon' : 'border-line'}`}><div className="text-[13px] uppercase tracking-[.06em] text-ink-faint">{p.name}</div><div className="mt-1 font-serif text-[22px] font-bold">{p.price}</div><p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{p.body}</p></div>)}
          </div>
          <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-ink-faint">{c.plansNote}</p>
        </section>
        <section className="mt-16 rounded-[12px] border border-line bg-paper p-6 sb:p-8">
          <h2 className="font-serif text-[22px] font-bold">{c.openTitle}</h2>
          <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-ink-soft">{c.openBody}</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link to="/register" className={btnPrimary} data-testid="landing-cta-2">{c.cta}</Link><Link to="/help/karpathy" className={btnGhost}>{lang === 'en' ? 'The LLM Wiki pattern' : 'LLM Wiki 模式'}</Link><Link to="/compare" className={btnGhost} data-testid="landing-compare">{lang === 'en' ? 'Compare with NotebookLM, Obsidian, Hjarni' : '和 NotebookLM、Obsidian、Hjarni 比一比'}</Link></div>
        </section>
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-[12px] text-ink-faint">
          <div>
            <div>{c.footer}</div>
            <span className="mt-1 flex flex-wrap gap-x-4"><Link to="/privacy" className="hover:text-celadon-deep hover:underline">{lang === 'en' ? 'Privacy' : '隱私權政策'}</Link><Link to="/terms" className="hover:text-celadon-deep hover:underline">{lang === 'en' ? 'Terms' : '服務條款'}</Link><a href={SOURCE_URL} target="_blank" rel="noreferrer" className="hover:text-celadon-deep hover:underline">GitHub</a><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-celadon-deep hover:underline">{CONTACT_EMAIL}</a></span>
          </div>
          <span className="flex items-center gap-3"><LangSwitch className="text-[11px]" /><Version className="" /></span>
        </footer>
      </main>
    </div>
  );
}
