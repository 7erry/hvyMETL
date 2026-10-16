import { describe, expect, it } from 'vitest';
import { detectDialect } from './detectDialect.js';
import { validateMongoJsonPaste } from './mongoJsonValidate.js';
import { modelFromMongoCollections, parseMongoJsonToModel } from './mongoJsonParser.js';
import { parseSchemaImportWithMeta, resolveSchemaImportDialect } from './schemaImport.js';

const DOCUMENTS = [
  '{"_id":{"$oid":"507f1f77bcf86cd799439011"},"age":1,"devices":[{"name":"d","sensors":[{"name":"s"}]}]}',
  '{"_id":{"$oid":"507f1f77bcf86cd799439012"},"age":"old"}',
].join('\n');

describe('parseMongoJsonToModel', () => {
  it('merges mixed field types and keeps nested objects on the same table', () => {
    expect(resolveSchemaImportDialect(DOCUMENTS, 'postgresql')).toBe('mongodb-json');
    expect(detectDialect(DOCUMENTS).dialectId).toBe('mongodb-json');

    const imported = parseSchemaImportWithMeta(DOCUMENTS, 'postgresql', 'sites.ndjson');
    expect(imported.resolvedDialect).toBe('mongodb-json');
    expect(imported.displayText).toContain('"$oid"');

    const model = parseMongoJsonToModel(DOCUMENTS, 'sites.ndjson');
    expect(model.tables.map((table) => table.name)).toEqual(['sites']);
    expect(model.relationships).toEqual([]);
    expect(model.tables[0]?.rowCount).toBe(2);
    expect(model.tables[0]?.primaryKey).toEqual(['_id']);

    const age = model.tables[0]?.columns.find((column) => column.name === 'age');
    expect(age?.bsonType).toBe('mixed');
    expect(age?.observedBsonTypes).toEqual(['int', 'string']);
    expect(model.tables[0]?.columns.find((column) => column.name === 'devices')?.bsonType).toBe('array');
    expect(validateMongoJsonPaste('select 1')).toBe('First line must be a JSON object or array.');
    expect(validateMongoJsonPaste('{"_id":{"$oid":"nope"}}')).toMatch(/\$oid/);
    expect(validateMongoJsonPaste(DOCUMENTS)).toBeNull();
  });

  it('imports a pretty-printed document with nested objects', () => {
    const pretty = `{
  "id": "post_984f1a2e",
  "slug": "getting-started-with-headless-cms",
  "status": "published",
  "meta": {
    "title": "Getting Started"
  },
  "content": [
    { "component": "hero", "heading": "Decoupling" }
  ]
}`;
    expect(resolveSchemaImportDialect(pretty, 'postgresql')).toBe('mongodb-json');
    const model = parseMongoJsonToModel(pretty, 'ddl:mongodb-json');
    expect(model.tables).toHaveLength(1);
    expect(model.tables[0]?.columns.find((column) => column.name === 'meta')?.bsonType).toBe('object');
    expect(model.tables[0]?.columns.find((column) => column.name === 'content')?.bsonType).toBe('array');
  });

  it('splits a JSON object of document arrays into one table per array', () => {
    const bundle = `{
  "authors": [{ "id": "usr_481b", "name": "Jordan Vance" }],
  "categories": [{ "id": "cat_arch", "name": "Architecture" }],
  "mediaAssets": [{
    "id": "asset_og_headless",
    "dimensions": { "width": 1200, "height": 630 }
  }],
  "posts": [{
    "id": "post_984f1a2e",
    "tags": ["headless"],
    "meta": { "title": "Getting Started", "noIndex": false },
    "content": [{ "_block": "hero", "heading": "Decoupling" }]
  }]
}`;
    const model = parseMongoJsonToModel(bundle, 'ddl:mongodb-json');
    expect(model.tables.map((table) => table.name)).toEqual([
      'authors',
      'categories',
      'mediaAssets',
      'posts',
    ]);
    expect(model.relationships).toEqual([]);
    expect(model.tables[0]?.primaryKey).toEqual(['id']);
    expect(model.tables[0]?.rowCount).toBe(1);
    const media = model.tables.find((table) => table.name === 'mediaAssets');
    expect(media?.columns.find((column) => column.name === 'dimensions')?.bsonType).toBe('object');
    const posts = model.tables.find((table) => table.name === 'posts');
    expect(posts?.columns.find((column) => column.name === 'meta')?.bsonType).toBe('object');
    expect(posts?.columns.find((column) => column.name === 'content')?.bsonType).toBe('array');
    expect(posts?.columns.find((column) => column.name === 'tags')?.bsonType).toBe('array');
  });

  it('builds one table per sampled live collection and skips empty ones', () => {
    const model = modelFromMongoCollections(
      [
        { name: 'users', documents: [{ _id: 'u1', email: 'a@b.c' }] },
        { name: 'system.indexes', documents: [] },
        { name: 'posts', documents: [{ _id: 'p1', title: 'Hi' }] },
      ],
      'ddl:mongodb-json',
    );
    expect(model.tables.map((table) => table.name)).toEqual(['users', 'posts']);
    expect(model.tables[0]?.primaryKey).toEqual(['_id']);
    expect(model.tables[0]?.columns.find((column) => column.name === 'email')?.bsonType).toBe('string');
  });
});
