import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iterateExtendedJsonText } from './mongoExtendedJson.js';
import type { MongoImportSpawn } from './mongoImport.js';
import { loadMongoJsonIntoCollection, writeExtendedJsonBatches } from './mongoJsonBulkWriter.js';

const TEXT = ['{"name":"a","secret":"x"}', 'NOT JSON', '{"name":"b","secret":"y"}'].join('\n');
const SCHEMA = { bsonType: 'object', properties: { name: { bsonType: 'string' } } };

describe('writeExtendedJsonBatches', () => {
  it('records one bad line and still writes the good documents', async () => {
    const inserted: Record<string, unknown>[] = [];
    const result = await writeExtendedJsonBatches(iterateExtendedJsonText(TEXT), {
      strict: false,
      schema: SCHEMA,
      insertMany: async (docs) => {
        inserted.push(...docs);
        return { insertedCount: docs.length };
      },
    });

    expect(inserted).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect(result.inserted).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Line 2');
  });

  it('stops before later documents when strict', async () => {
    const inserted: Record<string, unknown>[] = [];
    const result = await writeExtendedJsonBatches(iterateExtendedJsonText(TEXT), {
      strict: true,
      schema: SCHEMA,
      insertMany: async (docs) => {
        inserted.push(...docs);
        return { insertedCount: docs.length };
      },
    });

    expect(inserted).toEqual([{ name: 'a' }]);
    expect(result.errors).toHaveLength(1);
  });
});

describe('loadMongoJsonIntoCollection', () => {
  it('counts a bad line and hands the good documents to mongoimport', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mongo-json-'));
    const binary = join(dir, 'mongoimport');
    writeFileSync(binary, '#!/bin/sh\nexit 0\n');
    chmodSync(binary, 0o755);

    let importedFile = '';
    const spawnImport: MongoImportSpawn = (_binary, args) => {
      importedFile = readFileSync(args[args.indexOf('--file') + 1] ?? '', 'utf8');
      return {
        status: 0,
        stdout: '',
        stderr: '2 document(s) imported successfully. 0 document(s) failed to import.',
      };
    };

    const result = await loadMongoJsonIntoCollection({
      uri: 'mongodb://localhost:27017',
      database: 'app',
      collection: 'posts',
      text: TEXT,
      schema: SCHEMA,
      strict: false,
      drop: true,
      ndjsonDir: dir,
      env: { MONGOIMPORT_PATH: binary, PATH: '' },
      spawnImport,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Line 2');
    expect(result.inserted).toBe(2);
    expect(importedFile).toContain('"name":"a"');
    expect(importedFile).toContain('"name":"b"');
    expect(importedFile).not.toContain('secret');
  });
});
