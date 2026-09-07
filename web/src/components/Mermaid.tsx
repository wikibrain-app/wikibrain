import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useResolvedTheme } from '../theme';

// Mermaid diagrams: loaded dynamically (the package is large, so only when a page actually has a ```mermaid block); falls back to the raw source on failure.
let mermaidMod: Promise<typeof import('mermaid')> | null = null;
const load = () => (mermaidMod ??= import('mermaid').then(m => {
  configure(m);
  return m;
}));
// Mermaid bakes colours into the SVG, so (re)initialize from the current CSS palette before each render (light/dark aware)
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function configure(m: typeof import('mermaid')) {
  const dark = cssVar('--porcelain').toLowerCase() !== '#f4f7f5';
  m.default.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'strict', darkMode: dark, fontFamily: '"PingFang TC","Noto Sans TC",system-ui,sans-serif',
    themeVariables: { background: cssVar('--paper'), primaryColor: cssVar('--celadon-mist'), primaryTextColor: cssVar('--ink'), primaryBorderColor: cssVar('--celadon'), lineColor: cssVar('--ink-soft'),
      secondaryColor: cssVar('--amber-mist'), tertiaryColor: cssVar('--porcelain'), textColor: cssVar('--ink'), noteBkgColor: cssVar('--amber-mist'), noteTextColor: cssVar('--ink'), fontSize: '14px' } });
}

export function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const { t } = useT();
  const theme = useResolvedTheme();
  useEffect(() => {
    let alive = true;
    load().then(async m => {
      try {
        configure(m);
        const { svg } = await m.default.render(`mm${id}`, code);
        if (alive && ref.current) { ref.current.innerHTML = svg; setErr(null); }
      } catch (e) { if (alive) setErr((e as Error).message.split('\n')[0]); }
    }).catch(e => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [code, id, theme]);
  if (err) return <pre className="!bg-amber-mist !text-ink text-[12px]" data-testid="mermaid-error">{`${t('mermaid.error', { err })}\n\n${code}`}</pre>;
  return <div ref={ref} className="my-4 overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full" data-testid="mermaid" />;
}
