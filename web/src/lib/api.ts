// Thin wrapper over the backend JSON API; same origin (Vite proxy or Express static), cookies are sent automatically.
import { detectLang, translate } from '../i18n';

// Outside React: read the UI language from localStorage wb-lang (LangProvider writes it on every switch)
const currentLang = () => detectLang();
const tr = (key: string, params?: Record<string, string | number>) => translate(currentLang(), key, params);
const localeOf = () => currentLang() === 'en' ? 'en-US' : 'zh-TW';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: any = null) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', tr('common.networkFail'));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error ?? data?.code ?? String(res.status);
    const message = data?.message ?? (res.status === 401 ? tr('api.loginRequired') : tr('api.requestFailed', { status: res.status }));
    throw new ApiError(res.status, code, message, data);
  }
  return data as T;
}

export interface NoteSummary { path: string; title: string; version: number; updated_at: string }
export interface Note extends NoteSummary { content: string; author: string }
export interface Version { version: number; title: string; author: string; created_at: string; content_md: string }
export interface SearchHit { path: string; title: string; version: number; snippet: string }
export interface TokenInfo { id: number; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null; kind?: 'pat' | 'oauth'; expires_at?: string | null }
export interface Me { user: { id: string; email: string; name: string }; workspace: { id: string; name: string; lang: Lang }; mcpUrl: string; isAdmin?: boolean }
export interface ZoteroSyncResult { added: string[]; skipped: number; pdfs: number; version: number; errors: string[] }
export interface ZoteroLink { zotero_user_id: string; username: string | null; key_last4: string; collection_key: string | null; collection_name: string | null; library_version: number; with_pdf: boolean; last_sync_at: string | null; last_result: ZoteroSyncResult | null; last_error: string | null; updated_at: string }
export interface PlanStatus { plan: 'free' | 'pro'; trial_ends_at: string | null; trial_active: boolean; trial_days_left: number; trial_runs_used: number; trial_runs_free: number; month: string; runs_this_month: number; runs_limit: number | null; can_run: boolean; effective: 'free' | 'pro'; notes_used: number; notes_limit: number; bytes_used: number; bytes_limit: number; tokens_limit: number | null; retention_days: number }
export interface PriceInfo { id: string; amount: number; currency: string; interval: 'month' | 'year' }
export interface DiscountInfo { id: string; code: string; percent: number; usage_limit: number | null; times_used: number; remaining: number | null; expires_at: string | null }
export interface BillingInfo {
  subscription: { status: string; plan: string; current_period_end: string | null; provider: string; provider_subscription_id: string | null; provider_customer_id?: string | null; raw?: { scheduled_change?: { action?: string; effective_at?: string } | null } | null } | null;
  paddle: { environment: 'sandbox' | 'production'; client_token: string; prices: { month: PriceInfo; year: PriceInfo; discount: DiscountInfo | null }; email: string; workspace_id: string } | null;
  error: string | null;
}
export type ProbeState = 'ok' | 'slow' | 'fail' | 'not_configured';
export interface AdminStatus {
  probes: { name: string; state: ProbeState; ms?: number; detail?: string; at?: string }[];
  business: { users: number; verified: number; signups_today: number; signups_7d: number; workspaces: { free: number; trial: number; pro: number }; tokens_used: number; oauth_clients: number; jobs_month: number; jobs_failed_month: number; cost_month_usd: number; trial_runs_used: number; notes: number; shares: number };
  funnel: { totals: Record<string, number>; weekly: { week: string; signup: number; verified: number; mcp_connected: number; first_ai_write: number; upgrade: number; churn: number }[] };
  issues: { at: string; kind: string; detail: string }[];
  registry: { service: string; plan: string; price: string; renews_on?: string | null; billing?: string; limits?: string; account?: string; manage_url?: string; notes?: string; days_left: number | null }[];
  quotas: { service: string; used: string; limit?: string; state: ProbeState; detail?: string }[];
  capacity: Capacity | null;
  acquisition: {
    visitors_30d: number; views_30d: number; visitors_7d: number; views_7d: number;
    signups_30d: number; conversion: number;
    top_sources: { source: string; visitors: number }[];
    top_pages: { page: string; views: number }[];
  };
  generated_at: string;
}
export type CapacityLevel = 'ok' | 'warn' | 'critical';
export type CapacityKey = 'db' | 'backup' | 'email_month' | 'email_day' | 'runs_month' | 'mcp_month' | 'trial_spend' | 'ws_notes';
export interface CapacityConfig {
  db_volume_bytes: number; backup_bucket_bytes: number; backup_keep_days: number; resend_month: number; resend_day: number; runs_month: number; mcp_calls_month: number;
  trial_budget_usd: number; trial_run_cost_usd: number; ws_notes_soft: number; assume_runs_pro: number; warn: number; critical: number; email_alerts: boolean;
}
export interface CapacityResource { key: CapacityKey; unit: 'bytes' | 'count' | 'usd'; used: number; projected: number; committed: number | null; capacity: number; level: CapacityLevel; ratio: number; projected_ratio: number; detail?: string }
export interface Capacity {
  config: CapacityConfig;
  limits: { free_runs: number; trial_free_runs: number; free_bytes: number; pro_bytes: number; free_notes: number; pro_notes: number };
  tiers: { free: number; trial: number; pro: number; total: number; signups_30d: number };
  observed: { bytes_per_ws: number; notes_per_ws: number; runs_per_active_ws: number; emails_per_signup: number; largest_ws_notes: number };
  resources: CapacityResource[]; alerts: CapacityResource[]; generated_at: string;
}
export interface RuleUpdate {
  templateId: string; templateName: Record<Lang, string>; lang: Lang;
  appliedVersion: number; currentVersion: number;
  pages: { path: string; state: 'untouched' | 'merged' | 'edited' | 'missing'; current: string; next: string; merged: string | null }[];
}
export interface ShareInfo { token: string; url: string; created_at: string }
export interface SharedNote { path: string; title: string; content: string; updated_at: string; layer: 'raw' | 'wiki' | 'schema' }
export interface BibEntry { key: string; path: string; title: string; authors: string[]; year: number | null; venue: string | null; doi: string | null; url: string | null }
export interface ImportResult { path: string; title: string; version: number; warning?: string; ingestPrompt?: string; meta: { source_type: string; doi?: string; authors?: string[]; year?: number; venue?: string; citation_key?: string }; imported?: { path: string; title: string }[]; skipped?: string[] }
export interface AiConfig { provider: string; model: string; key_last4: string; updated_at: string }
export interface ModelInfo { id: string; name: string; context?: number; pricing?: { input: number; output: number } }
export interface AiProvider { id: string; label: string; defaultModel: string; keyHint: string }
export interface IngestEvent { type: 'text' | 'tool' | 'result' | 'usage' | 'error'; text?: string; tool?: string; input?: unknown; output?: string; tokens_in?: number; tokens_out?: number }
export interface IngestJob { id: number; paths: string[]; provider: string; model: string; status: 'queued' | 'running' | 'done' | 'failed'; log: IngestEvent[]; tokens_in: number; tokens_out: number; steps: number; error: string | null; created_at: string; started_at: string | null; finished_at: string | null; price_in: number | null; price_out: number | null; cost_usd: number | null }
export interface KbStats { generated_at: string; totals: { notes: number; links: number; pending: number; versions: number; raw: number; wiki: number; schema: number }; layers: { layer: string; count: number }[]; sourceTypes: { type: string; count: number }[]; notesPerDay: { day: string; count: number }[]; activity: { day: string; count: number; by: Record<string, number> }[]; topInbound: { path: string; title: string; inbound: number }[]; agentPerDay: { day: string; jobs: number; tokens: number; cost: number | null }[]; agentMonth: { jobs: number; tokens: number; cost: number | null } }
export interface LintReport { generated_at: string; counts: { wiki_pages: number; links: number }; orphans: { path: string; title: string }[]; dangling: { from: string; target: string }[]; not_in_index: { path: string; title: string }[]; pending_sources: { path: string; title: string }[]; log_issues: string[]; missing_special: string[] }
export interface ChatMessage { role: 'user' | 'assistant'; content: string; at: string; failed?: boolean; jobId?: number; steps?: number; tokens_in?: number; tokens_out?: number; cost_usd?: number | null; tools?: { tool: string; path?: string; query?: string }[]; filedTo?: string }
export interface ChatSession { id: number; title: string; messages: ChatMessage[]; created_at: string; updated_at: string }
export interface IngestStatsRow { jobs: number; tokens_in: number; tokens_out: number; cost_usd: number | null; unpriced: number }
export interface IngestStats { month: string; thisMonth: IngestStatsRow; allTime: IngestStatsRow; byModel: (IngestStatsRow & { provider: string; model: string })[] }
export const fmtUsd = (v: number | null | undefined) => v === null || v === undefined ? '—' : v < 0.01 ? `＄${v.toFixed(4)}` : `＄${v.toFixed(2)}`;
export const fmtTok = (n: number) => n.toLocaleString(localeOf());
export type Lang = 'zh-TW' | 'en';
export interface Template { id: string; name: Record<Lang, string>; description: Record<Lang, string>; prompt: Record<Lang, string> }
export interface CustomTemplate { id: number; name: string; description: string; prompt: string; base_id: string | null; files?: { path: string; content: string }[]; created_at: string; updated_at: string }
export type PropValue = string | number | boolean | string[] | null;
export interface NoteProps { path: string; title: string; version: number; created_at: string; updated_at: string; author: string; inbound: number; props: Record<string, PropValue> }
export interface Graph { nodes: { path: string; title: string; layer: 'raw' | 'wiki' | 'schema'; created_at?: string }[]; edges: { from: string; to: string }[] }

