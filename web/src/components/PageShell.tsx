import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { Brand, btnGhost } from './ui';
import { Footer } from './Footer';
import { useT } from '../i18n';

// Shared shell for settings / help / stats / lint pages: same width as the workspace (1280), responsive content area.
export function PageShell({ title, right, children, wide }: { title?: string; right?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { t } = useT();
  return (
    <div className="mx-auto flex min-h-full max-w-[1280px] flex-col bg-paper shadow-[0_0_0_1px_var(--color-line)]">
      <header className="flex items-center gap-3 sb:gap-4 border-b border-line px-3 sb:px-5 py-2.5">
        <Link to="/"><Brand tag /></Link>
        {title && <span className="text-[12px] text-ink-soft">{title}</span>}
        <span className="ml-auto flex items-center gap-2">{right}<Link to="/" className={btnGhost}>{t('shell.back')}</Link></span>
      </header>
      <div className={`w-full flex-1 px-4 sb:px-8 py-6 sb:py-8 ${wide ? '' : 'mx-auto max-w-[960px]'}`}>{children}</div>
      <Footer />
    </div>
  );
}
