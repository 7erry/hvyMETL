import { describe, expect, it } from 'vitest';
import { readMongoAggregateRows, readMongoCompareRows, readMongoExplainView } from './mongoAnalyzeFormat';

describe('mongoAnalyzeFormat', () => {
  it('reads compare rows from inspect payloads', () => {
    const view = readMongoCompareRows({
      database: 'mytrains',
      collection: 'trains',
      rows: [{ aspect: 'field: status', status: 'match', planned: 'status', live: 'status' }],
      summary: { matches: 1, missing: 0, extra: 0, warnings: 0 },
    });
    expect(view.rows).toHaveLength(1);
    expect(view.database).toBe('mytrains');
  });

  it('flattens aggregation documents into table rows', () => {
    const view = readMongoAggregateRows({
      count: 2,
      documents: [{ _id: 'open', total: 4 }, { _id: 'closed', total: 9 }],
    });
    expect(view.rows).toHaveLength(2);
    expect(view.columns).toContain('_id');
  });

  it('reads explain summaries', () => {
    const view = readMongoExplainView({
      method: 'find',
      verbosity: 'executionStats',
      winningStage: 'IXSCAN',
      indexName: 'status_1',
      docsExamined: 10,
    });
    expect(view?.indexName).toBe('status_1');
  });
});
