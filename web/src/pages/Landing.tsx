import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useT, type Lang } from '../i18n';
import { Brand, btnGhost, btnPrimary } from '../components/ui';
import { LangSwitch } from '../components/LangSwitch';
import { helpAsset } from './help/common';
import { Version } from '../components/Version';
import { CONTACT_EMAIL, SOURCE_URL } from '../components/Footer';
import { copy, GIST_URL, type LandingCopy } from './landing/copy';

/* Public landing page for signed-out visitors. Prerendered to web/dist/landing[.en].html by scripts/prerender-help.tsx
   (renderToStaticMarkup, so nothing in the render path may touch browser APIs) and served by Express for GET / when no
   session cookie is present; the SPA re-renders it after mount. Copy and every number live in ./landing/copy.ts.
   Layout classes prefixed ld- are in web/src/styles.css under "Landing page". */

const asset = (lang: Lang, file: string) => `/landing/${lang}/${file}`;
const mcpSnippet = (url: string, token: string) => JSON.stringify({ mcpServers: { wikibrain: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

export default function Landing() {
  const { lang } = useT();
  const c = copy[lang];
  return (
    <div className="landing min-h-full bg-porcelain font-sans text-ink" data-testid="landing">
      <header className="mx-auto flex max-w-[1120px] items-center gap-2 px-5 py-4 sb:gap-3 sb:px-8">
        <Brand />
        <nav className="ml-auto flex items-center gap-2 sb:gap-3" aria-label="Site">
          <Link to="/help" className="hidden text-[13.5px] text-ink-soft hover:text-celadon-deep sb:inline">{c.nav.docs}</Link>
          <Link to="/compare" className="hidden text-[13.5px] text-ink-soft hover:text-celadon-deep sb:inline" data-testid="landing-compare">{c.nav.compare}</Link>
          <LangSwitch />
          <Link to="/login" className={`${btnGhost} hidden sb:inline-block`} data-testid="landing-login">{c.nav.login}</Link>
          <Link to="/register" className={btnPrimary} data-testid="landing-signup">{c.nav.signup}</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-[1120px] px-5 pb-16 sb:px-8">
        <Hero c={c} lang={lang} />
        <p className="ld-body mt-10 max-w-[720px] border-t border-line pt-6 text-ink-soft sb:mt-14">
          {c.karpathy.before}<a href={GIST_URL} target="_blank" rel="noreferrer" className="ld-link">{c.karpathy.gist}</a>{c.karpathy.mid}<Link to="/help/karpathy" className="ld-link">{c.karpathy.impl}</Link>{c.karpathy.after}
        </p>
        <Arrives c={c} />
        <Second c={c} />
        <Graph c={c} lang={lang} />
        <How c={c} lang={lang} />
        <Agents c={c} lang={lang} />
        <Research c={c} lang={lang} />
        <Plans c={c} />
        <section className="ld-section max-w-[720px]">
          <h2 className="ld-h2">{c.open.title}</h2>
          <p className="ld-body mt-4">{c.open.body}</p>
        </section>
        <Faq c={c} />
        <section className="ld-section border-t border-line pt-12 text-center">
          <h2 className="ld-h1 mx-auto max-w-[18ch]">{c.hero.h1}</h2>
          <div className="mt-7"><Link to="/register" className={`${btnPrimary} ld-cta`} data-testid="landing-cta-2">{c.hero.cta}</Link></div>
          <p className="mt-3 text-[13.5px] text-ink-soft">{c.hero.trial}</p>
          <p className="mt-8 flex flex-wrap justify-center gap-2">{c.final.compare.map(l => <Link key={l.href} to={l.href} className={btnGhost}>{l.text}</Link>)}</p>
        </section>
        <footer className="mt-14 flex flex-wrap items-start justify-between gap-4 border-t border-line pt-5 text-[12px] text-ink-soft">
          <div>
            <div>{c.footer.line}</div>
            <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              <Link to="/help" className="hover:text-celadon-deep hover:underline">{c.footer.docs}</Link>
              <Link to="/login" className="hover:text-celadon-deep hover:underline sb:hidden">{c.footer.login}</Link>
              <Link to="/privacy" className="hover:text-celadon-deep hover:underline">{c.footer.privacy}</Link>
              <Link to="/terms" className="hover:text-celadon-deep hover:underline">{c.footer.terms}</Link>
              <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="hover:text-celadon-deep hover:underline">GitHub</a>
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-celadon-deep hover:underline">{CONTACT_EMAIL}</a>
            </span>
          </div>
          <span className="flex items-center gap-3"><LangSwitch className="text-[11px]" /><Version className="" /></span>
        </footer>
      </main>
    </div>
  );
}

/* Hero: the headline beside a real compiled page (the source that produced it sits on the page like a paper clip). On
   phones the page comes first — it is the memorable element — then the headline and the one action. */
function Hero({ c, lang }: { c: LandingCopy; lang: Lang }) {
  return (
    <section className="grid items-center gap-8 pt-6 rail:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] rail:gap-12 rail:pt-12">
      <div className="order-2 rail:order-1">
        <h1 className="ld-h1">{c.hero.h1}</h1>
        <p className="ld-body mt-5 max-w-[540px]">{c.hero.lede}</p>
        <div className="mt-7">
          <Link to="/register" className={`${btnPrimary} ld-cta`} data-testid="landing-cta">{c.hero.cta}</Link>
          <p className="mt-3 max-w-[440px] text-[13.5px] leading-relaxed text-ink-soft">{c.hero.trial}</p>
          <a href="#tour" className="ld-link mt-4 inline-block text-[14px]" data-testid="landing-watch">{c.hero.watch}</a>
        </div>
      </div>
      <figure className="order-1 min-w-0 rail:order-2">
        <div className="ld-art relative mt-4">
          <div className="ld-chip absolute -top-4 left-3 sb:left-5" aria-hidden="true">
            <span className="ld-dot" /><span className="font-mono text-ink">{c.hero.sourceName}</span><span className="ld-chip-url hidden text-ink-soft sb:inline">{c.hero.sourceUrl}</span>
          </div>
          {/* Two captures, not one scaled image: on a phone the desktop frame shrinks the byline — the proof of the headline —
              to 9 px, so below the breakpoint we show the app as a phone actually renders it, reflowed and legible. */}
          <div className="ld-frame ld-frame-hero">
            <picture>
              <source media="(max-width: 680px)" srcSet={asset(lang, 'hero-page-sm.webp')} />
              <img src={asset(lang, 'hero-page.webp')} width={932} height={600} alt={c.hero.alt} />
            </picture>
          </div>
        </div>
        <figcaption className="mt-3 text-[13px] leading-relaxed text-ink-soft">{c.hero.caption}</figcaption>
      </figure>
    </section>
  );
}

function Arrives({ c }: { c: LandingCopy }) {
  return (
    <section className="ld-section grid gap-8 rail:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] rail:gap-12">
      <div>
        <h2 className="ld-h2">{c.arrives.title}</h2>
        <p className="ld-body mt-4">{c.arrives.body}</p>
      </div>
      <figure className="min-w-0">
        <div className="ld-log">
          <h3>{c.arrives.log.head}</h3>
          <ul>{c.arrives.log.lines.map(l => <li key={l.path}>{l.label}<code>{l.path}</code></li>)}</ul>
          <div className="ld-log-run">{c.arrives.log.run}</div>
        </div>
        <figcaption className="mt-3 text-[13px] leading-relaxed text-ink-soft">{c.arrives.caption}</figcaption>
      </figure>
    </section>
  );
}

/* The before/after pair is the Chinese demo workspace in both languages: it is the one page with a real v1 → v2 history. */
function Second({ c }: { c: LandingCopy }) {
  return (
    <section className="ld-section">
      <div className="max-w-[720px]">
        <h2 className="ld-h2">{c.second.title}</h2>
        <p className="ld-body mt-4">{c.second.body}</p>
      </div>
      <div className="mt-8 grid gap-6 sb:grid-cols-2 sb:gap-8">
        {([['compound-v1.webp', c.second.v1, c.second.alt1, 'v1'], ['compound-v2.webp', c.second.v2, c.second.alt2, 'v2']] as const).map(([file, label, alt, v]) => (
          <figure key={file} className="min-w-0">
            <figcaption className="mb-2 flex items-baseline gap-2 text-[13px] text-ink-soft"><span className={`ld-ver ${v === 'v1' ? 'ld-ver-old' : ''}`}>{v}</span>{label}</figcaption>
            <div className="ld-frame ld-frame-page"><img src={`/landing/zh-TW/${file}`} width={1352} height={1120} alt={alt} loading="lazy" /></div>
          </figure>
        ))}
      </div>
      <p className="mt-5 text-[13.5px] text-ink-soft">{c.second.counts}</p>
    </section>
  );
}

/* Deliberately not the prose-left/figure-right grid the other sections use: the graph is the one artefact that wants
   the full width, and it is the visual consequence of the section above it rather than a separate claim. */
function Graph({ c, lang }: { c: LandingCopy; lang: Lang }) {
  return (
    <section className="ld-section">
      <div className="max-w-[720px]">
        <h2 className="ld-h2">{c.graph.title}</h2>
        <p className="ld-body mt-4">{c.graph.body}</p>
      </div>
      <figure className="mt-8">
        <div className="ld-frame ld-frame-graph"><img src={`/landing/${lang}/graph.webp`} width={1720} height={1040} alt={c.graph.alt} loading="lazy" /></div>
      </figure>
    </section>
  );
}

function How({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const video = useRef<HTMLVideoElement>(null);
  // Autoplay is a static attribute (the prerendered HTML must carry it); people who asked for less motion get the poster.
  useEffect(() => {
    const v = video.current; if (!v) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); }
  }, []);
  return (
    <section className="ld-section" id="tour">
      <h2 className="ld-h2">{c.how.title}</h2>
      <div className="mt-6 grid gap-8 rail:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] rail:gap-12">
        <ol className="ld-steps">
          {c.how.steps.map((s, i) => (
            <li key={s.title}><span className="ld-num" aria-hidden="true">{i + 1}</span><div><h3>{s.title}</h3><p>{s.body}</p></div></li>
          ))}
        </ol>
        <figure className="min-w-0">
          <video ref={video} controls muted playsInline preload="none" poster={helpAsset(lang, 'tour-poster.png')} src={helpAsset(lang, 'tour.webm')} className="ld-frame w-full bg-ink" aria-label={c.how.video} data-testid="landing-video" />
          <figcaption className="mt-3 text-[13px] text-ink-soft">{c.how.video}</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Agents({ c, lang }: { c: LandingCopy; lang: Lang }) {
  return (
    <section className="ld-section">
      <div className="grid gap-8 rail:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] rail:gap-12">
        <div>
          <h2 className="ld-h2">{c.agents.title}</h2>
          <p className="ld-body mt-4">{c.agents.body}</p>
        </div>
        <figure className="min-w-0">
          <pre className="ld-code">{mcpSnippet(c.agents.mcpUrl, c.agents.tokenPh)}</pre>
          <figcaption className="mt-3 text-[13px] text-ink-soft">{c.agents.cursor}</figcaption>
        </figure>
      </div>
      {/* The only Claude.ai capture we have is a Chinese transcript; on the English page it proves nothing a reader
          can follow, and the mcp.json block above carries the claim on its own. */}
      {lang === 'zh-TW' && (
        <figure className="mt-8 min-w-0">
          <div className="ld-frame ld-frame-natural"><img src="/landing/shared/claude-call.webp" width={850} height={266} alt={c.agents.claudeAlt} loading="lazy" /></div>
          <figcaption className="mt-3 text-[13px] text-ink-soft">{c.agents.claude}</figcaption>
        </figure>
      )}
    </section>
  );
}

function Research({ c, lang }: { c: LandingCopy; lang: Lang }) {
  return (
    <section className="ld-section grid items-start gap-8 rail:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] rail:gap-12">
      <div>
        <h2 className="ld-h2">{c.research.title}</h2>
        <p className="ld-body mt-4">{c.research.body}</p>
      </div>
      <div className="ld-frame ld-frame-cite min-w-0"><img src={asset(lang, 'citations.webp')} width={932} height={1120} alt={c.research.alt} loading="lazy" /></div>
    </section>
  );
}

function Plans({ c }: { c: LandingCopy }) {
  const card = (p: { name: string; price: string; lines: string[]; cta?: string }, primary: boolean) => (
    <div className={`flex flex-col rounded-[12px] border bg-paper p-6 ${primary ? 'border-celadon shadow-[0_0_0_1px_var(--color-celadon)]' : 'border-line'}`}>
      <div className="text-[15px] font-semibold">{p.name}</div>
      <div className="mt-1 font-serif text-[24px] font-bold leading-tight">{p.price}</div>
      <ul className="mt-4 space-y-1.5 text-[14.5px] leading-relaxed text-ink-soft">{p.lines.map(l => <li key={l} className="ld-tick">{l}</li>)}</ul>
      {p.cta && <Link to="/register" className={`${btnPrimary} ld-cta mt-5 self-start`}>{p.cta}</Link>}
    </div>
  );
  return (
    <section className="ld-section" id="plans">
      <h2 className="ld-h2">{c.plans.title}</h2>
      <p className="ld-banner mt-6">{c.plans.trial}</p>
      <div className="mt-5 grid gap-5 sb:grid-cols-2">
        {card(c.plans.free, false)}
        {card(c.plans.pro, true)}
      </div>
      <p className="ld-body mt-6 max-w-[720px] text-ink">{c.plans.cost}</p>
      <p className="mt-3 text-[14px] text-ink-soft">{c.plans.selfHostBefore}<a href={SOURCE_URL} target="_blank" rel="noreferrer" className="ld-link">{c.plans.selfHostLink}</a></p>
    </section>
  );
}

function Faq({ c }: { c: LandingCopy }) {
  return (
    <section className="ld-section max-w-[720px]">
      <h2 className="ld-h2">{c.faq.title}</h2>
      <dl className="ld-faq mt-4">
        {c.faq.items.map(f => (
          <div key={f.q}>
            <dt>{f.q}</dt>
            <dd>{f.a}{f.link && <>{' '}<Link to={f.link.href} className="ld-link">{f.link.text}</Link></>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
