import { describe, expect, it } from 'vitest';
import {
  emptyModelTokenUsage,
  estimateTokensFromText,
  mergeModelTokenUsage,
  parseApiUsage,
  recordEmbeddingUsage,
  runWithModelUsageTracking,
} from './modelUsage.js';

describe('modelUsage', () => {
  it('parses OpenAI-style usage blocks', () => {
    expect(parseApiUsage({ usage: { total_tokens: 42 } })).toBe(42);
    expect(parseApiUsage({ usage: { prompt_tokens: 10, completion_tokens: 5 } })).toBe(15);
  });

  it('estimates tokens from text length', () => {
    expect(estimateTokensFromText('abcd')).toBe(1);
    expect(estimateTokensFromText('a'.repeat(40))).toBe(10);
  });

  it('tracks embedding usage inside runWithModelUsageTracking', async () => {
    const { usage } = await runWithModelUsageTracking(async () => {
      recordEmbeddingUsage(120, 'ignored fallback');
      recordEmbeddingUsage(null, 'abcd');
      return 'done';
    });

    expect(usage.embeddingTokens).toBe(121);
    expect(usage.totalTokens).toBe(121);
    expect(usage.apiCalls).toBe(2);
    expect(usage.estimated).toBe(true);
  });

  it('merges usage snapshots', () => {
    const merged = mergeModelTokenUsage(
      { embeddingTokens: 10, rerankTokens: 5, totalTokens: 15, apiCalls: 2, estimated: false },
      { embeddingTokens: 3, rerankTokens: 2, totalTokens: 5, apiCalls: 1, estimated: true },
    );
    expect(merged.totalTokens).toBe(20);
    expect(merged.estimated).toBe(true);
    expect(emptyModelTokenUsage().totalTokens).toBe(0);
  });
});
