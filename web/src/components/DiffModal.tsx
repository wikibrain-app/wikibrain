import { useMemo } from 'react';
import { Modal, btnGhost, btnPrimary } from './ui';
import { diffLines, withContext } from '../lib/diff';
import { formatAuthor, formatTime, type Version } from '../lib/api';
import { useT } from '../i18n';

// Compare a historical version with the current content before rolling back (Rail → 比較).
export function DiffModal({ version, current, currentVersion, onClose, onRollback }: { version: Version; current: string; currentVersion: number; onClose: () => void; onRollback?: (v: number) => void }) {
  const { t } = useT();
  const rows = useMemo(() => withContext(diffLines(version.content_md, current)), [version.content_md, current]);
  const added = rows.filter(r => r.kind === 'add').length, removed = rows.filter(r => r.kind === 'del').length;
  return (
    <Modal title={t('diff.title', { v: version.version, cur: currentVersion })} sub={`${formatAuthor(version.author)} · ${formatTime(version.created_at)} · ${t('diff.summary', { added, removed })}`} onClose={onClose} wide>
      <div className="max-h-[60vh] overflow-auto rounded-[10px] border border-line bg-porcelain font-mono text-[12px] leading-[1.6]" data-testid="diff-view">
        {rows.length === 0 || (added === 0 && removed === 0) ? <div className="p-4 text-ink-faint">{t('diff.same')}</div> : rows.map((r, i) => r.kind === 'skip'
          ? <div key={i} className="border-y border-dashed border-line px-3 py-1 text-[11px] text-ink-faint">{t('diff.skipped', { n: r.count })}</div>
          : <div key={i} className={`whitespace-pre-wrap break-words px-3 ${r.kind === 'add' ? 'bg-celadon-mist text-celadon-deep' : r.kind === 'del' ? 'bg-danger-mist text-danger line-through decoration-danger/40' : 'text-ink-soft'}`}><span className="mr-2 inline-block w-3 select-none text-ink-faint">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</span>{r.text || ' '}</div>)}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>{t('common.close')}</button>
        {onRollback && <button className={btnPrimary} onClick={() => { onRollback(version.version); onClose(); }} data-testid="diff-rollback">{t('version.rollback')} v{version.version}</button>}
      </div>
    </Modal>
  );
}
