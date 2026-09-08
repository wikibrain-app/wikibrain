import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import type { Note, NoteSummary } from '../lib/api';
import { Markdown } from './Markdown';
import { btnGhost, btnPrimary } from './ui';

export function Editor({ note, initial, notes, onSave, onCancel, busy }: { note: Note; initial?: string; notes: NoteSummary[]; onSave: (content: string) => void; onCancel: () => void; busy: boolean }) {
  const draftKey = `wb-draft:${note.path}`;
  const [draft, setDraft] = useState(initial ?? note.content);
  const [stored, setStored] = useState<string | null>(() => { try { const v = localStorage.getItem(draftKey); return v !== null && v !== (initial ?? note.content) ? v : null; } catch { return null; } });
  // Keep the unsaved draft in localStorage (debounced) so a closed tab or a crash does not lose it; cleared on save/cancel
  useEffect(() => {
    const id = window.setTimeout(() => { try { if (draft !== note.content) localStorage.setItem(draftKey, draft); else localStorage.removeItem(draftKey); } catch { /* ignore */ } }, 500);
    return () => window.clearTimeout(id);
  }, [draft, note.content, draftKey]);
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { t } = useT();
  async function insertImage(file: File) {
    try {
      const a = await api.uploadAsset(file);
      const ta = taRef.current; const pos = ta?.selectionStart ?? draft.length;
      const snippet = `![${file.name.replace(/\.[a-z0-9]+$/i, '')}](${a.url})`;
      // Put the image in its own paragraph: add line breaks unless already at line start/end, so it never sticks to a heading or sentence
      setDraft(d => { const before = d.slice(0, pos), after = d.slice(pos); return before + (before && !before.endsWith('\n') ? '\n\n' : '') + snippet + (after && !after.startsWith('\n') ? '\n\n' : '') + after; });
      toast(t('editor.inserted'));
    } catch (e) { toast((e as Error).message, { kind: 'error' }); }
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-2">
        <span className="text-[12px] text-ink-soft">{t('editor.editing')}<span className="font-mono">{note.path}</span>{t('editor.version', { n: note.version })}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line rail:hidden" role="tablist">
            <button role="tab" aria-selected={pane === 'edit'} className={`px-3 py-1.5 text-[12.5px] ${pane === 'edit' ? 'bg-celadon-mist text-celadon-deep font-semibold' : 'text-ink-soft'}`} onClick={() => setPane('edit')}>{t('common.edit')}</button>
            <button role="tab" aria-selected={pane === 'preview'} className={`px-3 py-1.5 text-[12.5px] ${pane === 'preview' ? 'bg-celadon-mist text-celadon-deep font-semibold' : 'text-ink-soft'}`} onClick={() => setPane('preview')}>{t('editor.preview')}</button>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ''; }} />
          <button className={btnGhost} onClick={() => fileRef.current?.click()} disabled={busy} title={t('editor.insertImageTitle')} data-testid="insert-image">{t('editor.insertImage')}</button>
          <button className={btnGhost} onClick={() => { clearDraft(); onCancel(); }} disabled={busy}>{t('common.cancel')}</button>
          <button className={btnPrimary} onClick={() => { clearDraft(); onSave(draft); }} disabled={busy || draft === note.content}>{busy ? t('editor.saving') : t('common.save')}</button>
        </div>
      </div>
      {stored !== null && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber/40 bg-amber-mist px-4 py-2 text-[12.5px]" data-testid="draft-bar">
          <span>{t('editor.draftFound')}</span>
          <button className={btnPrimary} onClick={() => { setDraft(stored); setStored(null); }} data-testid="draft-restore">{t('editor.draftRestore')}</button>
          <button className={btnGhost} onClick={() => { clearDraft(); setStored(null); }}>{t('editor.draftDiscard')}</button>
        </div>
      )}
      <div className="grid min-h-0 flex-1 rail:grid-cols-2">
        <textarea
          ref={taRef}
          aria-label={t('editor.mdLabel')}
          className={`h-full w-full resize-none border-r border-line bg-paper p-4 font-serif text-[15px] leading-[1.9] outline-none ${pane === 'edit' ? '' : 'hidden rail:block'}`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (draft !== note.content) onSave(draft); } }}
          onPaste={e => { const f = [...e.clipboardData.files].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); insertImage(f); } }}
          onDrop={e => { const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); insertImage(f); } }}
        />
        <div className={`h-full overflow-y-auto bg-paper px-6 py-4 ${pane === 'preview' ? '' : 'hidden rail:block'}`}>
          <Markdown source={draft} notes={notes} onOpen={() => {}} />
        </div>
      </div>
    </div>
  );
}
