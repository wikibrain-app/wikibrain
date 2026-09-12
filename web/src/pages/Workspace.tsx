import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { bibMap, BibProvider } from '../lib/cite';
import { api, ApiError, layerOf, type Graph, type Me, type Note, type BibEntry, type NoteSummary, type SearchHit, type Version } from '../lib/api';
import { btnGhost, btnPrimary } from '../components/ui';
import { useToast } from '../lib/toast';
import { useConfirm } from '../lib/confirm';
import { CommandPalette, type PaletteAction } from '../components/CommandPalette';
import { DiffModal } from '../components/DiffModal';
import { useT } from '../i18n';
import { Topbar } from '../components/Topbar';
import { Sidebar } from '../components/Sidebar';
import { NoteView } from '../components/NoteView';
import { Editor, draftKeyFor } from '../components/Editor';
import { Rail } from '../components/Rail';
import { SearchResults } from '../components/SearchResults';
import { GraphView } from '../components/GraphView';
import { TableView } from '../components/TableView';
import { OnboardingModal } from '../components/OnboardingModal';
import { AddModal, type AddTab } from '../components/AddModal';
import { IngestPanel } from '../components/IngestPanel';
import { ChatPanel } from '../components/ChatPanel';
import { Footer } from '../components/Footer';
import { noteUrl, safeDecode } from '../lib/noteUrl';

type Mode = 'read' | 'edit' | 'search';

