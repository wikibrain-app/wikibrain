import { Faq, Gallery, Shot, helpAsset, type HelpPage } from './common';
import { Mermaid } from '../../components/Mermaid';

// English help content: same structure, section ids, screenshots and video as the zh-TW version; wording follows Karpathy's original where possible.
// Button and section names must match the UI strings in web/src/i18n exactly.
const GIST = 'https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f';

const ARCH = `flowchart TB
  subgraph C["Clients"]
    direction LR
    B["Browser"]
    CU["Cursor · Claude Code<br/>MCP + token"]
    CL["Claude.ai · ChatGPT<br/>MCP + OAuth 2.1"]
    SC["Scripts · hooks<br/>REST + token"]
  end
  subgraph E["Edge (every request)"]
    G["Security headers · rate limits (per IP / token / user)<br/>Identity: session / token / OAuth"]
  end
  subgraph A["Application (one Node service)"]
    direction LR
    M["MCP server<br/>/mcp, six tools"]
    W["Web API<br/>/api"]
    O["OAuth authorization server"]
  end
  subgraph D["Domain modules"]
    direction LR
    N["Notes<br/>paths · links · versions · pending"]
    R["Agent runner<br/>Ingest / Query / Lint"]
    I["Import · bibliography · Zotero"]
    NG["Outbound connection guard"]
  end
  subgraph ST["Storage and external"]
    direction LR
    P[("PostgreSQL")]
    LLM["Model providers<br/>with your key"]
    X["Crossref · arXiv · PubMed<br/>Zotero · URLs you paste"]
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
  RAW["raw/ source page<br/>immutable, with origin and bibliography"] -->|"pending: no wiki page links back yet"| ING
  SCH["schema/ rules<br/>read before the agent writes"] -.->|"get_instructions"| ING
  SCH -.-> QRY
  SCH -.-> LNT
  subgraph OPS["Three operations (the same six tools)"]
    direction LR
    ING["Ingest"]
    QRY["Query"]
    LNT["Lint"]
  end
  ING -->|"create · update related pages · link back"| PG["wiki/ pages<br/>summaries · concepts · entities …"]
  ING --> IDX["wiki/index.md catalog"]
  ING --> LOG["wiki/log.md journal"]
  IDX -->|"read the catalog first"| QRY
  QRY -->|"file as wiki/queries/"| PG
  PG -->|"sample pages"| LNT
  LNT -->|"fix links · wiki/lint/date.md"| PG
  LNT --> LOG`;

export const faq: { q: string; a: string; href?: string; label?: string }[] = [
  { q: "Pasting a URL says it can't extract the article?", a: "The page most likely has a bot check or needs a login; JavaScript-rendered pages are already retried with the built-in browser. If it still fails, copy the text and use Paste text, or upload a PDF. Paper pages with a DOI keep their bibliography even when the body can't be fetched. Login-only platforms such as Facebook can't be fetched; paste the text instead." },
  { q: "Auto-ingest failed?", a: "The progress panel shows why. The most common cause is the model being rate-limited upstream; the system retries three times automatically. Models on free shared quotas hit this especially often, and switching to a paid model is much more stable. Pages already created are kept." },
  { q: "Which language does the agent write in?", a: "It follows the workspace language (changeable in Settings); schema rules can override it, e.g. \"summaries in English, my comments in Chinese\". Content can be in any language." },
  { q: "Will Cursor and the web fight?", a: "No. When the same page is edited from both sides, the later writer receives the current version and is asked to edit again; the agent knows this rule too." },
  { q: "The agent got it wrong?", a: "See Rules and templates: fix or roll back the page, correct it in chat, or write the rule into schema/.", href: "/help/guide#rules", label: "Rules and templates" },
  { q: "No Cursor and no API key?", a: "The first 10 trial runs are on us; afterwards create an OpenRouter key (a few minutes) or connect through Claude.ai's or ChatGPT's connectors." },
];

