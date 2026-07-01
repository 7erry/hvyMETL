/** Token usage from embedding / rerank APIs during ML design (mirrors server ModelTokenUsage). */
export type ModelTokenUsage = {
  embeddingTokens: number;
  rerankTokens: number;
  totalTokens: number;
  apiCalls: number;
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

/** Combine session totals after multiple design runs. */
export function mergeModelTokenUsage(a: ModelTokenUsage, b: ModelTokenUsage): ModelTokenUsage {
  return {
    embeddingTokens: a.embeddingTokens + b.embeddingTokens,
    rerankTokens: a.rerankTokens + b.rerankTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    apiCalls: a.apiCalls + b.apiCalls,
    estimated: a.estimated || b.estimated,
  };
}

/** Human-readable token count for manager dashboards. */
export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

/** Short label explaining whether usage came from live API metadata or estimates. */
export function tokenUsageSourceLabel(usage: ModelTokenUsage | null | undefined): string {
  if (!usage || usage.totalTokens === 0) {
    return 'No model API calls (BM25 / local reranker only)';
  }
  if (usage.estimated) {
    return 'Includes estimates when API usage metadata was unavailable';
  }
  return 'Reported by embedding and rerank APIs';
}
