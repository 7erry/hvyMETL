import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DIALECT_DETECT_FALLBACK_ID,
  DIALECT_DETECT_MIN_CONFIDENCE,
  DIALECT_DETECT_SCAN_LIMIT,
  detectDialect,
} from './detectDialect.js';

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../examples/dialects');

function readExample(name: string): string {
  return readFileSync(join(examplesDir, name), 'utf8');
}

describe('detectDialect', () => {
  it('detects PostgreSQL from SERIAL and JSONB markers', () => {
    const result = detectDialect(readExample('postgresql.sql'));
    expect(result.dialectId).toBe('postgresql');
    expect(result.autoDetected).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(DIALECT_DETECT_MIN_CONFIDENCE);
  });

  it('detects MySQL from AUTO_INCREMENT and ENGINE=InnoDB', () => {
    const result = detectDialect(readExample('mysql.sql'));
    expect(result.dialectId).toBe('mysql');
    expect(result.autoDetected).toBe(true);
  });

  it('detects Snowflake markers', () => {
    const ddl = `
      CREATE TRANSIENT TABLE events (
        id NUMBER(38,0),
        payload VARIANT
      ) CLUSTER BY (id);
    `;
    const result = detectDialect(ddl);
    expect(result.dialectId).toBe('snowflake');
    expect(result.autoDetected).toBe(true);
  });

  it('detects BigQuery STRUCT and project.dataset.table quoting', () => {
    const ddl = `
      CREATE TABLE \`myproj.myds.orders\` (
        tags ARRAY<STRING>,
        meta STRUCT<region STRING, bytes BYTES>
      );
    `;
    const result = detectDialect(ddl);
    expect(result.dialectId).toBe('bigquery');
    expect(result.autoDetected).toBe(true);
  });

  it('detects SQLite AUTOINCREMENT and WITHOUT ROWID', () => {
    const ddl = `
      CREATE TABLE t (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT
      ) WITHOUT ROWID STRICT;
    `;
    const result = detectDialect(ddl);
    expect(result.dialectId).toBe('sqlite');
    expect(result.autoDetected).toBe(true);
  });

  it('detects T-SQL IDENTITY and bracketed names', () => {
    const ddl = `
      CREATE TABLE [dbo].[Customers] (
        id INT IDENTITY(1,1) NOT NULL,
        name NVARCHAR(200) NOT NULL
      );
      GO
    `;
    const result = detectDialect(ddl);
    expect(result.dialectId).toBe('mssql');
    expect(result.autoDetected).toBe(true);
  });

  it('detects JSON Schema documents', () => {
    const result = detectDialect(readExample('json-schema.json'));
    expect(result.dialectId).toBe('json-schema');
    expect(result.format).toBe('json');
    expect(result.autoDetected).toBe(true);
  });

  it('detects DynamoDB CloudFormation YAML', () => {
    const result = detectDialect(readExample('dynamodb.yaml'));
    expect(result.dialectId).toBe('dynamodb');
    expect(result.format).toBe('yaml');
    expect(result.autoDetected).toBe(true);
  });

  it('falls back when input is ambiguous', () => {
    const result = detectDialect('SELECT 1;');
    expect(result.dialectId).toBe(DIALECT_DETECT_FALLBACK_ID);
    expect(result.autoDetected).toBe(false);
  });

  it('only scans the first 5000 characters', () => {
    const padding = 'SELECT 1;\n'.repeat(600);
    const tail = 'CREATE TABLE t (id NUMBER(38,0), payload VARIANT) CLUSTER BY (id);';
    expect(padding.length + tail.length).toBeGreaterThan(DIALECT_DETECT_SCAN_LIMIT + tail.length);
    const result = detectDialect(`${padding}${tail}`);
    expect(result.dialectId).toBe(DIALECT_DETECT_FALLBACK_ID);
  });
});
