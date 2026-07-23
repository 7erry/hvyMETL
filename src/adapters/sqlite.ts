/**
 * SQLite implementation of the SqlSourceAdapter interface.
 *
 * SQLite is the first-class source because it is embedded (no server to run)
 * and powers the bundled example databases. The introspection logic uses
 * SQLite's PRAGMA catalog functions to discover tables, columns, primary
 * keys, and foreign keys, then measures relationship cardinality with
 * GROUP BY counts so the pattern selector can reason about boundedness.
 */

import Database from 'better-sqlite3';
import type {
  ColumnModel,
  ForeignKeyModel,
  RelationshipModel,
  SqlStructuralModel,
  TableModel,
} from '../types.js';
import { BOUNDED_CHILDREN_THRESHOLD } from '../design/embedThresholds.js';
import type { KeyRange, SqlSourceAdapter } from './types.js';

/** Shape of one row returned by PRAGMA table_info. */
type PragmaColumnRow = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
};

/** Shape of one row returned by PRAGMA foreign_key_list. */
type PragmaForeignKeyRow = {
  table: string;
  from: string;
  to: string | null;
};

/**
 * Map a raw SQLite column type to the closest BSON type, so the design
 * engine can emit accurate $jsonSchema validators.
 */
export function sqlTypeToBsonType(sqlType: string): string {
  const normalized = sqlType.toUpperCase();
  if (/(^|\b)(INT64|INT32|INT16|INT8|INTEGER|INT|SMALLINT|BIGINT|TINYINT|BYTEINT|NUMBER)\b/.test(normalized)) return 'long';
  if (/(^|\b)(FLOAT64|FLOAT32|REAL|FLOA|DOUB|NUMERIC|DECIMAL|DOUBLE)\b/.test(normalized)) return 'double';
  if (/(^|\b)(BOOL|BOOLEAN)\b/.test(normalized)) return 'bool';
  if (/(DATE|TIME|TIMESTAMP)/.test(normalized)) return 'date';
  if (/(BLOB|BYTES|BINARY|VARBINARY)/.test(normalized)) return 'binData';
  if (/(STRING|CHAR|CLOB|TEXT|VARCHAR|NVARCHAR|VARIANT|OBJECT|JSON|GEOGRAPHY)/.test(normalized)) return 'string';
  return 'string';
}

/** Open a SQLite database file and wrap it in the adapter interface. */
export function createSqliteAdapter(databasePath: string): SqlSourceAdapter {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });

  /** List all user tables (skipping SQLite's internal bookkeeping tables). */
  function listTableNames(): string[] {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];
    return rows.map((row) => row.name);
  }

  /** Build the full TableModel for one table from PRAGMA catalog data. */
  function introspectTable(tableName: string): TableModel {
    const pragmaColumns = db.prepare(`PRAGMA table_info(${JSON.stringify(tableName)})`).all() as PragmaColumnRow[];
    const columns: ColumnModel[] = pragmaColumns.map((column) => ({
      name: column.name,
      sqlType: column.type,
      bsonType: sqlTypeToBsonType(column.type),
      nullable: column.notnull === 0 && column.pk === 0,
      isPrimaryKey: column.pk > 0,
    }));

    // PRAGMA's "pk" value is the 1-based ordinal of the column inside a
    // composite primary key; sorting by it recovers the declared key order.
    const primaryKey = pragmaColumns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);

    const pragmaForeignKeys = db
      .prepare(`PRAGMA foreign_key_list(${JSON.stringify(tableName)})`)
      .all() as PragmaForeignKeyRow[];
    const foreignKeys: ForeignKeyModel[] = pragmaForeignKeys.map((fk) => ({
      column: fk.from,
      referencesTable: fk.table,
      referencesColumn: fk.to ?? 'id',
    }));

    const countRow = db.prepare(`SELECT COUNT(*) AS count FROM "${tableName}"`).get() as { count: number };

    return { name: tableName, columns, primaryKey, foreignKeys, rowCount: countRow.count };
  }

  /**
   * Measure how many child rows each parent has for one foreign-key edge.
   * The average and maximum drive the embed/reference/subset decision.
   */
  function measureRelationship(childTable: TableModel, fk: ForeignKeyModel): RelationshipModel {
    const statsRow = db
      .prepare(
        `SELECT COALESCE(AVG(childCount), 0) AS avgCount, COALESCE(MAX(childCount), 0) AS maxCount
         FROM (SELECT COUNT(*) AS childCount FROM "${childTable.name}" GROUP BY "${fk.column}")`,
      )
      .get() as { avgCount: number; maxCount: number };

    return {
      parentTable: fk.referencesTable,
      childTable: childTable.name,
      fkColumn: fk.column,
      avgChildrenPerParent: Math.round(statsRow.avgCount * 100) / 100,
      maxChildrenPerParent: statsRow.maxCount,
      isBounded: statsRow.maxCount > 0 && statsRow.maxCount <= BOUNDED_CHILDREN_THRESHOLD,
    };
  }

  return {
    kind: 'sqlite',
    source: databasePath,

    introspect(): SqlStructuralModel {
      const tables = listTableNames().map(introspectTable);
      const relationships = tables.flatMap((table) =>
        table.foreignKeys.map((fk) => measureRelationship(table, fk)),
      );
      return { source: databasePath, tables, relationships };
    },

    dumpDdl(): string {
      const rows = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type DESC, name",
        )
        .all() as { sql: string }[];
      return rows.map((row) => `${row.sql};`).join('\n\n');
    },

    getKeyRange(table: string, column: string): KeyRange | null {
      const row = db
        .prepare(`SELECT MIN("${column}") AS min, MAX("${column}") AS max FROM "${table}"`)
        .get() as { min: number | null; max: number | null };
      if (row.min === null || row.max === null) return null;
      return { min: Number(row.min), max: Number(row.max) };
    },

    *iterate(sql: string, params: unknown[] = []): IterableIterator<Record<string, unknown>> {
      // better-sqlite3's iterate() yields rows lazily straight from the
      // database cursor, which is what keeps memory usage constant.
      for (const row of db.prepare(sql).iterate(...params)) {
        yield row as Record<string, unknown>;
      }
    },

    close(): void {
      db.close();
    },
  };
}
