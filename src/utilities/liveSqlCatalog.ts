import type { SqlStructuralModel } from '../types.js';
import { sqlTypeToBsonType } from './sqlTypeToBsonType.js';

export type LiveSqlEngine = 'postgresql' | 'mysql' | 'mssql' | 'oracle';

export type SqlCatalogColumn = {
  table: string;
  name: string;
  sqlType: string;
  nullable: boolean;
  ordinal: number;
  isPrimaryKey: boolean;
  pkOrdinal: number;
};

export type SqlCatalogForeignKey = {
  table: string;
  column: string;
  referencesTable: string;
  referencesColumn: string;
};

export type SqlCatalogTableSize = {
  table: string;
  rowCount: number;
};

export function liveSqlEngineLabel(engine: LiveSqlEngine): string {
  switch (engine) {
    case 'postgresql':
      return 'PostgreSQL';
    case 'mysql':
      return 'MySQL';
    case 'mssql':
      return 'Microsoft SQL Server';
    case 'oracle':
      return 'Oracle';
    default: {
      const unexpected: never = engine;
      return unexpected;
    }
  }
}

/** Build the same structural model a DDL paste would, from catalog rows. */
export function modelFromSqlCatalog(
  engine: LiveSqlEngine,
  columns: SqlCatalogColumn[],
  foreignKeys: SqlCatalogForeignKey[],
  sizes: SqlCatalogTableSize[],
): SqlStructuralModel {
  const sizeByTable = new Map(sizes.map((size) => [size.table, size.rowCount]));
  const keysByTable = new Map<string, SqlCatalogForeignKey[]>();
  for (const key of foreignKeys) {
    const list = keysByTable.get(key.table) ?? [];
    list.push(key);
    keysByTable.set(key.table, list);
  }

  const byTable = new Map<string, SqlCatalogColumn[]>();
  for (const column of columns) {
    const list = byTable.get(column.table) ?? [];
    list.push(column);
    byTable.set(column.table, list);
  }

  const tables = [...byTable.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, tableColumns]) => {
      const ordered = [...tableColumns].sort((left, right) => left.ordinal - right.ordinal);
      const primaryKey = ordered
        .filter((column) => column.isPrimaryKey)
        .sort((left, right) => left.pkOrdinal - right.pkOrdinal)
        .map((column) => column.name);
      return {
        name,
        columns: ordered.map((column) => ({
          name: column.name,
          sqlType: column.sqlType,
          bsonType: sqlTypeToBsonType(column.sqlType),
          nullable: column.nullable && !column.isPrimaryKey,
          isPrimaryKey: column.isPrimaryKey,
        })),
        primaryKey: primaryKey.length > 0 ? primaryKey : ordered[0] ? [ordered[0].name] : [],
        foreignKeys: (keysByTable.get(name) ?? []).map((key) => ({
          column: key.column,
          referencesTable: key.referencesTable,
          referencesColumn: key.referencesColumn,
        })),
        rowCount: sizeByTable.get(name) ?? 0,
      };
    });

  if (tables.length === 0) {
    throw new Error(`${liveSqlEngineLabel(engine)} database has no tables to import.`);
  }

  return {
    source: `ddl:${engine}`,
    tables,
    relationships: tables.flatMap((child) =>
      child.foreignKeys.map((fk) => ({
        parentTable: fk.referencesTable,
        childTable: child.name,
        fkColumn: fk.column,
        avgChildrenPerParent: 0,
        maxChildrenPerParent: 0,
        isBounded: false,
      })),
    ),
  };
}
