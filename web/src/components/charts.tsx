import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';

/* ── Chart components (per the dataviz guidelines: single-hue quantities, thin bars with 4px rounded ends, direct labels on extremes only, hover tooltips, table view) ── */
const INK = 'var(--color-ink)', SOFT = 'var(--color-ink-soft)', FAINT = 'var(--color-ink-faint)', LINE = 'var(--color-line)';
export const SERIES = 'var(--celadon)';
// Heatmap ramp: one hue from light to dark (monotonic lightness); zero uses the surface colour plus a thin border
const RAMP = [1, 2, 3, 4, 5, 6].map(i => `var(--ramp-${i})`);
const trim = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const fmt = (n: number, locale: string) => n >= 1_000_000 ? `${trim(n / 1e6)}M` : n >= 10_000 ? `${trim(n / 1e3)}K` : n.toLocaleString(locale);

// SVG is drawn at the container's actual width (no viewBox scaling, so text keeps its size)
function useWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => { const cw = es[0]?.contentRect.width; if (cw) setW(Math.max(240, Math.floor(cw))); });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-[10px] border border-line bg-porcelain px-4 py-3">
      <div className="text-[11.5px] text-ink-soft">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-sans)' }}>{value}</div>
      {sub && <div className="text-[11px] text-ink-faint">{sub}</div>}
    </div>
  );
}

function Frame({ title, sub, table, children }: { title: string; sub?: string; table: ReactNode; children: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  const { t } = useT();
  return (
    <figure className="rounded-[10px] border border-line bg-paper p-4">
      <figcaption className="mb-2 flex items-baseline gap-2">
        <span className="text-[13px] font-semibold">{title}</span>
        {sub && <span className="text-[11.5px] text-ink-soft">{sub}</span>}
        <button className="ml-auto text-[11px] text-ink-soft hover:text-celadon-deep" onClick={() => setShowTable(v => !v)} aria-pressed={showTable}>{showTable ? t('charts.chart') : t('charts.table')}</button>
      </figcaption>
      {showTable ? <div className="max-h-64 overflow-auto text-[12px]">{table}</div> : children}
    </figure>
  );
}

function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 text-[11px] text-white whitespace-nowrap" style={{ left: x, top: y - 8 }}>{children}</div>;
}

