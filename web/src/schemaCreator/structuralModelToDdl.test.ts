import { describe, expect, it } from 'vitest';
import type { SqlStructuralModel } from '../types';
import { structuralModelToDdl } from './structuralModelToDdl';

describe('structuralModelToDdl', () => {
  it('renders CREATE TABLE with PK and FK REFERENCES', () => {
    const model: SqlStructuralModel = {
      source: 'schema-creator',
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', sqlType: 'INT', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'email', sqlType: 'VARCHAR(255)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
          primaryKey: ['id'],
          foreignKeys: [],
          rowCount: 0,
        },
        {
          name: 'posts',
          columns: [
            { name: 'id', sqlType: 'INT', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'user_id', sqlType: 'INT', bsonType: 'long', nullable: false, isPrimaryKey: false },
          ],
          primaryKey: ['id'],
          foreignKeys: [{ column: 'user_id', referencesTable: 'users', referencesColumn: 'id' }],
          rowCount: 0,
        },
      ],
      relationships: [],
    };

    const ddl = structuralModelToDdl(model);
    expect(ddl).toContain('CREATE TABLE users');
    expect(ddl).toContain('id INT PRIMARY KEY');
    expect(ddl).toContain('CREATE TABLE posts');
    expect(ddl).toContain('user_id INT NOT NULL REFERENCES users(id)');
  });

  it('rejects empty models', () => {
    expect(() => structuralModelToDdl({ source: 'x', tables: [], relationships: [] })).toThrow(/at least one table/i);
  });
});
