import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../i18n';

// Mermaid diagrams: loaded dynamically (the package is large, so only when a page actually has a ```mermaid block); falls back to the raw source on failure.
let mermaidMod: Promise<typeof import('mermaid')> | null = null;
const load = () => (mermaidMod ??= import('mermaid').then(m => {
  m.default.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'strict', fontFamily: '"PingFang TC","Noto Sans TC",system-ui,sans-serif',
    themeVariables: { primaryColor: '#E3EEE9', primaryTextColor: '#22313A', primaryBorderColor: '#3E7D6B', lineColor: '#5A6B70', secondaryColor: '#FBF5EA', tertiaryColor: '#F4F7F5', fontSize: '14px' } });
  return m;
}));

export function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const { t } = useT();
  useEffect(() => {
    let alive = true;
    load().then(async m => {
      try {
        const { svg } = await m.default.render(`mm${id}`, code);
        if (alive && ref.current) { ref.current.innerHTML = svg; setErr(null); }
      } catch (e) { if (alive) setErr((e as Error).message.split('\n')[0]); }
    }).catch(e => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [code, id]);
  if (err) return <pre className="!bg-[#FBF5EA] !text-ink text-[12px]" data-testid="mermaid-error">{`${t('mermaid.error', { err })}\n\n${code}`}</pre>;
  return <div ref={ref} className="my-4 overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full" data-testid="mermaid" />;
}
