import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoteSummary } from '../lib/api';
import { useT } from '../i18n';

/* Cmd+K / Ctrl+K palette: jump to any page by title or path, or run an action (new, chat, graph, table, settings, help).
   Pure client-side over the tree the workspace already holds, so it is instant. */
export interface PaletteAction { id: string; label: string; hint?: string; run: () => void }
export function CommandPalette({ notes, actions, onOpen, onClose }: { notes: NoteSummary[]; actions: PaletteAction[]; onOpen: (path: string) => void; onClose: () => void }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const acts = actions.filter(a => !needle || a.label.toLowerCase().includes(needle)).map(a => ({ kind: 'action' as const, key: 'a:' + a.id, label: a.label, hint: a.hint, run: a.run }));
    const score = (n: NoteSummary) => { const title = n.title.toLowerCase(), path = n.path.toLowerCase(); if (!needle) return 1; if (title.startsWith(needle)) return 4; if (title.includes(needle)) return 3; if (path.includes(needle)) return 2; return 0; };
    const pages = notes.map(n => ({ n, s: score(n) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.n.path.localeCompare(b.n.path)).slice(0, needle ? 12 : 8)
      .map(({ n }) => ({ kind: 'page' as const, key: 'p:' + n.path, label: n.title, hint: n.path, run: () => onOpen(n.path) }));
    return needle ? [...pages, ...acts] : [...acts, ...pages];
  }, [q, notes, actions, onOpen]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[sel]; if (it) { it.run(); onClose(); } }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[12vh]" onClick={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={t('palette.title')} data-testid="palette">
      <div className="w-full max-w-[560px] overflow-hidden rounded-[14px] bg-paper shadow-2xl">
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder={t('palette.placeholder')} aria-label={t('palette.title')} className="w-full border-b border-line bg-paper px-4 py-3 text-[15px] outline-none" data-testid="palette-input" />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
          {items.length === 0 && <div className="px-4 py-3 text-[13px] text-ink-faint">{t('palette.empty')}</div>}
          {items.map((it, i) => (
            <button key={it.key} data-i={i} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => { it.run(); onClose(); }}
              className={`flex w-full items-baseline gap-3 px-4 py-2 text-left ${i === sel ? 'bg-celadon-mist' : ''}`}>
              <span className={`w-10 flex-none text-[10px] uppercase tracking-[.06em] ${it.kind === 'action' ? 'text-amber' : 'text-ink-faint'}`}>{it.kind === 'action' ? t('palette.action') : t('palette.page')}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{it.label}</span>
              {it.hint && <span className="hidden truncate font-mono text-[11px] text-ink-faint sm:inline max-w-[45%]">{it.hint}</span>}
            </button>
          ))}
        </div>
        <div className="border-t border-line px-4 py-1.5 text-[11px] text-ink-faint">{t('palette.hint')}</div>
      </div>
    </div>
  );
}
