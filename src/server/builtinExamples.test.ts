import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  listBuiltinExamples,
  readBuiltinExample,
  resolveBuiltinExamplePath,
  resolveBuiltinExamplesDir,
} from './builtinExamples.js';

describe('resolveBuiltinExamplesDir', () => {
  it('prefers HVYMETL_EXAMPLES_DIR when set', () => {
    const location = resolveBuiltinExamplesDir({
      env: { HVYMETL_EXAMPLES_DIR: '/custom/examples' },
      homeDir: '/home/test',
    });
    expect(location.path).toBe('/custom/examples');
    expect(location.source).toBe('env');
  });

  it('falls back to repo examples when home copy is missing', () => {
    const location = resolveBuiltinExamplesDir({
      env: {},
      homeDir: join(tmpdir(), 'hvymetl-no-home-examples'),
      repoRoot: join(import.meta.dirname, '../..'),
    });
    expect(location.source).toBe('repo');
    expect(location.path).toContain('examples');
  });
});

describe('listBuiltinExamples', () => {
  it('lists seeded domains and oracle DDL files from a temp tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'hvymetl-examples-'));
    mkdirSync(join(root, 'catalog'));
    writeFileSync(join(root, 'catalog', 'catalog.sql'), '-- Catalog demo\nCREATE TABLE brands (id INTEGER PRIMARY KEY);');
    mkdirSync(join(root, 'oracle'));
    writeFileSync(join(root, 'oracle', 'oracle-hr.ddl'), '-- HR schema\nCREATE TABLE employees (id NUMBER PRIMARY KEY);');

    const examples = listBuiltinExamples(root);
    expect(examples.map((example) => example.id).sort()).toEqual(['catalog', 'oracle/oracle-hr.ddl']);
    expect(examples.find((example) => example.id === 'catalog')?.suggestedProfileId).toBe('catalog');
    expect(examples.find((example) => example.id === 'oracle/oracle-hr.ddl')?.dialect).toBe('oracle');
  });
});

describe('readBuiltinExample', () => {
  it('rejects unknown ids and path traversal', () => {
    const root = mkdtempSync(join(tmpdir(), 'hvymetl-examples-read-'));
    mkdirSync(join(root, 'iot'));
    writeFileSync(join(root, 'iot', 'iot.sql'), 'CREATE TABLE devices (id INTEGER PRIMARY KEY);');

    expect(() => resolveBuiltinExamplePath(root, '../secrets')).toThrow(/Invalid example id/);
    expect(() => readBuiltinExample(root, 'missing')).toThrow(/Unknown built-in example/);

    const loaded = readBuiltinExample(root, 'iot');
    expect(loaded.dialect).toBe('sqlite');
    expect(loaded.ddl).toContain('CREATE TABLE devices');
  });
});

describe('repo bundled examples', () => {
  it('includes all seven seeded SQLite domains from the repository', () => {
    const { path } = resolveBuiltinExamplesDir();
    const ids = listBuiltinExamples(path)
      .filter((example) => example.dialect === 'sqlite')
      .map((example) => example.id)
      .sort();
    expect(ids).toEqual([
      'analytics',
      'catalog',
      'cms',
      'iot',
      'mobile',
      'personalization',
      'singleview',
    ]);
  });

  it('loads catalog DDL from the repository examples folder', () => {
    const { path } = resolveBuiltinExamplesDir();
    const { ddl, summary } = readBuiltinExample(path, 'catalog');
    expect(summary.suggestedProfileId).toBe('catalog');
    expect(ddl).toContain('CREATE TABLE products');
  });

  it('loads ledger as PostgreSQL with ledger profile suggestion', () => {
    const { path } = resolveBuiltinExamplesDir();
    const example = listBuiltinExamples(path).find((item) => item.id === 'ledger');
    expect(example?.dialect).toBe('postgresql');
    expect(example?.suggestedProfileId).toBe('ledger');

    const { ddl, summary } = readBuiltinExample(path, 'ledger');
    expect(summary.label).toBe('Financial Ledger (Enterprise)');
    expect(ddl).toContain('CREATE TABLE journal_entries');
  });
});
