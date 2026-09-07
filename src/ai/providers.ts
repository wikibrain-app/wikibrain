import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';

/* ── Unified "tool-call loop" interface: one implementation for the Anthropic Messages API, one for OpenAI-compatible APIs (OpenAI, OpenRouter) ── */

export type Provider = 'anthropic' | 'openai' | 'openrouter';
export const PROVIDERS: Record<Provider, { label: string; defaultModel: string; baseUrl?: string; keyHint: string }> = {
  anthropic: { label: 'Claude API（Anthropic）', defaultModel: 'claude-sonnet-5', keyHint: 'sk-ant-…' },
  openai: { label: 'OpenAI', defaultModel: 'gpt-5', baseUrl: 'https://api.openai.com/v1', keyHint: 'sk-…' },
  openrouter: { label: 'OpenRouter', defaultModel: 'anthropic/claude-sonnet-5', baseUrl: 'https://openrouter.ai/api/v1', keyHint: 'sk-or-…' },
};

export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }
export interface AgentEvent { type: 'text' | 'tool' | 'result' | 'usage' | 'error'; text?: string; tool?: string; input?: unknown; output?: string; tokens_in?: number; tokens_out?: number }
export interface RunOptions {
  provider: Provider; model: string; apiKey: string;
  system: string; user: string; tools: ToolDef[];
  history?: { role: 'user' | 'assistant'; content: string }[];  // Chat: prior turns
  exec: (name: string, input: Record<string, unknown>) => Promise<string>;
  maxSteps: number;
  onEvent: (e: AgentEvent) => void;
  signal?: AbortSignal;
}
export interface RunResult { steps: number; tokens_in: number; tokens_out: number; finalText: string }

