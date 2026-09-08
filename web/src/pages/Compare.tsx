import { Link, Navigate, useParams } from 'react-router';
import { PageShell } from '../components/PageShell';
import { LangSwitch } from '../components/LangSwitch';
import { btnPrimary } from '../components/ui';
import { useT } from '../i18n';
import { compareDocs } from './compare/content';

// Public comparison pages: /compare (index) and /compare/<slug>. Content in pages/compare/content.ts; pre-rendered for crawlers.
const ui = {
  'zh-TW': { title: '比較', index: '和你熟悉的工具比一比', lede: '每一頁都是同一個格式：什麼時候該選對方、什麼時候該選我們、一張表、我們承認的短處。', themFor: '選 {name} 如果', usFor: '選 WikiBrain 如果', feature: '項目', caveats: '我們承認的取捨', checked: '對方資料查證日期', site: '官網', cta: '免費開始（14 天 Pro 體驗）', back: '所有比較', login: '登入', more: '其他比較' },
  en: { title: 'Compare', index: 'Compared with tools you already know', lede: 'Every page has the same shape: when to choose them, when to choose us, one table, and the trade-offs we admit.', themFor: 'Choose {name} if', usFor: 'Choose WikiBrain if', feature: 'Feature', caveats: 'Trade-offs we admit', checked: 'Their facts checked on', site: 'Website', cta: 'Start free (14-day Pro trial)', back: 'All comparisons', login: 'Sign in', more: 'More comparisons' },
};

export default function Compare({ signedIn }: { signedIn: boolean }) {
  const { lang } = useT();
  const u = ui[lang];
  const { slug } = useParams();
  const doc = slug ? compareDocs.find(d => d.slug === slug) : undefined;
  if (slug && !doc) return <Navigate to="/compare" replace />;
  const right = !signedIn ? <><LangSwitch /><Link to="/login" className="text-[12px] text-celadon-deep hover:underline">{u.login}</Link></> : undefined;
  if (!doc) {
    return (
      <PageShell title={u.title} right={right}>
        <main className="font-sans" data-testid="compare-index">
          <h1 className="font-serif text-[28px] font-bold leading-tight">{u.index}</h1>
          <p className="mt-2 max-w-[60ch] text-[14px] text-ink-soft">{u.lede}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {compareDocs.map(d => (
              <Link key={d.slug} to={`/compare/${d.slug}`} className="rounded-[10px] border border-line bg-paper px-4 py-3 transition-colors hover:border-celadon">
                <div className="text-[15px] font-semibold">{d.title[lang]}</div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{d.lede[lang]}</div>
              </Link>
            ))}
          </div>
        </main>
      </PageShell>
    );
  }
  return (
    <PageShell title={u.title} right={right}>
      <main className="font-sans" data-testid="compare" data-compare={doc.slug}>
        <header className="mb-6 border-b border-line pb-5">
          <div className="text-[11px] uppercase tracking-[.08em] text-ink-faint"><Link to="/compare" className="hover:text-celadon-deep">{u.back}</Link></div>
          <h1 className="mb-1.5 mt-1 font-serif text-[28px] font-bold leading-tight">{doc.title[lang]}</h1>
          <p className="max-w-[64ch] text-[14.5px] leading-relaxed text-ink-soft">{doc.lede[lang]}</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[10px] border border-line bg-paper p-4"><div className="mb-1 text-[12px] font-semibold uppercase tracking-[.06em] text-ink-faint">{u.themFor.replace('{name}', doc.name)}</div><p className="text-[14px] leading-relaxed">{doc.themFor[lang]}</p></div>
          <div className="rounded-[10px] border border-celadon bg-celadon-mist p-4"><div className="mb-1 text-[12px] font-semibold uppercase tracking-[.06em] text-celadon-deep">{u.usFor}</div><p className="text-[14px] leading-relaxed">{doc.usFor[lang]}</p></div>
        </div>
        <div className="mt-6 overflow-x-auto rounded-[10px] border border-line">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead><tr className="bg-porcelain text-[12px] text-ink-soft"><th className="px-3 py-2 font-medium">{u.feature}</th><th className="px-3 py-2 font-medium">{doc.name}</th><th className="px-3 py-2 font-medium text-celadon-deep">WikiBrain</th></tr></thead>
            <tbody>{doc.rows.map(row => (
              <tr key={row.feature.en} className="border-t border-line align-top"><td className="px-3 py-2 font-semibold">{row.feature[lang]}</td><td className="px-3 py-2 text-ink-soft">{row.them[lang]}</td><td className="px-3 py-2">{row.us[lang]}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <section className="mt-6">
          <h2 className="text-[15px] font-semibold">{u.caveats}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-ink-soft">{doc.caveats[lang].map(c => <li key={c}>{c}</li>)}</ul>
        </section>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link to="/register" className={btnPrimary}>{u.cta}</Link>
          <span className="text-[12px] text-ink-faint">{u.checked} {doc.checked} · <a className="hover:text-celadon-deep hover:underline" href={doc.url} target="_blank" rel="noreferrer">{doc.name} {u.site}</a></span>
        </div>
        <nav className="mt-10 border-t border-line pt-4 text-[13px]" aria-label={u.more}>
          <span className="text-ink-faint">{u.more}：</span>
          {compareDocs.filter(d => d.slug !== doc.slug).map(d => <Link key={d.slug} to={`/compare/${d.slug}`} className="ml-3 text-celadon-deep hover:underline">{d.title[lang]}</Link>)}
        </nav>
      </main>
    </PageShell>
  );
}
