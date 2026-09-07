import { useEffect, useState } from 'react';
import { api, type ShareInfo } from '../lib/api';
import { fmtDate, useT } from '../i18n';
import { useToast } from '../lib/toast';
import { Modal, btnGhost, btnPrimary, input } from './ui';

// Public share link for one note (P1): create, copy, open, revoke. The link is /s/<token>; see src/shares.ts.
export function ShareModal({ path, onClose }: { path: string; onClose: () => void }) {
  const { t, lang } = useT();
  const { toast } = useToast();
  const [share, setShare] = useState<ShareInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.share(path).then(r => setShare(r.share)).catch(() => setShare(null)); }, [path]);
  const create = async () => { setBusy(true); try { setShare((await api.createShare(path)).share); } catch (e) { toast((e as Error).message, { kind: 'error' }); } finally { setBusy(false); } };
  const revoke = async () => { setBusy(true); try { await api.revokeShare(path); setShare(null); toast(t('share.revoked')); } catch (e) { toast((e as Error).message, { kind: 'error' }); } finally { setBusy(false); } };
  const copy = async () => { if (!share) return; try { await navigator.clipboard.writeText(share.url); toast(t('share.copied')); } catch { /* clipboard blocked */ } };
  return (
    <Modal title={t('share.title')} sub={t('share.sub')} onClose={onClose}>
      <div className="space-y-3" data-testid="share-modal">
        {share === undefined ? null : share ? (
          <>
            <input className={`${input} font-mono text-[12.5px]`} readOnly value={share.url} onFocus={e => e.currentTarget.select()} data-testid="share-url" />
            <div className="text-[12px] text-ink-faint">{t('share.since', { date: fmtDate(lang, share.created_at) })}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={copy}>{t('share.copy')}</button>
              <a className={`${btnGhost} inline-block`} href={share.url} target="_blank" rel="noreferrer">{t('share.open')}</a>
              <button type="button" className={`${btnGhost} hover:border-danger hover:text-danger`} onClick={revoke} disabled={busy} data-testid="share-revoke">{t('share.revoke')}</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-soft">{t('share.none')}</p>
            <button type="button" className={btnPrimary} onClick={create} disabled={busy} data-testid="share-create">{t('share.create')}</button>
          </>
        )}
      </div>
    </Modal>
  );
}
