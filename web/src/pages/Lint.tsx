import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, type LintReport, type Me } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { btnGhost, btnPrimary } from '../components/ui';
import { PageShell } from '../components/PageShell';
import { IngestPanel } from '../components/IngestPanel';
import { noteUrl } from '../lib/noteUrl';

// Lint page (Karpathy's Lint): structural checks are computed live; the semantic audit is delegated to the agent or Cursor.
export default function Lint({ me }: { me: Me }) {
  const [data, setData] = useState<{ report: LintReport; summary: string; prompt: string } | null>(null);
  const [aiReady, setAiReady] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [reports, setReports] = useState<{ path: string; title: string }[]>([]);
  const { toast } = useToast();
  const { t } = useT();
  const navigate = useNavigate();
  const load = () => Promise.all([api.lint().then(setData), api.tree().then(r => setReports(r.notes.filter(n => n.path.startsWith('wiki/lint/')).sort((a, b) => b.path.localeCompare(a.path))))]).catch(e => toast((e as Error).message, { kind: 'error' }));
  // Same rule as the workspace: a trial with free runs left counts as ready, otherwise a trial user would be told
  // here that they need an API key they do not actually need yet.
  useEffect(() => { load(); Promise.all([api.ai(), api.plan().catch(() => null)])
    .then(([r, p]) => setAiReady(!!r.config || !!(p && p.trial_active && p.trial_runs_used < p.trial_runs_free)))
    .catch(() => {}); }, []);
  const open = (p: string) => navigate(noteUrl(p));
  const copy = () => data && navigator.clipboard.writeText(data.prompt).then(() => toast(t('lint.copied'))).catch(() => toast(t('common.clipboardFail'), { kind: 'error' }));
  async function run() {
    try { const { job } = await api.lintRun(); setJobId(job.id); toast(t('lint.started')); }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
  }
  const Section = ({ title, hint, items, render }: { title: string; hint: string; items: any[]; render: (x: any) => React.ReactNode }) => (
    <section className="mb-6">
      <h2 className="text-[14px] font-semibold">{title} <span className="ml-1 rounded bg-porcelain px-1.5 text-[11px] font-normal text-ink-soft">{items.length}</span></h2>
      <p className="mb-2 text-[12px] text-ink-soft">{hint}</p>
      {items.length === 0 ? <div className="text-[12.5px] text-celadon-deep">{t('lint.noIssues')}</div> : <ul className="space-y-1 text-[12.5px]">{items.slice(0, 50).map((x, i) => <li key={i}>{render(x)}</li>)}{items.length > 50 && <li className="text-ink-faint">{t('lint.more', { n: items.length - 50 })}</li>}</ul>}
    </section>
  );
  const r = data?.report;
  return (
    <PageShell title={t('lint.title')} right={<span className="hidden sb:inline text-[12px] text-ink-soft">{me.user.name || me.user.email}</span>}>
      <main data-testid="lint-page">
        <h1 className="font-serif text-[26px] font-bold mb-1">{t('lint.heading')}</h1>
        <p className="text-[13px] text-ink-soft mb-5 leading-relaxed">{t('lint.intro')}</p>
        {r && (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-porcelain px-4 py-3 text-[13px]" data-testid="lint-summary">
            <b>{data!.summary}</b>
            <span className="text-ink-soft">{t('lint.counts', { pages: r.counts.wiki_pages, links: r.counts.links })}</span>
            <span className="ml-auto flex gap-2">
              {aiReady ? <button className={btnPrimary} onClick={run} disabled={jobId !== null} data-testid="lint-run">{jobId !== null ? t('lint.running') : t('lint.run')}</button> : <Link className={btnGhost} to="/settings">{t('lint.setupKey')}</Link>}
              <button className={btnGhost} onClick={copy}>{t('lint.copyPrompt')}</button>
              <button className={btnGhost} onClick={load}>{t('lint.recheck')}</button>
            </span>
          </div>
        )}
        {jobId !== null && <IngestPanel jobId={jobId} onDone={() => { setJobId(null); load(); }} onClose={() => setJobId(null)} />}
        {r && (
          <>
            <Section title={t('lint.pending.title')} hint={t('lint.pending.hint')} items={r.pending_sources} render={x => <button className="wl" onClick={() => open(x.path)}>{x.title}</button>} />
            <Section title={t('lint.orphans.title')} hint={t('lint.orphans.hint')} items={r.orphans} render={x => <><button className="wl" onClick={() => open(x.path)}>{x.title}</button> <span className="font-mono text-[11px] text-ink-faint">{x.path}</span></>} />
            <Section title={t('lint.dangling.title')} hint={t('lint.dangling.hint')} items={r.dangling} render={x => <><button className="wl" onClick={() => open(x.from)}>{x.from}</button> → <code className="rounded bg-porcelain px-1">[[{x.target}]]</code></>} />
            <Section title={t('lint.notInIndex.title')} hint={t('lint.notInIndex.hint')} items={r.not_in_index} render={x => <><button className="wl" onClick={() => open(x.path)}>{x.title}</button> <span className="font-mono text-[11px] text-ink-faint">{x.path}</span></>} />
            <Section title={t('lint.special.title')} hint={t('lint.special.hint')} items={[...r.missing_special.map(p => t('lint.missing', { path: p })), ...r.log_issues]} render={x => <span>{x}</span>} />
            <section className="mb-6">
              <h2 className="text-[14px] font-semibold mb-2">{t('lint.reports.title')}</h2>
              {reports.length === 0 ? <div className="text-[12.5px] text-ink-faint">{t('lint.reports.empty')}</div> : <ul className="space-y-1 text-[12.5px]">{reports.map(p => <li key={p.path}><button className="wl" onClick={() => open(p.path)}>{p.title}</button> <span className="font-mono text-[11px] text-ink-faint">{p.path}</span></li>)}</ul>}
            </section>
          </>
        )}
      </main>
    </PageShell>
  );
}