export const pages: HelpPage[] = [
  { slug: 'start', title: 'Getting started', lede: 'Five minutes to your first wiki page, and who does the ingesting', sections: [{ id: 'start', title: 'Five-minute start' }, { id: 'ways', title: 'Who ingests: three ways' }, { id: 'connectors', title: 'Connect from Claude.ai or ChatGPT', sub: true }, { id: 'pwa', title: 'Phone: add to home screen', sub: true }], Body: PageStart },
  { slug: 'guide', title: 'User guide', lede: 'The daily loop, rules and templates, and each view', sections: [{ id: 'loop', title: 'The daily loop: three operations' }, { id: 'discuss', title: 'Discuss first, then ingest', sub: true }, { id: 'rules', title: 'Rules and templates' }, { id: 'views', title: 'Views and tools' }, { id: 'api', title: 'REST API' }], Body: PageGuide },
  { slug: 'data', title: 'Data and system', lede: 'Where your data lives, who can see it, how the system works', sections: [{ id: 'data', title: 'Your data and security' }, { id: 'system', title: 'How the system works' }], Body: PageData },
  { slug: 'plans', title: 'Plans and support', lede: 'Pricing, FAQ, contact', sections: [{ id: 'plans', title: 'Plans and pricing' }, { id: 'faq', title: 'FAQ' }, { id: 'contact', title: 'Contact and reporting problems' }], Body: PagePlans },
  { slug: 'karpathy', title: 'The LLM Wiki pattern', lede: 'Where this comes from: Karpathy\'s original note, condensed', sections: [{ id: 'karpathy', title: 'Where this comes from: Karpathy\'s LLM Wiki' }], Body: PageKarpathy },
];

