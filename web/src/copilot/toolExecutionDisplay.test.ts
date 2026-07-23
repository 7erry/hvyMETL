import { describe, expect, it } from 'vitest';
import { countSqlTranslationLines, readSqlTranslationOutput, resolveSqlTranslationOutput } from './toolExecutionDisplay.js';

describe('toolExecutionDisplay sql translation', () => {
  const sample = {
    aggregationPipeline: '[\n  { "$match": {} }\n]',
    mongooseScript: 'await Model.aggregate([])',
    shellScript: 'db.orders.aggregate([])',
    indexRecommendations: ['{ status: 1 }'],
  };

  it('parses and resolves sql translation payloads', () => {
    expect(readSqlTranslationOutput(sample)).toEqual(sample);
    expect(
      resolveSqlTranslationOutput({
        tool: 'translateSQLToMongo',
        sqlTranslation: sample,
      }),
    ).toEqual(sample);
    expect(
      resolveSqlTranslationOutput({ tool: 'translateSQLToMongo', data: sample }, null),
    ).toEqual(sample);
    expect(countSqlTranslationLines(sample)).toBe(3);
  });
});
