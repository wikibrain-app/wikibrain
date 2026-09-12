/* ── Optional operator console ──
   The hosted deployment ships an operator console (service probes, business funnel, plans and renewals, capacity
   planning and its alert mail). It is not part of the open-source distribution: `src/ops-console.ts` and the modules it
   pulls in may simply be absent. Everything here degrades to "not installed" in that case, so `/api/admin/*` answers
   404, `/healthz` reports no extra reasons, and nothing else in the server notices.

   The specifier is held in a variable on purpose. A literal would make the compiler resolve the module, which fails in
   a tree that does not contain it; resolving at run time keeps both trees buildable from the same sources. */

export interface OpsCapacity {
  assess(): Promise<unknown>;
  setConfig(input: Record<string, unknown>): Promise<unknown>;
  resetCache(): void;
  schedule(): void;
}
export interface OpsConsole {
  isAdmin(email: string | undefined | null): boolean;
  status(): Promise<unknown>;
  setRegistry(items: unknown[]): Promise<void>;
  /** The rows behind one of the numbers on the status page. */
  drill(metric: string, params: Record<string, string>): Promise<unknown>;
  degraded(): Promise<string[]>;
  /** Paddle webhook observability: recent signature failures and the last delivery. */
  counters: { paddleSigFail: number[]; paddleLastWebhook: null | { at: string; type: string } };
  noteSigFail(): void;
  capacity: OpsCapacity;
}

const SPECIFIER = './ops-console.js';
let installed: OpsConsole | null = null;
try {
  installed = ((await import(SPECIFIER)) as { opsConsole: OpsConsole }).opsConsole ?? null;
} catch {
  installed = null; // open-source build: no operator console
}

/** The console, or null when this build does not include one. */
export const ops = (): OpsConsole | null => installed;
export const opsInstalled = (): boolean => installed !== null;
