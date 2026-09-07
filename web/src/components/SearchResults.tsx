import type { SearchHit } from '../lib/api';
import { useT } from '../i18n';

const plain = (s: string) => s.replace(/^---[\s\S]*?---\s*/, '').replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, '$1').replace(/[#*`>]+/g, '').replace(/\s+/g, ' ').trim();

export function SearchResults({ query, hits, onOpen }: { query: string; hits: SearchHit[]; onOpen: (p: string) => void }) {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-[660px] px-5 sb:px-10 pb-20 pt-9">
      <div className="mb-3 text-[12px] text-ink-soft">{t('search.query', { q: query })}</div>
      <h1 className="font-serif text-[22px] font-bold mb-5">{t('search.results', { n: hits.length })}</h1>
      {hits.length === 0 && <p className="text-[13px] text-ink-faint">{t('search.empty')}</p>}
      {hits.map(h => (
        <button key={h.path} className="mb-3 block w-full rounded-[10px] border border-line bg-paper px-4 py-3 text-left hover:border-celadon" onClick={() => onOpen(h.path)}>
          <div className="font-serif text-[16px] font-bold">{h.title}</div>
          <div className="font-mono text-[11px] text-ink-faint">{h.path} · v{h.version}</div>
          <div className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">{plain(h.snippet)}</div>
        </button>
      ))}
    </div>
  );
}
