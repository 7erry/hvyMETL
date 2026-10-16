import { describe, expect, it } from 'vitest';
import { modelFromSqlCatalog } from './liveSqlCatalog.js';
import { liveSqlEngine, sqlDatabaseName } from './liveSqlImport.js';

describe('live SQL catalog', () => {
  it('builds tables, primary keys, and foreign keys without scanning rows', () => {
    const model = modelFromSqlCatalog(
      'postgresql',
      [
        { table: 'posts', name: 'id', sqlType: 'integer', nullable: false, ordinal: 1, isPrimaryKey: true, pkOrdinal: 1 },
        { table: 'posts', name: 'user_id', sqlType: 'integer', nullable: true, ordinal: 2, isPrimaryKey: false, pkOrdinal: 0 },
        { table: 'users', name: 'email', sqlType: 'text', nullable: false, ordinal: 2, isPrimaryKey: false, pkOrdinal: 0 },
        { table: 'users', name: 'id', sqlType: 'integer', nullable: false, ordinal: 1, isPrimaryKey: true, pkOrdinal: 1 },
      ],
      [{ table: 'posts', column: 'user_id', referencesTable: 'users', referencesColumn: 'id' }],
      [{ table: 'users', rowCount: 12 }],
    );
    expect(model.source).toBe('ddl:postgresql');
    expect(model.tables.map((table) => table.name)).toEqual(['posts', 'users']);
    expect(model.tables[1]?.primaryKey).toEqual(['id']);
    expect(model.tables[1]?.rowCount).toBe(12);
    expect(model.tables[0]?.rowCount).toBe(0);
    expect(model.relationships).toEqual([
      {
        parentTable: 'users',
        childTable: 'posts',
        fkColumn: 'user_id',
        avgChildrenPerParent: 0,
        maxChildrenPerParent: 0,
        isBounded: false,
      },
    ]);
  });

  it('rejects an empty catalog', () => {
    expect(() => modelFromSqlCatalog('mysql', [], [], [])).toThrow(/no tables/);
  });

  it('reads the engine, database, and schema from the URI', () => {
    expect(liveSqlEngine('postgresql://localhost/shop')).toBe('postgresql');
    expect(liveSqlEngine('mysql://localhost/shop')).toBe('mysql');
    expect(liveSqlEngine('mongodb://localhost/shop')).toBeNull();
    expect(sqlDatabaseName('postgresql://localhost/shop?schema=sales')).toEqual({ database: 'shop', schema: 'sales' });
    expect(sqlDatabaseName('mysql://localhost/shop', 'other')).toEqual({ database: 'other', schema: 'public' });
    expect(() => sqlDatabaseName('postgresql://localhost')).toThrow(/Database name is required/);
  });
});
