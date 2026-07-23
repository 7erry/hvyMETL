import { describe, expect, it } from 'vitest';
import {
  DIALECTS,
  SUPPORTED_DIALECT_IDS,
  getDialectLabel,
  getDialectParserFamily,
  inferSchemaDialect,
  isLiveSourceDialect,
  isSupportedDialect,
  normalizeDialectId,
  resolveImportDialect,
  sortDialectsByLabel,
} from './dialects.js';

describe('dialects', () => {
  it('registers twenty-two supported dialects including new warehouse and OLTP imports', () => {
    expect(SUPPORTED_DIALECT_IDS).toHaveLength(22);
    expect(SUPPORTED_DIALECT_IDS).toEqual(
      expect.arrayContaining([
        'snowflake',
        'bigquery',
        'redshift',
        'databricks',
        'mariadb',
        'yugabyte',
        'singlestore',
        'sap-hana',
        'teradata',
        'firebird',
      ]),
    );
  });

  it('keeps DIALECTS ids unique and aligned with SUPPORTED_DIALECT_IDS', () => {
    const ids = DIALECTS.map((dialect) => dialect.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([...SUPPORTED_DIALECT_IDS].sort());
  });

  it('sorts DIALECTS alphabetically by display label', () => {
    const labels = DIALECTS.map((dialect) => dialect.label);
    expect(labels).toEqual(sortDialectsByLabel(DIALECTS).map((dialect) => dialect.label));
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
    expect(labels[0]).toBe('Amazon Aurora (MySQL)');
    expect(labels[labels.length - 1]).toBe('YugabyteDB');
  });

  it('normalizes common dialect aliases', () => {
    expect(normalizeDialectId(' Spark-SQL ')).toBe('databricks');
    expect(normalizeDialectId('memsql')).toBe('singlestore');
    expect(normalizeDialectId('hana')).toBe('sap-hana');
    expect(normalizeDialectId('google-bigquery')).toBe('bigquery');
    expect(normalizeDialectId('yugabytedb')).toBe('yugabyte');
  });

  it('validates supported dialect ids', () => {
    expect(isSupportedDialect('snowflake')).toBe(true);
    expect(isSupportedDialect('spark-sql')).toBe(true);
    expect(isSupportedDialect('informix')).toBe(false);
  });

  it('resolveImportDialect accepts supported ids and rejects unknown values', () => {
    expect(resolveImportDialect('bigquery')).toBe('bigquery');
    expect(resolveImportDialect('')).toBe('postgresql');
    expect(() => resolveImportDialect('unknown-db', { required: true })).toThrow(/Unsupported dialect/);
    expect(() => resolveImportDialect('unknown-db')).toThrow(/Unsupported dialect/);
  });

  it('maps dialect labels and parser families', () => {
    expect(getDialectLabel('databricks')).toBe('Databricks SQL / Spark SQL');
    expect(getDialectParserFamily('redshift')).toBe('postgresql');
    expect(getDialectParserFamily('singlestore')).toBe('mysql');
    expect(getDialectParserFamily('sap-hana')).toBe('hana');
  });

  it('infers dialect from ddl: source labels', () => {
    expect(inferSchemaDialect({ source: 'ddl:postgresql' }, '')).toBe('postgresql');
    expect(inferSchemaDialect({ source: 'ddl:snowflake' }, '')).toBe('snowflake');
    expect(inferSchemaDialect({ source: 'ddl:teradata' }, '')).toBe('teradata');
  });

  it('prefers session dialect when set', () => {
    expect(inferSchemaDialect({ source: 'ddl:mysql' }, 'postgresql')).toBe('postgresql');
  });

  it('infers sqlite from uploaded file paths', () => {
    expect(inferSchemaDialect({ source: '/tmp/web-uploads/abc123' }, '')).toBe('sqlite');
    expect(inferSchemaDialect({ source: '/data/app.db' }, '')).toBe('sqlite');
  });

  it('marks only sqlite as a live source dialect', () => {
    expect(isLiveSourceDialect('sqlite')).toBe(true);
    expect(isLiveSourceDialect('postgresql')).toBe(false);
    expect(isLiveSourceDialect('snowflake')).toBe(false);
    expect(isLiveSourceDialect('firebird')).toBe(false);
  });
});
