import { describe, expect, it } from 'vitest';
import { translateSQLToMongo } from './sqlTranslator';

describe('translateSQLToMongo ORDER BY', () => {
  it('maps DESC to -1 and strips table aliases', () => {
    const result = translateSQLToMongo({
      sqlQuery: `
SELECT o.order_id, o.order_date
FROM orders o
WHERE o.status = 'COMPLETED'
ORDER BY o.order_date DESC, o.order_id;
`.trim(),
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    const sortStage = pipeline.find((stage) => '$sort' in stage) as { $sort: Record<string, number> };

    expect(sortStage.$sort).toEqual({
      order_date: -1,
      order_id: 1,
    });
  });

  it('maps ASC explicitly to 1', () => {
    const result = translateSQLToMongo({
      sqlQuery: 'SELECT * FROM orders ORDER BY created_at ASC',
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    const sortStage = pipeline.find((stage) => '$sort' in stage) as { $sort: Record<string, number> };

    expect(sortStage.$sort).toEqual({ created_at: 1 });
  });
});
