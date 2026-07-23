import { describe, expect, it } from 'vitest';
import { normalizeAggregationPipeline, pipelineHasLimitStage } from './mongoAnalyzePipeline.js';

describe('mongoAnalyzePipeline', () => {
  it('rejects write stages in read-only analyze mode', () => {
    expect(() => normalizeAggregationPipeline([{ $match: { status: 'open' } }, { $out: 'other' }])).toThrow(
      /\$out/,
    );
  });

  it('appends a limit stage when the pipeline lacks one', () => {
    const pipeline = normalizeAggregationPipeline([{ $group: { _id: '$status', total: { $sum: 1 } } }]);
    expect(pipelineHasLimitStage(pipeline)).toBe(true);
    expect(pipeline.at(-1)).toEqual({ $limit: 50 });
  });
});