function PageStart() {
  return (
    <>
      <p className="font-sans text-[13.5px] text-ink-soft">WikiBrain is a personal knowledge base in the cloud: you drop in articles, papers and PDFs, and an AI reads them, writes interlinked wiki pages, and keeps the index and the log up to date. You find sources, ask questions and judge; the bookkeeping is the AI's job. The approach comes from Andrej Karpathy's "LLM Wiki" (<a className="text-celadon-deep underline" href={GIST} target="_blank" rel="noreferrer">original</a>), condensed on the <a className="text-celadon-deep underline" href="/help/karpathy">LLM Wiki pattern</a> page.</p>
      <figure className="my-5 font-sans">
        <video controls preload="metadata" playsInline poster={helpAsset('en', 'home.png')} className="w-full rounded-[10px] border border-line bg-ink shadow-sm" src={helpAsset('en', 'tour.webm')} aria-label="WikiBrain 20-second tour" data-testid="help-video" />
        <figcaption className="mt-1.5 text-[12px] text-ink-soft">A 20-second tour: from pasting a URL to a wiki page appearing, then asking it a question.</figcaption>
      </figure>
      <h2 id="start">Five-minute start</h2>
      <ol>
        <li>After signing up, pick a template (choose General if unsure). It creates the schema/ rules, wiki/index.md and wiki/log.md.</li>
        <li>Press ＋ Add in the top bar → Paste URL and paste a link, or Upload file and drop a PDF. It lands in raw/ and the page shows the banner "This source has not been filed into the wiki yet (pending Ingest)".</li>
        <li>Press Auto-ingest this source in the banner. The first 10 runs of the trial need no key at all.</li>
        <li>Wait for the progress panel (usually 30 to 90 seconds). The left pane gains a summary page under wiki/, and index.md and log.md are updated. Read it and check the key points.</li>
        <li>Press Chat in the top bar and ask something, e.g. "what is the main argument of this paper?". The answer cites page paths.</li>
        <li>After the tenth run, decide who ingests: see "Who ingests" below.</li>
      </ol>
      <Gallery>
        <Shot src="pending.png" alt="Pending-ingest banner" caption="The banner on a raw/ source: Auto-ingest this source, all N, Discuss first, Copy prompt." />
        <Shot src="home.png" alt="Three-pane main screen" caption="After ingesting: the three-layer tree, the wiki page, backlinks and versions." />
      </Gallery>
      <h2 id="ways">Who ingests: three ways, pick one or combine</h2>
      <p>The agent needs a model to run on. All three ways produce identical pages; the Settings section "Connect an agent" is about exactly this. Neither yet? The first 10 trial runs are on us; decide afterwards.</p>
      <div className="not-prose my-4 grid gap-3 font-sans text-[13px] sb:grid-cols-3">
        <div className="rounded-[10px] border border-line bg-paper p-4"><div className="mb-1 font-semibold text-celadon-deep">Cursor, Claude Code</div><div className="text-ink-soft">Settings → Connect Cursor (3 steps) creates an MCP token for mcp.json. No API key; the cost is part of your tool’s plan. On a source page press Copy prompt for Cursor and paste it into the chat.</div></div>
        <div className="rounded-[10px] border border-line bg-paper p-4"><div className="mb-1 font-semibold text-celadon-deep">Claude.ai, ChatGPT</div><div className="text-ink-soft">No token: paste the MCP URL <code>https://wikibrain.app/mcp</code> into its connector settings, sign in and press Allow. Steps below.</div></div>
        <div className="rounded-[10px] border border-line bg-paper p-4"><div className="mb-1 font-semibold text-celadon-deep">Browser only (your own API key)</div><div className="text-ink-soft">Enter a Claude API, OpenAI or OpenRouter key under Settings → AI provider, then press Auto-ingest on a source page; works from a phone. Billed by your provider, a few cents per run on a flash-class model.</div></div>
      </div>
      <Gallery>
        <Shot src="cursor-chat.png" alt="Cursor reading and writing through MCP" caption="Cursor: the agent calls list_folder and read_note over MCP and writes back to wiki/." />
        <Shot src="ai.png" alt="AI provider settings" caption="Your own key: choose a provider, pick a model, enter the key." />
      </Gallery>
      <h3 id="connectors">Connect from Claude.ai or ChatGPT (connectors)</h3>
      <ol>
        <li><b>Claude.ai</b>: sidebar Customize → Connectors → Add (top right) → Custom connector → name it WikiBrain, paste <code>https://wikibrain.app/mcp</code> → Add. The first time you are sent to WikiBrain’s sign-in and consent page; press Allow. The connector settings then list the six tools (get_instructions, search_notes, read_note, create_note, update_note, list_folder); just ask in plain language in a chat.</li>
        <li><b>ChatGPT</b>: Settings → Connectors → Advanced / Developer mode → Create → paste the same URL as the server URL, choose OAuth → Create. Custom MCP is available on some plans only.</li>
        <li>Once connected: “read get_instructions, then ingest raw/sources/xxx.md into the wiki” or “search the wiki for X and write it up as one page”.</li>
      </ol>
      <Gallery>
        <Shot src="claude-add.png" alt="Claude.ai add custom connector" caption="Claude.ai: Customize → Connectors → Add → Custom connector, paste the MCP URL." shared />
        <Shot src="claude-consent.png" alt="WikiBrain consent page" caption="First connection: sign in to WikiBrain and press Allow." shared />
        <Shot src="claude-tools.png" alt="The six tools in Claude.ai" caption="The six tools in the connector settings, each with its own permission." shared />
        <Shot src="claude-chat.png" alt="Using WikiBrain in a Claude.ai chat" caption="Ask in the chat; the agent calls the tools to read and write this wiki." shared />
      </Gallery>
      <p>Authorised connections appear in the Settings → Connect an agent table (marked OAuth) and can be revoked at any time; access tokens expire after 24 hours and clients renew for 90 days. The same MCP token also works as an API key for the REST API, see the <a className="text-celadon-deep underline" href="/help/guide#api">guide</a>.</p>
      <h3 id="pwa">Phone: add to home screen</h3>
      <p>WikiBrain is an installable web app (PWA); there is nothing to download from a store. iPhone: open wikibrain.app in Safari → Share → Add to Home Screen. Android: Chrome menu → Install app or Add to Home screen. It then opens full-screen with its own icon. When the connection drops you get an offline page; reading the whole knowledge base offline and offline quick notes belong to the next milestone (device copy).</p>
    </>
  );
}

