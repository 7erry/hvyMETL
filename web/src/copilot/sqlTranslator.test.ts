import { describe, expect, it } from 'vitest';
import { translateSQLToMongo } from './sqlTranslator';

describe('translateSQLToMongo WHERE', () => {
  it('translates numeric greater-than comparisons', () => {
    const result = translateSQLToMongo({
      sqlQuery: 'SELECT * FROM accounts WHERE current_balance > 9000;',
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    expect(result.collectionName).toBe('accounts');
    expect(result.shellScript).toContain('db.accounts.aggregate(');
    expect(pipeline[1]).toEqual({
      $match: {
        currentBalance: { $gt: 9000 },
      },
    });
    expect(result.indexRecommendations[0]).toContain('currentBalance');
  });

  it('translates AND-combined predicates', () => {
    const result = translateSQLToMongo({
      sqlQuery: "SELECT * FROM accounts WHERE current_balance > 9000 AND status = 'ACTIVE'",
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    expect(pipeline[1]).toEqual({
      $match: {
        $and: [{ currentBalance: { $gt: 9000 } }, { status: 'ACTIVE' }],
      },
    });
  });

  it('translates IN lists on joined tables after lookups', () => {
    const result = translateSQLToMongo({
      sqlQuery: `
SELECT comp.id
FROM component comp
JOIN approval a ON comp.id = a.component_id
LEFT JOIN refdata_approval_status ras ON a.status = ras.id
WHERE ras.code IN ('APPROVED', 'PENDING');
`.trim(),
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    const joinedMatch = pipeline.find(
      (stage) =>
        '$match' in stage &&
        typeof stage.$match === 'object' &&
        stage.$match !== null &&
        'refdataApprovalStatus.code' in (stage.$match as Record<string, unknown>),
    ) as { $match: Record<string, unknown> };

    expect(joinedMatch.$match).toEqual({
      'refdataApprovalStatus.code': { $in: ['APPROVED', 'PENDING'] },
    });
    expect(pipeline.some((stage) => '$lookup' in stage && (stage.$lookup as { from: string }).from === 'approval')).toBe(
      true,
    );
  });
});

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
      orderDate: -1,
      orderId: 1,
    });
    expect(result.collectionName).toBe('orders');
  });

  it('maps ASC explicitly to 1', () => {
    const result = translateSQLToMongo({
      sqlQuery: 'SELECT * FROM orders ORDER BY created_at ASC',
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    const sortStage = pipeline.find((stage) => '$sort' in stage) as { $sort: Record<string, number> };

    expect(sortStage.$sort).toEqual({ createdAt: 1 });
  });
});

describe('translateSQLToMongo joins and projection', () => {
  it('translates a multi-join approval query with project and sort', () => {
    const result = translateSQLToMongo({
      sqlQuery: `
SELECT
    comp.id AS component_id,
    rct.label AS component_type,
    app.first_name || ' ' || app.last_name AS approver_full_name,
    app.email AS approver_email,
    ras.label AS approval_status,
    a.last_modified_date_time AS approval_date
FROM component comp
JOIN approval a ON comp.id = a.component_id
JOIN approver app ON a.approver = app.id
LEFT JOIN refdata_approval_status ras ON a.status = ras.id
LEFT JOIN refdata_component_type rct ON comp.component_type_id = rct.id
WHERE ras.code IN ('APPROVED', 'PENDING')
ORDER BY a.last_modified_date_time DESC;
`.trim(),
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    expect(result.collectionName).toBe('component');
    expect(pipeline.some((stage) => '$lookup' in stage && (stage.$lookup as { from: string }).from === 'approver')).toBe(
      true,
    );

    const projectStage = pipeline.find((stage) => '$project' in stage) as { $project: Record<string, unknown> };
    expect(projectStage.$project.componentId).toBe('$_id');
    expect(projectStage.$project.approverFullName).toEqual({
      $concat: ['$approver.firstName', ' ', '$approver.lastName'],
    });

    const sortStage = pipeline.find((stage) => '$sort' in stage) as { $sort: Record<string, number> };
    expect(sortStage.$sort).toEqual({ 'approval.lastModifiedDateTime': -1 });

    const fallback = pipeline.find(
      (stage) => '$match' in stage && JSON.stringify(stage).includes('Review WHERE'),
    );
    expect(fallback).toBeUndefined();
  });
});

describe('translateSQLToMongo literals and UNION ALL', () => {
  const ledgerSql = `
SELECT 
    journal_entry_id, 
    '11111111-1111-1111-1111-111111111111', -- Cash/Operating Account
    'DEBIT'::posting_type, 
    1500.00, 
    'USD', 
    1.00000000, 
    CURRENT_TIMESTAMP 
FROM new_entry
UNION ALL
SELECT 
    journal_entry_id, 
    '22222222-2222-2222-2222-222222222222', -- Deferred Revenue Account
    'CREDIT'::posting_type, 
    1500.00, 
    'USD', 
    1.00000000, 
    CURRENT_TIMESTAMP 
FROM new_entry;
`.trim();

  it('projects SQL string/number literals and casts instead of mangling decimal tokens', () => {
    const result = translateSQLToMongo({
      sqlQuery: `SELECT journal_entry_id, 'DEBIT'::posting_type, 1500.00 FROM new_entry`,
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    const projectStage = pipeline.find((stage) => '$project' in stage) as { $project: Record<string, unknown> };

    expect(projectStage.$project.journalEntryId).toBe('$journalEntryId');
    expect(projectStage.$project.postingType).toEqual({ $literal: 'DEBIT' });
    expect(projectStage.$project.selectLiteral1).toEqual({ $literal: 1500 });
    expect(projectStage.$project).not.toHaveProperty('00');
  });

  it('translates UNION ALL ledger inserts with distinct literal UUIDs per branch', () => {
    const result = translateSQLToMongo({
      sqlQuery: ledgerSql,
      model: null,
      plan: null,
    });

    const pipeline = JSON.parse(result.aggregationPipeline) as Record<string, unknown>[];
    expect(result.collectionName).toBe('newEntry');

    const firstProject = pipeline.find((stage) => '$project' in stage) as { $project: Record<string, unknown> };
    expect(firstProject.$project).toMatchObject({
      journalEntryId: '$journalEntryId',
      selectLiteral1: { $literal: '11111111-1111-1111-1111-111111111111' },
      postingType: { $literal: 'DEBIT' },
      selectLiteral2: { $literal: 1500 },
      selectLiteral3: { $literal: 'USD' },
      selectLiteral4: { $literal: 1 },
      currentTimestamp: { $dateAdd: { startDate: '$$NOW', unit: 'millisecond', amount: 0 } },
    });

    const unionStage = pipeline.find((stage) => '$unionWith' in stage) as {
      $unionWith: { coll: string; pipeline: Record<string, unknown>[] };
    };
    expect(unionStage.$unionWith.coll).toBe('newEntry');

    const secondProject = unionStage.$unionWith.pipeline.find((stage) => '$project' in stage) as {
      $project: Record<string, unknown>;
    };
    expect(secondProject.$project.selectLiteral1).toEqual({
      $literal: '22222222-2222-2222-2222-222222222222',
    });
    expect(secondProject.$project.postingType).toEqual({ $literal: 'CREDIT' });
  });
});
