import { describe, expect, it } from 'vitest';
import { resolveDesignModel } from './resolveDesignModel.js';
import type { SqlStructuralModel } from '../types.js';

const liveModel: SqlStructuralModel = {
  source: 'ddl:postgresql',
  tables: [
    {
      name: 'film',
      columns: [{ name: 'film_id', sqlType: 'integer', bsonType: 'int', nullable: false, isPrimaryKey: true }],
      primaryKey: ['film_id'],
      foreignKeys: [],
      rowCount: 1000,
    },
  ],
  relationships: [],
};

describe('resolveDesignModel', () => {
  it('falls back to introspected model when live-agent DDL is a comment stub', () => {
    const model = resolveDesignModel({
      ddl: '// Live PostgreSQL database dvdrental. Schema read from the catalog.\n',
      dialect: 'postgresql',
      model: liveModel,
    });
    expect(model.tables.map((table) => table.name)).toEqual(['film']);
  });

  it('prefers DDL parse when DDL defines tables', () => {
    const model = resolveDesignModel({
      ddl: 'CREATE TABLE actors (id INT PRIMARY KEY, name TEXT);',
      dialect: 'postgresql',
      model: liveModel,
    });
    expect(model.tables.map((table) => table.name)).toEqual(['actors']);
  });

  it('uses model when DDL is absent', () => {
    const model = resolveDesignModel({ model: liveModel });
    expect(model.tables).toHaveLength(1);
  });
});
