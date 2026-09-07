import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type PlanStatus } from '../lib/api';
import { useT } from '../i18n';

// One-line plan / quota status shown next to the actions that consume agent runs (pending banner, chat panel).
// Re-fetches whenever `refreshKey` changes (callers bump it when a job finishes).
const s = {
  'zh-TW': {
    trial: (d: number) => `Pro 體驗剩 ${d} 天`,
    free: 'Free', pro: 'Pro',
    runs: (n: number, limit: number | null) => limit === null ? `本月 agent 工作 ${n} 次` : `本月 agent 工作 ${n} / ${limit} 次`,
    noKey: (left: number, total: number) => `免 key 額度剩 ${left} / ${total} 次`,
    exhausted: '本月額度已用完',
    manage: '方案與用量',
  },
  en: {
    trial: (d: number) => `Pro trial: ${d} days left`,
    free: 'Free', pro: 'Pro',
    runs: (n: number, limit: number | null) => limit === null ? `${n} agent runs this month` : `${n} / ${limit} agent runs this month`,
    noKey: (left: number, total: number) => `${left} / ${total} keyless runs left`,
    exhausted: 'monthly quota used up',
    manage: 'Plan & usage',
  },
};

export function QuotaLine({ refreshKey = 0, className = '' }: { refreshKey?: number; className?: string }) {
  const { lang } = useT();
  const l = s[lang];
  const [p, setP] = useState<PlanStatus | null>(null);
  useEffect(() => { api.plan().then(setP).catch(() => {}); }, [refreshKey]);
  if (!p) return null;
  const parts: string[] = [];
  if (p.trial_active) parts.push(l.trial(p.trial_days_left));
  else parts.push(p.effective === 'pro' ? l.pro : l.free);
  parts.push(l.runs(p.runs_this_month, p.runs_limit));
  if (p.trial_active && p.trial_runs_free > 0) parts.push(l.noKey(Math.max(0, p.trial_runs_free - p.trial_runs_used), p.trial_runs_free));
  if (!p.can_run) parts.push(l.exhausted);
  return (
    <div className={`text-[11.5px] text-ink-faint ${className}`} data-testid="quota-line">
      {parts.join(' · ')} · <Link to="/settings" className="text-celadon-deep hover:underline">{l.manage}</Link>
    </div>
  );
}
