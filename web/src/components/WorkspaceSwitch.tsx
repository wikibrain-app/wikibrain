import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../i18n';
import { useToast } from '../lib/toast';

/* Which knowledge base you are in, and how to move between them. It sits next to the brand because that is where a
   person looks to answer "where am I" — and because with one knowledge base it says exactly that and nothing more,
   which is what most accounts will see. */
export function WorkspaceSwitch({ name, onSwitched }: { name: string; onSwitched: () => void }) {
  const { t } = useT();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [limit, setLimit] = useState(1);
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.workspaces().then(r => { setList(r.workspaces); setLimit(r.limit); setCurrent(r.current); }).catch(() => setList([]));
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const go = async (id: string) => {
    if (id === current) { setOpen(false); return; }
    setBusy(true);
    try { await api.switchWorkspace(id); onSwitched(); }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
    finally { setBusy(false); setOpen(false); }
  };
  const create = async () => {
    setBusy(true);
    try { await api.createWorkspace(); onSwitched(); }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
    finally { setBusy(false); setOpen(false); }
  };

  return (
    <div className="relative" ref={box}>
      <button type="button" className="max-w-[170px] truncate rounded-md px-2 py-1 text-[12.5px] text-ink-soft hover:bg-celadon-mist hover:text-celadon-deep"
        onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="ws-switch">
        {name} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-line bg-paper py-1 shadow-lg" role="menu" data-testid="ws-menu">
          {list === null ? <div className="px-3 py-2 text-[12.5px] text-ink-faint">…</div> : (<>
            {list.map(w => (
              <button key={w.id} role="menuitem" disabled={busy} className={`block w-full truncate px-3 py-2 text-left text-[12.5px] hover:bg-celadon-mist ${w.id === current ? 'font-semibold text-celadon-deep' : ''}`}
                onClick={() => go(w.id)}>{w.id === current ? '✓ ' : '\u00a0\u00a0'}{w.name}</button>
            ))}
            <div className="my-1 border-t border-line" />
            {list.length < limit
              ? <button role="menuitem" disabled={busy} className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-celadon-mist" onClick={create} data-testid="ws-new">{t('ws.new')}</button>
              : <div className="px-3 py-2 text-[12px] leading-relaxed text-ink-faint">{t('ws.limit', { n: limit })}</div>}
            <a role="menuitem" href="/settings#account" className="block px-3 py-2 text-[12.5px] text-ink-soft hover:bg-celadon-mist">{t('ws.manage')}</a>
          </>)}
        </div>
      )}
    </div>
  );
}
