import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, type SharedNote } from '../lib/api';
import { Markdown } from '../components/Markdown';
import { Footer } from '../components/Footer';
import { Brand, btnGhost } from '../components/ui';
import { BibProvider } from '../lib/cite';
import { fmtDateTime, useT } from '../i18n';

// Public read-only view of one shared note (/s/<token>). No session, no sidebar; wiki-links stay plain because the
// rest of the workspace is not shared. Embedded images are rewritten to the share-scoped asset endpoint.
const s = {
  'zh-TW': { gone: '這個連結已失效或已停止分享。', updated: '最後更新', by: '以 WikiBrain 分享', cta: '建立你自己的知識庫', loading: '載入中…' },
  en: { gone: 'This link is no longer available.', updated: 'Last updated', by: 'Shared with WikiBrain', cta: 'Build your own knowledge base', loading: 'Loading…' },
};
export default function Share() {
  const { token = '' } = useParams();
  const { lang } = useT();
  const l = s[lang];
  const [note, setNote] = useState<SharedNote | null | undefined>(undefined);
  useEffect(() => { api.publicShare(token).then(setNote).catch(() => setNote(null)); }, [token]);
  useEffect(() => {
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, nofollow'; document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);
  const source = note ? note.content.replace(/\/api\/assets\/([0-9a-f]{24})/g, `/api/public/share/${token}/assets/$1`) : '';
  return (
    <div className="mx-auto flex min-h-full max-w-[1280px] flex-col bg-paper shadow-[0_0_0_1px_var(--color-line)]" data-testid="share-page">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sb:px-5">
        <Link to="/"><Brand tag /></Link>
        <span className="text-[12px] text-ink-soft">{l.by}</span>
        <span className="ml-auto"><Link to="/register" className={btnGhost}>{l.cta}</Link></span>
      </header>
      <main className="mx-auto w-full max-w-[860px] flex-1 px-4 py-8 sb:px-8">
        {note === undefined ? <p className="text-ink-soft">{l.loading}</p> : note === null ? <p className="text-ink-soft" data-testid="share-gone">{l.gone}</p> : (
          <article>
            <h1 className="mb-1.5 font-serif text-[28px] font-bold leading-[1.35]">{note.title}</h1>
            <div className="mb-6 border-b border-line pb-4 text-[12px] text-ink-soft">{l.updated} {fmtDateTime(lang, note.updated_at)} · {note.path}</div>
            <BibProvider value={new Map()}>
              <div className="note-body"><Markdown source={source} notes={[]} onOpen={() => {}} hideTitle /></div>
            </BibProvider>
          </article>
        )}
      </main>
      <Footer />
    </div>
  );
}
