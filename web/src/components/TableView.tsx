import { useEffect, useMemo, useState } from 'react';
import { api, formatAuthor, formatTime, type NoteProps, type PropValue } from '../lib/api';
import { useToast } from '../lib/toast';
import { btnGhost, input } from './ui';
import { useT, type TFn } from '../i18n';

/* ── Table view (our counterpart to Obsidian Bases / Dataview):
   treats note front-matter as a database: pick a scope, choose columns, filter per column, sort, group. State is kept in localStorage. ── */
const SYS_COLS: { key: string; label: string }[] = [
  { key: '$title', label: 'table.col.title' }, { key: '$path', label: 'table.col.path' }, { key: '$updated', label: 'table.col.updated' }, { key: '$created', label: 'table.col.created' },
  { key: '$author', label: 'table.col.author' }, { key: '$inbound', label: 'table.col.inbound' }, { key: '$version', label: 'table.col.version' },
];
const cellOf = (r: NoteProps, key: string): PropValue | string | number => {
  switch (key) {
    case '$title': return r.title; case '$path': return r.path; case '$updated': return r.updated_at; case '$created': return r.created_at;
    case '$author': return formatAuthor(r.author); case '$inbound': return r.inbound; case '$version': return r.version;
    default: return r.props[key] ?? null;
  }
};
const show = (v: PropValue | string | number, key: string, t: TFn): string => {
  if (v === null || v === undefined) return '';
  if (key === '$updated' || key === '$created') return formatTime(String(v));
  if (Array.isArray(v)) return v.join(t('table.sep'));
  return String(v);
};
const cmp = (a: PropValue | string | number, b: PropValue | string | number) => {
  const na = a === null || a === undefined || a === '', nb = b === null || b === undefined || b === '';
  if (na && nb) return 0; if (na) return 1; if (nb) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(Array.isArray(a) ? a.join('、') : a).localeCompare(String(Array.isArray(b) ? b.join('、') : b), 'zh-Hant', { numeric: true });
};

interface State { folder: string; cols: string[]; filters: Record<string, string>; sort: { key: string; dir: 1 | -1 } | null; group: string }
const DEFAULT: State = { folder: '', cols: ['$title', '$path', '$updated', '$inbound'], filters: {}, sort: { key: '$updated', dir: -1 }, group: '' };

