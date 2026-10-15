import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMongoImportBinary, runMongoImport, type MongoImportSpawn } from './mongoImport.js';

function fakeBinary(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mongoimport-'));
  const binary = join(dir, 'mongoimport');
  writeFileSync(binary, '#!/bin/sh\nexit 0\n');
  chmodSync(binary, 0o755);
  return binary;
}

describe('resolveMongoImportBinary', () => {
  it('reports a missing MONGOIMPORT_PATH', () => {
    const lookup = resolveMongoImportBinary({ MONGOIMPORT_PATH: '/missing/mongoimport', PATH: '' });
    expect(lookup.ok).toBe(false);
    expect(lookup.error).toContain('MONGOIMPORT_PATH');
  });

  it('uses an executable MONGOIMPORT_PATH', () => {
    const binary = fakeBinary();
    const lookup = resolveMongoImportBinary({ MONGOIMPORT_PATH: binary, PATH: '' });
    expect(lookup).toEqual({ ok: true, path: binary });
  });
});

describe('runMongoImport', () => {
  it('spawns one insert and reads the imported count', () => {
    const binary = fakeBinary();
    let seenArgs: string[] = [];
    const spawnImport: MongoImportSpawn = (_binary, args) => {
      seenArgs = args;
      return {
        status: 0,
        stdout: '',
        stderr: '2 document(s) imported successfully. 0 document(s) failed to import.',
      };
    };

    const result = runMongoImport({
      uri: 'mongodb://localhost:27017',
      database: 'app',
      collection: 'posts',
      filePath: '/tmp/posts.ndjson',
      drop: true,
      stopOnError: true,
      env: { MONGOIMPORT_PATH: binary, PATH: '' },
      spawnImport,
    });

    expect(result.ok).toBe(true);
    expect(result.insertedCount).toBe(2);
    expect(seenArgs).toEqual([
      '--uri',
      'mongodb://localhost:27017',
      '--db',
      'app',
      '--collection',
      'posts',
      '--file',
      '/tmp/posts.ndjson',
      '--type',
      'json',
      '--mode',
      'insert',
      '--drop',
      '--stopOnError',
    ]);
  });
});
