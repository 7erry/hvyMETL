import { describe, expect, it } from 'vitest';
import { buildCollectionReplicateScript } from './mongoShellReplicate';

describe('buildCollectionReplicateScript', () => {
  it('emits connect + batched insertMany with escaped URIs and names', () => {
    const script = buildCollectionReplicateScript({
      targetUri: 'mongodb://user:p@ss@target-host:27017',
      sourceDb: 'source_db',
      targetDb: 'target_db',
      sourceCollection: 'users',
      targetCollection: 'users_copy',
      batchSize: 500,
    });
    expect(script).toContain('connect("mongodb://user:p@ss@target-host:27017")');
    expect(script).toContain('getSiblingDB("source_db")');
    expect(script).toContain('getDB("target_db")');
    expect(script).toContain('getCollection("users")');
    expect(script).toContain('getCollection("users_copy")');
    expect(script).toContain('const BATCH_SIZE = 500;');
    expect(script).toContain('insertMany(batch, { ordered: false })');
  });

  it('defaults target collection name and batch size', () => {
    const script = buildCollectionReplicateScript({
      targetUri: 'mongodb://localhost:27017',
      sourceDb: 'a',
      targetDb: 'b',
      sourceCollection: 'orders',
      targetCollection: '',
    });
    expect(script).toContain('getCollection("orders")');
    expect(script).toContain('const BATCH_SIZE = 1000;');
  });

  it('rejects missing required fields', () => {
    expect(() =>
      buildCollectionReplicateScript({
        targetUri: '',
        sourceDb: 'a',
        targetDb: 'b',
        sourceCollection: 'c',
        targetCollection: 'c',
      }),
    ).toThrow(/Target MongoDB URI/);
  });
});