export function TableView({ onOpen, folders }: { onOpen: (p: string) => void; folders: string[] }) {
  const KEY = 'wb-table-view';
  const [st, setSt] = useState<State>(() => { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULT; } });
  const [rows, setRows] = useState<NoteProps[]>([]);
  const [keys, setKeys] = useState<{ key: string; count: number }[]>([]);
  const { toast } = useToast();
  const { t } = useT();
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ } }, [st]);
  useEffect(() => { api.noteProps(st.folder || undefined).then(r => { setRows(r.rows); setKeys(r.keys); }).catch(e => toast((e as Error).message, { kind: 'error' })); }, [st.folder]);

  const allCols = useMemo(() => [...SYS_COLS.map(c => ({ ...c, label: t(c.label), count: 0 })), ...keys.map(k => ({ key: k.key, label: k.key, count: k.count }))], [keys, t]);
  const label = (k: string) => allCols.find(c => c.key === k)?.label ?? k;
  const filtered = useMemo(() => {
    let out = rows.filter(r => Object.entries(st.filters).every(([k, f]) => !f.trim() || show(cellOf(r, k), k, t).toLowerCase().includes(f.trim().toLowerCase())));
    if (st.sort) { const { key, dir } = st.sort; out = [...out].sort((a, b) => dir * cmp(cellOf(a, key), cellOf(b, key))); }
    return out;
  }, [rows, st.filters, st.sort, t]);
  const groups = useMemo(() => {
    if (!st.group) return [{ name: '', rows: filtered }];
    const m = new Map<string, NoteProps[]>();
    for (const r of filtered) { const g = show(cellOf(r, st.group), st.group, t) || t('table.empty'); m.set(g, [...(m.get(g) ?? []), r]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant', { numeric: true })).map(([name, rows]) => ({ name, rows }));
  }, [filtered, st.group, t]);
  const toggleCol = (k: string) => setSt(s => ({ ...s, cols: s.cols.includes(k) ? s.cols.filter(c => c !== k) : [...s.cols, k] }));
  const sortBy = (k: string) => setSt(s => ({ ...s, sort: s.sort?.key === k ? (s.sort.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 } }));
  const csv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [st.cols.map(label).map(esc).join(','), ...filtered.map(r => st.cols.map(c => esc(show(cellOf(r, c), c, t))).join(','))];
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast(t('table.csvCopied'))).catch(() => toast(t('common.clipboardFail'), { kind: 'error' }));
  };

  return (
    <div className="flex h-full flex-col" data-testid="table-view">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-2 text-[12.5px]">
        <label className="flex items-center gap-1.5 whitespace-nowrap">{t('table.scope')}
          <select className={`${input} w-auto py-1.5`} value={st.folder} onChange={e => setSt(s => ({ ...s, folder: e.target.value, filters: {} }))}>
            <option value="">{t('table.all')}</option>
            {(['raw', 'wiki', 'schema'] as const).map(layer => [
              <option key={layer} value={layer}>{t(`layer.${layer}`)}</option>,
              ...folders.filter(f => f.startsWith(layer + '/')).map(f => <option key={f} value={f}>　{f}</option>),
            ])}
            {st.folder && !folders.includes(st.folder) && !['raw', 'wiki', 'schema'].includes(st.folder) && <option value={st.folder}>{t('table.gone', { folder: st.folder })}</option>}
          </select>
        </label>
        <label className="flex items-center gap-1.5 whitespace-nowrap">{t('table.group')}
          <select className={`${input} w-auto py-1.5`} value={st.group} onChange={e => setSt(s => ({ ...s, group: e.target.value }))}>
            <option value="">{t('table.noGroup')}</option>{allCols.filter(c => !['$title', '$path', '$updated', '$created', '$version'].includes(c.key)).map(c => <option key={c.key} value={c.key}>{label(c.key)}</option>)}
          </select>
        </label>
        <details className="relative">
          <summary className={`${btnGhost} cursor-pointer list-none`}>{t('table.columns', { n: st.cols.length })}</summary>
          <div className="absolute z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-line bg-paper p-2 shadow-lg">
            {allCols.map(c => <label key={c.key} className="flex items-center gap-2 px-1 py-1 text-[12.5px] hover:bg-celadon-mist"><input type="checkbox" checked={st.cols.includes(c.key)} onChange={() => toggleCol(c.key)} />{c.label}{c.count ? t('table.colCount', { n: c.count }) : ''}</label>)}
          </div>
        </details>
        <button className={btnGhost} onClick={() => setSt(s => ({ ...s, filters: {}, sort: DEFAULT.sort, group: '' }))}>{t('table.clear')}</button>
        <button className={btnGhost} onClick={csv}>{t('table.csv')}</button>
        <span className="ml-auto text-ink-soft">{t('table.summary', { n: filtered.length, total: rows.length })}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-porcelain">
            <tr>{st.cols.map(c => (
              <th key={c} className="border-b border-line px-2 py-1.5 text-left font-medium text-ink-soft whitespace-nowrap">
                <button className="hover:text-celadon-deep" onClick={() => sortBy(c)}>{label(c)}{st.sort?.key === c ? (st.sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
              </th>
            ))}</tr>
            <tr>{st.cols.map(c => <th key={c} className="border-b border-line px-1 py-1"><input className="w-full rounded border border-line bg-paper px-1.5 py-0.5 text-[11.5px] font-normal" placeholder={t('table.filterPh')} value={st.filters[c] ?? ''} onChange={e => setSt(s => ({ ...s, filters: { ...s.filters, [c]: e.target.value } }))} aria-label={t('table.filterLabel', { col: label(c) })} /></th>)}</tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <GroupRows key={g.name} name={g.name} rows={g.rows} cols={st.cols} onOpen={onOpen} />
            ))}
            {filtered.length === 0 && <tr><td colSpan={st.cols.length} className="px-3 py-6 text-center text-ink-faint">{t('table.noMatch')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ name, rows, cols, onOpen }: { name: string; rows: NoteProps[]; cols: string[]; onOpen: (p: string) => void }) {
  const { t } = useT();
  return (
    <>
      {name && <tr><td colSpan={cols.length} className="bg-celadon-mist/40 px-2 py-1 text-[12px] font-semibold text-celadon-deep">{name} <span className="font-normal text-ink-soft">{t('table.colCount', { n: rows.length })}</span></td></tr>}
      {rows.map(r => (
        <tr key={r.path} className="border-b border-dashed border-line hover:bg-porcelain">
          {cols.map(c => (
            <td key={c} className={`px-2 py-1.5 align-top ${c === '$path' ? 'font-mono text-[11.5px] text-ink-soft' : ''}`}>
              {c === '$title' ? <button className="wl text-left" onClick={() => onOpen(r.path)}>{r.title}</button> : show(cellOf(r, c), c, t)}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
