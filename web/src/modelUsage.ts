/** Token usage from embedding / rerank APIs during ML design (mirrors server ModelTokenUsage). */
export type ModelTokenUsage = {
  embeddingTokens: number;
  rerankTokens: number;
  totalTokens: number;
  apiCalls: number;
  estimated: boolean;
};

export type ModelTokenPricing = {
  embeddingModel: 'voyage-4';
  rerankModel: 'rerank-2.5';
  embeddingUsdPerMillionTokens: number;
  rerankUsdPerMillionTokens: number;
  freeTokensPerModel: number;
  sourceUrl: string;
};

export type ModelTokenCostEstimate = {
  embeddingUsd: number;
  rerankUsd: number;
  totalUsd: number;
};

/** MongoDB Voyage AI public preview list pricing, billed through Atlas model API keys. */
export const MODEL_TOKEN_PRICING: ModelTokenPricing = {
  embeddingModel: 'voyage-4',
  rerankModel: 'rerank-2.5',
  embeddingUsdPerMillionTokens: 0.06,
  rerankUsdPerMillionTokens: 0.05,
  freeTokensPerModel: 200_000_000,
  sourceUrl: 'https://www.mongodb.com/docs/voyageai/management/billing/',
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

/** Estimate Atlas model API list-price spend before organization-level free tier credits. */
export function estimateModelTokenCost(usage: ModelTokenUsage | null | undefined): ModelTokenCostEstimate {
  const embeddingTokens = usage?.embeddingTokens ?? 0;
  const rerankTokens = usage?.rerankTokens ?? 0;
  const embeddingUsd = (embeddingTokens / 1_000_000) * MODEL_TOKEN_PRICING.embeddingUsdPerMillionTokens;
  const rerankUsd = (rerankTokens / 1_000_000) * MODEL_TOKEN_PRICING.rerankUsdPerMillionTokens;
  return {
    embeddingUsd,
    rerankUsd,
    totalUsd: embeddingUsd + rerankUsd,
  };
}

export function formatModelTokenCost(amount: number): string {
  if (amount > 0 && amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}

/** True when design ran without embedding/rerank API keys (lexical BM25 only). */
export function isBm25OnlyRetrieval(strategy: string | null | undefined): boolean {
  if (!strategy?.trim()) return true;
  const lower = strategy.toLowerCase();
  if (lower.includes('hybrid') || lower.includes('vector') || lower.includes('voyage')) {
    return false;
  }
  return lower.includes('bm25');
}

/** Hint for the manager token panel when no usage is recorded yet. */
export function modelTokenUsageEmptyHint(strategy: string | null | undefined): string {
  if (isBm25OnlyRetrieval(strategy)) {
    return 'Design used lexical BM25 only — no embedding or rerank API calls. Add MONGODB_MODEL_KEY or OPENAI_API_KEY to .env on the API server to enable hybrid retrieval and token tracking.';
  }
  if (strategy?.trim()) {
    return `Last design run used ${strategy}, but token counts were not recorded. Run design or the full pipeline again to populate this panel.`;
  }
  return 'Run design or the full pipeline to record embedding and rerank token usage for this session.';
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
