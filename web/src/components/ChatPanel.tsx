import { QuotaLine } from './QuotaLine';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, fmtTok, fmtUsd, type ChatMessage, type ChatSession } from '../lib/api';
import { useToast } from '../lib/toast';
import { useT } from '../i18n';
import { Markdown } from './Markdown';
import { btnGhost, btnPrimary, input } from './ui';
import type { NoteSummary } from '../lib/api';

// Chat panel (Karpathy's Query): slides in from the right, runs the agent with the method-2 API key; answers can be filed as wiki pages.
export function ChatPanel({ aiReady, notes, draft, onDraftUsed, onOpen, onClose, onChanged, pending = [], ingesting = false, onIngestFromChat }: { aiReady: boolean; notes: NoteSummary[]; draft?: string | null; onDraftUsed?: () => void; onOpen: (p: string) => void; onClose: () => void; onChanged: () => void; pending?: string[]; ingesting?: boolean; onIngestFromChat?: (sourcePath: string, guidance: string) => void }) {
  const [sessions, setSessions] = useState<Omit<ChatSession, 'messages'>[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [text, setText] = useState('');
  const [pendingJob, setPendingJob] = useState<number | null>(null);
  const [showList, setShowList] = useState(false);
  const { toast } = useToast();
  const { t } = useT();
  const bottom = useRef<HTMLDivElement>(null);
  const ls = () => api.chatSessions().then(r => setSessions(r.sessions)).catch(() => {});
  useEffect(() => { ls(); }, []);
  // Draft passed in from outside (e.g. "discuss before ingesting"): open a new chat and prefill the input so the user can edit before sending
  useEffect(() => { if (draft) { setSession(null); setText(draft); onDraftUsed?.(); } }, [draft]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = taRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.45)}px`; }, [text]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [session?.messages.length, pendingJob]);

  // Waiting for the agent: poll the job status, reload the chat when done
  useEffect(() => {
    if (pendingJob === null || !session) return;
    let alive = true;
    const tick = async () => {
      try {
        const { job } = await api.ingestJob(pendingJob);
        if (!alive) return;
        if (job.status === 'done' || job.status === 'failed') {
          const { session: s } = await api.chatSession(session.id);
          if (!alive) return;
          setSession(s); setPendingJob(null); ls(); onChanged();
          if (job.status === 'failed') toast(t('chat.failed', { err: job.error ?? '' }), { kind: 'error', sticky: true });
          return;
        }
      } catch { /* retry next tick */ }
      if (alive) setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; };
  }, [pendingJob, session?.id]);

  async function open(id: number) { try { const { session: s } = await api.chatSession(id); setSession(s); setShowList(false); } catch (e) { toast((e as Error).message, { kind: 'error' }); } }
  async function fresh() { try { const { session: s } = await api.chatCreate(); setSession(s); setShowList(false); ls(); } catch (e) { toast((e as Error).message, { kind: 'error' }); } }
  async function send(e: FormEvent) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || pendingJob !== null) return;
    try {
      const s = session ?? (await api.chatCreate()).session;
      const r = await api.chatSend(s.id, msg);
      try { localStorage.setItem('wb-first-query', '1'); } catch { /* ignore */ }
      setSession(r.session); setPendingJob(r.job.id); setText('');
    } catch (err) { toast((err as Error).message, { kind: 'error' }); }
  }
  async function file(index: number) {
    if (!session) return;
    try { const r = await api.chatFile(session.id, index); const { session: s } = await api.chatSession(session.id); setSession(s); onChanged(); toast(t('chat.filed', { path: r.path }), { action: { label: t('chat.open'), onClick: () => onOpen(r.path) } }); }
    catch (e) { toast((e as Error).message, { kind: 'error' }); }
  }
  // "Discuss before ingesting" workflow: if a raw/ source mentioned in the chat (or the unsent draft) is still pending, offer a primary "ingest per discussion" button
  const discussed = (() => {
    const firstUser = session?.messages.find(m => m.role === 'user')?.content ?? text;
    const m = firstUser.match(/raw\/[^\s`'"「」（）()]+\.md/);
    return m && pending.includes(m[0]) ? m[0] : null;
  })();
  const discussedTitle = discussed ? (notes.find(n => n.path === discussed)?.title ?? discussed) : '';
  const hasReply = !!session?.messages.some(m => m.role === 'assistant' && !m.failed);
  const ingestFromChat = () => {
    if (!discussed || !onIngestFromChat) return;
    const transcript = (session?.messages ?? []).filter(m => !m.failed).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
    onIngestFromChat(discussed, transcript.slice(-12_000));
  };
  const toolLabel = (tool: string) => (['get_instructions', 'search_notes', 'read_note', 'create_note', 'update_note', 'list_folder'].includes(tool) ? t(`chat.tool.${tool}`) : tool);

  return (
    <div className="flex h-full flex-col bg-paper" data-testid="chat-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button className={`${btnGhost} px-2.5`} onClick={() => setShowList(v => !v)} aria-label={t('chat.list')}>☰</button>
        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold">{session ? session.title : t('chat.title')}</div>
        <button className={`${btnGhost} px-2.5`} onClick={fresh} title={t('chat.new')}>＋</button>
        <button className={`${btnGhost} px-2.5`} onClick={onClose} aria-label={t('chat.close')}>×</button>
      </div>
      {showList && (
        <ul className="max-h-48 overflow-y-auto border-b border-line bg-porcelain text-[12.5px]">
          {sessions.length === 0 && <li className="px-3 py-2 text-ink-faint">{t('chat.empty')}</li>}
          {sessions.map(s => <li key={s.id}><button className={`w-full truncate px-3 py-1.5 text-left hover:bg-celadon-mist ${session?.id === s.id ? 'font-semibold text-celadon-deep' : ''}`} onClick={() => open(s.id)}>{s.title}</button></li>)}
        </ul>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[13px]">
        {!aiReady && (
          <div className="rounded-[10px] border border-amber/40 bg-amber-mist px-3 py-2.5 text-[12.5px] leading-relaxed">
            {t('chat.needKey1')}<Link className="text-celadon-deep underline" to="/settings">{t('chat.needKeyLink')}</Link>{t('chat.needKey2')}
          </div>
        )}
        {aiReady && !session && (
          <div className="text-[12.5px] leading-relaxed text-ink-soft">
            {t('chat.hint1')}<br />
            {(() => { const ex = notes.find(n => n.path.startsWith('wiki/') && !/\/(index|log)\.md$/.test(n.path) && !n.path.startsWith('wiki/lint/')); return ex ? <>{t('chat.hintExample', { title: ex.title })}<br /></> : <>{t('chat.hint2')}<br /></>; })()}
            {pending.length > 0 && <span className="text-amber">{t('chat.hintPending', { n: pending.length })}<br /></span>}
            {t('chat.hint3')}
          </div>
        )}
        {session?.messages.map((m, i) => <Message key={i} m={m} i={i} notes={notes} onOpen={onOpen} onFile={file} toolLabel={toolLabel} />)}
        {pendingJob !== null && <div className="mt-2 text-[12px] text-ink-faint" data-testid="chat-thinking">{t('chat.thinking')}</div>}
        <div ref={bottom} />
      </div>
      {discussed && onIngestFromChat && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-celadon-mist/60 px-3 py-2 text-[12.5px]" data-testid="chat-ingest-bar">
          <span className="min-w-0 flex-1 text-ink">{hasReply ? t('chat.ingestReady', { title: discussedTitle }) : t('chat.ingestHint', { title: discussedTitle })}</span>
          {hasReply && <button type="button" className={btnPrimary} onClick={ingestFromChat} disabled={ingesting || pendingJob !== null} data-testid="chat-ingest">{t('chat.ingestNow')}</button>}
        </div>
      )}
      <QuotaLine className="px-3 pt-2" refreshKey={pendingJob ? 1 : 0} />
        <form onSubmit={send} className="flex gap-2 border-t border-line p-2.5">
        <textarea ref={taRef} className={`${input} resize-none leading-relaxed`} rows={2} style={{ maxHeight: '45vh', overflowY: 'auto' }} placeholder={aiReady ? t('chat.ph') : t('chat.phNoKey')} value={text} disabled={!aiReady || pendingJob !== null}
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} data-testid="chat-input" />
        <button className={btnPrimary} disabled={!aiReady || pendingJob !== null || !text.trim()}>{t('chat.send')}</button>
      </form>
    </div>
  );
}

