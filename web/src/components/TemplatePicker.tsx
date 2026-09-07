import { useEffect, useState } from 'react';
import { api, type CustomTemplate, type Lang, type Template } from '../lib/api';
import { TemplateEditor } from './TemplateEditor';
import { useToast } from '../lib/toast';
import { Modal, btnGhost, btnPrimary } from './ui';
import { Markdown } from './Markdown';
import { useT } from '../i18n';

// Scenario template picker (Q7): cards for the three templates, language choice, and the agent kickoff prompt returned after applying.
export function TemplatePicker({ onApplied, compact, minimal }: { onApplied: (r: { created: string[]; skipped: string[]; prompt: string }) => void; compact?: boolean; minimal?: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [custom, setCustom] = useState<CustomTemplate[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const { t, lang: uiLang } = useT();
  const [lang, setLang] = useState<Lang>(uiLang);
  const [picked, setPicked] = useState('general');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ files: { path: string; content: string }[]; open: string } | null>(null);
  const { toast } = useToast();
  async function openPreview() {
    try {
      const files = isCustom ? (await api.customTemplate(Number(picked.slice(7)))).template.files ?? [] : (await api.templateFiles(picked, lang)).files;
      setPreview({ files, open: files.find(f => f.path.startsWith('schema/'))?.path ?? files[0]?.path ?? '' });
    }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
  }
  const load = () => api.templates().then(r => { setTemplates(r.templates); setCustom(r.custom ?? []); }).catch(e => toast(e.message, { kind: 'error' }));
  useEffect(() => { load(); }, []);
  const isCustom = picked.startsWith('custom:');
  async function duplicate() { try { const { template } = await api.duplicateTemplate(picked, lang); await load(); setPicked(`custom:${template.id}`); setEditing(template.id); } catch (e) { toast((e as Error).message, { kind: 'error' }); } }
  async function snapshot() { const name = prompt(t('tpl.snapshotName'), t('tpl.snapshotDefault')); if (name === null) return; try { const { template } = await api.snapshotTemplate(name); await load(); setPicked(`custom:${template.id}`); toast(t('tpl.snapshotted')); } catch (e) { toast((e as Error).message, { kind: 'error' }); } }
  async function remove(id: number) { if (!confirm(t('tpl.confirmDelete'))) return; try { await api.deleteTemplate(id); await load(); if (picked === `custom:${id}`) setPicked('general'); } catch (e) { toast((e as Error).message, { kind: 'error' }); } }
  async function apply() {
    setBusy(true);
    try {
      const r = await api.applyTemplate(picked, lang);
      // Decision 15(d): after applying the researcher template, the table view defaults to a bibliography (scope raw/sources; columns authors / year / title / venue / citation_key)
      if (picked === 'researcher') { try { localStorage.setItem('wb-table-view', JSON.stringify({ folder: 'raw/sources', cols: ['authors', 'year', '$title', 'venue', 'citation_key'], filters: {}, sort: { key: 'year', dir: -1 }, group: '' })); } catch { /* ignore */ } }
      onApplied(r);
    }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
    finally { setBusy(false); }
  }
  return (
    <div data-testid="template-picker">
      <div className={`grid gap-2.5 ${compact ? 'sm:grid-cols-3' : 'sb:grid-cols-3'}`}>
        {custom.map(c => (
          <div key={`c${c.id}`} className={`relative rounded-[10px] border p-3.5 text-left transition ${picked === `custom:${c.id}` ? 'border-celadon bg-celadon-mist' : 'border-line bg-paper hover:border-celadon'}`} data-testid={`custom-template-${c.id}`}>
            <button type="button" aria-pressed={picked === `custom:${c.id}`} onClick={() => setPicked(`custom:${c.id}`)} className="block w-full text-left">
              <div className="font-serif text-[16px] font-bold">{c.name} <span className="ml-1 rounded bg-[#FBF5EA] px-1 text-[10px] font-normal text-amber align-middle">{t('tpl.custom')}</span></div>
              <div className="mt-1 text-[12px] leading-relaxed text-ink-soft">{c.description || t('tpl.noDesc')}</div>
            </button>
            <div className="mt-2 flex gap-2 text-[11.5px]">
              <button type="button" className="text-celadon-deep hover:underline" onClick={() => setEditing(c.id)}>{t('common.edit')}</button>
              <button type="button" className="text-ink-faint hover:text-[#8A3B2E]" onClick={() => remove(c.id)}>{t('common.delete')}</button>
            </div>
          </div>
        ))}
        {templates.map(tp => (
          <button key={tp.id} type="button" aria-pressed={picked === tp.id} onClick={() => setPicked(tp.id)}
            className={`rounded-[10px] border p-3.5 text-left transition ${picked === tp.id ? 'border-celadon bg-celadon-mist' : 'border-line bg-paper hover:border-celadon'}`}>
            <div className="font-serif text-[16px] font-bold">{tp.name[lang]}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-ink-soft">{tp.description[lang]}</div>
          </button>
        ))}
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink-soft">{t('tpl.lang')}</span>
        <div className="flex overflow-hidden rounded-lg border border-line" role="tablist">
          {(['zh-TW', 'en'] as Lang[]).map(l => (
            <button key={l} role="tab" aria-selected={lang === l} className={`px-3 py-1.5 text-[12.5px] ${lang === l ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft'}`} onClick={() => setLang(l)}>{t(`lang.${l}`)}</button>
          ))}
        </div>
        {!minimal && <button className={btnGhost} onClick={snapshot} title={t('tpl.snapshotTitle')} data-testid="template-snapshot">{t('tpl.snapshot')}</button>}
        {!minimal && !isCustom && <button className={btnGhost} onClick={duplicate} data-testid="template-duplicate">{t('tpl.duplicate')}</button>}
        <button className={`${btnGhost} ml-auto`} onClick={openPreview} disabled={!templates.length} data-testid="template-preview">{t('tpl.preview')}</button>
        <button className={btnPrimary} onClick={apply} disabled={busy || !templates.length}>{busy ? t('tpl.applying') : t('tpl.apply')}</button>
      </div>
      {editing !== null && <TemplateEditor id={editing} onSaved={() => { setEditing(null); load(); }} onClose={() => setEditing(null)} />}
      {preview && (
        <Modal title={t('tpl.previewTitle', { name: templates.find(tp => tp.id === picked)?.name[lang] ?? picked })} sub={t('tpl.previewSub')} onClose={() => setPreview(null)} wide>
          <div className="grid gap-3 sb:grid-cols-[200px_1fr]">
            <ul className="max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-porcelain py-1 text-[12px]">
              {preview.files.map(f => (
                <li key={f.path}><button className={`w-full truncate px-3 py-1.5 text-left font-mono hover:bg-celadon-mist ${preview.open === f.path ? 'bg-paper font-semibold text-celadon-deep' : ''}`} onClick={() => setPreview({ ...preview, open: f.path })}>{f.path}</button></li>
              ))}
            </ul>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-paper px-5 py-3">
              <Markdown source={preview.files.find(f => f.path === preview.open)?.content ?? ''} notes={[]} onOpen={() => {}} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setPreview(null)}>{t('common.close')}</button><button className={btnPrimary} onClick={() => { setPreview(null); apply(); }} disabled={busy}>{t('tpl.applyThis')}</button></div>
        </Modal>
      )}
    </div>
  );
}