export const api = {
  config: () => request<{ googleEnabled: boolean; mcpUrl: string; version: string; commit: string }>('GET', '/api/config'),
  me: () => request<Me>('GET', '/api/me'),
  signIn: (email: string, password: string) => request('POST', '/api/auth/sign-in/email', { email, password }),
  signUp: (email: string, password: string, name: string) =>
    request('POST', '/api/auth/sign-up/email', { email, password, name, callbackURL: '/' }),
  signOut: () => request('POST', '/api/auth/sign-out', {}),
  requestPasswordReset: (email: string) =>
    request('POST', '/api/auth/request-password-reset', { email, redirectTo: `${window.location.origin}/reset-password` }),
  resetPassword: (token: string, newPassword: string) => request('POST', '/api/auth/reset-password', { token, newPassword }),
  usage: () => request<{ month: string; mcp_calls: number; note_count: number; storage_bytes: number }>('GET', '/api/usage'),
  exportUrl: '/api/export',
  exportBibtexUrl: '/api/export/bibtex',
  exportCslUrl: '/api/export/csl',
  importUrl: (url: string, folder?: string) => request<ImportResult>('POST', '/api/import', { kind: 'url', url, folder }),
  importText: (text: string, title?: string, folder?: string) => request<ImportResult>('POST', '/api/import', { kind: 'text', text, title, folder }),
  uploadAsset: async (file: File): Promise<{ id: string; url: string; filename: string; mime: string; size: number }> => {
    const fd = new FormData(); fd.append('file', file);
    let res: Response;
    try { res = await fetch('/api/assets', { method: 'POST', body: fd, credentials: 'same-origin' }); }
    catch { throw new ApiError(0, 'NETWORK', tr('common.networkFail')); }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? String(res.status), data?.message ?? tr('api.uploadFailed', { status: res.status }), data);
    return data;
  },
  importFile: async (file: File, folder?: string): Promise<ImportResult> => {
    const fd = new FormData();
    fd.append('file', file);
    if (folder) fd.append('folder', folder);
    let res: Response;
    try { res = await fetch('/api/import/file', { method: 'POST', body: fd, credentials: 'same-origin' }); }
    catch { throw new ApiError(0, 'NETWORK', tr('common.networkFail')); }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? String(res.status), data?.message ?? tr('api.uploadFailed', { status: res.status }), data);
    return data as ImportResult;
  },
  ai: () => request<{ config: AiConfig | null; providers: AiProvider[] }>('GET', '/api/ai'),
  setAi: (provider: string, model: string, apiKey?: string) => request<{ config: AiConfig }>('PUT', '/api/ai', { provider, model, apiKey }),
  deleteAi: () => request('DELETE', '/api/ai'),
  aiModels: (provider: string, apiKey?: string) => request<{ models: ModelInfo[] }>('POST', '/api/ai/models', { provider, apiKey }),
  startIngest: (paths?: string[], guidance?: string) => request<{ job: IngestJob }>('POST', '/api/ingest', { paths, guidance }),
  ingestJob: (id: number) => request<{ job: IngestJob }>('GET', `/api/ingest/${id}`),
  ingestJobs: () => request<{ jobs: IngestJob[] }>('GET', '/api/ingest'),
  ingestStats: () => request<IngestStats>('GET', '/api/ingest/stats'),
  stats: () => request<KbStats>('GET', '/api/stats'),
  lint: () => request<{ report: LintReport; summary: string; prompt: string }>('GET', '/api/lint'),
  lintRun: () => request<{ job: IngestJob }>('POST', '/api/lint/run', {}),
  chatSessions: () => request<{ sessions: Omit<ChatSession, 'messages'>[] }>('GET', '/api/chat'),
  chatCreate: () => request<{ session: ChatSession }>('POST', '/api/chat', {}),
  chatSession: (id: number) => request<{ session: ChatSession }>('GET', `/api/chat/${id}`),
  chatSend: (id: number, text: string) => request<{ session: ChatSession; job: IngestJob }>('POST', `/api/chat/${id}/messages`, { text }),
  chatFile: (id: number, index: number, title?: string) => request<NoteSummary>('POST', `/api/chat/${id}/file`, { index, title }),
  oauthRequest: (req: string) => request<{ request: { id: string; client_name: string | null; client_uri: string | null; redirect_uri: string; scopes: string[] } }>('GET', `/api/oauth/request?req=${encodeURIComponent(req)}`),
  oauthApprove: (req: string) => request<{ redirect: string }>('POST', '/api/oauth/approve', { req }),
  oauthDeny: (req: string) => request<{ redirect: string }>('POST', '/api/oauth/deny', { req }),
  zotero: () => request<{ link: ZoteroLink | null }>('GET', '/api/zotero'),
  zoteroCollections: (apiKey?: string) => request<{ user: { userID: string; username: string | null }; collections: { key: string; name: string; parent: string | null; count: number }[] }>('POST', '/api/zotero/collections', { apiKey }),
  zoteroSave: (b: { apiKey?: string; collectionKey?: string | null; collectionName?: string | null; withPdf?: boolean }) => request<{ link: ZoteroLink }>('PUT', '/api/zotero', b),
  zoteroDelete: () => request<{ deleted: boolean }>('DELETE', '/api/zotero'),
  zoteroSync: () => request<{ result: ZoteroSyncResult; link: ZoteroLink }>('POST', '/api/zotero/sync'),
  plan: () => request<PlanStatus>('GET', '/api/plan'),
  billing: () => request<BillingInfo>('GET', '/api/billing'),
  adminStatus: () => request<AdminStatus>('GET', '/api/admin/status'),
  adminRegistry: (items: AdminStatus['registry']) => request<{ ok: true }>('PUT', '/api/admin/registry', { items }),
  adminCapacity: (cfg: Partial<CapacityConfig>) => request<{ ok: true; config: CapacityConfig; capacity: Capacity }>('PUT', '/api/admin/capacity', cfg),
  share: (path: string) => request<{ share: ShareInfo | null }>('GET', `/api/share?path=${encodeURIComponent(path)}`),
  createShare: (path: string) => request<{ share: ShareInfo }>('POST', '/api/share', { path }),
  revokeShare: (path: string) => request<{ revoked: boolean }>('DELETE', `/api/share?path=${encodeURIComponent(path)}`),
  publicShare: (token: string) => request<SharedNote>('GET', `/api/public/share/${encodeURIComponent(token)}`),
  billingPortal: () => request<{ overview: string; cancel?: string; update_payment_method?: string }>('POST', '/api/billing/portal'),
  deleteAccount: (password: string) => request<unknown>('POST', '/api/auth/delete-user', { password }),
  setLang: (lang: Lang) => request<{ lang: Lang }>('PUT', '/api/me/lang', { lang }),
  templates: () => request<{ templates: Template[]; langs: Lang[]; custom: CustomTemplate[]; ruleUpdates: RuleUpdate[] }>('GET', '/api/templates'),
  updateRules: (id: string, mode: 'safe' | 'overwrite' = 'safe') => request<{ updated: string[]; merged: string[]; overwritten: string[]; kept: string[] }>('POST', '/api/templates/update-rules', { id, mode }),
  customTemplate: (id: number) => request<{ template: CustomTemplate }>('GET', `/api/templates/custom/${id}`),
  duplicateTemplate: (from: string, lang: Lang) => request<{ template: CustomTemplate }>('POST', '/api/templates/custom', { from, lang }),
  snapshotTemplate: (name: string) => request<{ template: CustomTemplate }>('POST', '/api/templates/custom', { fromSchema: true, name }),
  updateTemplate: (id: number, t: Partial<Pick<CustomTemplate, 'name' | 'description' | 'prompt' | 'files'>>) => request<{ template: CustomTemplate }>('PUT', `/api/templates/custom/${id}`, t),
  deleteTemplate: (id: number) => request('DELETE', `/api/templates/custom/${id}`),
  templateFiles: (id: string, lang: Lang) => request<{ files: { path: string; content: string }[] }>('GET', `/api/templates/${id}/files?lang=${lang}`),
  applyTemplate: (id: string, lang: Lang) => request<{ id: string; lang: Lang; created: string[]; skipped: string[]; prompt: string }>('POST', '/api/templates/apply', { id, lang }),
  tree: () => request<{ notes: NoteSummary[]; pendingSources: string[]; ingestPrompt: string | null; bib?: BibEntry[] }>('GET', '/api/notes/tree'),
  note: (path: string) => request<Note>('GET', `/api/notes?path=${encodeURIComponent(path)}`),
  create: (path: string, content: string) => request<NoteSummary>('POST', '/api/notes', { path, content }),
  update: (path: string, content: string, if_version: number) =>
    request<NoteSummary>('PUT', '/api/notes', { path, content, if_version }),
  remove: (path: string) => request('DELETE', `/api/notes?path=${encodeURIComponent(path)}`),
  archive: (path: string, undo = false) => request<{ path: string }>('POST', '/api/notes/archive', { path, undo }),
  search: (q: string) => request<{ hits: SearchHit[] }>('GET', `/api/search?q=${encodeURIComponent(q)}`),
  backlinks: (path: string) => request<{ backlinks: NoteSummary[] }>('GET', `/api/notes/backlinks?path=${encodeURIComponent(path)}`),
  versions: (path: string) => request<{ versions: Version[] }>('GET', `/api/notes/versions?path=${encodeURIComponent(path)}`),
  rollback: (path: string, version: number, if_version: number) =>
    request<NoteSummary>('POST', '/api/notes/rollback', { path, version, if_version }),
  graph: () => request<Graph>('GET', '/api/graph'),
  noteProps: (folder?: string) => request<{ rows: NoteProps[]; keys: { key: string; count: number }[] }>('GET', `/api/notes/props${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`),
  tokens: () => request<{ tokens: TokenInfo[] }>('GET', '/api/tokens'),
  createToken: (label: string) => request<TokenInfo & { token: string; mcpJson: unknown }>('POST', '/api/tokens', { label }),
  revokeToken: (id: number) => request('DELETE', `/api/tokens/${id}`),
};

export const layerOf = (path: string) => path.split('/')[0] as 'raw' | 'wiki' | 'schema';
// Getters keep the LAYER_LABEL[l] usage in components unchanged while following the UI language
export const LAYER_LABEL: Record<string, string> = { get raw() { return tr('layer.raw'); }, get wiki() { return tr('layer.wiki'); }, get schema() { return tr('layer.schema'); } };

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit', hour12: false });
  if (sameDay) return tr('time.today', { hm });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return tr('time.yesterday', { hm });
  return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}/${d.getDate()} ${hm}` : d.toLocaleDateString(localeOf());
}

export function formatAuthor(author: string): string {
  if (author.startsWith('mcp:')) return tr('author.agent', { name: author.slice(4) });
  if (author.startsWith('web:')) return author.slice(4);
  if (author.startsWith('system:template:')) return tr('author.template', { id: author.slice(16) });
  if (author.startsWith('agent:')) return tr('author.auto', { name: author.slice(6) });
  return author || tr('author.system');
}
