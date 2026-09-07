import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, fmtTok, fmtUsd, type KbStats, type Me } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { PageShell } from '../components/PageShell';
import { BarChart, HBarChart, Heatmap, StatTile } from '../components/charts';

export default function Stats({ me }: { me: Me }) {
  const [s, setS] = useState<KbStats | null>(null);
  const { toast } = useToast();
  const { t, locale } = useT();
  const navigate = useNavigate();
  useEffect(() => { api.stats().then(setS).catch(e => toast((e as Error).message, { kind: 'error' })); }, []);
  const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  const typeName: Record<string, string> = { web: t('stats.type.web'), paper: t('stats.type.paper'), pdf: 'PDF', docx: 'Word', text: t('stats.type.text'), markdown: 'Markdown', note: t('stats.type.note'), meeting: t('stats.type.meeting'), query: t('stats.type.query'), untyped: t('stats.type.untyped') };
  return (
    <PageShell title={t('stats.title')} wide right={<span className="hidden sb:inline text-[12px] text-ink-soft">{me.user.email}</span>}>
      <main data-testid="stats-page">
        <h1 className="font-serif text-[26px] font-bold mb-1">{t('stats.title')}</h1>
        <p className="text-[13px] text-ink-soft mb-5">{t('stats.intro')}</p>
        {s && (
          <>
            <div className="mb-5 flex flex-wrap gap-3" data-testid="stats-tiles">
              <StatTile label={t('stats.notes')} value={s.totals.notes.toLocaleString(locale)} sub={`raw ${s.totals.raw} · wiki ${s.totals.wiki} · schema ${s.totals.schema}`} />
              <StatTile label={t('stats.links')} value={s.totals.links.toLocaleString(locale)} sub={t('stats.versionsSub', { n: s.totals.versions.toLocaleString(locale) })} />
              <StatTile label={t('stats.pending')} value={String(s.totals.pending)} sub={s.totals.pending ? t('stats.pendingYes') : t('stats.pendingNo')} />
              <StatTile label={t('stats.agentMonth')} value={fmtUsd(s.agentMonth.cost)} sub={t('stats.agentMonthSub', { jobs: s.agentMonth.jobs, tokens: fmtTok(s.agentMonth.tokens) })} />
            </div>
            <div className="mb-4"><Heatmap title={t('stats.activity')} sub={t('stats.activitySub')} days={s.activity} /></div>
            <div className="mb-4 grid gap-4 sb:grid-cols-2">
              <BarChart title={t('stats.perLayer')} data={s.layers.map(l => ({ label: l.layer, value: l.count }))} />
              <BarChart title={t('stats.sourceTypes')} sub={t('stats.sourceTypesSub')} data={s.sourceTypes.map(t => ({ label: typeName[t.type] ?? t.type, value: t.count }))} />
            </div>
            <div className="mb-4"><BarChart title={t('stats.newPerDay')} sub={t('stats.last30')} data={s.notesPerDay.map(d => ({ label: md(d.day), value: d.count, hint: d.day }))} labelEvery={3} /></div>
            <div className="mb-4 grid gap-4 sb:grid-cols-2">
              <HBarChart title={t('stats.topInbound')} sub={t('stats.topInboundSub')} valueName={t('stats.inbound')} data={s.topInbound.map(t => ({ label: t.title, value: t.inbound, key: t.path }))} onPick={p => navigate(`/n/${p}`)} />
              <BarChart title={t('stats.agentTokens')} sub={t('stats.agentTokensSub')} valueName="tokens" data={s.agentPerDay.map(d => ({ label: md(d.day), value: d.tokens, hint: t('stats.agentDayHint', { day: d.day, jobs: d.jobs, cost: d.cost !== null ? t('stats.approx', { cost: fmtUsd(d.cost) }) : '' }) }))} labelEvery={3} />
            </div>
          </>
        )}
      </main>
    </PageShell>
  );
}