// showPrompt=false (onboarding): hide the Cursor kickoff prompt so new users are not confused; the settings page keeps it.
export function AppliedResult({ r, onClose, showPrompt = true }: { r: { created: string[]; skipped: string[]; prompt: string }; onClose: () => void; showPrompt?: boolean }) {
  const { toast } = useToast();
  const { t } = useT();
  const copy = () => navigator.clipboard.writeText(r.prompt).then(() => toast(t('tpl.promptCopied'))).catch(() => toast(t('common.clipboardFail'), { kind: 'error' }));
  return (
    <div data-testid="template-applied">
      <p className="text-[13px] leading-relaxed">{t('tpl.created1')}<b>{r.created.length}</b>{t('tpl.created2')}{r.skipped.length > 0 && t('tpl.skipped', { n: r.skipped.length })}{t('tpl.period')}</p>
      {showPrompt ? (<>
      <p className="mt-3 text-[12px] text-ink-soft">{t('tpl.howTo')}</p>
      <div className="relative mt-1.5 rounded-[10px] bg-[#26332E] p-3.5 pr-16 font-serif text-[13px] leading-relaxed text-[#DDEAE4]">
        <button className="absolute right-2.5 top-2.5 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-sans hover:bg-white/20" onClick={copy}>{t('common.copy')}</button>
        {r.prompt}
      </div>
      </>) : <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">{t('tpl.appliedHint')}</p>}
      <div className="mt-4 flex justify-end"><button className={btnGhost} onClick={onClose}>{t('ui.done')}</button></div>
    </div>
  );
}
