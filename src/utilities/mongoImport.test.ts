import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMongoImportBinary } from './mongoImport.js';

describe('resolveMongoImportBinary', () => {
  it('reports a missing MONGOIMPORT_PATH', () => {
    const lookup = resolveMongoImportBinary({ MONGOIMPORT_PATH: '/missing/mongoimport', PATH: '' });
    expect(lookup.ok).toBe(false);
    expect(lookup.error).toContain('MONGOIMPORT_PATH');
  });

  it('uses an executable MONGOIMPORT_PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mongoimport-'));
    const binary = join(dir, 'mongoimport');
    writeFileSync(binary, '#!/bin/sh\nexit 0\n');
    chmodSync(binary, 0o755);

    const lookup = resolveMongoImportBinary({ MONGOIMPORT_PATH: binary, PATH: '' });
    expect(lookup).toEqual({ ok: true, path: binary });
  });
});
