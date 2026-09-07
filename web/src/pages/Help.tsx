import { Link, Navigate, useParams } from 'react-router';
import { PageShell } from '../components/PageShell';
import { LangSwitch } from '../components/LangSwitch';
import { useT } from '../i18n';
import { frame } from './help/common';
import * as zhTW from './help/zh-TW';
import * as en from './help/en';

// Help: five sub-pages (/help, /help/guide, /help/data, /help/plans, /help/karpathy). Content switches with the UI language
// (web/src/pages/help/); this shell renders the page list, the on-this-page outline, the header and prev/next links.
export default function Help({ signedIn }: { signedIn: boolean }) {
  const { lang } = useT();
  const { pages } = lang === 'en' ? en : zhTW;
  const f = frame[lang];
  const { page: slug } = useParams();
  const idx = pages.findIndex(p => p.slug === (slug ?? 'start'));
  if (idx < 0) return <Navigate to="/help" replace />;
  const page = pages[idx], prev = pages[idx - 1], next = pages[idx + 1];
  const href = (i: number) => (i === 0 ? '/help' : `/help/${pages[i].slug}`);
  return (
    <PageShell title={f.title} right={!signedIn ? <><LangSwitch /><Link to="/login" className="text-[12px] text-celadon-deep hover:underline">{f.login}</Link></> : undefined}>
      <div className="grid gap-8 sb:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="sb:sticky sb:top-6 self-start font-sans text-[13px]" aria-label={f.nav}>
          <div className="mb-2 text-[11px] uppercase tracking-[.08em] text-ink-faint">{f.allPages}</div>
          <ol className="space-y-0.5">
            {pages.map((p, i) => (
              <li key={p.slug}>
                <Link to={href(i)} className={`block rounded-md px-2.5 py-1.5 ${i === idx ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft hover:bg-porcelain hover:text-ink'}`} aria-current={i === idx ? 'page' : undefined}>{p.title}</Link>
                {i === idx && (
                  <ol className="mb-2 ml-3 mt-1 space-y-1 border-l border-line pl-3 text-[12.5px]" aria-label={f.onThisPage}>
                    {p.sections.map(s => <li key={s.id} className={s.sub ? 'pl-3' : ''}><a href={`#${s.id}`} className="text-ink-soft hover:text-celadon-deep">{s.title}</a></li>)}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <main className="note-body min-w-0 text-[15px]" data-testid="help" data-help-page={page.slug}>
          <header className="mb-7 border-b border-line pb-5 font-sans">
            <div className="text-[11px] uppercase tracking-[.08em] text-ink-faint">{f.title} · {idx + 1} / {pages.length}</div>
            <h1 className="mb-1.5 mt-1 font-serif text-[28px] font-bold leading-tight">{page.title}</h1>
            <p className="m-0 text-[14px] text-ink-soft">{page.lede}</p>
          </header>
          {idx === 0 && (
            <div className="not-prose mb-8 grid gap-3 font-sans sm:grid-cols-2" data-testid="help-cards">
              {pages.slice(1).map((p, i) => (
                <Link key={p.slug} to={href(i + 1)} className="!no-underline rounded-[10px] border border-line bg-paper px-4 py-3 transition-colors hover:border-celadon">
                  <div className="text-[14px] font-semibold text-ink">{p.title}</div>
                  <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft no-underline">{p.lede}</div>
                </Link>
              ))}
            </div>
          )}
          <page.Body />
          <nav className="not-prose mt-12 flex flex-wrap justify-between gap-3 border-t border-line pt-5 font-sans text-[13px]" aria-label={`${f.prev} / ${f.next}`}>
            {prev ? <Link to={href(idx - 1)} className="!no-underline rounded-lg border border-line px-3.5 py-2 text-ink-soft hover:border-celadon hover:text-celadon-deep">← {f.prev}：{prev.title}</Link> : <span />}
            {next ? <Link to={href(idx + 1)} className="!no-underline rounded-lg border border-line px-3.5 py-2 text-ink-soft hover:border-celadon hover:text-celadon-deep">{f.next}：{next.title} →</Link> : <span />}
          </nav>
        </main>
      </div>
    </PageShell>
  );
}
