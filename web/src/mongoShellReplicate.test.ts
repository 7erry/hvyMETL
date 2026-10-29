import { describe, expect, it } from 'vitest';
import { mongoShellListCollectionsScript } from './mongoShellCompletions';
import {
  buildCollectionReplicateScript,
  collectionNamesFromShellOutput,
  databaseNamesFromShellOutput,
  isSameReplicateDestination,
} from './mongoShellReplicate';

describe('isSameReplicateDestination', () => {
  const base = {
    sourceConnectionId: 'a',
    targetConnectionId: 'a',
    sourceUri: 'mongodb://localhost:27017',
    targetUri: 'mongodb://localhost:27017',
    sourceDb: 'shop',
    targetDb: 'shop',
    sourceCollection: 'users',
    targetCollection: 'users',
  };

  it('detects same connection id, db, and collection', () => {
    expect(isSameReplicateDestination(base)).toBe(true);
  });

  it('treats empty target collection as the source collection', () => {
    expect(isSameReplicateDestination({ ...base, targetCollection: '' })).toBe(true);
  });

  it('detects same URI even when connection ids differ', () => {
    expect(
      isSameReplicateDestination({
        ...base,
        sourceConnectionId: 'a',
        targetConnectionId: 'b',
      }),
    ).toBe(true);
  });

  it('allows a different target collection on the same connection', () => {
    expect(isSameReplicateDestination({ ...base, targetCollection: 'users_copy' })).toBe(false);
  });

  it('allows a different database on the same connection', () => {
    expect(isSameReplicateDestination({ ...base, targetDb: 'archive' })).toBe(false);
  });

  it('allows a different URI even with matching db and collection names', () => {
    expect(
      isSameReplicateDestination({
        ...base,
        sourceConnectionId: 'a',
        targetConnectionId: 'b',
        targetUri: 'mongodb://other:27017',
      }),
    ).toBe(false);
  });
});

describe('mongoShellListCollectionsScript', () => {
  it('targets the picked database via getSiblingDB and prints a string array', () => {
    const script = mongoShellListCollectionsScript('retail_banking');
    expect(script).toContain('getSiblingDB("retail_banking")');
    expect(script).toContain('getCollectionNames()');
    expect(script).not.toContain('fields:');
  });
});

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

  it('does not treat nested empty fields arrays as the collection list', () => {
    expect(
      collectionNamesFromShellOutput(
        'DeprecationWarning: x\n{"database":"shop","collections":[{"name":"users","fields":[]},{"name":"orders","fields":[]}]}',
      ),
    ).toEqual(['users', 'orders']);
  });

  it('reads plain string collection lists', () => {
    expect(collectionNamesFromShellOutput('["users","orders"]')).toEqual(['users', 'orders']);
  });
});

describe('buildCollectionReplicateScript', () => {
  it('emits Mongo target + batched upsert bulkWrite with escaped URIs and names', () => {
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
    expect(script).toContain('bulkWrite(ops, { ordered: false })');
    expect(script).toContain('replaceOne:');
    expect(script).toContain('upsert: true');
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
