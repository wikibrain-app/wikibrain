import { formatAuthor, formatTime, type NoteSummary, type Version } from '../lib/api';
import { useT } from '../i18n';

interface Props {
  backlinks: NoteSummary[];
  versions: Version[];
  current: number;
  viewing: number | null;
  onOpen: (p: string) => void;
  onView: (v: Version) => void;
  onRollback: (v: number) => void;
  readonly: boolean;
}

export function Rail({ backlinks, versions, current, viewing, onOpen, onView, onRollback, readonly }: Props) {
  const { t } = useT();
  return (
    <aside className="h-full overflow-y-auto bg-paper px-[18px] py-[22px]" aria-label={t('rail.label')}>
      <section className="mb-6">
        <h3 className="mb-2.5 text-[13px] font-semibold">{t('rail.backlinks')}</h3>
        {backlinks.length === 0
          ? <p className="text-[12px] leading-relaxed text-ink-faint">{t('rail.noBacklinks')}</p>
          : backlinks.map(b => (
            <button key={b.path} className="mb-2 block w-full rounded-lg border border-line px-2.5 py-2 text-left text-[12.5px] leading-[1.55] hover:border-celadon" onClick={() => onOpen(b.path)}>
              <b className="break-words">{b.title}</b><span className="mt-0.5 block break-all font-mono text-[11px] text-ink-soft">{b.path}</span>
            </button>
          ))}
      </section>
      <section>
        <h3 className="mb-2.5 text-[13px] font-semibold">{t('rail.versions')}</h3>
        {versions.map(v => (
          <div key={v.version} className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-dashed border-line py-[7px] text-[12px] text-ink-soft last:border-none ${viewing === v.version ? 'bg-[#FBF5EA] -mx-2 px-2 rounded' : ''}`} data-testid={`version-${v.version}`}>
            <span className="font-mono text-ink">v{v.version}</span>
            <span className="whitespace-nowrap text-celadon-deep">{formatAuthor(v.author)}</span>
            <span className="ml-auto whitespace-nowrap text-[11px] text-ink-faint">{formatTime(v.created_at)}</span>
            {v.version !== current && (
              <span className="flex w-full gap-2">
                <button className="text-[11px] text-celadon-deep hover:underline" onClick={() => onView(v)}>{t('rail.view')}</button>
                {!readonly && <button className="text-[11px] text-celadon-deep hover:underline" onClick={() => onRollback(v.version)}>{t('version.rollback')}</button>}
              </span>
            )}
            {v.version === current && <span className="w-full text-[11px] text-ink-faint">{t('rail.current')}</span>}
          </div>
        ))}
      </section>
    </aside>
  );
}
