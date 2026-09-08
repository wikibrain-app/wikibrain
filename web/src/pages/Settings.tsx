import { PlanCard } from '../components/PlanCard';
import { ZoteroSettings } from '../components/ZoteroSettings';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, fmtTok, fmtUsd, formatTime, type AiConfig, type AiProvider, type IngestJob, type IngestStats, type Me, type ModelInfo, type TokenInfo } from '../lib/api';
import { useToast } from '../lib/toast';
import { useConfirm } from '../lib/confirm';
import { LANGS, translate, useLang, useT, type Lang } from '../i18n';
import { Field, btnGhost, btnPrimary, input } from '../components/ui';
import { PageShell } from '../components/PageShell';
import { THEMES, getTheme, setTheme, type Theme } from '../theme';
import { AppliedResult, TemplatePicker } from '../components/TemplatePicker';
import { ConnectCursorModal } from '../components/ConnectCursorModal';

const NAV = ['account', 'plan', 'connect', 'ai', 'data', 'templates', 'danger'] as const;

export default function Settings({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const changeTheme = (th: Theme) => { setTheme(th); setThemeState(th); };
  const [label, setLabel] = useState('cursor');
  const [fresh, setFresh] = useState<{ id: number; token: string } | null>(null);
  const [ai, setAi] = useState<{ config: AiConfig | null; providers: AiProvider[] } | null>(null);
  const [aiForm, setAiForm] = useState({ provider: 'anthropic', model: '', apiKey: '' });
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [stats, setStats] = useState<IngestStats | null>(null);
  const [connect, setConnect] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsState, setModelsState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [modelsMsg, setModelsMsg] = useState('');
  const [applied, setApplied] = useState<{ created: string[]; skipped: string[]; prompt: string } | null>(null);
  const [usage, setUsage] = useState<{ month: string; mcp_calls: number; note_count: number; storage_bytes: number } | null>(null);
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const { t, lang, locale } = useT();
  const tt = t; // the tokens table's map parameter is also named t; use tt there
  const { setLang } = useLang();
  const navigate = useNavigate();
  const reload = () => api.tokens().then(r => setTokens(r.tokens)).catch(e => toast(e.message, { kind: 'error' }));
  const reloadAi = () => api.ai().then(r => { setAi(r); if (r.config) setAiForm(f => ({ ...f, provider: r.config!.provider, model: r.config!.model })); }).catch(() => {});
  useEffect(() => { reload(); api.usage().then(setUsage).catch(() => {}); reloadAi(); api.ingestJobs().then(r => setJobs(r.jobs)).catch(() => {}); api.ingestStats().then(setStats).catch(() => {}); }, []);
  // Fetching the model list doubles as the connection test: OpenRouter needs no key; the other two use the key being typed or the saved one.
  async function loadModels(showToast = false) {
    setModelsState('loading'); setModelsMsg('');
    try {
      const r = await api.aiModels(aiForm.provider, aiForm.apiKey || undefined);
      setModels(r.models); setModelsState('ok'); setModelsMsg(t('settings.modelsCount', { n: r.models.length }));
      if (showToast) toast(t('settings.connected', { n: r.models.length }));
    } catch (err) { setModels([]); setModelsState('error'); setModelsMsg((err as Error).message); if (showToast) toast((err as Error).message, { kind: 'error' }); }
  }
  useEffect(() => { if (aiForm.provider === 'openrouter' || ai?.config?.provider === aiForm.provider) loadModels(); else { setModels([]); setModelsState('idle'); setModelsMsg(''); } }, [aiForm.provider, ai?.config?.provider]);
  const fmtPrice = (m: ModelInfo) => m.pricing ? t('settings.perMillion', { in: m.pricing.input.toFixed(2), out: m.pricing.output.toFixed(2) }) : '';
  const picked = models.find(m => m.id === (aiForm.model || ai?.providers.find(p => p.id === aiForm.provider)?.defaultModel));
  async function saveAi(e: FormEvent) {
    e.preventDefault();
    try { await api.setAi(aiForm.provider, aiForm.model, aiForm.apiKey || undefined); setAiForm(f => ({ ...f, apiKey: '' })); await reloadAi(); toast(t('settings.aiSaved')); }
    catch (err) { toast((err as Error).message, { kind: 'error' }); }
  }
  async function removeAi() {
    if (!(await confirmDialog({ title: t('settings.aiDeleteTitle'), body: t('settings.aiDeleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    try { await api.deleteAi(); await reloadAi(); toast(t('settings.aiDeleted')); } catch (err) { toast((err as Error).message, { kind: 'error' }); }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const t = await api.createToken(label);
      setFresh({ id: t.id, token: t.token });
      reload();
    } catch (err) { toast((err as Error).message, { kind: 'error' }); }
  }
  async function revoke(id: number) {
    if (!(await confirmDialog({ title: t('settings.revokeTitle'), body: t('settings.revokeConfirm'), danger: true }))) return;
    try { await api.revokeToken(id); if (fresh?.id === id) setFresh(null); reload(); toast(t('settings.revoked')); }
    catch (err) { toast((err as Error).message, { kind: 'error' }); }
  }
  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast(t('common.copied'))).catch(() => toast(t('common.clipboardFail'), { kind: 'error' }));
  async function deleteAccount() {
    const pw = await confirmDialog({ title: t('settings.danger.title2'), body: t('settings.danger.confirm1'), confirmLabel: t('settings.danger.ok'), danger: true, input: { label: t('settings.danger.password'), type: 'password' } });
    if (typeof pw !== 'string' || !pw) return;
    try { await api.deleteAccount(pw); toast(t('settings.danger.done')); onSignedOut(); navigate('/'); }
    catch (e) { toast((e as Error).message || t('settings.danger.failed'), { kind: 'error' }); }
  }
  async function signOut() { await api.signOut().catch(() => {}); onSignedOut(); navigate('/login'); }
  // UI language: save to the workspace (source of truth) first, switch the frontend only on success; the toast uses the new language
  async function changeLang(l: Lang) {
    try { await api.setLang(l); setLang(l); toast(translate(l, 'lang.saved')); }
    catch (err) { toast((err as Error).message, { kind: 'error' }); }
  }

  return (
    <PageShell title={t('settings.title')} wide right={<><Link to="/help" className="text-[12px] text-celadon-deep hover:underline">{t('auth.help')}</Link><span className="hidden sb:inline text-[12px] text-ink-soft">{me.user.name || me.user.email}</span><button className={btnGhost} onClick={signOut}>{t('settings.signOut')}</button></>}>
      <div className="grid gap-8 sb:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="sb:sticky sb:top-6 self-start font-sans text-[13px]" aria-label={t('settings.title')}>
          <Link to="/" className="mb-3 block text-[12px] text-celadon-deep">{t('settings.backToKb')}</Link>
          <ol className="flex gap-1 overflow-x-auto sb:block sb:space-y-0.5">
            {NAV.map(id => <li key={id}><a href={`#${id}`} className={`block whitespace-nowrap rounded-md px-2.5 py-1.5 ${id === 'danger' ? 'text-ink-faint hover:text-danger' : 'text-ink-soft hover:bg-porcelain hover:text-ink'}`}>{t(`settings.nav.${id}`)}</a></li>)}
          </ol>
        </nav>
        <main className="min-w-0 space-y-6">
          <header>
            <h1 className="font-serif text-[26px] font-bold mb-1">{t('settings.title')}</h1>
            <p className="text-[13px] text-ink-soft">{t('settings.account', { name: me.user.name || me.user.email, email: me.user.email, workspace: me.workspace.name })}</p>
          </header>

          <section id="account" className="rounded-[12px] border border-line bg-paper p-5 sb:p-6 scroll-mt-6" data-testid="account-settings">
            <h2 className="text-[15px] font-semibold mb-1">{t('settings.nav.account')}</h2>
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              <div data-testid="lang-settings">
                <div className="text-[13px] font-semibold">{t('lang.label')}</div>
                <p className="text-[12px] text-ink-soft mb-2 leading-relaxed">{t('lang.hint')}</p>
                <select id="lang" aria-label={t('lang.label')} className={`${input} max-w-[240px]`} value={lang} onChange={e => changeLang(e.target.value as Lang)} data-testid="lang-select">
            {LANGS.map(l => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
          </select>
              </div>
              <div data-testid="theme-settings">
                <div className="text-[13px] font-semibold">{t('theme.label')}</div>
                <p className="text-[12px] text-ink-soft mb-2 leading-relaxed">{t('theme.hint')}</p>
                <div className="inline-flex overflow-hidden rounded-lg border border-line" role="radiogroup" aria-label={t('theme.label')}>
            {THEMES.map(th => (
              <button key={th} type="button" role="radio" aria-checked={theme === th} data-testid={`theme-${th}`} onClick={() => changeTheme(th)}
                className={`px-3.5 py-[7px] text-[12.5px] sb:text-[13px] ${theme === th ? 'bg-celadon-mist font-semibold text-celadon-deep' : 'text-ink-soft hover:bg-porcelain'}`}>{t(`theme.${th}`)}</button>
            ))}
          </div>
              </div>
            </div>
          </section>

          <section id="plan" className="rounded-[12px] border border-line bg-paper p-5 sb:p-6 scroll-mt-6 [&>section]:mb-0" data-testid="usage">
            <PlanCard />
            <div className="mt-4 text-[13px] font-semibold mb-2">{t('settings.usage.title')}</div>
            <div className="flex flex-wrap gap-3 mb-4">
            {usage ? [
              [t('settings.usage.mcpCalls', { month: usage.month }), usage.mcp_calls.toLocaleString(locale)],
              [t('settings.usage.notes'), usage.note_count.toLocaleString(locale)],
              [t('settings.usage.storage'), usage.storage_bytes < 1024 * 1024 ? `${(usage.storage_bytes / 1024).toFixed(1)} KB` : `${(usage.storage_bytes / 1024 / 1024).toFixed(1)} MB`],
            ].map(([k, v]) => (
              <div key={k} className="min-w-[140px] rounded-[10px] border border-line bg-porcelain px-4 py-3"><div className="text-[11px] text-ink-soft">{k}</div><div className="font-serif text-[20px] font-bold">{v}</div></div>
            )) : <span className="text-[12px] text-ink-faint">{t('app.loading')}</span>}
          </div>
          </section>

          <section id="connect" className="rounded-[12px] border border-line bg-paper p-5 sb:p-6 scroll-mt-6" data-testid="ingest-paths">
            <h2 className="text-[15px] font-semibold mb-1">{t('settings.connect.title')}</h2>
            <p className="text-[12.5px] text-ink-soft mb-4 leading-relaxed">{t('settings.connect.intro')}</p>
            <div className="grid gap-3 sb:grid-cols-3">
              {(['cursor', 'cloud', 'web'] as const).map(k => (
                <div key={k} className="rounded-[10px] border border-line bg-porcelain px-4 py-3 text-[12.5px] leading-relaxed">
                  <div className="font-semibold text-celadon-deep mb-1">{t(`settings.connect.${k}.title`)}</div>
                  {t(`settings.connect.${k}.body`)}
                  <div className="mt-2">
                    {k === 'cursor' && <button className={btnPrimary} onClick={() => setConnect(true)}>{t('settings.tokens.connect')}</button>}
                    {k === 'cloud' && <button className={btnGhost} onClick={() => copy(me.mcpUrl)} data-testid="copy-mcp-url">{t('settings.connect.mcpUrl')} · {t('common.copy')}</button>}
                    {k === 'web' && <a className={`${btnGhost} inline-block`} href="#ai">{t('settings.nav.ai')} →</a>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[12px] text-ink-soft" data-testid="oauth-intro">{t('settings.connect.mcpUrl')}: <code className="rounded bg-porcelain px-1">{me.mcpUrl}</code></div>
            <h3 className="mt-6 mb-2 text-[13px] font-semibold">{t('settings.connect.tokensTitle')}</h3>
            <form onSubmit={create} className="flex items-end gap-2 mb-5 max-w-[420px]">
            <div className="flex-1"><Field label={t('settings.tokens.label')} htmlFor="label"><input id="label" className={input} value={label} onChange={e => setLabel(e.target.value)} /></Field></div>
            <button className={`${btnPrimary} mb-3.5`}>{t('settings.tokens.create')}</button>
          </form>
          {fresh && (
            <div className="mb-5 rounded-[10px] border border-celadon bg-celadon-mist p-4">
              <div className="text-[12px] text-celadon-deep font-semibold mb-2">{t('settings.tokens.fresh')}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-paper px-3 py-2 font-mono text-[12.5px]" data-testid="fresh-token">{fresh.token}</code>
                <button className={btnGhost} onClick={() => copy(fresh.token)}>{t('common.copy')}</button>
              </div>
              <div className="mt-3 text-[12px] text-ink-soft">{t('settings.tokens.mcpJson')}</div>
              <pre className="mt-1 overflow-x-auto rounded-[10px] bg-code text-code-fg p-3.5 font-mono text-[12px] leading-relaxed">{mcpJson(me.mcpUrl, fresh.token)}</pre>
              <button className={`${btnGhost} mt-2`} onClick={() => copy(mcpJson(me.mcpUrl, fresh.token))}>{t('settings.tokens.copyJson')}</button>
            </div>
          )}
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[12px] text-ink-soft border-b border-line"><th className="py-2 font-medium">{t('settings.tokens.thLabel')}</th><th className="font-medium">{t('settings.tokens.thCreated')}</th><th className="font-medium">{t('settings.tokens.thLastUsed')}</th><th className="font-medium">{t('settings.tokens.thStatus')}</th><th /></tr></thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id} className="border-b border-dashed border-line" data-testid={`token-${t.id}`}>
                  <td className="py-2.5">{t.label}{t.kind === 'oauth' && <span className="ml-1.5 rounded bg-celadon-mist px-1.5 py-[1px] text-[11px] text-celadon-deep">{tt('settings.tokens.kindOauth')}</span>}</td>
                  <td className="text-ink-soft">{formatTime(t.created_at)}</td>
                  <td className="text-ink-soft">{t.last_used_at ? formatTime(t.last_used_at) : tt('settings.tokens.unused')}</td>
                  <td>{t.revoked_at ? <span className="text-ink-faint">{tt('settings.tokens.revoked')}</span> : t.expires_at && new Date(t.expires_at) < new Date() ? <span className="text-ink-faint">{tt('settings.tokens.expired')}</span> : <span className="text-celadon-deep">{tt('settings.tokens.active')}</span>}</td>
                  <td className="text-right">{!t.revoked_at && <button className="text-[12px] text-ink-soft hover:text-danger" onClick={() => revoke(t.id)}>{tt('settings.tokens.revoke')}</button>}</td>
                </tr>
              ))}
              {tokens.length === 0 && <tr><td colSpan={5} className="py-4 text-ink-faint text-[12.5px]">{t('settings.tokens.empty')}</td></tr>}
            </tbody>
          </table>
            <p className="mt-3 text-[12px] text-ink-faint">{t('settings.connect.rest')} <Link to="/help/guide#api" className="text-celadon-deep hover:underline">{t('auth.help')}</Link></p>
          </section>

          <section id="ai" className="rounded-[12px] border border-line bg-paper p-5 sb:p-6 scroll-mt-6" data-testid="ai-settings">
            <h2 className="text-[15px] font-semibold mb-1">{t('settings.ai.title')}</h2>
            <p className="text-[12.5px] text-ink-soft mb-4 leading-relaxed">{t('settings.ai.intro')}</p>
            {ai?.config && (
            <div className="mb-3 rounded-[10px] border border-line bg-porcelain px-4 py-2.5 text-[12.5px]">
              {t('settings.ai.current')}<b>{ai.providers.find(p => p.id === ai.config!.provider)?.label ?? ai.config.provider}</b>{t('settings.ai.currentModel')}<span className="font-mono">{ai.config.model}</span> · key ····{ai.config.key_last4}
              <button className="ml-3 text-[12px] text-ink-soft hover:text-danger" onClick={removeAi}>{t('settings.ai.deleteKey')}</button>
            </div>
          )}
          <form onSubmit={saveAi} className="max-w-[720px]">
            <div className="grid gap-3 sm:grid-cols-[170px_1fr] items-start">
              <Field label={t('settings.ai.provider')} htmlFor="ai-provider">
                <select id="ai-provider" className={input} value={aiForm.provider} onChange={e => setAiForm(f => ({ ...f, provider: e.target.value, model: '' }))}>
                  {(ai?.providers ?? []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
              <Field label={t('settings.ai.model')} htmlFor="ai-model">
                <input id="ai-model" className={`${input} font-mono`} list="ai-model-list" placeholder={ai?.providers.find(p => p.id === aiForm.provider)?.defaultModel ?? ''} value={aiForm.model} onChange={e => setAiForm(f => ({ ...f, model: e.target.value }))} />
                <datalist id="ai-model-list">{models.map(m => <option key={m.id} value={m.id}>{m.name !== m.id ? `${m.name}${m.pricing ? ` · ${fmtPrice(m)}` : ''}` : (m.pricing ? fmtPrice(m) : '')}</option>)}</datalist>
                <div className="mt-1 text-[11px] text-ink-faint leading-relaxed">{picked ? <>{picked.name}{picked.context ? ` · ${t('settings.ai.context', { k: (picked.context / 1000).toFixed(0) })}` : ''}{picked.pricing ? ` · ${fmtPrice(picked)}` : ''}</> : models.length ? t('settings.ai.pickHint', { n: models.length }) : t('settings.ai.emptyHint')}</div>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-start">
              <Field label={ai?.config ? t('settings.ai.keyKeep') : 'API key'} htmlFor="ai-key">
                <input id="ai-key" className={`${input} font-mono`} type="password" autoComplete="off" placeholder={ai?.providers.find(p => p.id === aiForm.provider)?.keyHint ?? ''} value={aiForm.apiKey} onChange={e => setAiForm(f => ({ ...f, apiKey: e.target.value }))} />
              </Field>
              <div className="flex gap-2 pt-[22px]">
                <button type="button" className={btnGhost} onClick={() => loadModels(true)} disabled={modelsState === 'loading'}>{modelsState === 'loading' ? t('settings.ai.connecting') : t('settings.ai.test')}</button>
                <button className={btnPrimary}>{t('common.save')}</button>
              </div>
            </div>
          </form>
          {modelsMsg && <div className={`mt-1 text-[12px] ${modelsState === 'error' ? 'text-danger' : 'text-ink-soft'}`} data-testid="ai-models-msg">{modelsMsg}</div>}
          {stats && (stats.allTime.jobs > 0) && (
            <div className="mt-5" data-testid="ingest-stats">
              <div className="text-[13px] font-semibold mb-2">{t('settings.stats.title')}</div>
              <div className="flex flex-wrap gap-3 mb-3">
                {[
                  [t('settings.stats.month', { month: stats.month }), stats.thisMonth],
                  [t('settings.stats.allTime'), stats.allTime],
                ].map(([k, r]) => { const row = r as IngestStats['thisMonth']; return (
                  <div key={k as string} className="min-w-[220px] rounded-[10px] border border-line bg-porcelain px-4 py-3">
                    <div className="text-[11px] text-ink-soft">{k as string} · {t('settings.stats.runs', { n: row.jobs })}</div>
                    <div className="font-serif text-[20px] font-bold">{fmtUsd(row.cost_usd)}<span className="ml-1 text-[11px] font-sans font-normal text-ink-faint">{t('settings.stats.usdEst')}</span></div>
                    <div className="text-[11.5px] text-ink-soft">{t('settings.stats.inOut', { in: fmtTok(row.tokens_in), out: fmtTok(row.tokens_out) })}{row.unpriced > 0 ? t('settings.stats.unpriced', { n: row.unpriced }) : ''}</div>
                  </div>
                ); })}
              </div>
              <table className="w-full text-[12.5px] mb-4">
                <thead><tr className="text-left text-[12px] text-ink-soft border-b border-line"><th className="py-1.5 font-medium">{t('settings.stats.thModel')}</th><th className="font-medium">{t('settings.stats.thRuns')}</th><th className="font-medium">{t('settings.stats.thTokens')}</th><th className="font-medium">{t('settings.stats.thPrice')}</th><th className="font-medium text-right">{t('settings.stats.thCost')}</th></tr></thead>
                <tbody>
                  {stats.byModel.map(r => { const j = jobs.find(x => x.provider === r.provider && x.model === r.model && x.price_in !== null); return (
                    <tr key={`${r.provider}/${r.model}`} className="border-b border-dashed border-line">
                      <td className="py-1.5 font-mono text-[11.5px]">{r.provider}/{r.model}</td>
                      <td>{r.jobs}</td>
                      <td className="text-ink-soft">{fmtTok(r.tokens_in)} / {fmtTok(r.tokens_out)}</td>
                      <td className="text-ink-soft">{j?.price_in !== null && j?.price_in !== undefined ? `＄${j.price_in.toFixed(2)} / ＄${j.price_out!.toFixed(2)}` : t('settings.stats.unknown')}</td>
                      <td className="text-right">{fmtUsd(r.cost_usd)}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
              <div className="text-[12px] text-ink-soft mb-1.5">{t('settings.stats.recent')}</div>
              <table className="w-full text-[12.5px]">
                <tbody>
                  {jobs.map(j => (
                    <tr key={j.id} className="border-b border-dashed border-line">
                      <td className="py-1.5 text-ink-soft">{formatTime(j.created_at)}</td>
                      <td className="font-mono text-[11.5px]">{j.model}</td>
                      <td className="font-mono text-[11.5px]">{t('settings.stats.sources', { n: j.paths.length })}</td>
                      <td>{j.status === 'done' ? <span className="text-celadon-deep">{t('settings.stats.done')}</span> : j.status === 'failed' ? <span className="text-danger" title={j.error ?? ''}>{t('settings.stats.failed')}</span> : t('settings.stats.running')}</td>
                      <td className="text-ink-soft">{t('settings.stats.steps', { n: j.steps })} · {fmtTok(j.tokens_in)} / {fmtTok(j.tokens_out)}</td>
                      <td className="text-right">{fmtUsd(j.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1.5 text-[11px] text-ink-faint">{t('settings.stats.disclaimer')}</div>
            </div>
          )}
          </section>

          <section id="data" className="rounded-[12px] border border-line bg-paper p-5 sb:p-6 scroll-mt-6 [&>section]:mb-0" data-testid="data-settings">
            <h2 className="text-[15px] font-semibold mb-1">{t('settings.data.title')}</h2>
            <p className="text-[12.5px] text-ink-soft mb-4 leading-relaxed">{t('settings.data.intro')}</p>
            <div className="mb-6">
              <a className={btnGhost} href={api.exportUrl} download data-testid="export-link">{t('settings.usage.export')}</a>
          <span className="ml-2 text-[12px] text-ink-faint">{t('settings.usage.exportHint')}</span>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <a className={btnGhost} href={api.exportBibtexUrl} download data-testid="export-bibtex">{t('settings.usage.exportBib')}</a>
            <a className={btnGhost} href={api.exportCslUrl} download data-testid="export-csl">{t('settings.usage.exportCsl')}</a>
            <span className="text-[12px] text-ink-faint">{t('settings.usage.exportBibHint')}</span>
          </div>
            </div>
            <ZoteroSettings />
          </section>

          <section id="templates" className="rounded-[12px] border border-line bg-paper p-5 sb:p-6 scroll-mt-6" data-testid="template-settings">
            <h2 className="text-[15px] font-semibold mb-1">{t('settings.templates.title')}</h2>
            <p className="text-[12.5px] text-ink-soft mb-4 leading-relaxed">{t('settings.templates.intro1')}<b>{t('settings.templates.bold')}</b>{t('settings.templates.intro2')}</p>
            {applied ? <AppliedResult r={applied} onClose={() => { setApplied(null); api.usage().then(setUsage).catch(() => {}); }} /> : <TemplatePicker compact onApplied={r => { setApplied(r); api.usage().then(setUsage).catch(() => {}); }} />}
          </section>

          <section id="danger" className="rounded-[12px] border border-danger-line bg-danger-mist p-5 sb:p-6 scroll-mt-6" data-testid="danger-zone">
            <h2 className="text-[15px] font-semibold mb-1 text-danger">{t('settings.danger.title')}</h2>
            <p className="text-[12.5px] text-ink-soft mb-3 leading-relaxed">{t('settings.danger.body')}</p>
          <button className={`${btnGhost} hover:border-danger hover:text-danger`} onClick={deleteAccount} data-testid="delete-account">{t('settings.danger.button')}</button>
          </section>
        </main>
      </div>
      {connect && <ConnectCursorModal mcpUrl={me.mcpUrl} onClose={() => { setConnect(false); reload(); }} />}
    </PageShell>
  );
}

export function mcpJson(mcpUrl: string, token: string): string {
  return JSON.stringify({ mcpServers: { wikibrain: { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
}