// Back off and retry transient errors (429, 5xx, timeouts, connection); never retry model or key errors.
export async function withRetry<T>(fn: () => Promise<T>, onRetry: (msg: string, attempt: number) => void, delays = [2000, 5000, 12000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      const err = e as any;
      const status: number | undefined = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : undefined;
      const transient = status === 429 || (status !== undefined && status >= 500) || err?.name === 'TimeoutError' || err?.name === 'AbortError' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || /^fetch failed$|socket hang up/i.test(String(err?.message));
      if (!transient || attempt >= delays.length) throw e;
      onRetry(String(err?.message ?? err).slice(0, 200), attempt + 1);
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
}

export type Runner = (o: RunOptions) => Promise<RunResult>;
const runners: Partial<Record<Provider | 'mock', Runner>> = {};
export function registerRunner(p: Provider | 'mock', r: Runner | undefined) { if (r) runners[p] = r; else delete runners[p]; }

export async function runAgent(o: RunOptions): Promise<RunResult> {
  const r = runners[o.provider] ?? (o.provider === 'anthropic' ? runAnthropic : runOpenAICompatible);
  return r(o);
}

/* ── Anthropic ── */
async function runAnthropic(o: RunOptions): Promise<RunResult> {
  const client = new Anthropic({ apiKey: o.apiKey, maxRetries: 0, timeout: 120_000 }); // retries are handled by withRetry; avoid stacking them
  const messages: Anthropic.MessageParam[] = [...(o.history ?? []).map(h => ({ role: h.role, content: h.content })), { role: 'user', content: o.user }];
  const tools: Anthropic.Tool[] = o.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Tool['input_schema'] }));
  let steps = 0, tin = 0, tout = 0, finalText = '';
  for (;;) {
    if (o.signal?.aborted) throw new Error('已取消');
    const res = await withRetry(() => client.messages.create({ model: o.model, max_tokens: 8192, system: o.system, messages, tools }), (msg, n) => o.onEvent({ type: 'text', text: `（暫時性錯誤，第 ${n} 次重試：${msg}）` }));
    tin += res.usage.input_tokens; tout += res.usage.output_tokens;
    o.onEvent({ type: 'usage', tokens_in: res.usage.input_tokens, tokens_out: res.usage.output_tokens });
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    for (const b of res.content) if (b.type === 'text' && b.text.trim()) { finalText = b.text; o.onEvent({ type: 'text', text: b.text }); }
    if (res.stop_reason !== 'tool_use' || !toolUses.length) break;
    messages.push({ role: 'assistant', content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      steps++;
      if (steps > o.maxSteps) throw new Error(`超過工具呼叫上限（${o.maxSteps}）`);
      o.onEvent({ type: 'tool', tool: tu.name, input: tu.input });
      const out = await o.exec(tu.name, tu.input as Record<string, unknown>).catch(e => `錯誤：${(e as Error).message}`);
      o.onEvent({ type: 'result', tool: tu.name, output: out.slice(0, 400) });
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }
  return { steps, tokens_in: tin, tokens_out: tout, finalText };
}

/* ── OpenAI-compatible (OpenAI, OpenRouter) ── */
async function runOpenAICompatible(o: RunOptions): Promise<RunResult> {
  const base = PROVIDERS[o.provider].baseUrl!;
  const tools = o.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const messages: any[] = [{ role: 'system', content: o.system }, ...(o.history ?? []), { role: 'user', content: o.user }];
  let steps = 0, tin = 0, tout = 0, finalText = '';
  for (;;) {
    if (o.signal?.aborted) throw new Error('已取消');
    const data = await withRetry(async () => {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${o.apiKey}`, 'content-type': 'application/json', ...(o.provider === 'openrouter' ? { 'HTTP-Referer': 'https://wikibrain.example', 'X-Title': 'WikiBrain' } : {}) },
        body: JSON.stringify({ model: o.model, messages, tools, tool_choice: 'auto' }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) { const err: any = new Error(`${o.provider} API ${res.status}：${(await res.text()).slice(0, 300)}`); err.status = res.status; throw err; }
      const d = await res.json();
      // OpenRouter sometimes wraps upstream errors in a 200
      if (d?.error) { const err: any = new Error(`${o.provider} API：${JSON.stringify(d.error).slice(0, 300)}`); err.status = Number(d.error.code) || 500; throw err; }
      return d;
    }, (msg, n) => o.onEvent({ type: 'text', text: `（暫時性錯誤，第 ${n} 次重試：${msg}）` }));
    tin += data.usage?.prompt_tokens ?? 0; tout += data.usage?.completion_tokens ?? 0;
    o.onEvent({ type: 'usage', tokens_in: data.usage?.prompt_tokens ?? 0, tokens_out: data.usage?.completion_tokens ?? 0 });
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('API 回應沒有 message');
    if (msg.content) { finalText = msg.content; o.onEvent({ type: 'text', text: msg.content }); }
    const calls: any[] = msg.tool_calls ?? [];
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls.length ? calls : undefined });
    if (!calls.length) break;
    for (const c of calls) {
      steps++;
      if (steps > o.maxSteps) throw new Error(`超過工具呼叫上限（${o.maxSteps}）`);
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(c.function?.arguments || '{}'); } catch { /* empty arguments */ }
      o.onEvent({ type: 'tool', tool: c.function?.name, input });
      const out = await o.exec(c.function?.name, input).catch(e => `錯誤：${(e as Error).message}`);
      o.onEvent({ type: 'result', tool: c.function?.name, output: out.slice(0, 400) });
      messages.push({ role: 'tool', tool_call_id: c.id, content: out });
    }
  }
  return { steps, tokens_in: tin, tokens_out: tout, finalText };
}

/* ── Model listing and key validation: the OpenRouter list is public; Anthropic/OpenAI need a key ── */
export interface ModelInfo { id: string; name: string; context?: number; pricing?: { input: number; output: number } } // pricing is USD per million tokens
const modelCache = new Map<string, { at: number; models: ModelInfo[] }>();

export async function listModels(provider: Provider, apiKey?: string): Promise<ModelInfo[]> {
  const cacheKey = `${provider}:${apiKey ? createHash('sha256').update(apiKey).digest('hex').slice(0, 16) : 'public'}`;
  const hit = modelCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.models;
  let models: ModelInfo[] = [];
  if (provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`OpenRouter 模型清單失敗：HTTP ${res.status}`);
    const data = await res.json();
    models = (data.data ?? []).map((m: any) => ({
      id: m.id, name: m.name ?? m.id, context: m.context_length,
      pricing: m.pricing ? { input: Number(m.pricing.prompt) * 1e6, output: Number(m.pricing.completion) * 1e6 } : undefined,
    }));
  } else if (provider === 'anthropic') {
    if (!apiKey) throw new Error('需要 API key 才能列出模型');
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 15_000 });
    const page = await client.models.list({ limit: 100 });
    models = page.data.map(m => ({ id: m.id, name: m.display_name ?? m.id }));
  } else {
    if (!apiKey) throw new Error('需要 API key 才能列出模型');
    const res = await fetch(`${PROVIDERS.openai.baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`OpenAI 模型清單失敗：HTTP ${res.status}`);
    const data = await res.json();
    models = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id })).filter((m: ModelInfo) => /^(gpt|o\d|chatgpt)/.test(m.id));
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  modelCache.set(cacheKey, { at: Date.now(), models });
  return models;
}

/* ── Reference prices: the public OpenRouter price list is shared by all three providers; Anthropic/OpenAI model ids map to OpenRouter slugs ── */
export interface Price { input: number; output: number } // USD per million tokens
let priceOverride: Map<string, Price> | null = null;
export function setPriceTableForTest(t: Map<string, Price> | null) { priceOverride = t; }

export async function priceFor(provider: Provider, model: string): Promise<Price | null> {
  const raw = model.trim();
  const m = raw.replace(/^[^a-z0-9]+/i, ''); // some OpenRouter ids carry a "~" prefix; try both forms
  const slugs = [...new Set(provider === 'openrouter' ? [raw, m] : provider === 'anthropic' ? [`anthropic/${m}`] : [`openai/${m}`])];
  if (priceOverride) return slugs.map(s => priceOverride!.get(s)).find(Boolean) ?? null;
  try {
    const models = await listModels('openrouter');
    for (const slug of slugs) {
      const hit = models.find(x => x.id === slug) ?? models.find(x => x.id.replace(/:.*$/, '') === slug) ?? models.find(x => x.id.replace(/^[^a-z0-9]+/i, '') === slug);
      if (hit?.pricing) return hit.pricing;
    }
    const tail = models.find(x => x.id.endsWith(`/${m.replace(/-\d{8}$/, '')}`));
    return tail?.pricing ?? null;
  } catch { return null; }
}
export const estimateCost = (tin: number, tout: number, p: Price | null) => p ? (tin / 1e6) * p.input + (tout / 1e6) * p.output : null;
