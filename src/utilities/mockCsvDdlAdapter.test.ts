import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isCloudFormationImport,
  prepareMockCsvDdl,
  structuralModelToMockDdl,
} from './mockCsvDdlAdapter.js';
import { parseSchemaImport } from './schemaImport.js';
import { generateMockCsvFromDdl, verifyMockCsvGenerator } from './mockCsvFromDdl.js';

const ROOT = join(import.meta.dirname, '..', '..');
const DYNAMODB_EXAMPLE = readFileSync(join(ROOT, 'examples', 'dialects', 'dynamodb.yaml'), 'utf8');

describe('mockCsvDdlAdapter', () => {
  it('detects CloudFormation templates', () => {
    expect(isCloudFormationImport(DYNAMODB_EXAMPLE)).toBe(true);
    expect(isCloudFormationImport('CREATE TABLE users (id INTEGER PRIMARY KEY);')).toBe(false);
  });

  it('converts DynamoDB CloudFormation into CREATE TABLE DDL', () => {
    const ddl = prepareMockCsvDdl(DYNAMODB_EXAMPLE, 'dynamodb');
    expect(ddl).toContain('CREATE TABLE Products');
    expect(ddl).toContain('CREATE TABLE Reviews');
    expect(ddl).toContain('ProductId VARCHAR(255) PRIMARY KEY');
    expect(ddl).toContain('ReviewId VARCHAR(255) PRIMARY KEY');
  });

  it('auto-detects CloudFormation without an explicit dialect', () => {
    const ddl = prepareMockCsvDdl(DYNAMODB_EXAMPLE);
    expect(ddl).toContain('CREATE TABLE Products');
  });

  it('passes SQL DDL through unchanged', () => {
    const sql = 'CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL);';
    expect(prepareMockCsvDdl(sql, 'postgresql')).toBe(sql);
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
      const result = generateMockCsvFromDdl(DYNAMODB_EXAMPLE, outDir, ROOT, { dialect: 'dynamodb' });
      expect(result.tables.sort()).toEqual(['Products', 'Reviews']);
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
