import { useEffect, useMemo, useRef, useState } from 'react';
import type { Graph } from '../lib/api';
import { fmtDate, useT } from '../i18n';

// Force-directed graph (ported from the prototype canvas). Nodes coloured by layer; drag to rearrange; click to open the page.
const COLOR = { raw: '#9BB0A8', wiki: '#3E7D6B', schema: '#B07D2B' } as const;
interface N { path: string; label: string; layer: keyof typeof COLOR; x: number; y: number; vx: number; vy: number; hub: boolean }
type Layer = keyof typeof COLOR;

/* ── Filters (requested by the maintainer: large knowledge bases became unreadable) ──
   layer, folder, title search, hide unlinked isolated nodes, show only N hops around the current page. State is kept in localStorage. */
interface Filters { layers: Record<Layer, boolean>; folder: string; q: string; hideIsolated: boolean; focusDepth: 0 | 1 | 2 }
const DEFAULT_FILTERS: Filters = { layers: { raw: true, wiki: true, schema: true }, folder: '', q: '', hideIsolated: false, focusDepth: 0 };
const FKEY = 'wb-graph-filters';
export function applyFilters(g: Graph, f: Filters, focusPath: string | null): Graph {
  let nodes = g.nodes.filter(n => f.layers[n.layer]);
  if (f.folder) nodes = nodes.filter(n => n.path === f.folder || n.path.startsWith(f.folder + '/'));
  if (f.q.trim()) { const q = f.q.trim().toLowerCase(); nodes = nodes.filter(n => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)); }
  let ok = new Set(nodes.map(n => n.path));
  if (f.focusDepth > 0 && focusPath && g.nodes.some(n => n.path === focusPath)) {
    const adj = new Map<string, Set<string>>();
    for (const e of g.edges) { if (!adj.has(e.from)) adj.set(e.from, new Set()); if (!adj.has(e.to)) adj.set(e.to, new Set()); adj.get(e.from)!.add(e.to); adj.get(e.to)!.add(e.from); }
    let frontier = new Set([focusPath]); const keep = new Set([focusPath]);
    for (let d = 0; d < f.focusDepth; d++) { const next = new Set<string>(); for (const p of frontier) for (const n of adj.get(p) ?? []) if (!keep.has(n)) { keep.add(n); next.add(n); } frontier = next; }
    ok = new Set([...ok].filter(p => keep.has(p)));
    if (!ok.has(focusPath)) ok.add(focusPath);
    nodes = g.nodes.filter(n => ok.has(n.path));
  }
  let edges = g.edges.filter(e => ok.has(e.from) && ok.has(e.to));
  if (f.hideIsolated) { const linked = new Set(edges.flatMap(e => [e.from, e.to])); nodes = nodes.filter(n => linked.has(n.path) || n.path === focusPath); ok = new Set(nodes.map(n => n.path)); edges = edges.filter(e => ok.has(e.from) && ok.has(e.to)); }
  return { nodes, edges };
}

// Timeline (requested by the maintainer): only shows pages created before t; an edge appears only when both endpoints are visible.
function useTimeline(graph: Graph) {
  const times = useMemo(() => graph.nodes.map(n => (n.created_at ? new Date(n.created_at).getTime() : 0)).filter(Boolean).sort((a, b) => a - b), [graph]);
  // max is fixed at graph load time (must not call Date.now() on every render, or the play loop and the "now" check keep resetting)
  const { min, max } = useMemo(() => ({ min: times[0] ?? Date.now(), max: Math.max(times[times.length - 1] ?? 0, Date.now()) }), [times]);
  // tRaw === null means "now": no render frame lands before max when the graph loads or reloads
  const [tRaw, setTRaw] = useState<number | null>(null);
  const t = tRaw ?? max;
  const setT = (v: number | ((cur: number) => number)) => setTRaw(cur => { const next = typeof v === 'function' ? v(cur ?? max) : v; return next >= max ? null : next; });
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setTRaw(null); setPlaying(false); }, [max]);
  // Play: from the current position (restart if at the end), advance 1/120 of the range every 120ms, stop automatically at the end
  useEffect(() => {
    if (!playing) return;
    const span = Math.max(1, max - min);
    const id = setInterval(() => setT(cur => { const next = (cur >= max ? min : cur) + span / 120; if (next >= max) { setPlaying(false); return max; } return next; }), 120);
    return () => clearInterval(id);
  }, [playing, min, max]);
  const visible = useMemo(() => {
    if (t >= max) return graph;
    const ok = new Set(graph.nodes.filter(n => !n.created_at || new Date(n.created_at).getTime() <= t).map(n => n.path));
    return { nodes: graph.nodes.filter(n => ok.has(n.path)), edges: graph.edges.filter(e => ok.has(e.from) && ok.has(e.to)) };
  }, [graph, t, max]);
  return { t, setT, min, max, visible, total: graph.nodes.length, playing, setPlaying };
}

