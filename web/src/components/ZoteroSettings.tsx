import { useEffect, useState, type FormEvent } from 'react';
import { api, formatTime, type ZoteroLink } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { Field, btnGhost, btnPrimary, input } from './ui';

// Zotero sync section of the settings page (academic (3)): paste API key -> test and list collections -> save -> sync now / hourly
export function ZoteroSettings({ onSynced }: { onSynced?: () => void }) {
  const { t } = useT();
  const { toast } = useToast();
  const [link, setLink] = useState<ZoteroLink | null>(null);
  const [key, setKey] = useState('');
  const [colls, setColls] = useState<{ key: string; name: string; parent: string | null; count: number }[] | null>(null);
  const [user, setUser] = useState<{ userID: string; username: string | null } | null>(null);
  const [coll, setColl] = useState('');
  const [withPdf, setWithPdf] = useState(true);
  const [busy, setBusy] = useState<'test' | 'save' | 'sync' | null>(null);
  const load = () => api.zotero().then(r => { setLink(r.link); if (r.link) { setColl(r.link.collection_key ?? ''); setWithPdf(r.link.with_pdf); } }).catch(() => {});
  useEffect(() => { load(); }, []);
  async function test() {
    setBusy('test');
    try { const r = await api.zoteroCollections(key.trim() || undefined); setColls(r.collections); setUser(r.user); toast(t('zotero.tested', { n: r.collections.length })); }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
    finally { setBusy(null); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy('save');
    try {
      const name = colls?.find(c => c.key === coll)?.name ?? (coll ? link?.collection_name ?? null : null);
      const r = await api.zoteroSave({ apiKey: key.trim() || undefined, collectionKey: coll || null, collectionName: name, withPdf });
      setLink(r.link); setKey(''); toast(t('zotero.saved'));
    } catch (err) { toast((err as Error).message, { kind: 'error' }); }
    finally { setBusy(null); }
  }
  async function sync() {
    setBusy('sync');
    try { const r = await api.zoteroSync(); setLink(r.link); toast(t('zotero.synced', { added: r.result.added.length, skipped: r.result.skipped, pdfs: r.result.pdfs }), { sticky: r.result.errors.length > 0 }); onSynced?.(); }
    catch (err) { toast((err as Error).message, { kind: 'error' }); }
    finally { setBusy(null); }
  }
  async function disconnect() {
    if (!confirm(t('zotero.disconnectConfirm'))) return;
    try { await api.zoteroDelete(); setLink(null); setColls(null); setUser(null); setColl(''); toast(t('zotero.disconnected')); } catch (err) { toast((err as Error).message, { kind: 'error' }); }
  }
  const tree = (colls ?? []).filter(c => !c.parent).flatMap(c => [c, ...(colls ?? []).filter(x => x.parent === c.key).map(x => ({ ...x, name: `　${x.name}` }))]);
  return (
    <section className="mb-10" data-testid="zotero-settings">
      <h2 className="text-[15px] font-semibold mb-1">{t('zotero.title')}</h2>
      <p className="text-[12.5px] text-ink-soft mb-4 leading-relaxed">{t('zotero.intro')}<a className="text-celadon-deep underline" href="https://www.zotero.org/settings/keys/new" target="_blank" rel="noreferrer">zotero.org/settings/keys</a>{t('zotero.intro2')}</p>
      {link && (
        <div className="mb-3 rounded-[10px] border border-line bg-porcelain px-4 py-2.5 text-[12.5px]" data-testid="zotero-status">
          {t('zotero.current', { user: link.username ?? link.zotero_user_id, last4: link.key_last4 })}<b>{link.collection_name ?? t('zotero.wholeLibrary')}</b>
          {link.last_sync_at ? <span className="ml-2 text-ink-soft">{t('zotero.lastSync', { time: formatTime(link.last_sync_at) })}{link.last_result ? t('zotero.lastResult', { added: link.last_result.added.length, skipped: link.last_result.skipped, pdfs: link.last_result.pdfs }) : ''}</span> : <span className="ml-2 text-ink-soft">{t('zotero.neverSynced')}</span>}
          {link.last_error && <div className="mt-1 text-danger">{t('zotero.lastError')}{link.last_error}</div>}
          <div className="mt-2 flex gap-2">
            <button type="button" className={btnPrimary} onClick={sync} disabled={busy !== null} data-testid="zotero-sync">{busy === 'sync' ? t('zotero.syncing') : t('zotero.syncNow')}</button>
            <button type="button" className={btnGhost} onClick={disconnect}>{t('zotero.disconnect')}</button>
          </div>
        </div>
      )}
      <form onSubmit={save} className="max-w-[720px]">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-start">
          <Field label={link ? t('zotero.keyKeep') : 'Zotero API key'} htmlFor="zotero-key">
            <input id="zotero-key" className={`${input} font-mono`} type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={link ? `…${link.key_last4}` : ''} />
          </Field>
          <div className="pt-[22px]"><button type="button" className={btnGhost} onClick={test} disabled={busy !== null || (!key.trim() && !link)} data-testid="zotero-test">{busy === 'test' ? t('zotero.testing') : t('zotero.test')}</button></div>
        </div>
        {(colls || link) && (
          <Field label={t('zotero.collection')} htmlFor="zotero-coll">
            <select id="zotero-coll" className={input} value={coll} onChange={e => setColl(e.target.value)} data-testid="zotero-coll">
              <option value="">{t('zotero.wholeLibrary')}{user ? `（${user.username ?? user.userID}）` : ''}</option>
              {tree.map(c => <option key={c.key} value={c.key}>{c.name}（{c.count}）</option>)}
              {!colls && link?.collection_key && <option value={link.collection_key}>{link.collection_name}</option>}
            </select>
          </Field>
        )}
        <label className="mb-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={withPdf} onChange={e => setWithPdf(e.target.checked)} />{t('zotero.withPdf')}</label>
        <button className={btnPrimary} disabled={busy !== null || (!key.trim() && !link)} data-testid="zotero-save">{busy === 'save' ? t('zotero.saving') : t('common.save')}</button>
        <p className="mt-2 text-[12px] text-ink-faint">{t('zotero.note')}</p>
      </form>
    </section>
  );
}
