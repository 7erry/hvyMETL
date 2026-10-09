import { describe, expect, it, afterEach } from 'vitest';
import { resolveMemoryDbName, resetMigrationStoreSingleton, withMigrationStore } from './migrationStore.js';

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

  it('keeps concurrent migration store contexts on their own database', async () => {
    const seen: string[] = [];
    await Promise.all([
      withMigrationStore({ mongoUri: 'mongodb://a', dbName: 'db_a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        seen.push(resolveMemoryDbName(process.env));
      }),
      withMigrationStore({ mongoUri: 'mongodb://b', dbName: 'db_b' }, async () => {
        seen.push(resolveMemoryDbName(process.env));
      }),
    ]);
    expect(seen.sort()).toEqual(['db_a', 'db_b']);
  });
});
