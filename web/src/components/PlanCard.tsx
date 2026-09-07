import { useEffect, useState } from 'react';
import { api, type PlanStatus } from '../lib/api';
import { useT } from '../i18n';

// Plan status (decision 17): days left in the Pro trial, this month's agent-job usage on Free, keyless quota; the billing button only appears in Phase 2
const fmtMb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export function PlanCard() {
  const { t } = useT();
  const [p, setP] = useState<PlanStatus | null>(null);
  useEffect(() => { api.plan().then(setP).catch(() => {}); }, []);
  if (!p) return null;
  const name = p.plan === 'pro' ? t('plan.pro') : p.trial_active ? t('plan.trial') : t('plan.free');
  return (
    <section className="mb-10" data-testid="plan-card">
      <h2 className="text-[15px] font-semibold mb-1">{t('plan.title')}</h2>
      <div className="rounded-[10px] border border-line bg-porcelain px-4 py-3 text-[13px] leading-relaxed">
        <div><b>{name}</b>{p.trial_active && p.plan !== 'pro' ? t('plan.trialLeft', { days: p.trial_days_left }) : ''}</div>
        <div className="text-ink-soft">
          {p.runs_limit === null ? t('plan.unlimited', { n: p.runs_this_month }) : t('plan.runs', { used: p.runs_this_month, limit: p.runs_limit, month: p.month })}
          {p.trial_active && p.trial_runs_free > 0 && <> · {t('plan.trialRuns', { used: p.trial_runs_used, total: p.trial_runs_free })}</>}
        </div>
        <div className="text-ink-soft" data-testid="plan-limits">
          {t('plan.notes', { used: p.notes_used, limit: p.notes_limit })} · {t('plan.storage', { used: fmtMb(p.bytes_used), limit: fmtMb(p.bytes_limit) })} · {p.tokens_limit === null ? t('plan.tokensUnlimited') : t('plan.tokens', { n: p.tokens_limit })} · {t('plan.retention', { days: p.retention_days })}
        </div>
        {!p.trial_active && p.plan === 'free' && <div className="mt-1 text-[12px] text-ink-faint">{t('plan.upgradeHint')}</div>}
      </div>
    </section>
  );
}
