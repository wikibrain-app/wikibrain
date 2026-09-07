import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { mcpJson } from '../pages/Settings';
import { Modal, btnGhost, btnPrimary } from './ui';

export function ConnectCursorModal({ mcpUrl, onClose }: { mcpUrl: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { t } = useT();
  const snippet = mcpJson(mcpUrl, token ?? t('connect.tokenPh'));
  async function generate() {
    setBusy(true);
    try { setToken((await api.createToken('cursor')).token); toast(t('connect.generated')); }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
    finally { setBusy(false); }
  }
  const copy = () => navigator.clipboard.writeText(snippet).then(() => toast(t('connect.copied'))).catch(() => toast(t('common.clipboardFail'), { kind: 'error' }));
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div className="mb-4 flex gap-3">
      <span className="mt-[1px] flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-celadon-mist text-[12px] font-bold text-celadon-deep">{n}</span>
      <p className="text-[13px] leading-relaxed">{children}</p>
    </div>
  );
  return (
    <Modal title={t('connect.title')} sub={t('connect.sub')} onClose={onClose}>
      <Step n={1}>{token ? <>{t('connect.step1a')}<b>.cursor/mcp.json</b>{t('connect.step1b')}</> : t('connect.step1Gen')}</Step>
      <div className="relative mb-1 mt-1.5 overflow-x-auto rounded-[10px] bg-code text-code-fg p-4 font-mono text-[12px] leading-relaxed">
        {token
          ? <button className="absolute right-2.5 top-2.5 rounded-md bg-white/10 px-2.5 py-1 text-[11px] hover:bg-white/20" onClick={copy}>{t('common.copy')}</button>
          : <button className="absolute right-2.5 top-2.5 rounded-md bg-celadon px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-celadon-deep" onClick={generate} disabled={busy}>{busy ? t('connect.generating') : t('connect.generate')}</button>}
        <pre data-testid="mcp-json">{snippet}</pre>
      </div>
      <Step n={2}>{t('connect.step2a')}<b>wikibrain</b>{t('connect.step2b')}</Step>
      <Step n={3}>{t('connect.step3')}</Step>
      <div className="mt-5 flex justify-end gap-2.5">
        {token && <button className={btnGhost} onClick={generate} disabled={busy}>{t('connect.reissue')}</button>}
        <button className={btnPrimary} onClick={onClose}>{t('ui.done')}</button>
      </div>
    </Modal>
  );
}
