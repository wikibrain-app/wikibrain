import { useEffect, useRef, useState } from 'react';
import { btnGhost, btnPrimary } from './ui';
import { useT } from '../i18n';

// Marp slides: pages with marp: true in front-matter are rendered with marp-core; CSS is scoped inside a shadow DOM so it cannot leak site-wide.
export function SlideView({ source, onBack }: { source: string; onBack: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [count, setCount] = useState(0);
  const { t } = useT();
  useEffect(() => {
    let alive = true;
    import('@marp-team/marp-core').then(({ Marp }) => {
      if (!alive || !host.current) return;
      const marp = new Marp({ html: false, math: 'katex' });
      const { html, css } = marp.render(source);
      const root = host.current.shadowRoot ?? host.current.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${css}
        :host { display: block; }
        .marpit { display: flex; flex-direction: column; gap: 16px; align-items: center; padding: 16px 0; }
        .marpit > svg { width: 100%; max-width: 960px; height: auto; box-shadow: 0 2px 12px rgba(34,49,58,.15); border-radius: 8px; background: white; }
      </style>${html}`;
      setCount(root.querySelectorAll('.marpit > svg').length);
      setState('ok');
    }).catch(e => { if (alive) { setState('error'); setMsg((e as Error).message); } });
    return () => { alive = false; };
  }, [source]);
  const fullscreen = () => host.current?.requestFullscreen?.().catch(() => {});
  return (
    <div className="flex h-full flex-col" data-testid="slide-view">
      <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-2 text-[12.5px]">
        <span className="text-ink-soft">{t('slides.title')}{count ? t('slides.count', { n: count }) : ''}</span>
        <span className="ml-auto flex gap-2">
          <button className={btnGhost} onClick={fullscreen} disabled={state !== 'ok'}>{t('slides.fullscreen')}</button>
          <button className={btnPrimary} onClick={onBack}>{t('slides.back')}</button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-porcelain">
        {state === 'error' && <div className="p-6 text-[13px] text-[#8A3B2E]">{t('slides.error', { err: msg })}</div>}
        <div ref={host} className="mx-auto max-w-[1000px] px-4" />
      </div>
    </div>
  );
}
