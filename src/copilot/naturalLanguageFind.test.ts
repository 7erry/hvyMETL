import { describe, expect, it } from 'vitest';
import {
  parseNaturalLanguageFindQuery,
  parseNaturalLanguageWhere,
} from './naturalLanguageFind.js';

describe('naturalLanguageFind', () => {
  it('parses find in db.collection where clauses with spaced field names', () => {
    expect(parseNaturalLanguageFindQuery('find in finops.accounts where current balance > 9000')).toEqual({
      kind: 'mongoInspect',
      tool: 'findMongoDocuments',
      args: {
        database: 'finops',
        collection: 'accounts',
        limit: 25,
        filter: { 'current balance': { $gt: 9000 } },
      },
    });
  });

  it('parses count in db.collection where clauses', () => {
    expect(parseNaturalLanguageFindQuery('count in finops.accounts where current balance > 9000')).toEqual({
      kind: 'mongoInspect',
      tool: 'aggregateMongoCollection',
      args: {
        database: 'finops',
        collection: 'accounts',
        pipeline: [{ $match: { 'current balance': { $gt: 9000 } } }, { $count: 'total' }],
      },
    });
  });

  it('parses collection in database phrasing', () => {
    expect(parseNaturalLanguageFindQuery('find accounts in finops where status = ACTIVE')).toEqual({
      kind: 'mongoInspect',
      tool: 'findMongoDocuments',
      args: {
        database: 'finops',
        collection: 'accounts',
        limit: 25,
        filter: { status: 'ACTIVE' },
      },
    });
  });

  it('parses AND conditions in where clauses', () => {
    expect(
      parseNaturalLanguageWhere("current balance > 9000 and status = 'ACTIVE'"),
    ).toEqual({
      $and: [{ 'current balance': { $gt: 9000 } }, { status: 'ACTIVE' }],
    });
  });
});