function PageGuide() {
  return (
    <>
      <h2 id="loop">The daily loop: three operations</h2>
      <p>Karpathy reduces the daily life of a knowledge base to three operations, and the interface follows them:</p>
      <ul>
        <li><b>Ingest.</b> After a source lands in raw/, the agent reads it, writes a summary page, updates related pages and index.md, and appends to log.md. One source can touch a dozen pages. "Pending" means a raw/ source that no wiki page links back to yet; the banner, the Lint page and Stats all list them.</li>
        <li><b>Query.</b> Chat in the top bar opens the right-hand panel. The agent reads index.md first to find relevant pages, then reads them and answers with page paths as citations; answers can be tables, Mermaid diagrams or Marp slides. Press Save as wiki page on a valuable answer and it becomes a page under wiki/queries/, so explorations stay in the knowledge base. At 1280 px the chat panel temporarily replaces the right rail.</li>
        <li><b>Lint.</b> Lint in the top bar. First the deterministic checks: orphans, broken links, pages missing from the index, pending sources, log format, missing index.md or log.md; then Run a deep lint with the agent finds contradictions, stale claims and concepts that deserve their own page, and writes wiki/lint/date.md. The deterministic checks do not count as agent runs.</li>
      </ul>
      <Shot src="chat.png" alt="Chat panel" caption="The Query panel: answers cite page paths and show the tool trace; Save as wiki page files the answer." />

      <h3 id="discuss">Discuss first, then ingest (Karpathy's preferred flow)</h3>
      <p>Karpathy says he prefers one source at a time with himself in the loop: the agent summarises, they discuss what to emphasise, and only then does it write. WikiBrain turns that into four steps:</p>
      <ol>
        <li>Open a pending source and press <b>Discuss first, then ingest</b> in the banner. The chat panel opens with a prepared prompt asking the agent to read the source, list the key points, explain how it relates to existing wiki pages, and propose how to file it.</li>
        <li>Press Send. The agent reads the source and index.md and replies. Steer it: "point three doesn't matter", "compare this with page X", "use the argument-page format". As many rounds as you like.</li>
        <li>Once the agent has replied, the pale-green bar above the input shows <b>Compile as discussed</b>. Pressing it starts an ingest job with the whole conversation as instructions; the agent creates the summary page, updates related pages, index.md and log.md, and progress shows above the source page.</li>
        <li>You can also skip the discussion and press Auto-ingest this source; the agent follows the schema rules in one pass. Either way the results land in wiki/, index.md and log.md.</li>
      </ol>
      <h2 id="rules">Rules and templates</h2>
      <p><b>Templates.</b> On first entry into an empty workspace you pick one: General, Researcher, Project manager, Book. A template is schema/ rule pages + starter folders + an opening prompt for the agent; it shapes content, not the interface. In Settings, "Scenario templates" can be layered (added, never overwriting), Preview contents shows every page, Duplicate as custom template makes it yours, and Save current rules as template keeps a tuned schema/.</p>
      <Shot src="templates.png" alt="Template preview" caption="Preview every page before applying; custom templates are editable file by file." />
      <p><b>index.md and log.md.</b> In WikiBrain they are wiki/index.md and wiki/log.md; the template creates them, the agent updates them on every ingest, and Lint checks them, so you never maintain them by hand. index.md is the content catalog, one line per page with a link and a one-line summary; log.md is append-only, each entry starting with "## [date] ingest | title", recording every ingest, filed answer and lint.</p>
      <p><b>How to write rules.</b> schema/instructions.md holds the rules for the agent in plain language; save it and the next ingest follows it. Typical rules:</p>
      <ul>
        <li>"Write wiki pages in English; give the original term on first use."</li>
        <li>"Paper summaries go under wiki/sources/ named by citation_key; end every page with a 'Related pages' list."</li>
        <li>"When sources contradict, mark both pages with '⚠ contradicts page X' instead of picking a side."</li>
      </ul>
      <p><b>The agent got it wrong?</b> Three levels: fix small errors directly on the page (Version history on the right restores any old version); tell the agent in the chat what is wrong and ask it to fix the page and index.md; if the same mistake keeps happening, write the rule into schema/instructions.md.</p>
      <h2 id="views">Views and tools</h2>
      <ul>
        <li><b>Notes.</b> Read and edit (Markdown with live preview, Ctrl/⌘+S to save, insert or paste images); backlinks and version history on the right, any version viewable and restorable. If a page is edited from both sides at once, the later save receives the current version and keeps its own draft.</li>
        <li><b>Graph.</b> raw grey, wiki celadon, schema amber; links are written by the agent during ingest, not extracted from sources. Drag, zoom, play the timeline to watch the base grow; Filter narrows to a layer or folder, searches titles, hides isolated pages, or focuses on the current page and one or two hops of neighbours.</li>
        <li><b>Table.</b> Lists each page's front-matter (the property block at the top of a page: authors, year, tags…) as a table with filter, sort, group and CSV copy. The Researcher template presets it as a literature table.</li>
        <li><b>Search.</b> The top-bar search matches substrings of titles and bodies; it is also the MCP search_notes tool.</li>
        <li><b>Import.</b> ＋ Add has four tabs: write, paste URL, upload file (PDF, Word, HTML, Markdown, plain text, plus .bib / CSL-JSON bibliography files, one entry per page), paste text. Paper URLs get authors, year, venue and DOI filled in; ordinary pages keep title, URL and fetch time; images inside pages are stored as attachments. Pages that need JavaScript to show their content are fetched with the built-in browser; sites behind bot checks or logins still cannot be fetched, so paste the text or upload a PDF.</li>
        <li><b>Bibliography and citations.</b> Write [@citation_key] in a wiki page and it renders as (Author, Year) linked to the source, with an automatic reference list; the exported Markdown and .bib work with pandoc. Settings can connect Zotero: a read-only key pulls new items into raw/sources/ hourly (with PDF full text) and never writes back.</li>
        <li><b>Stats.</b> Pages per layer, source types, pages per day, an editing heatmap, and agent tokens and cost per day.</li>
      </ul>
      <Shot src="graph.png" alt="Knowledge graph" caption="The graph with the filter panel and the timeline; links are written by the agent during ingest." />
      <Shot src="add.png" alt="Add dialog" caption="The ＋ Add dialog: four tabs behind one entry point." />
      <h3 id="api">REST API (an MCP token as API key)</h3>
      <p>To read and write from scripts, cron jobs, Claude Code hooks or any program without going through MCP: the MCP token you create on the Settings page also works as an API key for the REST API. Send it as <code>Authorization: Bearer</code>; no cookie or Origin header is needed. Revoking the token disables both uses; versions written this way are attributed to the token's name. Account-level endpoints (tokens, AI settings, Zotero, billing, chat and auto-ingest) remain browser-session only.</p>
      <pre>{`# tree (three layers plus the pending list)
curl -H "Authorization: Bearer $TOKEN" https://wikibrain.app/api/notes/tree
# read one page
curl -H "Authorization: Bearer $TOKEN" "https://wikibrain.app/api/notes?path=wiki/index.md"
# create (201); 409 if the path exists
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"path":"raw/sources/note.md","content":"# Title\\n\\nBody"}' https://wikibrain.app/api/notes
# update with the optimistic lock (a stale if_version returns 409 with the current content)
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"path":"wiki/index.md","content":"...","if_version":3}' https://wikibrain.app/api/notes
# search, backlinks, versions
curl -H "Authorization: Bearer $TOKEN" "https://wikibrain.app/api/search?q=keyword"
# import a URL or file into raw/
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"url":"https://example.com/paper"}' https://wikibrain.app/api/import
# export the whole knowledge base (zip)
curl -H "Authorization: Bearer $TOKEN" -o wiki.zip https://wikibrain.app/api/export`}</pre>
    </>
  );
}

function PageData() {
  return (
    <>
      <h2 id="data">Your data and security</h2>
      <ul>
        <li><b>Workspace.</b> Your account owns one knowledge base, the workspace; raw/, wiki/ and schema/ live in it, nobody else sees it, and the agent cannot reach other workspaces.</li>
        <li><b>What leaves the server.</b> When you press auto-ingest, send a chat message or run a deep lint, the note text the agent reads is sent to the model provider you chose (OpenRouter forwards to the model's provider); the 5 no-key trial runs go through the platform's account. Pasted URLs are fetched by the server (the site sees the server, not you); DOIs are looked up at Crossref. Zotero sync reads Zotero with your key. Nothing else is sent to third parties, and there is no telemetry.</li>
        <li><b>What the agent can and cannot do.</b> Six tools only: read rules, search, read a page, create a page, update a page, list a folder. It cannot update or delete raw/, cannot delete any page, cannot browse the web, and never sees your API key. Every write is versioned and attributed to the agent and model, and can be rolled back. Note that the agent can edit schema/ rules and that source content enters its prompt; version history is your recovery path.</li>
        <li><b>API key.</b> Encrypted with a key separate from the login secret, only the last four characters are shown, decrypted only when a job starts or when testing the connection, deletable at any time.</li>
        <li><b>Export.</b> Settings offers the whole wiki as a Markdown zip (with image attachments, opens in Obsidian), plus .bib and CSL-JSON. The zip excludes version history, deleted pages, chat transcripts and agent job logs.</li>
        <li><b>Sources cannot be deleted.</b> raw/ is the immutable source layer: neither the web nor the agent can delete it. Press Archive on a source you no longer want to see; it moves under raw/archive/, drops out of the pending list, keeps versions and links, and can be unarchived any time.</li>
        <li><b>Retention.</b> The latest version of every page is kept forever, older snapshots for 90 days; deleting the account deletes the workspace and everything in it.</li>
        <li><b>Location and open source.</b> Hosted data is planned to live in Singapore; the privacy policy at launch is authoritative. The code will be released under AGPL-3.0 and self-hosts with docker compose.</li>
      </ul>
      <h2 id="system">How the system works</h2>
      <p>One Node service serves the MCP server, the web API, the OAuth authorization server and the web app; all data lives in PostgreSQL; there is no vector database and no RAG. The plan gate is checked when an agent job starts; rate limits on every request.</p>
      <Mermaid code={ARCH} />
      <p>How knowledge flows between the three layers (the operations run in Cursor/Claude via MCP, or in the web agent with your key):</p>
      <Mermaid code={FLOW} />
    </>
  );
}

function PagePlans() {
  return (
    <>
      <h2 id="plans">Plans and pricing</h2>
      <p>When the trial ends you drop to Free automatically; to upgrade, open Settings → Plan → Upgrade to Pro. Checkout is handled by Paddle (our merchant of record), prices are shown with tax for your location, and invoices, payment method and cancellation live under Manage subscription. The subscription pays for an always-on knowledge base that any agent can read and write: hosting, import, bibliography, versions, OAuth connections, Zotero, usable from a phone browser; offline copies and backup mirrors are planned. <b>Model costs are not included</b>: you use your own API key and pay your provider directly; Settings and Stats show real tokens and an estimated cost per job (estimated with OpenRouter's price list; your provider's bill is authoritative). Cursor users need no key at all.</p>
      <p>One "agent run" = one ingest, one chat reply, or one deep lint.</p>
      <div className="not-prose my-4 overflow-x-auto rounded-[10px] border border-line font-sans text-[13px]">
        <table className="w-full border-collapse">
          <thead><tr className="bg-porcelain text-left text-[12px] text-ink-soft"><th className="px-3 py-2 font-medium">Plan</th><th className="px-3 py-2 font-medium">Term and price</th><th className="px-3 py-2 font-medium">What you get</th></tr></thead>
          <tbody>
            <tr className="border-t border-line"><td className="px-3 py-2 font-semibold">Pro trial</td><td className="px-3 py-2">14 days from sign-up, free, no card</td><td className="px-3 py-2">Everything in Pro; unlimited agent runs; the first 10 runs on us (a cheaper model; content goes through the platform's OpenRouter account), no API key needed</td></tr>
            <tr className="border-t border-line"><td className="px-3 py-2 font-semibold">Free</td><td className="px-3 py-2">Free forever</td><td className="px-3 py-2">20 agent runs per month; 200 notes, 20 MB, 1 token, 7-day version history; bring your own key</td></tr>
            <tr className="border-t border-line"><td className="px-3 py-2 font-semibold">Pro</td><td className="px-3 py-2">USD 6 per month or 60 per year; early bird US$4 a month or 40 a year for the first 100 subscribers, applied automatically at checkout and kept on renewal</td><td className="px-3 py-2">Unlimited agent runs; 10,000 notes, 1 GB, 90-day version history; multiple tokens</td></tr>
            <tr className="border-t border-line"><td className="px-3 py-2 font-semibold">Self-hosted</td><td className="px-3 py-2">Free (AGPL-3.0)</td><td className="px-3 py-2">docker compose brings up Postgres and the service, same code (built-in browser included); you supply the encryption key; Google sign-in, mail and the no-key trial are optional; plan limits are adjustable with environment variables</td></tr>
          </tbody>
        </table>
      </div>
      <p>Limits only block additions: at the note or storage limit you cannot add or grow pages, but reading, shrinking, archiving and export keep working and nothing is deleted or altered. Version snapshots are kept 7 days on Free and 90 days on Pro and during the trial; the latest version of every page is kept forever. The plan card in Settings shows current usage.</p>
      <h2 id="faq">FAQ</h2>
      <Faq items={faq} />
      <h2 id="contact">Contact and reporting problems</h2>
      <p>Support: <a className="text-celadon-deep underline" href="mailto:hello@wikibrain.app">hello@wikibrain.app</a> (usually answered within one or two working days). Bugs and feature requests are also welcome as issues on <a className="text-celadon-deep underline" href="https://github.com/wikibrain-app/wikibrain">GitHub</a>. Legal: <a className="text-celadon-deep underline" href="/privacy">Privacy Policy</a>, <a className="text-celadon-deep underline" href="/terms">Terms of Service</a>. Data is hosted in Singapore (Railway); see section 4 of the privacy policy.</p>
    
    </>
  );
}

function PageKarpathy() {
  return (
    <>
      <h2 id="karpathy">Where this comes from: Karpathy's LLM Wiki</h2>
      <p>A condensed version of Andrej Karpathy's note (<a className="text-celadon-deep underline" href={GIST} target="_blank" rel="noreferrer">gist</a>); WikiBrain's interface follows this pattern.</p>
      <h3 id="idea">The core idea</h3>
      <p>Most people's experience with LLMs and documents looks like RAG: upload files, retrieve relevant chunks at query time, generate an answer. It works, but the LLM rediscovers knowledge from scratch on every question; nothing accumulates. The LLM Wiki idea is different: <b>the LLM incrementally builds and maintains a persistent wiki</b> that sits between you and the raw sources. When you add a source, the LLM reads it, extracts the key information, and integrates it into the existing wiki: updating entity pages, revising summaries, noting where new data contradicts old claims. Knowledge is compiled once and kept current. You rarely write the wiki yourself; you curate sources, explore, and ask the right questions.</p>
      <p>Where it applies: research (weeks or months of deep reading), project management (meeting notes and decisions), reading a book (characters, themes, plot threads), personal tracking, team wikis, competitive analysis, course notes.</p>
      <h3 id="layers">Three layers</h3>
      <ul>
        <li><b>Raw sources</b>: your curated collection; immutable, the LLM reads but never modifies.</li>
        <li><b>The wiki</b>: LLM-generated Markdown pages, owned entirely by the LLM: it creates, updates and cross-references. You read, it writes.</li>
        <li><b>The schema</b>: the document telling the LLM how the wiki is structured, what the conventions are and what workflows to follow (the role a Cursor rules file plays, if you have used one). You and the LLM co-evolve it.</li>
      </ul>
      <p>The three operations are Ingest, Query and Lint; the two special files are index.md and log.md (see the <a className="text-celadon-deep underline" href="/help/guide">user guide</a>). Karpathy's tips map onto WikiBrain features: Obsidian's graph view → the graph, Dataview → the table view, Marp → slide pages, downloading images locally → attachments, "the wiki is a git repo" → version snapshots plus export.</p>
      <h3 id="why">Why this works</h3>
      <p>The tedious part of maintaining a knowledge base is not the reading or the thinking; it is the bookkeeping: updating cross-references, keeping summaries current, noting contradictions, staying consistent across dozens of pages. Humans abandon wikis because the maintenance burden grows faster than the value. LLMs don't get bored, don't forget a cross-reference, and can touch fifteen files in one pass, so the wiki stays maintained. The human's job is to curate sources, direct the analysis, ask good questions and think about what it all means; the LLM does everything else.</p>
    </>
  );
}