export default function Workspace({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const { t } = useT();
  const path = params['*'] ? safeDecode(params['*']) : null;
  const view: 'note' | 'graph' | 'table' = location.pathname === '/graph' ? 'graph' : location.pathname === '/table' ? 'table' : 'note';

  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [bib, setBib] = useState<Map<string, BibEntry>>(new Map());
  const [pending, setPending] = useState<string[]>([]);
  const [ingestPromptAll, setIngestPromptAll] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [backlinks, setBacklinks] = useState<NoteSummary[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [historical, setHistorical] = useState<Version | null>(null);
  const [mode, setMode] = useState<Mode>('read');
  const [search, setSearch] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState<{ tab: AddTab; layer: string } | null>(null);
  const [aiReady, setAiReady] = useState(false);
  const [chatDraft, setChatDraft] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(() => { try { return localStorage.getItem('wb-chat-open') === '1' && window.innerWidth >= 680; } catch { return false; } }); // not restored on phones: the drawer would cover the note
  useEffect(() => { try { localStorage.setItem('wb-chat-open', chatOpen ? '1' : '0'); } catch { /* ignore */ } }, [chatOpen]);
  const [ingestJobId, setIngestJobId] = useState<number | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [treeLoaded, setTreeLoaded] = useState(false);
  const [onboardingSkipped, setOnboardingSkipped] = useState(() => { try { return localStorage.getItem(`wb-onboarding-skipped:${me.workspace.id}`) === '1'; } catch { return false; } });

  const fail = useCallback((e: unknown) => {
    const err = e as ApiError;
    if (err.status === 401) { onSignedOut(); navigate('/login'); return; }
    if (err.status === 429) { toast(t('workspace.tooFast'), { kind: 'error' }); return; }
    toast(err.message ?? t('workspace.error'), { kind: 'error' });
  }, [toast, t, onSignedOut, navigate]);

  const reloadTree = useCallback(() => api.tree().then(r => { setNotes(r.notes); setBib(bibMap(r.bib)); setPending(r.pendingSources ?? []); setIngestPromptAll(r.ingestPrompt ?? null); setTreeLoaded(true); }).catch(fail), [fail]);
  const reloadNote = useCallback(async (p: string) => {
    try {
      const n = await api.note(p);
      setNote(n); setNotFound(false);
      const [b, v] = await Promise.all([api.backlinks(p), api.versions(p)]);
      setBacklinks(b.backlinks); setVersions(v.versions);
    } catch (e) {
      if ((e as ApiError).status === 404) { setNote(null); setNotFound(true); return; }
      fail(e);
    }
  }, [fail]);

  useEffect(() => {
    reloadTree();
    Promise.all([api.ai(), api.plan().catch(() => null)]).then(([r, p]) => setAiReady(!!r.config || !!(p && p.trial_active && p.trial_runs_used < p.trial_runs_free))).catch(() => {});
    // Reattach to an ingest job still running after a page reload
    api.ingestJobs().then(r => { const live = r.jobs.find(j => j.status === 'queued' || j.status === 'running'); if (live) { setIngestJobId(live.id); setIngesting(true); } }).catch(() => {});
  }, [reloadTree]);
  useEffect(() => {
    setMode('read'); setHistorical(null); setSearch(null); setSidebarOpen(false);
    if (path) reloadNote(path); else { setNote(null); setNotFound(false); }
  }, [path, reloadNote]);
  useEffect(() => { if (view === 'graph') api.graph().then(setGraph).catch(fail); }, [view, notes, fail]);

  // Keep tracking the job while the panel is closed (running in the background) so the button unlocks and the tree reloads when it finishes
  useEffect(() => {
    if (!ingesting || ingestJobId === null) return;
    const timer = setInterval(async () => {
      try { const { job } = await api.ingestJob(ingestJobId); if (job.status === 'done' || job.status === 'failed') { setIngesting(false); reloadTree(); if (path) reloadNote(path); if (job.status === 'failed') toast(t('workspace.ingestFailed', { error: job.error ?? '' }), { kind: 'error', sticky: true, action: { label: t('workspace.viewLog'), onClick: () => navigate('/settings#ai') } }); } }
      catch { /* retry next tick */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [ingesting, ingestJobId, path, reloadTree, reloadNote, toast, t]);

  const openNote = useCallback((p: string) => { setMode('read'); setSearch(null); setHistorical(null); navigate(noteUrl(p)); }, [navigate]);
  const setView = (v: 'note' | 'graph' | 'table') => navigate(v === 'graph' ? '/graph' : v === 'table' ? '/table' : path ? noteUrl(path) : '/');

  const [keepDraft, setKeepDraft] = useState<string | null>(null); // draft kept after a 409
  const [palette, setPalette] = useState(false);
  const [compare, setCompare] = useState<Version | null>(null);
  const [chatWidth, setChatWidth] = useState(() => { try { return Math.min(640, Math.max(320, Number(localStorage.getItem('wb-chat-width')) || 380)); } catch { return 380; } });
  const dragRef = useRef<{ x: number; w: number } | null>(null);
  // ⌘K / Ctrl+K opens the palette anywhere in the workspace (not while typing in the editor's textarea)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const startDrag = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, w: chatWidth }; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { if (!dragRef.current) return; const w = Math.min(640, Math.max(320, dragRef.current.w + (dragRef.current.x - ev.clientX))); setChatWidth(w); };
    const up = () => { dragRef.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { localStorage.setItem('wb-chat-width', String(chatWidth)); } catch { /* ignore */ } };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const paletteActions: PaletteAction[] = [
    { id: 'new', label: t('topbar.new'), run: () => setAdd({ tab: 'write', layer: layerOf(path ?? 'wiki/x') || 'wiki' }) },
    { id: 'import', label: t('sidebar.import'), run: () => setAdd({ tab: 'url', layer: 'raw' }) },
    { id: 'chat', label: t('topbar.chat'), run: () => setChatOpen(true) },
    { id: 'graph', label: t('topbar.graph'), run: () => setView('graph') },
    { id: 'table', label: t('topbar.table'), run: () => setView('table') },
    { id: 'settings', label: t('topbar.settings'), run: () => navigate('/settings') },
    { id: 'help', label: t('topbar.help'), run: () => navigate('/help') },
  ];
  async function save(content: string) {
    if (!note) return;
    setBusy(true);
    try {
      await api.update(note.path, content, note.version);
      try { localStorage.removeItem(draftKeyFor(note.path)); } catch { /* storage unavailable */ }   // only now is the draft safe to drop
      await Promise.all([reloadNote(note.path), reloadTree()]);
      setKeepDraft(null);
      setMode('read');
      toast(t('workspace.saved'));
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        const cur = err.body?.current?.version;
        toast(t('workspace.conflict', { cur, mine: note.version }), {
          kind: 'error', sticky: true,
          action: { label: t('workspace.conflictKeep'), onClick: async () => { setKeepDraft(content); await reloadNote(note.path); toast(t('workspace.conflictLoaded', { cur }), { sticky: true }); } },
        });
      } else fail(e);
    } finally { setBusy(false); }
  }
  async function archive(undo: boolean) {
    if (!note) return;
    try { const r = await api.archive(note.path, undo); toast(undo ? t('workspace.unarchived') : t('workspace.archived')); await reloadTree(); navigate(noteUrl(r.path)); }
    catch (e) { fail(e); }
  }
  async function remove() {
    if (!note) return;
    if (!(await confirmDialog({ title: t('workspace.deleteTitle'), body: t('workspace.deleteConfirm', { title: note.title }), confirmLabel: t('common.delete'), danger: true }))) return;
    try { await api.remove(note.path); toast(t('workspace.deleted')); await reloadTree(); navigate('/'); }
    catch (e) { fail(e); }
  }
  async function rollback(v: number) {
    if (!note) return;
    try {
      await api.rollback(note.path, v, note.version);
      setHistorical(null);
      await reloadNote(note.path);
      toast(t('workspace.rolledBack', { v }));
    } catch (e) { fail(e); }
  }
  async function create(p: string, content: string) {
    setBusy(true);
    try {
      const created = await api.create(p, content || `# ${p.split('/').pop()!.replace(/\.md$/, '')}\n`);
      setAdd(null);
      await reloadTree();
      openNote(created.path);
      toast(t('workspace.created', { title: created.title }));
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function doSearch(q: string) {
    try { const r = await api.search(q); setSearch({ query: q, hits: r.hits }); setMode('search'); }
    catch (e) { fail(e); }
  }
  async function autoIngest(paths?: string[], guidance?: string) {
    if (ingesting) return;
    setIngesting(true);
    try { const { job } = await api.startIngest(paths, guidance); setIngestJobId(job.id); toast(t('workspace.ingestStarted')); }
    catch (e) { setIngesting(false); fail(e); }
  }
  async function signOut() { await api.signOut().catch(() => {}); onSignedOut(); navigate('/login'); }

  const main = () => {
    const EmptyView = ({ text }: { text: string }) => <div className="mx-auto max-w-[520px] px-6 pt-20 text-center text-ink-soft"><p className="text-[14px] leading-relaxed">{text}</p><button className={`${btnPrimary} mt-4`} onClick={() => setAdd({ tab: 'url', layer: 'raw' })}>{t('empty.cta')}</button></div>;
    if (view === 'table' && notes.length === 0) return <EmptyView text={t('empty.table')} />;
    if (view === 'graph' && graph && graph.nodes.length === 0) return <EmptyView text={t('empty.graph')} />;
    if (view === 'table') return <TableView onOpen={p => navigate(noteUrl(p))} folders={[...new Set(notes.map(n => n.path.split('/').slice(0, -1).join('/')).filter(f => f.includes('/')))].sort()} />;
    if (view === 'graph') return graph ? <GraphView graph={graph} focusPath={path || null} onOpen={p => { navigate(noteUrl(p)); }} /> : <div className="p-10 text-ink-soft">{t('workspace.loadingGraph')}</div>;
    if (mode === 'search' && search) return <SearchResults query={search.query} hits={search.hits} onOpen={openNote} />;
    if (notFound) return <div className="mx-auto max-w-[660px] px-10 pt-16 text-center"><h1 className="font-serif text-[22px] font-bold mb-2">{t('workspace.notFound')}</h1><p className="text-[13px] text-ink-soft font-mono">{path}</p></div>;
    if (!note && path && !notFound) return <NoteSkeleton />;
    if (!note) return (
      <div className="mx-auto max-w-[660px] px-6 sb:px-10 pt-12 sb:pt-16 text-center text-ink-soft">
        <h1 className="font-serif text-[24px] font-bold text-ink mb-3">{t('workspace.welcome')}</h1>
        <StartChecklist notes={notes} pending={pending} onPasteUrl={() => setAdd({ tab: 'url', layer: 'raw' })} onWrite={() => setAdd({ tab: 'write', layer: 'wiki' })}
          onIngest={p => { navigate(noteUrl(p)); autoIngest([p]); }} onAsk={() => setChatOpen(true)} aiReady={aiReady} ingesting={ingesting} />
        <p className="text-[13.5px] leading-relaxed">{notes.length === 0 ? <>{t('workspace.empty1')}<a className="text-celadon-deep underline" href="/settings">{t('workspace.emptyLink')}</a>{t('workspace.empty2')}</> : <>{t('workspace.pickHint')}</>}<br />{t('workspace.helpBefore')}<a className="text-celadon-deep underline" href="/help">{t('workspace.helpLink')}</a>{t('workspace.helpAfter')}</p>
      </div>
    );
    if (mode === 'edit') return <Editor key={note.path + note.version} note={note} initial={keepDraft ?? undefined} notes={notes} onSave={save} onCancel={() => { setKeepDraft(null); setMode('read'); }} busy={busy} />;
    return (
      <>
      <StartStrip notes={notes} pending={pending} a={{ onPasteUrl: () => setAdd({ tab: 'url', layer: 'raw' }), onWrite: () => setAdd({ tab: 'write', layer: 'wiki' }), onIngest: p => { navigate(noteUrl(p)); autoIngest([p]); }, onAsk: () => setChatOpen(true), aiReady, ingesting }} />
      {ingestJobId !== null && <div className="mx-auto max-w-[660px] px-5 sb:px-10 pt-6"><IngestPanel jobId={ingestJobId} onDone={() => { setIngesting(false); reloadTree(); if (path) reloadNote(path); }} onClose={() => setIngestJobId(null)} /></div>}
      <NoteView note={note} notes={notes} historical={historical} onOpen={openNote} onEdit={() => setMode('edit')} onDelete={remove}
        onArchive={archive} onBackToCurrent={() => setHistorical(null)} onRollback={rollback} pending={pending.includes(note.path)} pendingCount={pending.length} ingestPromptAll={ingestPromptAll} aiReady={aiReady} onAutoIngest={autoIngest} ingesting={ingesting}
        onDiscuss={() => { setChatDraft(t('workspace.discussDraft', { path: note.path })); setChatOpen(true); }} />
      </>
    );
  };

  return (
    <BibProvider value={bib}>
    <div className="mx-auto flex h-full max-w-[1280px] flex-col bg-paper shadow-[0_0_0_1px_var(--color-line)]">
      <Topbar email={me.user.email} name={me.user.name} isAdmin={me.isAdmin} view={view} onView={setView} onSearch={doSearch} onNew={() => setAdd({ tab: 'write', layer: layerOf(path ?? 'wiki/x') || 'wiki' })}
        onSignOut={signOut} onToggleSidebar={() => setSidebarOpen(o => !o)} onToggleRail={() => setRailOpen(o => !o)} onChat={() => setChatOpen(o => !o)} chatOpen={chatOpen} />
      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && <button className="fixed inset-0 z-20 bg-ink/30 sb:hidden" aria-label={t('workspace.closeSidebar')} onClick={() => setSidebarOpen(false)} />}
        <div className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-30 w-[260px] shadow-2xl' : 'hidden'} sb:static sb:block sb:w-[240px] sb:flex-none border-r border-line`} data-testid="sidebar">
          {treeLoaded ? <Sidebar notes={notes} pending={pending} active={path} onOpen={openNote} onNew={l => setAdd({ tab: 'write', layer: l })} onImport={() => setAdd({ tab: 'url', layer: 'raw' })} /> : <SidebarSkeleton />}
        </div>
        <main className={`min-w-0 flex-1 ${mode === 'edit' || view === 'graph' || view === 'table' ? 'overflow-hidden' : 'overflow-y-auto'}`}>{main()}</main>
        {railOpen && <button className="fixed inset-0 z-20 bg-ink/30 rail:hidden" aria-label={t('workspace.closeRail')} onClick={() => setRailOpen(false)} />}
        {chatOpen && (
          <div className="relative fixed inset-y-0 right-0 z-30 w-full max-w-[420px] border-l border-line shadow-2xl sb:static sb:z-auto sb:max-w-none sb:flex-none sb:shadow-none" style={window.innerWidth >= 680 ? { width: chatWidth } : undefined} data-testid="chat-drawer">
            <div className="absolute inset-y-0 left-0 hidden w-1.5 cursor-col-resize hover:bg-celadon/40 sb:block" onPointerDown={startDrag} title="⇔" aria-hidden />
            <ChatPanel aiReady={aiReady} notes={notes} draft={chatDraft} onDraftUsed={() => setChatDraft(null)} onOpen={p => { openNote(p); }} onClose={() => setChatOpen(false)} onChanged={() => { reloadTree(); if (path) reloadNote(path); }} pending={pending} ingesting={ingesting} onIngestFromChat={(src, guidance) => { navigate(noteUrl(src)); autoIngest([src], guidance); }} />
          </div>
        )}
        {note && view === 'note' && mode !== 'search' && !chatOpen && (
          <div className={`${railOpen ? 'fixed inset-y-0 right-0 z-30 w-[280px] shadow-2xl' : 'hidden'} rail:static rail:block rail:w-[250px] rail:flex-none border-l border-line`} data-testid="rail">
            <Rail backlinks={backlinks} versions={versions} current={note.version} viewing={historical?.version ?? null} onOpen={p => { setRailOpen(false); openNote(p); }}
              onView={v => { setHistorical(v); setMode('read'); setRailOpen(false); }} onCompare={v => { setCompare(v); setRailOpen(false); }} onRollback={rollback} readonly={layerOf(note.path) === 'raw'} />
          </div>
        )}
      </div>
      <Footer className="hidden sb:flex" />
      {add && (
        <AddModal tab={add.tab} layer={add.layer} busy={busy} onClose={() => setAdd(null)}
          onCreate={async (p, content) => { await create(p, content); }}
          onImported={async r => { setAdd(null); await reloadTree(); openNote(r.path); if (r.warning) toast(r.warning, { kind: 'error', sticky: true }); else if (r.imported) toast(t('workspace.importedBib', { n: r.imported.length, skipped: r.skipped?.length ?? 0 })); else toast(t('workspace.imported', { title: r.title }) + (r.meta.doi ? t('workspace.importedDoi') : '')); }} />
      )}
      {treeLoaded && notes.length === 0 && !onboardingSkipped && !add && (
        <OnboardingModal onPasteUrl={() => setAdd({ tab: 'url', layer: 'raw' })}
          onDone={() => { reloadTree(); }}
          onSkip={() => { setOnboardingSkipped(true); try { localStorage.setItem(`wb-onboarding-skipped:${me.workspace.id}`, '1'); } catch { /* fine without storage */ } }}
        />
      )}
      <nav className="flex border-t border-line bg-paper sb:hidden" aria-label={t('topbar.views')} data-testid="bottom-bar">
        {([['note', t('topbar.note')], ['graph', t('topbar.graph')], ['table', t('topbar.table')]] as const).map(([v, label]) => (
          <button key={v} className={`flex-1 py-2.5 text-[12px] ${view === v ? 'font-semibold text-celadon-deep' : 'text-ink-soft'}`} aria-current={view === v} onClick={() => setView(v)}>{label}</button>
        ))}
        <button className="flex-1 py-2.5 text-[12px] text-ink-soft" onClick={() => setAdd({ tab: 'url', layer: 'raw' })}>{t('topbar.new')}</button>
        <button className={`flex-1 py-2.5 text-[12px] ${chatOpen ? 'font-semibold text-celadon-deep' : 'text-ink-soft'}`} onClick={() => setChatOpen(o => !o)}>{t('topbar.chatShort')}</button>
      </nav>
      {palette && <CommandPalette notes={notes} actions={paletteActions} onOpen={p => { setView('note'); openNote(p); }} onClose={() => setPalette(false)} />}
      {compare && note && <DiffModal version={compare} current={note.content} currentVersion={note.version} onClose={() => setCompare(null)} onRollback={layerOf(note.path) === 'raw' ? undefined : rollback} />}
    </div>
    </BibProvider>
  );
}

// First-run checklist on the welcome screen (PRD §8 funnel: source → ingest → query). Hidden once all three are done.
/* The three steps a new workspace needs, and where a person actually is on them. Shared by the welcome card and the
   one-line strip above a note, so the next step keeps a button wherever they are — the checklist vanishing the moment
   they open a page is how a template's nine pages became the last thing one user ever saw. */
function startProgress(notes: NoteSummary[], pending: string[]) {
  const sources = notes.filter(n => n.path.startsWith('raw/') && !n.path.startsWith('raw/archive/') && !/README/i.test(n.path));
  const hasSource = sources.length > 0;
  const ingested = hasSource && sources.some(n => !pending.includes(n.path));
  let asked = false; try { asked = localStorage.getItem('wb-first-query') === '1'; } catch { /* ignore */ }
  const firstPending = sources.find(n => pending.includes(n.path)) ?? null;
  return { hasSource, ingested, asked, firstPending, done: hasSource && ingested && asked };
}

type StartActions = { onPasteUrl: () => void; onWrite: () => void; onIngest: (path: string) => void; onAsk: () => void; aiReady: boolean; ingesting: boolean };

/** One line above an open note: the next step, with its button. Nothing once all three are done. */
function StartStrip({ notes, pending, a }: { notes: NoteSummary[]; pending: string[]; a: StartActions }) {
  const { t } = useT();
  const s = startProgress(notes, pending);
  if (s.done) return null;
  const step = !s.hasSource ? 1 : !s.ingested ? 2 : 3;
  return (
    <div className="mx-auto flex max-w-[660px] flex-wrap items-center gap-2 px-5 sb:px-10 pt-4 text-[12.5px]" data-testid="start-strip">
      <span className="rounded-full border border-line px-2 py-[1px] text-[11px] text-ink-faint">{t('start.stepOf', { n: step })}</span>
      {step === 1 && <><span className="text-ink-soft">{t('start.addSource')}</span><button className={`${btnPrimary} px-3 py-1`} onClick={a.onPasteUrl}>{t('start.pasteUrl')}</button></>}
      {step === 2 && s.firstPending && (a.aiReady
        ? <><span className="text-ink-soft">{t('start.ingest')}</span><button className={`${btnPrimary} px-3 py-1`} disabled={a.ingesting} onClick={() => a.onIngest(s.firstPending!.path)} data-testid="start-ingest">{t('start.ingestNow', { title: s.firstPending.title })}</button></>
        : <><span className="text-ink-soft">{t('start.ingestHint')}</span><a className={`${btnGhost} px-3 py-1`} href="/settings">{t('note.setupKey')}</a></>)}
      {step === 3 && <><span className="text-ink-soft">{t('start.ask')}</span><button className={`${btnPrimary} px-3 py-1`} onClick={a.onAsk} data-testid="start-ask">{t('start.askNow')}</button></>}
    </div>
  );
}

function StartChecklist({ notes, pending, onPasteUrl, onWrite, onIngest, onAsk, aiReady, ingesting }: { notes: NoteSummary[]; pending: string[] } & StartActions) {
  const { t } = useT();
  const { hasSource, ingested, asked, firstPending, done } = startProgress(notes, pending);
  if (done) return null;
  const steps: [string, string, boolean][] = [[t('start.addSource'), t('start.addSourceHint'), hasSource], [t('start.ingest'), t('start.ingestHint'), ingested], [t('start.ask'), t('start.askHint'), asked]];
  return (
    <div className="mx-auto mt-6 max-w-[480px] rounded-[12px] border border-line bg-paper p-5 text-left" data-testid="start-checklist">
      <div className="text-[12px] font-semibold uppercase tracking-[.06em] text-ink-faint">{t('start.title')}</div>
      <ol className="mt-3 space-y-2.5">
        {steps.map(([title, hint, done], i) => (
          <li key={title} className="flex items-start gap-3">
            <span className={`mt-[2px] flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${done ? 'bg-celadon text-white' : 'border border-line text-ink-faint'}`} aria-label={done ? t('start.done') : ''}>{done ? '✓' : i + 1}</span>
            <span><span className={`text-[14px] font-semibold ${done ? 'text-ink-faint line-through' : 'text-ink'}`}>{title}</span><span className="block text-[12.5px] text-ink-soft">{hint}</span></span>
          </li>
        ))}
      </ol>
      {!hasSource && <div className="mt-4 flex flex-wrap gap-2"><button className={btnPrimary} onClick={onPasteUrl} data-testid="start-paste-url">{t('start.pasteUrl')}</button><button className={btnGhost} onClick={onWrite}>{t('start.write')}</button></div>}
      {hasSource && !ingested && firstPending && (aiReady
        ? <div className="mt-4 flex flex-wrap gap-2"><button className={btnPrimary} disabled={ingesting} onClick={() => onIngest(firstPending.path)} data-testid="start-ingest">{t('start.ingestNow', { title: firstPending.title })}</button></div>
        : <div className="mt-4 flex flex-wrap gap-2"><a className={`${btnGhost} inline-block`} href="/settings">{t('note.setupKey')}</a></div>)}
      {hasSource && ingested && !asked && <div className="mt-4 flex flex-wrap gap-2"><button className={btnPrimary} onClick={onAsk} data-testid="start-ask">{t('start.askNow')}</button></div>}
    </div>
  );
}

function SidebarSkeleton() {
  const { t } = useT();
  return (
    <div className="animate-pulse space-y-3 p-4" aria-label={t('loading.skeleton')} aria-busy="true">
      {[3, 5, 4].map((n, i) => <div key={i} className="space-y-2"><div className="h-3 w-24 rounded bg-line" />{Array.from({ length: n }).map((_, k) => <div key={k} className="ml-4 h-3 rounded bg-line/70" style={{ width: `${55 + ((k * 17) % 35)}%` }} />)}</div>)}
    </div>
  );
}
function NoteSkeleton() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-[660px] animate-pulse px-5 pt-9 sb:px-10" aria-label={t('loading.skeleton')} aria-busy="true">
      <div className="h-3 w-20 rounded bg-line" /><div className="mt-4 h-7 w-2/3 rounded bg-line" /><div className="mt-3 h-3 w-40 rounded bg-line/70" />
      <div className="mt-8 space-y-3">{[92, 100, 85, 96, 70, 88].map((w, i) => <div key={i} className="h-3 rounded bg-line/70" style={{ width: `${w}%` }} />)}</div>
    </div>
  );
}
