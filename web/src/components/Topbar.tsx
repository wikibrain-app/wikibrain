import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Brand, btnGhost } from './ui';
import { useT } from '../i18n';

interface Props {
  email: string;
  name?: string;
  view: 'note' | 'graph' | 'table';
  onView: (v: 'note' | 'graph' | 'table') => void;
  onSearch: (q: string) => void;
  onNew: () => void;
  onSignOut: () => void;
  onToggleSidebar: () => void;
  onToggleRail: () => void;
  onChat: () => void;
  chatOpen: boolean;
  isAdmin?: boolean;
}

export function Topbar(p: Props) {
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const { t, lang } = useT();
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim()) p.onSearch(q.trim()); };
  return (
    <header className="flex flex-wrap items-center gap-2 sb:gap-4 border-b border-line bg-paper px-3 sb:px-5 py-2.5">
      <button className={`${btnGhost} sb:hidden px-2.5`} aria-label={t('topbar.menu')} onClick={p.onToggleSidebar}>☰</button>
      <Link to="/"><Brand tag /></Link>
      <form onSubmit={submit} className="order-last sb:order-none w-full sb:w-auto sb:flex-1 sb:max-w-[420px] flex items-center gap-2 rounded-lg border border-line bg-porcelain px-3 py-[7px] text-ink-soft">
        <span aria-hidden>🔍</span>
        <input type="search" aria-label={t('topbar.search')} placeholder={t('topbar.searchPh')} className="flex-1 bg-transparent text-[13px] text-ink outline-none" value={q} onChange={e => setQ(e.target.value)} />
      </form>
      <div className="ml-auto flex items-center gap-1.5 sb:gap-2.5">
        <div className="hidden sb:flex overflow-hidden rounded-lg border border-line" role="tablist" aria-label={t('topbar.views')}>
          <button role="tab" aria-selected={p.view === 'note'} className={`whitespace-nowrap px-2.5 sb:px-3 py-[7px] text-[12.5px] sb:text-[13px] ${p.view === 'note' ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft'}`} onClick={() => p.onView('note')}>{t('topbar.note')}</button>
          <button role="tab" aria-selected={p.view === 'graph'} className={`whitespace-nowrap px-2.5 sb:px-3 py-[7px] text-[12.5px] sb:text-[13px] ${p.view === 'graph' ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft'}`} onClick={() => p.onView('graph')}>{t('topbar.graph')}</button>
          <button role="tab" aria-selected={p.view === 'table'} className={`whitespace-nowrap px-2.5 sb:px-3 py-[7px] text-[12.5px] sb:text-[13px] ${p.view === 'table' ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft'}`} onClick={() => p.onView('table')} data-testid="tab-table">{t('topbar.table')}</button>
        </div>
        <button className={`${btnGhost} hidden sb:inline-flex`} onClick={p.onNew} title={t('topbar.newTitle')}>{t('topbar.new')}</button>
        <button className={`${btnGhost} ${p.chatOpen ? 'border-celadon text-celadon-deep' : ''}`} onClick={p.onChat} aria-pressed={p.chatOpen} data-testid="chat-toggle"><span className="sb:hidden">{t('topbar.chatShort')}</span><span className="hidden sb:inline">{t('topbar.chat')}</span></button>
        <Link to="/lint" className={`${btnGhost} hidden whitespace-nowrap sb:inline-flex`} title={t('topbar.lintTitle')} data-testid="lint-link">{t('topbar.lintBtn')}</Link>
        <button className={`${btnGhost} rail:hidden px-2.5`} aria-label={t('topbar.rail')} onClick={p.onToggleRail}>☷</button>
        <div className="relative">
          <button className={`${btnGhost} px-2.5`} aria-label={t('topbar.account')} aria-expanded={menu} onClick={() => setMenu(m => !m)}>⚙</button>
          {menu && (
            <div className="absolute right-0 mt-1 w-48 rounded-lg border border-line bg-paper py-1 shadow-lg z-30" onMouseLeave={() => setMenu(false)}>
              <div className="px-3 py-1.5 text-[11px] text-ink-faint">{p.name && <div className="truncate text-[12.5px] font-semibold text-ink">{p.name}</div>}<div className="truncate">{p.email}</div></div>
              <Link to="/settings" className="block px-3 py-2 text-[13px] hover:bg-celadon-mist">{t('topbar.settings')}</Link>
              <Link to="/stats" className="block px-3 py-2 text-[13px] hover:bg-celadon-mist">{t('topbar.stats')}</Link>
              {p.isAdmin && <Link to="/admin" className="block px-3 py-2 text-[13px] hover:bg-celadon-mist" data-testid="admin-link">{lang === 'en' ? 'Operations' : '營運狀態'}</Link>}
              <Link to="/help" className="block px-3 py-2 text-[13px] hover:bg-celadon-mist">{t('topbar.help')}</Link>
              <button className="block w-full text-left px-3 py-2 text-[13px] hover:bg-celadon-mist" onClick={p.onSignOut}>{t('topbar.signOut')}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