// Bar chart: single series; labels only the maximum and the last bar; integer y-axis ticks
export function BarChart({ title, sub, data, labelEvery = 1, valueName }: { title: string; sub?: string; data: { label: string; value: number; hint?: string }[]; labelEvery?: number; valueName?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { t, locale } = useT();
  const vName = valueName ?? t('charts.count');
  const [wrap, W] = useWidth<HTMLDivElement>();
  const H = 200, padL = 40, padB = 26, padT = 14;
  const max = Math.max(1, ...data.map(d => d.value));
  const nice = niceMax(max);
  const slot = (W - padL) / Math.max(1, data.length);
  const bw = Math.min(24, slot * 0.7);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const maxIdx = data.findIndex(d => d.value === max);
  const ticks = [0, nice / 2, nice];
  return (
    <Frame title={title} sub={sub} table={<table className="w-full"><thead><tr className="text-left text-ink-soft"><th>{t('charts.item')}</th><th className="text-right">{vName}</th></tr></thead><tbody>{data.map(d => <tr key={d.label}><td>{d.hint ?? d.label}</td><td className="text-right tabular-nums">{d.value.toLocaleString(locale)}</td></tr>)}</tbody></table>}>
      <div className="relative" ref={wrap}>
        <svg width={W} height={H} role="img" aria-label={title} style={{ display: 'block' }}>
          {ticks.map(v => <g key={v}><line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke={LINE} strokeWidth={1} /><text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={FAINT} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v, locale)}</text></g>)}
          {data.map((d, i) => {
            const x = padL + i * slot + (slot - bw) / 2, top = y(d.value), h = Math.max(0, y(0) - top);
            const r = Math.min(4, h);
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
                {h > 0 && <path d={`M${x},${y(0)} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {(i === maxIdx || i === data.length - 1) && d.value > 0 && <text x={Math.min(x + bw / 2, W - 4)} y={top - 4} textAnchor={x + bw / 2 > W - 28 ? 'end' : 'middle'} fontSize={10.5} fill={INK}>{fmt(d.value, locale)}</text>}
                {i % Math.max(labelEvery, Math.ceil(34 / slot)) === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={10.5} fill={SOFT}>{d.label}</text>}
              </g>
            );
          })}
        </svg>
        {hover !== null && <Tip x={padL + hover * slot + slot / 2} y={Math.max(24, y(data[hover].value))}>{t('charts.tip', { label: data[hover].hint ?? data[hover].label, value: data[hover].value.toLocaleString(locale) })}</Tip>}
      </div>
    </Frame>
  );
}

// Horizontal bar chart: for categories with long names
export function HBarChart({ title, sub, data, valueName, onPick }: { title: string; sub?: string; data: { label: string; value: number; key?: string }[]; valueName?: string; onPick?: (key: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const { t } = useT();
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <Frame title={title} sub={sub} table={<table className="w-full"><thead><tr className="text-left text-ink-soft"><th>{t('charts.item')}</th><th className="text-right">{valueName ?? t('charts.count')}</th></tr></thead><tbody>{data.map(d => <tr key={d.label}><td>{d.label}</td><td className="text-right tabular-nums">{d.value}</td></tr>)}</tbody></table>}>
      <ul className="space-y-1.5" role="list">
        {data.map((d, i) => (
          <li key={d.key ?? d.label} className="grid grid-cols-[minmax(0,180px)_1fr_40px] items-center gap-2 text-[12px]" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {onPick && d.key ? <button className="truncate text-left hover:text-celadon-deep" title={d.label} onClick={() => onPick(d.key!)}>{d.label}</button> : <span className="truncate" title={d.label}>{d.label}</span>}
            <div className="h-[14px] rounded-r-[4px] bg-celadon transition-opacity" style={{ width: `${(d.value / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.55 }} aria-hidden />
            <span className="text-right tabular-nums text-ink">{d.value}</span>
          </li>
        ))}
        {data.length === 0 && <li className="text-[12px] text-ink-faint">{t('charts.empty')}</li>}
      </ul>
    </Frame>
  );
}

// Heatmap: 26 weeks x 7 days, single-hue ramp; cell tooltip shows the date and breakdown
export function Heatmap({ title, sub, days }: { title: string; sub?: string; days: { day: string; count: number; by?: Record<string, number> }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { t, locale } = useT();
  const id = useId();
  const max = Math.max(1, ...days.map(d => d.count));
  const step = (v: number) => v === 0 ? 0 : Math.min(RAMP.length - 1, 1 + Math.floor((v / max) * (RAMP.length - 2)));
  // Align to the start of the week (Sunday)
  const first = new Date(days[0]?.day ?? new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const lead = first.getUTCDay();
  const cells = [...Array(lead).fill(null), ...days];
  const weeks = Math.ceil(cells.length / 7);
  const size = 12, gap = 2, padL = 26, padT = 16;
  const W = padL + weeks * (size + gap), H = padT + 7 * (size + gap);
  const kindName = (k: string) => (['web', 'mcp', 'agent', 'system', 'phase0'].includes(k) ? t(`charts.kind.${k}`) : k);
  const monthLabels: { x: number; label: string }[] = [];
  cells.forEach((c, i) => { if (c && new Date(c.day + 'T00:00:00Z').getUTCDate() === 1) monthLabels.push({ x: padL + Math.floor(i / 7) * (size + gap), label: new Date(c.day + 'T00:00:00Z').toLocaleString(locale, { month: 'short', timeZone: 'UTC' }) }); });
  return (
    <Frame title={title} sub={sub} table={<table className="w-full"><thead><tr className="text-left text-ink-soft"><th>{t('charts.date')}</th><th className="text-right">{t('charts.edits')}</th></tr></thead><tbody>{days.filter(d => d.count > 0).map(d => <tr key={d.day}><td>{d.day}</td><td className="text-right tabular-nums">{d.count}</td></tr>)}</tbody></table>}>
      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-labelledby={id}>
          <title id={id}>{title}</title>
          {monthLabels.map(m => <text key={m.x + m.label} x={m.x} y={10} fontSize={9.5} fill={FAINT}>{m.label}</text>)}
          {t('charts.weekdays').split(',').map((d, r) => (r % 2 === 1 ? <text key={r} x={0} y={padT + r * (size + gap) + size - 2} fontSize={9} fill={FAINT}>{d}</text> : null))}
          {cells.map((c, i) => {
            if (!c) return null;
            const col = Math.floor(i / 7), row = i % 7, s = step(c.count);
            return <rect key={c.day} x={padL + col * (size + gap)} y={padT + row * (size + gap)} width={size} height={size} rx={2} fill={RAMP[s]} stroke={s === 0 ? LINE : 'none'} strokeWidth={0.5}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />;
          })}
        </svg>
        {hover !== null && cells[hover] && (
          <div className="pointer-events-none absolute left-2 top-0 rounded-md bg-ink px-2 py-1 text-[11px] text-white">
            {t('charts.editsTip', { date: cells[hover]!.day, n: cells[hover]!.count })}{Object.keys(cells[hover]!.by ?? {}).length ? t('charts.by', { s: Object.entries(cells[hover]!.by!).map(([k, v]) => `${kindName(k)} ${v}`).join(t('charts.sep')) }) : ''}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-ink-faint">{t('charts.less')}<span className="flex gap-[2px]">{RAMP.map(c => <i key={c} className="inline-block h-[10px] w-[10px] rounded-[2px]" style={{ background: c, border: c === RAMP[0] ? `1px solid ${LINE}` : 'none' }} />)}</span>{t('charts.more')}</div>
      </div>
    </Frame>
  );
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 4 ? 4 : m <= 5 ? 5 : 10;
  return n * p;
}
