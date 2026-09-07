import { useState, type FormEvent } from 'react';
import { api, type ImportResult } from '../lib/api';
import { slugify } from '../lib/links';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { Field, Modal, btnGhost, btnPrimary, input } from './ui';

export type AddTab = 'write' | 'url' | 'file' | 'text';

interface Props {
  tab?: AddTab;
  layer?: string;
  onCreate: (path: string, content: string) => Promise<void> | void;
  onImported: (r: ImportResult) => void;
  onClose: () => void;
  busy: boolean;
}

// Unified "Add": a hand-written note and the three import sources share one dialog (requested by the maintainer).
export function AddModal({ tab: initialTab = 'write', layer: initialLayer = 'wiki', onCreate, onImported, onClose, busy }: Props) {
  const [tab, setTab] = useState<AddTab>(initialTab);
  // Write a note
  const [layer, setLayer] = useState(initialLayer);
  const [title, setTitle] = useState('');
  const [rel, setRel] = useState('');
  const [relTouched, setRelTouched] = useState(false);
  const [body, setBody] = useState('');
  // Import
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const { t } = useT();

  const autoRel = title.trim() ? slugify(title) : '';
  const relValue = relTouched ? rel : autoRel;
  const cleanRel = relValue.trim().replace(/^\/+|\/+$/g, '').replace(/\.md$/, '').split('/').map(seg => slugify(seg)).filter(Boolean).join('/');
  const full = cleanRel ? `${layer}/${cleanRel}.md` : '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (tab === 'write') {
      if (!full) return;
      const hasH1 = /^\s*#\s+/.test(body);
      await onCreate(full, hasH1 || !title.trim() ? body : `# ${title.trim()}\n\n${body}`);
      return;
    }
    setImporting(true);
    try {
      const r = tab === 'url' ? await api.importUrl(url.trim())
        : tab === 'text' ? await api.importText(text, textTitle.trim() || undefined)
        : await api.importFile(file!);
      onImported(r);
    } catch (err) { toast((err as Error).message, { kind: 'error' }); }
    finally { setImporting(false); }
  }
  const ready = tab === 'write' ? !!full : tab === 'url' ? /^https?:\/\//.test(url.trim()) : tab === 'text' ? text.trim().length > 0 : !!file;
  const working = busy || importing;
  const tabBtn = (k: AddTab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === k} className={`px-3.5 py-[7px] text-[13px] ${tab === k ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft'}`} onClick={() => setTab(k)}>{label}</button>
  );
  const sub = tab === 'write'
    ? t('addModal.subWrite')
    : t('addModal.subImport');

  return (
    <Modal title={t('addModal.title')} sub={sub} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="mb-4 flex overflow-hidden rounded-lg border border-line w-fit" role="tablist" aria-label={t('addModal.tabs')}>
          {tabBtn('write', t('addModal.tabWrite'))}{tabBtn('url', t('addModal.tabUrl'))}{tabBtn('file', t('addModal.tabFile'))}{tabBtn('text', t('addModal.tabText'))}
        </div>

        {tab === 'write' && (
          <>
            <Field label={t('addModal.layer')} htmlFor="nf-layer">
              <select id="nf-layer" className={input} value={layer} onChange={e => setLayer(e.target.value)}>
                <option value="wiki">{t('layer.wiki')}</option>
                <option value="schema">{t('layer.schema')}</option>
                <option value="raw">{t('addModal.layerRaw')}</option>
              </select>
            </Field>
            <Field label={t('addModal.titleLabel')} htmlFor="nf-title">
              <input id="nf-title" className={input} placeholder={t('addModal.titlePh')} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            </Field>
            <Field label={t('addModal.fileLabel')} htmlFor="nf-path">
              <input id="nf-path" className={`${input} font-mono`} placeholder={t('addModal.filePh')} value={relValue} onChange={e => { setRel(e.target.value); setRelTouched(true); }} />
              <div className="mt-1 font-mono text-[11px] text-ink-faint">{full || ' '}</div>
            </Field>
            <Field label={t('addModal.bodyLabel')} htmlFor="nf-body">
              <textarea id="nf-body" className={`${input} font-serif leading-[1.9] resize-y`} rows={7} placeholder={t('addModal.bodyPh')} value={body} onChange={e => setBody(e.target.value)} />
            </Field>
          </>
        )}
        {tab === 'url' && (
          <Field label={t('addModal.urlLabel')} htmlFor="im-url">
            <input id="im-url" className={input} type="url" placeholder="https://doi.org/10.…" value={url} onChange={e => setUrl(e.target.value)} autoFocus />
          </Field>
        )}
        {tab === 'file' && (
          <Field label={t('addModal.uploadLabel')} htmlFor="im-file">
            <input id="im-file" className={input} type="file" accept=".pdf,.docx,.doc,.html,.htm,.md,.markdown,.txt,.bib,.bibtex,.json,application/pdf,text/plain,text/html" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}
        {tab === 'text' && (
          <>
            <Field label={t('addModal.textTitleLabel')} htmlFor="im-title"><input id="im-title" className={input} value={textTitle} onChange={e => setTextTitle(e.target.value)} /></Field>
            <Field label={t('addModal.textLabel')} htmlFor="im-text"><textarea id="im-text" className={`${input} font-serif leading-[1.9] resize-y`} rows={8} value={text} onChange={e => setText(e.target.value)} placeholder={t('addModal.textPh')} /></Field>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <button type="button" className={btnGhost} onClick={onClose} disabled={working}>{t('common.cancel')}</button>
          <button className={btnPrimary} disabled={working || !ready}>{working ? (tab === 'write' ? t('addModal.creating') : t('addModal.converting')) : tab === 'write' ? t('addModal.create') : t('addModal.import')}</button>
        </div>
      </form>
    </Modal>
  );
}
