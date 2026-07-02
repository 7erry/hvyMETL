import { describe, expect, it } from 'vitest';
import {
  estimateModelTokenCost,
  formatModelTokenCost,
  MODEL_TOKEN_PRICING,
  type ModelTokenUsage,
} from './modelUsage';

describe('modelUsage pricing', () => {
  it('estimates Voyage 4 and Rerank 2.5 list-price token cost', () => {
    const usage: ModelTokenUsage = {
      embeddingTokens: 1_000_000,
      rerankTokens: 1_000_000,
      totalTokens: 2_000_000,
      apiCalls: 2,
      estimated: false,
    };

    const cost = estimateModelTokenCost(usage);

    expect(MODEL_TOKEN_PRICING.embeddingModel).toBe('voyage-4');
    expect(MODEL_TOKEN_PRICING.rerankModel).toBe('rerank-2.5');
    expect(cost.embeddingUsd).toBe(0.06);
    expect(cost.rerankUsd).toBe(0.05);
    expect(cost.totalUsd).toBe(0.11);
  });

  it('formats tiny token costs without rounding to zero', () => {
    expect(formatModelTokenCost(0.001)).toBe('<$0.01');
    expect(formatModelTokenCost(0.1)).toBe('$0.10');
  });
});
