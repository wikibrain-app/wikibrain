import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';

interface Toast { id: number; message: string; action?: { label: string; onClick: () => void }; kind: 'info' | 'error' }
interface Ctx { toast: (message: string, opts?: { action?: Toast['action']; kind?: Toast['kind']; sticky?: boolean }) => void }

const ToastCtx = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t: tt } = useT();
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const toast = useCallback<Ctx['toast']>((message, opts = {}) => {
    const id = ++seq.current;
    setItems(list => [...list, { id, message, action: opts.action, kind: opts.kind ?? 'info' }]);
    if (!opts.sticky) setTimeout(() => setItems(list => list.filter(t => t.id !== id)), opts.action ? 6000 : 2600);
  }, []);
  const dismiss = (id: number) => setItems(list => list.filter(t => t.id !== id));
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex w-[min(640px,calc(100%-2rem))] flex-col-reverse gap-2 pointer-events-none" role="status" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`toast pointer-events-auto flex items-center gap-3 rounded-[10px] px-4 py-2.5 text-[13px] text-white shadow-lg ${t.kind === 'error' ? 'bg-danger' : 'bg-ink'}`}>
            <span>{t.message}</span>
            {t.action && (
              <button className="rounded-md bg-white/15 px-2.5 py-1 text-[12px] font-semibold hover:bg-white/25" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button className="text-white/60 hover:text-white" aria-label={tt('common.close')} onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
