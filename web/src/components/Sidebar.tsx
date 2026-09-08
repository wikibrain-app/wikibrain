import { useEffect, useMemo, useState } from 'react';
import type { NoteSummary } from '../lib/api';
import { useT } from '../i18n';

interface TreeNode { name: string; path: string; folders: Map<string, TreeNode>; notes: NoteSummary[] }
const LAYERS = ['raw', 'wiki', 'schema'] as const;
const LAYER_HINT: Record<string, string> = { raw: 'sidebar.hintRaw', wiki: 'sidebar.hintWiki', schema: 'sidebar.hintSchema' };
const DOT: Record<string, string> = { raw: 'bg-raw', wiki: 'bg-celadon', schema: 'bg-amber' };

function countUnder(n: TreeNode): number { let c = n.notes.length; n.folders.forEach(f => { c += countUnder(f); }); return c; }

function buildTree(notes: NoteSummary[]): Record<string, TreeNode> {
  const roots: Record<string, TreeNode> = {};
  for (const l of LAYERS) roots[l] = { name: l, path: l, folders: new Map(), notes: [] };
  for (const n of notes) {
    const segs = n.path.split('/');
    let node = roots[segs[0]];
    if (!node) continue;
    for (let i = 1; i < segs.length - 1; i++) {
      const p = segs.slice(0, i + 1).join('/');
      if (!node.folders.has(segs[i])) node.folders.set(segs[i], { name: segs[i], path: p, folders: new Map(), notes: [] });
      node = node.folders.get(segs[i])!;
    }
    node.notes.push(n);
  }
  return roots;
}

export function Sidebar({ notes, pending = [], active, onOpen, onNew, onImport }: { notes: NoteSummary[]; pending?: string[]; active: string | null; onOpen: (p: string) => void; onNew: (layer: string) => void; onImport: () => void }) {
  const tree = useMemo(() => buildTree(notes), [notes]);
  const { t } = useT();
  // Expansion state is kept in localStorage; by default only the three layers are open and folders are collapsed; the current page's path auto-expands.
  const KEY = 'wb-sidebar-open';
  const [open, setOpen] = useState<Set<string>>(() => { try { const v = localStorage.getItem(KEY); return new Set(v ? JSON.parse(v) : ['raw', 'wiki', 'schema']); } catch { return new Set(['raw', 'wiki', 'schema']); } });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify([...open])); } catch { /* ignore */ } }, [open]);
  useEffect(() => {
    if (!active) return;
    const segs = active.split('/');
    const need = segs.slice(0, -1).map((_, i) => segs.slice(0, i + 1).join('/'));
    setOpen(s => { if (need.every(p => s.has(p))) return s; const n = new Set(s); need.forEach(p => n.add(p)); return n; });
  }, [active]);
  const isOpen = (p: string) => open.has(p);
  const toggle = (p: string) => setOpen(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const collapseAll = () => setOpen(new Set());
  const expandAll = () => { const all = new Set<string>(); const walk = (n: TreeNode) => { all.add(n.path); n.folders.forEach(walk); }; Object.values(tree).forEach(walk); setOpen(all); };
  const count = (l: string) => notes.filter(n => n.path.startsWith(l + '/')).length;

  const renderFolder = (node: TreeNode, depth: number) => (
    <div key={node.path}>
      {[...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')).map(f => (
        <div key={f.path}>
          <button className="flex w-full items-center gap-1.5 py-1.5 text-left text-[12.5px] text-ink-soft hover:bg-celadon-mist" style={{ paddingLeft: 18 + depth * 12 }} onClick={() => toggle(f.path)} aria-expanded={isOpen(f.path)}>
            <span className="w-3 flex-none text-[10px]">{isOpen(f.path) ? '▾' : '▸'}</span><span className="truncate" title={f.path}>{f.name}</span><span className="ml-1 text-[10.5px] text-ink-faint">{countUnder(f)}</span>
          </button>
          {isOpen(f.path) && renderFolder(f, depth + 1)}
        </div>
      ))}
      {node.notes.map(n => (
        <button
          key={n.path}
          className={`block w-full truncate border-l-[3px] py-1.5 pr-4 text-left text-[13px] hover:bg-celadon-mist ${active === n.path ? 'border-celadon bg-paper font-semibold text-celadon-deep' : 'border-transparent text-ink'}`}
          style={{ paddingLeft: 34 + depth * 12 }}
          title={pending.includes(n.path) ? t('sidebar.pendingTitle', { path: n.path }) : n.path}
          onClick={() => onOpen(n.path)}
        >{pending.includes(n.path) && <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-amber align-middle" data-testid="pending-tag" aria-label={t('sidebar.pending')} />}{n.title}</button>
      ))}
    </div>
  );

  return (
    <nav className="h-full overflow-y-auto bg-porcelain pb-5 pt-2" aria-label={t('sidebar.label')}>
      <div className="flex items-center justify-end gap-2 px-[14px] pb-1 text-[11px] text-ink-faint">
        <button className="hover:text-celadon-deep" onClick={expandAll}>{t('sidebar.expandAll')}</button>
        <span>·</span>
        <button className="hover:text-celadon-deep" onClick={collapseAll} data-testid="collapse-all">{t('sidebar.collapseAll')}</button>
      </div>
      {LAYERS.map(l => (
        <div key={l} className="mb-1.5">
          <div className="flex items-center gap-1.5 whitespace-nowrap px-[14px] pb-1 pt-2 text-[12px] text-ink-soft">
            <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-celadon-deep" onClick={() => toggle(l)} aria-expanded={isOpen(l)} data-testid={`layer-${l}`}>
              <span className="w-3 flex-none text-[10px]">{isOpen(l) ? '▾' : '▸'}</span>
              <span className={`h-2 w-2 flex-none rounded-[2px] ${DOT[l]}`} />
              <span className="truncate">{t(`layer.${l}`)}</span>
            </button>
            <span className="text-[11px] text-ink-faint">{count(l)}</span>
            {l === 'raw'
              ? <button className="ml-auto rounded-md px-1.5 text-[12px] text-celadon-deep hover:bg-celadon-mist" onClick={onImport} title={t('sidebar.importTitle')}>{t('sidebar.import')}</button>
              : <span className="ml-auto cursor-help text-[11px] text-ink-faint" title={t(LAYER_HINT[l])} aria-label={t(LAYER_HINT[l])}>ⓘ</span>}
            <button className="rounded-md px-1.5 text-[12px] text-celadon-deep hover:bg-celadon-mist" aria-label={t('sidebar.newIn', { layer: l })} onClick={() => onNew(l)}>＋</button>
          </div>
          {isOpen(l) && renderFolder(tree[l], 0)}
          {isOpen(l) && count(l) === 0 && <div className="px-[34px] py-1 text-[12px] text-ink-faint">{t('sidebar.empty')}</div>}
        </div>
      ))}
      <div className="mt-4 border-t border-line px-[18px] py-3.5 text-[12px] leading-relaxed text-ink-soft">
        {t('sidebar.footer1')}<b className="text-celadon-deep">{t('sidebar.footerB')}</b>{t('sidebar.footer2')}
      </div>
    </nav>
  );
}
