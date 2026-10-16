import mysql from 'mysql2/promise';
import pg from 'pg';
import {
  modelFromSqlCatalog,
  type LiveSqlEngine,
  type SqlCatalogColumn,
  type SqlCatalogForeignKey,
  type SqlCatalogTableSize,
} from './liveSqlCatalog.js';
import type { SqlStructuralModel } from '../types.js';

export type { LiveSqlEngine };

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function liveSqlEngine(uri: string): LiveSqlEngine | null {
  const trimmed = uri.trim();
  if (trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) return 'postgresql';
  if (trimmed.startsWith('mysql://')) return 'mysql';
  return null;
}

/** Database from the form, or the path of the URI. Schema stays `public` unless the URI sets `schema`. */
export function sqlDatabaseName(uri: string, explicit?: string): { database: string; schema: string } {
  const named = explicit?.trim();
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error('Database URI is not valid.');
  }
  const database = named || decodeURIComponent(url.pathname.replace(/^\//, '').split('?')[0] ?? '');
  if (!database) throw new Error('Database name is required.');
  if (!IDENTIFIER.test(database)) throw new Error('Database name is not a valid identifier.');
  const schema = url.searchParams.get('schema')?.trim() || 'public';
  if (!IDENTIFIER.test(schema)) throw new Error('Schema name is not a valid identifier.');
  return { database, schema };
}

export function sqlConnectionUri(uri: string, database: string): string {
  const url = new URL(uri.trim());
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}

/** Read information_schema. shortcut: row counts are catalog estimates, upgrade when the pipeline counts rows. */
export async function importLiveSqlDatabase(
  uri: string,
  database: string,
  schema = 'public',
): Promise<{ model: SqlStructuralModel; engine: LiveSqlEngine }> {
  const engine = liveSqlEngine(uri);
  if (!engine) throw new Error('Live SQL import needs a postgresql:// or mysql:// URI.');
  const connectionUri = sqlConnectionUri(uri, database);
  const catalog =
    engine === 'postgresql'
      ? await readPostgresCatalog(connectionUri, schema)
      : await readMysqlCatalog(connectionUri, database);
  return { model: modelFromSqlCatalog(engine, catalog.columns, catalog.foreignKeys, catalog.sizes), engine };
}

async function readPostgresCatalog(
  uri: string,
  schema: string,
): Promise<{ columns: SqlCatalogColumn[]; foreignKeys: SqlCatalogForeignKey[]; sizes: SqlCatalogTableSize[] }> {
  const client = new pg.Client({ connectionString: uri, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    await client.query('SET statement_timeout = 10000');
    const columns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      ordinal_position: number;
    }>(
      `SELECT table_name, column_name, data_type, is_nullable, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = $1
       ORDER BY table_name, ordinal_position`,
      [schema],
    );
    const keys = await client.query<{ table_name: string; column_name: string; ordinal_position: number }>(
      `SELECT kcu.table_name, kcu.column_name, kcu.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1`,
      [schema],
    );
    const foreignKeys = await client.query<{
      table_name: string;
      column_name: string;
      foreign_table: string;
      foreign_column: string;
    }>(
      `SELECT kcu.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1`,
      [schema],
    );
    const sizes = await client.query<{ table_name: string; row_count: string }>(
      `SELECT c.relname AS table_name, GREATEST(c.reltuples, 0)::bigint AS row_count
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r'`,
      [schema],
    );
    const pk = new Map(keys.rows.map((row) => [`${row.table_name}.${row.column_name}`, Number(row.ordinal_position)]));
    return {
      columns: columns.rows.map((row) => ({
        table: row.table_name,
        name: row.column_name,
        sqlType: row.data_type,
        nullable: row.is_nullable === 'YES',
        ordinal: Number(row.ordinal_position),
        isPrimaryKey: pk.has(`${row.table_name}.${row.column_name}`),
        pkOrdinal: pk.get(`${row.table_name}.${row.column_name}`) ?? 0,
      })),
      foreignKeys: foreignKeys.rows.map((row) => ({
        table: row.table_name,
        column: row.column_name,
        referencesTable: row.foreign_table,
        referencesColumn: row.foreign_column,
      })),
      sizes: sizes.rows.map((row) => ({ table: row.table_name, rowCount: Number(row.row_count) })),
    };
  } finally {
    await client.end();
  }
}

async function readMysqlCatalog(
  uri: string,
  database: string,
): Promise<{ columns: SqlCatalogColumn[]; foreignKeys: SqlCatalogForeignKey[]; sizes: SqlCatalogTableSize[] }> {
  const connection = await mysql.createConnection({ uri, connectTimeout: 5_000 });
  try {
    const [columns] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, ORDINAL_POSITION
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database],
    );
    const [keys] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      [database],
    );
    const [foreignKeys] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [database],
    );
    const [sizes] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, TABLE_ROWS
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [database],
    );
    const pk = new Map(
      keys.map((row) => [`${String(row.TABLE_NAME)}.${String(row.COLUMN_NAME)}`, Number(row.ORDINAL_POSITION)]),
    );
    return {
      columns: columns.map((row) => ({
        table: String(row.TABLE_NAME),
        name: String(row.COLUMN_NAME),
        sqlType: String(row.COLUMN_TYPE),
        nullable: String(row.IS_NULLABLE) === 'YES',
        ordinal: Number(row.ORDINAL_POSITION),
        isPrimaryKey: pk.has(`${String(row.TABLE_NAME)}.${String(row.COLUMN_NAME)}`),
        pkOrdinal: pk.get(`${String(row.TABLE_NAME)}.${String(row.COLUMN_NAME)}`) ?? 0,
      })),
      foreignKeys: foreignKeys.map((row) => ({
        table: String(row.TABLE_NAME),
        column: String(row.COLUMN_NAME),
        referencesTable: String(row.REFERENCED_TABLE_NAME),
        referencesColumn: String(row.REFERENCED_COLUMN_NAME),
      })),
      sizes: sizes.map((row) => ({ table: String(row.TABLE_NAME), rowCount: Number(row.TABLE_ROWS ?? 0) })),
    };
  } finally {
    await connection.end();
  }
}
