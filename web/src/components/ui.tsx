import { useEffect, type ReactNode } from 'react';
import { useT } from '../i18n';

export const btnPrimary = 'whitespace-nowrap rounded-lg bg-celadon px-3 sb:px-4 py-2 text-[12.5px] sb:text-[13px] font-semibold text-white hover:bg-celadon-deep disabled:opacity-50';
export const btnGhost = 'whitespace-nowrap rounded-lg border border-line px-3 sb:px-3.5 py-[7px] text-[12.5px] sb:text-[13px] text-ink-soft hover:border-celadon hover:text-celadon-deep disabled:opacity-50';
export const input = 'w-full rounded-lg border border-line bg-paper px-[11px] py-[9px] text-[13px] text-ink focus:border-celadon';

export function Modal({ title, sub, children, onClose, wide }: { title: string; sub?: ReactNode; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/45 p-5" onClick={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? 'max-w-[680px]' : 'max-w-[560px]'} rounded-[14px] bg-paper p-8 shadow-2xl max-h-[92vh] overflow-y-auto`}>
        <h2 className="font-serif text-[21px] font-bold mb-1">{title}</h2>
        {sub && <p className="text-[13px] text-ink-soft leading-relaxed mb-5">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="mb-3.5">
      <label htmlFor={htmlFor} className="block text-[12px] text-ink-soft mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function Brand({ tag }: { tag?: boolean }) {
  const { t } = useT();
  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="font-serif text-[18px] font-bold tracking-[.5px]">Wiki<span className="text-celadon-deep">Brain</span></span>
      {tag && <span className="text-[12px] text-ink-soft hidden sb:inline">{t('brand.tag')}</span>}
    </span>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center p-5">
      <div className="w-full max-w-[400px] rounded-[14px] bg-paper p-8 shadow-[0_0_0_1px_var(--color-line)]">
        <div className="mb-6"><Brand /></div>
        {children}
      </div>
    </div>
  );
}
