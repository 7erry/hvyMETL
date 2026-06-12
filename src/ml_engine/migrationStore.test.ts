import { describe, expect, it, afterEach } from 'vitest';
import { configureMigrationStore, resolveMemoryDbName, resetMigrationStoreSingleton } from './migrationStore.js';

describe('migrationStore connection', () => {
  afterEach(() => {
    resetMigrationStoreSingleton();
    delete process.env.HVYMETL_MEMORY_DB;
    delete process.env.MONGODB_DB;
  });

  it('resolveMemoryDbName prefers HVYMETL_MEMORY_DB over import target MONGODB_DB', () => {
    process.env.HVYMETL_MEMORY_DB = 'hvymetl_memory';
    process.env.MONGODB_DB = 'csv_to_atlas';
    expect(resolveMemoryDbName(process.env)).toBe('hvymetl_memory');
  });

  it('configureMigrationStore applies URI and db overrides', () => {
    configureMigrationStore({ mongoUri: 'mongodb://example', dbName: 'custom_memory' });
    expect(resolveMemoryDbName(process.env)).toBe('custom_memory');
  });
});
