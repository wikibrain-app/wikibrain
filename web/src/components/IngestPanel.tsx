import { useEffect, useRef, useState } from 'react';
import { api, fmtTok, fmtUsd, type IngestJob } from '../lib/api';
import { btnGhost } from './ui';
import { useT } from '../i18n';

// Progress panel for server-side Ingest: polls every 1.5s, shows tool calls and results; calls onDone to reload the tree when finished.
export function IngestPanel({ jobId, onDone, onClose }: { jobId: number; onDone: () => void; onClose: () => void }) {
  const [job, setJob] = useState<IngestJob | null>(null);
  const doneRef = useRef(false);
  const { t } = useT();
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { job } = await api.ingestJob(jobId);
        if (!alive) return;
        setJob(job);
        if ((job.status === 'done' || job.status === 'failed') && !doneRef.current) { doneRef.current = true; onDone(); return; }
      } catch { /* retry next tick */ }
      if (alive) setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; };
  }, [jobId]);
  const label = (tool: string) => (['get_instructions', 'search_notes', 'read_note', 'create_note', 'update_note', 'list_folder'].includes(tool) ? t(`ingest.tool.${tool}`) : tool);
  return (
    <div className="mb-4 rounded-[10px] border border-celadon bg-celadon-mist/40 px-4 py-3 text-[12.5px]" data-testid="ingest-panel" data-status={job?.status ?? 'queued'}>
      <div className="flex items-center gap-2">
        <b>{job?.status === 'done' ? t('ingest.done') : job?.status === 'failed' ? t('ingest.failed') : t('ingest.running')}</b>
        {job && <span className="text-ink-soft">{t('ingest.meta', { provider: job.provider, model: job.model, steps: job.steps, in: fmtTok(job.tokens_in), out: fmtTok(job.tokens_out), usd: fmtUsd(job.cost_usd) })}{job.cost_usd === null && job.tokens_in + job.tokens_out > 0 ? t('ingest.priceUnknown') : ''}</span>}
        <button className={`${btnGhost} ml-auto`} onClick={onClose}>{job?.status === 'running' || !job ? t('ingest.background') : t('common.close')}</button>
      </div>
      {job?.error && <div className="mt-2 text-[#8A3B2E]">{job.error}</div>}
      <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto font-mono text-[11.5px] text-ink-soft">
        {job?.log.filter(e => e.type !== 'usage' && e.type !== 'result').map((e, i) => (
          <li key={i} className={e.type === 'text' ? 'font-sans text-ink whitespace-pre-wrap' : ''}>
            {e.type === 'tool' ? `▸ ${label(e.tool!)} ${typeof (e.input as any)?.path === 'string' ? (e.input as any).path : typeof (e.input as any)?.query === 'string' ? t('agent.quote', { q: (e.input as any).query }) : ''}` : e.type === 'error' ? `✖ ${e.text}` : e.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
