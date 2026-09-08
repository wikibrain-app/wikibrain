import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { btnGhost, btnPrimary, input } from '../components/ui';

/* In-app confirmation dialog replacing window.confirm / window.prompt (those look foreign, especially on phones).
   const confirm = useConfirm();
   const ok = await confirm({ title, body, danger: true });                       // → true | false
   const pw = await confirm({ title, body, input: { type: 'password', label } }); // → string | null */
export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  input?: { label: string; type?: 'text' | 'password'; placeholder?: string; defaultValue?: string; required?: boolean };
}
type Resolver = (v: string | boolean | null) => void;
const Ctx = createContext<(o: ConfirmOptions) => Promise<string | boolean | null>>(() => Promise.resolve(false));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ o: ConfirmOptions; resolve: Resolver } | null>(null);
  const [value, setValue] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<string | boolean | null>(resolve => { setValue(o.input?.defaultValue ?? ''); setState({ o, resolve }); }), []);
  const close = (v: string | boolean | null) => { state?.resolve(v); setState(null); };
  useEffect(() => {
    if (!state) return;
    fieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(state.o.input ? null : false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && <Dialog o={state.o} value={value} setValue={setValue} fieldRef={fieldRef} onCancel={() => close(state.o.input ? null : false)} onOk={() => close(state.o.input ? value : true)} />}
    </Ctx.Provider>
  );
}
export const useConfirm = () => useContext(Ctx);

function Dialog({ o, value, setValue, fieldRef, onCancel, onOk }: { o: ConfirmOptions; value: string; setValue: (v: string) => void; fieldRef: React.RefObject<HTMLInputElement | null>; onCancel: () => void; onOk: () => void }) {
  const { t } = useT();
  const disabled = !!o.input && (o.input.required ?? true) && value.trim() === '';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-5" onClick={e => { if (e.target === e.currentTarget) onCancel(); }} role="alertdialog" aria-modal="true" aria-label={o.title} data-testid="confirm-dialog">
      <form className="w-full max-w-[440px] rounded-[14px] bg-paper p-6 shadow-2xl" onSubmit={e => { e.preventDefault(); if (!disabled) onOk(); }}>
        <h2 className={`font-serif text-[19px] font-bold ${o.danger ? 'text-danger' : ''}`}>{o.title}</h2>
        {o.body && <div className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{o.body}</div>}
        {o.input && (
          <label className="mt-4 block text-[12px] text-ink-soft">{o.input.label}
            <input ref={fieldRef} type={o.input.type ?? 'text'} className={`${input} mt-1`} value={value} placeholder={o.input.placeholder} autoComplete={o.input.type === 'password' ? 'current-password' : 'off'} onChange={e => setValue(e.target.value)} data-testid="confirm-input" />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onCancel} data-testid="confirm-cancel">{o.cancelLabel ?? t('common.cancel')}</button>
          <button type="submit" className={o.danger ? `${btnPrimary} !bg-danger hover:!bg-danger` : btnPrimary} disabled={disabled} autoFocus={!o.input} data-testid="confirm-ok">{o.confirmLabel ?? t('common.ok')}</button>
        </div>
      </form>
    </div>
  );
}
