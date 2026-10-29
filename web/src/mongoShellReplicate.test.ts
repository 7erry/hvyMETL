import { describe, expect, it } from 'vitest';
import {
  buildCollectionReplicateScript,
  collectionNamesFromShellOutput,
  databaseNamesFromShellOutput,
} from './mongoShellReplicate';

describe('databaseNamesFromShellOutput', () => {
  it('reads databases and skips system DBs when others exist', () => {
    expect(
      databaseNamesFromShellOutput(
        JSON.stringify({ databases: ['admin', 'local', 'shop', 'config', 'analytics'] }),
      ),
    ).toEqual(['analytics', 'shop']);
  });

  it('keeps system DBs when they are the only names', () => {
    expect(databaseNamesFromShellOutput(JSON.stringify({ databases: ['admin', 'local'] }))).toEqual([
      'admin',
      'local',
    ]);
  });
});

describe('collectionNamesFromShellOutput', () => {
  it('reads names from introspect object JSON', () => {
    expect(
      collectionNamesFromShellOutput(
        JSON.stringify({
          database: 'shop',
          collections: [{ name: 'users', fields: [] }, { name: 'orders', fields: ['a'] }],
        }),
      ),
    ).toEqual(['users', 'orders']);
  });

  it('reads names when stdout prefers a nested collections array', () => {
    expect(
      collectionNamesFromShellOutput(
        'warn\n[{"name":"a","fields":[]},{"name":"b","fields":[]}]',
      ),
    ).toEqual(['a', 'b']);
  });

  it('reads plain string collection lists', () => {
    expect(collectionNamesFromShellOutput('["users","orders"]')).toEqual(['users', 'orders']);
  });
});

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
    expect(script).toContain('new Mongo("mongodb://user:p@ss@target-host:27017").getDB("target_db")');
    expect(script).toContain('getSiblingDB("source_db")');
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
