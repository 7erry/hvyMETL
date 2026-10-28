import { describe, expect, it } from 'vitest';
import {
  bsonTypeOf,
  buildResultTree,
  collectionNameFromScript,
  documentsFromParsedOutput,
  parseShellJsonOutput,
  scriptLooksLikeCollectionQuery,
} from './mongoShellResultModel';

describe('mongoShellResultModel', () => {
  it('parses EJSON array output', () => {
    const parsed = parseShellJsonOutput('[\n  { "_id": { "$oid": "abc" }, "n": 1 }\n]');
    const docs = documentsFromParsedOutput(parsed);
    expect(docs).toHaveLength(1);
    expect(bsonTypeOf(docs![0]._id)).toBe('ObjectId');
  });

  it('treats empty find arrays as documents', () => {
    expect(documentsFromParsedOutput(parseShellJsonOutput('[]'))).toEqual([]);
  });

  it('parses JSON after mongosh noise and names getCollection scripts', () => {
    const parsed = parseShellJsonOutput('Warning: x\n[{"_id":1}]');
    expect(documentsFromParsedOutput(parsed)).toEqual([{ _id: 1 }]);
    const script = "use retail_banking\ndb.getCollection('checkpoints').find()";
    expect(collectionNameFromScript(script)).toBe('checkpoints');
    expect(scriptLooksLikeCollectionQuery(script)).toBe(true);
  });

  it('builds key/value/type tree', () => {
    const tree = buildResultTree(
      { _id: { $oid: 'abc' }, name: 'x', nested: { a: true } },
      'root',
      'r',
    );
    expect(tree.type).toBe('Document');
    expect(tree.children?.some((c) => c.key === '_id' && c.type === 'ObjectId')).toBe(true);
    expect(tree.children?.some((c) => c.key === 'nested' && c.type === 'Document')).toBe(true);
  });

  it('reads collection name from script', () => {
    expect(collectionNameFromScript('db.accounts.find()')).toBe('accounts');
    expect(collectionNameFromScript('db.getCollection("orders").find({})')).toBe('orders');
  });
});