export function GraphView({ graph: full, onOpen, focusPath = null }: { graph: Graph; onOpen: (p: string) => void; focusPath?: string | null }) {
  const { t: tr, lang } = useT();
  const [filters, setFilters] = useState<Filters>(() => { try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(FKEY) ?? '{}'), layers: { ...DEFAULT_FILTERS.layers, ...(JSON.parse(localStorage.getItem(FKEY) ?? '{}').layers ?? {}) } }; } catch { return DEFAULT_FILTERS; } });
  useEffect(() => { try { localStorage.setItem(FKEY, JSON.stringify(filters)); } catch { /* ignore */ } }, [filters]);
  const filtered = useMemo(() => applyFilters(full, filters, focusPath), [full, filters, focusPath]);
  const { t, setT, min, max, visible: graph, total, playing, setPlaying } = useTimeline(filtered);
  const folders = useMemo(() => [...new Set(full.nodes.map(n => n.path.split('/').slice(0, -1).join('/')).filter(f => f.includes('/')))].sort(), [full]);
  const active = !filters.layers.raw || !filters.layers.wiki || !filters.layers.schema || !!filters.folder || !!filters.q.trim() || filters.hideIsolated || filters.focusDepth > 0;
  const [showFilters, setShowFilters] = useState(active);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const zoomApi = useRef<{ in: () => void; out: () => void; reset: () => void } | null>(null);
  const posMemo = useRef(new Map<string, { x: number; y: number }>());
  // Simulation state lives in a ref: graph changes (timeline playback, filters) only sync nodes and edges without rebuilding the canvas or animation loop -> no flicker
  const sim = useRef<{ nodes: N[]; edges: [N, N][]; deg: Map<N, number>; drag: N | null; focus: string | null; onOpen: (p: string) => void }>({ nodes: [], edges: [], deg: new Map(), drag: null, focus: null, onOpen });
  sim.current.onOpen = onOpen; sim.current.focus = focusPath;

  // Sync: new nodes are placed near their neighbours (or at a remembered position), vanished nodes are removed, edges are rebuilt
  useEffect(() => {
    const s = sim.current;
    const byPath = new Map(s.nodes.map(n => [n.path, n]));
    const wrap = wrapRef.current; const W = wrap?.clientWidth || 600, H = wrap?.clientHeight || 440;
    const keep = new Set(graph.nodes.map(n => n.path));
    for (const n of s.nodes) if (!keep.has(n.path)) posMemo.current.set(n.path, { x: n.x, y: n.y });
    const nodes: N[] = graph.nodes.map(g => {
      const cur = byPath.get(g.path);
      if (cur) { cur.label = g.title.length > 9 ? g.title.slice(0, 8) + '…' : g.title; return cur; }
      const prev = posMemo.current.get(g.path);
      const neighbour = graph.edges.map(e => (e.from === g.path ? e.to : e.to === g.path ? e.from : null)).map(p => (p ? byPath.get(p) : undefined)).find(Boolean);
      const bx = prev?.x ?? (neighbour ? neighbour.x + (Math.random() - .5) * 60 : W / 2 + (Math.random() - .5) * 220);
      const by = prev?.y ?? (neighbour ? neighbour.y + (Math.random() - .5) * 60 : H / 2 + (Math.random() - .5) * 180);
      return { path: g.path, layer: g.layer, label: g.title.length > 9 ? g.title.slice(0, 8) + '…' : g.title, x: bx, y: by, vx: 0, vy: 0, hub: false };
    });
    const map = new Map(nodes.map(n => [n.path, n]));
    const edges = graph.edges.map(e => [map.get(e.from), map.get(e.to)] as const).filter((e): e is readonly [N, N] => !!e[0] && !!e[1]).map(e => [e[0], e[1]] as [N, N]);
    const deg = new Map<N, number>(); for (const [a, b] of edges) { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1); }
    const degs = [...deg.values()].sort((a, b) => b - a); const hubCut = degs[Math.min(degs.length - 1, Math.floor(degs.length * 0.15))] ?? 0;
    for (const n of nodes) n.hub = (deg.get(n) ?? 0) >= Math.max(2, hubCut);
    s.nodes = nodes; s.edges = edges; s.deg = deg;
    (canvasRef.current as (HTMLCanvasElement & { __nodes?: N[] }) | null)!.__nodes = nodes; // for E2E tests: exposes node coordinates
  }, [graph]);

  // Canvas, event handlers and animation loop are created only once
  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!, ctx = canvas.getContext('2d')!;
    const s = sim.current;
    let W = 0, H = 0, raf = 0, down: { x: number; y: number } | null = null, hover: N | null = null;
    const view = { scale: 1, ox: 0, oy: 0 };
    (canvas as HTMLCanvasElement & { __view?: typeof view }).__view = view; // read by E2E tests
    let panning: { sx: number; sy: number; ox: number; oy: number } | null = null;
    const toWorld = (sx: number, sy: number) => ({ x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale });
    const zoomAt = (factor: number, sx: number, sy: number) => { const next = Math.min(4, Math.max(0.25, view.scale * factor)); const w = toWorld(sx, sy); view.scale = next; view.ox = sx - w.x * next; view.oy = sy - w.y * next; };
    const resetView = () => { view.scale = 1; view.ox = 0; view.oy = 0; };
    zoomApi.current = { in: () => zoomAt(1.25, W / 2, H / 2), out: () => zoomAt(0.8, W / 2, H / 2), reset: resetView };
    const dg = (n: N) => s.deg.get(n) ?? 0;
    const radius = (n: N) => 6 + Math.min(14, Math.sqrt(dg(n)) * 3); // more inbound links -> bigger, but grows with the square root and is capped
    const resize = () => { const dpr = window.devicePixelRatio || 1; W = wrap.clientWidth; H = wrap.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; s.nodes.forEach(n => { n.x = Math.min(Math.max(n.x, 30), W - 30); n.y = Math.min(Math.max(n.y, 30), H - 30); }); };
    const physics = () => {
      const { nodes, edges } = s; const cx = W / 2, cy = H / 2; const many = nodes.length > 150;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]; a.vx += (cx - a.x) * .0015; a.vy += (cy - a.y) * .0015;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy || 1; if (many && d2 > 90_000) continue; const d = Math.sqrt(d2), f = 2600 / d2;
          dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      edges.forEach(([a, b]) => { let dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 110) * .004 * d * .02; dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; });
      nodes.forEach(n => { if (n === s.drag) return; n.vx *= .86; n.vy *= .86; n.x = Math.min(Math.max(n.x + n.vx, 30), W - 30); n.y = Math.min(Math.max(n.y + n.vy, 30), H - 30); });
    };
    const draw = () => {
      const { nodes, edges } = s;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
      ctx.strokeStyle = '#C9D8D1'; ctx.lineWidth = 1.2 / view.scale;
      edges.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); });
      // With many nodes, label only hubs, the current page and the hovered node; label everything when zoomed to 1.6x or more
      const labelAll = nodes.length <= 60 || view.scale >= 1.6;
      ctx.font = `${Math.max(9, 12 / Math.sqrt(view.scale))}px "PingFang TC","Noto Sans TC",sans-serif`; ctx.textAlign = 'center';
      nodes.forEach(n => {
        const r = radius(n); const isFocus = n.path === s.focus;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fillStyle = COLOR[n.layer]; ctx.fill();
        if (isFocus || n === hover) { ctx.lineWidth = 2.5 / view.scale; ctx.strokeStyle = '#22313A'; ctx.stroke(); }
        if (labelAll || n.hub || isFocus || n === hover) { ctx.fillStyle = '#22313A'; ctx.fillText(n.label, n.x, n.y + r + 15); }
      });
    };
    const tick = () => { physics(); draw(); raf = requestAnimationFrame(tick); };
    const screen = (e: PointerEvent | WheelEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pos = (e: PointerEvent) => { const sp = screen(e); return toWorld(sp.x, sp.y); };
    const pick = (x: number, y: number) => s.nodes.find(n => { const r = radius(n) + 2; return (n.x - x) ** 2 + (n.y - y) ** 2 <= r * r; }) ?? null;
    const onDown = (e: PointerEvent) => { const p = pos(e); s.drag = pick(p.x, p.y); down = p; canvas.setPointerCapture(e.pointerId); if (!s.drag) { const sp = screen(e); panning = { sx: sp.x, sy: sp.y, ox: view.ox, oy: view.oy }; canvas.style.cursor = 'grabbing'; } };
    const onMove = (e: PointerEvent) => {
      const p = pos(e);
      if (s.drag) { s.drag.x = p.x; s.drag.y = p.y; s.drag.vx = 0; s.drag.vy = 0; return; }
      if (panning) { const sp = screen(e); view.ox = panning.ox + (sp.x - panning.sx); view.oy = panning.oy + (sp.y - panning.sy); return; }
      hover = pick(p.x, p.y); canvas.style.cursor = hover ? 'pointer' : 'grab'; canvas.title = hover ? hover.path : '';
    };
    const onUp = (e: PointerEvent) => { const p = pos(e); if (s.drag && down && Math.hypot(p.x - down.x, p.y - down.y) < 4 / view.scale) s.onOpen(s.drag.path); s.drag = null; down = null; panning = null; canvas.style.cursor = 'grab'; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const sp = screen(e); zoomAt(e.deltaY < 0 ? 1.1 : 0.9, sp.x, sp.y); };
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize(); tick();
    return () => { s.nodes.forEach(n => posMemo.current.set(n.path, { x: n.x, y: n.y })); cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('wheel', onWheel); zoomApi.current = null; };
  }, []);

  const setLayer = (l: Layer, on: boolean) => setFilters(f => ({ ...f, layers: { ...f.layers, [l]: on } }));
  return (
    <div ref={wrapRef} className="relative h-full w-full" data-testid="graph" data-node-count={graph.nodes.length}>
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab touch-none" aria-label={tr('graph.label')} />
      <div className="absolute left-4 top-3.5 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 text-[12px]">
        <button className={`rounded-md border px-2.5 py-1 ${active ? 'border-celadon bg-celadon-mist text-celadon-deep' : 'border-line bg-paper text-ink-soft'} hover:bg-celadon-mist`} onClick={() => setShowFilters(v => !v)} data-testid="graph-filter-toggle">{tr('graph.filter')}{active ? ` · ${graph.nodes.length}/${full.nodes.length}` : ''}</button>
        {!showFilters && <span className="text-ink-faint">{tr('graph.hint')}</span>}
      </div>
      {showFilters && (
        <div className="absolute left-4 top-12 z-10 flex w-[min(340px,calc(100%-2rem))] flex-col gap-2.5 rounded-[10px] border border-line bg-paper/95 p-3 text-[12.5px] shadow-md" data-testid="graph-filters">
          <div className="flex flex-wrap gap-3">
            {(['raw', 'wiki', 'schema'] as Layer[]).map(l => (
              <label key={l} className="flex items-center gap-1.5"><input type="checkbox" checked={filters.layers[l]} onChange={e => setLayer(l, e.target.checked)} /><i className="inline-block h-[9px] w-[9px] rounded-full" style={{ background: COLOR[l] }} />{tr(`graph.legend${l === 'raw' ? 'Raw' : l === 'wiki' ? 'Wiki' : 'Schema'}`)}</label>
            ))}
          </div>
          <input className="w-full rounded-md border border-line bg-porcelain px-2.5 py-1.5" placeholder={tr('graph.search')} value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} data-testid="graph-search" />
          <select className="w-full rounded-md border border-line bg-porcelain px-2.5 py-1.5" value={filters.folder} onChange={e => setFilters(f => ({ ...f, folder: e.target.value }))} data-testid="graph-folder">
            <option value="">{tr('graph.allFolders')}</option>
            {folders.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={filters.hideIsolated} onChange={e => setFilters(f => ({ ...f, hideIsolated: e.target.checked }))} />{tr('graph.hideIsolated')}</label>
          <label className="flex flex-wrap items-center gap-1.5"><span className="whitespace-nowrap">{tr('graph.focus')}</span>
            <select className="rounded-md border border-line bg-porcelain px-2 py-1" value={filters.focusDepth} onChange={e => setFilters(f => ({ ...f, focusDepth: Number(e.target.value) as 0 | 1 | 2 }))} disabled={!focusPath} data-testid="graph-focus">
              <option value={0}>{tr('graph.focusOff')}</option><option value={1}>{tr('graph.focus1')}</option><option value={2}>{tr('graph.focus2')}</option>
            </select>
            {!focusPath && <span className="text-ink-faint">{tr('graph.focusNeedsPage')}</span>}
          </label>
          <div className="flex justify-between text-ink-faint">
            <span>{tr('graph.labelsHint')}</span>
            {active && <button className="text-celadon-deep hover:underline" onClick={() => setFilters(DEFAULT_FILTERS)} data-testid="graph-filter-clear">{tr('graph.clearFilters')}</button>}
          </div>
        </div>
      )}
      {min < max && (
        <div className="absolute bottom-[58px] left-4 right-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] border border-line bg-paper/95 px-3.5 py-2 text-[12px]" data-testid="graph-timeline">
          <button className="rounded-md border border-line px-2 py-0.5 text-[12px] hover:bg-celadon-mist" onClick={() => setPlaying(p => !p)} aria-label={playing ? tr('graph.pause') : tr('graph.play')} data-testid="timeline-play">{playing ? '❚❚' : '▶'}</button>
          <span className="whitespace-nowrap text-ink-soft">{tr('graph.timeline')}</span>
          <input type="range" min={min} max={max} step={3600_000} value={t} onChange={e => { setPlaying(false); setT(Number(e.target.value)); }} className="min-w-[120px] flex-1 accent-[#3E7D6B]" aria-label={tr('graph.until')} />
          <span className="whitespace-nowrap tabular-nums text-ink" data-testid="graph-timeline-label">{t >= max ? tr('graph.now') : fmtDate(lang, new Date(t))} · {tr('graph.pages', { shown: graph.nodes.length, total })}</span>
          {t < max && <button className="whitespace-nowrap text-celadon-deep hover:underline" onClick={() => setT(max)}>{tr('graph.backToNow')}</button>}
        </div>
      )}
      <div className="absolute bottom-3.5 right-4 flex overflow-hidden rounded-[10px] border border-line bg-paper text-[14px]" role="group" aria-label={tr('graph.zoom')}>
        <button className="px-3 py-1.5 hover:bg-celadon-mist" aria-label={tr('graph.zoomIn')} data-testid="zoom-in" onClick={() => zoomApi.current?.in()}>＋</button>
        <button className="border-l border-line px-3 py-1.5 hover:bg-celadon-mist" aria-label={tr('graph.zoomOut')} data-testid="zoom-out" onClick={() => zoomApi.current?.out()}>－</button>
        <button className="border-l border-line px-3 py-1.5 text-[12px] hover:bg-celadon-mist" aria-label={tr('graph.zoomReset')} data-testid="zoom-reset" onClick={() => zoomApi.current?.reset()}>{tr('graph.reset')}</button>
      </div>
      <div className="absolute bottom-3.5 left-4 flex gap-3.5 rounded-[10px] border border-line bg-paper px-3.5 py-2.5 text-[12px] text-ink-soft">
        <span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full" style={{ background: COLOR.raw }} />{tr('graph.legendRaw')}</span>
        <span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full" style={{ background: COLOR.wiki }} />{tr('graph.legendWiki')}</span>
        <span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full" style={{ background: COLOR.schema }} />{tr('graph.legendSchema')}</span>
      </div>
    </div>
  );
}
