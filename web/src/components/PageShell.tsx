import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { Brand, btnGhost } from './ui';
import { Footer } from './Footer';
import { useT } from '../i18n';

// Shared shell for settings / help / stats / lint pages: same width as the workspace (1280), responsive content area.
export function PageShell({ title, right, children, wide }: { title?: string; right?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { t } = useT();
  return (
    <div className="mx-auto flex min-h-full max-w-[1280px] flex-col overflow-x-hidden bg-paper shadow-[0_0_0_1px_var(--color-line)]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 sb:gap-4 border-b border-line px-3 sb:px-5 py-2.5">
        <Link to="/"><Brand tag /></Link>
        {title && <span className="text-[12px] text-ink-soft">{title}</span>}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">{right}<Link to="/" className={btnGhost}><span className="sb:hidden">{t('shell.backShort')}</span><span className="hidden sb:inline">{t('shell.back')}</span></Link></span>
      </header>
      <div className={`w-full flex-1 px-4 sb:px-8 py-6 sb:py-8 ${wide ? '' : 'mx-auto max-w-[960px]'}`}>{children}</div>
      <Footer />
    </div>
  );
}
