import { QuotaLine } from './QuotaLine';
import { formatAuthor, formatTime, layerOf, type Note, type NoteSummary, type Version } from '../lib/api';
import { Markdown } from './Markdown';
import { btnGhost, btnPrimary } from './ui';
import { useToast } from '../lib/toast';
import { useState } from 'react';
import { SlideView } from './SlideView';
import { ShareModal } from './ShareModal';
import { useT } from '../i18n';
import { citationKeys, useBib } from '../lib/cite';

const CRUMB: Record<string, string> = { raw: 'note.crumbRaw', wiki: 'note.crumbWiki', schema: 'note.crumbSchema' };

function tagsOf(md: string): string[] {
  if (!md.startsWith('---\n')) return [];
  const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m);
  const block = fm.match(/^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
  const raw = inline ? inline[1].split(',') : block ? block[1].split('\n').map(l => l.replace(/^[ \t]+-\s*/, '')) : [];
  return raw.map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

interface Props {
  note: Note;
  notes: NoteSummary[];
  historical?: Version | null;
  onOpen: (p: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive?: (undo: boolean) => void;
  onBackToCurrent: () => void;
  onRollback: (v: number) => void;
  pending?: boolean;
  pendingCount?: number;
  ingestPromptAll?: string | null;
  aiReady?: boolean;
  onAutoIngest?: (paths?: string[]) => void;
  ingesting?: boolean;
  onDiscuss?: () => void;
}

export function NoteView({ note, notes, historical, onOpen, onEdit, onDelete, onArchive, onBackToCurrent, onRollback, pending, pendingCount = 0, ingestPromptAll, aiReady, onAutoIngest, ingesting, onDiscuss }: Props) {
  const layer = layerOf(note.path);
  const { toast } = useToast();
  const { t } = useT();
  const isMarp = /^---\n[\s\S]*?^marp:\s*true\s*$[\s\S]*?\n---/m.test(historical ? historical.content_md : note.content);
  const [slides, setSlides] = useState(false);
  const [share, setShare] = useState(false);
  if (isMarp && slides) return <SlideView source={historical ? historical.content_md : note.content} onBack={() => setSlides(false)} />;
  const copyPrompt = (text: string) => navigator.clipboard.writeText(text).then(() => toast(t('note.promptCopied'))).catch(() => toast(t('common.clipboardFail'), { kind: 'error' }));
  const promptOne = t('note.promptOne', { path: note.path });
  const content = historical ? historical.content_md : note.content;
  const tags = tagsOf(content);
  return (
    <article className="mx-auto max-w-[660px] px-5 sb:px-10 pb-20 pt-6 sb:pt-9">
      {share && <ShareModal path={note.path} onClose={() => setShare(false)} />}
      {pending && !historical && (
        <div className="mb-4 rounded-[10px] border border-amber/40 bg-amber-mist px-4 py-3 text-[12.5px] leading-relaxed" role="status" data-testid="pending-banner">
          <b>{t('note.pendingTitle')}</b>{t('note.pendingBody')}{aiReady ? t('note.pendingAi') : t('note.pendingNoAi')}
          <div className="mt-2 flex flex-wrap gap-2">
            {aiReady && onAutoIngest && <button className={btnPrimary} data-testid="auto-ingest" disabled={ingesting} onClick={() => onAutoIngest([note.path])}>{ingesting ? t('note.ingesting') : t('note.autoOne')}</button>}
            {aiReady && onAutoIngest && pendingCount > 1 && <button className={btnGhost} disabled={ingesting} onClick={() => onAutoIngest()}>{t('note.autoAll', { n: pendingCount })}</button>}
            {aiReady && onDiscuss && <button className={btnGhost} disabled={ingesting} onClick={onDiscuss} title={t('note.discussTitle')} data-testid="discuss-ingest">{t('note.discuss')}</button>}
            <button className={aiReady ? btnGhost : btnPrimary} onClick={() => copyPrompt(promptOne)}>{t('note.copyPrompt')}</button>
            {!aiReady && pendingCount > 1 && ingestPromptAll && <button className={btnGhost} onClick={() => copyPrompt(ingestPromptAll)}>{t('note.copyAll', { n: pendingCount })}</button>}
            {!aiReady && <a className={`${btnGhost} inline-block`} href="/settings">{t('note.setupKey')}</a>}
          </div>
          <QuotaLine className="mt-2" refreshKey={ingesting ? 1 : 0} />
        </div>
      )}
      {historical && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-amber/40 bg-amber-mist px-4 py-2.5 text-[12.5px] text-ink" role="status">
          <span>{t('note.hist1')}<b>v{historical.version}</b>{t('note.hist2', { author: formatAuthor(historical.author), time: formatTime(historical.created_at), cur: note.version })}</span>
          <span className="ml-auto flex gap-2">
            <button className={btnGhost} onClick={onBackToCurrent}>{t('note.backToCurrent')}</button>
            {layer !== 'raw' && <button className={btnPrimary} onClick={() => onRollback(historical.version)}>{t('version.rollback')}</button>}
          </span>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-3 text-[12px] text-ink-soft">{t(CRUMB[layer])}</div>
          <h1 className="font-serif text-[26px] sb:text-[28px] font-bold leading-[1.35] mb-1.5">{historical?.title ?? note.title}</h1>
        </div>
        {!historical && (
          <div className="flex flex-none gap-2 pt-6">
            {isMarp && <button className={btnGhost} onClick={() => setSlides(true)} data-testid="view-slides">{t('note.slides')}</button>}
            {!historical && <button className={btnGhost} onClick={() => setShare(true)} data-testid="share-open">{t('share.button')}</button>}
            {layer === 'raw' ? <span className="text-[12px] text-ink-faint self-center">{t('note.readonly')}</span> : <button className={btnGhost} onClick={onEdit}>{t('common.edit')}</button>}
            {layer === 'raw'
              ? (note.path.startsWith('raw/archive/')
                ? <button className={btnGhost} onClick={() => onArchive?.(true)} title={t('note.unarchiveTitle')} data-testid="unarchive">{t('note.unarchive')}</button>
                : <button className={btnGhost} onClick={() => onArchive?.(false)} title={t('note.archiveTitle')} data-testid="archive">{t('note.archive')}</button>)
              : <button className={`${btnGhost} hover:border-danger hover:text-danger`} onClick={onDelete}>{t('common.delete')}</button>}
          </div>
        )}
      </div>
      <div className="mb-6 flex flex-wrap gap-3.5 border-b border-line pb-4 text-[12px] text-ink-soft">
        <span>{historical ? t('note.editor') : t('note.lastEdited')}<span className="text-celadon-deep">{formatAuthor(historical ? historical.author : note.author)}</span></span>
        <span>{historical ? t('note.histVersion', { v: historical.version, cur: note.version }) : t('note.version', { v: note.version })}</span>
        <span>{formatTime(historical ? historical.created_at : note.updated_at)}</span>
        <span className="font-mono text-ink-faint">{note.path}</span>
      </div>
      <Markdown source={content} notes={notes} onOpen={onOpen} hideTitle />
      <References content={content} onOpen={onOpen} />
      {tags.length > 0 && (
        <div className="mt-7 flex flex-wrap gap-2">
          {tags.map(t => <span key={t} className="rounded-md bg-celadon-mist px-2.5 py-[3px] text-[12px] text-celadon-deep">#{t}</span>)}
        </div>
      )}
    </article>
  );
}

// Academic (2): sources cited on this page, listed as references in order of first appearance (authors (year). title. venue. DOI)
function References({ content, onOpen }: { content: string; onOpen: (p: string) => void }) {
  const { t } = useT();
  const bib = useBib();
  const keys = citationKeys(content);
  if (!keys.length) return null;
  return (
    <section className="mt-9 border-t border-line pt-4" data-testid="references">
      <h2 className="mb-2 text-[13px] font-semibold text-ink-soft">{t('cite.references')}</h2>
      <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed">
        {keys.map(k => { const e = bib.get(k); return (
          <li key={k} id={`ref-${k}`}>
            {e ? <>
              {e.authors.length ? e.authors.join(', ') : ''}{e.year ? ` (${e.year}).` : e.authors.length ? '.' : ''} <a href={`/n/${e.path}`} className="wl" onClick={ev => { ev.preventDefault(); onOpen(e.path); }}>{e.title}</a>.{e.venue ? ` ${e.venue}.` : ''}
              {e.doi ? <> <a href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer" className="text-celadon-deep hover:underline">doi:{e.doi}</a></> : e.url ? <> <a href={e.url} target="_blank" rel="noreferrer" className="text-celadon-deep hover:underline break-all">{e.url}</a></> : null}
            </> : <span className="wl-missing" title={t('cite.missing', { key: k })}>@{k}</span>}
          </li>
        ); })}
      </ol>
    </section>
  );
}
