import type { IngestEvent } from './api';

/* The agent log is a flat stream: a `tool` event for the call, then a `result` event carrying whatever came back.
   A refusal comes back as a JSON error object, so a call that failed and one that worked look identical until the
   two are read as a pair — which is why the progress panel used to report a page as "updated" when the update was
   rejected. */
export interface AgentStep { type: 'tool' | 'text' | 'error'; tool?: string; path?: string; query?: string; text?: string; failed?: boolean; error?: string }

export function agentSteps(log: IngestEvent[]): AgentStep[] {
  const steps: AgentStep[] = [];
  for (const e of log) {
    if (e.type === 'tool') {
      const input = e.input as { path?: unknown; query?: unknown } | undefined;
      steps.push({
        type: 'tool', tool: e.tool,
        path: typeof input?.path === 'string' ? input.path : undefined,
        query: typeof input?.query === 'string' ? input.query : undefined,
      });
      continue;
    }
    if (e.type === 'text' || e.type === 'error') { steps.push({ type: e.type, text: e.text }); continue; }
    if (e.type !== 'result') continue;
    const last = steps[steps.length - 1];
    if (!last || last.type !== 'tool' || last.failed) continue;
    try {
      const out = JSON.parse(e.output ?? '');
      if (out && typeof out === 'object' && typeof out.error === 'string') { last.failed = true; last.error = String(out.message ?? out.error); }
    } catch { /* not JSON, or cut off at 400 chars: it looked like a success, so leave it as one */ }
  }
  return steps;
}
