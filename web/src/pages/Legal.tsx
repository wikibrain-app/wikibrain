import { Link } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageShell } from '../components/PageShell';
import { useT } from '../i18n';
import { legalDocs, type LegalDoc } from './legal/content';

// Public legal pages (/privacy, /terms). Content lives in pages/legal/content.ts; pre-rendered for crawlers.
const ui = {
  'zh-TW': { updated: '最後更新', binding: '中文版為準；English summary below the language switch.', other: (d: LegalDoc) => d.slug === 'privacy' ? '服務條款' : '隱私權政策', back: '回到說明', login: '登入' },
  en: { updated: 'Last updated', binding: 'The Traditional Chinese version is binding; this is a faithful English summary.', other: (d: LegalDoc) => d.slug === 'privacy' ? 'Terms of Service' : 'Privacy Policy', back: 'Back to help', login: 'Sign in' },
};

export default function Legal({ slug, signedIn }: { slug: 'privacy' | 'terms'; signedIn: boolean }) {
  const { lang } = useT();
  const doc = legalDocs.find(d => d.slug === slug)!;
  const other = legalDocs.find(d => d.slug !== slug)!;
  const u = ui[lang];
  return (
    <PageShell title={doc.title[lang]} right={!signedIn ? <Link to="/login" className="text-[12px] text-celadon-deep hover:underline">{u.login}</Link> : undefined}>
      <main className="note-body mx-auto max-w-[760px] text-[15px]" data-testid="legal" data-legal-page={slug}>
        <header className="mb-7 border-b border-line pb-5 font-sans">
          <div className="text-[11px] uppercase tracking-[.08em] text-ink-faint">WikiBrain · {u.updated} {doc.updated}</div>
          <h1 className="mb-1.5 mt-1 font-serif text-[28px] font-bold leading-tight">{doc.title[lang]}</h1>
          <p className="text-[13px] text-ink-soft">
            <Link to={`/${other.slug}`} className="text-celadon-deep hover:underline">{u.other(doc)}</Link>
            <span className="mx-2 text-ink-faint">·</span>
            <Link to="/help" className="text-celadon-deep hover:underline">{u.back}</Link>
          </p>
        </header>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body[lang]}</ReactMarkdown>
      </main>
    </PageShell>
  );
}