function Message({ m, i, notes, onOpen, onFile, toolLabel }: { m: ChatMessage; i: number; notes: NoteSummary[]; onOpen: (p: string) => void; onFile: (i: number) => void; toolLabel: (t: string) => string }) {
  const [showTools, setShowTools] = useState(false);
  const { t } = useT();
  if (m.role === 'user') return <div className="mb-3 ml-8 rounded-[10px] bg-celadon-mist px-3 py-2 whitespace-pre-wrap">{m.content}</div>;
  return (
    <div className="mb-3 mr-4 rounded-[10px] border border-line px-3 py-2" data-testid="chat-answer">
      <Markdown source={m.content} notes={notes} onOpen={onOpen} compact />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
        {m.tools && m.tools.length > 0 && <button className="hover:text-celadon-deep" onClick={() => setShowTools(v => !v)}>{showTools ? t('chat.collapse') : t('chat.steps', { n: m.tools.length })}</button>}
        {m.tokens_in !== undefined && <span>{t('chat.tokens', { tok: fmtTok((m.tokens_in ?? 0) + (m.tokens_out ?? 0)), usd: fmtUsd(m.cost_usd) })}</span>}
        <span className="ml-auto" />
        {m.filedTo ? <button className="text-celadon-deep hover:underline" onClick={() => onOpen(m.filedTo!)}>{t('chat.filedTo', { path: m.filedTo })}</button> : m.jobId && !m.failed && <button className={`${btnGhost} px-2 py-0.5 text-[11.5px]`} onClick={() => onFile(i)} title={t('chat.fileTitle')}>{t('chat.file')}</button>}
      </div>
      {showTools && <ol className="mt-1.5 font-mono text-[11px] text-ink-soft">{m.tools!.map((s, k) => <li key={k}>▸ {toolLabel(s.tool)} {s.path ?? (s.query ? t('agent.quote', { q: s.query }) : '')}</li>)}</ol>}
    </div>
  );
}
