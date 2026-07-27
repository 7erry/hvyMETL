import { describe, expect, it } from 'vitest';
import {
  buildAggregateInspectArgs,
  inferCollectionNameFromShell,
  parseTranslationPipeline,
} from './runTranslationPipeline';

describe('runTranslationPipeline', () => {
  it('parses a JSON aggregation pipeline array', () => {
    const pipeline = parseTranslationPipeline('[{ "$match": { "status": "open" } }, { "$limit": 5 }]');
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0]).toEqual({ $match: { status: 'open' } });
  });

  it('rejects invalid pipeline JSON', () => {
    expect(() => parseTranslationPipeline('not-json')).toThrow(/valid JSON/i);
    expect(() => parseTranslationPipeline('{"$match": {}}')).toThrow(/JSON array/i);
  });

  it('infers collection name from shell script', () => {
    expect(inferCollectionNameFromShell('db.orders.aggregate([]);')).toBe('orders');
  });

  it('builds inspect args from translation output', () => {
    const args = buildAggregateInspectArgs({
      collectionName: 'orders',
      aggregationPipeline: '[{ "$match": { "_archived": { "$ne": true } } }]',
      mongooseScript: '',
      shellScript: 'db.orders.aggregate([]);',
      indexRecommendations: [],
    });
    expect(args.collection).toBe('orders');
    expect(args.pipeline).toHaveLength(1);
  });
});
