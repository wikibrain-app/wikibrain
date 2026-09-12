import { Component, type ReactNode } from 'react';

/* A rendering error inside one view should not blank the whole application. React unmounts the nearest boundary's
   subtree on an uncaught render error; without one, that subtree is everything. Text is bilingual inline because a
   class component cannot use the i18n hook, and this must render even when the rest of the app is broken. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('Render error:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-6 max-w-[60ch] rounded-[10px] border border-line bg-paper p-5 text-[13px]" role="alert">
        <p className="font-semibold">這一頁出了問題。 / Something went wrong on this page.</p>
        <p className="mt-1 text-ink-soft">你的資料沒有受影響；重新整理通常就好。 / Your data is unaffected; reloading usually fixes it.</p>
        <p className="mt-2 font-mono text-[11px] text-ink-faint">{String(this.state.error.message).slice(0, 200)}</p>
        <button className="mt-3 rounded-[8px] border border-line px-3 py-1.5" onClick={() => window.location.href = '/'}>回首頁 / Home</button>
      </div>
    );
  }
}
