import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { bibMap, BibProvider } from '../lib/cite';
import { api, ApiError, layerOf, type Graph, type Me, type Note, type BibEntry, type NoteSummary, type SearchHit, type Version } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { Topbar } from '../components/Topbar';
import { Sidebar } from '../components/Sidebar';
import { NoteView } from '../components/NoteView';
import { Editor } from '../components/Editor';
import { Rail } from '../components/Rail';
import { SearchResults } from '../components/SearchResults';
import { GraphView } from '../components/GraphView';
import { TableView } from '../components/TableView';
import { OnboardingModal } from '../components/OnboardingModal';
import { AddModal, type AddTab } from '../components/AddModal';
import { IngestPanel } from '../components/IngestPanel';
import { ChatPanel } from '../components/ChatPanel';
import { Footer } from '../components/Footer';

type Mode = 'read' | 'edit' | 'search';

export default function Workspace({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useT();
  const path = params['*'] ? decodeURIComponent(params['*']) : null;
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
      try { const { job } = await api.ingestJob(ingestJobId); if (job.status === 'done' || job.status === 'failed') { setIngesting(false); reloadTree(); if (path) reloadNote(path); if (job.status === 'failed') toast(t('workspace.ingestFailed', { error: job.error ?? '' }), { kind: 'error', sticky: true }); } }
      catch { /* retry next tick */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [ingesting, ingestJobId, path, reloadTree, reloadNote, toast, t]);

  const openNote = useCallback((p: string) => { setMode('read'); setSearch(null); setHistorical(null); navigate(`/n/${p}`); }, [navigate]);
  const setView = (v: 'note' | 'graph' | 'table') => navigate(v === 'graph' ? '/graph' : v === 'table' ? '/table' : path ? `/n/${path}` : '/');

  const [keepDraft, setKeepDraft] = useState<string | null>(null); // draft kept after a 409
  async function save(content: string) {
    if (!note) return;
    setBusy(true);
    try {
      await api.update(note.path, content, note.version);
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
    try { const r = await api.archive(note.path, undo); toast(undo ? t('workspace.unarchived') : t('workspace.archived')); await reloadTree(); navigate(`/n/${r.path}`); }
    catch (e) { fail(e); }
  }
  async function remove() {
    if (!note || !confirm(t('workspace.deleteConfirm', { title: note.title }))) return;
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
    if (view === 'table') return <TableView onOpen={p => navigate(`/n/${p}`)} folders={[...new Set(notes.map(n => n.path.split('/').slice(0, -1).join('/')).filter(f => f.includes('/')))].sort()} />;
    if (view === 'graph') return graph ? <GraphView graph={graph} focusPath={path || null} onOpen={p => { navigate(`/n/${p}`); }} /> : <div className="p-10 text-ink-soft">{t('workspace.loadingGraph')}</div>;
    if (mode === 'search' && search) return <SearchResults query={search.query} hits={search.hits} onOpen={openNote} />;
    if (notFound) return <div className="mx-auto max-w-[660px] px-10 pt-16 text-center"><h1 className="font-serif text-[22px] font-bold mb-2">{t('workspace.notFound')}</h1><p className="text-[13px] text-ink-soft font-mono">{path}</p></div>;
    if (!note) return (
      <div className="mx-auto max-w-[660px] px-10 pt-16 text-center text-ink-soft">
        <h1 className="font-serif text-[24px] font-bold text-ink mb-3">{t('workspace.welcome')}</h1>
        <p className="text-[13.5px] leading-relaxed">{notes.length === 0 ? <>{t('workspace.empty1')}<a className="text-celadon-deep underline" href="/settings">{t('workspace.emptyLink')}</a>{t('workspace.empty2')}</> : <>{t('workspace.pickHint')}</>}<br />{t('workspace.helpBefore')}<a className="text-celadon-deep underline" href="/help">{t('workspace.helpLink')}</a>{t('workspace.helpAfter')}</p>
      </div>
    );
    if (mode === 'edit') return <Editor key={note.path + note.version} note={note} initial={keepDraft ?? undefined} notes={notes} onSave={save} onCancel={() => { setKeepDraft(null); setMode('read'); }} busy={busy} />;
    return (
      <>
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
      <Topbar email={me.user.email} view={view} onView={setView} onSearch={doSearch} onNew={() => setAdd({ tab: 'write', layer: layerOf(path ?? 'wiki/x') || 'wiki' })}
        onSignOut={signOut} onToggleSidebar={() => setSidebarOpen(o => !o)} onToggleRail={() => setRailOpen(o => !o)} onChat={() => setChatOpen(o => !o)} chatOpen={chatOpen} />
      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && <button className="fixed inset-0 z-20 bg-ink/30 sb:hidden" aria-label={t('workspace.closeSidebar')} onClick={() => setSidebarOpen(false)} />}
        <div className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-30 w-[260px] shadow-2xl' : 'hidden'} sb:static sb:block sb:w-[240px] sb:flex-none border-r border-line`} data-testid="sidebar">
          <Sidebar notes={notes} pending={pending} active={path} onOpen={openNote} onNew={l => setAdd({ tab: 'write', layer: l })} onImport={() => setAdd({ tab: 'url', layer: 'raw' })} />
        </div>
        <main className={`min-w-0 flex-1 ${mode === 'edit' || view === 'graph' || view === 'table' ? 'overflow-hidden' : 'overflow-y-auto'}`}>{main()}</main>
        {railOpen && <button className="fixed inset-0 z-20 bg-ink/30 rail:hidden" aria-label={t('workspace.closeRail')} onClick={() => setRailOpen(false)} />}
        {chatOpen && (
          <div className="fixed inset-y-0 right-0 z-30 w-full max-w-[420px] border-l border-line shadow-2xl sb:static sb:z-auto sb:w-[380px] sb:max-w-none sb:flex-none sb:shadow-none" data-testid="chat-drawer">
            <ChatPanel aiReady={aiReady} notes={notes} draft={chatDraft} onDraftUsed={() => setChatDraft(null)} onOpen={p => { openNote(p); }} onClose={() => setChatOpen(false)} onChanged={() => { reloadTree(); if (path) reloadNote(path); }} pending={pending} ingesting={ingesting} onIngestFromChat={(src, guidance) => { navigate(`/n/${src}`); autoIngest([src], guidance); }} />
          </div>
        )}
        {note && view === 'note' && mode !== 'search' && !chatOpen && (
          <div className={`${railOpen ? 'fixed inset-y-0 right-0 z-30 w-[280px] shadow-2xl' : 'hidden'} rail:static rail:block rail:w-[250px] rail:flex-none border-l border-line`} data-testid="rail">
            <Rail backlinks={backlinks} versions={versions} current={note.version} viewing={historical?.version ?? null} onOpen={p => { setRailOpen(false); openNote(p); }}
              onView={v => { setHistorical(v); setMode('read'); setRailOpen(false); }} onRollback={rollback} readonly={layerOf(note.path) === 'raw'} />
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
        <OnboardingModal
          onDone={() => { reloadTree(); }}
          onSkip={() => { setOnboardingSkipped(true); try { localStorage.setItem(`wb-onboarding-skipped:${me.workspace.id}`, '1'); } catch { /* fine without storage */ } }}
        />
      )}
    </div>
    </BibProvider>
  );
}
