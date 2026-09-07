import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Footer version: package.json version + short git hash, shared by the settings and help pages.
export function Version({ className = 'px-6 pb-6' }: { className?: string }) {
  const [v, setV] = useState<{ version: string; commit: string } | null>(null);
  useEffect(() => { api.config().then(c => setV({ version: c.version, commit: c.commit })).catch(() => {}); }, []);
  if (!v) return null;
  return <div className={`text-[11px] text-ink-faint ${className}`} data-testid="app-version">WikiBrain v{v.version}{v.commit && v.commit !== 'unknown' ? ` · ${v.commit}` : ''}</div>;
}
