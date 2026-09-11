import { useEffect, useState } from 'react';
import { api, type RuleUpdate } from '../lib/api';
import { btnGhost, btnPrimary } from './ui';
import { useToast } from '../lib/toast';
import { useConfirm } from '../lib/confirm';
import { useT } from '../i18n';
import { diffLines, withContext } from '../lib/diff';

/* Shows up only when better rule pages have shipped since this workspace was set up.
   Pages the user never touched can be taken with one click. Pages they edited are theirs: we show what changed and
   leave the decision to them. */
const c = {
  'zh-TW': {
    title: '規則有新版',
    lede: (name: string, from: number, to: number) => `「${name}」模版的編纂規則更新了（v${from} → v${to}）。規則決定 agent 怎麼寫你的 wiki，更新之後下一次編纂就會照新版做事。`,
    untouched: '你沒有改過，直接換成新版',
    merged: '你改的是不同段落，兩邊都會保留',
    edited: '你和新版改到同一段，需要你決定',
    missing: '你的知識庫裡沒有這一頁，會補上',
    take: '更新規則',
    diff: '看差異',
    done: (n: number, kept: number) => kept ? `更新了 ${n} 頁，還有 ${kept} 頁要你決定` : `更新了 ${n} 頁`,
    keptNote: '這幾頁你和新版改到同一個段落，自動合併會猜錯，所以留給你決定。',
    force: '用新版覆蓋這幾頁',
    forceNote: '覆蓋之後你原本的內容會留在該頁的版本歷史裡，隨時可以看差異並一鍵復原。',
    forceConfirm: '要用新版覆蓋你改過的規則頁嗎？',
    forceConfirmBody: '你目前的內容會存成一個舊版本，可以在版本歷史裡復原。',
    forceDone: (n: number) => `覆蓋了 ${n} 頁，舊內容在版本歷史裡`,
  },
  en: {
    title: 'Newer rules are available',
    lede: (name: string, from: number, to: number) => `The "${name}" template's rules have changed (v${from} → v${to}). Rules decide how the agent writes your wiki, so the next ingest will follow the new ones.`,
    untouched: 'You never edited this one; it will be replaced',
    merged: 'You edited a different section, so both sides are kept',
    edited: 'You and the new version changed the same section',
    missing: 'This page is missing from your workspace and will be added',
    take: 'Update the rules',
    diff: 'See what changed',
    done: (n: number, kept: number) => kept ? `Updated ${n} page(s); ${kept} need your decision` : `Updated ${n} page(s)`,
    keptNote: 'Here you and the new version changed the same section, so merging would have to guess. Your call.',
    force: 'Replace these with the new version',
    forceNote: 'Your current text is kept in the page history, where you can compare it and restore it in one click.',
    forceConfirm: 'Replace the rule pages you edited?',
    forceConfirmBody: 'Your current text is saved as an earlier version and can be restored from the page history.',
    forceDone: (n: number) => `Replaced ${n} page(s); the old text is in the page history`,
  },
};

export function RuleUpdates({ onChanged }: { onChanged?: () => void }) {
  const { lang } = useT();
  const l = c[lang];
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [updates, setUpdates] = useState<RuleUpdate[]>([]);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<{ path: string; current: string; next: string } | null>(null);

  const load = () => api.templates().then(r => setUpdates(r.ruleUpdates ?? [])).catch(() => setUpdates([]));
  useEffect(() => { void load(); }, []);
  if (updates.length === 0) return null;

  const take = async (id: string, mode: 'safe' | 'overwrite' = 'safe') => {
    if (mode === 'overwrite' && !(await confirmDialog({ title: l.forceConfirm, body: l.forceConfirmBody, danger: true }))) return;
    setBusy(true);
    try {
      const r = await api.updateRules(id, mode);
      toast(mode === 'overwrite' ? l.forceDone(r.overwritten.length) : l.done(r.updated.length + r.merged.length, r.kept.length));
      await load();
      onChanged?.();
    } catch (e) { toast((e as Error).message, { kind: 'error' }); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-[10px] border border-line bg-amber-mist/50 p-4" data-testid="rule-updates">
      {updates.map(u => (
        <div key={u.templateId} className="not-first:mt-4">
          <h3 className="text-[14px] font-semibold">{l.title}</h3>
          <p className="mt-1 max-w-[70ch] text-[13px] text-ink-soft">{l.lede(u.templateName[lang], u.appliedVersion, u.currentVersion)}</p>
          <ul className="mt-2 space-y-1 text-[13px]">
            {u.pages.map(p => (
              <li key={p.path} className="flex flex-wrap items-baseline gap-2">
                <code className="font-mono text-[12px]">{p.path}</code>
                <span className={p.state === 'edited' ? 'text-amber' : 'text-ink-faint'}>
                  {p.state === 'edited' ? l.edited : p.state === 'merged' ? l.merged : p.state === 'missing' ? l.missing : l.untouched}
                </span>
                <button className="text-[12px] text-celadon-deep hover:underline"
                  onClick={() => setDiff({ path: p.path, current: p.current, next: p.next })}>{l.diff}</button>
              </li>
            ))}
          </ul>
          {u.pages.some(p => p.state === 'edited') && (
            <p className="mt-2 max-w-[70ch] text-[12px] text-ink-faint">{l.keptNote} {l.forceNote}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={busy || !u.pages.some(p => p.state !== 'edited')} onClick={() => take(u.templateId)}>{l.take}</button>
            {u.pages.some(p => p.state === 'edited') && (
              <button className={btnGhost} disabled={busy} onClick={() => take(u.templateId, 'overwrite')} data-testid="rule-overwrite">{l.force}</button>
            )}
          </div>
        </div>
      ))}
      {diff && (
        <div className="mt-3">
          <div className="mb-1 flex items-baseline gap-2 text-[12px]">
            <code className="font-mono">{diff.path}</code>
            <span className="text-ink-faint">{lang === 'zh-TW' ? '綠色是新版加的，紅色是舊版移除的' : 'green is added by the new version, red is removed'}</span>
            <button className={`${btnGhost} ml-auto`} onClick={() => setDiff(null)}>{lang === 'zh-TW' ? '收起' : 'Close'}</button>
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-[10px] border border-line bg-porcelain font-mono text-[12px] leading-[1.6]">
            {withContext(diffLines(diff.current, diff.next)).map((r, i) => r.kind === 'skip'
              ? <div key={i} className="border-y border-dashed border-line px-3 py-1 text-[11px] text-ink-faint">…</div>
              : <div key={i} className={`whitespace-pre-wrap break-words px-3 ${r.kind === 'add' ? 'bg-celadon-mist text-celadon-deep' : r.kind === 'del' ? 'bg-danger-mist text-danger line-through' : ''}`}>{r.text || ' '}</div>)}
          </div>
        </div>
      )}
    </section>
  );
}
