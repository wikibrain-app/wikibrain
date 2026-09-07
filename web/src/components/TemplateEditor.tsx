import { useEffect, useState } from 'react';
import { api, type CustomTemplate } from '../lib/api';
import { useToast } from '../lib/toast';
import { Field, Modal, btnGhost, btnPrimary, input } from './ui';
import { useT } from '../i18n';

// Custom template editor: name, description, prompt, and each file's path and content (add/remove files).
export function TemplateEditor({ id, onSaved, onClose }: { id: number; onSaved: () => void; onClose: () => void }) {
  const [t, setT] = useState<CustomTemplate | null>(null);
  const [open, setOpen] = useState(0);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { t: tr } = useT();
  useEffect(() => { api.customTemplate(id).then(r => setT(r.template)).catch(e => toast((e as Error).message, { kind: 'error' })); }, [id]);
  if (!t) return null;
  const files = t.files ?? [];
  const setFile = (i: number, patch: Partial<{ path: string; content: string }>) => setT({ ...t, files: files.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  const addFile = () => { setT({ ...t, files: [...files, { path: 'wiki/new-page.md', content: tr('tplEdit.newPage') }] }); setOpen(files.length); };
  const removeFile = (i: number) => { if (files.length <= 1) { toast(tr('tplEdit.keepOne'), { kind: 'error' }); return; } setT({ ...t, files: files.filter((_, k) => k !== i) }); setOpen(0); };
  async function save() {
    setBusy(true);
    try { await api.updateTemplate(t!.id, { name: t!.name, description: t!.description, prompt: t!.prompt, files }); toast(tr('tplEdit.saved')); onSaved(); }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={tr('tplEdit.title')} sub={tr('tplEdit.sub')} onClose={onClose} wide>
      <div className="grid gap-3 sb:grid-cols-2">
        <Field label={tr('tplEdit.name')} htmlFor="tp-name"><input id="tp-name" className={input} value={t.name} onChange={e => setT({ ...t, name: e.target.value })} /></Field>
        <Field label={tr('tplEdit.desc')} htmlFor="tp-desc"><input id="tp-desc" className={input} value={t.description} onChange={e => setT({ ...t, description: e.target.value })} /></Field>
      </div>
      <Field label={tr('tplEdit.prompt')} htmlFor="tp-prompt"><textarea id="tp-prompt" className={`${input} resize-y`} rows={2} value={t.prompt} onChange={e => setT({ ...t, prompt: e.target.value })} /></Field>
      <div className="grid gap-3 sb:grid-cols-[220px_1fr]">
        <div>
          <div className="mb-1 flex items-center text-[12px] text-ink-soft">{tr('tplEdit.files')} <button className="ml-auto text-celadon-deep hover:underline" onClick={addFile}>{tr('tplEdit.add')}</button></div>
          <ul className="max-h-[46vh] overflow-y-auto rounded-lg border border-line bg-porcelain py-1 text-[12px]">
            {files.map((f, i) => (
              <li key={i} className="flex items-center">
                <button className={`min-w-0 flex-1 truncate px-3 py-1.5 text-left font-mono hover:bg-celadon-mist ${open === i ? 'bg-paper font-semibold text-celadon-deep' : ''}`} onClick={() => setOpen(i)}>{f.path}</button>
                <button className="px-2 text-ink-faint hover:text-danger" aria-label={tr('tplEdit.removeFile')} onClick={() => removeFile(i)}>×</button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {files[open] && (
            <>
              <Field label={tr('tplEdit.path')} htmlFor="tp-path"><input id="tp-path" className={`${input} font-mono`} value={files[open].path} onChange={e => setFile(open, { path: e.target.value })} /></Field>
              <textarea aria-label={tr('tplEdit.content')} className={`${input} h-[38vh] resize-y font-serif leading-[1.8]`} value={files[open].content} onChange={e => setFile(open, { content: e.target.value })} />
            </>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose} disabled={busy}>{tr('common.cancel')}</button><button className={btnPrimary} onClick={save} disabled={busy}>{busy ? tr('tplEdit.saving') : tr('tplEdit.save')}</button></div>
    </Modal>
  );
}
