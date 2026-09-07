import { useEffect, useState } from 'react';

/* ── Appearance (light / dark / system) ──
   Per device, stored in localStorage `wb-theme`. "system" stamps nothing on <html> and lets prefers-color-scheme decide;
   an explicit choice stamps data-theme so it wins in both directions (see web/src/styles.css). index.html applies the
   stored value inline before the first paint to avoid a flash. */
export type Theme = 'light' | 'dark' | 'system';
export const THEMES: Theme[] = ['system', 'light', 'dark'];
const KEY = 'wb-theme';
const EVENT = 'wb-theme';

export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v; } catch { /* ignore */ }
  return 'system';
}
export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme);
  window.dispatchEvent(new Event(EVENT));
}
export function setTheme(theme: Theme) {
  try { if (theme === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  applyTheme(theme);
}
/** The theme actually in effect ('light' | 'dark'), following the OS when the setting is "system". */
export function resolvedTheme(): 'light' | 'dark' {
  const t = getTheme();
  if (t !== 'system') return t;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function useResolvedTheme(): 'light' | 'dark' {
  const [t, setT] = useState<'light' | 'dark'>(() => resolvedTheme());
  useEffect(() => {
    const update = () => setT(resolvedTheme());
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update); window.addEventListener(EVENT, update);
    return () => { mq.removeEventListener('change', update); window.removeEventListener(EVENT, update); };
  }, []);
  return t;
}
