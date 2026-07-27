import { describe, expect, it } from 'vitest';
import {
  camelToSnake,
  fieldNameMatchKey,
  normalizeAggregationPipelineFilters,
  normalizeMongoFilter,
  resolveFieldName,
} from './mongoFilterFieldNormalize.js';

describe('mongoFilterFieldNormalize', () => {
  const knownFields = ['account_id', 'current_balance', 'cleared_balance', 'status'];

  it('resolves spaced and camelCase names to snake_case schema fields', () => {
    expect(resolveFieldName('current balance', knownFields)).toBe('current_balance');
    expect(resolveFieldName('Current Balance', knownFields)).toBe('current_balance');
    expect(resolveFieldName('currentBalance', knownFields)).toBe('current_balance');
    expect(resolveFieldName('clearedBalance', knownFields)).toBe('cleared_balance');
  });

  it('keeps unknown field names unchanged', () => {
    expect(resolveFieldName('missing_field', knownFields)).toBeNull();
  });

  it('normalizes find filters using schema field paths', () => {
    expect(
      normalizeMongoFilter({ currentBalance: { $gt: 9000 } }, knownFields),
    ).toEqual({ current_balance: { $gt: 9000 } });

    expect(
      normalizeMongoFilter(
        { $and: [{ 'current balance': { $gt: 9000 } }, { status: 'ACTIVE' }] },
        knownFields,
      ),
    ).toEqual({
      $and: [{ current_balance: { $gt: 9000 } }, { status: 'ACTIVE' }],
    });
  });

  it('normalizes $match stages in aggregation pipelines', () => {
    const pipeline = [{ $match: { currentBalance: { $gt: 9000 } } }, { $limit: 25 }];
    expect(normalizeAggregationPipelineFilters(pipeline, knownFields)).toEqual([
      { $match: { current_balance: { $gt: 9000 } } },
      { $limit: 25 },
    ]);
  });

  it('builds stable match keys for camelCase and snake_case', () => {
    expect(fieldNameMatchKey(camelToSnake('currentBalance'))).toBe(fieldNameMatchKey('current_balance'));
    expect(camelToSnake('currentBalance')).toBe('current_balance');
  });
});
