import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BSON } from 'mongodb';
import mysql from 'mysql2/promise';
import pg from 'pg';
import type { SqlStructuralModel } from '../types.js';
import { mongoDatabaseName, publicMongoError, sampleLiveMongoCollections } from './liveMongoImport.js';
import { liveSqlEngine, sqlConnectionUri, sqlDatabaseName, type LiveSqlEngine } from './liveSqlImport.js';

/** Rows read per SQL table. shortcut: a capped extract, upgrade when a full table copy is required. */
export const LIVE_PIPELINE_ROW_LIMIT = 1_000;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type LiveDocumentGroup = { name: string; documents: Record<string, unknown>[] };

export function assertLivePipelineAllowed(hosted: boolean): void {
  if (hosted) {
    throw new Error('Live pipeline reads are refused on the hosted studio. Use CSV or mock data there.');
  }
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `${lines.join('\n')}\n`;
}

/** Write one CSV per model table from PostgreSQL or MySQL, or sample MongoDB documents. */
export async function prepareLivePipelineSource(options: {
  uri: string;
  database?: string;
  dialect?: string;
  model: SqlStructuralModel;
  outDir: string;
}): Promise<{ csvDir?: string; groups?: LiveDocumentGroup[] }> {
  const uri = options.uri.trim();
  const sqlEngine = liveSqlEngine(uri);
  try {
    if (sqlEngine) {
      if (options.dialect && options.dialect !== sqlEngine) {
        throw new Error('The live connection does not match this schema dialect.');
      }
      const named = sqlDatabaseName(uri, options.database);
      const csvDir = join(options.outDir, 'live-csv');
      mkdirSync(csvDir, { recursive: true });
      await writeSqlCsv(sqlEngine, sqlConnectionUri(uri, named.database), named.schema, options.model, csvDir);
      return { csvDir };
    }
    if (options.dialect && options.dialect !== 'mongodb-json') {
      throw new Error('A MongoDB connection can only load a MongoDB JSON schema.');
    }
    const database = mongoDatabaseName(uri, options.database);
    const sampled = await sampleLiveMongoCollections(uri, database);
    return {
      groups: sampled.map((collection) => ({
        name: collection.name,
        documents: collection.documents.map(
          (document) => JSON.parse(BSON.EJSON.stringify(document)) as Record<string, unknown>,
        ),
      })),
    };
  } catch (error) {
    throw new Error(publicMongoError(error));
  }
}

async function writeSqlCsv(
  engine: LiveSqlEngine,
  uri: string,
  schema: string,
  model: SqlStructuralModel,
  csvDir: string,
): Promise<void> {
  if (engine === 'postgresql') {
    const client = new pg.Client({ connectionString: uri, connectionTimeoutMillis: 5_000 });
    await client.connect();
    try {
      for (const table of model.tables) {
        const columns = quotedColumns(table.columns.map((column) => column.name));
        const sql = `SELECT ${columns} FROM ${quoteIdent(schema)}.${quoteIdent(table.name)} LIMIT ${LIVE_PIPELINE_ROW_LIMIT}`;
        const result = await client.query(sql);
        writeFileSync(
          join(csvDir, `${table.name}.csv`),
          rowsToCsv(
            table.columns.map((column) => column.name),
            result.rows.map((row: Record<string, unknown>) => table.columns.map((column) => row[column.name])),
          ),
        );
      }
    } finally {
      await client.end();
    }
    return;
  }

  const connection = await mysql.createConnection({ uri, connectTimeout: 5_000 });
  try {
    for (const table of model.tables) {
      const columns = table.columns.map((column) => `\`${assertIdent(column.name)}\``).join(', ');
      const database = assertIdent(schema === 'public' ? uriDatabase(uri) : schema);
      const sql = `SELECT ${columns} FROM \`${database}\`.\`${assertIdent(table.name)}\` LIMIT ${LIVE_PIPELINE_ROW_LIMIT}`;
      const [rows] = await connection.query<mysql.RowDataPacket[]>(sql);
      writeFileSync(
        join(csvDir, `${table.name}.csv`),
        rowsToCsv(
          table.columns.map((column) => column.name),
          rows.map((row) => table.columns.map((column) => row[column.name])),
        ),
      );
    }
  } finally {
    await connection.end();
  }
}

function uriDatabase(uri: string): string {
  return decodeURIComponent(new URL(uri).pathname.replace(/^\//, ''));
}

function quotedColumns(names: string[]): string {
  return names.map(quoteIdent).join(', ');
}

function assertIdent(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Column or table name is not a valid identifier: ${name}`);
  return name;
}

function quoteIdent(name: string): string {
  return `"${assertIdent(name)}"`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
