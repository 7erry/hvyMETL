/**
 * Tracks embedding and rerank API token usage during ML/RAG design runs.
 * Usage is collected via AsyncLocalStorage so low-level fetch wrappers can
 * record totals without threading counters through every call site.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** Token counts from one design or pipeline design stage. */
export type ModelTokenUsage = {
  /** Tokens billed for embedding / vector API calls. */
  embeddingTokens: number;
  /** Tokens billed for rerank API calls. */
  rerankTokens: number;
  /** Sum of embedding + rerank tokens. */
  totalTokens: number;
  /** Number of external model API calls made. */
  apiCalls: number;
  /** True when any amount was estimated from text length instead of API metadata. */
  estimated: boolean;
};

export function emptyModelTokenUsage(): ModelTokenUsage {
  return {
    embeddingTokens: 0,
    rerankTokens: 0,
    totalTokens: 0,
    apiCalls: 0,
    estimated: false,
  };
}

/** Merge two usage snapshots (e.g. cumulative session totals). */
export function mergeModelTokenUsage(a: ModelTokenUsage, b: ModelTokenUsage): ModelTokenUsage {
  return {
    embeddingTokens: a.embeddingTokens + b.embeddingTokens,
    rerankTokens: a.rerankTokens + b.rerankTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    apiCalls: a.apiCalls + b.apiCalls,
    estimated: a.estimated || b.estimated,
  };
}

/** Rough token estimate when an API response omits usage metadata (~4 chars/token). */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Parse `usage` objects from OpenAI / Voyage compatible JSON payloads. */
export function parseApiUsage(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const usage = (payload as { usage?: Record<string, number> }).usage;
  if (!usage || typeof usage !== 'object') return null;

  if (typeof usage.total_tokens === 'number') return usage.total_tokens;
  if (typeof usage.totalTokens === 'number') return usage.totalTokens;

  const prompt = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
  const completion = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
  const sum = prompt + completion;
  return sum > 0 ? sum : null;
}

class ModelTokenUsageTracker {
  embeddingTokens = 0;
  rerankTokens = 0;
  apiCalls = 0;
  estimated = false;

  addEmbedding(tokens: number, fromEstimate: boolean): void {
    if (tokens <= 0) return;
    this.embeddingTokens += tokens;
    this.apiCalls += 1;
    if (fromEstimate) this.estimated = true;
  }

  addRerank(tokens: number, fromEstimate: boolean): void {
    if (tokens <= 0) return;
    this.rerankTokens += tokens;
    this.apiCalls += 1;
    if (fromEstimate) this.estimated = true;
  }

  snapshot(): ModelTokenUsage {
    return {
      embeddingTokens: this.embeddingTokens,
      rerankTokens: this.rerankTokens,
      totalTokens: this.embeddingTokens + this.rerankTokens,
      apiCalls: this.apiCalls,
      estimated: this.estimated,
    };
  }
}

const usageStore = new AsyncLocalStorage<ModelTokenUsageTracker>();

/** Run async work inside a token-usage scope; returns the work result and usage snapshot. */
export async function runWithModelUsageTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; usage: ModelTokenUsage }> {
  const tracker = new ModelTokenUsageTracker();
  const result = await usageStore.run(tracker, fn);
  return { result, usage: tracker.snapshot() };
}

/** Record embedding API usage for the active tracking scope (no-op when untracked). */
export function recordEmbeddingUsage(apiUsageTokens: number | null | undefined, fallbackText: string): void {
  const tracker = usageStore.getStore();
  if (!tracker) return;

  if (typeof apiUsageTokens === 'number' && apiUsageTokens > 0) {
    tracker.addEmbedding(apiUsageTokens, false);
    return;
  }

  const estimated = estimateTokensFromText(fallbackText);
  if (estimated > 0) {
    tracker.addEmbedding(estimated, true);
  }
}

/** Record rerank API usage for the active tracking scope (no-op when untracked). */
export function recordRerankUsage(apiUsageTokens: number | null | undefined, fallbackText: string): void {
  const tracker = usageStore.getStore();
  if (!tracker) return;

  if (typeof apiUsageTokens === 'number' && apiUsageTokens > 0) {
    tracker.addRerank(apiUsageTokens, false);
    return;
  }

  const estimated = estimateTokensFromText(fallbackText);
  if (estimated > 0) {
    tracker.addRerank(estimated, true);
  }
}
