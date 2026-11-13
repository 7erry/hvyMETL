import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SqlStructuralModel } from '../types.js';
import {
  isCloudFormationImport,
  prepareMockCsvDdl,
  structuralModelToMockDdl,
} from './mockCsvDdlAdapter.js';
import { parseSchemaImport } from './schemaImport.js';
import { generateMockCsvFromDdl, verifyMockCsvGenerator } from './mockCsvFromDdl.js';

const ROOT = join(import.meta.dirname, '..', '..');
const DYNAMODB_EXAMPLE = readFileSync(join(ROOT, 'examples', 'dialects', 'dynamodb.yaml'), 'utf8');

const livePostgresModel: SqlStructuralModel = {
  source: 'ddl:postgresql',
  tables: [
    {
      name: 'film',
      columns: [
        { name: 'film_id', sqlType: 'integer', bsonType: 'int', nullable: false, isPrimaryKey: true },
        { name: 'title', sqlType: 'varchar(255)', bsonType: 'string', nullable: false, isPrimaryKey: false },
      ],
      primaryKey: ['film_id'],
      foreignKeys: [],
      rowCount: 1000,
    },
  ],
  relationships: [],
};

const LIVE_PG_STUB = '// Live PostgreSQL database dvdrental. Schema read from the catalog.\n';

describe('mockCsvDdlAdapter', () => {
  it('detects CloudFormation templates', () => {
    expect(isCloudFormationImport(DYNAMODB_EXAMPLE)).toBe(true);
    expect(isCloudFormationImport('CREATE TABLE users (id INTEGER PRIMARY KEY);')).toBe(false);
  });

  it('converts DynamoDB CloudFormation into CREATE TABLE DDL', () => {
    const model = parseSchemaImport(DYNAMODB_EXAMPLE, 'dynamodb');
    const ddl = prepareMockCsvDdl(DYNAMODB_EXAMPLE, 'dynamodb');
    for (const table of model.tables) {
      expect(ddl).toContain(`CREATE TABLE ${table.name}`);
    }
    expect(ddl).toContain('PRIMARY KEY');
  });

  it('auto-detects CloudFormation without an explicit dialect', () => {
    const model = parseSchemaImport(DYNAMODB_EXAMPLE, 'dynamodb');
    const ddl = prepareMockCsvDdl(DYNAMODB_EXAMPLE);
    expect(ddl).toContain(`CREATE TABLE ${model.tables[0]?.name}`);
  });

  it('passes SQL DDL through unchanged', () => {
    const sql = 'CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL);';
    expect(prepareMockCsvDdl(sql, 'postgresql')).toBe(sql);
  });

  it('synthesizes CREATE TABLE from model when DDL is a live-agent stub', () => {
    const ddl = prepareMockCsvDdl(LIVE_PG_STUB, 'postgresql', livePostgresModel);
    expect(ddl).toMatch(/CREATE TABLE film/i);
    expect(ddl).toMatch(/film_id/i);
    expect(ddl).toMatch(/title/i);
  });

  it('prefers real CREATE TABLE DDL over the model', () => {
    const sql = 'CREATE TABLE actors (id INT PRIMARY KEY, name TEXT);';
    expect(prepareMockCsvDdl(sql, 'postgresql', livePostgresModel)).toBe(sql);
  });

  it('renders hyphenated DynamoDB table names with quoted identifiers', () => {
    const model = parseSchemaImport(
      readFileSync(join(ROOT, 'examples', 'dynamodb', 'orders-table.yaml'), 'utf8'),
      'dynamodb',
    );
    const ddl = structuralModelToMockDdl(model);
    expect(ddl).toContain('CREATE TABLE "Production-Orders"');
  });
});

describe('generateMockCsvFromDdl dynamodb', () => {
  it('generates CSV files from the bundled DynamoDB dialect example', () => {
    const status = verifyMockCsvGenerator(ROOT);
    if (!status.ok) {
      expect.fail(`expected mock generator ready: ${status.message}`);
    }

    const outDir = mkdtempSync(join(tmpdir(), 'hvymetl-mock-csv-dynamodb-'));
    try {
      const model = parseSchemaImport(DYNAMODB_EXAMPLE, 'dynamodb');
      const result = generateMockCsvFromDdl(DYNAMODB_EXAMPLE, outDir, ROOT, { dialect: 'dynamodb' });
      expect(result.tables.sort()).toEqual(model.tables.map((table) => table.name).sort());
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe('generateMockCsvFromDdl live-agent stub', () => {
  it('generates CSV from introspected model when DDL is a comment stub', () => {
    const status = verifyMockCsvGenerator(ROOT);
    if (!status.ok) {
      expect.fail(`expected mock generator ready: ${status.message}`);
    }

    const outDir = mkdtempSync(join(tmpdir(), 'hvymetl-mock-csv-live-stub-'));
    try {
      const result = generateMockCsvFromDdl(LIVE_PG_STUB, outDir, ROOT, {
        dialect: 'postgresql',
        model: livePostgresModel,
        baseRowsPerTable: 5,
        minRows: 5,
        maxRows: 5,
      });
      expect(result.tables).toEqual(['film']);
      const header = readFileSync(join(outDir, 'film.csv'), 'utf8').split('\n')[0];
      expect(header).toContain('film_id');
      expect(header).toContain('title');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe('generateMockCsvFromDdl composite keys', () => {
  it('keeps checksum_type_id columns that start with "check"', () => {
    const status = verifyMockCsvGenerator(ROOT);
    if (!status.ok) {
      expect.fail(`expected mock generator ready: ${status.message}`);
    }

    const ddl = `
CREATE TABLE refdata_checksum_type (id UUID PRIMARY KEY, code VARCHAR(255));
CREATE TABLE container (id UUID PRIMARY KEY, file_size BIGINT);
CREATE TABLE checksum (
    checksum_type_id UUID REFERENCES refdata_checksum_type(id),
    container_id UUID REFERENCES container(id),
    value VARCHAR(255),
    PRIMARY KEY (container_id, checksum_type_id)
);
`;

    const outDir = mkdtempSync(join(tmpdir(), 'hvymetl-mock-csv-checksum-'));
    try {
      const result = generateMockCsvFromDdl(ddl, outDir, ROOT);
      expect(result.tables).toContain('checksum');

      const header = readFileSync(join(outDir, 'checksum.csv'), 'utf8').split('\n')[0];
      expect(header).toContain('checksum_type_id');
      expect(header).toContain('container_id');
      expect(header).toContain('value');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
